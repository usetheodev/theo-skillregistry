import { describe, expect, it, vi } from 'vitest';

import { createOpenAIEmbedder, type OpenAIEmbeddingsClient } from './openai-embedder.js';
import { EMBEDDING_DIM } from './types.js';

function fakeClient(vector: number[], opts: { failTimes?: number } = {}): { client: OpenAIEmbeddingsClient; calls: () => number } {
  let calls = 0;
  let fails = opts.failTimes ?? 0;
  const client: OpenAIEmbeddingsClient = {
    embeddings: {
      create: (params) => {
        calls += 1;
        if (fails > 0) {
          fails -= 1;
          const err = Object.assign(new Error('temporary'), { status: 503 });
          return Promise.reject(err);
        }
        return Promise.resolve({ data: params.input.map(() => ({ embedding: vector })) });
      },
    },
  };
  return { client, calls: () => calls };
}

const vec = (): number[] => new Array(EMBEDDING_DIM).fill(0).map((_, i) => (i % 7) / 7 - 0.5);

describe('createOpenAIEmbedder', () => {
  it('calls the injected client and returns the vector', async () => {
    const { client } = fakeClient(vec());
    const e = createOpenAIEmbedder({ client });
    expect(e.provider).toBe('openai');
    const v = await e.embed('hello');
    expect(v).toHaveLength(EMBEDDING_DIM);
  });

  it('passes model + dimensions to the client', async () => {
    const create = vi.fn((params: { model: string; input: string[]; dimensions?: number }) =>
      Promise.resolve({ data: params.input.map(() => ({ embedding: vec() })) }),
    );
    const e = createOpenAIEmbedder({ client: { embeddings: { create } }, model: 'text-embedding-3-small' });
    await e.embed('x');
    expect(create).toHaveBeenCalledOnce();
    const arg = create.mock.calls[0]![0];
    expect(arg.model).toBe('text-embedding-3-small');
    expect(arg.dimensions).toBe(EMBEDDING_DIM);
  });

  it('retries on a transient (5xx) error then succeeds', async () => {
    const { client, calls } = fakeClient(vec(), { failTimes: 1 });
    const e = createOpenAIEmbedder({ client, maxRetries: 3, initialBackoffMs: 1 });
    const v = await e.embed('retry me');
    expect(v).toHaveLength(EMBEDDING_DIM);
    expect(calls()).toBe(2); // 1 failure + 1 success
  });

  it('embedBatch returns one vector per input', async () => {
    const { client } = fakeClient(vec());
    const e = createOpenAIEmbedder({ client });
    const out = await e.embedBatch(['a', 'b', 'c']);
    expect(out).toHaveLength(3);
    expect(out[0]).toHaveLength(EMBEDDING_DIM);
  });
});
