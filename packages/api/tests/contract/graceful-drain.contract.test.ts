import { describe, expect, it } from 'vitest';

import { createNoopLogger } from '../../src/server/logger.js';
import { setupGracefulDrain } from '../../src/server/queue/graceful-drain.js';

interface Fake {
  proc: NodeJS.Process;
  handlers: Record<string, () => void>;
  exitCodes: number[];
}

function fakeProcess(): Fake {
  const handlers: Record<string, () => void> = {};
  const exitCodes: number[] = [];
  const proc = {
    once(event: string, cb: () => void) {
      handlers[event] = cb;
      return proc;
    },
    exit(code: number) {
      exitCodes.push(code);
    },
  } as unknown as NodeJS.Process;
  return { proc, handlers, exitCodes };
}

describe('setupGracefulDrain', () => {
  it('runs drainables in declared order then exits 0', async () => {
    const { proc, handlers, exitCodes } = fakeProcess();
    const order: string[] = [];
    setupGracefulDrain({
      drainables: [
        () => { order.push('server'); return Promise.resolve(); },
        () => { order.push('queue'); return Promise.resolve(); },
        () => { order.push('pool'); return Promise.resolve(); },
      ],
      timeoutMs: 1000,
      logger: createNoopLogger(),
      processRef: proc,
    });

    handlers['SIGTERM']?.();
    await expect.poll(() => exitCodes.length).toBe(1);
    expect(order).toEqual(['server', 'queue', 'pool']);
    expect(exitCodes[0]).toBe(0);
  });

  it('is idempotent — a second signal does not re-run drainables', async () => {
    const { proc, handlers, exitCodes } = fakeProcess();
    let calls = 0;
    setupGracefulDrain({
      drainables: [() => { calls += 1; return Promise.resolve(); }],
      timeoutMs: 1000,
      logger: createNoopLogger(),
      processRef: proc,
    });

    handlers['SIGTERM']?.();
    handlers['SIGTERM']?.();
    await expect.poll(() => exitCodes.length).toBeGreaterThanOrEqual(1);
    expect(calls).toBe(1);
  });

  it('exits 1 when a drainable exceeds the deadline', async () => {
    const { proc, handlers, exitCodes } = fakeProcess();
    setupGracefulDrain({
      drainables: [() => new Promise<void>(() => { /* never resolves */ })],
      timeoutMs: 20,
      logger: createNoopLogger(),
      processRef: proc,
    });

    handlers['SIGINT']?.();
    await expect.poll(() => exitCodes.length, { timeout: 1000 }).toBeGreaterThanOrEqual(1);
    expect(exitCodes).toContain(1);
  });
});
