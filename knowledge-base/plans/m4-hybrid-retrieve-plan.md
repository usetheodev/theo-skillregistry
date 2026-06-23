---
slug: m4-hybrid-retrieve
milestone_id: M4
created_at: 2026-06-23
goal: Busca híbrida transparente (RetrieveSkills) — endpoint GET /v1/skills:retrieve que funde FTS lexical + pgvector via RRF, retorna score por resultado, com eval set (Recall@5 ≥ 0.85, p95 < 200ms) e métrica north-star.
generated_by: to-plan
source_blueprint: knowledge-base/discoveries/blueprints/m4-hybrid-retrieve-blueprint.md
---

# Plan: M4 — Busca híbrida transparente (RetrieveSkills)

## Goal

Entregar a descoberta por intenção: endpoint `GET /v1/skills:retrieve?query=...&topK=...&strategy=...`
que combina busca lexical (Postgres FTS) + vetorial (pgvector, do M3) via **RRF (Reciprocal Rank
Fusion, k=60, calibration-free)** e retorna **`score` explícito** por resultado. Com conjunto de
avaliação interno (**Recall@5 ≥ 0.85**, retrieve **p95 < 200ms**, medidos e reproduzíveis) e métrica
**time-to-relevant-skill** (north-star) instrumentada no caminho do retrieve.

## Context

Quinto milestone (depende de M3, v0.4.0 — embeddings pgvector). Reusa o padrão de retrieval híbrido
validado em produção no theo-rag (Rule 9): RRF k=60, FTS `tsvector`+GIN+`websearch_to_tsquery`,
vector cosine `<=>`, ParamBuilder, dispatcher por strategy. ZERO dependências novas. Escopo travado
(2026-06-23): RRF calibration-free; FTS síncrono em `skills.search_text`; eval medido com stub
embedder (recall via FTS lexical, honesto — Rule 3).

## Baseline Context (deep review of current state)

Repo @ git `3a18e3a` (pós-M3/v0.4.0). Container `theoskill_pgvector` (5435) com pgvector + FTS nativo
do Postgres. M3 deixou: tabela `embeddings` (vector(1536), HNSW cosine), `skill_revisions.skill_md`,
porta `EmbeddingProvider` + `selectEmbedder`.

### Files that will be touched

| File | LoC | Estado | Mudança em M4 |
|---|---|---|---|
| `packages/core/src/infrastructure/db/schema.ts` | ~200 | existe | + `skills.search_text` + `skills.search_tsv` (generated tsvector) + índice GIN |
| `packages/core/src/contract/index.ts` | ~95 | existe | + `RetrieveParamsSchema` + `RetrieveResultSchema` (score por resultado) |
| `packages/core/src/index.ts` | ~70 | existe | exporta porta `SkillRetriever` + tipos + contrato retrieve |
| `packages/api/src/server/store/skills-store.ts` | ~215 | existe | manter `search_text` (create/addRevision/updateMetadata) |
| `packages/api/src/server/app.ts` | ~75 | existe | injeta o dispatcher de retrieval; registra a rota retrieve |
| `packages/api/src/server/handlers/skills.ts` | ~295 | existe | + rota `GET /v1/skills:retrieve` (parse query params → retriever → score + métrica) |

### New files (M4)

- `packages/core/src/domain/retrievers/types.ts` (porta `SkillRetriever` + `RetrievedSkill` + erro)
- `packages/core/src/domain/retrievers/param-builder.ts` (binding `$N` seguro)
- `packages/core/src/domain/retrievers/vector-retriever.ts` (cosine pgvector)
- `packages/core/src/domain/retrievers/keyword-retriever.ts` (FTS `websearch_to_tsquery`+`ts_rank`)
- `packages/core/src/domain/retrievers/hybrid-retriever.ts` (RRF k=60)
- `packages/core/src/domain/retrievers/index.ts` (barrel)
- `packages/api/src/server/providers/retriever-selection.ts` (dispatcher por strategy)
- `packages/api/eval/dataset.json` + `packages/api/eval/run-recall.ts` (eval Recall@5)
- `packages/api/tests/integration/m4-retrieve.integration.test.ts`, `m4-recall.integration.test.ts`

### Current callers / dependents

`skills-store` é a única via de escrita de skills (`createWithRevision`/`addRevision`/`updateMetadata`)
— ponto natural para manter `search_text`. O embed worker (M3) já indexa o vetor por revisão; M4
adiciona o lexical em paralelo. A rota retrieve é stateless (lê embeddings + skills.search_tsv).

### Domain glossary

