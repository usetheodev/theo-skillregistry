---
slug: m3-embeddings-pgvector
milestone_id: M3
created_at: 2026-06-23
goal: Embeddings plugáveis (port EmbeddingProvider + stub/openai, "local" via baseURL) indexados em pgvector(1536) com geração assíncrona no worker, reindex idempotente e guard de dimensão fail-fast.
generated_by: to-plan
source_blueprint: knowledge-base/discoveries/blueprints/m3-embeddings-pgvector-blueprint.md
---

# Plan: M3 — Embeddings plugáveis + indexação (pgvector)

## Goal

Gerar e indexar embeddings vetoriais de cada revisão de skill para habilitar busca por intenção
(fundação do M4 / north-star Recall@5 ≥ 0.85). Provider plugável via porta `EmbeddingProvider`
(DIP) com adapters `stub` (determinístico, CI/offline) e `openai` (SDK; `local` = mesmo adapter com
`OPENAI_BASE_URL` apontando para servidor openai-compatible). Embedding de
`name + description + corpo SKILL.md`, persistido em coluna `vector(1536)` (pgvector) com índice
HNSW cosine; geração **assíncrona** no worker pg-boss (job `embed_skill`), fora do caminho da LRO;
reindex **idempotente** na atualização; **guard de dimensão fail-fast** (rejeita provider ≠ 1536).

## Context

Quarto milestone (depende de M1, entregue v0.2.0; estende a infra de fila/worker do M2 v0.3.0).
Reusa o padrão de embedders validado em produção no theo-rag (Rule 9) — port, stub, openai SDK,
schema `vector(1536)` + HNSW, idempotência por `ON CONFLICT DO NOTHING`. Escopo travado pelo owner
(2026-06-23): `local` via baseURL do openai; dimensão fixa 1536 + guard fail-fast.

## Baseline Context (deep review of current state)

Repo @ git `eae1d7a` (pós-M2/v0.3.0). Container `theoskill_pgvector` (port 5435) tem pgvector 0.5.1
disponível (não instalado — `CREATE EXTENSION` no M3).

### Files that will be touched

| File | LoC | Estado | Mudança em M3 |
|---|---|---|---|
| `packages/core/src/infrastructure/db/schema.ts` | ~150 | existe | + customType `vector(1536)`; + tabela `embeddings`; + coluna `skill_revisions.skill_md` |
| `packages/core/src/index.ts` | ~55 | existe | exporta o port + tipos de embedder + tabela embeddings |
| `packages/core/package.json` | — | existe | + `pgvector`, `tiktoken`; + optionalDependency `openai` |
| `packages/api/src/server/queue/queue.ts` | ~70 | existe | + JOB_NAMES.EMBED_SKILL + EmbedSkillJobData + send options |
| `packages/api/src/server/store/skills-store.ts` | ~210 | existe | persistir `skill_md` na revisão (create + addRevision) |
| `packages/api/src/server/handlers/skills.ts` | ~290 | existe | capturar `validated.skillMd`; enfileirar `embed_skill` no terminal da operação |
| `packages/api/src/server/worker.ts` | ~175 | existe | onTerminal (ACTIVE) enfileira embed; (alternativamente hook dedicado) |
| `packages/api/src/server.ts` | ~75 | existe | criar queue EMBED_SKILL; registrar embed worker; selecionar embedder no boot (guard dim) |
| `packages/api/src/server/app.ts` | ~70 | existe | injeção do embedder (DIP) — opcional p/ testes |

### New files (M3)

- `packages/core/src/domain/embedders/types.ts` (port `EmbeddingProvider` + tipos)
- `packages/core/src/domain/embedders/stub-embedder.ts` (determinístico, L2-normalizado)
- `packages/core/src/domain/embedders/openai-embedder.ts` (SDK openai + baseURL + backoff)
- `packages/core/src/domain/embedders/index.ts` (barrel)
- `packages/api/src/server/providers/embedder-selection.ts` (env → provider + guard dim)
- `packages/api/src/server/store/embeddings-store.ts` (upsert idempotente + query)
- `packages/api/src/server/webhooks/`… (n/a)
- `packages/api/src/server/embed/embed-worker.ts` (handler do job `embed_skill`)

### Current callers / dependents

`skills.ts` cria/atualiza revisão via `skills-store` (`createWithRevision`/`addRevision`) e enfileira
operação; `worker.ts::runOperationJob` marca ACTIVE e dispara `onTerminal` (já existe — usado pelo
webhook do M2). M3 acopla o enqueue de `embed_skill` ao mesmo ponto terminal (ACTIVE de create/update).

### Domain glossary

