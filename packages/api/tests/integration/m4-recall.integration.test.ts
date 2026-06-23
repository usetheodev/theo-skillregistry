import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createStubEmbedder } from '@usetheo/skillregistry';
import { afterAll, beforeAll, expect, it } from 'vitest';

import { type EvalDataset, runRecallEval, seedDataset } from '../../eval/run-recall.js';
import { createDispatchingRetriever } from '../../src/server/providers/retriever-selection.js';
import { createPgExecutor } from '../../src/server/retrieve/pg-executor.js';

import { closePool, getPool, truncateAll } from './_helpers/db.js';
import { describeIntegration } from './_helpers/env.js';

const dataset = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../eval/dataset.json', import.meta.url)), 'utf8'),
) as EvalDataset;

describeIntegration('M4 eval: Recall@5 + p95 latency (T4.1/T4.2)', () => {
  beforeAll(async () => {
    await truncateAll();
    await seedDataset(getPool(), dataset);
  });
  afterAll(closePool);

  it('hybrid retrieve meets Recall@5 >= 0.85 on the internal eval set', async () => {
    const retriever = createDispatchingRetriever({ executor: createPgExecutor(getPool()), embedder: createStubEmbedder() });
    const report = await runRecallEval(retriever, dataset);
    // Surface misses for debuggability if the gate ever fails.
    expect(report.misses, report.misses.join(' | ')).toEqual([]);
    expect(report.recallAt5).toBeGreaterThanOrEqual(0.85);
    expect(report.n).toBe(dataset.cases.length);
  });

  it('retrieve p95 latency < 200ms over the eval queries', async () => {
    const retriever = createDispatchingRetriever({ executor: createPgExecutor(getPool()), embedder: createStubEmbedder() });
    // warm + measure
    await runRecallEval(retriever, dataset);
    const report = await runRecallEval(retriever, dataset);
    expect(report.p95Ms).toBeLessThan(200);
  });
});
