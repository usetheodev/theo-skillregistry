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

  it('POST returns 500 and marks the operation failed when enqueue fails', async () => {
    const throwingQueue = {
      send: () => Promise.reject(new Error('enqueue down')),
    } as unknown as PgBoss;
    const app = createApp({ pool: getPool(), queue: throwingQueue, logger: createNoopLogger() });

    const res = await app.request('/v1/skills', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ skill_id: 'enqueue-fail', name: 'X', description: '' }),
    });
    expect(res.status).toBe(500);

    const row = await getPool().query<{ state: string }>(
      "SELECT state FROM operations WHERE skill_id = 'enqueue-fail'",
    );
    expect(row.rows[0]?.state).toBe('failed'); // not orphaned in CREATING
  });

  it('GET unknown skill and operation return 404', async () => {
    const app = createApp({ pool: getPool(), queue: boss, logger: createNoopLogger() });
    expect((await app.request('/v1/skills/does-not-exist')).status).toBe(404);
    expect((await app.request('/v1/operations/does-not-exist')).status).toBe(404);
  });

  // Concurrent test (T3.3): N parallel POSTs with the same skill_id race through
  // the real pg-boss worker — exactly one skill is created, the rest fail.
  it('concurrent POST same skill_id: exactly one done, the rest failed (one skill row)', async () => {
    const app = createApp({ pool: getPool(), queue: boss, logger: createNoopLogger() });
    const N = 10;

    const creates = await Promise.all(
      Array.from({ length: N }, async () =>
        app.request('/v1/skills', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ skill_id: 'race-skill', name: 'Race', description: '' }),
        }),
      ),
    );
    expect(creates.every((r) => r.status === 202)).toBe(true);
    const opIds = await Promise.all(
      creates.map(async (r) => ((await r.json()) as { operation_id: string }).operation_id),
    );

    // Poll all operations to a terminal state in parallel (wall-clock = slowest,
    // not the sum) with a generous budget to stay deterministic under load.
    const states = await Promise.all(
      opIds.map(async (opId) => {
        for (let i = 0; i < 200; i++) {
          const res = await app.request(`/v1/operations/${opId}`);
          const op = (await res.json()) as OperationBody;
          if (op.state === 'done' || op.state === 'failed') {
            return op.state;
          }
          await sleep(50);
        }
        throw new Error(`operation ${opId} did not reach a terminal state`);
      }),
    );

    expect(states.filter((s) => s === 'done')).toHaveLength(1);
    expect(states.filter((s) => s === 'failed')).toHaveLength(N - 1);

    const count = await getPool().query<{ count: string }>(
      "SELECT count(*)::text AS count FROM skills WHERE skill_id = 'race-skill'",
    );
    expect(count.rows[0]?.count).toBe('1');
  });
});
