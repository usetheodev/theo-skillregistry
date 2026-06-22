import { afterAll, beforeEach, expect, it } from 'vitest';

import { createDb } from '../../src/server/db.js';
import { createNoopLogger } from '../../src/server/logger.js';
import { createOperationsStore } from '../../src/server/store/operations-store.js';
import { createSkillsStore } from '../../src/server/store/skills-store.js';
import { buildCreateSkillHandler } from '../../src/server/wiring.js';

import { closePool, getPool, truncateAll } from './_helpers/db.js';
import { describeIntegration } from './_helpers/env.js';

describeIntegration('create_skill worker handler (T3.2)', () => {
  beforeEach(truncateAll);
  afterAll(closePool);

  it('success: skill persisted and operation marked done', async () => {
    const ops = createOperationsStore(createDb(getPool()));
    await ops.create({ operationId: 'op_ok', skillId: 'demo', type: 'create_skill' });

    const handle = buildCreateSkillHandler(getPool(), createNoopLogger());
    await handle({ operation_id: 'op_ok', skill_id: 'demo', name: 'Demo', description: 'x' });

    expect((await ops.get('op_ok'))?.state).toBe('done');
    const skills = createSkillsStore(createDb(getPool()));
    expect((await skills.getById('demo'))?.name).toBe('Demo');
  });

  it('failure: operation marked failed with error, handler rethrows', async () => {
    const ops = createOperationsStore(createDb(getPool()));
    const skills = createSkillsStore(createDb(getPool()));
    await skills.create({ skillId: 'dup', name: 'A', description: '' });
    await ops.create({ operationId: 'op_fail', skillId: 'dup', type: 'create_skill' });

    const handle = buildCreateSkillHandler(getPool(), createNoopLogger());
    await expect(
      handle({ operation_id: 'op_fail', skill_id: 'dup', name: 'B', description: '' }),
    ).rejects.toBeTruthy();

    const op = await ops.get('op_fail');
    expect(op?.state).toBe('failed');
    expect(op?.error).toMatch(/already exists/);
  });

  it('concurrent test: two parallel jobs same skill_id race — one done, one failed', async () => {
    const ops = createOperationsStore(createDb(getPool()));
    await ops.create({ operationId: 'op_a', skillId: 'race', type: 'create_skill' });
    await ops.create({ operationId: 'op_b', skillId: 'race', type: 'create_skill' });

    const handle = buildCreateSkillHandler(getPool(), createNoopLogger());
    const results = await Promise.allSettled([
      handle({ operation_id: 'op_a', skill_id: 'race', name: 'A', description: '' }),
      handle({ operation_id: 'op_b', skill_id: 'race', name: 'B', description: '' }),
    ]);

    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    const states = [(await ops.get('op_a'))?.state, (await ops.get('op_b'))?.state].sort();
    expect(states).toEqual(['done', 'failed']);

    const count = await getPool().query<{ count: string }>(
      "SELECT count(*)::text AS count FROM skills WHERE skill_id = 'race'",
    );
    expect(count.rows[0]?.count).toBe('1');
  });
});
