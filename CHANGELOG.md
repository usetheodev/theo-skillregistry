# Changelog

Todas as mudanças notáveis deste projeto são documentadas neste arquivo.

O formato segue [Keep a Changelog](https://keepachangelog.com/) e o projeto adere
ao [Semantic Versioning](https://semver.org/).

## [Unreleased]

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
