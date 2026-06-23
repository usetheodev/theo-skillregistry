import { describe, expect, it } from 'vitest';

/** Canonical fast-filter regex — MUST stay in sync with `rules/testing.md § 7`
 * and the `vitest -t` selection command (M9 / gap #6). */
const FAST_FILTER = /^(?!.*\[slow\])(?!.*\[live\]).*/;

describe('test marker fast-filter (T4.1 / gap #6)', () => {
  it('marker_selection_includes_normal_tests', () => {
    expect(FAST_FILTER.test('does a normal thing')).toBe(true);
  });

  it('marker_selection_excludes_slow', () => {
    expect(FAST_FILTER.test('[slow] reindexes 10k skills')).toBe(false);
  });

  it('marker_selection_excludes_live', () => {
    expect(FAST_FILTER.test('[live] embeds via OpenAI')).toBe(false);
  });
});
