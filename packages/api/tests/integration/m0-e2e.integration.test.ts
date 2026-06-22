import { type Hono } from 'hono';
import type PgBoss from 'pg-boss';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';

import { createApp } from '../../src/server/app.js';
import { createNoopLogger } from '../../src/server/logger.js';
import { buildCreateSkillHandler } from '../../src/server/wiring.js';
import { registerWorker } from '../../src/server/worker.js';

import { startBoss } from './_helpers/boss.js';
import { closePool, getPool, truncateAll } from './_helpers/db.js';
import { describeIntegration } from './_helpers/env.js';

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

interface OperationBody {
  state: 'CREATING' | 'done' | 'failed';
  error: string | null;
}

async function pollDone(app: Hono, opId: string): Promise<OperationBody> {
  for (let i = 0; i < 100; i++) {
    const res = await app.request(`/v1/operations/${opId}`);
    const op = (await res.json()) as OperationBody;
    if (op.state === 'done') {
      return op;
    }
    if (op.state === 'failed') {
      throw new Error(`operation failed: ${op.error ?? ''}`);
    }
    await sleep(50);
  }
  throw new Error('operation did not complete within deadline');
}

describeIntegration('M0 walking skeleton E2E (T3.3)', () => {
  let boss: PgBoss;

  beforeAll(async () => {
    boss = await startBoss();
    await registerWorker({ queue: boss, handler: buildCreateSkillHandler(getPool(), createNoopLogger()) });
  });
  beforeEach(truncateAll);
  afterAll(async () => {
    await boss.stop();
    await closePool();
  });

  it('POST /v1/skills → poll operation done → GET skill', async () => {
    const app = createApp({ pool: getPool(), queue: boss, logger: createNoopLogger() });

    const create = await app.request('/v1/skills', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ skill_id: 'demo-skill', name: 'Demo', description: 'x' }),
    });
    expect(create.status).toBe(202);
    const created = (await create.json()) as { operation_id: string; skill_id: string };

    const op = await pollDone(app, created.operation_id);
    expect(op.state).toBe('done');

    const get = await app.request('/v1/skills/demo-skill');
    expect(get.status).toBe(200);
    expect(((await get.json()) as { name: string }).name).toBe('Demo');
  });

  it('GET unknown skill and operation return 404', async () => {
    const app = createApp({ pool: getPool(), queue: boss, logger: createNoopLogger() });
    expect((await app.request('/v1/skills/does-not-exist')).status).toBe(404);
    expect((await app.request('/v1/operations/does-not-exist')).status).toBe(404);
  });
});
