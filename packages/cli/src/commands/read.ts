import { type ParsedCli } from '../args.js';

export interface ReadDeps {
  readonly out: (line: string) => void;
  readonly fetch: typeof globalThis.fetch;
  readonly registry: string;
  readonly auth?: string;
}

/** Resolve the HTTP route for a read command, or a usage error. */
function routeFor(args: ParsedCli): string | { readonly error: string } {
  switch (args.command) {
    case 'list':
      return '/v1/skills';
    case 'get':
      return args.path !== undefined ? `/v1/skills/${args.path}` : { error: 'usage: theoskill get <skill-id>' };
    case 'status':
      return args.path !== undefined ? `/v1/operations/${args.path}` : { error: 'usage: theoskill status <operation-id>' };
    case 'revisions':
      return args.path !== undefined ? `/v1/skills/${args.path}/revisions` : { error: 'usage: theoskill revisions <skill-id>' };
    default:
      return { error: `not a read command: ${args.command}` };
  }
}

/** Run a read command (status/get/list/revisions) against the registry HTTP API. */
export async function runRead(args: ParsedCli, deps: ReadDeps): Promise<number> {
  const route = routeFor(args);
  if (typeof route !== 'string') {
    deps.out(route.error);
    return 2;
  }
  const headers: Record<string, string> = {};
  if (deps.auth !== undefined) {
    headers['authorization'] = `Bearer ${deps.auth}`;
  }
  let res: Response;
  try {
    res = await deps.fetch(`${deps.registry}${route}`, { headers });
  } catch {
    deps.out('could not reach the registry');
    return 2;
  }
  const text = await res.text();
  if (res.status < 200 || res.status >= 300) {
    deps.out(`registry error (HTTP ${res.status}): ${text}`);
    return 1;
  }
  deps.out(text);
  return 0;
}
