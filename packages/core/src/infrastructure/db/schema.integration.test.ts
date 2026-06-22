import { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';

const uri = process.env['THEOSKILL_PG_URI'] ?? '';
const describeIntegration = describe.skipIf(uri === '');

describeIntegration('schema migrations (T2.1)', () => {
  const pool = new Pool({ connectionString: uri });
  afterAll(async () => {
    await pool.end();
  });

  it('skills and operations tables exist with the expected columns', async () => {
    const res = await pool.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name IN ('skills', 'operations')`,
    );
    const present = new Set(res.rows.map((r) => `${r.table_name}.${r.column_name}`));

    const expected = [
      'skills.skill_id',
      'skills.name',
      'skills.description',
      'skills.state',
      'skills.create_time',
      'skills.update_time',
      'operations.operation_id',
      'operations.skill_id',
      'operations.type',
      'operations.state',
      'operations.error',
      'operations.create_time',
      'operations.update_time',
    ];
    for (const col of expected) {
      expect(present.has(col), col).toBe(true);
    }
  });
});
