---
slug: m0-walking-skeleton
milestone_id: M0
completed_at: 2026-06-22
plan: knowledge-base/plans/m0-walking-skeleton-plan.md
commit: e1a42dd
status: IMPLEMENTATION_COMPLETE
---

# Implementation — M0 Walking Skeleton

Walking skeleton fim-a-fim entregue na stack da casa. Todos os DoDs do ROADMAP M0 e os
critérios de aceite do plano verdes.

## Tasks & wiring triad

| Task | Caller (prod path) | Integration test | Runtime metric |
|---|---|---|---|
| T1.1 Foundation + health | `createApp` registra `GET /v1/health` | `api.contract.test.ts` (health 200) | — (liveness) |
| T2.1 Schema + migrations | migration aplicada; `schema.ts` consumido pelos stores | `stores.integration.test.ts` | — |
| T2.2 Contracts + skillId | `SkillInputSchema` no handler POST | `skill-id.test.ts`, `contract/index.test.ts` | — |
| T3.1 Stores | usados por handlers + worker | `stores.integration.test.ts` | — |
| T3.2 Queue + worker | `server.ts` registra worker; `boss.send` no POST | `worker.integration.test.ts` (sucesso/falha/concorrência) | log estruturado por job (`operation_id`, `state`) |
| T3.3 Handlers + server + E2E | `POST /v1/skills`, `GET /v1/operations/:id`, `GET /v1/skills/:id` | `m0-e2e.integration.test.ts` (criar→poll→get, 404s) | log `create_skill enqueued/done/failed` |

## DoD do ROADMAP M0

- [x] Monorepo pnpm (`core`+`api`) compila TS strict; Hono sobe `/v1/health`.
- [x] `POST /v1/skills` enfileira via pg-boss; `GET /v1/operations/{id}` reporta `done`;
  `GET /v1/skills/{id}` retorna a skill (Postgres + Drizzle + migrations).
- [x] Teste E2E criar→aguardar operação→obter skill verde.

## Gates

typecheck PASS · lint PASS · contract 15 PASS · integration 7 PASS (Postgres real) ·
build PASS · code-quality PASS (`knowledge-base/audits/m0-walking-skeleton-code-quality-2026-06-22.md`).

## Notas

- Graceful shutdown ordenado server→queue→pool (30s), idempotente (ADR-2/blueprint).
- Unique-violation mapeada para erro tipado via cadeia de `cause` (defeito real encontrado
  e corrigido pelo teste de integração durante o TDD).
- Worker no mesmo processo do server (ADR-2; separação é M2/M8).
