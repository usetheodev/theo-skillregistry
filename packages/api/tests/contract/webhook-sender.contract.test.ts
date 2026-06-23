import { createServer, type IncomingMessage, type Server } from 'node:http';
import { type AddressInfo } from 'node:net';

import { afterEach, describe, expect, it } from 'vitest';

import { UrlSafetyError } from '../../src/server/webhooks/url-safety.js';
import { createHttpWebhookSender } from '../../src/server/webhooks/webhook-sender.js';

const loopbackResolver = {
  resolve4: () => Promise.resolve(['127.0.0.1']),
  resolve6: () => Promise.resolve([] as string[]),
};
const privateResolver = {
  resolve4: () => Promise.resolve(['10.0.0.5']),
  resolve6: () => Promise.resolve([] as string[]),
};

interface Captured {
  method: string | undefined;
  url: string | undefined;
  headers: NodeJS.Dict<string | string[]>;
  body: string;
}

function startServer(status: number): Promise<{ server: Server; port: number; captured: Captured }> {
  const captured: Captured = { method: undefined, url: undefined, headers: {}, body: '' };
  const server = createServer((req: IncomingMessage, res) => {
    captured.method = req.method;
    captured.url = req.url;
    captured.headers = req.headers;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      captured.body = Buffer.concat(chunks).toString();
      res.writeHead(status);
      res.end();
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, port: (server.address() as AddressInfo).port, captured });
    });
  });
}

describe('createHttpWebhookSender (SSRF-safe pinned egress)', () => {
  let toClose: Server | undefined;
  afterEach(() => {
    toClose?.close();
    toClose = undefined;
  });

  it('POSTs the body + headers to the pinned address and returns the status', async () => {
    const { server, port, captured } = await startServer(204);
    toClose = server;
    // allow-all policy so the loopback test server is reachable; resolver pins to 127.0.0.1.
    const sender = createHttpWebhookSender({ resolver: loopbackResolver, addressPolicy: () => true });

    const res = await sender.send({
      url: `http://hooks.test:${port}/in`,
      body: '{"a":1}',
      headers: { 'content-type': 'application/json', 'webhook-signature': 't=1&s=ff' },
    });

    expect(res).toEqual({ status: 204 });
    expect(captured.method).toBe('POST');
    expect(captured.url).toBe('/in');
    expect(captured.body).toBe('{"a":1}');
    expect(captured.headers['webhook-signature']).toBe('t=1&s=ff');
  });

  it('returns a 3xx/4xx/5xx status verbatim (does not follow redirects)', async () => {
    const { server, port } = await startServer(302);
    toClose = server;
    const sender = createHttpWebhookSender({ resolver: loopbackResolver, addressPolicy: () => true });
    const res = await sender.send({ url: `http://hooks.test:${port}/in`, body: '{}', headers: {} });
    expect(res.status).toBe(302); // redirect NOT followed
  });

  it('rejects a target that resolves to a private IP (SSRF egress guard)', async () => {
    const sender = createHttpWebhookSender({ resolver: privateResolver }); // default public-only policy
    await expect(sender.send({ url: 'https://internal.test/in', body: '{}', headers: {} })).rejects.toBeInstanceOf(
      UrlSafetyError,
    );
  });
});
