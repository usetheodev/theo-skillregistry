import { type Pool } from 'pg';

import { createDb } from './db.js';
import { createJsonLogger, type Logger } from './logger.js';
import { type CreateSkillJobData, type UpdateSkillJobData } from './queue/queue.js';
import { createOperationsStore } from './store/operations-store.js';
import { createSkillsStore } from './store/skills-store.js';
import { createCreateSkillHandler, createUpdateSkillHandler } from './worker.js';

export interface WorkerHandlers {
  readonly createHandler: (data: CreateSkillJobData) => Promise<void>;
  readonly updateHandler: (data: UpdateSkillJobData) => Promise<void>;
}

/**
 * Build the create_skill + update_skill job handlers from a pool. Shared by the
 * server boot and the integration tests so the worker and HTTP routes use the
 * same persistence wiring.
 */
export function buildWorkerHandlers(pool: Pool, logger: Logger = createJsonLogger()): WorkerHandlers {
  const db = createDb(pool);
  const deps = {
    skillsStore: createSkillsStore(db),
    operationsStore: createOperationsStore(db),
    logger,
  };
  return {
    createHandler: createCreateSkillHandler(deps),
    updateHandler: createUpdateSkillHandler(deps),
  };
}
