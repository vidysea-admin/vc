# Build brief: w1-erasure-outbox (/maker build subagent)

Slug: w1-erasure-outbox. Follow every rule in qa/evidence/p1-briefs/w1-common-rules.md (read it first).

- **Tier:** L (erasure, data write).
- **Dual check:** required. `dual-trigger: prod-write packages/db/src/erasure.ts:<line of the outbox delete in ERASURE_PLAN, ~1426>`.
- **Decision:** D-112 Q9 (Umesh, 2026-10-25). Erasure must not drop undelivered outbox events: it delivers or holds them, then deletes.

## Read first
- `qa/issues.jsonl` rows ISS-t-034-de-2, ISS-t-034-de-1 and ISS-t-029-rev-1.
- `packages/db/src/erasure.ts`: ERASURE_PLAN (~1426-1435) and `staleness()`.
- `packages/db/src/outbox.ts` (~172).
- Do NOT read or merge branch `wip/t052-cycle2`. T-052 stays a separate unit.

## Acceptance

**E1 (ISS-t-034-de-2): undelivered events survive erasure**
- Erasure never deletes a webhook_outbox row that is still pending or undelivered. It either delivers the event first, or holds the erasure until the event is delivered or dead.
- A delivered or dead row is deleted, as today.
- The erasure.requested event to the partner is never lost.
- Tests, with fake db and outbox:
  - A pending row plus an erasure: the row is not silently dropped (the event is delivered, or the erasure is held).
  - A delivered row: it is deleted.
  - Both with VC_ERASURE_AUTO_DELETE on and off.

**E2 (ISS-t-034-de-1): the drain does not scan all-time history**
- Delivered and dead rows older than a retention window are purged, or excluded from the drain query.
- The window is a named constant with a documented default.
- Test: old delivered rows are purged and pending rows are kept.

**E3 (ISS-t-029-rev-1): stale pending requests expire**
- A pending erasure request that is never confirmed expires after a TTL (a named constant), so it no longer holds the unique open slot.
- Confirmed and awaiting_approval behaviour is unchanged.
- Test: a stale pending request expires, and a new request can open.

## Regression
- packages/db: `erasure*.test.ts`, `outbox*.test.ts`, `db-scope.test.ts` and `crisis-escalation.test.ts`.
- apps/api: `tests/server.test.ts` (erasure and export routes).
