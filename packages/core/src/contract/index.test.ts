import { describe, expect, it } from 'vitest';

import { OperationSchema, SkillInputSchema } from './index.js';

describe('SkillInputSchema', () => {
  it('parses a valid payload and defaults description', () => {
    const parsed = SkillInputSchema.parse({ skill_id: 'demo-skill', name: 'Demo' });
    expect(parsed.skill_id).toBe('demo-skill');
    expect(parsed.description).toBe('');
  });

  it('rejects an invalid skill_id on the skill_id path', () => {
    const res = SkillInputSchema.safeParse({ skill_id: 'gcp-x', name: 'Demo' });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0]?.path).toEqual(['skill_id']);
    }
  });

  it('rejects an empty name', () => {
    expect(SkillInputSchema.safeParse({ skill_id: 'demo', name: '' }).success).toBe(false);
  });
});

describe('OperationSchema', () => {
  it('accepts the three M0 states', () => {
    for (const state of ['CREATING', 'done', 'failed'] as const) {
      const res = OperationSchema.safeParse({
        operation_id: 'op_1',
        skill_id: 'demo',
        type: 'create_skill',
        state,
        error: null,
      });
      expect(res.success).toBe(true);
    }
  });

  it('rejects an unknown state', () => {
    const res = OperationSchema.safeParse({
      operation_id: 'op_1',
      skill_id: 'demo',
      type: 'create_skill',
      state: 'BOGUS',
      error: null,
    });
    expect(res.success).toBe(false);
  });
});
