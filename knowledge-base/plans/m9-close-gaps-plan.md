---
slug: m9-close-gaps
milestone_id: M9
version: 1.2
created_at: 2026-06-23
goal: Fechar os 7 gaps de engenharia do cross-validation vs ACE até a suíte de aceite do M9 passar verde.
generated_by: to-plan
source: knowledge-base/discoveries/blueprints/theokit-registry-contract-blueprint.md + the cross-validation audit report (under cross-validation-output/, gitignored)
---

# Plan: M9 — Fechar todos os gaps do cross-validation (engenharia)

## Goal

Fechar os 7 gaps de disciplina de engenharia (tracing, scrubbing, backoff, CLI init+read commands,
test markers, provider seam) de modo que a suíte de aceite do M9 (E2E de propagação de `trace_id` +
scrubbing + schedule de backoff + CLI init/read + seleção por marker + registry de embedder) passe
**100% verde** com typecheck + lint limpos.

## Context

Sétimo milestone (deps M2 webhook + M5 CLI, ambos `[x]`). Prior art já estabelecida — NÃO re-descoberta:
o relatório do cross-validation (em `cross-validation-output/`, audit gitignored, gaps com citações ACE
`file:line`) e o blueprint `theokit-registry-contract` (ACE observability/tracing/scrubbing estudados).
Escopo travado pelo owner como "todos os 7 gaps". Decisão-chave (ADR-1): o M9 entrega um **seam de
trace-context mínimo** (geração/propagação de `trace_id` W3C-compatível + injeção no log), NÃO o SDK
OpenTelemetry completo — o M8 adota o seam e adiciona exporters por cima, evitando dupla instrumentação.

## Baseline Context (deep review of current state)

Repo @ git `7fe7ba1` (pós-M5/v0.6.0). Monorepo pnpm (`packages/{core,api,cli}`). Logger estruturado
mínimo já existe; webhooks dependem do retry nativo do pg-boss; embedder-selection é stub|openai.

### Files that will be touched

| File | LoC | Estado | Mudança em M9 |
|---|---|---|---|
| `packages/api/src/server/observability/trace-context.ts` | novo | criar | seam: gera/parseia/propaga `trace_id` (W3C traceparent-compatível) |
| `packages/api/src/server/logger.ts` | 23 | existe | scrubbing de chaves sensíveis no `write()`; aceitar `trace_id` nos fields |
| `packages/api/src/server/handlers/skills.ts` | 297 | existe | `enqueueOperation` (:101) origina `trace_id`, injeta no jobData + logs |
| `packages/api/src/server/worker.ts` | 185 | existe | `OnOperationTerminal` payload ganha `trace_id`; propaga aos logs terminais |
| `packages/api/src/server/webhooks/webhook-delivery-worker.ts` | 134 | existe | loga `data.trace_id`; sender usa política de backoff explícita |
| `packages/api/src/server/webhooks/webhook-enqueuer.ts` | ~70 | existe | trace_id no callback + grava na delivery row; send-options de backoff |
| `packages/api/src/server/webhooks/webhook-reconciler.ts` | ~? | existe | re-enqueue lê `trace_id` da delivery row (EC-1) |
| `packages/api/src/server/store/webhook-endpoints-store.ts` | ~? | existe | delivery row carrega `trace_id` (EC-1) |
| `packages/api/src/server/queue/queue.ts` | ~? | existe | `WebhookDeliveryJobData` + tipos de jobData carregam `trace_id` |
| `packages/api/src/server/resilience/backoff.ts` | novo | criar | política pura exponencial + full jitter, capada (testável) |
| `packages/api/src/server/providers/embedder-selection.ts` | 27 | existe | vira registry de `{detect,create}` (OCP seam) |
| `packages/cli/src/config.ts` | novo | criar | ler/gravar `.theoskillrc` (registry URL/auth) |
| `packages/cli/src/commands/init.ts` | novo | criar | `theoskill init` |
| `packages/cli/src/commands/read.ts` | novo | criar | `status`/`get`/`list`/`revisions` (espelham a API HTTP) |
| `packages/cli/src/args.ts` | 51 | existe | novos comandos + resolução de config |
| `packages/cli/src/index.ts` | 55 | existe | dispatch dos novos comandos |
| `packages/cli/src/commands/publish.ts` | 87 | existe | lê config (flags opcionais) |
| `rules/testing.md` | — | existe | documenta a taxonomia de markers (slow/live/integration) |

### Current callers / dependents

- `createJsonLogger` — instanciado em `app.ts`, `wiring.ts`, `server.ts`; consumido por todos handlers/workers (`grep` confirmou 10 sítios). Mudar o `write()` afeta TODOS os logs (escopo intencional do scrubbing).
- `enqueueOperation` (skills.ts:101) — chamado por POST/PATCH/DELETE `/v1/skills`. Origem natural do `trace_id`.
- `selectEmbedder` (embedder-selection.ts:23) — chamado por `embed-worker.ts` e `app.ts`. Refactor preserva a assinatura pública.
- `createWebhookEnqueuer` (webhook-enqueuer.ts) — produz o hook `OnOperationTerminal` (worker.ts:16), disparado quando a operação fica terminal; usa outbox transacional + reconciler.
- CLI `main` (index.ts) — dispatch atual: validate/publish/help; `runPublish` lê flags `--registry/--skill-id`.

