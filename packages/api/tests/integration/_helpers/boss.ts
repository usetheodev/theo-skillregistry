import type PgBoss from 'pg-boss';

import { createQueue, JOB_NAMES } from '../../../src/server/queue/queue.js';

import { PG_URI } from './env.js';

/** Start a real pg-boss bound to the test DB and ensure the job queues. */
export async function startBoss(): Promise<PgBoss> {
  const boss = createQueue(PG_URI);
  await boss.start();
  await boss.createQueue(JOB_NAMES.CREATE_SKILL);
  await boss.createQueue(JOB_NAMES.UPDATE_SKILL);
  await boss.createQueue(JOB_NAMES.DELETE_SKILL);
  return boss;
}
