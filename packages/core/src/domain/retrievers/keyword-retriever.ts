import { ParamBuilder } from './param-builder.js';
import { type QueryExecutor, type RetrievedSkill, type RetrieveParams, type SkillRetriever } from './types.js';

export interface KeywordRetrieverDeps {
  readonly executor: QueryExecutor;
}

/**
 * Keyword (lexical) retriever — Postgres FTS over `skills.search_tsv`, ranked by
 * `ts_rank`. Uses `websearch_to_tsquery` which NEVER raises on raw user input
 * (multi-word, quotes, operators) — unlike `to_tsquery`.
 */
export function createKeywordRetriever(deps: KeywordRetrieverDeps): SkillRetriever {
  return {
    async retrieve(params: RetrieveParams): Promise<RetrievedSkill[]> {
      const b = new ParamBuilder();
      const queryPh = b.bind(params.query);
      const limitPh = b.bind(params.topK);
      const tsQuery = `websearch_to_tsquery('english', ${queryPh})`;
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
