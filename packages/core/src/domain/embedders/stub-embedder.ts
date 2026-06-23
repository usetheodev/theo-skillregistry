/**
 * Deterministic SHA-256-seeded stub embedder — CI / tests / offline without an
 * external provider. Adapted from theo-rag (Rule 9).
 *
 * Algorithm: counter-prefixed SHA-256 of the input is expanded across `dim * 4`
 * bytes, packed into uint32, normalized to [-0.5, 0.5), then L2-normalized so
 * cosine self-similarity is exactly 1.0. Same text → same vector.
 */
import { createHash } from 'node:crypto';

import { type EmbeddingProvider, EmbedderError, EMBEDDING_DIM } from './types.js';

export interface StubEmbedderOptions {
  /** Vector length. Default `EMBEDDING_DIM` (1536). Must be a positive integer. */
  dimensions?: number;
}

function seededVector(text: string, dim: number): number[] {
  const seedBytes: number[] = [];
  let counter = 0;
  while (seedBytes.length < dim * 4) {
    const digest = createHash('sha256').update(`${counter}:${text}`).digest();
    for (const b of digest) seedBytes.push(b);
    counter++;
  }
  const raw = new Array<number>(dim);
  for (let i = 0; i < dim; i++) {
    const offset = i * 4;
    const u32 =
      (seedBytes[offset]! << 24) |
      (seedBytes[offset + 1]! << 16) |
      (seedBytes[offset + 2]! << 8) |
      seedBytes[offset + 3]!;
    raw[i] = (u32 >>> 0) / 0xffffffff - 0.5;
  }
  let normSq = 0;
  for (const v of raw) normSq += v * v;
  const norm = Math.sqrt(normSq) || 1;
  return raw.map((v) => v / norm);
}

/** Deterministic 1536-dim helper (used by test factories). */
export function stubEmbed(text: string): number[] {
  return seededVector(text, EMBEDDING_DIM);
}

/** Build a deterministic `EmbeddingProvider` emitting SHA-256-seeded vectors. */
export function createStubEmbedder(opts: StubEmbedderOptions = {}): EmbeddingProvider {
  const dimensions = opts.dimensions ?? EMBEDDING_DIM;
  if (!Number.isInteger(dimensions) || dimensions <= 0) {
    throw new EmbedderError('dimensions must be a positive integer', null, { dimensions });
  }
  return {
    provider: 'stub',
    model: 'stub',
    embed(text) {
      return Promise.resolve(seededVector(text, dimensions));
    },
    embedBatch(texts) {
      return Promise.resolve(texts.map((t) => seededVector(t, dimensions)));
    },
  };
}
