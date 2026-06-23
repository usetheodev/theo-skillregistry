import { createStubEmbedder, type EmbeddingProvider } from '@usetheo/skillregistry';
import { describe, expect, it } from 'vitest';

import { selectEmbedder } from '../../src/server/providers/embedder-selection.js';

describe('selectEmbedder (provider selection — domain untouched)', () => {
  it('uses the stub when no OPENAI_API_KEY is set', () => {
    const e = selectEmbedder({ env: {} });
    expect(e.provider).toBe('stub');
  });

  it('uses openai when OPENAI_API_KEY is present', () => {
    const e = selectEmbedder({ env: { OPENAI_API_KEY: 'sk-test' } });
    expect(e.provider).toBe('openai');
  });

  it('honors an explicit injection over env', () => {
    const explicit: EmbeddingProvider = createStubEmbedder();
    const e = selectEmbedder({ explicit, env: { OPENAI_API_KEY: 'sk-test' } });
    expect(e).toBe(explicit); // injection wins — same port, no domain change
  });
});
