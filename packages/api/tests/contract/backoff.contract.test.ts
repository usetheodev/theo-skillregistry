import { describe, expect, it } from 'vitest';

import {
  type BackoffPolicy,
  computeBackoff,
  toPgBossRetry,
  WEBHOOK_DELIVERY_BACKOFF,
} from '../../src/server/resilience/backoff.js';

const policy = (rng: () => number): BackoffPolicy => ({ baseMs: 100, capMs: 1_000, retryLimit: 5, rng });

describe('backoff policy (T2.1 / gap #3, ADR-2)', () => {
  it('grows_exponentially_before_cap', () => {
    const p = policy(() => 1); // jitter at the ceiling
    expect([computeBackoff(0, p), computeBackoff(1, p), computeBackoff(2, p)]).toEqual([100, 200, 400]);
  });

  it('is_bounded_by_cap', () => {
    expect(computeBackoff(20, policy(() => 1))).toEqual(1_000); // 100·2^20 ≫ cap → capped
  });

  it('full_jitter_floor_zero', () => {
    expect(computeBackoff(3, policy(() => 0))).toEqual(0);
  });

  it('large_attempt_returns_cap_never_infinity_or_nan', () => {
    const v = computeBackoff(64, policy(() => 1));
    expect(v).toEqual(1_000);
    expect(Number.isFinite(v)).toBe(true);
  });

  it('negative_attempt_clamped_to_zero', () => {
    expect(computeBackoff(-1, policy(() => 1))).toEqual(computeBackoff(0, policy(() => 1)));
  });

  it('toPgBossRetry_maps_seconds_and_backoff', () => {
    expect(toPgBossRetry(WEBHOOK_DELIVERY_BACKOFF)).toEqual({ retryLimit: 5, retryDelay: 2, retryBackoff: true });
  });
});
