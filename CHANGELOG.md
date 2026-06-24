# Changelog

Todas as mudanças notáveis deste projeto são documentadas neste arquivo.

O formato segue [Keep a Changelog](https://keepachangelog.com/) e o projeto adere
ao [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

### Changed
- `Clock` (wall-clock `now(): Date`) consolidado num módulo único `api/server/time/clock.ts`, reusado pelos 3 webhook workers (DRY); o clock de latência do retrieve (`now(): number` monotônico) fica interno e renomeado para evitar confusão (#10)

### Deprecated

### Removed
- Dependências mortas removidas: `@paralleldrive/cuid2` do `core` (não usado lá; o `api` usa+declara) e `zod` do `api` (os schemas vêm via `@usetheo/skillregistry/contract`); export morto `realClock` (#10)

### Fixed

### Security
- O scrubbing do logger passa a recursar em valores-objeto (um segredo aninhado num campo, ex. `{ context: { authorization } }`, agora também é redigido); arrays/Date/null preservados (#10)
- O logger é fire-and-forget: um campo patológico (referência circular, BigInt, `toJSON` que lança) NUNCA derruba o caller — emite uma linha mínima segura com `log_serialization_error` em vez de propagar (#10)

## [0.7.0] - 2026-06-24

### Added
- Roadmap amended: added M9 — Fechar todos os gaps do cross-validation (engenharia) (`/roadmap-feature close-all-gaps`)
- M9: CLI `theoskill` ganha `init --registry <url> [--auth <token>]` (grava `.theoskillrc` local, 0600, nunca imprime o auth) e comandos de leitura `get`/`list`/`status`/`revisions` que espelham a API HTTP; `registry`/`auth` caem para a config quando a flag é omitida (flags ganham); exit codes scriptáveis (0/1/2) (#9)
- M9: taxonomia semântica de test markers (`[slow]`/`[live]`/`[integration]`) por prefixo de nome + regex canônica de seleção (`vitest -t`), documentada em `rules/testing.md § 7` e fixada por teste; permite runs rápidos seletivos no CI sem plugin (#9)
- M9: seleção de embedder vira um registry ordenado `{name, detect, create}` (OCP) — adicionar um provider é adicionar uma entrada, sem editar `selectEmbedder`; comportamento atual (openai/stub) preservado; 3º provider deferido por YAGNI (ADR-3) (#9)
- M9: rastreabilidade ponta-a-ponta — um `trace_id` (W3C `traceparent`-compatível) é originado na fronteira HTTP (ou gerado quando ausente/malformado) e propagado por operação → job → webhook, logado em cada salto e persistido na delivery row (sobrevive ao re-enqueue do reconciler). Seam mínimo (`node:crypto`, sem SDK OpenTelemetry — o M8 adota e adiciona exporters) (#9)


### Changed
- M9: backoff de entrega de webhook agora é uma política explícita (`WEBHOOK_DELIVERY_BACKOFF`: exponencial + full jitter, base 2s, cap 5min, 5 tentativas) com função pura testável (`computeBackoff`), em vez de números mágicos inline; o pg-boss aplica o exponencial derivado da política (#9)
- Template de instalação (`.claude/settings.json`): `permissions.defaultMode` passa a `bypassPermissions` e `pnpm`/`npm`/`npx`/`pnpx`/`yarn`/`node`/`corepack` movidos de `ask` para `allow` (lista `ask` esvaziada) — Claude Code deixa de pedir confirmação por padrão; os `deny` destrutivos (rm -rf de paths de sistema, sudo, git checkout/reset --hard/push --force/rebase -i, leitura de `.env`/secrets) permanecem como guarda-corpo


### Fixed
- `/discover-plan-confidence`: threshold parser read the wrong delimiter (`|`) so every discovery plan scored `INVALID` regardless of quality; now reads the documented `KEY = VALUE` band format (ADR 0001) (#8)


### Security
- M9: o logger estruturado passa a redigir valores de chaves sensíveis (authorization/password/token/secret e sufixos `_token`/`_secret`/`_key`/`_password`) antes de emitir — segredos nunca vazam para os logs (#9)

## [0.6.0] - 2026-06-23

### Added
- M5: orquestrador único `validateSkillPayload` no `core` — os 4 checks de skill (zip-safety →
  frontmatter Theokit → secret scan) em uma fonte de verdade compartilhada pelo servidor e pela
  CLI; resultado estruturado por regra (DRY — sem divergência) (#8)
- M5: CLI de dev `theoskill` (`@usetheo/skillregistry-cli`) — `validate <path>` valida a skill
  localmente com os MESMOS checks do servidor (mesmos adapters yauzl/secretlint via subpath leve) e
  imprime erros por regra; `publish <path> --registry <url> --skill-id <id>` valida → empacota (yazl)
  → publica reusando a API Create/Update (POST novo / PATCH existente). Args via `node:util parseArgs`
  (sem dep de arg-parser); exit codes scriptáveis (#8)


### Changed
- M5: a fronteira do servidor (`POST`/`PATCH /v1/skills`) passa a delegar a validação ao
  `validateSkillPayload` do `core` em vez de orquestrar os checks inline (mesmo comportamento/códigos
  de erro 400; elimina duplicação de lógica) (#8)

## [0.5.0] - 2026-06-23

### Added
- M4: índice de busca lexical — coluna `skills.search_text` (name + description + corpo SKILL.md
  corrente, mantida sincronamente nas 3 vias de escrita) + coluna gerada `search_tsv` (tsvector
  `english`) com índice GIN para Full-Text Search do Postgres (#7)
- M4: porta `SkillRetriever` (DIP) com adapters vector (cosine pgvector da revisão corrente, guard
  de dimensão), keyword (FTS recall-friendly: lexemas OR-ados via `to_tsquery` + `ts_rank`,
  seguro contra input livre) e hybrid (fusão RRF k=60 calibration-free sobre pool profundo,
  degradação graciosa de qualquer um dos lados); `ParamBuilder` para binding `$N` seguro (#7)
- M4: endpoint `GET /v1/skills:retrieve?query=...&topK=...&strategy=...` — busca híbrida (default)
  com `score` explícito por resultado e `trace_id`; dispatcher por strategy (vector/keyword/hybrid);
  métrica `retrieve` (latency_ms + top_score) instrumentada no caminho (north-star) (#7)
- M4: conjunto de avaliação interno versionado (`eval/dataset.json` + `eval/run-recall.ts`) —
  **Recall@5 ≥ 0.85** e retrieve **p95 < 200ms** medidos e reproduzíveis em teste de integração
  (recall via componente FTS lexical com stub embedder; OpenAI adiciona recall semântico) (#7)

## [0.4.0] - 2026-06-23

### Added
- M3: porta `EmbeddingProvider` (DIP) com adapters `stub` (determinístico, SHA-256 seeded +
  L2-normalizado, offline) e `openai` (SDK; `local` = mesmo adapter com `OPENAI_BASE_URL`);
  dimensão pinada em 1536 com guard fail-fast (`assertEmbeddingDim`) (#6)
- M3: schema pgvector — coluna `vector(1536)` + tabela `embeddings` (por revisão; unique
  `(revision_id, provider, model)`; índice HNSW cosine) + coluna `skill_revisions.skill_md`
  (fonte do embedding capturada no ingest); extensão `vector` no bootstrap da migração (#6)
- M3: geração e indexação assíncrona de embeddings — seleção de provider por env (`OPENAI_API_KEY`
  → openai com `OPENAI_BASE_URL` opcional; senão stub) com guard de dimensão (boot no stub +
  por embedding no worker); job `embed_skill` chaveado por revisão (cada revisão embeddada
  exatamente uma vez; update nunca dedupa contra a revisão anterior) disparado no terminal ACTIVE
  de create/update; embed worker gera `name+description+corpo`, valida a dimensão (fail-fast) e
  faz upsert idempotente (`ON CONFLICT (revision_id, provider, model) DO NOTHING`); dead-letter
  observável para embeds esgotados; busca por similaridade cosseno consultável (#6)

## [0.3.0] - 2026-06-23

### Added
- M2: ciclo de vida explícito de operações LRO (`CREATING`/`UPDATING`/`DELETING` →
  `ACTIVE`/`FAILED`) com idempotência via header `Idempotency-Key` e classificação de
  retry (regra de negócio = sem retry → `FAILED`; transiente = retry com backoff) (#5)
- M2: primitivos de segurança de webhook — SSRF guard (`assertPublicUrl`: bloqueia
  schemes não-http(s), IPs privados/loopback/link-local/metadata, com resolução DNS),
  assinatura HMAC-SHA256 (esquema Inngest `t=<ts>&s=<hex>`, janela de replay ±5min) e
  sender HTTP (timeout + `redirect: manual`) (#5)
- M2: CRUD de webhook endpoints (`/v1/webhookEndpoints`) — segredo HMAC gerado pelo
  servidor e retornado uma única vez na criação; URL validada via SSRF guard antes de
  persistir; filtro opcional por `event_types` (#5)
- M2: pipeline de entrega de webhooks com garantias — fan-out transacional via outbox,
  worker de entrega com classificação de retry (2xx=entregue / 3xx-4xx=falha permanente /
  5xx=retry com backoff → dead-letter), reconciler de órfãos via `FOR UPDATE SKIP LOCKED`
  e dedup por `singletonKey` (entrega at-least-once com idempotência terminal) (#5)

## [0.2.0] - 2026-06-23

### Added
- M1: parser de frontmatter `SKILL.md` compatível com o Theokit (lib `yaml`/eemeli; campos
  obrigatórios name+description; limites AgentSkills; preserva campos desconhecidos) (#4)
- M1: validação rígida de payload zip via `yauzl` (limites, path traversal, symlink, ratio,
  profundidade, duplicados, `SKILL.md` na raiz) — zip-bomb safe (guardas por metadados) (#4)
- M1: secret scan do payload via `secretlint` (preset-recommend, in-memory; nunca expõe o valor) (#4)
- M1: revisões imutáveis de skill (`skill_revisions` com payload bytea + content_hash sha256 +
  frontmatter jsonb); `skills.latest_revision_id` aponta para a corrente (#4)
- M1: CRUD completo — `POST /v1/skills` (ingere+valida payload na fronteira),
  `GET /v1/skills/{id}`, `GET /v1/skills` (paginado por keyset), `PATCH /v1/skills/{id}`
  (updateMask; nova revisão quando há payload), `DELETE /v1/skills/{id}` + reserva de skillId
  com janela configurável (`THEOSKILL_ID_RESERVATION_HOURS`), `GET .../revisions[/{id}]` (#4)


### Changed
- M1: parser YAML do frontmatter usa `yaml` (eemeli, ISC) em vez de `gray-matter` — este fixa
  `js-yaml` 3.x, afetado pela CVE GHSA-h67p-54hq-rp68 (DoS quadrático), sem upgrade seguro (#4)


### Fixed
- M1: um `skillId` deletado pode ser recriado após a janela de reserva expirar (o tombstone
  expirado é purgado atomicamente no create) — corrige bug encontrado no `/review` que tornava
  ids permanentemente irreutilizáveis (#4)
- M1: índice em `skill_revisions(skill_id, create_time desc)` evita seq-scan no list de revisões (#4)


### Security
- M1: `POST`/`PATCH /v1/skills` rejeita corpo acima do limite com `413` (guarda de DoS de
  memória; configurável via `THEOSKILL_MAX_BODY_BYTES`) (#4)

## [0.1.0] - 2026-06-22

### Added
- Documento de Requisitos de Produto inicial (`PRD.md`) definindo escopo, modelo de
  domínio, decisões de arquitetura e plano de releases do Theo Skill Registry (#1)
- `README.md` com visão geral, stack, arquitetura e guia de início (#1)
- `ROADMAP.md` macro com 9 milestones (M0-M8), foco em superar o Google Skill Registry
  e integrar ao Theokit; critério de V1 (Recall@5 ≥ 0.85, p95 < 200ms, dogfood real) (#2)
- Baseline competitivo do Google Skill Registry em
  `knowledge-base/discoveries/google-skill-registry-baseline.md` (deep scraping) (#2)
- Catálogo de 7 referências SOTA clonadas em `knowledge-base/references/` + índice em
  `knowledge-base/references-catalog.md`; grill em `knowledge-base/grills/` (#2)
- **M0 — Walking skeleton:** monorepo pnpm (`@usetheo/skillregistry` + `@usetheo/skillregistry-api`)
  em TS strict com `GET /v1/health`, `POST /v1/skills` (LRO via pg-boss), `GET /v1/operations/{id}`,
  `GET /v1/skills/{id}`, persistência PostgreSQL + Drizzle (migrations), worker de `create_skill`
  com máquina de estados de operação e graceful shutdown ordenado (server→queue→pool), validado
  por teste E2E criar→aguardar→obter contra Postgres real (#3)


### Fixed
- M0: criação de skill com `skillId` duplicado sob concorrência resolve de forma determinística
  (exatamente uma skill criada; demais operações concluem como `failed`) — endurecido após
  `/review` com teste E2E de concorrência (#3)
- M0: falha ao enfileirar a operação marca-a imediatamente como `failed` em vez de deixá-la
  presa em `CREATING` (#3)

