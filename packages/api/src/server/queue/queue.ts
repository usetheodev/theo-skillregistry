import PgBoss from 'pg-boss';

export const JOB_NAMES = Object.freeze({
  CREATE_SKILL: 'create_skill',
});

/** No automatic retries in M0 — a failed create surfaces as a failed operation. */
export const CREATE_SKILL_SEND_OPTIONS: Readonly<Pick<PgBoss.SendOptions, 'retryLimit'>> =
  Object.freeze({ retryLimit: 0 });

/** Build a pg-boss instance bound to the Postgres connection URI. */
export function createQueue(uri: string): PgBoss {
  return new PgBoss({ connectionString: uri, application_name: '@usetheo/skillregistry-api' });
}

/** Payload enqueued for the create_skill job. */
export interface CreateSkillJobData {
  readonly operation_id: string;
  readonly skill_id: string;
  readonly name: string;
  readonly description: string;
}
