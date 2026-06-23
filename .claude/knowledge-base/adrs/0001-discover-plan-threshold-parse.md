# 0001 — Fix discover-plan-confidence threshold parser (`|` → documented `KEY = VALUE`)

- Status: accepted
- Date: 2026-06-23
- Deciders: paulohenriquevn (project owner)
- Scope: `skills/discover-plan-confidence/scripts/run_discover_plan_score.py` — verdict-band parsing

## Context and problem statement

`run_discover_plan_score.py::_parse_thresholds` split each thresholds line on `|` and required
`len(parts) >= 2`. The checked-in project file `rules/discover-plan-thresholds.txt` uses the
`KEY = VALUE` format it documents (`band.shippable = 90`). No file in the repo (or in the skill's
templates) uses the `|` format. Consequently every line was skipped → `bands = {}` → `_verdict_for`
fell through to `return "INVALID"` for **any** score.

Effect: every discovery plan scored `INVALID` regardless of quality. Surfaced on the
`theokit-registry-contract` plan, which scored `weighted_avg = 99.7`, `hard_caps_triggered = []`,
all dimensions at/near 100, yet emitted `INVALID`.

Because verdict-band parsing is part of the scoring mechanism governed by
`rules/discover-plan-golden-rule.md`, the fix is recorded here per § "When this rule may change".

## Decision

Make `_parse_thresholds` read the documented `KEY = VALUE` format: select only `band.*` keys,
map each to the upper-cased suffix (`band.shippable → SHIPPABLE`,
`band.shippable_with_caveats → SHIPPABLE_WITH_CAVEATS`, `band.needs_revision → NEEDS_REVISION`,
`band.invalid → INVALID`). The legacy `NAME | VALUE` format remains supported for backward
compatibility (no known consumer, but the change stays strictly additive).

This is a **bug fix, not a softening of caps**. Hard caps (fabricated citation, empty corner,
question budget) continue to fire independently in their own checkers and still cap the verdict —
verified: the same plan emitted the fabricated-citation detractor before the Q6 glob was fixed.

## Verdict tokens (aligned with the golden rule § 5 and `cycle-rule-schema.md`)

| Band key in file | Emitted verdict | Score floor |
|---|---|---|
| `band.shippable` | `SHIPPABLE` | 90 |
| `band.shippable_with_caveats` | `SHIPPABLE_WITH_CAVEATS` | 70 |
| `band.needs_revision` | `NEEDS_REVISION` | 50 |
| `band.invalid` | `INVALID` | 0 |

Note: `skills/discover-plan-confidence/SKILL.md` prose says `NON_SHIPPABLE` for the 50-69 band; the
golden rule § 5 and the thresholds file both say `NEEDS_REVISION`. This ADR follows the golden rule
(the source of truth). A follow-up doc-fix should align the stale SKILL.md wording.

## Consequences

- Positive: the scorer is functional; discovery plans get their true verdict. Regression test
  `tests/test_run_discover_plan_score.py` locks the contract (a 99.7 / no-hard-cap plan → SHIPPABLE,
  the project file parses to non-empty bands).
- Neutral: SKILL.md wording (`NON_SHIPPABLE`) is now demonstrably out of step with the golden rule;
  tracked as a follow-up.
- Risk: none to cap enforcement — caps live in separate checkers, untouched.

## Validation

- `pytest tests/` → 29 passed (7 new regression tests + 22 pre-existing, no regression).
- Re-score of `theokit-registry-contract` with the real project thresholds file → `SHIPPABLE` 99.7.
