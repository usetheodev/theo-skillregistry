import { ParamBuilder } from './param-builder.js';
import { type QueryExecutor, type RetrievedSkill, type RetrieveParams, type SkillRetriever } from './types.js';

export interface KeywordRetrieverDeps {
  readonly executor: QueryExecutor;
}

/**
 * Keyword (lexical) retriever — Postgres FTS over `skills.search_tsv`, ranked by
 * `ts_rank`. The query is reduced to its stemmed lexemes and OR-ed together:
 * `to_tsquery('english', array_to_string(tsvector_to_array(to_tsvector('english', q)), ' | '))`.
 * This is RECALL-friendly (a skill matching ANY query term is a candidate, ranked
 * by ts_rank) and SAFE on raw user input — the lexemes are clean tokens, so no
 * user-supplied operator ever reaches `to_tsquery` (which would otherwise raise).
 */
export function createKeywordRetriever(deps: KeywordRetrieverDeps): SkillRetriever {
  return {
    async retrieve(params: RetrieveParams): Promise<RetrievedSkill[]> {
      const b = new ParamBuilder();
      const queryPh = b.bind(params.query);
      const limitPh = b.bind(params.topK);
      const tsQuery = `to_tsquery('english', array_to_string(tsvector_to_array(to_tsvector('english', ${queryPh})), ' | '))`;
      const sql = `
        SELECT s.skill_id, s.name, s.description, ts_rank(s.search_tsv, ${tsQuery}) AS score
        FROM skills s
        WHERE s.deleted_at IS NULL AND s.search_tsv @@ ${tsQuery}
        ORDER BY score DESC, s.skill_id ASC
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
