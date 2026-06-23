---
slug: m2-lro-governance-webhook
milestone_id: M2
created_at: 2026-06-23
goal: LRO robusto (estados explícitos + idempotência + retry transient/no-retry business) + webhook de conclusão com assinatura e retry de entrega + auditoria.
generated_by: to-plan
source_blueprint: knowledge-base/discoveries/blueprints/m2-lro-governance-webhook-blueprint.md
---

# Plan: M2 — LRO robusto + governança + webhook

## Goal

Endurecer a operação de longa duração do Theo Skill Registry e adicionar governança via webhook:
estados de operação explícitos (`CREATING/UPDATING/DELETING/ACTIVE/FAILED`) com idempotência e
retry com backoff em falha transitória (e sem retry em violação de regra de negócio); entrega de
webhook na conclusão da operação com assinatura HMAC, retry de entrega e reconciliação de órfãos
(at-least-once); e auditoria rastreável de toda mutação, validada por testes de integração de
sucesso, falha e reentrega.

## Context

Terceiro milestone (depende de M1, entregue como v0.2.0). Reusa o sistema de webhook validado do
theo-rag (SSRF guard, HMAC, sender, enqueuer+outbox, delivery worker, reconciler) — zero deps
novas. O blueprint `m2-lro-governance-webhook` fixou os padrões e a máquina de estados.

## Baseline Context (deep review of current state)

Repo @ git `2dacdf7`. M0/M1 existentes que M2 estende:

### Files that will be touched

| File | LoC | Estado | Mudança em M2 |
|---|---|---|---|
| `packages/core/src/infrastructure/db/schema.ts` | 64 | existe | + `webhook_endpoints`, `webhook_deliveries`; `operations` + `idempotency_key` |
| `packages/core/src/contract/index.ts` | 46 | existe | `OperationStateSchema` migra para os 5 estados; + schemas de webhook |
| `packages/api/src/server/worker.ts` | 120 | existe | estados por tipo + idempotência + retry classification; + `delete_skill` |
| `packages/api/src/server/queue/queue.ts` | 39 | existe | retry config (skill jobs + webhook + DLQ); + `delete_skill`, `webhook_delivery` |
| `packages/api/src/server/store/operations-store.ts` | 62 | existe | estados novos + idempotência (getByIdempotencyKey) |
| `packages/api/src/server/handlers/operations.ts` | 18 | existe | reusado (GET continua) |
| `packages/api/src/server.ts` | 54 | existe | boot do delivery worker + reconciler; drain reverso |
| `packages/api/src/server/handlers/skills.ts` | ~280 | existe | Delete vira LRO (enfileira); enqueue de operação carrega idempotency_key |

### New files (M2)

`packages/api/src/server/webhooks/{url-safety,webhook-signing,webhook-sender,webhook-enqueuer,webhook-delivery-worker,webhook-reconciler}.ts`,
`packages/core/src/domain/webhook-sender.ts` (port), `packages/api/src/server/store/webhook-endpoints-store.ts` (port) + `webhook-endpoints-store-pg.ts` (adapter),
`packages/api/src/server/handlers/webhook-endpoints.ts`, `packages/core/src/domain/operation-errors.ts`.

### Current callers / dependents

Nenhum consumidor externo (Theokit provider é M7). O contrato de operação (`done`/`failed`) muda
para (`ACTIVE`/`FAILED`); sem release público consumindo, é evolução segura (pré-V1).

### Domain glossary

| Termo | Definição |
|---|---|
| Operation state | `CREATING/UPDATING/DELETING` (em progresso, por tipo) → `ACTIVE` (sucesso) / `FAILED` |
| Idempotency-Key | Header opcional → `operations.idempotency_key` único; reenvio devolve a operação |
| Webhook endpoint | Assinatura `{id, url, secret, active, event_types}`; recebe eventos de skill |
| Webhook delivery | Linha de outbox `{id, endpoint_id, event_type, payload, attempt_count, delivered_at, failed_at, enqueued_at}` |
| NonRetriableError | Erro de regra de negócio (validação/unique) — captura → sem retry, operação `FAILED` |
| Reconciler | Varredura periódica que recupera entregas órfãs (`FOR UPDATE SKIP LOCKED`) |

