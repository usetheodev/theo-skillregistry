import { createId } from '@paralleldrive/cuid2';
import {
  InvalidSkillIdError,
  parseFrontmatter,
  parseSkillId,
  type PayloadValidator,
  PayloadValidationError,
  type SecretScanner,
  SkillFrontmatterError,
  type ValidatedPayload,
} from '@usetheo/skillregistry';
import { type Context, type Hono } from 'hono';
import type PgBoss from 'pg-boss';

import { type Logger } from '../logger.js';
import { JOB_NAMES, SEND_OPTIONS } from '../queue/queue.js';
import { type OperationsStore } from '../store/operations-store.js';
import { type RevisionsStore } from '../store/revisions-store.js';
import { type SkillsStore } from '../store/skills-store.js';

const UPDATE_MASK_FIELDS = new Set(['displayName', 'description', 'zippedFilesystem']);

export interface SkillsRoutesDeps {
  readonly skillsStore: SkillsStore;
  readonly revisionsStore: RevisionsStore;
  readonly operationsStore: OperationsStore;
  readonly queue: PgBoss;
  readonly payloadValidator: PayloadValidator;
  readonly secretScanner: SecretScanner;
  readonly logger: Logger;
  readonly reservationHours: number;
}

interface IngestResult {
  readonly buffer: Buffer;
  readonly validated: ValidatedPayload;
  readonly name: string;
  readonly description: string;
  readonly frontmatter: Record<string, unknown>;
}

/** A typed boundary error → HTTP 400/409. */
class BoundaryError extends Error {
  constructor(
    readonly status: 400 | 409,
    readonly code: string,
  ) {
    super(code);
  }
}

function decodeBase64Zip(b64: unknown): Buffer {
  if (typeof b64 !== 'string' || b64.length === 0) {
    throw new BoundaryError(400, 'invalid_zip');
  }
  return Buffer.from(b64, 'base64');
}

/** Validate a zip payload at the boundary: zip-safety → frontmatter → secret scan. */
async function ingestPayload(deps: SkillsRoutesDeps, b64: unknown): Promise<IngestResult> {
  const buffer = decodeBase64Zip(b64);
  let validated: ValidatedPayload;
  try {
    validated = await deps.payloadValidator.validate(buffer);
  } catch (err) {
    if (err instanceof PayloadValidationError) {
      throw new BoundaryError(400, err.code);
    }
    throw err;
  }

  let name: string;
  let description: string;
  let frontmatter: Record<string, unknown>;
  try {
    const fm = parseFrontmatter(validated.skillMd);
    name = fm.name;
    description = fm.description;
    frontmatter = { ...fm.fields };
  } catch (err) {
    if (err instanceof SkillFrontmatterError) {
      throw new BoundaryError(400, err.code);
    }
    throw err;
  }

  const findings = await deps.secretScanner.scan(validated.files);
  if (findings.length > 0) {
    deps.logger.error(
      { secret_findings: findings.map((f) => ({ file: f.file, type: f.type })) },
      'payload rejected: secret detected',
    );
    throw new BoundaryError(400, 'secret_detected');
  }

  return { buffer, validated, name, description, frontmatter };
}

function fail(c: Context, err: unknown): Response {
  if (err instanceof BoundaryError) {
    return c.json({ error: err.code }, err.status);
  }
  if (err instanceof InvalidSkillIdError) {
    return c.json({ error: 'invalid_skill_id', message: err.message }, 400);
  }
  throw err;
}

