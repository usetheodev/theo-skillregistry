import { parse as parseYaml } from 'yaml';

import { MAX_DESCRIPTION_LENGTH, MAX_NAME_LENGTH } from './limits.js';

export type FrontmatterErrorCode = 'missing_frontmatter' | 'schema_invalid';

/** Typed error for a malformed SKILL.md frontmatter (fail-loud, Unbreakable Rule 8). */
export class SkillFrontmatterError extends Error {
  readonly code: FrontmatterErrorCode;

  constructor(code: FrontmatterErrorCode, message: string) {
    super(message);
    this.name = 'SkillFrontmatterError';
    this.code = code;
  }
}

export interface SkillFrontmatter {
  /** Required. Theokit-compatible skill name. */
  readonly name: string;
  /** Required. What the skill does + when to use it. */
  readonly description: string;
  /** Full parsed frontmatter — unknown fields preserved (forward-compat, ADR-4). */
  readonly fields: Readonly<Record<string, unknown>>;
}

// Leading `---\n ... \n---` block.
const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/;
// AgentSkills name shape: lowercase alnum + hyphens, no leading/trailing hyphen.
const NAME_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

/**
 * Parse and validate a SKILL.md's YAML frontmatter using the `yaml` (eemeli)
 * parser (no js-yaml CVE; no code-exec surface). Required fields: name,
 * description. Unknown fields are preserved. Throws SkillFrontmatterError on any
 * malformation.
 */
export function parseFrontmatter(content: string): SkillFrontmatter {
  const match = FRONTMATTER_RE.exec(content);
  if (match === null) {
    throw new SkillFrontmatterError('missing_frontmatter', 'SKILL.md is missing YAML frontmatter');
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(match[1] ?? '');
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new SkillFrontmatterError('schema_invalid', `malformed YAML frontmatter: ${detail}`);
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new SkillFrontmatterError('schema_invalid', 'frontmatter must be a YAML mapping');
  }
  const fields = parsed as Record<string, unknown>;

  const name = fields['name'];
  if (typeof name !== 'string' || name.length === 0) {
    throw new SkillFrontmatterError('schema_invalid', 'missing required field: name');
  }
  if (name.length > MAX_NAME_LENGTH) {
    throw new SkillFrontmatterError('schema_invalid', `name exceeds ${MAX_NAME_LENGTH} characters`);
  }
  if (name.includes('--') || !NAME_RE.test(name)) {
    throw new SkillFrontmatterError(
      'schema_invalid',
      'name must be lowercase letters/digits/hyphens, no leading/trailing or consecutive hyphens',
    );
  }

  const description = fields['description'];
  if (typeof description !== 'string' || description.trim().length === 0) {
    throw new SkillFrontmatterError('schema_invalid', 'missing required field: description');
  }
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    throw new SkillFrontmatterError(
      'schema_invalid',
      `description exceeds ${MAX_DESCRIPTION_LENGTH} characters`,
    );
  }

  return { name, description, fields };
}
