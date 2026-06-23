# Code Quality Audit: m9-close-gaps

**Date:** 2026-06-23
**Mode:** standalone
**Verdict:** FAIL_HARD
**Score cap:** 49
**Hard caps triggered:** dead_code_unallowlisted_unknown

## Summary

- Languages audited: _none_
- Languages skipped: _none_
- Total findings: 1 (1 HARD, 0 SOFT_CAP, 0 SOFT_FLOOR, 0 INFO)

## Findings by detector

### D1 — Dead code
| File | Symbol | Severity | Message |
|---|---|---|---|
| `.claude/rules/code-quality-allowlist.txt` | `code-quality-allowlist.txt` | HARD | allowlist_malformed_entry: allowlist.txt line 36: malformed entry (expected 6 pipe-separated fields, got 4): 'auditor_output_malformed_knip \| package.json:0 \| 2026-09-21 \| knip (D1 dead-code TS) indisponível em versão compatível com o detector (knip 6.x muda o shape do JSON; bug do adapter da skill, rastreado à parte). Verificação manual de orphan-exports do M9 feita: traceFields removido (YAGNI); demais exports têm uso real. typecheck strict + eslint no-unused + 256 testes verdes cobrem o resto.' |

### D2 — Symbol fabrication
_No findings._

### D3 — Cross-package orphan exports
_No findings._

### D4 — Mutation testing
_No findings._

## Related

- Golden rule: [`.claude/rules/code-quality-golden-rule.md`](../../rules/code-quality-golden-rule.md)
- Allowlist: [`.claude/rules/code-quality-allowlist.txt`](../../rules/code-quality-allowlist.txt)
- Thresholds: [`.claude/rules/code-quality-thresholds.txt`](../../rules/code-quality-thresholds.txt)
