import { assertEmbeddingDim, type EmbeddingProvider } from '../embedders/index.js';

import { ParamBuilder } from './param-builder.js';
import { type QueryExecutor, type RetrievedSkill, type RetrieveParams, type SkillRetriever } from './types.js';

export interface VectorRetrieverDeps {
  readonly executor: QueryExecutor;
  readonly embedder: EmbeddingProvider;
}

/**
 * Vector retriever — embeds the query, then ranks each skill's CURRENT-revision
 * embedding by cosine similarity (`1 - (vector <=> q)`). Dimension is guarded
 * BEFORE the SQL so a mismatched provider never leaks an opaque pg error.
 */
export function createVectorRetriever(deps: VectorRetrieverDeps): SkillRetriever {
  return {
    async retrieve(params: RetrieveParams): Promise<RetrievedSkill[]> {
      const vec = await deps.embedder.embed(params.query);
      assertEmbeddingDim(vec);
      const b = new ParamBuilder();
      const vecPh = b.bind(`[${vec.join(',')}]`);
      const limitPh = b.bind(params.topK);
      const sql = `
        SELECT s.skill_id, s.name, s.description, 1 - (e.vector <=> ${vecPh}::vector) AS score
        FROM embeddings e
        JOIN skills s ON s.skill_id = e.skill_id AND e.revision_id = s.latest_revision_id
        WHERE s.deleted_at IS NULL
        ORDER BY e.vector <=> ${vecPh}::vector ASC, s.skill_id ASC
        LIMIT ${limitPh}
      `;
      const rows = await deps.executor.query<{ skill_id: string; name: string; description: string; score: number }>(
        sql,
        b.getParams(),
      );
      return rows.map((r) => ({ skill_id: r.skill_id, name: r.name, description: r.description, score: Number(r.score) }));
    },
  };
}
