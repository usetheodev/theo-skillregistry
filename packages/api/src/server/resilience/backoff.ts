/** Explicit exponential-backoff-with-full-jitter policy (M9 / gap #3, ADR-2).
 *
 * `computeBackoff` is the pure, deterministic (RNG-injectable) delay function — the
 * unit test pins its schedule. At runtime pg-boss applies EXPONENTIAL backoff from
 * `retryDelay` (it does not call this per attempt), so queue-level delays are
 * exponential-without-jitter; `computeBackoff` is the documented policy used by any
 * in-handler retry path and is what `toPgBossRetry` derives the base from. */

export interface BackoffPolicy {
  /** Base delay in milliseconds (attempt 0 ceiling). */
  readonly baseMs: number;
  /** Hard ceiling in milliseconds. */
  readonly capMs: number;
  /** Max retry attempts (carried into pg-boss `retryLimit`). */
  readonly retryLimit: number;
  /** Injectable RNG in [0,1) — default Math.random; injected in tests for determinism. */
  readonly rng?: () => number;
}

/** Full jitter: random(0, min(capMs, baseMs · 2^attempt)). Bounded, never NaN/Infinity. */
export function computeBackoff(attempt: number, policy: BackoffPolicy): number {
  const safeAttempt = attempt > 0 ? attempt : 0; // clamp negatives to 0
  const exponential = policy.baseMs * 2 ** safeAttempt; // Infinity for huge attempts — clamped next
  const ceiling = Math.min(policy.capMs, exponential);
  const rng = policy.rng ?? Math.random;
  return Math.floor(rng() * ceiling);
}

/** Map the policy to pg-boss SendOptions (retryDelay is in SECONDS). */
export function toPgBossRetry(policy: BackoffPolicy): {
  retryLimit: number;
  retryDelay: number;
  retryBackoff: true;
} {
  return {
    retryLimit: policy.retryLimit,
    retryDelay: Math.max(1, Math.round(policy.baseMs / 1000)),
    retryBackoff: true,
  };
}

/** The webhook-delivery backoff policy: 2s base, 5min cap, 5 attempts. */
export const WEBHOOK_DELIVERY_BACKOFF: BackoffPolicy = Object.freeze({
  baseMs: 2_000,
  capMs: 300_000,
  retryLimit: 5,
});
