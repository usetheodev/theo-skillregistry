import type PgBoss from 'pg-boss';

import { createQueue, JOB_NAMES } from '../../../src/server/queue/queue.js';

import { PG_URI } from './env.js';

/** Start a real pg-boss bound to the test DB and ensure the create_skill queue. */
export async function startBoss(): Promise<PgBoss> {
  const boss = createQueue(PG_URI);
  await boss.start();
  await boss.createQueue(JOB_NAMES.CREATE_SKILL);
  return boss;
}