### Domain glossary

- **trace_id** — identificador de correlação de uma requisição/ingestão, propagado ponta-a-ponta; formato W3C `traceparent`-compatível (hex 32).
- **scrubbing** — redação de valores sensíveis (chaves casando o conjunto sensível) antes de emitir o log.
- **full jitter** — backoff = `random(0, min(cap, base·2^attempt))` (AWS Architecture Blog); evita thundering herd.
- **provider seam** — registry ordenado de `{detect(env)→bool, create()→EmbeddingProvider}` resolvendo o primeiro match (OCP).
- **LRO** — Long-Running Operation; mutações de skill viram operação assíncrona + job pg-boss.

### Architecture boundaries affected

- `rules/architecture.md`: trace-context, backoff e logger são **infraestrutura** da camada `api/server` — não entram no `core` domain (sem nova porta no core). O provider seam fica em `api/server/providers` (composição); o domínio `core` mantém os ports `EmbeddingProvider`. CLI consome a API por HTTP.

## Prior Art & Related Work

- **Interno:** o relatório do cross-validation (audit em `cross-validation-output/`, gitignored — gaps #1–#7
  com citações ACE `file:line`); `knowledge-base/discoveries/blueprints/theokit-registry-contract-blueprint.md`
  (Corner 4 — boundary registry vs runtime).
- **Referências (clonadas):** `knowledge-base/references/agentic-context-engine/ace/observability/__init__.py`
  (Logfire scrubbing callback), `knowledge-base/references/agentic-context-engine/ace/tracing/_wrapper.py`
  (trace/span wrapper), `knowledge-base/references/agentic-context-engine/pyproject.toml` (tenacity retry/backoff).
- **Externo:** W3C Trace Context (`traceparent` header); AWS "Exponential Backoff and Jitter" (full jitter).
- **Decisão de divergência:** NÃO adotamos o SDK OpenTelemetry completo agora (vs ACE/M8) — ADR-1 abaixo.

## Objective

Entregar os 7 fixes com TDD + wiring triad, em 4 fases coesas + validação de integração, sem workaround:
cada fix tem teste RED-first, caller de produção e métrica/log observável.

## ADRs

### ADR-1 — Trace-context mínimo (sem SDK OpenTelemetry) que o M8 adota

