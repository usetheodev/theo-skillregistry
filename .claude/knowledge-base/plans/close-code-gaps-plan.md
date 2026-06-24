---
slug: close-code-gaps
created_at: 2026-06-24
goal: Corrigir os 5 gaps de código (deps mortas, export morto, Clock duplicado, scrubbing raso) até knip + typecheck + lint + testes ficarem 100% verdes.
generated_by: to-plan
source: manual knip run (2026-06-24) + M9 review follow-ups (knowledge-base/reviews/m9-close-gaps-review-2026-06-23.md)
---

# Plan: close-code-gaps — corrigir gaps de código existentes

## Goal

Corrigir os 5 gaps de código (2 deps mortas/redundantes, 1 export morto, `Clock` duplicado ×5,
scrubbing raso) de modo que `knip` reporte **zero unused-dependency / dead-export do nosso código** E
typecheck + lint + a suíte de testes passem **100% verdes**.

## Context

Slice de manutenção ad-hoc (NÃO um milestone — sem `milestone_id`). Prior art já estabelecida (não
re-descoberta): a saída de um `knip` rodado manualmente em 2026-06-24 + os follow-ups MEDIUM/LOW
registrados no review do M9 (`knowledge-base/reviews/m9-close-gaps-review-2026-06-23.md`). RBAC (M6) e
OTel/rate-limiting (M8) **não** entram aqui — são milestones com DoD próprio, não gaps de código.

## Baseline Context (deep review of current state)

Repo @ git `638d535` (pós-M9/v0.7.0). Monorepo pnpm. `knip` manual + grep confirmaram cada gap abaixo.

### Files that will be touched