### Architecture boundaries affected

`core` define ports `WebhookSender`, `WebhookEndpointsRepository`, e os erros tipados; a
infra (api) provê os adapters HTTP/PG. Handlers/worker disparam a entrega via enqueuer. Sem
object storage, sem Redis. Segurança (SSRF/HMAC) copiada verbatim do theo-rag.

## Prior Art & Related Work

- Blueprint `m2-lro-governance-webhook` (padrões + citações).
- theo-rag (`/home/paulo/Projetos/usetheo/theo-data/theo-rag`): webhooks/*, queue retry config,
  schema de webhook, reconciler. M1: operações + worker.

## Objective

Implementar M2 reusando os padrões validados, com segurança copiada verbatim, deixando todos os
DoDs do ROADMAP M2 verdes.

## ADRs

### ADR-1 — Copiar os módulos de segurança do theo-rag verbatim (SSRF + HMAC)

**Decisão:** `url-safety.ts` e `webhook-signing.ts` adaptados minimamente do theo-rag.
**Rationale:** Unbreakable Rule 9 — não reinventar SSRF/cripto.
**Alternatives considered:** (a) validação de URL / assinatura caseira — rejeitado: risco de
SSRF e timing-attack; (b) lib externa de webhook — rejeitado: nenhuma adiciona valor sobre o
padrão já provado na casa e traria deps.

### ADR-2 — pg-boss nativo para retry/backoff/DLQ; `NonRetriableError` para business-rule

**Decisão:** jobs de webhook `retryLimit:5+backoff+deadLetter`; jobs de skill `retryLimit:3+backoff`;
erros de regra lançam `NonRetriable*Error` (capturado → sem retry).
**Rationale:** M2 DoD (retry transient, no-retry business); pg-boss já provê.
**Alternatives considered:** (a) fila/retry próprios — rejeitado: reinvenção (Rule 9);
(b) retry uniforme — rejeitado: retentaria violações de regra (loop inútil).

### ADR-3 — Outbox via `webhook_deliveries` + reconciler (at-least-once)

**Decisão:** a linha `webhook_deliveries` é o outbox durável; reconciler recupera órfãos
(`FOR UPDATE SKIP LOCKED`) e reenfileira idempotentemente (`singletonKey=delivery_id`).
**Rationale:** entrega at-least-once (M2 risk #1).
**Alternatives considered:** (a) entrega in-line síncrona no handler — rejeitado: perde o evento
sob endpoint lento/fora e bloqueia a request; (b) outbox transacional co-tx — rejeitado: o
enqueue do pg-boss não compõe trivialmente com a tx de domínio; o reconciler fecha a janela.

### ADR-4 — Delete vira LRO (`DELETING`) no M2

**Decisão:** delete passa a enfileirar `delete_skill` (estado `DELETING`), evoluindo a decisão
de delete-síncrono do M1.
**Rationale:** M2 DoD lista `DELETING`; permite webhook + auditoria via operação.
**Alternatives considered:** manter delete síncrono — rejeitado: não teria estado `DELETING`
nem operação auditável/webhookável.

### ADR-5 — Idempotência por `Idempotency-Key` + worker idempotente

**Decisão:** request opcionalmente traz `Idempotency-Key` → `operations.idempotency_key` único;
o worker no-op se a operação já é terminal.
**Rationale:** M2 DoD ("operações idempotentes").
**Alternatives considered:** sem idempotência — rejeitado: retry duplicaria efeitos; chave no
corpo em vez de header — rejeitado: header é a convenção (Stripe/Idempotency-Key RFC).

## Drawbacks & Risks

| Risk / Drawback | Mitigation |
|---|---|
| Webhook sem retry/assinatura vira ponto cego de entrega | HMAC + retry pg-boss + reconciler (at-least-once); teste de reentrega |
| SSRF via URL de endpoint controlada pelo usuário | `assertPublicUrl` ANTES do fetch (bloqueia IP privado/loopback/metadata); copiado verbatim |
| Operação presa/inconsistente sob falha do worker | retry transient + worker idempotente + estado terminal sempre gravado (fail-loud) |
| Mudar `done`→`ACTIVE` quebra código/testes do M1 | migração mecânica dos pollings; sem consumidor externo (pré-V1) |
| Reconciler corre contra fila parando no shutdown | `startReconciler` parado ANTES de `queue.stop` no drain (server→reconciler→queue→pool) |

## Unresolved Questions

(none — every decision is resolved at plan time) — máquina de estados, idempotência, retry,
módulos de webhook e schema estão fixados no blueprint e nos ADRs.

## Dependencies

Zero dependências novas (confirmado no blueprint Corner 2). Reusa: `pg-boss` (retry/backoff/DLQ/
singletonKey), `drizzle-orm`/`drizzle-kit`, `@paralleldrive/cuid2`, `node:crypto` (HMAC/randomBytes/
timingSafeEqual), `node:dns/promises` + `node:net` (SSRF guard).

| Ecosystem | Package | Version | Scope |
|---|---|---|---|
| (none) | — | — | M2 adiciona zero dependências (Unbreakable Rule 9 — reusa o já instalado) |

## Dependency Graph

```
T1.1 (op states+idempotência+retry) ─┐
T2.1 (ssrf) ─ T2.2 (hmac) ─ T2.3 (sender) ─┐
T3.1 (schema) ─ T3.2 (repo) ─ T3.3 (endpoints CRUD) ─┐
                                                      ▼
        T4.1 (enqueuer) ─ T4.2 (delivery worker+queue) ─ T4.3 (reconciler+boot+fire-on-terminal)
                                                      ▼
                                   T5.1 (audit + integration: success/failure/redelivery)
```

---

## Phase 1: Operation lifecycle

### T1.1 — Estados explícitos + idempotência + retry classification

#### Objective
Migrar a operação para os 5 estados, adicionar idempotência e a classificação de retry; delete vira LRO.

#### Why this step (action + reasoning — ReAct discipline)
**Action:** `OperationStateSchema` → `{CREATING,UPDATING,DELETING,ACTIVE,FAILED}`; coluna
`operations.idempotency_key` (único parcial); `NonRetriableOperationError` no `core`; worker
no-op se a operação já é terminal; create/update/delete jobs com `retryLimit:3+backoff`; delete
enfileira `delete_skill` (estado DELETING).
**Reasoning:** é a fundação da governança da LRO; webhook/audit dependem dos estados terminais.

#### Evidence
Blueprint Corner 4 (Q6) e ADR-2/ADR-4/ADR-5. theo-rag worker retriability.

#### Files to edit
`packages/core/src/contract/index.ts`, `packages/core/src/domain/operation-errors.ts`,
`packages/core/src/infrastructure/db/schema.ts`, `packages/api/src/server/store/operations-store.ts`,
`packages/api/src/server/worker.ts`, `packages/api/src/server/queue/queue.ts`,
`packages/api/src/server/handlers/skills.ts`.

#### TDD
RED: `operation-states.integration.test.ts` — create job grava `CREATING`→`ACTIVE`; update→`UPDATING`→`ACTIVE`;
delete (LRO)→`DELETING`→`ACTIVE`; violação de regra → `FAILED` sem retry; reenvio com mesma
`Idempotency-Key` devolve a MESMA operação (não cria nova). `test_operation_states_idempotency_and_retry`.
GREEN: implementar. REFACTOR: estados como constantes.

#### Concurrency tests (only when applicable)
`test_idempotent_concurrent_same_key_one_operation`: duas requests **concurrent** com a mesma
`Idempotency-Key` — a **race** resolve em exatamente uma operação criada (a unique constraint na
chave arbitra); ambas devolvem o mesmo `operation_id`. **concurrent test** (race detector na chave).

#### Acceptance Criteria
- Assert que `operations.state` percorre `CREATING|UPDATING|DELETING` → `ACTIVE`/`FAILED` por tipo de job.
- Reenvio com a mesma `Idempotency-Key` retorna `equals` o `operation_id` anterior (sem nova linha).
- Erro de regra → `FAILED` sem retry (assert `attempt` não cresce); transitório → retry (pg-boss).

#### DoD
- [ ] `pnpm test:integration` retorna `exit 0` para os testes de estado/idempotência.
- [ ] Worker é idempotente: reprocessar um job de operação terminal é `no-op` (assert).

---

## Phase 2: Webhook security primitives (copy verbatim — Rule 9)

### T2.1 — SSRF guard (`url-safety.ts`)

#### Objective
`assertPublicUrl` que bloqueia esquemas não-http(s) e IPs privados/loopback/metadata (SSRF).

#### Why this step (action + reasoning — ReAct discipline)
**Action:** copiar `url-safety.ts` do theo-rag (lookup table IPv4/IPv6 privados, `UrlSafetyError`).
**Reasoning:** a URL do endpoint é controlada pelo usuário → vetor de SSRF; reusar o guard auditado.

#### Evidence
Blueprint Corner 4 (Q4). theo-rag `webhooks/url-safety.ts`.

#### Files to edit
`packages/api/src/server/webhooks/url-safety.ts`.

#### TDD
RED: `url-safety.test.ts` — bloqueia `http://127.0.0.1`, `http://169.254.169.254` (metadata),
`http://10.0.0.1`, `ftp://x`, `http://[::1]`; aceita `https://example.com`.
`test_ssrf_blocks_private_and_metadata_ips`.
GREEN: copiar/adaptar.

#### Concurrency tests (only when applicable)
(none — single-threaded) — validação de URL é função pura/DNS sem estado compartilhado.

#### Acceptance Criteria
- Assert que IPs privados/loopback/link-local/metadata e esquemas ≠ http(s) lançam `UrlSafetyError`.
- URL pública resolve e retorna a `URL`.

#### DoD
- [ ] Testes de SSRF (privado, metadata, esquema, IPv6) verdes.

### T2.2 — HMAC signing (`webhook-signing.ts`)

#### Objective
`signWebhookBody`/`verifyWebhookSignature` (HMAC-SHA256, formato `t=&s=`, replay ±300s).

#### Why this step (action + reasoning — ReAct discipline)
**Action:** copiar `webhook-signing.ts` (HMAC + guard de comprimento/hex antes de `timingSafeEqual`).
**Reasoning:** assinatura prova autenticidade ao consumidor; cripto auditada, não reinventar.

#### Evidence
Blueprint Corner 4 (Q4). theo-rag `webhooks/webhook-signing.ts`.

#### Files to edit
`packages/api/src/server/webhooks/webhook-signing.ts`.

#### TDD
RED: `webhook-signing.test.ts` — assina e verifica round-trip (`valid:true`); rejeita assinatura
adulterada (`mismatch`), timestamp expirado (`expired`), header malformado (`malformed`).
`test_hmac_sign_verify_roundtrip_and_tamper`.
GREEN: copiar.

#### Concurrency tests (only when applicable)
(none — single-threaded) — HMAC é função pura.

#### Acceptance Criteria
- Round-trip `sign`→`verify` retorna `valid:true`; payload/assinatura adulterados → `mismatch`.
- `timingSafeEqual` só é chamado após guard de comprimento/hex (sem `RangeError`).

#### DoD
- [ ] Testes de signing (round-trip, tamper, replay, malformed) verdes.

### T2.3 — HTTP sender (`webhook-sender.ts`)

#### Objective
`WebhookSender` que faz POST com timeout e `redirect:'manual'` (defesa SSRF).

#### Why this step (action + reasoning — ReAct discipline)
**Action:** port `WebhookSender` no `core` + adapter HTTP (`createHttpWebhookSender`) na api
(timeout 15s, `AbortSignal.timeout`, `redirect:'manual'`).
**Reasoning:** isola a entrega HTTP atrás de um port (DIP) testável com fetch fake.

#### Evidence
Blueprint Corner 4. theo-rag `webhooks/webhook-sender.ts`.

#### Files to edit
`packages/core/src/domain/webhook-sender.ts`, `packages/api/src/server/webhooks/webhook-sender.ts`.

#### TDD
RED: `webhook-sender.test.ts` — com fetch fake, envia body+headers e retorna `{status}`; respeita
timeout (aborta). `test_sender_posts_with_timeout_and_manual_redirect`.
GREEN: implementar.

#### Concurrency tests (only when applicable)
(none — single-threaded) — uma chamada HTTP isolada; sem estado compartilhado.

#### Acceptance Criteria
- `send` faz POST com `redirect:'manual'` e `AbortSignal.timeout`; retorna `{status, headers}`.
- Fetch fake recebe a assinatura no header e o body JSON.

#### DoD
- [ ] Testes do sender (envio + timeout) verdes.

---

## Phase 3: Webhook persistence + endpoints CRUD

### T3.1 — Schema (endpoints + deliveries + orphan index) + migration

#### Objective
Tabelas `webhook_endpoints` e `webhook_deliveries` com índice parcial de órfãos; `operations.idempotency_key`.

#### Why this step (action + reasoning — ReAct discipline)
**Action:** `schema.ts` ganha as tabelas + colunas; migration determinística.
**Reasoning:** a persistência é o outbox durável; repo/worker dependem do schema.

#### Evidence
Blueprint Corner 4 (Q6) e Recommendations. theo-rag schema webhooks.

#### Files to edit
`packages/core/src/infrastructure/db/schema.ts`, `packages/core/src/infrastructure/db/migrations/*`.

#### TDD
RED: `schema.integration.test.ts` (estende) — `webhook_endpoints`/`webhook_deliveries` e
`operations.idempotency_key` existem após migrate. `test_migration_adds_webhook_tables`.
GREEN: schema + migration.

#### Concurrency tests (only when applicable)
(none — single-threaded) — schema/migração não têm concorrência (claim concorrente é T3.2).

#### Acceptance Criteria
- `drizzle-kit` aplica a migration com `exit 0`; assert que as tabelas constam no `information_schema`.
- Índice parcial de órfãos sobre `(delivered_at IS NULL AND failed_at IS NULL AND enqueued_at IS NULL)`.

#### DoD
- [ ] Migration commitada e aplicada; teste de schema verde.

### T3.2 — WebhookEndpointsRepository (port + adapter PG)

#### Objective
Repositório do webhook: create/listActive/recordDelivery/stampEnqueued/markDelivered/markFailed/
claimOrphanedDeliveries/getInternalById/listDeliveries.

#### Why this step (action + reasoning — ReAct discipline)
**Action:** port `WebhookEndpointsRepository` no `core`; adapter Drizzle na api (incl. claim
`FOR UPDATE SKIP LOCKED`).
**Reasoning:** encapsula o I/O do outbox (DIP); a atomicidade do claim concorrente vive aqui.

#### Evidence
Blueprint Corner 1 e 4. theo-rag webhook-endpoints-store-pg.

#### Files to edit
`packages/api/src/server/store/webhook-endpoints-store.ts`, `packages/api/src/server/store/webhook-endpoints-store-pg.ts`.

#### TDD
RED: `webhook-repo.integration.test.ts` — create gera `secret`; recordDelivery cria linha órfã;
stampEnqueued carimba; markDelivered/markFailed atualizam attempt_count; claimOrphanedDeliveries
devolve só órfãos antigos. `test_webhook_repo_outbox_lifecycle`.
GREEN: implementar.

#### Concurrency tests (only when applicable)
`test_concurrent_claim_disjoint_batches`: dois `claimOrphanedDeliveries` **concurrent** —
`FOR UPDATE SKIP LOCKED` garante que cada reconciler reivindica lotes disjuntos (sem dupla
reivindicação da mesma linha). **concurrent test** (race detector via row locks).

#### Acceptance Criteria
- `create` gera `secret` server-side (randomBytes) retornado 1x; `listActive` filtra `active`.
- `recordDelivery`→`stampEnqueued`→`markDelivered` evoluem a linha; `claimOrphanedDeliveries`
  só pega órfãos `delivered/failed/enqueued NULL` e `create_time < olderThan`.

#### DoD
- [ ] Testes do repo (outbox lifecycle + claim concorrente) verdes.

### T3.3 — Endpoints CRUD handlers

#### Objective
`POST /v1/webhook-endpoints` (secret 1x), `GET`/`LIST`, `DELETE`.

#### Why this step (action + reasoning — ReAct discipline)
**Action:** handlers que criam (valida URL via `assertPublicUrl`), listam e deletam endpoints; o
`secret` só aparece na resposta de create.
**Reasoning:** a governança exige gerenciar assinaturas; validar a URL no cadastro (fail-fast SSRF).

#### Evidence
Blueprint Recommendations. theo-rag webhook handlers.

#### Files to edit
`packages/api/src/server/handlers/webhook-endpoints.ts`, `packages/api/src/server/app.ts`.

#### TDD
RED: `webhook-endpoints-e2e.integration.test.ts` — criar com URL pública → 201 + secret; criar
com URL privada → 400 (`unsafe_url`); listar; deletar → 404 depois. `test_webhook_endpoint_crud_and_ssrf`.
GREEN: implementar.

#### Concurrency tests (only when applicable)
(none — single-threaded) — CRUD de endpoint não compartilha estado mutável crítico entre rotas.

#### Acceptance Criteria
- Create com URL pública → `201` + `secret` (uma vez); URL privada → `400` (`assertPublicUrl`).
- List retorna os endpoints; Delete remove (cascade nas deliveries); Get inexistente → `404`.

#### DoD
- [ ] E2E de CRUD de endpoint + SSRF na criação verde.

---

## Phase 4: Delivery pipeline + reconciler + wiring

### T4.1 — Enqueuer (fan-out + outbox + singletonKey)

#### Objective
`enqueueWebhookDelivery` que escreve a delivery e enfileira por endpoint ativo (best-effort + singletonKey).

#### Why this step (action + reasoning — ReAct discipline)
**Action:** copiar/adaptar `webhook-enqueuer.ts` (valida payload, `recordDelivery`, `queue.send`
com `singletonKey=delivery_id`, `stampEnqueued`).
**Reasoning:** é o ponto de fan-out + o início do outbox (idempotência).

#### Evidence
Blueprint Corner 4. theo-rag webhook-enqueuer.

#### Files to edit
`packages/api/src/server/webhooks/webhook-enqueuer.ts`, `packages/core/src/contract/index.ts` (payload schema).

#### TDD
RED: `webhook-enqueuer.integration.test.ts` — com 2 endpoints ativos, `enqueueWebhookDelivery`
cria 2 deliveries e enfileira 2 jobs; `recordDelivery` falho não interrompe o fan-out.
`test_enqueuer_fanout_and_outbox_stamp`.
GREEN: implementar.

#### Concurrency tests (only when applicable)
(none — single-threaded) — o fan-out é sequencial por endpoint; a corrida com o reconciler é
coberta por `singletonKey` (T4.3).

#### Acceptance Criteria
- Para N endpoints ativos, cria N deliveries e enfileira N jobs com `singletonKey=delivery_id`.
- Falha de `recordDelivery`/`send` num endpoint é logada e não interrompe os demais (best-effort).

#### DoD
- [ ] Teste de fan-out + outbox stamp verde.

### T4.2 — Delivery worker (retry classification) + queue retry config

#### Objective
Worker que entrega (SSRF guard → sign → send) e classifica retriabilidade; config de retry/DLQ.

#### Why this step (action + reasoning — ReAct discipline)
**Action:** copiar `webhook-delivery-worker.ts` (2xx delivered; 3xx/4xx NonRetriable→DLQ; 5xx/network
retry) + `queue.ts` com `WEBHOOK_DELIVERY_SEND_OPTIONS` (retryLimit:5, backoff, deadLetter).
**Reasoning:** entrega confiável com retry de transient e DLQ; segurança (SSRF) antes do fetch.

#### Evidence
Blueprint Corner 4 (Q5) e Corner 3. theo-rag webhook-delivery-worker + queue.

#### Files to edit
`packages/api/src/server/webhooks/webhook-delivery-worker.ts`, `packages/api/src/server/queue/queue.ts`.

#### TDD
RED: `webhook-delivery.integration.test.ts` — endpoint 2xx (fake) → `delivered_at`; 4xx → `failed_at`
sem retry (NonRetriable); 5xx → retry (attempt_count cresce). `test_delivery_retriability_classification`.
GREEN: implementar.

#### Concurrency tests (only when applicable)
(none — single-threaded) — cada job é processado por uma única tentativa do pg-boss; a corrida de
reprocessamento é evitada pelo lock de job do pg-boss.

#### Acceptance Criteria
- 2xx → `markDelivered`; 4xx/3xx → `markFailed` + NonRetriable (job não retry → DLQ); 5xx/timeout →
  `markFailed` + throw (pg-boss retry com backoff).
- SSRF guard roda ANTES do fetch; endpoint deletado → NonRetriable (drop).

#### DoD
- [ ] Teste de classificação (2xx/4xx/5xx) verde.

### T4.3 — Reconciler + boot wiring + fire-on-terminal

#### Objective
Reconciler de órfãos; boot do delivery worker + reconciler; disparar webhook quando a operação termina.

#### Why this step (action + reasoning — ReAct discipline)
**Action:** copiar `webhook-reconciler.ts` (`runReconcileOnce` + `startReconciler`); `server.ts`
inicia o worker de delivery + o reconciler; o worker de skill chama `enqueueWebhookDelivery` ao
atingir terminal (`ACTIVE`/`FAILED`).
**Reasoning:** fecha o circuito (at-least-once + emissão na conclusão) e o graceful drain reverso.

#### Evidence
Blueprint Corner 1 e 4. theo-rag webhook-reconciler + server boot.

#### Files to edit
`packages/api/src/server/webhooks/webhook-reconciler.ts`, `packages/api/src/server.ts`,
`packages/api/src/server/worker.ts`, `packages/api/src/server/queue/graceful-drain.ts` (ordem).

#### TDD
RED: `webhook-reconciler.integration.test.ts` — simula crash-window (delivery órfã) → `runReconcileOnce`
reenfileira + carimba `enqueued_at`; segunda passada `claimed==0`. `test_reconciler_recovers_orphan_once`.
GREEN: implementar.

#### Concurrency tests (only when applicable)
`test_two_reconcilers_no_double_send`: dois `runReconcileOnce` **concurrent** sobre o mesmo backlog
— `FOR UPDATE SKIP LOCKED` + `singletonKey` garantem que cada órfão é reenfileirado uma vez (sem
**race** de dupla entrega). **concurrent test**.

#### Acceptance Criteria
- `runReconcileOnce` reenfileira só órfãos antigos e carimba `enqueued_at`; reentrante seguro.
- `server.ts` inicia worker de delivery + reconciler; drain para o reconciler ANTES de `queue.stop`.
- Ao atingir `ACTIVE`/`FAILED`, a operação dispara `enqueueWebhookDelivery` (evento de skill).

#### DoD
- [ ] Teste do reconciler (recovery + idempotência) verde; webhook disparado na conclusão.

---

## Phase 5: Audit + integration

### T5.1 — Auditoria + testes de integração ponta a ponta

#### Objective
Garantir auditoria rastreável e os testes de integração de sucesso, falha e reentrega.

#### Why this step (action + reasoning — ReAct discipline)
**Action:** confirmar que `operations` (mutações) + `webhook_deliveries` (tentativas) compõem a
trilha; escrever o E2E que cria uma skill → recebe webhook (2xx), e os casos de falha/reentrega.
**Reasoning:** o M2 DoD exige auditoria testável (sucesso/falha/reentrega).

#### Evidence
Blueprint Corner 1 (testes). M2 DoD bullet 3.

#### Files to edit
`packages/api/tests/integration/m2-webhook-e2e.integration.test.ts`.

#### TDD
RED: `m2-webhook-e2e.integration.test.ts` — registrar endpoint (fake server 2xx) → criar skill →
operação `ACTIVE` → delivery `delivered_at` setado; endpoint 5xx → retry→DLQ; crash-window →
reconciler reentrega. `test_audit_success_failure_redelivery`.
GREEN: implementar.

#### Concurrency tests (only when applicable)
(none — single-threaded) — o E2E exercita o caminho assíncrono; a concorrência crítica já é
coberta nas tasks de claim/idempotência.

#### Acceptance Criteria
- Skill criada → exatamente uma delivery `delivered_at` por endpoint ativo (assert via DB).
- Endpoint 5xx → `attempt_count` cresce até o DLQ; endpoint 4xx → `failed_at` sem retry.
- Crash-window → `runReconcileOnce` reenfileira e a entrega completa.

#### DoD
- [ ] E2E de auditoria (sucesso/falha/reentrega) verde.
- [ ] Trilha auditável: `operations` + `webhook_deliveries` cobrem toda mutação.

---

## Coverage Matrix

| Goal claim | Task(s) |
|---|---|
| Estados explícitos (CREATING/UPDATING/DELETING/ACTIVE/FAILED) | T1.1 |
| Idempotência de operação | T1.1 |
| Retry com backoff (transient) / sem retry (business) | T1.1, T4.2 |
| SSRF guard na URL de endpoint | T2.1, T3.3 |
| Assinatura HMAC do webhook | T2.2, T4.2 |
| Entrega de webhook na conclusão | T4.1, T4.3 |
| Retry de entrega + DLQ | T4.2 |
| Reconciliação (at-least-once) | T4.3 |
| Endpoints CRUD (assinatura por skill/projeto) | T3.2, T3.3 |
| Auditoria rastreável + testes (sucesso/falha/reentrega) | T5.1 |

Cobertura: 100% das claims do Goal mapeadas a ≥ 1 task.

## Global Definition of Done

- Todos os DoDs por task verdes.
- `pnpm -r typecheck` + `pnpm -r lint` (0/0) limpos.
- `pnpm -r test` (contract/unit) verde sem DB.
- `pnpm -r test:integration` verde com Postgres.
- `/code-quality` ∉ {FAIL_HARD, INVALID}.
- CHANGELOG `[Unreleased]` atualizado.
- `/deps-audit` sem CVE (zero deps novas).

## Failure scenarios (when I/O external)

I/O externo: **PostgreSQL** + **HTTP para endpoints de webhook** (não-confiáveis).

| Cenário | Comportamento esperado | Teste |
|---|---|---|
| Endpoint retorna 5xx/timeout/network | `markFailed` + retry com backoff (pg-boss); esgota → DLQ | T4.2 |
| Endpoint retorna 4xx/3xx | `markFailed` + NonRetriable (sem retry) → DLQ | T4.2 |
| URL de endpoint é IP privado/metadata (SSRF) | `assertPublicUrl` lança ANTES do fetch; cadastro 400 / entrega NonRetriable | T2.1, T3.3, T4.2 |
| Crash entre `recordDelivery` e `queue.send` | reconciler recupera a delivery órfã (at-least-once) | T4.3 |
| Worker de skill falha transitório | retry com backoff; estado terminal sempre gravado | T1.1 |
| Violação de regra no worker | `FAILED` sem retry (NonRetriable) | T1.1 |
| Reenvio com mesma Idempotency-Key | devolve a operação existente (sem duplicar) | T1.1 |

## Final Phase: Integration Validation (MANDATORY)

### Execution
1. `docker compose up -d pgvector` (ou container na porta 5435).
2. `pnpm install` + aplicar migration.
3. `pnpm -r typecheck && pnpm -r lint`.
4. `pnpm -r test` (contract).
5. `THEOSKILL_PG_URI=... pnpm -r test:integration` (inclui os E2E de M2).

### Acceptance Criteria
- Todos os comandos exit 0.
- Cada caminho de falha/reentrega coberto por teste.
- Nenhum símbolo novo sem caller/teste (wiring triad).

### If Validation Fails
Loop de validação corrige a causa-raiz por iteração; nunca enfraquecer testes, nunca reinventar
segurança (SSRF/HMAC), nunca remover o retry/reconciler.
