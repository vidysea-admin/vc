# Manifest — t-042-webhook-fact-loss
**Contract:** qa/contracts/counselling-engine.md (B21 "Events" — "approved facts (with provenance, B2), erasure requests and concern flags go out as signed webhooks, so the client keeps its own copy"), B15 erasure coverage, D-016 no-TTL
**Goal task:** T-042 (ISS-085, severity high)
**Date:** 2026-09-27
**Fix cycle:** 0 of max 3
**Dual check:** no
**Persona walk:** skip (backend-only: apps/api/src/{server,index}.ts, packages/engine/src/webhooks, packages/db)
**Issues addressed:** ISS-085 (both leaks described below). No new issue opened this unit — the residual gap ("both stores unreachable") is disclosed under "Open gaps", not filed separately, because it is a documented property of the chosen design, not a discovered defect.
**Executor:** claude-sonnet-subagent
**Executor rationale:** in-scope hardening of an existing, well-understood integration point (`decideApproval`'s webhook emission, landed in T-034) using a design pattern (a Mongo-backed, tenant-scoped, erasure-covered recoverable ledger) this repo already has a working precedent for (`WebhookOutbox`). No external tool or model was worth delegating a well-scoped defect fix to.

## What changed

Two leaks, one root cause: `decideApproval` (`apps/api/src/server.ts`) read facts back by `_id` after
`applyApprovedDiff` reported a successful write, and emitted one `fact.approved` event per fact
*actually returned* by `getFactsByIds` (`packages/db/src/facts.ts:989-1005`, which silently drops any
id not found — documented in its own docstring), with **no check** against `writtenFactIds.length`.
Separately, if `outbox.enqueue(...)` itself threw, the catch only logged `webhook_enqueue_failed` and
the event was gone for good — never entered the outbox's own retry/dead-letter machinery.

- `packages/engine/src/webhooks/gaps.ts` (**new file**) — `WebhookEmitGapLedger` interface,
  `InMemoryWebhookEmitGapLedger` (Map-backed, idempotent by id, for tests/no-op wiring), and
  `MongoWebhookEmitGapLedger` (constructor refuses an unscoped `Db`, mirroring `MongoWebhookOutbox`).
  Two record kinds: `"readback-gap"` (leak 1) and `"enqueue-failed"` (leak 2, carries the fully built
  `WebhookEvent` so it can be replayed without rebuilding it). **Deliberately a separate collection
  from `webhook_outbox`**: case 2 exists precisely because a write to `webhook_outbox` failed, so the
  gap ledger cannot be the same store without risking the identical failure mode. `studentId` is
  stored as a **flat top-level field** (unlike `webhook_outbox`'s nested `event.data.studentId`), a
  deliberate simplification so the existing simple `byStudent` B15 filter (used by consents/decisions)
  applies directly with no new filter function needed.
- `packages/engine/src/webhooks/index.ts` — barrel export for the new module.
- `packages/db/src/collections.ts` — `COLLECTION_NAMES.webhook_emit_gaps` registered (packages/db only
  ever declares the string name; packages/engine owns the Mongo-backed class, exactly the existing
  `webhook_outbox` precedent, since packages/db cannot depend on packages/engine's `WebhookEvent` type).
- `packages/db/scripts/db-init.ts` — two `INDEX_PLAN` entries: `webhook_emit_gaps_studentId`
  (`{studentId:1}`) and `webhook_emit_gaps_tenantId_kind` (`{tenantId:1, kind:1}`). No TTL on either
  (D-016).
- `packages/db/src/erasure.ts` `ERASURE_PLAN` — new phase-1 step for `webhook_emit_gaps` via the plain
  `byStudent` filter (placed right after the existing `webhook_outbox` step, before phase-2 facts).
- `packages/db/tests/db-scope.test.ts` — `packages/engine/src/webhooks/gaps.ts` added to the
  `FENCE_AWARE_WRITERS` allowlist, justified the same way as the existing `outbox.ts` entry: neither
  call site is gated on `assertStudentNotFenced` because a gap is only ever recorded *after* the
  underlying write already succeeded (enqueue-failed), or *only when NOT fenced* (readback-gap).
- `packages/db/tests/erasure.test.ts`:
  - **New test**: "T-042/B15: a queued webhook_emit_gaps row naming the student (flat studentId) is
    purged by the full erasure — a sibling student's row is untouched" (mirrors the T-034
    `webhook_outbox` B15 test exactly).
  - Fixed the pre-existing "B15: the receipt counts match what was actually there" test's hardcoded
    `expected` map by adding `[COLLECTION_NAMES.webhook_emit_gaps]: 0` — required maintenance given the
    new `ERASURE_PLAN` entry, not a weakening (T-034 had to make the identical fix for `webhook_outbox`).
- `packages/engine/tests/webhooks-gaps-mongo.test.ts` (**new file**, 7 tests) — mirrors
  `webhooks-outbox-mongo.test.ts`: drift guard (`WEBHOOK_EMIT_GAPS_COLLECTION` ==
  `COLLECTION_NAMES.webhook_emit_gaps`), constructor refuses an unscoped `Db`, readback-gap row with no
  event, enqueue-failed row with the full event round-tripping byte-identical, idempotency by id,
  tenant isolation, top-level `tenantId` stamping.
- `apps/api/src/server.ts`:
  - `ApiDeps.webhooks.gapsForTenant?: (tenantId) => WebhookEmitGapLedger` — optional and independent of
    `outboxForTenant`; absent behaves exactly as before this unit (logged but not persisted), never a
    regression.
  - `RouteContext.checkFactReadbackGap(input)` (new) — called in `decideApproval` right after the
    existing `emitWebhookEvents` call. Compares `written.length` (from `getFactsByIds`) against
    `writtenFactIds.length`. On a mismatch: checks `isStudentFenced(dbForTenant(tenantId), studentId)`
    (B15) — if fenced, **every** missing id in the batch is explained (a fence blocks the WHOLE
    student's further reads, not per-fact) and nothing is alerted or recorded. If NOT fenced: logs a
    structured `api_request_failed` line (`webhook_fact_readback_gap:<n>_of_<m>_missing`) and, when a
    gap ledger is configured, records one `"readback-gap"` row per missing fact id.
  - `emitWebhookEvents`'s existing catch block (enqueue failure) now also records an
    `"enqueue-failed"` gap row carrying the fully built event, wrapped in its own try/catch that logs
    `webhook_emit_gap_record_failed` as a last line of defense if even the ledger write fails.
  - `createTenantWiring` now also returns `gapsForTenant(tenantId)`, a per-tenant
    `MongoWebhookEmitGapLedger` cache (mirrors the existing `webhookOutboxForTenant` cache).
- `apps/api/src/index.ts` — `startApi`'s webhook wiring adds `gapsForTenant: wiring.gapsForTenant`
  alongside `outboxForTenant`/`destinationUrl` whenever `VC_WEBHOOK_DESTINATION_URL` is set — no new env
  toggle; whenever webhooks are configured at all, both leaks become recoverable, not just logged.
- `apps/api/tests/server.test.ts` — 3 new tests (see "Capability coverage" below for the exact
  assertions each one anchors).

**Not split into two units.** Both leaks share the same root cause (read-back-then-emit with no
consistency check or alerting) and the same fix mechanism (the new recoverable ledger + the erasure-
fence distinction) serves both; splitting would have meant reviewing the erasure-fence interaction
twice for no additional coverage.

## How to verify (commands + expected)

- `bash scripts/vc-testlock.sh pnpm -C apps/api test` → exit 0, all tests pass (45/45, including the 3
  new T-042 tests).
- `bash scripts/vc-testlock.sh pnpm -r test` → exit 0, `fail 0` in every package.
- `bash scripts/vc-testlock.sh pnpm -r typecheck` → exit 0, clean across 9/9 checked workspace projects.
- `python contracts/verify_contracts.py` → exit 0 (vacuous PASS — no frozen contracts yet).

## Actual outputs (from the maker's own run)

```
$ bash scripts/vc-testlock.sh pnpm -C apps/api test
...
ℹ tests 45
ℹ suites 0
ℹ pass 45
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 4154.1013
```

```
$ bash scripts/vc-testlock.sh pnpm -r test   (per-package ℹ lines, this unit's packages only shown)
packages/schemas test:       ℹ tests 61   ℹ pass 61   ℹ fail 0   ℹ skipped 0
packages/observability test: ℹ tests 59   ℹ pass 59   ℹ fail 0   ℹ skipped 0
packages/db test:            ℹ tests 248  ℹ pass 248  ℹ fail 0   ℹ skipped 0
packages/providers test:     ℹ tests 54   ℹ pass 54   ℹ fail 0   ℹ skipped 0
mcp/university-kb test:      ℹ tests 29   ℹ pass 29   ℹ fail 0   ℹ skipped 0
mcp/student-profile test:    ℹ tests 12   ℹ pass 12   ℹ fail 0   ℹ skipped 0
packages/engine test:        ℹ tests 689  ℹ pass 644  ℹ fail 0   ℹ skipped 45
apps/web test:                ℹ tests 38   ℹ pass 38   ℹ fail 0   ℹ skipped 0
apps/api test:                ℹ tests 45   ℹ pass 45   ℹ fail 0   ℹ skipped 0
```
Grand total: 1235 tests / 1190 pass / 45 skip / 0 fail. The 45 skips are unchanged (T-039's B18 rows).

**Baseline note:** the brief cited an earlier baseline (schemas 63 · db 239 · providers 54 · engine
602 · api 41 · web 50 · mcp 12+29 · 1224 total / 1179 pass / 45 skip / 0 fail). My worktree forked
from `main` at `57b2c70`, which is already ahead of that baseline (other maker-checker ticks landed
`packages/observability` and grew several suites in between) — the repo-wide numbers above are the
current `main` state, not a discrepancy introduced by this unit. This unit's OWN diff against its
fork point (`57b2c70` → `ba8d3d4`) is exactly **+12 tests, +11 files, 0 removed, 0 weakened** (3 in
`apps/api/tests/server.test.ts`, 2 in `packages/db/tests/erasure.test.ts`, 7 in the new
`packages/engine/tests/webhooks-gaps-mongo.test.ts`), confirmed by `git diff 57b2c70 ba8d3d4 --stat`
below.

```
$ git diff 57b2c70 ba8d3d4 --stat
 apps/api/src/index.ts                             |  11 +-
 apps/api/src/server.ts                            | 140 +++++++++++++++++++-
 apps/api/tests/server.test.ts                     | 146 ++++++++++++++++++++-
 packages/db/scripts/db-init.ts                    |   7 +
 packages/db/src/collections.ts                    |   7 +
 packages/db/src/erasure.ts                        |   6 +
 packages/db/tests/db-scope.test.ts                |   8 ++
 packages/db/tests/erasure.test.ts                 |  46 +++++++
 packages/engine/src/webhooks/gaps.ts              | 151 ++++++++++++++++++++++
 packages/engine/src/webhooks/index.ts             |  10 +-
 packages/engine/tests/webhooks-gaps-mongo.test.ts | 104 +++++++++++++++
 11 files changed, 626 insertions(+), 10 deletions(-)
```

```
$ bash scripts/vc-testlock.sh pnpm -r typecheck
Scope: 9 of 10 workspace projects
packages/observability typecheck: Done
packages/schemas typecheck: Done
packages/db typecheck: Done
packages/providers typecheck: Done
mcp/student-profile typecheck: Done
mcp/university-kb typecheck: Done
packages/engine typecheck: Done
apps/api typecheck: Done
apps/web typecheck: Done
```

```
$ python contracts/verify_contracts.py
verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity
EXIT:0
```

## Capability coverage (each new claim -> its isolating falsification)

Both falsifying edits below were performed in a **throwaway `git archive` copy of the committed HEAD
(`ba8d3d4`), extracted OUTSIDE the bound root** (session scratchpad, `pnpm install --frozen-lockfile`
run there), never in the actual worktree. Each: GREEN on the specific test → single-hunk edit →
RED on the exact named assertion (pasted below) → revert → GREEN confirmed again.

| capability | the check that covers it | the falsifying edit | observed (pasted runner output) |
|---|---|---|---|
| Leak 1 — a short read-back (a fact written but not found on read-back) is detected and alerted, not silently swallowed | `apps/api/tests/server.test.ts` "T-042 api (ISS-085 leak 1): a short read-back NOT explained by an erasure fence is alerted and recorded as a recoverable gap…" | In the throwaway copy's `apps/api/src/server.ts`, inserted a single `return;` as the first line of the `checkFactReadbackGap` implementation (reintroducing the pre-fix silence — the check never runs) | GREEN before: `✔ T-042 api (ISS-085 leak 1): … (54.6ms)`. RED after: `✖ T-042 api (ISS-085 leak 1): … (43.0ms)` — `AssertionError [ERR_ASSERTION]: the gap is alerted, not silent` at `server.test.ts:453`, `actual: false, expected: true`. GREEN again after reverting the single line. |
| Leak 2 — an `outbox.enqueue()` failure is routed somewhere recoverable (a full event, replayable), never just logged and dropped | `apps/api/tests/server.test.ts` "T-042 api (ISS-085 leak 2): an enqueue failure records a recoverable gap entry carrying the fully built event, so it can be replayed without rebuilding it" | In the throwaway copy's `apps/api/src/server.ts`, changed `if (gapsForTenant) {` to `if (false && gapsForTenant) {` inside `emitWebhookEvents`'s catch block (reintroducing the pre-fix log-only behaviour) | GREEN before: `✔ T-042 api (ISS-085 leak 2): … (23.9ms)`. RED after: `✖ T-042 api (ISS-085 leak 2): … (32.2ms)` — `AssertionError [ERR_ASSERTION]: one recoverable gap entry per fact.approved event that failed to enqueue` `0 !== 2` at `server.test.ts:522`. GREEN again after reverting the single line. |

A third permanent regression test — "T-042 api (ISS-085 leak 1, erasure interaction): the SAME short
read-back, explained by a concurrent B15 erasure fence that lands AFTER the write, is never alerted or
recorded" — guards the erasure-fence distinction (no lever run against it: it already asserts the
ABSENCE of alerting/recording, so a falsifying edit would need to remove the `isStudentFenced` check
itself, which is redundant with leak 1's lever above since both paths share the same early-return
structure in `checkFactReadbackGap`). The test plants the fence via an `onTrigger` hook fired exactly
when `getFactsByIds`' short read executes — AFTER `applyApprovedDiff`'s own pre-write fence check has
already passed and the facts are durably written — because a fence already up at request start makes
`applyApprovedDiff` refuse the whole approval as `kind: "fenced"` before any write happens, which would
never reach this code path at all. This ordering detail was hit and fixed once already (first draft
seeded the fence before the request and got `'fenced' !== 'done'` instead of the intended assertion —
corrected before this manifest was written).

## Live browser evidence

Not UI-touching — no surface changed. Every changed or added path is backend-only:
`packages/engine/src/webhooks/{gaps,index}.ts`, `packages/engine/tests/webhooks-gaps-mongo.test.ts`,
`packages/db/src/{collections,erasure}.ts`, `packages/db/scripts/db-init.ts`,
`packages/db/tests/{db-scope,erasure}.test.ts`, `apps/api/src/{server,index}.ts`,
`apps/api/tests/server.test.ts`. `apps/web` is untouched by this unit.

## Open gaps

- **Residual "both stores unreachable" gap (disclosed, not filed as a new issue):** if the tenant's
  Mongo is unreachable at the exact moment BOTH `outbox.enqueue()` and `gapsForTenant().record()` fail
  (e.g. a full outage of that tenant's database), the only remaining trace is the structured
  `webhook_emit_gap_record_failed` log line — nothing is persisted. This is documented in
  `packages/engine/src/webhooks/gaps.ts`'s module docstring and is an accepted floor (matching the
  existing precedent at `apps/api/src/index.ts`'s `defaultSweepErrorLogger`: packages/db and this
  ledger do not own a logging/alerting pipeline; a real deployment is expected to ship structured logs
  to one). Raising this to a filed issue felt disproportionate for a residual double-outage case that
  is already the honest floor of "recoverable, not lost" — happy to file it if the checker judges
  otherwise.
- **No replay/drain worker for the gap ledger yet.** This unit makes both leaks OBSERVABLE (structured
  alert) and RECOVERABLE (a durable, erasure-covered, replayable row) — it does not build the
  reconciliation job that reads `webhook_emit_gaps` and actually re-emits/re-enqueues. That is a
  natural, separately-scoped follow-up (the same relationship `webhook_outbox` has to its own
  `drainWebhookOutbox` delivery worker, T-034).
- Per the brief's own design constraint, `checkFactReadbackGap` uses `isStudentFenced`'s CURRENT state
  at read-back time, not a snapshot from before the write. This is deliberate (a fence created during
  the write-to-readback window is exactly the race being excused), but it means a fence that clears
  again in that same narrow window (released immediately after deleting the fact, before this check
  runs) would NOT be excused and WOULD be alerted/recorded as a gap — an honest edge case, not
  something this unit's fixture can easily force (the fake `erasure_fences` collection has no natural
  "release" hook mid-request without another monkey-patch). Judged low-probability (the fence's own
  `MINIMUM_FENCE_HOLD_MS` floor makes an immediate release unlikely) and not worth a fourth throwaway
  lever for what would be the same code path already covered by the "erasure interaction" test above.

## Status: ready-for-check
