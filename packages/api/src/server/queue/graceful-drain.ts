import { type Logger } from '../logger.js';

export interface SetupGracefulDrainOptions {
  /** Drain steps executed in declared order. For M0: server.close → queue.stop → pool.end. */
  readonly drainables: readonly (() => Promise<void>)[];
  readonly timeoutMs: number;
  readonly logger: Logger;
  /** Injectable process ref for tests. */
  readonly processRef?: NodeJS.Process;
}

/**
 * Install SIGTERM/SIGINT handlers that drain resources in order, bounded by a
 * deadline. Mirrors the validated theo-rag pattern. Idempotent: a second signal
 * is a no-op while draining.
 */
export function setupGracefulDrain(opts: SetupGracefulDrainOptions): void {
  const proc = opts.processRef ?? process;
  let draining = false;

  const drain = async (signal: string): Promise<void> => {
    if (draining) {
      return;
    }
    draining = true;
    opts.logger.info({ signal }, 'graceful drain start');

    const timer = setTimeout(() => {
      opts.logger.error({ timeoutMs: opts.timeoutMs }, 'graceful drain timeout exceeded');
      proc.exit(1);
    }, opts.timeoutMs);

    try {
      for (const fn of opts.drainables) {
        await fn();
      }
      clearTimeout(timer);
      opts.logger.info({}, 'graceful drain complete');
      proc.exit(0);
    } catch (err) {
      clearTimeout(timer);
      opts.logger.error({ err: err instanceof Error ? err.message : String(err) }, 'graceful drain failed');
      proc.exit(1);
    }
  };

  proc.once('SIGTERM', () => { void drain('SIGTERM'); });
  proc.once('SIGINT', () => { void drain('SIGINT'); });
}
