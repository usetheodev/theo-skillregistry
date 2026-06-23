/** Public barrel for the embedders domain (port + adapters + guard). */
export {
  type EmbeddingProvider,
  type EmbedOptions,
  EmbedderError,
  EMBEDDING_DIM,
  assertEmbeddingDim,
} from './types.js';
export { createStubEmbedder, stubEmbed, type StubEmbedderOptions } from './stub-embedder.js';
export {
  createOpenAIEmbedder,
  type OpenAIEmbedderOptions,
  type OpenAIEmbeddingsClient,
} from './openai-embedder.js';
