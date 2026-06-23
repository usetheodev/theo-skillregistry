import { describe, expect, it, vi } from 'vitest';

import { createHttpWebhookSender } from '../../src/server/webhooks/webhook-sender.js';

describe('createHttpWebhookSender', () => {
  it('POSTs the body with headers, manual redirect, and a timeout signal, returning the status', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    const sender = createHttpWebhookSender({ fetch: fetchMock, timeoutMs: 5_000 });

    const res = await sender.send({
      url: 'https://example.com/wh',
      body: '{"a":1}',
      headers: { 'content-type': 'application/json', 'webhook-signature': 't=1&s=ff' },
    });

    expect(res).toEqual({ status: 204 });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://example.com/wh');
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"a":1}');
    expect(init.redirect).toBe('manual');
    expect((init.headers as Record<string, string>)['webhook-signature']).toBe('t=1&s=ff');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('propagates a fetch rejection (caller classifies retry)', async () => {
    const fetchMock = vi.fn(() => Promise.reject(new Error('ECONNRESET')));
    const sender = createHttpWebhookSender({ fetch: fetchMock });
    await expect(sender.send({ url: 'https://example.com/wh', body: '{}', headers: {} })).rejects.toThrow('ECONNRESET');
  });
});
