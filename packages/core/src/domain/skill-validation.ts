/**
 * Single source of truth for skill-payload validation (M5). The server boundary
 * (`ingestPayload`) AND the dev CLI both call this so their checks can never
 * diverge (DRY — ROADMAP M5 risk #1). Runs the four checks in order:
 *   1. zip-safety  (PayloadValidator → yauzl: limits, traversal, symlink, ratio)
 *   2. frontmatter (parseFrontmatter: Theokit name/description rules)
 *   3. secret scan (SecretScanner → secretlint preset-recommend)
 * Returns a STRUCTURED result (does not throw on a rule violation) so the CLI can
 * render clear per-rule errors and the server can map to HTTP 400.
 */
import { parseFrontmatter, SkillFrontmatterError } from './frontmatter.js';
import { type PayloadValidator, PayloadValidationError, type ValidatedPayload } from './payload-validator.js';
import { type SecretScanner } from './secret-scanner.js';

export interface SkillValidationDeps {
  readonly payloadValidator: PayloadValidator;
  readonly secretScanner: SecretScanner;
}

export interface SkillValidationOk {
  readonly ok: true;
  readonly name: string;
  readonly description: string;
  readonly frontmatter: Record<string, unknown>;
  readonly validated: ValidatedPayload;
}

export interface SkillValidationFail {
  readonly ok: false;
  /** Stable rule code (same vocabulary the server returns as the 400 body). */
  readonly code: string;
  readonly message: string;
  /** Optional per-item detail (e.g. one line per secret finding). */
  readonly details?: readonly string[];
}

export type SkillValidationResult = SkillValidationOk | SkillValidationFail;

export async function validateSkillPayload(
  zip: Buffer,
  deps: SkillValidationDeps,
): Promise<SkillValidationResult> {
  // 1. zip-safety
  let validated: ValidatedPayload;
  try {
    validated = await deps.payloadValidator.validate(zip);
  } catch (err) {
    if (err instanceof PayloadValidationError) {
      return { ok: false, code: err.code, message: err.message };
    }
    throw err;
  }

  // 2. frontmatter (Theokit rules)
  let name: string;
  let description: string;
  let frontmatter: Record<string, unknown>;
  try {
    const fm = parseFrontmatter(validated.skillMd);
    name = fm.name;
    description = fm.description;
    frontmatter = { ...fm.fields };
  } catch (err) {
    if (err instanceof SkillFrontmatterError) {
      return { ok: false, code: err.code, message: err.message };
    }
    throw err;
  }

  // 3. secret scan
  const findings = await deps.secretScanner.scan(validated.files);
  if (findings.length > 0) {
    return {
      ok: false,
      code: 'secret_detected',
      message: `secret detected in ${findings.length} location(s)`,
      details: findings.map((f) => `${f.file}: ${f.type}`),
    };
  }

  return { ok: true, name, description, frontmatter, validated };
}
