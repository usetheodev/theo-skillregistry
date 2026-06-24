import { describe, expect, it } from 'vitest';

import { WEBHOOK_DELIVERY_SEND_OPTIONS } from '../../src/server/queue/queue.js';
import { toPgBossRetry, WEBHOOK_DELIVERY_BACKOFF } from '../../src/server/resilience/backoff.js';

describe('webhook delivery send-options (T2.2 / gap #3, ADR-2)', () => {
  it('delivery_job_retry_derived_from_explicit_policy', () => {
    const fromPolicy = toPgBossRetry(WEBHOOK_DELIVERY_BACKOFF);
    expect(WEBHOOK_DELIVERY_SEND_OPTIONS.retryBackoff).toBe(true);
    expect(WEBHOOK_DELIVERY_SEND_OPTIONS.retryDelay).toBe(fromPolicy.retryDelay);
    expect(WEBHOOK_DELIVERY_SEND_OPTIONS.retryLimit).toBe(fromPolicy.retryLimit);
  });
});
