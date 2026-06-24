import { describe, expect, it, vi } from 'vitest';

import { createJsonLogger } from '../../src/server/logger.js';

/** Capture one structured log line written to stdout. */
function captureInfo(fields: Record<string, unknown>): string {
  const lines: string[] = [];
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
    lines.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString());
    return true;
  });
  createJsonLogger().info(fields, 'msg');
  spy.mockRestore();
  return lines.join('');
}

describe('createJsonLogger — sensitive-field scrubbing (T1.1 / gap #2)', () => {
  it('redacts_authorization_value', () => {
    const out = captureInfo({ authorization: 'Bearer abc' });
    expect(out).toContain('"authorization":"[REDACTED]"');
    expect(out).not.toContain('abc');
  });

  it('keeps_benign_field', () => {
    const out = captureInfo({ skill_id: 'pdf' });
    expect(out).toContain('"skill_id":"pdf"');
  });

  it('redacts_suffix_token_case_insensitive', () => {
    const out = captureInfo({ API_TOKEN: 'zzz' });
    expect(out).toContain('[REDACTED]');
    expect(out).not.toContain('zzz');
  });

  it('preserves_secret_findings', () => {
    // secret_findings carries finding TYPES (diagnostic), not secret values — must NOT be redacted (EC-3).
    const out = captureInfo({ secret_findings: ['config.env: AWSKey'] });
    expect(out).toContain('config.env');
    expect(out).not.toContain('[REDACTED]');
  });

  it('redacts_nested_sensitive_key', () => {
    const out = captureInfo({ context: { authorization: 'Bearer abc' } });
    expect(out).toContain('[REDACTED]');
    expect(out).not.toContain('abc');
  });

  it('preserves_nested_benign_field', () => {
    const out = captureInfo({ context: { skill_id: 'pdf' } });
    expect(out).toContain('"skill_id":"pdf"');
  });

  it('does_not_mangle_array_or_date_values', () => {
    // arrays and Date must not be recursed into / turned into objects
    const out = captureInfo({ items: ['a', 'b'], when: new Date('2026-01-01T00:00:00.000Z') });
    expect(out).toContain('["a","b"]');
    expect(out).toContain('2026-01-01T00:00:00.000Z');
  });

  it('handles_null_field_value', () => {
    const out = captureInfo({ maybe: null });
    expect(out).toContain('"maybe":null');
  });

  it('never_throws_on_a_circular_field_object', () => {
    // A logger MUST be fire-and-forget — a pathological field (circular ref) must not crash the caller.
    const circular: Record<string, unknown> = {};
    circular['self'] = circular;
    const out = captureInfo({ ctx: circular });
    // emits a safe fallback line (never throws), still carrying the message.
    expect(out).toContain('"msg":"msg"');
    expect(out).toContain('log_serialization_error');
  });
});
