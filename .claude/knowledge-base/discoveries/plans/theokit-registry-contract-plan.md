# Discovery Plan: Theokit ↔ Registry contract to close the ACE-style learning loop

version: 0.1.1
slug: theokit-registry-contract
owner: paulohenriquevn
generated_by: discover-plan
created_at: 2026-06-23
feeds: M7 (integração Theokit) — DoD refinement

## Context

The cross-validation against ACE (`/loop-cross-validation`, 2026-06-23) surfaced that the
theo-skillregistry is the **persistent Skillbook (store + discovery)**, while the ACE learning loop
(Agent → Reflector → SkillManager + Recursive Reflector) is **runtime** — Theokit's territory, which
`ROADMAP.md` already marks out of scope for the registry ("nós armazenamos e descobrimos; ele executa").

The open strategic question: **what minimal-yet-complete API contract must the registry expose so a
Theokit-side loop can close the cycle — without leaking runtime concerns (reflection, code execution)
into the registry?** "Expose all APIs" was rejected (YAGNI + boundary leak). This discovery exists to
define the contract from real prior art, feeding the M7 DoD — NOT to write code. Two unresolved forks
motivate the dig: (1) the curation surface the loop needs (batch `UpdateBatch`, lifecycle `active`,
usage feedback) and (2) the data-model fork — authored skill (`SKILL.md`) vs learned strategy/insight.

## Objective

Produce a **blueprint** (`/discover-execute` output) defining the minimal-complete registry↔Theokit
contract for the learning loop, with an explicit boundary line and a resolved data-model recommendation.

Measurable success criteria for the resulting blueprint:
- Every loop operation (read / curate / lifecycle / feedback) maps to an existing route, a proposed
  route, or an explicit "runtime — not registry" exclusion.
- The data-model fork is resolved with one recommendation + rationale + ≥ 2 cited precedents.
- Each recommendation cites ≥ 2 independent references under `.claude/knowledge-base/references/`.
- Respects `rules/architecture.md` (registry = persistence+discovery; no runtime) and `rules/testing.md`.

## In-Scope / Out-of-Scope

### In-Scope (per reference project)

- `.claude/knowledge-base/references/agentic-context-engine/`: `ace/core/skillbook.py`, `ace/core/outputs.py`, `ace/protocols/skill_manager.py`, `ace/integrations/mcp/`, `tests/`.
- `.claude/knowledge-base/references/mcp-gateway-registry/`: `api/` (management + client + openapi + e2e tests).
- `.claude/knowledge-base/references/anthropic-skills/`: `spec/`, `template/`.
- `.claude/knowledge-base/references/agentskills-spec/`: `skills-ref/`, `docs/client-implementation/`.
- `.claude/knowledge-base/references/openskills/`: `src/`.
- `.claude/knowledge-base/references/semantic-router/`: `pyproject.toml`, `semantic_router/route.py`.
- `.claude/knowledge-base/references/composio/`: `package.json` (dep signal only).

### Out-of-Scope (explicit)

- `.claude/knowledge-base/references/agentic-context-engine/ace/runners/`, `ace/implementations/`, `ace/tracing/`, `benchmarks/` — runtime/learning internals, outside the registry boundary by design.
- `.claude/knowledge-base/references/mcp-gateway-registry/` `charts/`, `docker/`, `auth_server/` internals beyond the contract surface.
- `.claude/knowledge-base/references/semantic-router/` encoders/llms internals (we already have hybrid retrieve from M4).
- `.claude/knowledge-base/references/composio/` full monorepo beyond the root manifest.

ACE also exists at `/tmp/xval-ref/agentic-context-engine` (cross-validation clone); the **citable** copy
for this plan is `.claude/knowledge-base/references/agentic-context-engine/`.

## ADRs

### D1 — Time budget + stop conditions

ACE: 3h (primary loop prior art). mcp-gateway-registry: 2h (contract/transport prior art). Format peers
(anthropic-skills, agentskills-spec, openskills): 1.5h combined. Ranking/deps (semantic-router,
composio): 0.5h. Per-question stop: once the "Expected answer shape" is filled, stop — no further dig.

### D2 — Investigation depth (runtime internals excluded by design)

We do NOT investigate ACE's Reflector / Recursive Reflector / sandbox execution. The boundary is locked
by `ROADMAP.md` out-of-scope + `rules/architecture.md`. We study only the store/curation/discovery
contract the loop calls. Rationale: investigating runtime tempts scope-leak; the registry must stay
persistence+discovery.

