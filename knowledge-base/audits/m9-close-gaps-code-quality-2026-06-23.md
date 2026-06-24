# Code Quality Audit: m9-close-gaps

**Date:** 2026-06-23
**Mode:** plan-bound
**Verdict:** FAIL_SOFT
**Score cap:** 70
**Hard caps triggered:** auditor_unavailable_knip

## Summary

- Languages audited: typescript
- Languages skipped: _none_
- Total findings: 2 (0 HARD, 1 SOFT_CAP, 0 SOFT_FLOOR, 1 INFO)

## Findings by detector

### D1 — Dead code
| File | Symbol | Severity | Message |
|---|---|---|---|
| `.` | `knip` | SOFT_CAP | Knip auditor unavailable: knip exit code 2: ERROR: Error loading /home/paulo/Projetos/usetheo/theo-data/theo-skillregistry/packages/cli/vitest.integration.config.ts
Reason: (0 , _nodeUtil.styleText) is not a function |

### D2 — Symbol fabrication
| File | Symbol | Severity | Message |
|---|---|---|---|
| `.` | `d2` | INFO | D2 disabled by --no-network flag |

### D3 — Cross-package orphan exports
_No findings._

### D4 — Mutation testing
_No findings._

## Related

- Golden rule: [`.claude/rules/code-quality-golden-rule.md`](../../rules/code-quality-golden-rule.md)
- Allowlist: [`.claude/rules/code-quality-allowlist.txt`](../../rules/code-quality-allowlist.txt)
- Thresholds: [`.claude/rules/code-quality-thresholds.txt`](../../rules/code-quality-thresholds.txt)
