import { describe, expect, it } from 'vitest';

import { InvalidSkillIdError, isValidSkillId, parseSkillId } from './skill-id.js';

describe('parseSkillId', () => {
  it('accepts valid ids', () => {
    for (const ok of ['a', 'demo-skill', 'cloud-resource-manager', 'x1', 'a-b-c9']) {
      expect(parseSkillId(ok)).toBe(ok);
    }
  });

  it('rejects empty and over-long ids', () => {
    expect(() => parseSkillId('')).toThrow(InvalidSkillIdError);
    expect(() => parseSkillId('a'.repeat(64))).toThrow(InvalidSkillIdError);
  });

  it('rejects the reserved gcp- prefix', () => {
    expect(() => parseSkillId('gcp-x')).toThrow(/reserved prefix/);
  });

  it('rejects invalid charset and shape', () => {
    for (const bad of ['Gcp', 'A_B', '-x', 'x-', 'demo_skill', 'demo skill', 'UPPER', '1abc']) {
      expect(() => parseSkillId(bad), bad).toThrow(InvalidSkillIdError);
    }
  });

  it('isValidSkillId mirrors parseSkillId without throwing', () => {
    expect(isValidSkillId('demo-skill')).toBe(true);
    expect(isValidSkillId('gcp-x')).toBe(false);
    expect(isValidSkillId('')).toBe(false);
  });

  it('carries a typed reason on failure', () => {
    try {
      parseSkillId('gcp-foo');
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidSkillIdError);
      expect((err as InvalidSkillIdError).skillId).toBe('gcp-foo');
      expect((err as InvalidSkillIdError).reason).toMatch(/reserved/);
    }
  });
});