export function registerSkillsRoutes(app: Hono, deps: SkillsRoutesDeps): void {
  // POST /v1/skills — validate payload at the boundary, enqueue, 202.
  app.post('/v1/skills', async (c) => {
    let skillId: string;
    let ingest: IngestResult;
    try {
      const body = (await c.req.json().catch(() => null)) as { skill_id?: unknown; zippedFilesystem?: unknown } | null;
      if (body === null) {
        return c.json({ error: 'invalid_input' }, 400);
      }
      skillId = parseSkillId(typeof body.skill_id === 'string' ? body.skill_id : '');
      if (await deps.skillsStore.isReserved(skillId)) {
        return c.json({ error: 'reserved' }, 409);
      }
      if ((await deps.skillsStore.getView(skillId)) !== undefined) {
        return c.json({ error: 'already_exists' }, 409);
      }
      ingest = await ingestPayload(deps, body.zippedFilesystem);
    } catch (err) {
      return fail(c, err);
    }

    const operationId = `op_${createId()}`;
    await deps.operationsStore.create({ operationId, skillId, type: JOB_NAMES.CREATE_SKILL });
    try {
      await deps.queue.send(
        JOB_NAMES.CREATE_SKILL,
        {
          operation_id: operationId,
          skill_id: skillId,
          name: ingest.name,
          description: ingest.description,
          content_hash: ingest.validated.contentHash,
          payload_b64: ingest.buffer.toString('base64'),
          frontmatter: ingest.frontmatter,
        },
        SEND_OPTIONS,
      );
    } catch (err) {
      await deps.operationsStore.updateState(operationId, 'failed', 'failed to enqueue create_skill job');
      throw err;
    }
    deps.logger.info({ operation_id: operationId, skill_id: skillId }, 'create_skill enqueued');
    return c.json({ operation_id: operationId, skill_id: skillId }, 202);
  });

  // GET /v1/skills — keyset-paginated list of live skills.
  app.get('/v1/skills', async (c) => {
    const rawSize = Number(c.req.query('page_size') ?? '50');
    const pageSize = Number.isFinite(rawSize) ? Math.min(Math.max(Math.trunc(rawSize), 1), 200) : 50;
    const pageToken = c.req.query('page_token') ?? null;
    const page = await deps.skillsStore.listPaginated(pageSize, pageToken);
    return c.json({ skills: page.skills, next_page_token: page.nextPageToken }, 200);
  });

  // GET /v1/skills/:id
  app.get('/v1/skills/:id', async (c) => {
    const skill = await deps.skillsStore.getView(c.req.param('id'));
    if (skill === undefined) {
      return c.json({ error: 'not_found' }, 404);
    }
    return c.json(skill, 200);
  });

  // PATCH /v1/skills/:id — updateMask-driven; LRO when a payload is present.
  app.patch('/v1/skills/:id', async (c) => {
    const skillId = c.req.param('id');
    if ((await deps.skillsStore.getView(skillId)) === undefined) {
      return c.json({ error: 'not_found' }, 404);
    }
    const mask = (c.req.query('updateMask') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (mask.length === 0 || mask.some((f) => !UPDATE_MASK_FIELDS.has(f))) {
      return c.json({ error: 'invalid_update_mask' }, 400);
    }

    const body = (await c.req.json().catch(() => null)) as
      | { displayName?: unknown; description?: unknown; zippedFilesystem?: unknown }
      | null;
    if (body === null) {
      return c.json({ error: 'invalid_input' }, 400);
    }

    let ingest: IngestResult | undefined;
    if (mask.includes('zippedFilesystem')) {
      try {
        ingest = await ingestPayload(deps, body.zippedFilesystem);
      } catch (err) {
        return fail(c, err);
      }
    }

    const operationId = `op_${createId()}`;
    await deps.operationsStore.create({ operationId, skillId, type: JOB_NAMES.UPDATE_SKILL });
    const jobData: Record<string, unknown> = {
      operation_id: operationId,
      skill_id: skillId,
      mask,
    };
    if (mask.includes('displayName') && typeof body.displayName === 'string') {
      jobData['name'] = body.displayName;
    }
    if (mask.includes('description') && typeof body.description === 'string') {
      jobData['description'] = body.description;
    }
    if (ingest !== undefined) {
      jobData['content_hash'] = ingest.validated.contentHash;
      jobData['payload_b64'] = ingest.buffer.toString('base64');
      jobData['frontmatter'] = ingest.frontmatter;
    }
    await deps.queue.send(JOB_NAMES.UPDATE_SKILL, jobData, SEND_OPTIONS);
    deps.logger.info({ operation_id: operationId, skill_id: skillId, mask }, 'update_skill enqueued');
    return c.json({ operation_id: operationId, skill_id: skillId }, 202);
  });

  // DELETE /v1/skills/:id — soft-delete + id reservation (synchronous).
  app.delete('/v1/skills/:id', async (c) => {
    const skillId = c.req.param('id');
    const reservedUntil = new Date(Date.now() + deps.reservationHours * 3600_000);
    const existed = await deps.skillsStore.softDelete(skillId, reservedUntil);
    if (!existed) {
      return c.json({ error: 'not_found' }, 404);
    }
    deps.logger.info({ skill_id: skillId, reserved_until: reservedUntil.toISOString() }, 'skill deleted');
    return c.json({ skill_id: skillId, reserved_until: reservedUntil.toISOString() }, 200);
  });

  // GET /v1/skills/:id/revisions
  app.get('/v1/skills/:id/revisions', async (c) => {
    const skillId = c.req.param('id');
    if ((await deps.skillsStore.getView(skillId)) === undefined) {
      return c.json({ error: 'not_found' }, 404);
    }
    const revisions = await deps.revisionsStore.listBySkill(skillId);
    return c.json({ revisions }, 200);
  });

  // GET /v1/skills/:id/revisions/:revisionId
  app.get('/v1/skills/:id/revisions/:revisionId', async (c) => {
    const revision = await deps.revisionsStore.getById(c.req.param('revisionId'));
    if (revision === undefined || revision.skill_id !== c.req.param('id')) {
      return c.json({ error: 'not_found' }, 404);
    }
    return c.json(revision, 200);
  });
}
