import type PgBoss from 'pg-boss';

import { type Logger } from './logger.js';
import { type CreateSkillJobData, JOB_NAMES } from './queue/queue.js';
import { type OperationsStore } from './store/operations-store.js';
import { type SkillsStore } from './store/skills-store.js';

export interface CreateSkillHandlerDeps {
  readonly skillsStore: SkillsStore;
  readonly operationsStore: OperationsStore;
  readonly logger: Logger;
}

/**
 * Pure-ish job handler for create_skill — the LRO state machine (ADR-1):
 * CREATING → done (skill persisted) or failed (error recorded). On failure it
 * re-throws so pg-boss marks the job failed, after persisting the failed state
 * (fail-loud, Unbreakable Rule 8).
 */
export function createCreateSkillHandler(
  deps: CreateSkillHandlerDeps,
): (data: CreateSkillJobData) => Promise<void> {
  return async (data) => {
    try {
      await deps.skillsStore.create({
        skillId: data.skill_id,
        name: data.name,
        description: data.description,
      });
      await deps.operationsStore.updateState(data.operation_id, 'done');
      deps.logger.info(
        { operation_id: data.operation_id, skill_id: data.skill_id, state: 'done' },
        'create_skill done',
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await deps.operationsStore.updateState(data.operation_id, 'failed', message);
      deps.logger.error(
        { operation_id: data.operation_id, skill_id: data.skill_id, state: 'failed', error: message },
        'create_skill failed',
      );
      throw err;
    }
  };
}

export interface RegisterWorkerDeps {
  readonly queue: PgBoss;
  readonly handler: (data: CreateSkillJobData) => Promise<void>;
}

/** Register the create_skill consumer. pg-boss v10 delivers a batch (array). */
export async function registerWorker(deps: RegisterWorkerDeps): Promise<void> {
  await deps.queue.work<CreateSkillJobData>(
    JOB_NAMES.CREATE_SKILL,
    { pollingIntervalSeconds: 1, includeMetadata: false },
    async (jobs) => {
      for (const job of jobs) {
        await deps.handler(job.data);
      }
    },
  );
}
