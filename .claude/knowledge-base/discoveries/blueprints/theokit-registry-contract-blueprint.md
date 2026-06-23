# Blueprint: Theokit ↔ Registry contract to close the ACE-style learning loop

slug: theokit-registry-contract
generated_by: discover-execute
created_at: 2026-06-23
source_plan: .claude/knowledge-base/discoveries/plans/theokit-registry-contract-plan.md
feeds: M7 (integração Theokit) — DoD refinement

## Context

The cross-validation against ACE established that theo-skillregistry is the **persistent store +
discovery** half of an ACE-style learning loop, while the Agent/Reflector/SkillManager runtime is
Theokit's. This blueprint answers: what minimal contract must the registry expose so Theokit closes
the loop, without the registry doing runtime (reflection / code execution)?

## Objective

Define the minimal-complete registry↔Theokit contract: every loop operation mapped to an existing
route, a proposed route, or a runtime-exclusion; the data-model fork resolved; the boundary locked.

## Coverage Corner 1 — Integration Tests

### How a management/curation API is integration-tested (mcp-gateway-registry) — Q6

A full **lifecycle e2e** with **list-verification assertions** (not status-code checks) and
**auto-cleanup via `trap … EXIT` in reverse-dependency order**:

- Phase 1 create/register; Phase 2 `list` each type and **assert the just-created entity is present**
  (test fails if not found); Phase 3 `trap cleanup EXIT` deletes in reverse order, idempotent via
  timestamped names.
- Maps to the target: **POST /v1/skills → PATCH/curate → GET /v1/skills:retrieve (verify discoverable)
  → DELETE (deactivate)**, with retrieve-after-write as the load-bearing assertion.

Citations: `.claude/knowledge-base/references/mcp-gateway-registry/api/test-management-api-e2e.md:9`,
`:97` (verify-present assertion), `:132` (trap cleanup), `:475` (reverse-order teardown);
`.claude/knowledge-base/references/mcp-gateway-registry/api/test-management-api-e2e.sh:241` (`cleanup()`),
`:339` (`trap cleanup EXIT`), `:579` (assert created entity in list).

### Curation invariants ACE asserts (to mirror) — Q7

The target's integration tests for curation (`/v1/strategies`) must cover:

1. **Batch atomicity + re-entrant lock** — all ops in one `UpdateBatch` under a re-entrant lock.
2. **Per-verb effect** — ADD creates, UPDATE mutates by `skill_id`, REMOVE soft-deletes (`active=False`, still retrievable).
3. **TAG idempotency / no-mutation** — TAG bumps counters only; record unchanged.
4. **Missing-`skill_id` ops skipped silently** — never raise, never create phantom records.
5. **Active-flag filtering** — default list returns only `active`; `include_invalid=True` surfaces soft-deleted.
6. **Concurrency safety** — concurrent add/update from many threads: no corruption, no dropped records.
7. **Round-trip serialization** — `UpdateBatch`/skillbook serialize+reparse losslessly (schema_version gate).
8. **Path-traversal rejection** — if save/load is exposed, reject paths outside the configured root.

Citations: `.claude/knowledge-base/references/agentic-context-engine/tests/test_ace_core.py:268`
(`TestSkillbookUpdates`), `:269` (add), `:279` (update), `:296` (tag no-op), `:314` (remove→`active is False`),
`:328` (missing skill_id silent skip), `:349` (concurrent), `:388` (re-entrant lock), `:547` (round-trip);
`.claude/knowledge-base/references/agentic-context-engine/ace/core/skillbook.py:523` (active filter);
`.claude/knowledge-base/references/agentic-context-engine/tests/test_ace_mcp_handlers.py:75` (get),
`:260` (save rejects path outside root).

## Coverage Corner 2 — Dependencies

### Ranking/feedback deps: reuse vs add (target already has pgvector M4) — Q5

| Dep | Source | Purpose | Need given M4? |
|---|---|---|---|
| `rank-bm25` | ACE | in-memory BM25 lexical rank | **No / YAGNI** — pgvector hybrid covers lexical+semantic |
| `tenacity` | ACE | retry/backoff | **Theokit-side only** (runtime), not registry |
| `numpy` | ACE optional | embedding sidecar arrays | **No** — pgvector stores embeddings |
| `litellm`/`pydantic-ai`/`openai` | ACE | LLM provider abstraction | **Theokit runtime only** — never in registry |
| `fastembed`/`sentence-transformers`/`cohere` | semantic-router optional | embed/rerank | **No** — embedding generation is M4's job |
| `zod` | composio (catalog) | TS schema validation | **Reuse** — already idiomatic TS-side |

