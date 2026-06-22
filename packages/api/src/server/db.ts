import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

export type Db = NodePgDatabase<Record<string, never>>;

/** Build a Postgres connection pool from a connection URI. */
export function createPool(uri: string): Pool {
  return new Pool({ connectionString: uri });
}

/** Wrap a pool in a Drizzle client. */
export function createDb(pool: Pool): Db {
  return drizzle(pool);
}
