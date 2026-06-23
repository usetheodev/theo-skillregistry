/**
 * Embedding provider port (DIP) for the skill registry. Adapted from the
 * theo-rag `Embedder` contract (Unbreakable Rule 9 — reuse the house pattern).
 *
 * The dimension is PINNED at 1536 (matches the pgvector `vector(1536)` column /
 * OpenAI text-embedding-3-small). `assertEmbeddingDim` is the fail-fast guard
 * that rejects any provider whose output diverges — silent corruption is worse
 * than a loud rejection (ADR D2).
 */

/** Pinned embedding dimension. Changing it requires a migration + ADR. */
export const EMBEDDING_DIM = 1536;

/** Caller-controlled options shared by `embed` / `embedBatch`. */
export interface EmbedOptions {
  /** Optional cancellation signal; honored by network-backed providers. */
  signal?: AbortSignal;
}

/**
 * Text-to-vector embedding provider. Implementations: `createStubEmbedder`
 * (deterministic, offline) and `createOpenAIEmbedder` (SDK; `local` = same
 * adapter with a configured base URL).
 */
export interface EmbeddingProvider {
  /** Provider tag persisted to `embeddings.provider`. */
  readonly provider: 'stub' | 'openai';
  /** Model identifier persisted to `embeddings.model`. */
  readonly model: string;
  /** Convert a single text into a numeric vector. */
  embed(text: string, opts?: EmbedOptions): Promise<number[]>;
  /** Convert N texts into N vectors. */
  embedBatch(texts: string[], opts?: EmbedOptions): Promise<number[][]>;
  /** Optional cleanup of provider-owned resources (idempotent). */
  dispose?(): void;
}

/** Typed embedder error with structured context (never leaks secrets). */
export class EmbedderError extends Error {
  override readonly cause: unknown;
  readonly context: Readonly<Record<string, unknown>>;

  constructor(message: string, cause: unknown = null, context: Record<string, unknown> = {}) {
    super(message);
    this.name = 'EmbedderError';
    this.cause = cause;
    this.context = context;
  }
}

/**
 * Fail-fast dimension guard. Throws `EmbedderError` when `vector.length` is not
 * exactly `EMBEDDING_DIM` — used at boot (selected provider) and per embedding
 * (embed worker) so a mismatched provider never writes a corrupt vector.
 */
export function assertEmbeddingDim(vector: readonly number[], expected: number = EMBEDDING_DIM): void {
  if (vector.length !== expected) {
    throw new EmbedderError('embedding dimension mismatch', null, {
      expected,
      actual: vector.length,
    });
  }
}