**Decisão:** o M9 implementa um módulo `trace-context` próprio (gera/parseia/propaga um `trace_id`
hex-32 compatível com W3C `traceparent`), e injeta `trace_id` em cada log do caminho
HTTP→operation→job→webhook. NÃO adiciona o `@opentelemetry/*` SDK.
**Alternativa rejeitada:** instalar o OpenTelemetry SDK + exporters agora. Rejeitada porque (a) o M8
já tem no DoD "OpenTelemetry: traces + métricas", e instrumentar nos dois milestones duplica trabalho e
faz spans colidirem (risco #1 do roadmap); (b) o DoD do M9 pede "rastreável ponta-a-ponta **via logs**",
o que o seam mínimo entrega sem o peso do SDK (YAGNI / parsimony ladder rung 2-5). O M8 adota este seam
como a fonte do `trace_id` e adiciona exporters por cima. Rationale cita `rules/architecture.md`
(infra na camada api) + Regra 11 (YAGNI).

### ADR-2 — Backoff explícito como função pura, aplicado via send-options do pg-boss

**Decisão:** extrair `computeBackoff(attempt)` puro (exponencial + full jitter, capado) e derivar dele as
send-options de retry do job de entrega (retryLimit/retryDelay/retryBackoff), em vez de confiar no default
implícito do pg-boss.
**Alternativa rejeitada:** re-enfileiramento manual com `setTimeout` por tentativa. Rejeitada por
reinventar o agendador de retry que o pg-boss já provê (Regra 9 — não reinvente) e introduzir estado
fora da fila. A função pura dá o teste de schedule que o DoD exige sem reimplementar a fila.
**Comportamento de runtime (EC-2 — honestidade, Regra 3):** em runtime o pg-boss aplica backoff
**exponencial** a partir de `retryDelay` (`retryBackoff:true`) — ele NÃO chama nossa função por tentativa,
então o **full-jitter não é aplicado pela fila**. O full-jitter é a política documentada que o teste
unitário fixa e que qualquer caminho de retry in-handler usa; NÃO afirmamos jitter no nível da fila.

### ADR-3 — Provider seam como registry ordenado (OCP), provider novo é YAGNI-deferido

**Decisão:** `selectEmbedder` passa a iterar um array `PROVIDER_REGISTRY` de `{name, detect, create}` e
retorna o primeiro `detect(env)` verdadeiro (fallback stub). Adicionar um provider = adicionar uma
entrada (OCP), sem editar a função.
**Alternativa rejeitada:** já implementar um 3º provider (ex.: Cohere/Bedrock). Rejeitada por YAGNI
(Regra 11) — não há segundo consumidor real além de openai; entregamos o **seam + testes** e registramos
o deferimento. O seam satisfaz o DoD ("≥1 provider além de stub|openai OU o seam documentado pronto").

## Drawbacks & Risks

| Risco | Sev | Mitigação | Owner |
|---|---|---|---|
| Tracing do M9 colide/duplica com o OTel do M8 | Alta | ADR-1: seam único e mínimo que o M8 adota; documentar o ponto de adoção no módulo | dev |
| Scrubbing redige demais (falso positivo) ou de menos (vaza) | Média | conjunto explícito de chaves + sufixos; teste com segredo conhecido + teste de `secret_findings` preservado | dev |
| Backoff via send-options não cobre 100% do timing do pg-boss | Média | testar a função pura de schedule; ADR-2 documenta que o pg-boss aplica exponencial (sem jitter) | dev |
| Provider seam é YAGNI sem 2º consumidor | Baixa | ADR-3: entregar só o seam + testes; deferimento documentado | owner |
| CLI config (`.theoskillrc`) com auth em texto → risco de secret | Média | nunca logar o conteúdo; doc recomenda permissão 600; consumidor ignora no git | dev |

## Unresolved Questions

(none — every decision is resolved at plan time)

## Dependencies

**Nenhuma dependência nova** (runtime ou dev). Decisão deliberada (Regra 9 / parsimony ladder):

| Necessidade | Resolvido com | Por quê (sem dep nova) |
|---|---|---|
| trace_id (geração/hex) | `node:crypto` `randomBytes` (stdlib) | ADR-1 — seam mínimo, sem `@opentelemetry/*` SDK (esse é o M8) |
| backoff exponencial + jitter | função pura própria + `Math.random` injetável | ADR-2 — sem `tenacity`/`p-retry`; pg-boss já agenda o retry |
| config CLI (`.theoskillrc`) | `node:fs` + `JSON` (stdlib) | sem lib de config |
| test markers | convenção de nome + filtro `-t` do vitest (já instalado) | sem plugin de markers |
| provider seam | refactor de código existente | OCP puro, sem lib |

Zero CVEs a auditar (nada novo entra no manifest). `/deps-audit` é PASS trivial.

## Dependency Graph

```
Phase 1 (Observability: trace-context + scrubbing)  ──┐
Phase 2 (Resilience: backoff)  ── depende de P1 (loga trace_id no sender) ─┤
Phase 3 (CLI DX: init + read)  ── independente (paraleliza com P1/P2) ─────┤→ Final: Integration Validation
Phase 4 (Test markers + Provider seam)  ── independente ───────────────────┘
```

## Phase 1: Observability — trace-context seam + log scrubbing

### T1.1 — Scrubbing de chaves sensíveis no logger

#### Objective
O `createJsonLogger().write()` redige valores cujas chaves são sensíveis antes do `JSON.stringify`.
**Match preciso (EC-3):** redige quando a chave (lowercased) está EXATAMENTE em `{authorization, password,
token, secret}` OU termina com `_token`/`_secret`/`_key`/`_password`. Assim `secret_findings` (diagnóstico
de TIPOS, não valores — `skills.ts:73`) NÃO é redigido por engano.

#### Why this step (action + reasoning)
**Ação:** adicionar um `scrubFields()` puro chamado dentro de `write()` em `logger.ts`.
**Raciocínio:** gap #2 do cross-validation (ACE `ace/observability/__init__.py:47` scrubbing_callback). O
logger é o único ponto de saída estruturada (Baseline: 10 call sites), então redigir em `write()` cobre
todos os hops com uma mudança (DRY). Não enfraquece error-handling.

#### Evidence
`logger.ts:9` (`write` faz `...fields`); cross-validation gap #2 (medium).

#### Files to edit
- `packages/api/src/server/logger.ts` (existe, 23 LoC)
- `packages/api/src/server/logger.test.ts` (NEW — co-localizado, convenção `rules/testing.md`)

#### Deep file dependency analysis
`write()` é privado, chamado por `info`/`error`. Mudança é interna — assinatura pública `Logger` intacta;
nenhum caller muda.

#### TDD
- RED `redacts_authorization_value`: `logger.info({ authorization: 'Bearer abc' }, 'x')` → a linha JSON `contains` `"authorization":"[REDACTED]"` e nunca `abc`.
- RED `keeps_benign_field`: `{ skill_id: 'pdf' }` → a linha JSON `contains` `"skill_id":"pdf"`.
- RED `redacts_suffix_token_case_insensitive`: `{ API_TOKEN: 'zzz' }` → `contains` `[REDACTED]`.
- RED (EC-3) `preserves_secret_findings`: `{ secret_findings: ['config.env: AWSKey'] }` → a linha `contains` `config.env` (valor preservado, NÃO redigido).

#### Concurrency tests (only when applicable)
(none — single-threaded)

#### Acceptance Criteria
- O teste `logger.test.ts::redacts_authorization_value` passa: a saída `contains` `"authorization":"[REDACTED]"` e NUNCA `abc`.
- O teste `logger.test.ts::preserves_secret_findings` passa: a saída `contains` `config.env`.
- `pnpm --filter @usetheo/skillregistry-api lint` retorna exit `0` (0 warnings).

#### DoD
- `pnpm --filter @usetheo/skillregistry-api test` passa para `logger.test.ts` (exit `0`).

### T1.2 — Módulo trace-context (gerar/parsear/propagar trace_id)

#### Objective
Criar `trace-context.ts` com `newTraceId()` (hex-32), `parseTraceparent(header)` e
`traceFields(traceId)` para injeção uniforme em logs.

#### Why this step
**Ação:** novo módulo `observability/trace-context.ts` puro (sem deps externas).
**Raciocínio:** gap #1 + ADR-1 — seam mínimo W3C-compatível que o M8 adota. Pure module = testável e
sem acoplar OTel agora (YAGNI). Base para T1.3.

#### Evidence
gap #1 (high); ACE `ace/tracing/_wrapper.py:52`; `retrieve.ts` já emite um `trace_id` (precedente interno).

#### Files to edit
- `packages/api/src/server/observability/trace-context.ts` (NEW)
- `packages/api/src/server/observability/trace-context.test.ts` (NEW)

#### Deep file dependency analysis
Novo módulo, sem callers ainda — T1.3 o consome. `newTraceId` usa `node:crypto randomBytes` (stdlib, Regra 9).

#### Pseudo-code / Signatures
```ts
export function newTraceId(): string;                 // 32 hex chars
export function parseTraceparent(h: string | undefined): string | undefined; // extrai trace-id de "00-<32hex>-<16hex>-01"
export function traceFields(traceId: string): { trace_id: string };
```

#### TDD
- RED `newTraceId_returns_32_lowercase_hex`: o retorno `matches` `^[0-9a-f]{32}$`.
- RED `parseTraceparent_extracts_traceid`: `parseTraceparent('00-<32hex>-<16hex>-01')` `equals` `<32hex>`.
- RED `parseTraceparent_returns_undefined_on_malformed`: header ruim/ausente `returns` `undefined`.
- RED `traceFields_wraps_under_trace_id`: `traceFields('abc')` `equals` `{ trace_id: 'abc' }`.

#### Concurrency tests
(none — single-threaded)

#### Acceptance Criteria
- O teste `trace-context.test.ts::newTraceId_returns_32_lowercase_hex` passa: retorno `matches` `^[0-9a-f]{32}$`.
- O teste `parseTraceparent_returns_undefined_on_malformed` passa: header inválido `returns` `undefined`.
- `pnpm --filter @usetheo/skillregistry-api typecheck` retorna exit `0`.

#### DoD
- `trace-context.test.ts` passa (exit `0`); `grep '@opentelemetry' package.json` `returns` vazio (0 deps novas).

### T1.3 — Propagar trace_id por HTTP → operation → job → webhook (logado em cada salto)

#### Objective
Originar `trace_id` no boundary (`enqueueOperation`), carregá-lo no jobData + delivery row, e logá-lo em
cada `logger.info/error` do caminho (enqueue, worker terminal, webhook delivery).

#### Why this step
**Ação:** ler `traceparent` (ou gerar) em `enqueueOperation`; adicionar `trace_id` ao jobData, ao payload
do `OnOperationTerminal` e à delivery row; `worker.ts` e `webhook-delivery-worker.ts` logam o trace_id.
**Raciocínio:** gap #1 — uma ingestão fica rastreável ponta-a-ponta. Usa T1.2. Wiring triad: caller
(boundary), integration test (E2E), métrica observável (campo `trace_id` no log).

#### Evidence
`skills.ts:101` enqueueOperation; `queue/queue.ts` WebhookDeliveryJobData; `worker.ts:16` OnOperationTerminal.

#### Files to edit
- `packages/api/src/server/handlers/skills.ts` (existe — origina trace_id; gera se header `traceparent` ausente/malformado)
- `packages/api/src/server/worker.ts` (existe — `OnOperationTerminal` payload ganha `trace_id`)
- `packages/api/src/server/webhooks/webhook-enqueuer.ts` (existe — recebe trace_id no callback, grava na delivery row + jobData)
- `packages/api/src/server/webhooks/webhook-delivery-worker.ts` (existe — loga `data.trace_id`)
- `packages/api/src/server/webhooks/webhook-reconciler.ts` (existe — re-enqueue lê `trace_id` da delivery row)
- `packages/api/src/server/store/webhook-endpoints-store.ts` (existe — delivery row carrega `trace_id`)
- `packages/api/src/server/queue/queue.ts` (existe — tipos de job carregam `trace_id`)
- `packages/api/tests/integration/trace-propagation.integration.test.ts` (NEW)

#### Deep file dependency analysis
`enqueueOperation` é o seam único de mutação (DRY) — originar o trace_id ali cobre create/update/delete.
O jobData já é `Record<string, unknown>` espalhado no insert (skills.ts:128) — `trace_id` é aditivo.
**EC-1 (crítico):** o webhook é disparado pelo hook `OnOperationTerminal` (worker.ts:16) — o worker TEM o
trace_id do seu jobData, então passa-o no payload do callback. MAS o webhook usa **outbox transacional +
reconciler** (webhook-enqueuer doc): a delivery row é persistida antes do send, e o reconciler re-enfileira
órfãos. Para o trace sobreviver ao re-enqueue, ele é **persistido na delivery row** e relido pelo reconciler.

#### TDD
- RED unit `enqueueOperation_logs_trace_id`: o mock logger captura um campo `trace_id` que `matches` `^[0-9a-f]{32}$`.
- RED unit (EC-4) `enqueueOperation_generates_traceid_on_malformed_header`: com `traceparent: 'garbage'`, o log `trace_id` `matches` `^[0-9a-f]{32}$` (header ruim não ecoado).
- RED unit `delivery_handler_logs_row_trace_id`: o log de entrega `equals` o `trace_id` da delivery row.
- RED integration `trace_id_flows_create_to_webhook`: publica skill com webhook endpoint; o log de enqueue da operação e o log de entrega do webhook `equals` o MESMO `trace_id`.
- RED integration (EC-1) `reconciler_reenqueue_preserves_trace_id` (concurrent test): força um órfão, roda o reconciler, e o log de entrega `equals` o trace_id original lido da row.

#### Concurrency tests (only when applicable)
- `concurrent test` `concurrent_ingestions_distinct_trace_ids`: 5 publishes concorrentes (pg-boss workers async) → os 5 `trace_id` nos logs são distintos (invariante de não-vazamento entre jobs).

#### Acceptance Criteria
- O teste integration `trace_id_flows_create_to_webhook` passa: o log de enqueue e o de entrega `equals` o mesmo `trace_id`.
- O teste `concurrent_ingestions_distinct_trace_ids` passa: 5 ingestões concorrentes `emit` 5 trace_ids distintos.
- O teste `reconciler_reenqueue_preserves_trace_id` passa: o trace_id `equals` o original após re-enqueue.

#### DoD
- `trace-propagation.integration.test.ts` passa (exit `0`) com `THEOSKILL_PG_URI` setado.

## Phase 2: Resilience — backoff explícito

### T2.1 — Política de backoff pura (exponencial + full jitter, capada)

#### Objective
`computeBackoff(attempt, opts)` puro: `random(0, min(capMs, baseMs·2^attempt))`, determinístico via RNG injetável.

#### Why this step
**Ação:** novo `resilience/backoff.ts` + RNG injetável para teste determinístico.
**Raciocínio:** gap #3 + ADR-2 — função pura dá o "teste unitário sobre o schedule de delays" que o DoD
exige, sem reinventar a fila (Regra 9). RNG injetável evita flakiness (testing.md — sem aleatoriedade real).

#### Evidence
gap #3 (low); ACE `pyproject.toml` tenacity; AWS full-jitter.

#### Files to edit
- `packages/api/src/server/resilience/backoff.ts` (NEW)
- `packages/api/src/server/resilience/backoff.test.ts` (NEW)

#### Deep file dependency analysis
Módulo novo, puro. RNG default `Math.random` mas injetável (`opts.rng`) — testing.md proíbe aleatoriedade real em unit.

#### Pseudo-code / Signatures
```ts
export interface BackoffOpts { baseMs: number; capMs: number; rng?: () => number; }
export function computeBackoff(attempt: number, opts: BackoffOpts): number; // ms, 0..min(cap, base*2^attempt)
export function toPgBossRetry(opts: BackoffOpts): { retryDelay: number; retryBackoff: true };
```

#### TDD
- RED `grows_exponentially_before_cap`: com `rng=()=>1`, a sequência `equals` `base, 2·base, 4·base`.
- RED `is_bounded_by_cap`: `computeBackoff(big, {base,cap})` `equals` `capMs`.
- RED `full_jitter_floor_zero`: com `rng=()=>0`, `computeBackoff(3, …)` `equals` `0`.
- RED `toPgBossRetry_maps_base_backoff`: `returns` `{ retryDelay: base, retryBackoff: true }`.
- RED (EC-5) `large_attempt_returns_cap`: `computeBackoff(64, …)` `equals` `capMs` (nunca `Infinity`/`NaN`).
- RED (EC-5) `negative_attempt_clamped`: `computeBackoff(-1, …)` `equals` `computeBackoff(0, …)`.

#### Concurrency tests
(none — single-threaded)

#### Acceptance Criteria
- O teste `backoff.test.ts::is_bounded_by_cap` passa: `computeBackoff(big,…)` `equals` `capMs`.
- O teste `large_attempt_returns_cap` passa: o retorno nunca `equals` `Infinity` nem `NaN`.
- O teste `full_jitter_floor_zero` passa: `returns` `0` quando `rng=()=>0`.

#### DoD
- `backoff.test.ts` passa (exit `0`).

### T2.2 — Wirear backoff no enqueue de entrega de webhook

#### Objective
O webhook-enqueuer aplica `toPgBossRetry(policy)` nas send-options do job de entrega (substitui o default implícito).

#### Why this step
**Ação:** o enqueuer passa a derivar retryDelay/retryBackoff da política de T2.1.
**Raciocínio:** gap #3 — torna o backoff explícito e desacoplado dos defaults do pg-boss (ADR-2). Wiring:
caller (enqueuer), integration test (job enfileirado com as opções), observável (log do retry já existe).

#### Evidence
`webhook-enqueuer.ts` `WEBHOOK_DELIVERY_SEND_OPTIONS`; `webhook-delivery-worker.ts` retry classification.

#### Files to edit
- `packages/api/src/server/webhooks/webhook-enqueuer.ts` (existe)
- `packages/api/src/server/queue/queue.ts` (existe — `WEBHOOK_DELIVERY_SEND_OPTIONS` deriva da política)
- `packages/api/tests/contract/webhook-enqueuer.contract.test.ts` (existe — assertar send-options)

#### Deep file dependency analysis
O enqueuer chama `queue.send(JOB_NAMES.WEBHOOK_DELIVERY, data, options)` com `WEBHOOK_DELIVERY_SEND_OPTIONS`. Derivar de `toPgBossRetry` é aditivo.

#### TDD
- RED `delivery_job_enqueued_with_explicit_backoff`: a fake queue captura `options` cujo `retryBackoff` `equals` `true` e `retryDelay` `equals` o base da política.

#### Concurrency tests
(none — single-threaded)

#### Acceptance Criteria
- O teste `webhook-enqueuer.contract.test.ts::delivery_job_enqueued_with_explicit_backoff` passa: `options.retryBackoff` `equals` `true`.
- As send-options `equals` o resultado de `toPgBossRetry(policy)` (não o default do pg-boss).

#### DoD
- `webhook-enqueuer.contract.test.ts` passa (exit `0`).

## Phase 3: CLI DX — init + read commands

### T3.1 — `theoskill init` + leitura de config (`.theoskillrc`)

#### Objective
`theoskill init --registry <url> [--auth <token>]` grava `.theoskillrc` (JSON); um loader lê e mescla com flags.

#### Why this step
**Ação:** `cli/src/config.ts` (read/write) + `commands/init.ts`; `args.ts` resolve config→flags.
**Raciocínio:** gaps #4/#5 (ACE `ace/cli/setup.py:1`) — publish sem flags repetidas. Config local elimina fricção.

#### Evidence
gap #4; `publish.ts:21` (args com registry/skillId).

#### Files to edit
- `packages/cli/src/config.ts` (NEW), `packages/cli/src/commands/init.ts` (NEW)
- `packages/cli/src/args.ts` (existe — comando `init` + `loadConfig`)
- `packages/cli/src/index.ts` (existe — dispatch `init`)
- `packages/cli/tests/contract/config.contract.test.ts` (NEW), `packages/cli/tests/contract/init.contract.test.ts` (NEW)

#### Deep file dependency analysis
`config.ts` usa `node:fs` (stdlib). `init` é injetável (deps `{ writeConfig, out }`) para teste sem tocar disco real (tmp dir).

#### TDD
- RED `init_writes_registry_auth`: após `runInit`, o arquivo `.theoskillrc` `contains` `"registry"` e `"auth"`.
- RED `loadConfig_returns_empty_when_no_file`: `loadConfig('/nonexistent')` `returns` `{}`.
- RED `flags_override_config`: com config `registry=A` e flag `--registry B`, o resolvido `equals` `B`.
- RED (EC-6) `loadConfig_returns_empty_on_malformed_json`: arquivo corrompido → `loadConfig` `returns` `{}` (não lança).

#### Concurrency tests
(none — single-threaded)

#### Acceptance Criteria
- O teste `init.contract.test.ts::init_writes_registry_auth` passa: o arquivo `contains` `"registry"`.
- O teste `flags_override_config` passa: o valor resolvido `equals` o da flag.
- O teste `loadConfig_returns_empty_on_malformed_json` passa: `returns` `{}` sem lançar; e o stdout do init nunca `contains` o valor de auth.

#### DoD
- `config.contract.test.ts` + `init.contract.test.ts` passam (exit `0`).

### T3.2 — publish lê config (flags opcionais)

#### Objective
`runPublish` resolve registry/skillId de flags OU config; erro claro se ambos ausentes.

#### Why this step
**Ação:** `publish.ts` recebe config resolvida; flags continuam ganhando.
**Raciocínio:** gap #4 — fecha o loop do init. Wiring: caller (main), test (publish sem flags usa config).

#### Evidence
`publish.ts:21` args; T3.1 `loadConfig`.

#### Files to edit
- `packages/cli/src/commands/publish.ts` (existe)
- `packages/cli/tests/contract/publish.contract.test.ts` (existe — adicionar caso config-resolved)

#### Deep file dependency analysis
`runPublish` recebe `deps` injetáveis; adicionar `config` é aditivo, flags continuam tendo precedência.

#### TDD
- RED `publish_uses_config_registry_when_flag_omitted`: sem `--registry`, o `fetch` é chamado com a URL do config (`equals`).
- RED `publish_exits_2_when_no_registry_anywhere`: sem flag e sem config, `runPublish` `returns` `2` e a saída `contains` `registry`.

#### Concurrency tests
(none — single-threaded)

#### Acceptance Criteria
- O teste `publish_uses_config_registry_when_flag_omitted` passa: o `fetch` URL `equals` a do config.
- O teste `publish_exits_2_when_no_registry_anywhere` passa: `returns` `2` e a saída `contains` `registry`.

#### DoD
- `publish.contract.test.ts` passa (exit `0`).

### T3.3 — Read commands: status / get / list / revisions

#### Objective
`theoskill {status <op_id>|get <skill_id>|list|revisions <skill_id>}` chamam a API HTTP e imprimem JSON; exit codes scriptáveis.

#### Why this step
**Ação:** `commands/read.ts` (4 sub-ações via `fetch`), `args.ts` + `index.ts` dispatch.
**Raciocínio:** gap #5 (ACE 8 subcommands) — espelha `/v1/operations/:id`, `/v1/skills/:id`, `/v1/skills`, `/v1/skills/:id/revisions`. Reusa o transporte HTTP (blueprint Q4: HTTP direto).

#### Evidence
gap #5; rotas existentes (`handlers/skills.ts`, `handlers/operations.ts`).

#### Files to edit
- `packages/cli/src/commands/read.ts` (NEW)
- `packages/cli/src/args.ts`, `packages/cli/src/index.ts` (existem)
- `packages/cli/tests/contract/read.contract.test.ts` (NEW)
- `packages/cli/tests/integration/cli-read.integration.test.ts` (NEW — contra registry in-process via testkit)

#### Deep file dependency analysis
`read.ts` recebe `fetch` injetável (mesmo seam de publish) → testável com fake fetch + E2E via `startTestRegistry`.

#### TDD
- RED `get_fetches_skill_by_id`: `get pdf` chama o `fetch` com URL que `contains` `/v1/skills/pdf`.
- RED `list_status_revisions_hit_correct_routes`: cada comando chama a URL que `contains` a rota respectiva (`/v1/skills`, `/v1/operations/`, `/revisions`).
- RED `non_200_exits_1`: resposta 404 → `returns` `1` e a saída `contains` o erro.
- RED (EC-7) `get_without_id_exits_2_usage`: `get` sem id `returns` `2` e a saída `contains` `usage`.
- RED (EC-7) `read_sends_auth_header_from_config`: com config auth, o `fetch` init `contains` o header `Authorization`.

#### Concurrency tests
(none — single-threaded)

#### Acceptance Criteria
- O teste `get_fetches_skill_by_id` passa: a URL do `fetch` `contains` `/v1/skills/pdf`.
- O teste `non_200_exits_1` passa: `returns` `1` em resposta 404.
- O teste `read_sends_auth_header_from_config` passa: o header `Authorization` `equals` o token do config.

#### DoD
- `read.contract.test.ts` passa (exit `0`); `cli-read.integration.test.ts` passa com `THEOSKILL_PG_URI` setado.

## Phase 4: Test markers + Provider seam

### T4.1 — Taxonomia de test markers (slow/live/integration) documentada

#### Objective
Definir convenção de marker por nome de teste (`[slow]`/`[live]`) + comando de seleção do vitest, documentada em `rules/testing.md § Test markers`.

#### Why this step
**Ação:** doc em `rules/testing.md` + script `test:fast` no package.json que filtra via `-t`.
**Raciocínio:** gap #6 (ACE `tests/conftest.py:1` markers). Vitest não tem markers nativos como pytest →
convenção de nome + filtro `-t` é o caminho parsimonioso (Regra 10). Sem dep nova.

#### Evidence
gap #6; vitest configs existentes (`vitest.contract.config.ts`).

#### Files to edit
- `rules/testing.md` (existe — nova seção `## § Test markers`)
- `package.json` (root — script `test:fast` via `-t`)
- `packages/api/tests/contract/marker-selection.contract.test.ts` (NEW — prova executável do comando)

#### Deep file dependency analysis
Doc + script + 1 teste-exemplo. Não muda comportamento de teste existente (aditivo).

#### TDD
- RED (executável) `marker_selection_excludes_slow`: dado um teste nomeado `[slow] …`, o comando `test:fast` (vitest `-t` com a regex documentada) NÃO o executa — asserta via contagem de testes rodados (`equals` esperado sem o slow). Se o `-t` não suportar a regex, o teste fixa o comando alternativo documentado em `rules/testing.md`.

#### Concurrency tests
(none — single-threaded)

#### Acceptance Criteria
- `rules/testing.md` `contains` a seção `## § Test markers` com a taxonomia (slow/live/integration).
- O teste `marker_selection_excludes_slow` passa: o comando `test:fast` roda um número de testes que `equals` o total menos os `[slow]`.

#### DoD
- `grep '§ Test markers' rules/testing.md` `returns` 1 ocorrência; `marker-selection.contract.test.ts` passa (exit `0`).

### T4.2 — Provider seam: registry ordenado de embedders (OCP)

#### Objective
`selectEmbedder` itera `PROVIDER_REGISTRY` (`{name, detect, create}`) e retorna o primeiro match (fallback stub).

#### Why this step
**Ação:** refatorar `embedder-selection.ts` para um array de regras (OCP); manter assinatura pública.
**Raciocínio:** gap #7 + ADR-3 — seam extensível sem editar a função; YAGNI: NÃO adicionar 3º provider real.

#### Evidence
gap #7 (info/YAGNI); `embedder-selection.ts:23`; ACE `ace/providers/pydantic_ai.py:1` (auto-detect).

#### Files to edit
- `packages/api/src/server/providers/embedder-selection.ts` (existe)
- `packages/api/tests/contract/embedder-selection.contract.test.ts` (existe ou NEW)

#### Deep file dependency analysis
`selectEmbedder` é chamado por embed-worker + app — assinatura preservada; comportamento idêntico (openai se key, senão stub). Refactor é estrutural.

#### TDD
- RED `picks_openai_when_key_set`: com `OPENAI_API_KEY` setado, `selectEmbedder().provider` `equals` `'openai'`.
- RED `falls_back_to_stub`: sem key, `selectEmbedder().provider` `equals` `'stub'`.
- RED `explicit_injection_wins`: `selectEmbedder({explicit})` `equals` `explicit`.
- RED `registry_order_honored`: a primeira entrada cujo `detect` `returns` `true` é a escolhida (prova OCP).

#### Concurrency tests
(none — single-threaded)

#### Acceptance Criteria
- O teste `picks_openai_when_key_set` passa: `.provider` `equals` `'openai'`.
- O teste `falls_back_to_stub` passa: `.provider` `equals` `'stub'`.
- O teste `registry_order_honored` passa: a entrada de maior precedência cujo `detect` `returns` `true` é a escolhida; o código `contains` um comentário YAGNI sobre não adicionar 3º provider.

#### DoD
- `embedder-selection.contract.test.ts` passa (exit `0`).

## Coverage Matrix

| # | Gap (requisito) | Task(s) | Como é resolvido |
|---|---|---|---|
| #1 | Tracing end-to-end | T1.2, T1.3 | seam trace-context + propagação HTTP→op→job→webhook logada |
| #2 | Scrubbing de logs | T1.1 | redação no `write()` do logger |
| #3 | Backoff jittered explícito | T2.1, T2.2 | política pura + send-options do pg-boss |
| #4 | CLI init (config local) | T3.1, T3.2 | `theoskill init` + publish lê config |
| #5 | CLI read commands | T3.3 | status/get/list/revisions via HTTP |
| #6 | Test marker taxonomy | T4.1 | convenção + doc em rules/testing.md + comando de seleção |
| #7 | Provider breadth (seam) | T4.2 | registry OCP + YAGNI deferido |

100% dos 7 gaps mapeados.

## Global Definition of Done

- `pnpm -r test` (contract) `returns` exit `0`; `pnpm test:integration` `returns` exit `0` com `THEOSKILL_PG_URI`.
- `pnpm -r typecheck` + `pnpm -r lint` `returns` exit `0` (0 warnings).
- `/code-quality m9-close-gaps` `verdict` ∈ `{PASS, PASS_WITH_CAVEATS}`.
- `CHANGELOG.md` `[Unreleased]` `contains` as entradas do M9.
- Wiring triad por feature: caller + integration test + log/métrica observável.
- Budget de arquivo: cada arquivo novo `< 500` LoC (`rules/architecture.md`).
- ADR-1 do seam de tracing escrito em `knowledge-base/adrs/` (coordenação com M8).

## Failure scenarios (when I/O external)

Toca I/O externo (webhook HTTP sender; CLI→registry HTTP). Cenários:

- **Webhook sender — 5xx do endpoint:** o handler lança → pg-boss reagenda com o backoff explícito (T2.2); o teste reproduz com um sender que `returns` `500` e asserta o re-enqueue + send-options.
- **Webhook sender — erro de rede/timeout:** o sender rejeita → retry transitório; o log `contains` o `trace_id` (T1.3).
- **Webhook sender — SSRF rebind no delivery:** `UrlSafetyError` → `markFailed` não-retriável (comportamento M2 preservado; coberto).
- **CLI read — registry inacessível:** o `fetch` rejeita → `returns` `2` e a saída `contains` `could not reach the registry` (T3.3).
- **CLI read — 404/non-200:** `returns` `1` e a saída `contains` o erro (T3.3).

## Final Phase: Integration Validation (MANDATORY)

### Execution
```bash
pnpm -r typecheck && pnpm -r lint
pnpm -r test                                   # contract (todos os pacotes)
THEOSKILL_PG_URI='postgresql://theoskill:theoskill@localhost:5435/theoskill' \
  pnpm --filter @usetheo/skillregistry-api test:integration   # incl. trace-propagation E2E
THEOSKILL_PG_URI=... pnpm --filter @usetheo/skillregistry-cli test:integration  # cli-read E2E
python3 .claude/skills/code-quality/scripts/run_code_quality.py m9-close-gaps --no-network
```

### Acceptance Criteria
- Toda a cadeia `returns` exit `0`: typecheck, lint, contract, integração (incl. E2E de trace + cli-read), code-quality `verdict` ∈ `{PASS, PASS_WITH_CAVEATS}`.
- Os 7 gaps da Coverage Matrix com tasks DONE + wiring triad.

### If Validation Fails
- O loop de validação do `/implement` corrige um FAIL por iteração (TDD), nunca enfraquece teste/cap.
