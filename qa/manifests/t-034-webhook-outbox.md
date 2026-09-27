# Manifest — t-034-webhook-outbox
**Contract:** qa/contracts/counselling-engine.md (B21 "Events"/"Webhooks", B2 provenance, B12 the DB boundary, B15 erasure coverage)
**Goal task:** T-034
**Date:** 2026-09-27
**Fix cycle:** 0 of max 3
**Dual check:** no
**Persona walk:** skip (backend-only: packages/engine/src/webhooks, packages/db)
**Issues addressed:** none closed this unit (webhook_outbox is a new collection; the prior ISS-t-027-rev-3 concern about a top-level tenantId is satisfied by construction — MongoWebhookOutbox refuses an unscoped Db and every write goes through tenantScopedDb, see "What changed"). One new issue opened: ISS-t-034-erasure-webhook-race (see "Open gaps").
**Executor:** claude-sonnet-subagent
**Executor rationale:** in-scope wiring of already-built pieces (T-027's webhook builders/outbox/delivery, T-025's tenant scope, T-029's erasure gate) into apps/api's two route handlers, plus two small read-back helpers in packages/db. No external tool or model was worth delegating a well-scoped, well-specified integration task to.

## Inherited state (session handoff)

A previous session wrote most of this unit and died before committing. `git status` on pickup showed
~11 modified files (packages/engine/src/webhooks/{outbox,delivery,schemas,index,signing}.ts,
packages/db/{src/collections,src/erasure,scripts/db-init,tests/db-scope}.ts,
packages/engine/tests/webhooks-signing.test.ts, qa/issues.jsonl) and 3 new untracked test files
(webhooks-emission.test.ts, webhooks-outbox-mongo.test.ts, webhooks-delivery-drain.test.ts). All of it
was read and judged: the outbox/delivery/schema/test code was complete and high quality and is
UNCHANGED except for one docstring line in schemas.ts (documenting the two call sites, added below).
Nothing inherited was deleted, renamed, or rewritten.

The one real gap: **nothing called any of it.** `apps/api/src/server.ts` had zero wiring from the
`decideApproval`/`confirmErasure` routes to the webhook builders. That wiring is this unit's main
addition, below.

## What changed

- `packages/db/src/facts.ts:189-206` — new `getFactsByIds(db, studentId, ids)`: reads back exactly the
  facts `applyApprovedDiff` just wrote, by their own `_id`s. `ScribeResult`'s `written` status carries
  only `writtenFactIds`, never the fact content, so this is the only way `decideApproval` can build a
  fact.approved event from what was ACTUALLY durably persisted (source and all) rather than from the
  counsellor's raw approval response (which may differ — an edit, a schema default).
- `packages/db/src/erasure.ts` (new function, right after `requestErasure`) — `getErasureRequest(db, requestId)`:
  a read-only lookup the confirm call site uses to get the `reason`/`requestedAt` a request was opened
  with (neither `confirmErasure` nor `reconfirmErasure` returns them). Documented as safe to call ONLY
  before the second confirmation — `ErasureRequestDoc.studentId` is redacted to a hash at that point.
- `packages/engine/src/webhooks/schemas.ts:4-11` — docstring updated to name both call sites
  (`decideApproval` reads back via `getFactsByIds`; `confirmErasure` reads back via `getErasureRequest`)
  and to say explicitly why: the last point the row still carries a clear `studentId`.
- `apps/api/src/server.ts`:
  - `ApiDeps.webhooks?: { outboxForTenant, destinationUrl }` — optional; unset keeps the whole feature a
    no-op, same behaviour as before this unit landed.
  - `RouteContext.emitWebhookEvents(events)` — enqueues each event on the tenant's outbox; an enqueue
    failure is logged (`webhook_enqueue_failed`) and swallowed, NEVER turns an already-successful
    approval/erasure-confirm into an error response.
  - `decideApproval` route: on `outcome.kind === "done" && outcome.result.status === "written"`, reads
    the just-written facts back via `getFactsByIds` and emits one `fact.approved` event per fact (B2
    provenance: the event carries the fact's own `source`, unchanged).
  - `confirmErasure` route: after the first confirmation, reads the request row via `getErasureRequest`
    and — only when `row.studentId` is still present — emits one `erasure.requested` event carrying the
    request's own `reason`/`requestedAt`.
  - `createTenantWiring` now also returns `webhookOutboxForTenant(tenantId)`, a per-tenant
    `MongoWebhookOutbox` cache (mirrors the existing per-tenant graph cache).
- `apps/api/src/index.ts:162-177` — `startApi` wires `deps.webhooks` from `VC_WEBHOOK_DESTINATION_URL`
  (env var, new). Unset = `ApiDeps.webhooks` stays `undefined` = no-op, same as a test that never
  configures it.
- `.env.example` — documents `VC_WEBHOOK_DESTINATION_URL` (optional; the drain worker that actually
  POSTs is a separate process, not started by this unit — "no network send" per the unit's own scope).
- `packages/db/src/collections.ts` (inherited, unchanged by me) — `COLLECTION_NAMES.webhook_outbox`
  registered.
- `packages/db/scripts/db-init.ts` (inherited, unchanged by me) — two `INDEX_PLAN` entries:
  `{tenantId:1, status:1}` (drain query) and `{"event.data.studentId":1}` (B15 dotted-path erasure
  filter).
- `packages/db/src/erasure.ts` `ERASURE_PLAN` (inherited, unchanged by me except the new
  `getErasureRequest` function) — phase-1 step for `webhook_outbox` via `byEventStudent` (`event.data.studentId`).
- `packages/db/tests/db-scope.test.ts` (inherited, unchanged by me) — `MongoWebhookOutbox` added to the
  `FENCE_AWARE_WRITERS` allowlist (it is deliberately not gated on `assertStudentNotFenced` — an
  outbound notification about an already-decided event, not a new write to the student's own record).
- `packages/db/tests/erasure.test.ts`:
  - Fixed a pre-existing regression: "B15: the receipt counts match…" hardcoded an `expected` map that
    predated the inherited `webhook_outbox` `ERASURE_PLAN` step; added `[COLLECTION_NAMES.webhook_outbox]: 0`
    (this fixture never enqueues a webhook event).
  - **New test** (line ~347): "T-034/B15: a queued webhook_outbox event that names the student
    (event.data.studentId) is purged by the full erasure -- a sibling student's queued event is
    untouched". This closes a real coverage gap: no existing fixture ever seeded a `webhook_outbox`
    document, so the generic "full purge leaves ZERO documents" test never actually exercised the new
    `byEventStudent` `ERASURE_PLAN` step. The new test seeds one queued event for student A and one for
    student B, runs the full confirm/reconfirm/approve/execute gate for A, and asserts (a) A's event is
    gone via the same `docsMentioning`/`identifiers` scan the file's other B15 tests use, (b) the
    receipt line for `webhook_outbox` shows `deleted: 1, remaining: 0, outcome: "purged"`, and (c) B's
    event is untouched.
- `apps/api/tests/server.test.ts` — 4 new tests (fact.approved emission with B2 provenance + no-op when
  unconfigured + enqueue-failure isolation; erasure.requested emission at first confirmation).
- `qa/issues.jsonl` — appended `ISS-t-034-erasure-webhook-race` (see "Open gaps"); the pre-existing
  `ISS-t-034-concern-hook` entry from the inherited session is untouched.

## How to verify (commands + expected)

- `pnpm -C packages/db test` → expected: exit 0, all tests pass (247/247 with the new B15 test).
- `pnpm -C packages/engine test` → expected: exit 0, all tests pass (587/587, unchanged from inherited).
- `pnpm -C apps/api test` → expected: exit 0, all tests pass (42/42, including the 4 new T-034 tests).
- `pnpm -r typecheck` → expected: exit 0, clean across 9/10 workspace projects (the 10th, apps/web, is
  not a TypeScript-checked project in this workspace's scope list — unrelated to this unit).
- `pnpm -r test` → expected: exit 0, `fail 0` in every package.

## Actual outputs (from maker's own run, final — after all falsifications below were reverted)

```
$ pnpm -C packages/db test
...
ℹ tests 247
ℹ suites 0
ℹ pass 247
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 4842.922
DB_EXIT=0
```

```
$ pnpm -C packages/engine test
...
ℹ tests 587
ℹ suites 0
ℹ pass 587
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 62018.1843
ENGINE_EXIT=0
```

```
$ pnpm -C apps/api test
...
ℹ tests 42
ℹ suites 0
ℹ pass 42
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 17078.9021
API_EXIT=0
```

```
$ pnpm -r typecheck
Scope: 9 of 10 workspace projects
packages/schemas typecheck: Done
packages/observability typecheck: Done
packages/db typecheck: Done
packages/providers typecheck: Done
mcp/student-profile typecheck: Done
mcp/university-kb typecheck: Done
packages/engine typecheck: Done
apps/api typecheck: Done
apps/web typecheck: Done
TC_EXIT=0
```

```
$ pnpm -r test
(every package prints its own "ℹ fail 0"; the aggregate run exits 0)
packages/schemas test: ℹ fail 0
packages/observability test: ℹ fail 0
packages/db test: ℹ fail 0
packages/providers test: ℹ fail 0
mcp/university-kb test: ℹ fail 0
mcp/student-profile test: ℹ fail 0
packages/engine test: ℹ fail 0
apps/web test: ℹ fail 0
apps/api test: ℹ fail 0
EXIT_CODE=0
```

(One transient note: `pnpm -C packages/db test` at first pickup — BEFORE the fix below — reported
`ℹ fail 1` with `AssertionError` on "B15: the receipt counts match what was actually there" because the
inherited `ERASURE_PLAN` webhook_outbox step had no matching entry in that test's hardcoded `expected`
map. Fixed in `packages/db/tests/erasure.test.ts` as described above; every run since is 0 failures.
This machine also carries a shared, machine-wide test lock — waiting several minutes for it mid-run is
normal and was observed once; no run was ever abandoned or reported BLOCKED on that account.)

## Capability coverage (each new claim -> its isolating falsification)

All five falsifying edits below were performed live against the actual source (not described), and
reverted immediately after capturing the FAIL line. `git grep -n FALSIFICATION` across
`packages/engine/src`, `packages/db/src`, `packages/db/scripts` and `apps/api/src` is empty after this
manifest was written, confirming no edit was left in place.

| capability | the check that covers it | the falsifying edit | observed (pasted runner output) |
|---|---|---|---|
| `MongoWebhookOutbox` refuses a non-tenant-scoped `Db` (B12/ISS-t-027-rev-3) | `packages/engine/tests/webhooks-outbox-mongo.test.ts:37` "constructor refuses an unscoped Db" | Removed the `tenantIdOf(db) === undefined` guard in `MongoWebhookOutbox`'s constructor (`packages/engine/src/webhooks/outbox.ts`) | PASS before: `✔ constructor refuses an unscoped Db (5.5478ms)`. FAIL after: `✖ constructor refuses an unscoped Db (3.2577ms)` — `AssertionError [ERR_ASSERTION]: Missing expected exception (TenantScopeError).` |
| `decideApproval` emits one `fact.approved` event per durably-written fact (B2 provenance, read back via `getFactsByIds`) | `apps/api/tests/server.test.ts:323` "T-034 api: decideApproval enqueues one fact.approved webhook event per DURABLY WRITTEN fact…" | Changed the emission guard in `apps/api/src/server.ts`'s `decideApproval` route from `if (outcome.kind === "done" && ...)` to `if (false && outcome.kind === "done" && ...)` | PASS before: `✔ T-034 api: decideApproval enqueues one fact.approved webhook event per DURABLY WRITTEN fact… (355.469ms)`. FAIL after: `✖ … (315.1177ms)` — `AssertionError [ERR_ASSERTION]: one event per written fact` `0 !== 2` |
| `confirmErasure` emits one `erasure.requested` event at the first confirmation (the last point `studentId` is clear) | `apps/api/tests/server.test.ts:502` "T-034 api: the first erasure confirmation enqueues one erasure.requested webhook event…" | Changed `if (row?.studentId)` to `if (false && row?.studentId)` in `apps/api/src/server.ts`'s `confirmErasure` route | PASS before: `✔ T-034 api: the first erasure confirmation enqueues one erasure.requested webhook event… (183.9628ms)`. FAIL after: `✖ … (257.6842ms)` — `AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:` `0 !== 1` |
| `webhook_outbox` is purged by the B15 erasure plan (`event.data.studentId`, a dotted-path residue, not a top-level field) | `packages/db/tests/erasure.test.ts:347` "T-034/B15: a queued webhook_outbox event that names the student… is purged…" (new test, this unit) | Commented out the `webhook_outbox` entry in `ERASURE_PLAN` (`packages/db/src/erasure.ts`) | PASS before: `✔ T-034/B15: a queued webhook_outbox event… (40.1614ms)`. FAIL after: `✖ … (41.7015ms)` — `AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:` `+ [ 'webhook_outbox:evt:erasure.requested:a-1' ]` `- []` |
| `webhook_outbox` is registered under the exact `COLLECTION_NAMES` name the Mongo implementation writes to, and no index on it (or anywhere else) declares a TTL (D-020) | `packages/engine/tests/webhooks-outbox-mongo.test.ts:33` "drift guard…" AND `packages/db/tests/db-init.test.ts:356` "ISS-t-013r-c0-3 scanner: no source file… declares a TTL…" | (a) Changed `WEBHOOK_OUTBOX_COLLECTION` in `outbox.ts` to `"webhook_outbox_WRONG_FALSIFICATION"`. (b) Added `expireAfterSeconds: 3600` to the `webhook_outbox_tenantId_status` index spec in `packages/db/scripts/db-init.ts` | (a) PASS before: `✔ drift guard: the collection name here matches packages/db COLLECTION_NAMES.webhook_outbox (1.6367ms)`. FAIL after: `✖ …` — `AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:` `+ 'webhook_outbox_WRONG_FALSIFICATION'` `- 'webhook_outbox'`. (b) PASS before: `✔ ISS-t-013r-c0-3 scanner: no source file… declares a TTL… (72.4139ms)`. FAIL after: `✖ … (290.7799ms)` — `AssertionError [ERR_ASSERTION]: a TTL was declared; D-020 keeps the full chat until a B15 erasure: D:\vc\...\packages\db\scripts\db-init.ts` |

## Live browser evidence

Not UI-touching — no surface changed. Every changed or added path is backend-only:
`packages/engine/src/webhooks/{outbox,delivery,schemas,index,signing}.ts`,
`packages/engine/tests/webhooks-{signing,emission,outbox-mongo,delivery-drain}.test.ts`,
`packages/db/src/{facts,erasure,collections}.ts`, `packages/db/scripts/db-init.ts`,
`packages/db/tests/{db-scope,erasure}.test.ts`, `apps/api/src/{server,index}.ts`,
`apps/api/tests/server.test.ts`, `.env.example`, `qa/issues.jsonl`. `apps/web` (the only UI package in
this repo) is untouched by this unit.

## Open gaps

- **ISS-t-034-erasure-webhook-race** (open, low severity, logged this unit): `erasure.requested` is
  enqueued at `confirmErasure` (the last point the row still carries a clear `studentId`). Under
  `VC_ERASURE_AUTO_DELETE=true`, `reconfirmErasure` can reach "approved" and run `executeErasure`'s purge
  synchronously in the SAME request as the reconfirm — and the `webhook_outbox` `ERASURE_PLAN` step
  correctly deletes every row for that student, including the `erasure.requested` row just enqueued,
  before any delivery worker (`drainWebhookOutbox`) has a chance to drain it. B15 requires the purge to
  leave no residue, so deleting it is correct per B15 — but it means the auto-delete configuration can
  silently never deliver its own `erasure.requested` notification. Needs either a
  delivery-before-purge ordering guarantee, an explicit drain call in the autoDelete branch before
  `executeErasure` runs, or an accepted-limitation note in ops docs. Out of proportion for this unit's
  scope to fix outright; left as an enumerated, open issue rather than engineered around silently.
- **ISS-t-034-concern-hook** (pre-existing, inherited, unchanged): a `concern.flagged` emission hook
  belongs at `packages/engine/src/scribe/nodes.ts` `recordSessionConcerns`, a file T-012 (crisis
  escalation) was actively changing at this unit's base commit — touching it here would race T-012's
  own edits. Documented as a TODO in `schemas.ts`'s module docstring; not this unit's scope.
- `WebhookFactSourceSchema`'s `counsellor-edit` provenance variant exists at the wire boundary but
  nothing in the engine sets that source on a `Fact` yet (ISS-t-027-rev-2, pre-existing, unchanged) —
  every `fact.approved` event today carries one of `FactSourceSchema`'s four existing variants.

## Status: checked-PASS

**Close-out (cycle 0).** /checker Mode A full protocol, verdict `qa/verdicts/t-034-webhook-outbox.md`
(commit 845d281), `Cycle checked: 0` -> **VERDICT: PASS**. The checker re-ran every verify command
itself (packages/db 247/247, packages/engine 587/587, apps/api 42/42, `pnpm -r typecheck` clean 9/9),
reviewed the whole diff (base 1e040e5, head fb2811b, 21 files +1207/-32) and reproduced all five
capability-coverage rows in a throwaway `git archive` copy outside the bound root -- green first,
then the single-hunk edit, then RED on the exact named assertion, then revert. No FAILURES.

Two ledger changes the checker made, not the maker:
- ISS-t-034-erasure-webhook-race: severity low -> **medium**. Honestly enumerated in "Open gaps", but
  undersold: on the auto-delete path it fails silently and can leave Pathlynks permanently unaware a
  student was erased. Not a written-criterion violation (B21 states the goal, not a delivery-ordering
  guarantee), so it does not FAIL the unit. The independent data-engineer review rated the same race
  **high** (ISS-t-034-de-2); the higher of the two stands as the row severity.
- ISS-t-027-rev-3 (tenant stamping): open -> fixed, evidenced by this unit's passing tests, left
  short of "verified" because the checker did not revert that specific fix itself.
