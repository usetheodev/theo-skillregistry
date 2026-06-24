/** Minimal structured logger (JSON lines on stdout/stderr). The runtime metric
 * surface for M0 — every operation emits one structured line (wiring triad). */
export interface Logger {
  info(fields: Readonly<Record<string, unknown>>, msg: string): void;
  error(fields: Readonly<Record<string, unknown>>, msg: string): void;
}

const SENSITIVE_KEYS = new Set(['authorization', 'password', 'token', 'secret']);
const SENSITIVE_SUFFIXES = ['_token', '_secret', '_key', '_password'];

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_KEYS.has(lower) || SENSITIVE_SUFFIXES.some((s) => lower.endsWith(s));
}

/** A plain object we should recurse into — NOT an array, Date, null, or class instance. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

/** Redact values whose key is sensitive — exact match OR sensitive suffix (case-insensitive).
 * Recurses into plain-object values (bounded by the object's own depth — simpler than a depth
 * counter) so a nested sensitive key is also redacted; arrays, Date, null are left intact.
 * `secret_findings` (diagnostic finding TYPES, not values) is intentionally NOT matched. */
function scrubFields(fields: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (isSensitiveKey(key)) {
      out[key] = '[REDACTED]';
    } else if (isPlainObject(value)) {
      out[key] = scrubFields(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function write(stream: NodeJS.WriteStream, level: string, fields: Readonly<Record<string, unknown>>, msg: string): void {
  const line = JSON.stringify({ level, msg, ...scrubFields(fields), ts: new Date().toISOString() });
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
