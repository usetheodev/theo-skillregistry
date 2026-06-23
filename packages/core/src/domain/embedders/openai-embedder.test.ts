import { describe, expect, it, vi } from 'vitest';

import { createOpenAIEmbedder, type OpenAIEmbeddingsClient } from './openai-embedder.js';
import { EMBEDDING_DIM } from './types.js';

const vec = (): number[] => new Array<number>(EMBEDDING_DIM).fill(0).map((_, i) => (i % 7) / 7 - 0.5);

interface Captured {
  input?: string[];
  signal?: AbortSignal | undefined;
}

/** Fake client: programmable per-call failures (status code or AbortError). */
function fakeClient(opts: { failWith?: (number | 'abort')[] } = {}): {
  client: OpenAIEmbeddingsClient;
  calls: () => number;
  captured: Captured;
} {
  const failures = [...(opts.failWith ?? [])];
  let calls = 0;
  const captured: Captured = {};
  const client: OpenAIEmbeddingsClient = {
    embeddings: {
      create: (params, options) => {
        calls += 1;
        captured.input = params.input;
        captured.signal = options?.signal;
        const fail = failures.shift();
        if (fail === 'abort') {
          return Promise.reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        }
        if (typeof fail === 'number') {
          return Promise.reject(Object.assign(new Error(`http ${fail}`), { status: fail }));
        }
        return Promise.resolve({ data: params.input.map(() => ({ embedding: vec() })) });
      },
    },
  };
  return { client, calls: () => calls, captured };
}

describe('createOpenAIEmbedder', () => {
  it('calls the injected client and returns the vector', async () => {
    const { client } = fakeClient();
    const e = createOpenAIEmbedder({ client });
    expect(e.provider).toBe('openai');
    expect(await e.embed('hello')).toHaveLength(EMBEDDING_DIM);
  });

  it('passes model + dimensions to the client', async () => {
    const create = vi.fn((params: { model: string; input: string[]; dimensions?: number }) =>
      Promise.resolve({ data: params.input.map(() => ({ embedding: vec() })) }),
    );
    const e = createOpenAIEmbedder({ client: { embeddings: { create } }, model: 'text-embedding-3-small' });
    await e.embed('x');
    const arg = create.mock.calls[0]![0];
    expect(arg.model).toBe('text-embedding-3-small');
    expect(arg.dimensions).toBe(EMBEDDING_DIM);
  });

  it('threads the baseURL through to the client factory (the "local" deployment)', async () => {
    let captured: { apiKey: string; baseURL?: string } | undefined;
    const e = createOpenAIEmbedder({
      apiKey: 'sk-test',
      baseURL: 'http://localhost:1234/v1',
      clientFactory: (config) => {
        captured = config;
        return fakeClient().client;
      },
    });
    await e.embed('x');
    expect(captured).toEqual({ apiKey: 'sk-test', baseURL: 'http://localhost:1234/v1' });
  });

  it('passes the AbortSignal to the client and does NOT retry on AbortError', async () => {
    const { client, calls, captured } = fakeClient({ failWith: ['abort'] });
    const e = createOpenAIEmbedder({ client, maxRetries: 3, initialBackoffMs: 1 });
    const ac = new AbortController();
    await expect(e.embed('x', { signal: ac.signal })).rejects.toThrow();
    expect(captured.signal).toBe(ac.signal); // signal threaded through
    expect(calls()).toBe(1); // abort is terminal — NOT retried
  });

  it('retries on 429 then succeeds', async () => {
    const { client, calls } = fakeClient({ failWith: [429] });
    const e = createOpenAIEmbedder({ client, maxRetries: 3, initialBackoffMs: 1 });
    await e.embed('x');
    expect(calls()).toBe(2);
  });

  it('retries on 5xx then succeeds', async () => {
    const { client, calls } = fakeClient({ failWith: [503] });
    const e = createOpenAIEmbedder({ client, maxRetries: 3, initialBackoffMs: 1 });
    await e.embed('x');
    expect(calls()).toBe(2);
  });

  it('fails FAST on a non-transient 4xx (no retry)', async () => {
    const { client, calls } = fakeClient({ failWith: [400] });
    const e = createOpenAIEmbedder({ client, maxRetries: 3, initialBackoffMs: 1 });
    await expect(e.embed('x')).rejects.toThrow();
    expect(calls()).toBe(1);
  });

  it('gives up after exhausting retries on persistent 5xx', async () => {
    const { client, calls } = fakeClient({ failWith: [500, 500, 500, 500, 500] });
    const e = createOpenAIEmbedder({ client, maxRetries: 2, initialBackoffMs: 1 });
    await expect(e.embed('x')).rejects.toThrow();
    expect(calls()).toBe(3); // initial + 2 retries
  });

  it('truncates an oversized input to the char limit (safety guard)', async () => {
    const { client, captured } = fakeClient();
    const e = createOpenAIEmbedder({ client, maxInputChars: 10 });
    await e.embed('x'.repeat(50));
    expect(captured.input?.[0]).toHaveLength(10);
  });

  it('embedBatch returns one vector per input', async () => {
    const { client } = fakeClient();
    const e = createOpenAIEmbedder({ client });
    const out = await e.embedBatch(['a', 'b', 'c']);
    expect(out).toHaveLength(3);
    expect(out[0]).toHaveLength(EMBEDDING_DIM);
  });
});
