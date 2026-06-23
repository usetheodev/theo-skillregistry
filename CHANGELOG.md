# Changelog

Todas as mudanças notáveis deste projeto são documentadas neste arquivo.

O formato segue [Keep a Changelog](https://keepachangelog.com/) e o projeto adere
ao [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

### Changed

### Deprecated

### Removed

### Fixed

### Security

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

