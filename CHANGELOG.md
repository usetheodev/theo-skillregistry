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

