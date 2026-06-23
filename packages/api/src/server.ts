import { serve } from '@hono/node-server';

import { createApp } from './server/app.js';
import { createDb, createPool } from './server/db.js';
import { createJsonLogger } from './server/logger.js';
import { setupGracefulDrain } from './server/queue/graceful-drain.js';
import { createQueue, JOB_NAMES, WEBHOOK_DELIVERY_DLQ_QUEUE_NAME } from './server/queue/queue.js';
import { createWebhookEndpointsStore } from './server/store/webhook-endpoints-store.js';
import {
  createWebhookDeliveryHandler,
  createWebhookDlqHandler,
  registerWebhookWorker,
} from './server/webhooks/webhook-delivery-worker.js';
import { createWebhookEnqueuer } from './server/webhooks/webhook-enqueuer.js';
import { createWebhookReconciler, startWebhookReconciler } from './server/webhooks/webhook-reconciler.js';
import { createHttpWebhookSender } from './server/webhooks/webhook-sender.js';
import { buildWorkerHandlers } from './server/wiring.js';
import { registerWorker } from './server/worker.js';

const SHUTDOWN_DEADLINE_MS = 30_000;
const RECONCILER_INTERVAL_MS = 30_000;

async function main(): Promise<void> {
  const logger = createJsonLogger();
  const uri = process.env['THEOSKILL_PG_URI'];
  if (uri === undefined || uri === '') {
    logger.error({}, 'THEOSKILL_PG_URI is required — refusing to start');
    process.exit(1);
    return;
  }
  const port = Number(process.env['PORT'] ?? '8080');

  const pool = createPool(uri);
  const queue = createQueue(uri);

  // pg-boss MUST start before serve() — bootstraps its schema (pg-boss v10).
  await queue.start();
  await queue.createQueue(JOB_NAMES.CREATE_SKILL);
  await queue.createQueue(JOB_NAMES.UPDATE_SKILL);
  await queue.createQueue(JOB_NAMES.DELETE_SKILL);
  await queue.createQueue(JOB_NAMES.WEBHOOK_DELIVERY);
  await queue.createQueue(WEBHOOK_DELIVERY_DLQ_QUEUE_NAME);

  const endpointsStore = createWebhookEndpointsStore(createDb(pool));

  // onTerminal fires the webhook fan-out when an operation completes.
  const enqueuer = createWebhookEnqueuer({ endpointsStore, queue, logger });
  const handlers = buildWorkerHandlers(pool, logger, enqueuer);
  await registerWorker({
    queue,
    createHandler: handlers.createHandler,
    updateHandler: handlers.updateHandler,
    deleteHandler: handlers.deleteHandler,
  });

  // Webhook delivery worker + dead-letter consumer.
  const sender = createHttpWebhookSender({ fetch: globalThis.fetch });
  await registerWebhookWorker({
    queue,
    deliveryHandler: createWebhookDeliveryHandler({ endpointsStore, sender, logger }),
    dlqHandler: createWebhookDlqHandler({ endpointsStore, logger }),
  });

  // Reconciler — periodically recovers orphaned (un-enqueued) deliveries.
  const reconciler = createWebhookReconciler({ endpointsStore, queue, logger });
  const stopReconciler = startWebhookReconciler(reconciler, RECONCILER_INTERVAL_MS, logger);

  const app = createApp({ pool, queue, logger });
  const server = serve({ fetch: app.fetch, port }, (info) => {
    logger.info({ port: info.port }, '@usetheo/skillregistry-api listening');
  });

  // Drain order is non-negotiable: server.close → reconciler → queue.stop → pool.end.
  setupGracefulDrain({
    drainables: [
      () => new Promise<void>((resolve) => { server.close(() => { resolve(); }); }),
      () => { stopReconciler(); return Promise.resolve(); },
      async () => { await queue.stop(); },
      async () => { await pool.end(); },
    ],
    timeoutMs: SHUTDOWN_DEADLINE_MS,
    logger,
  });
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`${JSON.stringify({ level: 'error', msg: 'boot failed', err: message })}\n`);
  process.exit(1);
});
