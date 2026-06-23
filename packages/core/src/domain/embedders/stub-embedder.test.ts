import { describe, expect, it } from 'vitest';

import { createStubEmbedder } from './stub-embedder.js';
import { EMBEDDING_DIM } from './types.js';

describe('createStubEmbedder', () => {
  it('satisfies the EmbeddingProvider port (provider/model/embed/embedBatch)', async () => {
    const e = createStubEmbedder();
    expect(e.provider).toBe('stub');
    expect(e.model).toBe('stub');
    const v = await e.embed('hello');
    expect(v).toHaveLength(EMBEDDING_DIM);
    const batch = await e.embedBatch(['a', 'b']);
    expect(batch).toHaveLength(2);
    expect(batch[0]).toHaveLength(EMBEDDING_DIM);
  });

  it('is deterministic and L2-normalized', async () => {
    const e = createStubEmbedder();
    const v1 = await e.embed('the quick brown fox');
    const v2 = await e.embed('the quick brown fox');
    expect(v1).toEqual(v2); // same text → identical vector
    const norm = Math.sqrt(v1.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1.0, 6); // unit length
  });

  it('produces distinct vectors for distinct text', async () => {
    const e = createStubEmbedder();
    const a = await e.embed('alpha');
    const b = await e.embed('beta');
    expect(a).not.toEqual(b);
  });

  it('rejects a non-positive / non-integer dimension', () => {
    expect(() => createStubEmbedder({ dimensions: 0 })).toThrow();
    expect(() => createStubEmbedder({ dimensions: 1.5 })).toThrow();
  });
});
