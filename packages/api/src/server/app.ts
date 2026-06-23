import { type PayloadValidator, type SecretScanner } from '@usetheo/skillregistry';
import { Hono } from 'hono';
import { type Pool } from 'pg';
import type PgBoss from 'pg-boss';

import { createDb } from './db.js';
import { registerHealthRoutes } from './handlers/health.js';
import { registerOperationsRoutes } from './handlers/operations.js';
import { registerSkillsRoutes } from './handlers/skills.js';
import { createJsonLogger, type Logger } from './logger.js';
import { createSecretlintScanner } from './payload/secretlint-scanner.js';
import { createYauzlPayloadValidator } from './payload/yauzl-validator.js';
import { createOperationsStore } from './store/operations-store.js';
import { createRevisionsStore } from './store/revisions-store.js';
import { createSkillsStore } from './store/skills-store.js';

const DEFAULT_RESERVATION_HOURS = 24;

export interface CreateAppOptions {
  readonly pool: Pool;
  readonly queue: PgBoss;
  readonly logger?: Logger;
  readonly payloadValidator?: PayloadValidator;
  readonly secretScanner?: SecretScanner;
  readonly reservationHours?: number;
}

/** Build the Hono app with injected dependencies (DIP, ADR-3). */
export function createApp(opts: CreateAppOptions): Hono {
  const db = createDb(opts.pool);
  const logger = opts.logger ?? createJsonLogger();

  const app = new Hono();
  app.onError((err, c) => {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, 'unhandled error');
    return c.json({ error: 'internal_error' }, 500);
  });

  registerHealthRoutes(app);
  registerSkillsRoutes(app, {
    skillsStore: createSkillsStore(db),
    revisionsStore: createRevisionsStore(db),
    operationsStore: createOperationsStore(db),
    queue: opts.queue,
    payloadValidator: opts.payloadValidator ?? createYauzlPayloadValidator(),
    secretScanner: opts.secretScanner ?? createSecretlintScanner(),
    logger,
    reservationHours: opts.reservationHours ?? envReservationHours(),
  });
  registerOperationsRoutes(app, { operationsStore: createOperationsStore(db) });

  return app;
}

function envReservationHours(): number {
  const raw = Number(process.env['THEOSKILL_ID_RESERVATION_HOURS'] ?? '');
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_RESERVATION_HOURS;
}
