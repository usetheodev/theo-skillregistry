/** Minimal structured logger (JSON lines on stdout/stderr). The runtime metric
 * surface for M0 — every operation emits one structured line (wiring triad). */
export interface Logger {
  info(fields: Readonly<Record<string, unknown>>, msg: string): void;
  error(fields: Readonly<Record<string, unknown>>, msg: string): void;
}

function write(stream: NodeJS.WriteStream, level: string, fields: Readonly<Record<string, unknown>>, msg: string): void {
  const line = JSON.stringify({ level, msg, ...fields, ts: new Date().toISOString() });
  stream.write(`${line}\n`);
}

export function createJsonLogger(): Logger {
  return {
    info: (fields, msg) => { write(process.stdout, 'info', fields, msg); },
    error: (fields, msg) => { write(process.stderr, 'error', fields, msg); },
  };
}

/** No-op logger for tests that don't assert on logs. */
export function createNoopLogger(): Logger {
  return { info: () => undefined, error: () => undefined };
}
