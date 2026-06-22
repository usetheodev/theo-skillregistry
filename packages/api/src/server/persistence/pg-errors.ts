/** Postgres SQLSTATE for unique_violation. */
const UNIQUE_VIOLATION = '23505';

interface PgErrorLike {
  readonly code?: string;
  readonly cause?: unknown;
}

/**
 * True when the error (or any error in its `cause` chain) is a Postgres
 * unique-constraint violation (23505). Drizzle wraps the driver error, so the
 * SQLSTATE code lives on `.cause`, not on the top-level error.
 */
export function isUniqueViolation(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; depth < 5 && current !== null && current !== undefined; depth++) {
    if (typeof current === 'object' && (current as PgErrorLike).code === UNIQUE_VIOLATION) {
      return true;
    }
    current = (current as PgErrorLike).cause;
  }
  return false;
}

/** Typed error raised when a skillId already exists. */
export class SkillAlreadyExistsError extends Error {
  readonly skillId: string;

  constructor(skillId: string) {
    super(`Skill "${skillId}" already exists`);
    this.name = 'SkillAlreadyExistsError';
    this.skillId = skillId;
  }
}