| Term | Meaning |
|---|---|
| RRF | Reciprocal Rank Fusion — funde listas por `Σ 1/(k+rank)`; k=60; sem pesos a calibrar |
| FTS | Full-Text Search do Postgres (`tsvector`/`tsquery`/`ts_rank`) |
| tsvector | representação tokenizada do texto; coluna gerada + índice GIN |
| websearch_to_tsquery | parser de query de usuário que nunca lança em input livre (vs `to_tsquery`) |
| hybrid retrieve | fusão RRF de uma lista vetorial (cosine) + uma lexical (ts_rank) |
| Recall@5 | fração de queries cujo skill esperado está nos top-5 resultados |
| time-to-relevant-skill | north-star: latência do retrieve até o primeiro resultado relevante |

### Architecture boundaries affected

- **domain** (`core/src/domain/retrievers`): porta `SkillRetriever` + adapters puros (vector/keyword/hybrid) + ParamBuilder; dependem só de um executor SQL injetado e do `EmbeddingProvider` (M3).
- **infrastructure** (`core/src/infrastructure/db`): `skills.search_tsv` (generated) + GIN.
- **application** (`api/src/server/providers`): dispatcher por strategy (composition root injeta pool+embedder).
- **interface** (`api/src/server/handlers/skills.ts`): a rota apenas faz parse, chama o retriever e formata score + emite a métrica (SRP; nenhuma lógica de fusão no handler).

## Dependencies

ZERO dependências novas de runtime — busca híbrida é SQL puro (FTS nativo + pgvector do M3) + fusão
RRF em memória + o `EmbeddingProvider` já existente. `/deps-audit` confirmará que nada foi adicionado
(Rule 9 — não reinventar; o FTS é do Postgres, a fusão é ~30 linhas).

## Coverage Matrix

| Goal claim | Task(s) |
|---|---|
| FTS lexical indexada (`skills.search_tsv` + GIN; mantida sincronamente) | T1.1, T1.2 |
| Porta `SkillRetriever` (DIP) + ParamBuilder seguro | T2.1 |
| Vector retriever (cosine pgvector, guard de dimensão) | T2.2 |
| Keyword retriever (FTS `websearch_to_tsquery` + `ts_rank`) | T2.3 |
| Hybrid retriever (RRF k=60, calibration-free, degradação graciosa) | T2.4 |
| Contrato retrieve + `score` por resultado | T3.1 |
| Endpoint `GET /v1/skills:retrieve` + dispatcher por strategy | T3.2, T3.3 |
| Métrica time-to-relevant-skill no caminho do retrieve | T3.4 |
| Eval set: Recall@5 ≥ 0.85 reproduzível | T4.1 |
| Bench: retrieve p95 < 200ms reproduzível | T4.2 |
| Integração E2E: indexar → retrieve com score; estratégias | T4.3 |

## Phase 1 — FTS schema + manutenção síncrona

### T1.1 — Coluna `search_text` + `search_tsv` (generated) + índice GIN
- **Arquivo**: `schema.ts` + migration
- **TDD (integração)**: `test_skills_fts_column_and_gin_index_exist` — após migration, `skills.search_tsv` existe e há índice GIN; `to_tsvector` populado de `search_text`; `tsv @@ websearch_to_tsquery('english','foo')` funciona.
- **Why this step**: a busca lexical precisa de um índice FTS estável; coluna gerada auto-mantém o tsvector a partir de `search_text`.
- **Acceptance**: `search_text text not null default ''`; `search_tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', search_text)) STORED`; índice GIN; migration aplicada.

#### Concurrency tests
(none — single-threaded)

### T1.2 — skills-store mantém `search_text` (create/addRevision/updateMetadata)
- **Arquivo**: `skills-store.ts`
- **TDD (integração)**: `test_search_text_reflects_name_description_body` — create → search_text = name+desc+skill_md; `test_metadata_update_refreshes_search_text` (PATCH description → search_text atualizado, sem nova revisão); `test_add_revision_refreshes_search_text`.
- **Why this step**: o FTS deve refletir o texto corrente; manter no store (única via de escrita) garante sempre-corrente, mesmo em PATCH de metadados que não re-embeda.
- **Acceptance**: as 3 vias de escrita atualizam `search_text` com `name + ' ' + description + ' ' + skill_md` da revisão corrente.

#### Concurrency tests
(none — single-threaded)

## Phase 2 — Retriever port + adapters (core)

### T2.1 — Porta `SkillRetriever` + ParamBuilder
- **Arquivo**: `retrievers/types.ts`, `retrievers/param-builder.ts`
- **TDD**: `test_param_builder_numbers_globally` — `bind` retorna `$1`,`$2`,… e acumula params; `test_retriever_port_shape` (porta `retrieve(params) → RetrievedSkill[]`).
- **Why this step**: a porta é o contrato DIP; o ParamBuilder garante `$N` global sem injeção (port do theo-rag).
- **Acceptance**: porta `SkillRetriever`; `RetrievedSkill {skill_id, score, name, description}`; `RetrieverError`; `ParamBuilder`.

