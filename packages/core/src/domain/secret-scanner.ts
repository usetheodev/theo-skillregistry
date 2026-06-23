import { type PayloadFile } from './payload-validator.js';

/** A detected secret — type + location only. The raw value is NEVER carried. */
export interface SecretFinding {
  readonly file: string;
  /** Rule/type identifier (e.g. the secretlint rule id). */
  readonly type: string;
}

/**
 * Port (DIP) — scans extracted payload files for secrets, in-memory. The
 * infrastructure adapter (secretlint) provides the curated ruleset. The raw
 * secret value is never returned nor logged (Unbreakable Rule 8 + security).
 */
export interface SecretScanner {
  scan(files: readonly PayloadFile[]): Promise<readonly SecretFinding[]>;
}
