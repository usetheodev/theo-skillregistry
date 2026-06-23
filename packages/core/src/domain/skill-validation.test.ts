import { describe, expect, it } from 'vitest';

import { type PayloadValidator, PayloadValidationError, type ValidatedPayload } from './payload-validator.js';
import { type SecretFinding, type SecretScanner } from './secret-scanner.js';
import { validateSkillPayload } from './skill-validation.js';

const VALID_MD = `---\nname: my-skill\ndescription: does a useful thing\n---\n# my-skill\n`;

function validated(skillMd: string): ValidatedPayload {
  return { skillMd, contentHash: 'h', entryCount: 1, files: [{ path: 'SKILL.md', content: skillMd }] };
}

const okValidator = (skillMd: string): PayloadValidator => ({ validate: () => Promise.resolve(validated(skillMd)) });
const throwingValidator = (code: PayloadValidationError['code']): PayloadValidator => ({
  validate: () => Promise.reject(new PayloadValidationError(code, `zip ${code}`)),
});
const noSecrets: SecretScanner = { scan: () => Promise.resolve([]) };
const secretFinding: SecretFinding = { file: 'SKILL.md', type: 'AWSAccessKeyID' };
const findsSecret: SecretScanner = { scan: () => Promise.resolve([secretFinding]) };

describe('validateSkillPayload (shared server+CLI checker)', () => {
  it('returns ok with skill fields for a valid payload', async () => {
    const r = await validateSkillPayload(Buffer.from('z'), { payloadValidator: okValidator(VALID_MD), secretScanner: noSecrets });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.name).toBe('my-skill');
      expect(r.description).toBe('does a useful thing');
    }
  });

  it('reports a zip-safety error with the payload code (no throw)', async () => {
    const r = await validateSkillPayload(Buffer.from('z'), { payloadValidator: throwingValidator('path_traversal'), secretScanner: noSecrets });
    expect(r).toMatchObject({ ok: false, code: 'path_traversal' });
  });

  it('reports a frontmatter error (schema_invalid) for an invalid name', async () => {
    const badMd = `---\nname: Invalid Name\ndescription: x\n---\n# x\n`;
    const r = await validateSkillPayload(Buffer.from('z'), { payloadValidator: okValidator(badMd), secretScanner: noSecrets });
    expect(r).toMatchObject({ ok: false, code: 'schema_invalid' });
  });

  it('reports secret_detected with per-finding details', async () => {
    const r = await validateSkillPayload(Buffer.from('z'), { payloadValidator: okValidator(VALID_MD), secretScanner: findsSecret });
    expect(r).toMatchObject({ ok: false, code: 'secret_detected' });
    if (!r.ok) {
      expect(r.details).toEqual(['SKILL.md: AWSAccessKeyID']);
    }
  });

  it('runs checks in order: zip BEFORE frontmatter (zip error wins)', async () => {
    const r = await validateSkillPayload(Buffer.from('z'), { payloadValidator: throwingValidator('missing_skill_md'), secretScanner: findsSecret });
    expect(r).toMatchObject({ ok: false, code: 'missing_skill_md' }); // not secret/frontmatter
  });
});
