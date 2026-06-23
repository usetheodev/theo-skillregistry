import { describe, expect, it } from 'vitest';

import { assertEmbeddingDim, EMBEDDING_DIM, EmbedderError } from './types.js';

describe('assertEmbeddingDim (fail-fast dimension guard)', () => {
  it('passes a correctly-sized vector', () => {
    expect(() => assertEmbeddingDim(new Array(EMBEDDING_DIM).fill(0))).not.toThrow();
  });

  it('rejects a mismatched dimension with EmbedderError + context', () => {
    try {
      assertEmbeddingDim(new Array(EMBEDDING_DIM - 1).fill(0));
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(EmbedderError);
      expect((err as EmbedderError).context).toMatchObject({ expected: EMBEDDING_DIM, actual: EMBEDDING_DIM - 1 });
    }
  });

  it('pins the dimension at 1536', () => {
    expect(EMBEDDING_DIM).toBe(1536);
  });
});
