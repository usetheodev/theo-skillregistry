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
const DEFAULT_STUCK_GRACE_MS = 600_000; // 10 min ≫ full retry span (avoid racing live retries)
const DEFAULT_BATCH_LIMIT = 100;

export interface WebhookReconcilerDeps {
  readonly endpointsStore: WebhookEndpointsStore;
  readonly queue: PgBoss;
  readonly logger: Logger;
  /** Only deliveries older than this are considered orphans (avoid racing live fan-out). */
  readonly graceMs?: number;
  /** Deliveries enqueued but non-terminal longer than this are re-driven (lost DLQ event). */
  readonly stuckGraceMs?: number;
  readonly batchLimit?: number;
  readonly clock?: Clock;
}

export interface WebhookReconciler {
  /** Claim + re-enqueue orphaned and stuck deliveries once. Returns how many were re-driven. */
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
  const stuckGraceMs = deps.stuckGraceMs ?? DEFAULT_STUCK_GRACE_MS;
  const batchLimit = deps.batchLimit ?? DEFAULT_BATCH_LIMIT;

  const reenqueue = async (d: { id: string; endpointId: string; payload: unknown }): Promise<void> => {
    const jobData: WebhookDeliveryJobData = {
      delivery_id: d.id,
      endpoint_id: d.endpointId,
      payload: d.payload as Record<string, unknown>,
    };
    await deps.queue.send(JOB_NAMES.WEBHOOK_DELIVERY, jobData, {
      ...WEBHOOK_DELIVERY_SEND_OPTIONS,
      singletonKey: d.id,
      singletonSeconds: WEBHOOK_DELIVERY_SINGLETON_SECONDS,
    });
  };

  return {
    async runOnce() {
      const now = clock.now().getTime();
      const orphans = await deps.endpointsStore.claimOrphanedDeliveries(new Date(now - graceMs), batchLimit);
      for (const orphan of orphans) {
        await reenqueue(orphan);
      }
      // Stuck = enqueued but never terminal (e.g. a lost dead-letter event). The
      // singletonKey dedups against any still-live original job.
      const stuck = await deps.endpointsStore.listStuckDeliveries(new Date(now - stuckGraceMs), batchLimit);
      for (const d of stuck) {
        await reenqueue(d);
      }
      const total = orphans.length + stuck.length;
      if (total > 0) {
        deps.logger.info(
          { orphans: orphans.length, stuck: stuck.length },
          'webhook reconciler re-drove deliveries',
        );
      }
      return total;
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
