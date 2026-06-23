---
slug: m5-dev-cli
milestone_id: M5
created_at: 2026-06-23
goal: CLI de dev local que valida a skill (estrutura + frontmatter + limites + secret scan) com os MESMOS checks do servidor (DRY via orquestrador no core) e empacota/publica reusando a API Create/Update, com E2E validar→publicar→recuperar.
generated_by: to-plan
source_blueprint: knowledge-base/discoveries/blueprints/m5-dev-cli-blueprint.md
---

# Plan: M5 — CLI de dev local (lint/validate/test)

## Goal

Entregar uma CLI (`theoskill`) que **valida a skill localmente** antes do upload — estrutura
`SKILL.md` + frontmatter Theokit + limites de payload + secret scan — com os **MESMOS checks** da
fronteira do servidor (orquestrador único compartilhado no `core` — DRY), e que **empacota e publica**
a skill no registry reusando a API Create/Update, com saída de erro clara por arquivo/regra e teste
E2E (validar → publicar → recuperar).

## Context

Sexto milestone (depende de M1, v0.2.0 — primitivos de validação). Reusa os ports do `core`
(`PayloadValidator`/`SecretScanner`/`parseFrontmatter`) e os adapters do `api` (yauzl/secretlint).
Sem CLI na casa — greenfield. Escopo travado (2026-06-23): orquestrador `validateSkillPayload` único
no core; adapters via subpath leve do `api`; `node:util parseArgs` (stdlib, zero dep de arg-parser);
`yazl` única dep nova (empacotamento).

## Baseline Context (deep review of current state)

Repo @ git `3e6f3e6` (pós-M4/v0.5.0). Monorepo pnpm (`packages/core` + `packages/api`). A fronteira
`api/.../handlers/skills.ts::ingestPayload` orquestra os 4 checks (zip→frontmatter→secret) e lança
`BoundaryError(400, code)`. Os adapters yauzl/secretlint vivem em `api/src/server/payload/`.

### Files that will be touched

| File | LoC | Estado | Mudança em M5 |
|---|---|---|---|
| `packages/core/src/domain/skill-validation.ts` | novo | criar | orquestrador `validateSkillPayload` (4 checks, resultado estruturado) |
| `packages/core/src/index.ts` | ~90 | existe | exporta `validateSkillPayload` + tipos de resultado |
| `packages/api/src/server/handlers/skills.ts` | ~295 | existe | `ingestPayload` refatorado para chamar `validateSkillPayload` (DRY) |
| `packages/api/src/validators.ts` | novo | criar | re-exporta `createYauzlPayloadValidator` + `createSecretlintScanner` (subpath leve) |
| `packages/api/package.json` | — | existe | + `exports` (`./validators`, `./app`) |
| `packages/cli/*` | novo | criar | pacote `@usetheo/skillregistry-cli` (bin + comandos) |

### New files (M5)

- `packages/core/src/domain/skill-validation.ts` (orquestrador compartilhado)
- `packages/api/src/validators.ts` (subpath de adapters)
- `packages/cli/package.json`, `packages/cli/tsconfig.json`, `packages/cli/src/index.ts` (entry/bin),
  `packages/cli/src/commands/{validate,publish}.ts`, `packages/cli/src/args.ts`, `packages/cli/src/zip.ts`
- `packages/cli/tests/*` (unit + E2E)

### Current callers / dependents

`ingestPayload` é chamado por POST e PATCH em `skills.ts`. Refatorá-lo para `validateSkillPayload`
preserva o comportamento (mesmos códigos de erro 400). A CLI é um novo consumidor do MESMO orquestrador.

### Domain glossary

| Term | Meaning |
|---|---|
| validateSkillPayload | orquestrador único dos 4 checks (zip-safety, frontmatter, limites, secret) |
| SkillValidationResult | `{ok, name, description, frontmatter, validated}` OU `{ok:false, code, message}` |
| PayloadValidator | port (M1) de validação do zip (yauzl) — limites, traversal, symlink, ratio |
| SecretScanner | port (M1) de secret scan (secretlint preset-recommend) |
| theoskill | binário da CLI (`validate` / `publish`) |
| publish | empacota (yazl) + POST/PATCH na API Create/Update |

### Architecture boundaries affected

