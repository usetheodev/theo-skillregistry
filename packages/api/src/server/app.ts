import { Hono } from 'hono';
import { type Pool } from 'pg';
import type PgBoss from 'pg-boss';

import { createDb } from './db.js';
import { registerHealthRoutes } from './handlers/health.js';
import { registerOperationsRoutes } from './handlers/operations.js';
import { registerSkillsRoutes } from './handlers/skills.js';
import { createJsonLogger, type Logger } from './logger.js';
import { createOperationsStore } from './store/operations-store.js';
import { createSkillsStore } from './store/skills-store.js';

export interface CreateAppOptions {
  readonly pool: Pool;
  readonly queue: PgBoss;
  readonly logger?: Logger;
}

/**
 * Build the Hono app with injected dependencies (DIP, ADR-3). Testable via
 * `app.request()` without opening a socket.
 */
export function createApp(opts: CreateAppOptions): Hono {
  const db = createDb(opts.pool);
  const skillsStore = createSkillsStore(db);
  const operationsStore = createOperationsStore(db);
  const logger = opts.logger ?? createJsonLogger();

  const app = new Hono();

  app.onError((err, c) => {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, 'unhandled error');
    return c.json({ error: 'internal_error' }, 500);
  });

  registerHealthRoutes(app);
  registerSkillsRoutes(app, { skillsStore, operationsStore, queue: opts.queue, logger });
  registerOperationsRoutes(app, { operationsStore });

  return app;
}
