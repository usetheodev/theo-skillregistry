import {
  createOpenAIEmbedder,
  createStubEmbedder,
  type EmbeddingProvider,
} from '@usetheo/skillregistry';

export interface SelectEmbedderOptions {
  /** Explicit injection (test seam / advanced reuse) — wins over env. */
  explicit?: EmbeddingProvider;
  /** Env source (defaults to process.env). */
  env?: NodeJS.ProcessEnv;
}

/**
 * Choose the embedding provider WITHOUT touching the domain (DIP). With
 * `OPENAI_API_KEY` set → openai (honoring `OPENAI_BASE_URL` for a local
 * openai-compatible server); otherwise the deterministic stub. Explicit
 * injection always wins, so tests and the embed worker share one selection.
 */
export function selectEmbedder(opts: SelectEmbedderOptions = {}): EmbeddingProvider {
  if (opts.explicit !== undefined) {
    return opts.explicit;
  }
  const env = opts.env ?? process.env;
  const hasOpenAI = (env['OPENAI_API_KEY'] ?? '').length > 0;
  return hasOpenAI ? createOpenAIEmbedder({}) : createStubEmbedder();
}
