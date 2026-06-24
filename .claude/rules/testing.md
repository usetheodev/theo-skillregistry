# Testing

Source of Truth for test discipline. Stack-agnostic.

## § 1 — Philosophy

- Tests protect **behavior**, not lines. 100% coverage with empty assertions is worse than 60% coverage with meaningful tests.
- Tests are **executable documentation**. A good test describes what the system does without reading production code.
- A broken test is the **highest-priority bug**. Once red tests are ignored, all tests lose value.

## § 2 — Pyramid

```
        /  E2E  \        Few — critical end-to-end flows only
       /----------\
      / Integration\     Moderate — system boundaries (DB, APIs, queues)
     /--------------\
    /   Unit         \   Many — pure business logic, fast, deterministic
   /------------------\
```

- **Unit** — pure business logic, no I/O. Run in milliseconds. The foundation.
- **Integration** — boundaries: repositories against a real DB, clients against real APIs, consumers against real queues. DIP pays off here: unit tests mock, integration tests use real implementations.
- **E2E** — critical user-visible flows. Few, stable, representative. Don't chase edge cases here.

## § 3 — Rules

- Every business rule MUST have a unit test. No exceptions.
- Every bug fix starts with a **failing regression test**, then the fix.
- Tests MUST be deterministic. Flaky tests are bugs — fix or delete.
- Each test exercises ONE behavior. "and" in the test name is a smell.
- Tests are independent. No shared mutable state, no order dependency.
- Use Arrange-Act-Assert (AAA) or Given-When-Then. Pick one per repo.
- Test names describe behavior, not method: `transfer_fails_when_balance_insufficient`, not `test_transfer_1`.

## § 4 — What to test vs. what NOT to test

| Test | Don't test |
|---|---|
| Business rules, calculations | Trivial getters/setters |
| Validation, edge cases | Framework-generated code |
| Integration with external systems | Internal structure (test behavior, not implementation) |
| Error / fallback scenarios | Third-party libraries (they have their own tests) |
| API contracts (request/response) | Layout/CSS unless it's a product requirement |

## § 5 — Test pairing convention

The default convention assumed by stop-validation.sh:

- `<name>_test.<ext>` (same directory) — Go, Python (pytest), most languages
- `<name>.test.<ext>` — JS/TS (Jest)
- `<name>.spec.<ext>` — JS/TS (Jasmine), Ruby
- `test_<name>.<ext>` — Python (pytest alternative)

If your project uses a different convention (e.g., separate `tests/` mirror tree), document it here so the hook knows where to look.

## § 6 — Anti-patterns

- Tests depending on execution order or shared state.
- Tests asserting on internal structure (break on every refactor).
- Excessive mocking: if you need 10 mocks to test a function, the design is wrong (revisit SRP).
- Commented-out or permanently `@skip`'d tests — invisible technical debt.
- Testing only the happy path. Bugs live in edge cases.
- Time/randomness in unit tests — inject a clock/RNG so the test is deterministic.

## § 7 — Test markers (semantic tags for selective runs)

Vitest has no native pytest-style markers. This project uses a **name-prefix convention** so CI can
run a fast subset and exclude slow/live tests, without a plugin (M9 / gap #6).

| Marker | Put it where | Meaning |
|---|---|---|
| `[slow]` | test title prefix | heavy/long test (large fixtures, big loops) |
| `[live]` | test title prefix | hits a real external service (network/LLM) — never in default CI |
| `[integration]` | (implicit via `*.integration.test.ts`) | real DB/queue boundary — already separated by the `test:integration` config |

Usage: `it('[slow] reindexes 10k skills', ...)` / `it('[live] embeds via OpenAI', ...)`.

**Canonical fast-filter regex** (excludes `[slow]` and `[live]` by title):

```
^(?!.*\[slow\])(?!.*\[live\]).*
```

Selection commands:

- Fast subset: `vitest run -t '^(?!.*\[slow\])(?!.*\[live\]).*'`
- Everything incl. slow: `pnpm -r test`
- Live only (manual, creds required): `vitest run -t '\[live\]'`

The regex is pinned by `packages/api/tests/contract/marker-selection.contract.test.ts` so a change to
the convention breaks a test rather than silently mis-selecting.
