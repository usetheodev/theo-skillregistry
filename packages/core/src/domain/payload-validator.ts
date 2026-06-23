export type PayloadErrorCode =
  | 'invalid_zip'
  | 'too_many_entries'
  | 'total_too_large'
  | 'file_too_large'
  | 'compression_ratio'
  | 'too_deep'
  | 'path_traversal'
  | 'symlink'
  | 'duplicate_entry'
  | 'missing_skill_md'
  | 'secret_detected';

/** Typed error for a payload that violates a safety guard (fail-loud). */
export class PayloadValidationError extends Error {
  readonly code: PayloadErrorCode;

  constructor(code: PayloadErrorCode, message: string) {
    super(message);
    this.name = 'PayloadValidationError';
    this.code = code;
  }
}

/** A readable text entry extracted from the zip (after all guards passed). */
export interface PayloadFile {
  readonly path: string;
  readonly content: string;
}

/** Result of a successful payload validation. */
export interface ValidatedPayload {
  /** Content of the root `SKILL.md`. */
  readonly skillMd: string;
  /** sha256 of the zip bytes (integrity + dedup). */
  readonly contentHash: string;
  /** Number of file entries (excluding directories). */
  readonly entryCount: number;
  /** All readable file entries (for downstream secret scanning). */
  readonly files: readonly PayloadFile[];
}

/**
 * Port (DIP) — validates an untrusted zip payload against the safety guards and
 * extracts SKILL.md + file contents. The infrastructure adapter (yauzl) enforces
 * the guards from central-directory metadata WITHOUT decompressing a failing
 * entry (zip-bomb safe).
 */
export interface PayloadValidator {
  validate(zip: Buffer): Promise<ValidatedPayload>;
}
