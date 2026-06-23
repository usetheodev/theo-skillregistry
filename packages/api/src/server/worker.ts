import type PgBoss from 'pg-boss';

import { type Logger } from './logger.js';
import {
  type CreateSkillJobData,
  JOB_NAMES,
  type UpdateSkillJobData,
} from './queue/queue.js';
import { type OperationsStore } from './store/operations-store.js';
import { type SkillsStore } from './store/skills-store.js';

export interface WorkerDeps {
  readonly skillsStore: SkillsStore;
  readonly operationsStore: OperationsStore;
  readonly logger: Logger;
}

/** create_skill: persist the skill + its first revision; mark the operation done. */
export function createCreateSkillHandler(
  deps: WorkerDeps,
): (data: CreateSkillJobData) => Promise<void> {
  return async (data) => {
    try {
      await deps.skillsStore.createWithRevision({
        skillId: data.skill_id,
        name: data.name,
        description: data.description,
        payload: Buffer.from(data.payload_b64, 'base64'),
        contentHash: data.content_hash,
        frontmatter: data.frontmatter,
      });
      await deps.operationsStore.updateState(data.operation_id, 'done');
      deps.logger.info(
        { operation_id: data.operation_id, skill_id: data.skill_id, state: 'done', type: 'create' },
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

/** update_skill: apply the updateMask — metadata fields and/or a new revision. */
export function createUpdateSkillHandler(
  deps: WorkerDeps,
): (data: UpdateSkillJobData) => Promise<void> {
  return async (data) => {
    try {
      const meta: { name?: string; description?: string } = {};
      if (data.mask.includes('displayName') && data.name !== undefined) {
        meta.name = data.name;
      }
      if (data.mask.includes('description') && data.description !== undefined) {
        meta.description = data.description;
      }
      if (meta.name !== undefined || meta.description !== undefined) {
        await deps.skillsStore.updateMetadata(data.skill_id, meta);
      }
      if (
        data.mask.includes('zippedFilesystem') &&
        data.payload_b64 !== undefined &&
        data.content_hash !== undefined &&
        data.frontmatter !== undefined
      ) {
        await deps.skillsStore.addRevision(data.skill_id, {
          payload: Buffer.from(data.payload_b64, 'base64'),
          contentHash: data.content_hash,
          frontmatter: data.frontmatter,
        });
      }
      await deps.operationsStore.updateState(data.operation_id, 'done');
      deps.logger.info(
        { operation_id: data.operation_id, skill_id: data.skill_id, state: 'done', type: 'update' },
        'update_skill done',
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await deps.operationsStore.updateState(data.operation_id, 'failed', message);
      deps.logger.error(
        { operation_id: data.operation_id, skill_id: data.skill_id, state: 'failed', error: message },
        'update_skill failed',
      );
      throw err;
    }
  };
}

export interface RegisterWorkerDeps {
  readonly queue: PgBoss;
  readonly createHandler: (data: CreateSkillJobData) => Promise<void>;
  readonly updateHandler: (data: UpdateSkillJobData) => Promise<void>;
}

/** Register the create_skill + update_skill consumers (pg-boss v10 batch arrays). */
export async function registerWorker(deps: RegisterWorkerDeps): Promise<void> {
  await deps.queue.work<CreateSkillJobData>(
    JOB_NAMES.CREATE_SKILL,
    { pollingIntervalSeconds: 1, includeMetadata: false },
    async (jobs) => {
      for (const job of jobs) {
        await deps.createHandler(job.data);
      }
    },
  );
  await deps.queue.work<UpdateSkillJobData>(
    JOB_NAMES.UPDATE_SKILL,
    { pollingIntervalSeconds: 1, includeMetadata: false },
    async (jobs) => {
      for (const job of jobs) {
        await deps.updateHandler(job.data);
      }
    },
  );
}
