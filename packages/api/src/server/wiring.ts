import { type Pool } from 'pg';

import { createDb } from './db.js';
import { createJsonLogger, type Logger } from './logger.js';
import { type CreateSkillJobData } from './queue/queue.js';
import { createOperationsStore } from './store/operations-store.js';
import { createSkillsStore } from './store/skills-store.js';
import { createCreateSkillHandler } from './worker.js';

/**
 * Build the create_skill job handler from a pool. Shared by the server boot and
 * the integration tests so the worker and the HTTP routes use the same stores
 * (single source of persistence wiring).
 */
export function buildCreateSkillHandler(
  pool: Pool,
  logger: Logger = createJsonLogger(),
): (data: CreateSkillJobData) => Promise<void> {
  const db = createDb(pool);
  return createCreateSkillHandler({
    skillsStore: createSkillsStore(db),
    operationsStore: createOperationsStore(db),
    logger,
  });
}
