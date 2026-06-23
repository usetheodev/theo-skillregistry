import { createId } from '@paralleldrive/cuid2';
import { assertEmbeddingDim, type EmbeddingProvider } from '@usetheo/skillregistry';
import type PgBoss from 'pg-boss';

import { type Logger } from '../logger.js';
import {
  type EmbedSkillJobData,
  EMBED_SKILL_SEND_OPTIONS,
  EMBED_SKILL_SINGLETON_SECONDS,
  JOB_NAMES,
} from '../queue/queue.js';
import { type EmbeddingsStore, embedSourceText } from '../store/embeddings-store.js';
import { type OnOperationTerminal } from '../worker.js';

export interface EmbedWorkerDeps {
  readonly embeddingsStore: EmbeddingsStore;
  readonly embedder: EmbeddingProvider;
  readonly logger: Logger;
}

export type EmbedSkillHandler = (data: EmbedSkillJobData) => Promise<void>;

/**
 * Embed the skill's CURRENT revision: resolve source text (name + description +
 * SKILL.md body), generate the vector, guard the dimension (fail-fast — never
 * write a corrupt vector), and idempotently upsert it. A skill that was deleted
 * or has no revision is a no-op (nothing to index).
 */
export function createEmbedSkillHandler(deps: EmbedWorkerDeps): EmbedSkillHandler {
  return async (data) => {
    const source = await deps.embeddingsStore.getEmbedSourceBySkill(data.skill_id);
    if (source === undefined) {
      return; // skill gone / soft-deleted / no revision — nothing to embed
    }
    const vector = await deps.embedder.embed(embedSourceText(source));
    assertEmbeddingDim(vector); // fail-fast: a provider that diverges throws, no write

    await deps.embeddingsStore.upsert({
      id: `emb_${createId()}`,
      revisionId: source.revisionId,
      skillId: source.skillId,
      provider: deps.embedder.provider,
      model: deps.embedder.model,
      dimensions: vector.length,
      vector,
    });
    deps.logger.info(
      { skill_id: data.skill_id, revision_id: source.revisionId, provider: deps.embedder.provider },
      'skill embedded',
    );
  };
}

/**
 * Build the `onTerminal` hook that enqueues an embed job when a skill is created
 * or updated successfully. Deletes and failures are skipped (nothing to index).
 * The singletonKey dedups rapid successive updates into a single embed of the
 * current revision (which the worker resolves at run time).
 */
export function createEmbedEnqueuer(deps: { queue: PgBoss; logger: Logger }): OnOperationTerminal {
  return async ({ skillId, eventType, state }) => {
    if (state !== 'ACTIVE' || eventType === 'skill.deleted') {
      return;
    }
    const jobData: EmbedSkillJobData = { skill_id: skillId };
    await deps.queue.send(JOB_NAMES.EMBED_SKILL, jobData, {
      ...EMBED_SKILL_SEND_OPTIONS,
      singletonKey: skillId,
      singletonSeconds: EMBED_SKILL_SINGLETON_SECONDS,
    });
  };
}

export interface RegisterEmbedWorkerDeps {
  readonly queue: PgBoss;
  readonly handler: EmbedSkillHandler;
}

/** Register the embed_skill consumer. */
export async function registerEmbedWorker(deps: RegisterEmbedWorkerDeps): Promise<void> {
  await deps.queue.work<EmbedSkillJobData>(
    JOB_NAMES.EMBED_SKILL,
    { pollingIntervalSeconds: 1 },
    async (jobs) => {
      for (const job of jobs) {
        await deps.handler(job.data);
      }
    },
  );
}
