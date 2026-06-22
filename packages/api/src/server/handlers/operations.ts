import { type Hono } from 'hono';

import { type OperationsStore } from '../store/operations-store.js';

export interface OperationsRoutesDeps {
  readonly operationsStore: OperationsStore;
}

export function registerOperationsRoutes(app: Hono, deps: OperationsRoutesDeps): void {
  // GET /v1/operations/:id
  app.get('/v1/operations/:id', async (c) => {
    const operation = await deps.operationsStore.get(c.req.param('id'));
    if (operation === undefined) {
      return c.json({ error: 'not_found' }, 404);
    }
    return c.json(operation, 200);
  });
}