- **domain** (`core/src/domain/skill-validation.ts`): orquestrador puro que depende só dos ports (DIP); zero dependência de api/infra.
- **infrastructure** (`api/src/server/payload`): adapters yauzl/secretlint reusados via subpath `api/src/validators.ts` (não movidos).
- **interface/application** (`packages/cli`): wira os ports do core com os adapters do api; parse de args (stdlib); HTTP de publish (fetch).
- **interface** (`api/src/server/handlers/skills.ts`): passa a delegar ao orquestrador do core (SRP; sem lógica de validação duplicada).

## Dependencies

| Ecosystem | Package | Version | Papel | Rule 9 |
|---|---|---|---|---|
| npm | `yazl` | ^3.3.1 | escrever o zip do payload na CLI (dir → zip) | lib madura; o servidor lê com yauzl, a CLI escreve com yazl |

`node:util parseArgs` e `fetch` são stdlib (zero dep). Reuso de `@usetheo/skillregistry` (core) +
`@usetheo/skillregistry-api/validators` (adapters). `/deps-audit` confirma apenas `yazl` como nova.

## Coverage Matrix

| Goal claim | Task(s) |
|---|---|
| Orquestrador único `validateSkillPayload` (4 checks) no core | T1.1 |
| Servidor reusa o orquestrador (DRY, sem divergência) | T1.2 |
| Adapters yauzl/secretlint reusados via subpath leve do api | T2.1 |
| CLI `validate` local com os MESMOS checks + erros por regra | T3.1, T3.2 |
| CLI `publish` empacota + reusa Create/Update (POST/PATCH) | T3.3 |
| Saída de erro clara por arquivo/regra + exit codes | T3.2 |
| E2E: validar → publicar → recuperar contra registry local | T4.1 |

## Phase 1 — Orquestrador compartilhado (core)

