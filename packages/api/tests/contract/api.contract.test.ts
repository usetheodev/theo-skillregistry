import { type Pool } from 'pg';
import type PgBoss from 'pg-boss';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../src/server/app.js';
import { createNoopLogger } from '../../src/server/logger.js';

// Health + input validation never touch the DB/queue, so trivial fakes suffice.
const fakePool = {} as unknown as Pool;
const fakeQueue = { send: () => Promise.resolve('job') } as unknown as PgBoss;

function app() {
  return createApp({ pool: fakePool, queue: fakeQueue, logger: createNoopLogger() });
}

describe('API contract (no DB)', () => {
  it('GET /v1/health returns 200 {status:ok}', async () => {
    const res = await app().request('/v1/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('POST /v1/skills with reserved gcp- prefix returns 400 on skill_id path', async () => {
    const res = await app().request('/v1/skills', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ skill_id: 'gcp-x', name: 'X' }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; issues: { path: (string | number)[] }[] };
    expect(body.error).toBe('invalid_input');
    expect(body.issues[0]?.path).toEqual(['skill_id']);
  });

  it('POST /v1/skills with empty name returns 400', async () => {
    const res = await app().request('/v1/skills', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ skill_id: 'demo', name: '' }),
    });
    expect(res.status).toBe(400);
  });

  it('POST /v1/skills with non-JSON body returns 400', async () => {
    const res = await app().request('/v1/skills', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not-json',
    });
    expect(res.status).toBe(400);
  });
});
