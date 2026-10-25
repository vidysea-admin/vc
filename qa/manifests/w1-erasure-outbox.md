# Manifest — w1-erasure-outbox
**Contract:** D-112 Q9 (Umesh, 2026-10-25): erasure must not drop undelivered outbox events; it delivers or holds them, then deletes. Criteria C1 (= E1), C2 (= E2), C3 (= E3) below.
**Date:** 2026-10-25
**Executor:** claude-sonnet-5-5 (maker build subagent), worktree D:/vc/.worktrees/w1-erasure-outbox, branch wave/w1-erasure-outbox
**Issues addressed:** ISS-t-034-de-2, ISS-t-034-de-1 (retention half), ISS-t-029-rev-1
Policy-Version: proportional-verification/2026-10-19.17
Tier: L (erasure, data write)

## Acceptance (verbatim from qa/evidence/p1-briefs/w1-erasure-outbox.md)

**C1 / E1 (ISS-t-034-de-2): undelivered events survive erasure**
- Erasure never deletes a webhook_outbox row that is still pending or undelivered. It either delivers the event first, or holds the erasure until the event is delivered or dead.
- A delivered or dead row is deleted, as today.
- The erasure.requested event to the partner is never lost.
- Tests, with fake db and outbox:
  - A pending row plus an erasure: the row is not silently dropped (the event is delivered, or the erasure is held).
  - A delivered row: it is deleted.
  - Both with VC_ERASURE_AUTO_DELETE on and off.

**C2 / E2 (ISS-t-034-de-1): the drain does not scan all-time history**
- Delivered and dead rows older than a retention window are purged, or excluded from the drain query.
- The window is a named constant with a documented default.
- Test: old delivered rows are purged and pending rows are kept.

**C3 / E3 (ISS-t-029-rev-1): stale pending requests expire**
- A pending erasure request that is never confirmed expires after a TTL (a named constant), so it no longer holds the unique open slot.
- Confirmed and awaiting_approval behaviour is unchanged.
- Test: a stale pending request expires, and a new request can open.

