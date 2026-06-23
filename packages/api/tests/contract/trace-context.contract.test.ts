import { describe, expect, it } from 'vitest';

import {
  newTraceId,
  parseTraceparent,
  resolveTraceId,
} from '../../src/server/observability/trace-context.js';

const HEX32 = /^[0-9a-f]{32}$/;

describe('trace-context (T1.2 / gap #1, ADR-1)', () => {
  it('newTraceId_returns_32_lowercase_hex', () => {
    expect(newTraceId()).toMatch(HEX32);
  });

  it('newTraceId_is_unique_per_call', () => {
    expect(newTraceId()).not.toEqual(newTraceId());
  });

  it('parseTraceparent_extracts_traceid', () => {
    const tid = 'abcdef0123456789abcdef0123456789';
    expect(parseTraceparent(`00-${tid}-0123456789abcdef-01`)).toEqual(tid);
  });

  it('parseTraceparent_returns_undefined_on_malformed', () => {
    expect(parseTraceparent('garbage')).toBeUndefined();
    expect(parseTraceparent(undefined)).toBeUndefined();
    expect(parseTraceparent(`00-${'0'.repeat(32)}-0123456789abcdef-01`)).toBeUndefined(); // all-zero forbidden
  });

  it('resolveTraceId_generates_when_header_malformed_or_absent', () => {
    expect(resolveTraceId('garbage')).toMatch(HEX32); // EC-4 — never echo a bad header
    expect(resolveTraceId(undefined)).toMatch(HEX32);
  });

  it('resolveTraceId_propagates_valid_incoming_traceid', () => {
    const tid = 'abcdef0123456789abcdef0123456789';
    expect(resolveTraceId(`00-${tid}-0123456789abcdef-01`)).toEqual(tid);
  });
});