| Term | Meaning |
|---|---|
| embedding | vetor denso (1536 floats) que representa o significado do texto de uma skill |
| revision | snapshot imutável de uma skill (payload + frontmatter); o embedding é por revisão |
| EmbeddingProvider | porta DIP que abstrai o gerador de embeddings (stub/openai) |
| HNSW | índice de vizinhança aproximada do pgvector para busca por similaridade |
| cosine distance | operador `<=>` do pgvector; `1 - (a <=> b)` = similaridade cosseno |
| pinned dimension | dimensão fixa (1536) validada por guard fail-fast a cada embedding |

### Architecture boundaries affected

- **domain** (`core/src/domain/embedders`): port + adapters puros (stub/openai); zero dependência de infra.
- **infrastructure** (`core/src/infrastructure/db`): customType `vector(1536)` + tabela embeddings.
- **application/worker** (`api/src/server/embed`, `providers`): selection + embed worker orquestram o port; o domínio não conhece pg-boss nem o banco.
- **interface** (`api/src/server/handlers/skills.ts`): apenas enfileira o job; nenhuma lógica de embedding no handler (SRP).

## Dependencies

| Ecosystem | Package | Version | Papel | Rule 9 |
|---|---|---|---|---|
| npm | `pgvector` | ^0.2.1 | encoding SQL do vetor (`toSql`) | lib madura; não reinventar serialização |
| npm | `tiktoken` | ^1.0.22 | truncation por tokens (limite do modelo openai) | tokenizer oficial; não reinventar BPE |
| npm | `openai` | ^6.41.0 (optionalDependency) | SDK de embeddings (prod + "local" via baseURL) | SDK oficial; não reinventar cliente HTTP |

`/deps-audit` obrigatório antes do código (CVE + versão). `openai` é optionalDependency: ausente no
CI; o stub não a importa.

## Coverage Matrix

| Goal claim | Task(s) |
|---|---|
| Port `EmbeddingProvider` (DIP) + adapter stub determinístico | T1.1, T1.2 |
| Adapter openai (SDK; `local` via baseURL) | T1.3 |
| Coluna `vector(1536)` pgvector + índice HNSW cosine + extensão | T2.1 |
| Embedding de name+description+corpo SKILL.md (corpo persistido na revisão) | T2.2, T3.2 |
| Geração assíncrona no worker (job `embed_skill`) | T3.1, T3.3 |
| Reindex idempotente na atualização | T3.4 |
| Guard de dimensão fail-fast (boot + por embedding) | T1.4, T3.3 |
| Seleção de provider por env sem tocar o domínio | T3.1 |
| Integração: criar skill → embedding presente e consultável; troca de provider | T4.1, T4.2 |

## Phase 1 — Embedder port + adapters (core)

### T1.1 — Port `EmbeddingProvider` + tipos
- **Arquivo**: `packages/core/src/domain/embedders/types.ts`
- **TDD**: `test_embedder_port_types_resolve` — um `EmbeddingProvider` stub satisfaz `embed(text) → Promise<number[]>`, `embedBatch`, `provider`, `model`; `EMBEDDING_DIM === 1536`. Assert: `expect((await e.embed('x')).length).toBe(1536)`.
- **Why this step**: o port é o contrato DIP que desacopla domínio de provider; sem ele os adapters não têm alvo. Espelha `theo-rag/.../embedders/types.ts`.
- **Acceptance**: port exportado; constante `EMBEDDING_DIM=1536`; tipos `EmbedOptions`.

#### Concurrency tests
(none — single-threaded).


### T1.2 — Stub embedder determinístico
- **Arquivo**: `packages/core/src/domain/embedders/stub-embedder.ts`
- **TDD**: `test_stub_embed_is_deterministic_and_l2_normalized` — `embed('abc')` duas vezes → vetores idênticos; norma L2 ≈ 1.0; dim 1536. `test_stub_distinct_text_distinct_vector`.
- **Why this step**: o stub permite testes unitários/integração offline e determinísticos (sem custo/rede). Base de toda a pirâmide.
- **Acceptance**: SHA-256 seeded, L2-normalizado, dim configurável (default 1536), determinístico.

#### Concurrency tests
(none — single-threaded).


### T1.3 — OpenAI embedder (SDK + baseURL + backoff)
- **Arquivo**: `packages/core/src/domain/embedders/openai-embedder.ts`
- **TDD**: `test_openai_embedder_calls_client_and_returns_vector` — cliente openai **injetado/mock** retorna `{data:[{embedding:[...1536]}]}`; o adapter devolve o vetor. `test_openai_embedder_passes_base_url_and_dimensions`. `test_openai_embedder_truncates_via_tokenizer` (mock tokenizer).
- **Why this step**: caminho de produção; `local` é este adapter com `OPENAI_BASE_URL`. Cliente injetável = testável sem rede.
- **Acceptance**: SDK openai v6; `baseURL`/`dimensions` configuráveis; backoff em erro transitório; AbortSignal honrado.

