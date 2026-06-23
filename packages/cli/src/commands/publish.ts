import { type SkillValidationDeps, validateSkillPayload } from '@usetheo/skillregistry';

import { type ParsedCli } from '../args.js';
import { packageSkill } from '../zip.js';

export interface PublishDeps {
  readonly validation: SkillValidationDeps;
  readonly out: (line: string) => void;
  readonly fetch: typeof globalThis.fetch;
  readonly package?: (path: string) => Promise<Buffer>;
}

/**
 * `theoskill publish <path> --registry <url> --skill-id <id>` — validate locally
 * (same checks as the server), then package and publish via the registry's
 * Create/Update API: POST a new skill, or PATCH an existing one (decided by GET).
 * Returns the process exit code (0 ok, 1 invalid/failed, 2 usage/IO error).
 */
export async function runPublish(args: ParsedCli, deps: PublishDeps): Promise<number> {
  if (args.path === undefined || args.registry === undefined || args.skillId === undefined) {
    deps.out('error: publish requires <path> --registry <url> --skill-id <id>');
    return 2;
  }
  const base = args.registry.replace(/\/+$/, '');

  let buffer: Buffer;
  try {
    buffer = await (deps.package ?? packageSkill)(args.path);
  } catch (err) {
    deps.out(`error: could not read ${args.path}: ${err instanceof Error ? err.message : String(err)}`);
    return 2;
  }

  // Validate locally BEFORE touching the network (the CLI never uploads invalid skills).
  const validation = await validateSkillPayload(buffer, deps.validation);
  if (!validation.ok) {
    deps.out(`invalid: ${args.path}`);
    deps.out(`  - [${validation.code}] ${validation.message}`);
    for (const d of validation.details ?? []) {
      deps.out(`      · ${d}`);
    }
    return 1;
  }

  const zippedFilesystem = buffer.toString('base64');
  try {
    const exists = await skillExists(deps.fetch, base, args.skillId);
    const res = exists
      ? await deps.fetch(`${base}/v1/skills/${args.skillId}?updateMask=zippedFilesystem`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ zippedFilesystem }),
        })
      : await deps.fetch(`${base}/v1/skills`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ skill_id: args.skillId, zippedFilesystem }),
        });

    if (res.status !== 202) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      deps.out(`error: registry rejected the skill (HTTP ${res.status}${body.error !== undefined ? `: ${body.error}` : ''})`);
      return 1;
    }
    const { operation_id } = (await res.json()) as { operation_id: string };
    deps.out(`published: ${args.skillId} (${exists ? 'updated' : 'created'}) — operation ${operation_id}`);
    return 0;
  } catch (err) {
    deps.out(`error: could not reach the registry at ${base}: ${err instanceof Error ? err.message : String(err)}`);
    return 2;
  }
}

async function skillExists(doFetch: typeof globalThis.fetch, base: string, skillId: string): Promise<boolean> {
  const res = await doFetch(`${base}/v1/skills/${skillId}`, { method: 'GET' });
  return res.status === 200;
}
