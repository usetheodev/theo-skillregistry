/**
 * Webhook signing — HMAC-SHA256 over `body || ts_str` with a per-endpoint secret.
 * Header format `t=<unix_seconds>&s=<hex_signature>` (Inngest scheme). Adapted
 * verbatim from theo-rag (Unbreakable Rule 9 — do not reinvent crypto).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

const REPLAY_WINDOW_SECONDS = 300; // ±5 min
const SHA256_HEX_LENGTH = 64;
const HEX_RE = /^[0-9a-f]+$/;

export function signWebhookBody(secret: string, body: Buffer, tsSeconds: number): string {
  const tsStr = String(tsSeconds);
  const mac = createHmac('sha256', secret).update(body).update(tsStr).digest('hex');
  return `t=${tsStr}&s=${mac}`;
}

export type VerifyResult =
  | { valid: true }
  | { valid: false; reason: 'malformed' | 'expired' | 'mismatch' };

// NOTE: exported for webhook CONSUMERS (subscribers verifying our signatures) and
// the test suite — the registry itself only signs, so there is no in-registry
// production caller by design. Do not flag as a dead export.

export function verifyWebhookSignature(
  secret: string,
  body: Buffer,
  header: string,
  nowSeconds: number,
): VerifyResult {
  const params = new URLSearchParams(header);
  const tsParam = params.get('t');
  const sigParam = params.get('s');
  if (tsParam === null || sigParam === null || tsParam === '' || sigParam === '') {
    return { valid: false, reason: 'malformed' };
  }

  const ts = Number.parseInt(tsParam, 10);
  if (!Number.isFinite(ts) || String(ts) !== tsParam) {
    return { valid: false, reason: 'malformed' };
  }

  // Length + hex guard BEFORE timingSafeEqual — Buffer.from(<non-hex>,'hex')
  // silently truncates and would cause a RangeError on a length mismatch.
  if (sigParam.length !== SHA256_HEX_LENGTH || !HEX_RE.test(sigParam)) {
    return { valid: false, reason: 'malformed' };
  }

  // Math.abs clamps both directions — a future-skewed `t` cannot widen the window.
  if (Math.abs(nowSeconds - ts) > REPLAY_WINDOW_SECONDS) {
    return { valid: false, reason: 'expired' };
  }

  const expected = createHmac('sha256', secret).update(body).update(tsParam).digest();
  const received = Buffer.from(sigParam, 'hex');
  if (!timingSafeEqual(expected, received)) {
    return { valid: false, reason: 'mismatch' };
  }
  return { valid: true };
}