#### Concurrency tests
(none — single-threaded).


### T1.4 — Barrel + guard de dimensão
- **Arquivo**: `packages/core/src/domain/embedders/index.ts`
- **TDD**: `test_assert_embedding_dim_rejects_mismatch` — `assertEmbeddingDim([...1535])` lança `EmbedderError`; `assertEmbeddingDim([...1536])` passa.
- **Why this step**: centraliza o contrato de dimensão (fail-fast) reusado no boot e no worker.
- **Acceptance**: barrel exporta port/adapters/erros; `assertEmbeddingDim` + `EmbedderError`.

#### Concurrency tests
(none — single-threaded).


## Phase 2 — Schema + migração pgvector

### T2.1 — customType vector(1536) + tabela embeddings + índice HNSW + extensão
- **Arquivo**: `packages/core/src/infrastructure/db/schema.ts` + migration gerada
- **TDD (integração)**: `test_embeddings_table_accepts_1536_vector_and_cosine_query` — após `CREATE EXTENSION vector` + migration, inserir um vetor 1536 e rodar `ORDER BY vector <=> $q` retorna linha; índice HNSW existe (`pg_indexes`).
- **Why this step**: a coluna+índice são o substrato físico da busca semântica; sem eles não há onde indexar.
- **Acceptance**: customType `vector(1536)`; tabela `embeddings(id, revision_id FK cascade, provider, model, dimensions, vector, create_time)`, `unique(revision_id, provider, model)`, índice `USING hnsw (vector vector_cosine_ops)`; extensão habilitada no bootstrap.

#### Failure scenarios
ver seção `## Failure scenarios` (extensão ausente → erro claro no bootstrap).


#### Concurrency tests
(none — single-threaded).


### T2.2 — Coluna `skill_revisions.skill_md`
- **Arquivo**: `schema.ts` + `skills-store.ts`
- **TDD (integração)**: `test_revision_persists_skill_md_body` — `createWithRevision({..., skillMd})` grava o corpo; `addRevision` idem.
- **Why this step**: o texto a embeddar (corpo SKILL.md) precisa estar disponível ao worker sem re-unzip do payload; persistir no ingest é KISS.
- **Acceptance**: coluna `skill_md text not null` (default '' para linhas legadas via migration); store grava o valor de `validated.skillMd`.

#### Concurrency tests
(none — single-threaded).


## Phase 3 — Seleção + embed worker + enqueue

### T3.1 — Seleção de provider (env) + guard no boot
- **Arquivo**: `packages/api/src/server/providers/embedder-selection.ts`
- **TDD**: `test_select_embedder_uses_stub_without_api_key` / `test_select_embedder_uses_openai_with_api_key` / `test_select_embedder_honors_explicit_injection`.
- **Why this step**: a troca de provider sem tocar o domínio (DoD) acontece aqui; o boot valida a dimensão uma vez (fail-fast).
- **Acceptance**: `OPENAI_API_KEY` presente → openai (com `OPENAI_BASE_URL` opcional); senão stub; injeção explícita (seam de teste) vence; guard de dim no boot.

#### Concurrency tests
(none — single-threaded).


### T3.2 — Job `embed_skill` + enqueue no terminal
- **Arquivo**: `queue.ts` (+ `EmbedSkillJobData`), `worker.ts`/`skills.ts` (enqueue)
- **TDD (integração)**: `test_active_operation_enqueues_embed_job` — concluir create → existe job `embed_skill` com `{revision_id, skill_id}`.
- **Why this step**: desacopla a geração do embedding do caminho da resposta (risco custo/latência do ROADMAP).
- **Acceptance**: `JOB_NAMES.EMBED_SKILL`; send options com retry/backoff; enqueue disparado no ACTIVE de create/update (reusa `onTerminal`/ponto terminal).

#### Concurrency tests
(none — single-threaded).


### T3.3 — Embed worker handler (gera + guard + upsert)
- **Arquivo**: `packages/api/src/server/embed/embed-worker.ts` + `store/embeddings-store.ts`
- **TDD (integração)**: `test_embed_worker_writes_queryable_embedding` — processa o job (stub) → grava linha em `embeddings`; vetor consultável por cosine. `test_embed_worker_rejects_dimension_mismatch` (embedder dim≠1536 → job falha, sem gravar).
- **Why this step**: núcleo do M3 — transforma texto em vetor indexado, com fail-fast de dimensão.
- **Acceptance**: carrega `name+description` (skills) + `skill_md` (revisão) → texto; `embedder.embed` → guard `assertEmbeddingDim` → upsert.