#### Concurrency tests
(none — single-threaded)

### T2.2 — Vector retriever (cosine pgvector)
- **Arquivo**: `retrievers/vector-retriever.ts`
- **TDD (integração)**: `test_vector_retriever_orders_by_cosine` — embeda query (stub) → retorna skills ordenadas por `1-(vector<=>q)`; guard de dimensão (≠1536 → erro, sem SQL).
- **Why this step**: componente vetorial do hybrid; reusa o índice HNSW do M3.
- **Acceptance**: SQL `1 - (vector <=> $q::vector)` + tie-break `, skill_id ASC` + LIMIT; `assertEmbeddingDim` antes do SQL; só skills não-deletadas.

#### Concurrency tests
(none — single-threaded)

### T2.3 — Keyword retriever (FTS)
- **Arquivo**: `retrievers/keyword-retriever.ts`
- **TDD (integração)**: `test_keyword_retriever_ranks_by_ts_rank` — query → skills ordenadas por `ts_rank`; `test_keyword_handles_multiword_and_operators_without_throwing` (websearch_to_tsquery).
- **Why this step**: componente lexical; `websearch_to_tsquery` nunca lança em input livre (vs `to_tsquery`).
- **Acceptance**: `ts_rank(search_tsv, websearch_to_tsquery('english',$q))` + `WHERE search_tsv @@ ...` + LIMIT; só não-deletadas.

#### Concurrency tests
(none — single-threaded)

### T2.4 — Hybrid retriever (RRF k=60)
- **Arquivo**: `retrievers/hybrid-retriever.ts`
- **TDD**: `test_rrf_fuses_two_lists` (unit) — dadas duas listas, score = `Σ 1/(60+rank)`; item em ambas soma; ordenação desc; `test_hybrid_degrades_when_keyword_fails` (keyword lança → retorna vetor).
- **Why this step**: fusão calibration-free (RRF) — mitiga o risco "fusão mal calibrada" sem tunar pesos.
- **Acceptance**: `Promise.all([vector, keyword.catch(()=>[])])`; RRF in-memory k=60; top-K por score desc.

#### Concurrency tests
Concurrent test: `test_hybrid_runs_retrievers_in_parallel` — os dois retrievers rodam em paralelo (Promise.all); a fusão é determinística independentemente da ordem de resolução.

## Phase 3 — Contrato + endpoint + dispatcher + métrica

### T3.1 — Contrato retrieve (`score` por resultado)
- **Arquivo**: `contract/index.ts`
- **TDD**: `test_retrieve_params_schema_defaults` (strategy=hybrid, topK=5; query 1..8192); `test_retrieve_result_has_score`.
- **Why this step**: contrato explícito (zod) na fronteira; `score` é o diferencial do DoD.
- **Acceptance**: `RetrieveParamsSchema {query, top_k default 5, strategy default 'hybrid'}`; `RetrieveResultSchema {skill_id, score, name, description}`.

#### Concurrency tests
(none — single-threaded)

### T3.2 — Dispatcher por strategy
- **Arquivo**: `providers/retriever-selection.ts`
- **TDD**: `test_dispatcher_routes_by_strategy` (vector|keyword|hybrid → o retriever certo); injeção explícita (seam).
- **Why this step**: troca de estratégia sem tocar o handler/domínio (DIP).
- **Acceptance**: `createDispatchingRetriever({pool, embedder})` roteia por `params.strategy`; overrides para teste.

#### Concurrency tests
(none — single-threaded)

### T3.3 — Endpoint `GET /v1/skills:retrieve`
- **Arquivo**: `handlers/skills.ts`, `app.ts`
- **TDD (integração)**: `test_retrieve_endpoint_returns_scored_results` — `GET /v1/skills:retrieve?query=...` → 200 com `{results:[{skill_id,score,...}], trace_id}`; query vazia → 400.
- **Why this step**: a superfície pública do DoD; parse de query params → retriever → score.
- **Acceptance**: rota registrada; parse `query`/`topK`/`strategy`; valida via schema; 400 em query vazia; resposta com score.

#### Concurrency tests
(none — single-threaded)

### T3.4 — Métrica time-to-relevant-skill
- **Arquivo**: `handlers/skills.ts`
- **TDD (integração)**: `test_retrieve_emits_latency_metric` — o handler loga `retrieve` com `latency_ms` + `top_score` + `result_count` (capturado via logger injetado).
- **Why this step**: north-star observável no caminho do retrieve (DoD item 3).
- **Acceptance**: log estruturado por request com latência e top score.

