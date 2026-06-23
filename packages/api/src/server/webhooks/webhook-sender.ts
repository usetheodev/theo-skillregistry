import { type WebhookSendRequest, type WebhookSendResponse, type WebhookSender } from '@usetheo/skillregistry';

export interface Clock {
  now(): number;
}

export const realClock: Clock = {
  now: () => Math.floor(Date.now() / 1000),
};

const DEFAULT_TIMEOUT_MS = 15_000;

export interface CreateHttpWebhookSenderOptions {
  readonly fetch: typeof globalThis.fetch;
  readonly timeoutMs?: number;
}

/** HTTP WebhookSender: POST with a timeout and redirect:'manual' (SSRF defence). */
export function createHttpWebhookSender(opts: CreateHttpWebhookSenderOptions): WebhookSender {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return {
    async send(req: WebhookSendRequest): Promise<WebhookSendResponse> {
      const response = await opts.fetch(req.url, {
        method: 'POST',
        body: req.body,
        headers: { ...req.headers },
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
      });
      return { status: response.status };
    },
  };
}
