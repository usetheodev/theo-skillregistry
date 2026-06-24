# 0002 — M9 trace-context seam (minimal, no OpenTelemetry SDK; M8 adopts)

- Status: accepted
- Date: 2026-06-23
- Deciders: paulohenriquevn (project owner)
- Milestone: M9 (gap #1 — end-to-end tracing)
- Supersedes/relates: coordinates with M8 ("Hardening + observabilidade por skill", which mandates OpenTelemetry)

## Context

The cross-validation vs ACE flagged that an ingestion could not be followed end-to-end
(HTTP → operation → job → webhook). The M9 DoD requires a `trace_id` propagated and **logged at
every hop**, built as a **shared seam that M8 reuses** — without instrumenting OpenTelemetry twice
(roadmap risk #1: M9 and M8 both wiring OTel would duplicate work and collide spans).

## Decision

M9 ships a **minimal trace-context module** (`packages/api/src/server/observability/trace-context.ts`)
that generates/parses/propagates a W3C `traceparent`-compatible `trace_id` (32 hex chars) using only
`node:crypto`. It does **NOT** add the `@opentelemetry/*` SDK.

- `resolveTraceId(traceparentHeader)` originates the id at the HTTP boundary (`handlers/skills.ts`),
  generating a fresh one when the header is absent/malformed (never echoes attacker input — EC-4).
- The id flows in job data → `OnOperationTerminal` → webhook delivery job, is **persisted on the
  `webhook_deliveries.trace_id` column** (Drizzle migration 0006) so the orphan-reconciler re-enqueue
  preserves it (EC-1), and is logged at every hop.

### Rejected alternative

Install the OpenTelemetry SDK + exporters in M9. Rejected because: (a) M8's DoD already mandates
OpenTelemetry traces+metrics — doing it in both milestones duplicates instrumentation and collides
spans (roadmap risk #1); (b) the M9 DoD only needs "traceable end-to-end **via logs**", which the
minimal seam satisfies without the SDK's weight (YAGNI / parsimony ladder; Unbreakable Rule 11).

## M8 adoption contract

M8 adopts this seam as the **source of the `trace_id`** and layers OpenTelemetry exporters on top:

- Reuse `resolveTraceId` / `newTraceId` as the trace-id origin (W3C-compatible, so it maps to an OTel
  trace-id directly).
- Wrap each hop's existing structured log (which already carries `trace_id`) in an OTel span, using the
  same id — no re-origination, no duplicate instrumentation.
- The `webhook_deliveries.trace_id` column remains the persistence point for the async/reconciler path.

This keeps the instrumentation single-sourced across M9 and M8.

## Consequences

- Positive: end-to-end traceability now (via logs); zero new runtime deps; M8 has a clean adoption seam.
- Neutral: `computeBackoff`'s full-jitter (ADR-2, M9) and this seam are policy/primitives that M8's full
  observability layer will consume.
- Risk closed: no double OTel instrumentation between M9 and M8.

## Related (M9 ADRs, recorded in the plan)

- ADR-2 (M9): explicit backoff policy via pg-boss send-options (pure `computeBackoff` + `toPgBossRetry`).
- ADR-3 (M9): embedder provider registry as an OCP seam; 3rd provider YAGNI-deferred.

(ADR-2/ADR-3 are documented in `knowledge-base/plans/m9-close-gaps-plan.md § ADRs`; this file is the
standalone cross-milestone artifact the M9 DoD required for the tracing seam.)
