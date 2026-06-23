import type PgBoss from 'pg-boss';

import { type Logger } from '../logger.js';
import {
  JOB_NAMES,
  type WebhookDeliveryJobData,
  WEBHOOK_DELIVERY_SEND_OPTIONS,
  WEBHOOK_DELIVERY_SINGLETON_SECONDS,
} from '../queue/queue.js';
import { type WebhookEndpointsStore } from '../store/webhook-endpoints-store.js';

export interface Clock {
  now(): Date;
}

const systemClock: Clock = { now: () => new Date() };

const DEFAULT_GRACE_MS = 60_000;
const DEFAULT_BATCH_LIMIT = 100;

export interface WebhookReconcilerDeps {
  readonly endpointsStore: WebhookEndpointsStore;
  readonly queue: PgBoss;
  readonly logger: Logger;
  /** Only deliveries older than this are considered orphans (avoid racing live fan-out). */
  readonly graceMs?: number;
  readonly batchLimit?: number;
  readonly clock?: Clock;
}

export interface WebhookReconciler {
  /** Claim + re-enqueue orphaned deliveries once. Returns how many were recovered. */
  runOnce(): Promise<number>;
}

/**
 * Recovers deliveries that were recorded in the outbox but never enqueued (a crash
 * between recordDelivery and queue.send). claimOrphanedDeliveries atomically stamps
 * enqueued_at under FOR UPDATE SKIP LOCKED, so concurrent reconcilers never
 * double-claim; the job singletonKey dedups against any in-flight original send.
 */
export function createWebhookReconciler(deps: WebhookReconcilerDeps): WebhookReconciler {
  const clock = deps.clock ?? systemClock;
  const graceMs = deps.graceMs ?? DEFAULT_GRACE_MS;
  const batchLimit = deps.batchLimit ?? DEFAULT_BATCH_LIMIT;
  return {
    async runOnce() {
      const cutoff = new Date(clock.now().getTime() - graceMs);
      const orphans = await deps.endpointsStore.claimOrphanedDeliveries(cutoff, batchLimit);
      for (const orphan of orphans) {
        const jobData: WebhookDeliveryJobData = {
          delivery_id: orphan.id,
          endpoint_id: orphan.endpointId,
          payload: orphan.payload as Record<string, unknown>,
        };
        await deps.queue.send(JOB_NAMES.WEBHOOK_DELIVERY, jobData, {
          ...WEBHOOK_DELIVERY_SEND_OPTIONS,
          singletonKey: orphan.id,
          singletonSeconds: WEBHOOK_DELIVERY_SINGLETON_SECONDS,
        });
      }
      if (orphans.length > 0) {
        deps.logger.info({ recovered: orphans.length }, 'webhook reconciler recovered orphaned deliveries');
      }
      return orphans.length;
    },
  };
}

/** Start the reconciler on an interval; returns a stop function (clears the timer). */
export function startWebhookReconciler(reconciler: WebhookReconciler, intervalMs: number, logger: Logger): () => void {
  const timer = setInterval(() => {
    reconciler.runOnce().catch((err: unknown) => {
      logger.error({ err: err instanceof Error ? err.message : String(err) }, 'webhook reconciler sweep failed');
    });
  }, intervalMs);
  timer.unref?.();
  return () => {
    clearInterval(timer);
  };
}