### D3 — Feedback/usage as a registry concern (hypothesis to test, not assume)

Storing "skill X was used / helped on task Y" is metadata-about-skills (persistence), arguably legitimate
for the registry. Q5 tests whether prior art treats feedback as store-side or runtime-side. We do NOT
pre-decide; the blueprint records the evidence-based verdict.

## Research Questions

| # | Question | Corner | Reference project(s) | Fase A (broad — ast-grep/grep map) | Fase B (deep — Read at each hotspot) | Expected answer shape |
|---|---|---|---|---|---|---|
| Q1 | Which curation verbs does ACE's Skillbook expose (batch add/update/remove/tag/untag) and how granular is a "skill"? | techniques | `.claude/knowledge-base/references/agentic-context-engine/` | `Grep 'class UpdateOperation\|class UpdateBatch\|def apply_update' .claude/knowledge-base/references/agentic-context-engine/ace/core/skillbook.py` to map curation symbols | Read `ace/core/skillbook.py` (UpdateOperation:136, UpdateBatch:263, apply_update:717), `ace/core/outputs.py` (SkillManagerOutput), `ace/protocols/skill_manager.py` | Curation verb list (add/update/remove/tag/untag/activate) + atomic-batch vs single, mapped to registry routes (have/propose/exclude) |
| Q2 | How does the `SKILL.md` authored format structure a skill vs ACE's granular learned strategy record? | techniques | `.claude/knowledge-base/references/anthropic-skills/`, `.claude/knowledge-base/references/agentskills-spec/` | `Grep 'class .*Skill\|schema\|model' .claude/knowledge-base/references/agentskills-spec/skills-ref/src/` then read the matched schema (EC-1 fix — pinned locator, no blind find) | Read `anthropic-skills/spec/agent-skills-spec.md` + the matched agentskills-spec schema; compare against ACE `Skill` dataclass in `skillbook.py` | Field-by-field comparison table + recommendation (overload `/v1/skills` vs new `/v1/strategies`) with rationale |
| Q3 | How does a registry/gateway expose curation + discovery to an agent runtime, and where does it stop (no runtime inside)? | techniques | `.claude/knowledge-base/references/mcp-gateway-registry/`, `.claude/knowledge-base/references/agentic-context-engine/` | `jq '.paths\|keys' .claude/knowledge-base/references/mcp-gateway-registry/api/openapi.json` to inventory routes (EC-3 — no full read); stop at curation+discovery verbs (EC-4) | Read `mcp-gateway-registry/api/registry_management.py`; Read `agentic-context-engine/ace/integrations/mcp/handlers.py` + `models.py` (ask/learn_sample/learn_feedback/skillbook_get/save/load) | Route/verb inventory split into "store/discovery (registry)" vs "runtime (Theokit)" columns |
| Q4 | What transport do agent-facing registries use (HTTP REST vs MCP server) and how does the consumer call it? | tools | `.claude/knowledge-base/references/mcp-gateway-registry/`, `.claude/knowledge-base/references/agentic-context-engine/`, `.claude/knowledge-base/references/agentskills-spec/` | SKIP Fase A — text/config-shape. `ls .claude/knowledge-base/references/agentskills-spec/docs/client-implementation/` | Read `mcp-gateway-registry/api/openapi.json` (transport) + `api/registry_client.py` (client), `agentic-context-engine/ace/integrations/mcp/server.py` | Recommendation: Theokit consumes our `/v1` HTTP directly, needs MCP wrapper, or both — with trade-off (we already have HTTP) |
| Q5 | What deps do agent-facing providers pull for feedback-informed ranking, and which are justified vs avoidable given M4 pgvector? | deps | `.claude/knowledge-base/references/semantic-router/`, `.claude/knowledge-base/references/agentic-context-engine/`, `.claude/knowledge-base/references/composio/` | SKIP Fase A — manifest text-shape. `Grep 'bm25\|rank\|search\|tenacity' .claude/knowledge-base/references/agentic-context-engine/pyproject.toml` | Read `semantic-router/pyproject.toml`, `agentic-context-engine/pyproject.toml`, `composio/package.json` (signal only) | Dep table (name/purpose/need-given-M4) + reuse-vs-add verdict per Rule 9 + parsimony ladder |
| Q6 | How is a management/curation API integration-tested against a real backend? | tests | `.claude/knowledge-base/references/mcp-gateway-registry/` | SKIP Fase A — shell/markdown test files (read directly in Fase B) | Read `.claude/knowledge-base/references/mcp-gateway-registry/api/test-management-api-e2e.md` and `.claude/knowledge-base/references/mcp-gateway-registry/api/test-management-api-e2e.sh` | Lifecycle test shape (create→curate→retrieve→deactivate) to mirror, aligned with `rules/testing.md` |
| Q7 | Which curation invariants does ACE assert (batch atomicity, idempotent tag, active-flag filtering)? | tests | `.claude/knowledge-base/references/agentic-context-engine/` | `Grep 'def test_' .claude/knowledge-base/references/agentic-context-engine/tests/test_ace_mcp_handlers.py` to map test cases | Read `tests/test_ace_mcp_handlers.py` + `tests/test_ace_core.py` (Skillbook curation tests) | Curation invariants our integration tests must cover |

