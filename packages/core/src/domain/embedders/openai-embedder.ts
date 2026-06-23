/**
 * OpenAI embedding provider (SDK). Adapted from theo-rag (Rule 9), simplified to
 * the pinned 1536-dim contract. The `local` adapter in the DoD is THIS adapter
 * with a configured `baseURL` (openai-compatible server) — one code path (ADR D1).
 *
 * The `openai` package is an optionalDependency: it is imported LAZILY so a
 * deployment without it (CI / stub-only) never fails at module load.
 */
import { type EmbeddingProvider, type EmbedOptions, EmbedderError, EMBEDDING_DIM } from './types.js';

/** Minimal structural type of the OpenAI embeddings client we depend on. */
export interface OpenAIEmbeddingsClient {
  embeddings: {
    create(
      params: { model: string; input: string[]; dimensions?: number },
      options?: { signal?: AbortSignal },
    ): Promise<{ data: { embedding: number[] }[] }>;
  };
}

export interface OpenAIEmbedderOptions {
  /** Resolved model. Default `text-embedding-3-small` (1536-dim). */
  model?: string;
  /** Requested dimension (Matryoshka). Default `EMBEDDING_DIM` (1536). */
  dimensions?: number;
  /** API key (else `OPENAI_API_KEY`). */
  apiKey?: string;
  /** Base URL for an openai-compatible endpoint (the "local" deployment). */
  baseURL?: string;
  /** Injected client (test seam / advanced reuse). Skips lazy SDK load. */
  client?: OpenAIEmbeddingsClient;
  /** Max retries on transient errors. Default 3. */
  maxRetries?: number;
  /** Initial backoff (ms). Default 500. */
  initialBackoffMs?: number;
}

const DEFAULT_MODEL = 'text-embedding-3-small';
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_INITIAL_BACKOFF_MS = 500;

function isTransient(err: unknown): boolean {
  if (err !== null && typeof err === 'object') {
    const status = (err as { status?: number }).status;
    if (typeof status === 'number') {
      return status === 429 || status >= 500;
    }
    const name = (err as { name?: string }).name;
    // network errors (no HTTP status) are transient; AbortError is NOT retried.
    return name !== 'AbortError';
  }
  return false;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function withBackoff<T>(fn: () => Promise<T>, maxRetries: number, initialMs: number): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= maxRetries || !isTransient(err)) {
        throw err;
      }
      await sleep(initialMs * 2 ** attempt);
      attempt += 1;
    }
  }
}

async function loadDefaultClient(opts: OpenAIEmbedderOptions): Promise<OpenAIEmbeddingsClient> {
  const apiKey = opts.apiKey ?? process.env['OPENAI_API_KEY'];
  if (apiKey === undefined || apiKey === '') {
    throw new EmbedderError('OPENAI_API_KEY is required for the openai embedder', null, {});
  }
  let OpenAI: new (o: { apiKey: string; baseURL?: string }) => OpenAIEmbeddingsClient;
  try {
    // Lazy import — `openai` is an optionalDependency.
    ({ default: OpenAI } = (await import('openai')) as unknown as {
      default: new (o: { apiKey: string; baseURL?: string }) => OpenAIEmbeddingsClient;
    });
  } catch {
    throw new EmbedderError('the optional "openai" package is not installed', null, {});
  }
  const baseURL = opts.baseURL ?? process.env['OPENAI_BASE_URL'];
  return new OpenAI(baseURL !== undefined && baseURL !== '' ? { apiKey, baseURL } : { apiKey });
}

/** Build an OpenAI `EmbeddingProvider`. Injected `client` skips the lazy SDK load. */
export function createOpenAIEmbedder(opts: OpenAIEmbedderOptions = {}): EmbeddingProvider {
  const model = opts.model ?? DEFAULT_MODEL;
  const dimensions = opts.dimensions ?? EMBEDDING_DIM;
  const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
  const initialBackoffMs = opts.initialBackoffMs ?? DEFAULT_INITIAL_BACKOFF_MS;

  let clientPromise: Promise<OpenAIEmbeddingsClient> | undefined =
    opts.client !== undefined ? Promise.resolve(opts.client) : undefined;
  const getClient = (): Promise<OpenAIEmbeddingsClient> => {
    clientPromise ??= loadDefaultClient(opts);
    return clientPromise;
  };

  async function callBatch(texts: string[], embedOpts?: EmbedOptions): Promise<number[][]> {
    const client = await getClient();
    const response = await withBackoff(
      () =>
        client.embeddings.create(
          { model, input: texts, dimensions },
          embedOpts?.signal !== undefined ? { signal: embedOpts.signal } : undefined,
        ),
      maxRetries,
      initialBackoffMs,
    );
    return response.data.map((d) => d.embedding);
  }

  return {
    provider: 'openai',
    model,
    async embed(text, embedOpts) {
      const [v] = await callBatch([text], embedOpts);
      if (v === undefined) {
        throw new EmbedderError('openai returned no embedding', null, {});
      }
      return v;
    },
    embedBatch(texts, embedOpts) {
      return callBatch(texts, embedOpts);
    },
  };
}
