import { serve } from '@hono/node-server';

import { createApp } from './server/app.js';
import { createPool } from './server/db.js';
import { createJsonLogger } from './server/logger.js';
import { setupGracefulDrain } from './server/queue/graceful-drain.js';
import { createQueue, JOB_NAMES } from './server/queue/queue.js';
import { buildWorkerHandlers } from './server/wiring.js';
import { registerWorker } from './server/worker.js';

const SHUTDOWN_DEADLINE_MS = 30_000;

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
  const handlers = buildWorkerHandlers(pool, logger);
  await registerWorker({ queue, createHandler: handlers.createHandler, updateHandler: handlers.updateHandler });

  const app = createApp({ pool, queue, logger });
  const server = serve({ fetch: app.fetch, port }, (info) => {
    logger.info({ port: info.port }, '@usetheo/skillregistry-api listening');
  });

  // Drain order is non-negotiable: server.close → queue.stop → pool.end.
  setupGracefulDrain({
    drainables: [
      () => new Promise<void>((resolve) => { server.close(() => { resolve(); }); }),
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
