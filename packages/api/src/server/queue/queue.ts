import PgBoss from 'pg-boss';

export const JOB_NAMES = Object.freeze({
  CREATE_SKILL: 'create_skill',
  UPDATE_SKILL: 'update_skill',
  DELETE_SKILL: 'delete_skill',
  WEBHOOK_DELIVERY: 'webhook_delivery',
});

export const WEBHOOK_DELIVERY_DLQ_QUEUE_NAME = 'webhook_delivery_dlq';

/** Max retries for a skill job — transient failures retry with backoff (M2). */
export const MAX_SKILL_RETRY = 3;

/** Skill jobs: retry transient failures with exponential backoff (2,4,8s). */
export const SKILL_SEND_OPTIONS: Readonly<
  Pick<PgBoss.SendOptions, 'retryLimit' | 'retryDelay' | 'retryBackoff'>
> = Object.freeze({ retryLimit: MAX_SKILL_RETRY, retryDelay: 2, retryBackoff: true });

/** Webhook delivery: 5 retries with backoff (2,4,8,16,32s) then dead-letter. */
export const WEBHOOK_DELIVERY_SEND_OPTIONS: Readonly<
  Pick<PgBoss.SendOptions, 'retryLimit' | 'retryDelay' | 'retryBackoff' | 'expireInSeconds' | 'deadLetter'>
> = Object.freeze({
  retryLimit: 5,
  retryDelay: 2,
  retryBackoff: true,
  expireInSeconds: 60,
  deadLetter: WEBHOOK_DELIVERY_DLQ_QUEUE_NAME,
});

/** Dedup window for a reconciler re-enqueue racing the original send. */
export const WEBHOOK_DELIVERY_SINGLETON_SECONDS = 120;

/** Build a pg-boss instance bound to the Postgres connection URI. */
export function createQueue(uri: string): PgBoss {
  return new PgBoss({ connectionString: uri, application_name: '@usetheo/skillregistry-api' });
}

export interface CreateSkillJobData {
  readonly operation_id: string;
  readonly skill_id: string;
  readonly name: string;
  readonly description: string;
  readonly content_hash: string;
  readonly payload_b64: string;
  readonly frontmatter: Record<string, unknown>;
}

export interface UpdateSkillJobData {
  readonly operation_id: string;
  readonly skill_id: string;
  readonly mask: readonly string[];
  readonly name?: string;
  readonly description?: string;
  readonly content_hash?: string;
  readonly payload_b64?: string;
  readonly frontmatter?: Record<string, unknown>;
}

export interface DeleteSkillJobData {
  readonly operation_id: string;
  readonly skill_id: string;
  readonly reserved_until: string;
}

export interface WebhookDeliveryJobData {
  readonly delivery_id: string;
  readonly endpoint_id: string;
  readonly payload: Record<string, unknown>;
}