**Dual check:** yes (prod-write: erasure deletes student data from the webhook_outbox; a wrong filter either loses the partner's erasure event or leaves student residue). Two independent checkers.
dual-trigger: prod-write packages/db/src/erasure.ts:1515

Round: 1 round, 7 files (3 src, 4 tests), 3 criteria, est 45 min (Tier L budget)

## What changed (edited in place)
- packages/db/src/erasure.ts:1445 `ErasureStep.hold?` (new optional field on the existing interface); :1486-1500 `settledEventStudent` / `undeliveredEventStudent` filters; :1515 the existing webhook_outbox ERASURE_PLAN entry now deletes only delivered/dead rows (`filter`), keeps `residue: byEventStudent` (all rows), and sets `hold`; :1782 executeErasure's existing step loop counts held rows after the delete and records the step as `failed` with `held:<n>_undelivered` (request goes `failed`, retryable, fence kept). Erasure cannot deliver (packages/db has no network), so it HOLDS; the drain delivers or kills the row and a retry of executeErasure completes.
- packages/db/src/erasure.ts:300 `ERASURE_PENDING_TTL_MS` (24h); `staleness()` gains the `"pending"` reason; `requestErasure` takes an optional third arg `{now?, auditHmacKey?}` and, on the one-open-request unique-index hit, `expireStalePending` (:1133) closes a stale pending row as `expired` (via the existing `closeUnpurged`, pseudonymised) and retries the insert once. No key, a fresh row, or any non-pending status keeps the old refusal.
- packages/engine/src/webhooks/outbox.ts:48 `WEBHOOK_OUTBOX_RETENTION_MS` (30d), `SettledPurgingOutbox`, `purgeSettledWebhookOutbox`, and `purgeSettled(beforeIso)` on InMemoryWebhookOutbox (:104) and MongoWebhookOutbox (:215). The `WebhookOutbox` interface is unchanged (test fakes typed `WebhookOutbox` still compile). The status-scoped drain query half of ISS-t-034-de-1 was already repaired by T-054 (list(statuses)). Note: the brief's path `packages/db/src/outbox.ts` does not exist; the outbox lives in packages/engine/src/webhooks/outbox.ts.
- apps/api/src/server.ts:472 requestErasure route passes the configured audit key (when the workflow is configured) so E3 applies at the API.
- Tests: packages/db/tests/erasure.test.ts (existing "T-034/B15 ... webhook_outbox" test: A's seeded event is now `delivered`, B's stays pending; + 5 new w1-erasure-outbox tests), packages/db/tests/erasure-approver.test.ts (+2 W1-E3), packages/engine/tests/webhooks-outbox-mongo.test.ts (+3 E2), apps/api/tests/server.test.ts (+1 E3 api).

## Tests and pre-checks (final code sha 762ec01; all run under scripts/vc-testlock.sh)
Tests[C1]: packages/db/tests/erasure.test.ts (`w1-erasure-outbox E1 (autoDelete=false|true)` x pending|failed, the `ONLY delivered/dead` test, the amended T-034/B15 delivered-row purge test) — they reach the hold, the settled-row delete and the retry-completes path, with VC_ERASURE_AUTO_DELETE on and off
Pre-check[C1]: 762ec01 VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 900 pnpm exec tsx --test packages/db/tests/erasure.test.ts (cwd packages/db, path tests/erasure.test.ts) -> exit 0 (76 passed, 0 failed); packages/db/tests/db-scope.test.ts 11 of 11
Tests[C2]: packages/engine/tests/webhooks-outbox-mongo.test.ts (`w1-erasure-outbox E2`: constant, Mongo with tenant isolation and old/recent and pending/failed kept, in-memory) — they reach purgeSettled in both implementations and the named retention constant
Pre-check[C2]: 762ec01 VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 900 pnpm exec tsx --test packages/engine/tests/webhooks-outbox-mongo.test.ts (cwd packages/engine, path tests/webhooks-outbox-mongo.test.ts) -> exit 0 (14 passed, 0 failed); also webhooks-outbox 7 of 7, webhooks-delivery-drain 5 of 5, crisis-escalation 42 of 42
Tests[C3]: packages/db/tests/erasure-approver.test.ts (`W1-E3`, 2 tests) and apps/api/tests/server.test.ts (`w1-erasure-outbox E3 api`) — they reach the pending-TTL expiry, the new request opening, and the unchanged confirmed refusal, at db and API level
Pre-check[C3]: 762ec01 VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 900 pnpm exec tsx --test packages/db/tests/erasure-approver.test.ts apps/api/tests/server.test.ts (run per package cwd: packages/db tests/erasure-approver.test.ts, apps/api tests/server.test.ts) -> exit 0 (15 passed, 0 failed; 35 passed, 0 failed)
Typecheck: pnpm exec tsc --noEmit in packages/db, packages/engine, apps/api -> exit 0 each.
Red: E1 tests ran red before the source edit (4 of 4 held-erasure tests failed with "an undelivered event holds the erasure"). E2/E3 tests reference not-yet-existing exports, so they were not executed red before the source edit; their red is shown by the falsifiers below.

## Falsification (in a clone under the scratchpad, never in the worktree; baseline green, mutant red, clone discarded)
- E1: webhook_outbox step reverted to `filter: byEventStudent` with no `hold` -> the 4 E1 held-erasure tests FAIL (1 pass).
- E2: purge ignores the retention cutoff and status in both implementations -> 2 E2 tests FAIL (Mongo, memory).
- E3: `staleness()` pending branch disabled -> the W1-E3 db test FAILS and the api E3 test FAILS.

## Open risks (for the checkers)
- A `failed` outbox row (non-retryable 4xx rejection) holds an erasure until an operator runs the drain with includeFailed (it never becomes delivered/dead on its own). Chosen per "pending or undelivered"; a different policy for `failed` is a Umesh decision.
- Under VC_ERASURE_AUTO_DELETE the reconfirm route now answers 500 `erasure_incomplete` (retryable) while the erasure.requested event is still queued, instead of silently dropping it. The execute route retries after the drain delivers.
- purgeSettledWebhookOutbox has no scheduler yet (none exists for the drain either); it is a callable, tested function, per ISS-t-034-de-1 "before any real drain scheduler is built".
- E3 expires a stale pending row only when a new request for that student arrives (the fence sweep never sees a pending row because it has no fence); stale pending rows for students nobody re-requests linger with their clear studentId, as before.

Metrics: start=2026-10-25T06:53:45+05:30 end=2026-10-25T07:20:00+05:30 wall_min=26 agent_min=26 blocked_min=0 suite_runs=0 repeat_runs=1 mutations=4 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=0 mutants=4 defects_unit=0 defects_6c=0
Fix cycle: 0
Status: ready-for-check