**Execution order (EC-2 fix):** Q1 → Q3 → Q2 (Q2's fork recommendation needs Q1's curation verbs + Q3's
boundary); Q5 after Q3. Q4/Q6/Q7 are order-independent.

## Coverage Matrix

Every Coverage Corner has at least one Research Question mapped to it.

| Corner | Questions mapped | Status |
|---|---|---|
| Integration tests | Q6, Q7 | Covered |
| Dependencies | Q5 | Covered |
| Tools | Q4 | Covered |
| Techniques | Q1, Q2, Q3 | Covered |

**Coverage: 4/4 corners covered (100%)**

Project rules cited: `rules/architecture.md` (registry vs Theokit boundary, DIP), `rules/testing.md`
(pyramid for new contract routes), Unbreakable Rule 9 + `rules/parsimony-ladder.md` (Q5 reuse-vs-add).

## Halt-loop Checkpoints

| Checkpoint | Assertion | Action if fails |
|---|---|---|
| Before answering Qx | The `.claude/knowledge-base/references/{project}/{path}` cited in Fase A exists | Mark Qx BLOCKED "path not found", continue |
| Per-question Fase A budget | Fase A returned ≥ 1 hotspot OR is marked SKIP (text-shape) OR 3 query retries attempted | After 3 empty retries, mark Qx BLOCKED "Fase A exhausted", continue |
| Q3 route inventory | Routes extracted via `jq '.paths\|keys'` (not full read); inventory stopped at curation+discovery verbs (EC-3/EC-4) | If full-read attempted, re-scope to jq/grep |
| No /tmp leak | Before marking DONE, grep the draft for `/tmp/`; rewrite hits to `.claude/knowledge-base/references/agentic-context-engine/` (EC-5) | Rewrite the citation, then mark DONE |
| After answering Qx | Blueprint section under Qx has ≥ 1 `.claude/knowledge-base/references/` citation | Re-iterate Qx (1 retry max) |
| Q2 fork recommendation | The recommendation cites ≥ 2 independent precedents (EC-8 guard) | Add the missing precedent before DONE |
| Before promising complete | All 4 coverage corners have populated blueprint sections | Refuse promise, continue iterating |

## Acceptance Criteria

- [ ] All 7 research questions answered OR explicitly marked BLOCKED with reason.
- [ ] Data-model fork (Q2) resolved with one recommendation + ≥ 2 cited precedents.
- [ ] A consolidated contract table: every loop operation → {existing route | proposed route | runtime-excluded}.
- [ ] Boundary invariant honored: no proposed registry route performs reflection or code execution.
- [ ] All four coverage corners have populated sections in the blueprint.
- [ ] Every citation points to a real `.claude/knowledge-base/references/{...}` path (no `/tmp`).
- [ ] At least one ADR section in the blueprint synthesizes decisions taken.
- [ ] `/discover-confidence` verdict ≥ SHIPPABLE_WITH_CAVEATS.
- [ ] Blueprint saved at `.claude/knowledge-base/discoveries/blueprints/theokit-registry-contract-blueprint.md`.

## Global Definition of Done

- `/discover-confidence` verdict ≥ `SHIPPABLE_WITH_CAVEATS` against `rules/discover-blueprint-golden-rule.md`
  (no empty corner, no fabricated citation).
- Blueprint persisted at `.claude/knowledge-base/discoveries/blueprints/theokit-registry-contract-blueprint.md`.
- Output feeds M7 DoD refinement — NOT implemented in this cycle (no code).
