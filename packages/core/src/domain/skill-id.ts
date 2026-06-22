/**
 * Typed error for an invalid skillId. Carries the offending value and a precise
 * reason so the boundary can fail loud and clear (Unbreakable Rule 8).
 */
export class InvalidSkillIdError extends Error {
  readonly skillId: string;
  readonly reason: string;

  constructor(skillId: string, reason: string) {
    super(`Invalid skillId "${skillId}": ${reason}`);
    this.name = 'InvalidSkillIdError';
    this.skillId = skillId;
    this.reason = reason;
  }
}

const MAX_LENGTH = 63;
const RESERVED_PREFIX = 'gcp-';
// Lowercase letters/digits/hyphens; starts with a letter; ends with a letter or digit.
const SKILL_ID_RE = /^[a-z]([a-z0-9-]*[a-z0-9])?$/;

/**
 * Validate a skillId at the trust boundary. Returns the value on success;
 * throws InvalidSkillIdError otherwise. Immutable identity — see ROADMAP/PRD.
 */
export function parseSkillId(value: string): string {
  if (value.length < 1 || value.length > MAX_LENGTH) {
    throw new InvalidSkillIdError(value, `length must be 1..${MAX_LENGTH} (got ${value.length})`);
  }
  if (value.startsWith(RESERVED_PREFIX)) {
    throw new InvalidSkillIdError(value, `reserved prefix "${RESERVED_PREFIX}" is not allowed`);
  }
  if (!SKILL_ID_RE.test(value)) {
    throw new InvalidSkillIdError(
      value,
      'must be lowercase letters/digits/hyphens, start with a letter and end with a letter or digit',
    );
  }
  return value;
}

/** Non-throwing variant — returns true when the skillId is valid. */
export function isValidSkillId(value: string): boolean {
  try {
    parseSkillId(value);
    return true;
  } catch {
    return false;
  }
}
