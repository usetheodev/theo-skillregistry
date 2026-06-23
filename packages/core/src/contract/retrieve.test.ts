import { describe, expect, it } from 'vitest';

import { RetrieveParamsSchema, RetrieveResultSchema } from './index.js';

describe('RetrieveParamsSchema', () => {
  it('defaults strategy=hybrid and top_k=5', () => {
    const p = RetrieveParamsSchema.parse({ query: 'find a pdf tool' });
    expect(p).toEqual({ query: 'find a pdf tool', top_k: 5, strategy: 'hybrid' });
  });

  it('coerces top_k from a string query param', () => {
    expect(RetrieveParamsSchema.parse({ query: 'x', top_k: '10' }).top_k).toBe(10);
  });

  it('rejects an empty query and an unknown strategy', () => {
    expect(RetrieveParamsSchema.safeParse({ query: '' }).success).toBe(false);
    expect(RetrieveParamsSchema.safeParse({ query: 'x', strategy: 'magic' }).success).toBe(false);
  });

  it('clamps top_k to the 1..50 range', () => {
    expect(RetrieveParamsSchema.safeParse({ query: 'x', top_k: 0 }).success).toBe(false);
    expect(RetrieveParamsSchema.safeParse({ query: 'x', top_k: 51 }).success).toBe(false);
  });
});

describe('RetrieveResultSchema', () => {
  it('requires skill_id + numeric score + name + description', () => {
    const r = RetrieveResultSchema.parse({ skill_id: 's1', score: 0.42, name: 'N', description: 'D' });
    expect(r.score).toBe(0.42);
  });
});
