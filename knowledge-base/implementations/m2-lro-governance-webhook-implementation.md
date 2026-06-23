---
slug: m2-lro-governance-webhook
milestone_id: M2
plan: knowledge-base/plans/m2-lro-governance-webhook-plan.md
completed_at: 2026-06-23
verdict: IMPLEMENTATION_COMPLETE
---

# M2 — LRO robusto + governança + webhook — Implementation Summary

Implementação do milestone M2 em 5 fases TDD. Estado final: typecheck PASS, lint 0/0,
testes core 18 + api contract 34 + integração 30 (82 total), todos verdes.

## Phase 1 — Operation lifecycle (commit 045db68)

- Estados explícitos `CREATING`/`UPDATING`/`DELETING` → `ACTIVE`/`FAILED` (`OperationStateSchema`).
- Idempotência via header `Idempotency-Key` → coluna `operations.idempotency_key` com índice
  parcial único (`WHERE idempotency_key IS NOT NULL`); resend retorna a mesma operação.
- Classificação de retry no worker (`runOperationJob`): regra de negócio
  (`SkillAlreadyExistsError`/`NonRetriableOperationError`) ou última tentativa → `FAILED` sem
  retry; transiente → throw (pg-boss retry com backoff). No-op idempotente em operação terminal.
- DELETE de skill convertido em LRO assíncrono (202 + poll).
- Migration 0003 (idempotency_key + tabelas webhook).

### Wiring triad
- Caller: `enqueueOperation` (handlers/skills.ts) + `runOperationJob` (worker.ts).
- Integration test: `operation-lifecycle.integration.test.ts` (idempotência + business-rule-no-retry).
- Runtime metric: logs estruturados `${jobName} done|failed` com `operation_id`/`state`.

## Phase 2 — Webhook security primitives (commit 6960fb9)

- `url-safety.ts` — SSRF guard `assertPublicUrl`: bloqueia schemes não-http(s), IPs
  privados/loopback/link-local/CGNAT/metadata (IPv4+IPv6 literais) e resolve DNS, rejeitando
  hostnames que apontam para IP privado. `DnsResolver` injetável (DIP).
- `webhook-signing.ts` — HMAC-SHA256 esquema Inngest `t=<ts>&s=<hex>`, janela de replay ±5min,
  `timingSafeEqual` com guarda de tamanho/hex prévia.
- `webhook-sender.ts` — adapter HTTP do port `WebhookSender` (timeout + `redirect: manual`).
- Tests contract: url-safety (6 famílias de IP + scheme), signing (round-trip/tamper/expired/malformed), sender.

## Phase 3 — Endpoints repository + CRUD (commit 22487b3)

- `webhook-endpoints-store.ts` — port + adapter pg: `create`/`getPublicById`/`listPublic`/`remove`/
  `listActiveForEvent` (filtro jsonb `@>`)/`getInternalById`/`recordDelivery`/`getDeliveryById`/
  `stampEnqueued`/`markDelivered`/`markFailed` (terminal-once)/`claimOrphanedDeliveries`
  (`FOR UPDATE SKIP LOCKED` CTE).
- `handlers/webhook-endpoints.ts` — POST (valida URL via SSRF guard, segredo retornado **uma vez**),
  GET list, GET/:id, DELETE. Wired em `app.ts` com `dnsResolver` injetável.
- Integration test: CRUD + filtro de evento + ciclo de delivery + orphan claim (7 casos).

## Phase 4 — Delivery pipeline (este commit)

- `webhook-enqueuer.ts` — `onTerminal` hook: fan-out transacional (outbox: `recordDelivery` antes do
  `queue.send`; `singletonKey`=delivery_id dedup).
- `webhook-delivery-worker.ts` — classificação de retry (2xx=delivered / 3xx-4xx=non-retriable /
  5xx=throw→retry→dead-letter) + DLQ handler (markFailed em retries esgotados). Idempotente.
- `webhook-reconciler.ts` — `runOnce()` recupera órfãos (recorded mas nunca enqueued) via claim
  atômico; `startWebhookReconciler` com setInterval (unref).
- Wiring em `server.ts`: delivery worker + DLQ + reconciler; drain order
  server → reconciler → queue → pool.

## Phase 5 — E2E pipeline tests (este commit)

- `webhook-delivery.integration.test.ts` — 4 casos contra DB + pg-boss reais com sender programável:
  1. Happy path: skill.created → webhook assinado entregue (assinatura verificada contra o segredo).
  2. 4xx → falha permanente (uma tentativa, sem retry).
  3. 5xx → retry com backoff → entregue na recuperação.
  4. Crash-window: delivery órfão recuperado pelo reconciler e entregue.

## Decisões

- `onTerminal` dispara em ACTIVE **e** FAILED; `state` no payload distingue o desfecho.
- DLQ marca `failed` em retries esgotados; tabela `webhook_deliveries` é a fonte de verdade.
- `markDelivered`/`markFailed` são terminais-uma-vez (`WHERE delivered_at IS NULL AND failed_at IS NULL`).
- ZERO novas dependências (node:crypto/dns/net + pg-boss) — Unbreakable Rule 9.