#### Concurrency tests
(none — single-threaded)

## Phase 4 — Eval + benchmark + E2E

### T4.1 — Eval set Recall@5 ≥ 0.85
- **Arquivo**: `eval/dataset.json`, `eval/run-recall.ts`, `tests/integration/m4-recall.integration.test.ts`
- **TDD (integração)**: `test_recall_at_5_meets_target` — indexar o dataset (skills) → para cada query, o expected skill está no top-5 (hybrid); Recall@5 ≥ 0.85.
- **Why this step**: prova mensurável e reproduzível da qualidade (DoD item 2); detecta regressão de recall.
- **Acceptance**: dataset versionado (skills + queries + expected_ids); script calcula Recall@5; teste falha se < 0.85. Honesto: medido com stub embedder; recall via FTS lexical (documentado).

#### Concurrency tests
(none — single-threaded)

### T4.2 — Benchmark p95 < 200ms
- **Arquivo**: `eval/run-recall.ts` (mede latência), `tests/integration/m4-recall.integration.test.ts`
- **TDD (integração)**: `test_retrieve_p95_under_200ms` — sobre as queries do eval, medir latências; p95 < 200ms contra Postgres real.
- **Why this step**: prova de latência (DoD item 2); GIN + HNSW em corpus pequeno << 200ms.
- **Acceptance**: p95 das queries do eval < 200ms; reproduzível.

#### Concurrency tests
(none — single-threaded)

### T4.3 — E2E híbrido
- **Arquivo**: `tests/integration/m4-retrieve.integration.test.ts`
- **TDD (integração)**: `test_index_then_retrieve_hybrid_scored` — criar skills → aguardar embedding → `GET retrieve` (hybrid) retorna a skill relevante no topo com score; vector/keyword também retornam.
- **Why this step**: prova ponta-a-ponta do fluxo (DoD item 1) contra Postgres + pg-boss reais.
- **Acceptance**: retrieve híbrido ordena por score; estratégias funcionam; score presente.

#### Concurrency tests
(none — single-threaded)

## Drawbacks & Risks

| Drawback / Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Qualidade de busca abaixo do alvo (Recall@5) | Média | Alto | Eval set desde o início; RRF calibration-free; embedder trocável (M3); ajuste do eval/queries documentado |
| Score híbrido pouco intuitivo (frações ~1/60) | Alta | Baixo | Documentado na resposta ("não comparar score entre estratégias"); clientes ordenam, não interpretam magnitude |
| p95 acima de 200ms sob corpus grande | Baixa | Médio | GIN (FTS) + HNSW (vetor); 2 queries paralelas; bench mede; corpus do eval é pequeno (DoD) |
| `search_text` dessincronizado em algum caminho de escrita | Baixa | Médio | Mantido nas 3 vias do skills-store (única via de escrita); testes cobrem create/update-metadata/add-revision |

## Failure scenarios

External I/O = Postgres (FTS + pgvector queries) + o `EmbeddingProvider` (embeda a query no caminho vector/hybrid). Cenários:

- **Embedder indisponível / timeout** (vector/hybrid) → o retrieve do componente vetorial lança; no hybrid, o keyword ainda responde (degradação graciosa via `.catch`). Teste: `test_hybrid_degrades_when_vector_or_keyword_fails`.
- **Query FTS malformada** (operadores, aspas) → `websearch_to_tsquery` NUNCA lança (vs `to_tsquery`); retorna resultados ou vazio. Teste: `test_keyword_handles_multiword_and_operators_without_throwing`.
- **Dimensão do embedder ≠ 1536** → `assertEmbeddingDim` rejeita antes do SQL (sem vazar erro pg). Teste no vector retriever.
- **Postgres indisponível** → o handler propaga erro 5xx; sem resultado parcial. Documentado.

## Unresolved Questions

(none — every decision is resolved at plan time)

Escopo travado: RRF k=60 calibration-free; FTS síncrono em `skills.search_text`; eval com stub
embedder (recall via FTS, honesto); endpoint GET com query params; strategy default hybrid, topK 5.

## Test Plan

- **Unit (core)**: ParamBuilder ($N global); RRF fusion (soma, ordenação, degradação); contrato retrieve (defaults, score).
- **Integração (api)**: FTS column/GIN; manutenção de search_text (create/metadata/add-revision); vector/keyword/hybrid contra Postgres real; endpoint retrieve (200 + score, 400 query vazia); métrica de latência; Recall@5 ≥ 0.85; p95 < 200ms; E2E indexar→retrieve.
- **Gates**: typecheck, lint, code-quality (PASS), deps-audit (zero novas deps), 100% dos DoD.
