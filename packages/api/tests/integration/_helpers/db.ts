import { Pool } from 'pg';

import { PG_URI } from './env.js';

let pool: Pool | undefined;

export function getPool(): Pool {
  pool ??= new Pool({ connectionString: PG_URI });
  return pool;
}

/** Reset domain tables between tests (pg-boss tables live in the pgboss schema). */
export async function truncateAll(): Promise<void> {
  await getPool().query('TRUNCATE TABLE operations, skill_revisions, skills RESTART IDENTITY CASCADE');
}

export async function closePool(): Promise<void> {
  if (pool !== undefined) {
    await pool.end();
    pool = undefined;
  }
}
