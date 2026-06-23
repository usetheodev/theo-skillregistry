import { type RetrievedSkill, type RetrieveParams, type SkillRetriever } from './types.js';

/** Reciprocal Rank Fusion constant (standard k=60; calibration-free — no weights). */
export const RRF_K = 60;

export interface HybridRetrieverDeps {
  readonly vector: SkillRetriever;
  readonly keyword: SkillRetriever;
}

/**
 * Fuse two ranked lists by Reciprocal Rank Fusion: each list contributes
 * `1 / (k + rank)` per skill; a skill present in BOTH lists sums both terms.
 * Calibration-free (no lexical/vector weights to tune). Deterministic regardless
 * of which retriever resolves first.
 */
export function rrfFuse(
  vectorResults: readonly RetrievedSkill[],
  keywordResults: readonly RetrievedSkill[],
  topK: number,
): RetrievedSkill[] {
  const fused = new Map<string, { skill: RetrievedSkill; score: number }>();
  const accumulate = (list: readonly RetrievedSkill[]): void => {
    for (let rank = 0; rank < list.length; rank++) {
      const skill = list[rank]!;
      const term = 1 / (RRF_K + rank);
      const existing = fused.get(skill.skill_id);
      if (existing !== undefined) {
        existing.score += term;
      } else {
        fused.set(skill.skill_id, { skill, score: term });
      }
    }
  };
  accumulate(vectorResults);
  accumulate(keywordResults);
  return Array.from(fused.values())
    .sort((a, b) => b.score - a.score || a.skill.skill_id.localeCompare(b.skill.skill_id))
    .slice(0, topK)
    .map(({ skill, score }) => ({ ...skill, score }));
}

/**
 * Hybrid retriever — runs vector + keyword in PARALLEL and fuses via RRF. The
 * keyword side degrades gracefully (its failure yields an empty list rather than
 * failing the whole retrieve), so a missing FTS index never breaks hybrid.
 */
export function createHybridRetriever(deps: HybridRetrieverDeps): SkillRetriever {
  return {
    async retrieve(params: RetrieveParams): Promise<RetrievedSkill[]> {
      const [vectorResults, keywordResults] = await Promise.all([
        deps.vector.retrieve(params),
        deps.keyword.retrieve(params).catch((): RetrievedSkill[] => []),
      ]);
      return rrfFuse(vectorResults, keywordResults, params.topK);
    },
  };
}
