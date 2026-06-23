import { describe, expect, it } from 'vitest';

import { parseFrontmatter, SkillFrontmatterError } from './frontmatter.js';

const FM = (body: string): string => `---\n${body}\n---\n# Body\n`;

describe('parseFrontmatter', () => {
  it('parses name + description and preserves unknown fields', () => {
    const fm = parseFrontmatter(
      FM('name: demo-skill\ndescription: Does a thing. Use when X.\nversion: "1.2.0"\ncategory: data'),
    );
    expect(fm.name).toBe('demo-skill');
    expect(fm.description).toBe('Does a thing. Use when X.');
    expect(fm.fields['version']).toBe('1.2.0');
    expect(fm.fields['category']).toBe('data');
  });

  it('rejects content without frontmatter (missing_frontmatter)', () => {
    try {
      parseFrontmatter('# no frontmatter here');
      expect.unreachable('should throw');
    } catch (err) {
      expect(err).toBeInstanceOf(SkillFrontmatterError);
      expect((err as SkillFrontmatterError).code).toBe('missing_frontmatter');
    }
  });

  it('rejects missing description (schema_invalid)', () => {
    expect(() => parseFrontmatter(FM('name: demo'))).toThrow(SkillFrontmatterError);
    try {
      parseFrontmatter(FM('name: demo'));
    } catch (err) {
      expect((err as SkillFrontmatterError).code).toBe('schema_invalid');
      expect((err as SkillFrontmatterError).message).toMatch(/description/);
    }
  });

  it('rejects missing name', () => {
    expect(() => parseFrontmatter(FM('description: x'))).toThrow(/name/);
  });

  it('rejects invalid name shapes', () => {
    for (const bad of ['Demo', 'demo_skill', '-demo', 'demo-', 'de--mo', 'UPPER']) {
      expect(() => parseFrontmatter(FM(`name: ${bad}\ndescription: ok`)), bad).toThrow(
        SkillFrontmatterError,
      );
    }
  });

  it('rejects name over 64 chars and description over 1024 chars', () => {
    expect(() => parseFrontmatter(FM(`name: ${'a'.repeat(65)}\ndescription: ok`))).toThrow(/64/);
    expect(() =>
      parseFrontmatter(FM(`name: demo\ndescription: ${'x'.repeat(1025)}`)),
    ).toThrow(/1024/);
  });

  it('rejects malformed YAML (schema_invalid)', () => {
    try {
      parseFrontmatter('---\nname: [unclosed\n---\n');
    } catch (err) {
      expect(err).toBeInstanceOf(SkillFrontmatterError);
      expect((err as SkillFrontmatterError).code).toBe('schema_invalid');
    }
  });
});