| File | Estado | Mudança |
|---|---|---|
| `packages/api/src/server/logger.ts` | existe (40 LoC) | scrubbing recursa um nível em valores-objeto (gap #5) |
| `packages/api/src/server/time/clock.ts` | novo | `Clock` interface + `systemClock`/`realClock` únicos (consolida ×5) |
| `packages/api/src/server/handlers/retrieve.ts` | existe | importa `Clock` do módulo único |
| `packages/api/src/server/webhooks/webhook-sender.ts` | existe | remove `Clock` local + `realClock` morto; importa do módulo |
| `packages/api/src/server/webhooks/webhook-delivery-worker.ts` | existe | importa `Clock` do módulo |
| `packages/api/src/server/webhooks/webhook-enqueuer.ts` | existe | importa `Clock` do módulo |
| `packages/api/src/server/webhooks/webhook-reconciler.ts` | existe | importa `Clock` do módulo |
| `packages/core/package.json` | existe | remove dep morta `@paralleldrive/cuid2` (gap #1) |
| `packages/api/package.json` | existe | remove dep redundante `zod` (gap #2) |

### Current callers / dependents

- `scrubFields` (logger.ts) — interno ao `write()`; chamado por todo `logger.info/error` (10 sítios). Mudar a recursão afeta a redação de todos os logs (escopo intencional).
- `Clock` — `interface { now(): Date }` idêntica em retrieve.ts + 4 webhooks; cada arquivo tem seu `systemClock` local. `realClock` (webhook-sender.ts:22) é exportado mas SEM caller (só `systemClock` é usado lá).
- `@paralleldrive/cuid2` — `core/package.json` declara mas `core/src` não importa; o `api` importa E declara (correto). `zod` — `api/package.json` declara mas `api/src` não importa direto (os schemas vêm de `@usetheo/skillregistry/contract`, no core, que declara+usa zod).

### Domain glossary

- **dep morta** — dependência declarada no `package.json` mas não importada no `src` do pacote.
- **export morto** — símbolo exportado sem nenhum importador (nem teste).
- **scrubbing raso** — redação que só inspeciona chaves top-level; um segredo aninhado num valor-objeto escapa.

### Architecture boundaries affected

- `rules/architecture.md`: o `Clock` consolidado é um utilitário de infra da camada `api/server` (sem nova porta no core). Remoções de dep não cruzam fronteira de camada. Scrubbing continua na infra do logger.

## Prior Art & Related Work

- **Interno:** `knowledge-base/reviews/m9-close-gaps-review-2026-06-23.md` (F-arch-1/F-sec-1 scrubbing shallow; F-arch hygiene). Saída de `npx knip` (2026-06-24): unused deps `zod`/`cuid2`, dead export `realClock`, `Clock` duplicado.
- **Referência (clonada):** `knowledge-base/references/agentic-context-engine/ace/observability/__init__.py` (scrubbing por callback — modelo de redação).
- **Externo:** nenhum novo.

## Objective

Eliminar os 5 gaps com TDD onde há comportamento (scrubbing) e verificação por build/knip onde é
estrutura (deps/export/Clock), sem quebrar nenhum teste existente e sem dep nova.

## ADRs

### ADR-1 — Scrubbing recursa UM nível em valores-objeto (não N níveis)

**Decisão:** `scrubFields` passa a recursar em valores que são objetos planos, redigindo chaves sensíveis
em profundidade. Limite de UM nível de objeto aninhado (suficiente para os shapes que logamos: `{ context: {...} }`).
**Alternativa rejeitada:** recursão ilimitada + detecção por padrão-de-valor (regex de token). Rejeitada por
(a) custo/complexidade desproporcional ao risco (KISS — nenhum call-site atual loga objeto aninhado, é
defense-in-depth) e (b) regex de valor gera falso-positivo/negativo frágil. Um nível cobre o vetor real
sem o peso. Cita `rules/architecture.md` (infra) + Regra 10 (KISS).

### ADR-2 — `Clock` consolidado num módulo único `api/server/time/clock.ts`

**Decisão:** extrair a interface `Clock` + `systemClock` (e o antes-morto `realClock`, agora só se tiver
caller — senão deletar) para um módulo único; os 5 arquivos importam dele.
**Alternativa rejeitada:** mover `Clock` para o `core` domain. Rejeitada por YAGNI — é um utilitário de
infra do `api/server`, sem variação de domínio; movê-lo ao core criaria acoplamento sem ganho (Regra 11).

### ADR-3 — Remover deps em vez de allowlist do knip

**Decisão:** remover `cuid2` do core e `zod` do api (ambas verdadeiramente não usadas no `src` do pacote),
em vez de suprimir o aviso do knip.
**Alternativa rejeitada:** manter a dep + suprimir via config do knip. Rejeitada porque a dep é realmente
morta; suprimir esconde dívida (Regra 9 — não carregar peso desnecessário).

## Drawbacks & Risks

| Risco | Sev | Mitigação | Owner |
|---|---|---|---|
| Remover `zod` do api quebra resolução de tipos transitiva | Média | typecheck do api roda na Integration Validation; se quebrar, zod volta (é transitivo via core) com nota | dev |
| Recursão do scrubbing redige demais (objeto benigno aninhado vira `[REDACTED]`) | Baixa | só a CHAVE sensível é redigida, não o objeto inteiro; teste de objeto benigno aninhado preservado | dev |
| Consolidar `Clock` quebra algum import | Baixa | typecheck pega; cada arquivo testado pela suíte existente | dev |

## Unresolved Questions

(none — every decision is resolved at plan time)

## Dependencies

**Nenhuma dependência nova.** O slice REMOVE 2 deps (`cuid2` do core, `zod` do api). `/deps-audit` é PASS trivial (não adiciona nada).

## Dependency Graph

```
Phase 1 (scrubbing hardening — comportamento, TDD) ──┐
Phase 2 (hygiene: deps + Clock + realClock — estrutura) ── independente ──┤→ Final: Integration Validation
```

## Phase 1: Scrubbing hardening (gap #5)

### T1.1 — `scrubFields` recursa um nível em valores-objeto

#### Objective
Uma chave sensível aninhada um nível (`{ context: { authorization: 'x' } }`) é redigida; objeto benigno aninhado é preservado.

#### Why this step (action + reasoning)
**Ação:** alterar `scrubFields` em `logger.ts` para, quando o valor for um objeto plano, recursar e redigir chaves sensíveis nele.
**Raciocínio:** follow-up MEDIUM do review M9 (F-sec-1) — o scrubber é key-based + shallow; um segredo aninhado escapa. Defense-in-depth (Rule 8 — segurança nunca sacrificada). ADR-1 limita a um nível (KISS).

#### Evidence
`logger.ts:13-21` (scrubFields shallow); review M9 F-arch-1/F-sec-1.

#### Files to edit
- `packages/api/src/server/logger.ts` (existe)
- `packages/api/tests/contract/logger.contract.test.ts` (existe — adicionar casos aninhados)

#### Deep file dependency analysis
`scrubFields` é privado, chamado por `write()`. Mudança interna; assinatura pública `Logger` intacta.

#### TDD
- RED `redacts_nested_sensitive_key`: `logger.info({ context: { authorization: 'Bearer abc' } }, 'x')` → a linha JSON `contains` `[REDACTED]` e nunca `abc`.
- RED `preserves_nested_benign_field`: `{ context: { skill_id: 'pdf' } }` → a linha `contains` `"skill_id":"pdf"`.
- RED `still_redacts_top_level` (regressão): `{ authorization: 'z' }` → `contains` `[REDACTED]`, nunca `z`.
- RED `preserves_secret_findings` (regressão EC-3): `{ secret_findings: ['t: AWSKey'] }` → `contains` `t: AWSKey`.

#### Concurrency tests (only when applicable)
(none — single-threaded)

#### Acceptance Criteria
- O teste `logger.contract.test.ts::redacts_nested_sensitive_key` passa: a saída `contains` `[REDACTED]` e NUNCA `abc`.
- O teste `preserves_nested_benign_field` passa: a saída `contains` `"skill_id":"pdf"`.
- `pnpm --filter @usetheo/skillregistry-api lint` retorna exit `0`.

#### DoD
- `logger.contract.test.ts` passa (exit `0`).

## Phase 2: Hygiene (gaps #1–#4)

### T2.1 — Consolidar `Clock` num módulo único + remover `realClock` morto

#### Objective
Uma única definição de `Clock` + `systemClock` em `api/server/time/clock.ts`; os 5 arquivos importam dela; `realClock` deletado (sem caller) ou exportado só se houver uso.

#### Why this step
**Ação:** criar `time/clock.ts` com `Clock`+`systemClock`; trocar as 5 definições locais por import; deletar `realClock`.
**Raciocínio:** DRY (`Clock` idêntico ×5) + remoção de export morto (gap #3/#4). ADR-2 (infra, não core).

#### Evidence
5 arquivos com `interface Clock` (grep); `realClock` em `webhook-sender.ts:22` sem caller (knip).

#### Files to edit
- `packages/api/src/server/time/clock.ts` (NEW)
- `packages/api/src/server/handlers/retrieve.ts`, `webhooks/webhook-sender.ts`, `webhooks/webhook-delivery-worker.ts`, `webhooks/webhook-enqueuer.ts`, `webhooks/webhook-reconciler.ts` (existem — importam o Clock único)

#### Deep file dependency analysis
Cada arquivo define `Clock` + um `systemClock` local idêntico; consumido por construtores que aceitam `clock?: Clock`. Substituir por import preserva o comportamento; `realClock` não tem importador (deletável).

#### TDD
- N/A direto (refactor estrutural sem mudança de comportamento). Verificação: `pnpm --filter @usetheo/skillregistry-api typecheck` exit `0` + a suíte existente (webhooks/retrieve) continua verde + `grep -rn 'interface Clock' packages/api/src` `returns` 1 ocorrência.

#### Concurrency tests
(none — single-threaded)

#### Acceptance Criteria
- `grep -c 'interface Clock' packages/api/src/server/time/clock.ts` `equals` `1`; as outras 5 ocorrências `equals` `0`.
- `grep -rn 'realClock' packages/api/src` `returns` vazio (export morto deletado).
- typecheck exit `0` + suíte de webhooks/retrieve verde (sem regressão).

#### DoD
- `pnpm --filter @usetheo/skillregistry-api test` (contract) exit `0`.

### T2.2 — Remover deps mortas/redundantes (`cuid2` do core, `zod` do api)

#### Objective
`core/package.json` sem `@paralleldrive/cuid2`; `api/package.json` sem `zod`; build + typecheck + testes verdes.

#### Why this step
**Ação:** remover as 2 entradas dos `package.json`; `pnpm install`.
**Raciocínio:** deps mortas (gap #1/#2) — knip confirmou que `core/src` não usa cuid2 e `api/src` não importa zod direto. ADR-3 (remover, não suprimir).

#### Evidence
knip "Unused dependencies"; grep confirmou zero import de cuid2 em core/src e de zod em api/src.

#### Files to edit
- `packages/core/package.json` (existe — remove cuid2)
- `packages/api/package.json` (existe — remove zod)

#### Deep file dependency analysis
`api` usa `createId` de cuid2 e DECLARA cuid2 (correto — fica). `core` declara cuid2 sem usar (remove). `core` usa+declara zod (fica, é onde os schemas vivem). `api` usa schemas via `@usetheo/skillregistry/contract` (re-export do core) — zod chega transitivo, a declaração direta é redundante (remove).

#### TDD
- N/A (mudança de manifest). Verificação: após remover + `pnpm install`, `pnpm -r typecheck` exit `0`, `pnpm -r test` exit `0`, e `npx knip` não lista mais `zod`/`cuid2` como unused do nosso código.

#### Concurrency tests
(none — single-threaded)

#### Acceptance Criteria
- `node -e "process.exit('@paralleldrive/cuid2' in require('./packages/core/package.json').dependencies ? 1 : 0)"` `returns` exit `0` (ausente do core).
- `node -e "process.exit('zod' in require('./packages/api/package.json').dependencies ? 1 : 0)"` `returns` exit `0` (ausente do api).
- `pnpm -r typecheck` exit `0` (remoção não quebrou tipos).

#### DoD
- `pnpm -r test` exit `0`; `npx knip 2>/dev/null | grep -E 'zod|cuid2'` `returns` vazio.

## Coverage Matrix

| # | Gap | Task | Como é resolvido |
|---|---|---|---|
| #1 | dep morta cuid2 (core) | T2.2 | remove do core/package.json |
| #2 | dep redundante zod (api) | T2.2 | remove do api/package.json |
| #3 | export morto realClock | T2.1 | deletado (sem caller) |
| #4 | Clock duplicado ×5 + tipos | T2.1 | consolida em time/clock.ts |
| #5 | scrubbing raso | T1.1 | recursão um nível em valores-objeto |

100% dos 5 gaps mapeados.

## Global Definition of Done

- `pnpm -r typecheck` + `pnpm -r lint` exit `0` (0 warnings).
- `pnpm -r test` (contract) + `pnpm test:integration` (com `THEOSKILL_PG_URI`) exit `0`.
- `npx knip 2>/dev/null` não lista `zod`/`cuid2` unused nem `realClock` dead-export do nosso código.
- `/code-quality close-code-gaps` ∈ {PASS, PASS_WITH_CAVEATS} OU FAIL_SOFT apenas por `auditor_unavailable_knip` (gap de ambiente, com knip verificado manualmente limpo).
- `CHANGELOG.md` `[Unreleased]` atualizado.
- Budget de arquivo: nenhum arquivo > 500 LoC.

## Failure scenarios (when I/O external)

(none — no external I/O touched. As mudanças são logger/refactor/deps; nenhum HTTP/DB/queue novo.)

## Final Phase: Integration Validation (MANDATORY)

### Execution
```bash
pnpm install
pnpm -r typecheck && pnpm -r lint
pnpm -r test
THEOSKILL_PG_URI='postgresql://theoskill:theoskill@localhost:5435/theoskill' pnpm -r test:integration
npx --yes knip 2>/dev/null | grep -E 'zod|cuid2|realClock' || echo "knip: gaps resolvidos"
```

### Acceptance Criteria
- Toda a cadeia exit `0`; knip não lista mais os gaps; os 5 gaps da Coverage Matrix com tasks DONE.

### If Validation Fails
- O loop de validação do `/implement` corrige um FAIL por iteração (TDD), nunca enfraquece teste/cap.
