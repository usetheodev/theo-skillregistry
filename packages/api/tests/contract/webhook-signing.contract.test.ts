import { describe, expect, it } from 'vitest';

import { signWebhookBody, verifyWebhookSignature } from '../../src/server/webhooks/webhook-signing.js';

const SECRET = 'whsec_test_0123456789';
const body = Buffer.from(JSON.stringify({ event_id: 'e1', event_type: 'skill.created' }));
const NOW = 1_700_000_000;

describe('webhook signing (HMAC-SHA256, Inngest scheme)', () => {
  it('round-trips a freshly signed body', () => {
    const header = signWebhookBody(SECRET, body, NOW);
    expect(header).toMatch(/^t=\d+&s=[0-9a-f]{64}$/);
    expect(verifyWebhookSignature(SECRET, body, header, NOW)).toEqual({ valid: true });
  });

  it('rejects a tampered body (mismatch)', () => {
    const header = signWebhookBody(SECRET, body, NOW);
    const tampered = Buffer.from(body.toString().replace('created', 'deleted'));
    expect(verifyWebhookSignature(SECRET, tampered, header, NOW)).toEqual({ valid: false, reason: 'mismatch' });
  });

  it('rejects a wrong secret (mismatch)', () => {
    const header = signWebhookBody(SECRET, body, NOW);
    expect(verifyWebhookSignature('whsec_other', body, header, NOW)).toEqual({ valid: false, reason: 'mismatch' });
  });

  it('rejects a timestamp outside the replay window (expired)', () => {
    const header = signWebhookBody(SECRET, body, NOW);
    expect(verifyWebhookSignature(SECRET, body, header, NOW + 301)).toEqual({ valid: false, reason: 'expired' });
    expect(verifyWebhookSignature(SECRET, body, header, NOW - 301)).toEqual({ valid: false, reason: 'expired' });
  });

  it('rejects malformed headers without throwing', () => {
    for (const h of ['', 't=&s=', 's=abc', 't=abc&s=' + 'f'.repeat(64), 't=1700000000&s=zz', 't=1700000000&s=' + 'f'.repeat(10)]) {
      expect(verifyWebhookSignature(SECRET, body, h, NOW)).toEqual({ valid: false, reason: 'malformed' });
    }
  });
});
