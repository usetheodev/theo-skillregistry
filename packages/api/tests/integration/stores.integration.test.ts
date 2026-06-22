import { afterAll, beforeEach, expect, it } from 'vitest';

import { createDb } from '../../src/server/db.js';
import { SkillAlreadyExistsError } from '../../src/server/persistence/pg-errors.js';
import { createOperationsStore } from '../../src/server/store/operations-store.js';
import { createSkillsStore } from '../../src/server/store/skills-store.js';

import { closePool, getPool, truncateAll } from './_helpers/db.js';
import { describeIntegration } from './_helpers/env.js';

describeIntegration('stores against real Postgres (T3.1)', () => {
  beforeEach(truncateAll);
  afterAll(closePool);

  it('operations store roundtrip and state transition', async () => {
    const ops = createOperationsStore(createDb(getPool()));
    await ops.create({ operationId: 'op_1', skillId: 'demo', type: 'create_skill' });
    expect((await ops.get('op_1'))?.state).toBe('CREATING');

    await ops.updateState('op_1', 'done');
    expect((await ops.get('op_1'))?.state).toBe('done');

    await ops.updateState('op_2', 'failed', 'boom'); // no-op on missing row
    expect(await ops.get('missing')).toBeUndefined();
  });

  it('skills store insert, getById, and duplicate maps to typed error', async () => {
    const skills = createSkillsStore(createDb(getPool()));
    await skills.create({ skillId: 'demo', name: 'Demo', description: 'x' });
    expect((await skills.getById('demo'))?.name).toBe('Demo');
    await expect(
      skills.create({ skillId: 'demo', name: 'Demo2', description: 'y' }),
    ).rejects.toBeInstanceOf(SkillAlreadyExistsError);
    expect(await skills.getById('missing')).toBeUndefined();
  });
});