#### Concurrency tests
Concurrent test: `test_two_concurrent_embed_jobs_same_revision_one_row` runs two parallel embed jobs (Promise.all) for the same revision; the unique `(revision_id, provider, model)` + ON CONFLICT DO NOTHING guarantees exactly 1 row under the race.


### T3.4 — Reindex idempotente
- **Arquivo**: `embeddings-store.ts`
- **TDD (integração)**: `test_reembed_same_revision_is_idempotent` — rodar o embed 2× para a mesma revisão/provider/model → 1 linha; `test_update_creates_new_revision_new_embedding` — PATCH → nova revisão → novo embedding.
- **Why this step**: atualização e retry de job não podem duplicar nem corromper (DoD: reindex idempotente).
- **Acceptance**: `INSERT ... ON CONFLICT (revision_id, provider, model) DO NOTHING`.

#### Concurrency tests
Concurrent test (shared with T3.3): two parallel writes for the same revision resolve to 1 row via the unique constraint + ON CONFLICT DO NOTHING — concurrent reindex is idempotent.


## Phase 4 — Integração E2E + wiring

### T4.1 — E2E: criar skill → embedding presente e consultável
- **Arquivo**: `packages/api/tests/integration/m3-embeddings.integration.test.ts`
- **TDD**: `test_create_skill_then_embedding_present_and_queryable` — POST /v1/skills (stub) → poll ACTIVE → poll até embedding existir → `SELECT 1-(vector<=>$q) AS score ...` retorna a revisão; score alto para query igual ao texto.
- **Why this step**: prova o fluxo ponta-a-ponta (DoD principal) contra Postgres + pg-boss reais.
- **Acceptance**: embedding presente e ordenável por similaridade após criação.

#### Concurrency tests
(none — single-threaded).


### T4.2 — E2E: troca de provider não toca o domínio
- **Arquivo**: mesmo arquivo
- **TDD**: `test_provider_swap_does_not_touch_domain` — injeta stub vs um fake openai-compatible; o mesmo worker/port produz embeddings; o domínio (port) é idêntico.
- **Why this step**: valida o DoD de pluggabilidade (DIP) de forma observável.
- **Acceptance**: troca via selection/injeção; zero mudança no domínio.

#### Concurrency tests
(none — single-threaded).


## Drawbacks & Risks

| Drawback / Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Custo/latência da OpenAI no caminho de ingest | Média | Médio | Geração assíncrona no worker + stub no CI + truncation por tokens; backlog enfileirado pelo pg-boss |
| Dimensão fixada em 1536 cedo demais | Baixa | Médio | Guard fail-fast rejeita provider ≠ 1536; trocar exige migration + ADR (decisão consciente) |
| Embedding órfão se o job esgotar retries | Baixa | Médio | Retry com backoff; recuperável via re-PATCH; reconciler deferido (YAGNI, follow-up) |
| optionalDependency `openai` ausente em runtime | Baixa | Alto | Selection cai no stub sem `OPENAI_API_KEY`; import do openai é lazy/dinâmico no adapter |

## Failure scenarios

External I/O = OpenAI embeddings API (e o servidor openai-compatible "local"). Cenários:

- **Timeout / 5xx / rate-limit (429)** → o openai-embedder faz backoff exponencial (maxRetries); se persistir, o **job** `embed_skill` lança → pg-boss retry com backoff; esgotado → dead-letter/órfão (skill sem vetor, recuperável). Teste: `test_openai_embedder_retries_on_5xx_then_succeeds` (cliente mock).
- **Resposta malformada / dim inesperada** → `assertEmbeddingDim` rejeita (fail-fast); o job falha sem gravar vetor corrompido. Teste: `test_embed_worker_rejects_dimension_mismatch`.
- **Extensão pgvector ausente no boot** → `CREATE EXTENSION` falha com erro claro; o servidor não sobe com schema inconsistente. Teste: documentado (bootstrap script).
- **AbortSignal (shutdown)** → embed cancela sem gravar parcial; o job volta à fila. Honrado pelo SDK.

## Unresolved Questions

(none — every decision is resolved at plan time)

Escopo travado pelo owner: `local` = openai SDK + baseURL; dimensão 1536 + guard fail-fast;
reconciler de embeddings deferido (follow-up). Modelo openai default `text-embedding-3-small` (1536).

## Test Plan

- **Unit (core)**: port types; stub determinístico/L2; openai com cliente mock (sucesso, baseURL/dim, truncation, retry 5xx); guard de dimensão.
- **Integração (api)**: tabela/índice pgvector + cosine query; persistência de `skill_md`; selection por env; embed worker grava+consulta; rejeição de dim; reindex idempotente; concorrência (1 linha); E2E criar→embedding consultável; troca de provider.
- **Gates**: typecheck, lint, code-quality (PASS), deps-audit (sem CVE crítico), 100% dos DoD.