### T1.1 — `validateSkillPayload` no core
- **Arquivo**: `packages/core/src/domain/skill-validation.ts`
- **TDD**: `test_validate_ok_returns_skill_fields` (payload válido → `{ok:true, name, description}`); `test_validate_reports_frontmatter_error` (frontmatter inválido → `{ok:false, code:'schema_invalid'}`); `test_validate_reports_secret` (segredo → `{ok:false, code:'secret_detected'}`); `test_validate_reports_zip_error` (zip inválido → code do PayloadValidationError).
- **Why this step**: a fonte única de verdade dos checks; sem ela CLI e servidor divergem (risco #1).
- **Acceptance**: ordem zip→frontmatter→secret; resultado estruturado (não lança para erros de regra); ports injetados (DIP).

#### Concurrency tests
(none — single-threaded)

### T1.2 — Servidor reusa o orquestrador
- **Arquivo**: `packages/api/src/server/handlers/skills.ts`
- **TDD (integração)**: `test_server_ingest_still_rejects_same_payloads` — os testes E2E existentes (POST inválido → 400 com o mesmo code) continuam passando após `ingestPayload` chamar `validateSkillPayload`.
- **Why this step**: prova que a refatoração preserva o comportamento da fronteira (DRY sem regressão).
- **Acceptance**: `ingestPayload` delega a `validateSkillPayload`; mapeia `{ok:false, code}` → `BoundaryError(400, code)`; testes M1 verdes.

#### Concurrency tests
(none — single-threaded)

## Phase 2 — Subpath de adapters (api)

### T2.1 — `api/src/validators.ts` + exports
- **Arquivo**: `packages/api/src/validators.ts` + `packages/api/package.json`
- **TDD**: `test_api_validators_subpath_exports_factories` — importar `@usetheo/skillregistry-api/validators` expõe `createYauzlPayloadValidator` + `createSecretlintScanner` e eles satisfazem os ports.
- **Why this step**: a CLI precisa dos MESMOS adapters do servidor sem puxar o runtime (hono/pg-boss).
- **Acceptance**: subpath `./validators` (e `./app` para o E2E) em `package.json#exports`; o subpath não importa o servidor.

#### Concurrency tests
(none — single-threaded)

## Phase 3 — Pacote CLI

### T3.1 — Esqueleto da CLI + parse de args
- **Arquivo**: `packages/cli/package.json`, `tsconfig.json`, `src/index.ts`, `src/args.ts`
- **TDD**: `test_parse_args_validate` / `test_parse_args_publish` / `test_unknown_command_errors` — `parseArgs` resolve subcomando + flags; comando desconhecido → exit ≠0 com uso.
- **Why this step**: a fronteira da CLI; parsing determinístico via stdlib.
- **Acceptance**: bin `theoskill`; `node:util parseArgs`; `--help`; exit codes definidos.

#### Concurrency tests
(none — single-threaded)

### T3.2 — Comando `validate`
- **Arquivo**: `packages/cli/src/commands/validate.ts`, `src/zip.ts`
- **TDD**: `test_validate_passes_valid_skill` (dir válido → exit 0); `test_validate_reports_each_rule_error` (frontmatter ruim / segredo → exit 1 + mensagem por regra com arquivo+regra).
- **Why this step**: o lint/validate local (DoD item 1) com os MESMOS checks.
- **Acceptance**: zip in-memory (yazl) do dir → `validateSkillPayload` (adapters do api) → render por regra; exit 0/1.

#### Concurrency tests
(none — single-threaded)

### T3.3 — Comando `publish`
- **Arquivo**: `packages/cli/src/commands/publish.ts`
- **TDD (integração)**: `test_publish_creates_then_retrievable` — `publish` valida → zip → POST /v1/skills → imprime `operation_id`; `test_publish_updates_existing` (skill existe → PATCH); `test_publish_fails_on_invalid` (não publica payload inválido).
- **Why this step**: empacotar + publicar reusando Create/Update (DoD item 2).
- **Acceptance**: valida antes de publicar; POST (novo) ou PATCH (existente, via GET /:id); base64 do zip; erros de rede com exit ≠0.
- **#### Failure scenarios**: ver `## Failure scenarios` (registry indisponível / 4xx → erro claro, sem publicar parcial).

#### Concurrency tests
(none — single-threaded)

## Phase 4 — E2E

### T4.1 — E2E validar → publicar → recuperar
- **Arquivo**: `packages/cli/tests/cli-e2e.integration.test.ts`
- **TDD (integração)**: `test_cli_validate_then_publish_then_retrieve` — contra um registry local (`createApp` + boss): `validate` (OK) → `publish` (operation ACTIVE) → `GET /v1/skills/:id` recupera a skill criada.
- **Why this step**: prova ponta-a-ponta do fluxo do autor (DoD item 3).
- **Acceptance**: fluxo completo verde contra Postgres + pg-boss reais.

#### Concurrency tests
(none — single-threaded)

## Drawbacks & Risks

| Drawback / Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Divergência entre validação CLI e servidor | Baixa | Alto | Orquestrador único `validateSkillPayload` no core; ambos chamam a MESMA função; teste de paridade |
| Secret scan com falsos positivos/negativos | Baixa | Médio | secretlint preset-recommend (consagrado); zero regex caseira; mesmo adapter do servidor |
| CLI puxa o runtime do servidor (peso) | Baixa | Baixo | Adapters via subpath leve (`./validators`) que não importa hono/pg-boss; `parseArgs`/`fetch` stdlib |
| `publish` em skill inexistente vs existente | Média | Médio | GET /:id decide POST (criar) vs PATCH (atualizar); validado antes de publicar |

## Failure scenarios

External I/O = HTTP `fetch` ao registry (comando `publish`). Cenários:

- **Registry indisponível / connection refused** → `publish` falha com mensagem clara (`não foi possível conectar ao registry <url>`) e exit ≠0; nada é publicado. Teste: `test_publish_fails_when_registry_unreachable`.
- **Registry retorna 4xx (payload rejeitado no servidor)** → a CLI mostra o `error` do corpo + exit ≠0; mas a CLI já validou localmente com os mesmos checks, então 4xx por validação é raro (paridade). Teste no E2E (payload inválido nunca chega ao POST).
- **Operação publicada fica FAILED** → `publish` (se fizer poll) reporta FAILED com o `error` da operação; exit ≠0.
- **Zip malformado pelo próprio empacotador** → improvável (yazl); `validate` local pegaria antes do publish.

## Unresolved Questions

(none — every decision is resolved at plan time)

Escopo travado: orquestrador único no core; adapters via subpath do api; `parseArgs` (stdlib) +
`yazl` (única dep nova); `publish` decide POST/PATCH via GET; saída por regra + exit codes.

## Test Plan

- **Unit (core)**: `validateSkillPayload` (ok + cada código de erro: zip, frontmatter, secret).
- **Unit (cli)**: parse de args (validate/publish/unknown); render de erro por regra.
- **Integração (api/cli)**: subpath de adapters expõe os factories; servidor reusa o orquestrador
  (testes M1 verdes); `validate` aprova/reprova; `publish` cria + recuperável, atualiza existente,
  falha em payload inválido e em registry indisponível; E2E validar→publicar→recuperar.
- **Gates**: typecheck, lint, code-quality (PASS), deps-audit (só `yazl` nova), 100% dos DoD.
