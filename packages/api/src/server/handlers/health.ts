import { type Hono } from 'hono';

/** Liveness probe. Cheap, dependency-free. */
export function registerHealthRoutes(app: Hono): void {
  app.get('/v1/health', (c) => c.json({ status: 'ok' }, 200));
}