**Verdict (don't-reinvent / YAGNI):** add **nothing new** to the registry for ranking — pgvector hybrid
(M4) supersedes BM25 + embedding libs + numpy. The only deps worth carrying are Theokit-side runtime
(`tenacity`, `litellm`, `pydantic-ai`), outside the registry by the Corner-4 boundary.

Citations: `.claude/knowledge-base/references/agentic-context-engine/pyproject.toml:46` (rank-bm25),
`:48` (tenacity), `:45` (pydantic-ai-slim), `:63` (optional numpy);
`.claude/knowledge-base/references/semantic-router/pyproject.toml:11` (numpy), `:52` (fastembed optional);
`.claude/knowledge-base/references/composio/package.json:86` (zod).

## Coverage Corner 3 — Tools

### Transport: HTTP REST vs MCP server — Q4

**Recommendation: Theokit consumes the registry's existing `/v1` HTTP REST directly; an MCP wrapper is
optional sugar.** The gateway reference proves a thin `requests`-based REST client drives every store op
(register/list/toggle/remove) — no MCP needed. ACE's MCP server only exists because its tools include the
runtime `ask`/`learn` verbs (which the registry deliberately does not host). The Agent-Skills client guide
sanctions "an API / a remote registry" as the remote-discovery transport. Add an MCP wrapper only if
Theokit's harness can speak *only* MCP — then wrap `/v1/skills:retrieve` + `/v1/strategies` as 2–3 MCP tools
mirroring `ace.skillbook.get`.

Citations: `.claude/knowledge-base/references/mcp-gateway-registry/api/registry_client.py:22` (requests),
`:1717` (`requests.request`), `:1787` (POST register);
`.claude/knowledge-base/references/agentic-context-engine/ace/integrations/mcp/server.py:40` (`create_server`),
`:59` (`register_tools`);
`.claude/knowledge-base/references/agentskills-spec/docs/client-implementation/adding-skills-support.mdx:11`
(API/remote registry for cloud discovery), `:95` (remote provisioning, not local FS).

## Coverage Corner 4 — Techniques

### ACE curation verbs + skill granularity — Q1

ACE exposes exactly **4** curation actions (`OperationType = Literal["ADD","UPDATE","TAG","REMOVE"]`),
applied as an **atomic `UpdateBatch`** (reasoning + list of `UpdateOperation`) under a re-entrant lock.
REMOVE is **soft by default** (`active=False`); hard delete is a separate `purge()`. TAG only adjusts
effectiveness counters (`helpful/harmful/neutral_count`) — it does not mutate the record. The "strategy"
record (`Skill`) fields: `id`, `section`, `keywords`, `issue`, `insight`, `occurrences`, `active`,
`used_count`, `helpful/harmful/neutral_count`, `embedding`, `created_at`, `updated_at`.

Citations: `.claude/knowledge-base/references/agentic-context-engine/ace/core/skillbook.py:19`
(OperationType), `:262` (UpdateBatch), `:302` (Skill fields), `:450` (tag_skill counters),
`:485` (remove→soft), `:717` (apply_update atomic batch), `:722` (verb dispatch);
`.claude/knowledge-base/references/agentic-context-engine/ace/core/outputs.py:79` (SkillManagerOutput.update);
`.claude/knowledge-base/references/agentic-context-engine/ace/protocols/skill_manager.py:18` (update_skills).

### Data-model fork: authored skill vs learned strategy → SEPARATE resource — Q2

Authored `SKILL.md` frontmatter (required `name` ≤64, `description` ≤1024; optional `license`,
`compatibility`, `metadata`, `allowed-tools`) and ACE's learned `Skill` (issue→insight + effectiveness
counters + soft-delete + provenance + embedding) are **almost disjoint** in fields, lifecycle, and
write-authority (humans/PRs vs the Reflector/SkillManager loop).

**Recommendation: add a separate `/v1/strategies` resource — do NOT overload `/v1/skills`.** Overloading
would force nullable-everything and break the SKILL.md required-field contract. Precedent: ACE itself keeps
the learned store (`Skillbook`/`Skill`, schema_version "2", `active` soft-delete) entirely separate from any
authored-skill format.

Citations: `.claude/knowledge-base/references/agentskills-spec/docs/specification.mdx:25` (frontmatter table),
`:27` (name required ≤64), `:28` (description required ≤1024);
`.claude/knowledge-base/references/agentskills-spec/skills-ref/src/skills_ref/models.py:8` (SkillProperties);
`.claude/knowledge-base/references/agentskills-spec/skills-ref/src/skills_ref/parser.py:92` (required-field enforce);
`.claude/knowledge-base/references/agentic-context-engine/ace/core/skillbook.py:302` (disjoint Skill fields).

### Contract surface + registry/runtime boundary — Q3

ACE's 6 MCP verbs split cleanly:

| Verb | Concern | Note |
|---|---|---|
| `ace.skillbook.get` | **STORE/DISCOVERY (registry)** | read-only fetch of curated records |
| `ace.skillbook.save` / `.load` | **STORE (registry)** | curation-write/persist surface (registry = DB-backed) |
| `/api/skills` CRUD+search+toggle (gateway) | **STORE/DISCOVERY (registry)** | authored-skill CRUD the target mirrors |
| `ace.ask` | **RUNTIME (Theokit)** — must NOT enter registry | `session.runner.ask` → LLM inference |
| `ace.learn.sample` | **RUNTIME (Theokit)** | `runner.learn` → reflection; ACE guards behind `safe_mode` |
| `ace.learn.feedback` | **RUNTIME (Theokit)** | `learn_from_feedback/traces` → reflection |

