import { randomBytes } from 'node:crypto';

/** Minimal trace-context seam (ADR-1). W3C `traceparent`-compatible trace-id
 * (16 bytes / 32 hex). NOT the OpenTelemetry SDK — M8 adopts this seam and adds
 * exporters on top, so we never double-instrument. */

const TRACE_ID_RE = /^[0-9a-f]{32}$/;
const TRACEPARENT_RE = /^00-([0-9a-f]{32})-[0-9a-f]{16}-[0-9a-f]{2}$/;
const ALL_ZERO = '0'.repeat(32);

/** Generate a fresh 32-hex-char trace id (W3C trace-id shape). */
export function newTraceId(): string {
  return randomBytes(16).toString('hex');
}

/** Extract the trace-id from a W3C `traceparent` header, or undefined when the
 * header is absent / malformed / carries the forbidden all-zero trace-id. */
export function parseTraceparent(header: string | undefined): string | undefined {
  if (header === undefined) {
    return undefined;
  }
  const match = TRACEPARENT_RE.exec(header.trim());
  if (match === null) {
    return undefined;
  }
  const traceId = match[1];
  if (traceId === undefined || traceId === ALL_ZERO || !TRACE_ID_RE.test(traceId)) {
    return undefined;
  }
  return traceId;
}

/** Resolve a trace id from an incoming header, generating a fresh one when the
 * header is absent or malformed (EC-4 — never echo a bad header). */
export function resolveTraceId(traceparentHeader: string | undefined): string {
  return parseTraceparent(traceparentHeader) ?? newTraceId();
}
