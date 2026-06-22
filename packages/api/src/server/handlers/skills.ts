import { createId } from '@paralleldrive/cuid2';
import { SkillInputSchema, SkillSchema } from '@usetheo/skillregistry/contract';
import { type Hono } from 'hono';
import type PgBoss from 'pg-boss';

import { type Logger } from '../logger.js';
import { CREATE_SKILL_SEND_OPTIONS, JOB_NAMES } from '../queue/queue.js';
import { type OperationsStore } from '../store/operations-store.js';
import { type SkillsStore } from '../store/skills-store.js';

export interface SkillsRoutesDeps {
  readonly skillsStore: SkillsStore;
  readonly operationsStore: OperationsStore;
  readonly queue: PgBoss;
  readonly logger: Logger;
}

export function registerSkillsRoutes(app: Hono, deps: SkillsRoutesDeps): void {
  // POST /v1/skills — validate, create operation (CREATING), enqueue, 202.
  app.post('/v1/skills', async (c) => {
    const body: unknown = await c.req.json().catch(() => null);
    const parsed = SkillInputSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'invalid_input', issues: parsed.error.issues }, 400);
    }

    const operationId = `op_${createId()}`;
    await deps.operationsStore.create({
      operationId,
      skillId: parsed.data.skill_id,
      type: JOB_NAMES.CREATE_SKILL,
    });
    // Insert-then-enqueue is not atomic: if enqueue fails, mark the operation
    // failed immediately so it is never orphaned in CREATING (fail-loud).
    try {
      await deps.queue.send(
        JOB_NAMES.CREATE_SKILL,
        {
          operation_id: operationId,
          skill_id: parsed.data.skill_id,
          name: parsed.data.name,
          description: parsed.data.description,
        },
        CREATE_SKILL_SEND_OPTIONS,
      );
    } catch (err) {
      await deps.operationsStore.updateState(operationId, 'failed', 'failed to enqueue create_skill job');
      deps.logger.error({ operation_id: operationId, skill_id: parsed.data.skill_id }, 'create_skill enqueue failed');
      throw err;
    }
    deps.logger.info({ operation_id: operationId, skill_id: parsed.data.skill_id }, 'create_skill enqueued');

    return c.json({ operation_id: operationId, skill_id: parsed.data.skill_id }, 202);
  });

  // GET /v1/skills/:id
  app.get('/v1/skills/:id', async (c) => {
    const skill = await deps.skillsStore.getById(c.req.param('id'));
    if (skill === undefined) {
      return c.json({ error: 'not_found' }, 404);
    }
    // Validate the response against the public contract before returning.
    return c.json(SkillSchema.parse(skill), 200);
  });
}
