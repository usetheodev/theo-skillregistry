import PgBoss from 'pg-boss';

export const JOB_NAMES = Object.freeze({
  CREATE_SKILL: 'create_skill',
  UPDATE_SKILL: 'update_skill',
});

/** No automatic retries in M1 — a failed op surfaces as a failed operation. */
export const SEND_OPTIONS: Readonly<Pick<PgBoss.SendOptions, 'retryLimit'>> = Object.freeze({
  retryLimit: 0,
});

/** Build a pg-boss instance bound to the Postgres connection URI. */
export function createQueue(uri: string): PgBoss {
  return new PgBoss({ connectionString: uri, application_name: '@usetheo/skillregistry-api' });
}

/** Payload enqueued for the create_skill job (zip carried as base64). */
export interface CreateSkillJobData {
  readonly operation_id: string;
  readonly skill_id: string;
  readonly name: string;
  readonly description: string;
  readonly content_hash: string;
  readonly payload_b64: string;
  readonly frontmatter: Record<string, unknown>;
}

/** Payload enqueued for the update_skill job (updateMask-driven). */
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
