import { describe, expect, it } from 'vitest';

import { createHybridRetriever, rrfFuse, RRF_K } from './hybrid-retriever.js';
import { type RetrievedSkill, type SkillRetriever } from './types.js';

const sk = (id: string): RetrievedSkill => ({ skill_id: id, score: 0, name: id, description: '' });
const listRetriever = (list: RetrievedSkill[]): SkillRetriever => ({ retrieve: () => Promise.resolve(list) });

describe('rrfFuse (Reciprocal Rank Fusion, k=60)', () => {
  it('scores a single-list skill as 1/(k+rank)', () => {
    const out = rrfFuse([sk('a'), sk('b')], [], 10);
    expect(out[0]).toMatchObject({ skill_id: 'a', score: 1 / (RRF_K + 0) });
    expect(out[1]).toMatchObject({ skill_id: 'b', score: 1 / (RRF_K + 1) });
  });

  it('sums both terms for a skill present in both lists', () => {
    // 'x' is rank 0 in vector and rank 1 in keyword → 1/60 + 1/61
    const out = rrfFuse([sk('x'), sk('y')], [sk('y'), sk('x')], 10);
    const x = out.find((r) => r.skill_id === 'x')!;
    expect(x.score).toBeCloseTo(1 / 60 + 1 / 61, 10);
    // 'x' (1/60+1/61) ranks above 'y' (1/61+1/60)? they're equal → tie-break by id
    expect(out.map((r) => r.skill_id)).toEqual(['x', 'y']);
  });

  it('orders by fused score desc and truncates to topK', () => {
    const out = rrfFuse([sk('a'), sk('b'), sk('c')], [sk('b')], 2);
    expect(out.map((r) => r.skill_id)).toEqual(['b', 'a']); // b is in both → highest
    expect(out).toHaveLength(2);
  });
});

describe('createHybridRetriever', () => {
  it('fuses vector + keyword results', async () => {
    const r = createHybridRetriever({ vector: listRetriever([sk('a')]), keyword: listRetriever([sk('b')]) });
    const out = await r.retrieve({ query: 'q', topK: 10 });
    expect(out.map((x) => x.skill_id).sort()).toEqual(['a', 'b']);
  });

  it('Concurrent test: degrades gracefully when the keyword retriever fails (parallel)', async () => {
    const failing: SkillRetriever = { retrieve: () => Promise.reject(new Error('no FTS')) };
    const r = createHybridRetriever({ vector: listRetriever([sk('a'), sk('b')]), keyword: failing });
    const out = await r.retrieve({ query: 'q', topK: 10 });
    expect(out.map((x) => x.skill_id)).toEqual(['a', 'b']); // vector-only, no throw
  });
});