**Boundary statement:** the registry is ACE's `safe_mode=ON` persistence backend — it hosts only the
skillbook.get/save/load + skills CRUD surface; Theokit owns the runtime that produces `UpdateBatch`es to
POST. ACE itself raises `ForbiddenInSafeModeError` on the runtime verbs — direct evidence the boundary is
real, not invented here.

Citations: `.claude/knowledge-base/references/agentic-context-engine/ace/integrations/mcp/adapters.py:62`
(_TOOL_MAP — 6 verbs);
`.claude/knowledge-base/references/agentic-context-engine/ace/integrations/mcp/handlers.py:86` (ask→runner),
`:147` (learn_sample + safe_mode guard), `:218` (learn_feedback), `:111` (skillbook_get read-only);
`.claude/knowledge-base/references/agentic-context-engine/ace/integrations/mcp/models.py:90` (SkillbookGetRequest);
`.claude/knowledge-base/references/mcp-gateway-registry/api/registry_management.py:10` (store-side ops only).

## Cross-cutting Comparison — the contract table

Every loop operation → {existing route | proposed route | runtime-excluded}:

| Loop operation (ACE) | Concern | Registry contract |
|---|---|---|
| Read strategies for a task | discovery | **existing** `GET /v1/skills:retrieve` (pgvector hybrid, M4) |
| Get a strategy / list | discovery | **existing** `GET /v1/skills`, `/v1/skills/:id` (+ proposed `/v1/strategies` GET) |
| Curate: ADD/UPDATE/REMOVE | curation | **proposed** `POST/PATCH/DELETE /v1/strategies` (REMOVE = soft, `active=false`) |
| Curate in BATCH | curation | **proposed** `POST /v1/strategies:batchUpdate` (atomic UpdateBatch: reasoning + ops) |
| TAG effectiveness (helpful/harmful/neutral) | feedback | **proposed** `POST /v1/strategies/:id:tag` (counter only; D3 of the plan — store-side feedback is legitimate) |
| Activate / deactivate | lifecycle | **proposed** `active` flag on strategy (filter default = active) |
| `ask` (Agent runs task) | runtime | **EXCLUDED** — Theokit |
| `learn.sample` / `learn.feedback` (reflect) | runtime | **EXCLUDED** — Theokit |

## ADRs

### D1 — Separate `/v1/strategies` resource for learned records (do not overload `/v1/skills`)

Authored skills and learned strategies have disjoint fields, lifecycle, and write-authority. Overloading
forces nullable-everything and breaks the SKILL.md required-field contract. ACE keeps the two separate
(skillbook schema_version "2", soft-delete). The registry adds `/v1/strategies` (issue/insight + counters +
`active` + provenance + embedding) alongside the existing `/v1/skills`. Both share the pgvector retrieve
substrate. Evidence: `skillbook.py:302`, `specification.mdx:25`, `models.py:8`.

### D2 — Registry is ACE's `safe_mode` persistence backend; runtime verbs are excluded

The contract hosts ONLY store/discovery/curation (skillbook.get/save/load + skills/strategies CRUD +
retrieve). The runtime verbs (`ask`, `learn.sample`, `learn.feedback` = reflection/execution) stay in
Theokit. ACE itself fences them behind `safe_mode` (`ForbiddenInSafeModeError`), confirming the split is
inherent, not a local invention. Evidence: `handlers.py:86/147/218`, `adapters.py:62`.

## Recommendations for the project (feeds M7 DoD)

1. M7's `RemoteSkillsManager` consumes the existing `/v1` HTTP directly (no MCP wrapper required).
2. Add `/v1/strategies` (+ `:batchUpdate`, `:tag`, `active` lifecycle) as the learned-record curation
   surface, atomic-batch-shaped (UpdateBatch: reasoning + ops), REMOVE = soft delete.
3. Reuse pgvector M4 for strategy retrieval — add NO new ranking deps (no BM25/numpy/embedding libs).
4. Integration tests mirror the gateway lifecycle (create→curate→retrieve→deactivate, retrieve-after-write
   assertion, reverse-order teardown) AND ACE's curation invariants (batch atomicity, TAG no-mutation,
   missing-id silent skip, active-flag filter, concurrency safety, round-trip).
5. Keep all reflection/execution in Theokit — the registry never hosts `ask`/`learn`.

## Blocked questions (if any)

None — all 7 research questions answered with verifiable citations.

## Halt-loop progress (audit trail)

Q1 done · Q2 done · Q3 done · Q4 done · Q5 done · Q6 done · Q7 done · blocked: 0.
Coverage corners populated: Integration Tests (Q6,Q7), Dependencies (Q5), Tools (Q4), Techniques (Q1,Q2,Q3).

## Related

- Plan: `.claude/knowledge-base/discoveries/plans/theokit-registry-contract-plan.md`
- Confidence (next): `/discover-confidence theokit-registry-contract`
- Consumes: M7 milestone DoD in `ROADMAP.md`
