export interface WebhookSendRequest {
  readonly url: string;
  readonly body: string;
  readonly headers: Readonly<Record<string, string>>;
}

export interface WebhookSendResponse {
  readonly status: number;
}

/**
 * Port (DIP) — sends a signed webhook over HTTP. The infrastructure adapter
 * applies a timeout and `redirect: 'manual'` (SSRF defence).
 */
export interface WebhookSender {
  send(req: WebhookSendRequest): Promise<WebhookSendResponse>;
}
