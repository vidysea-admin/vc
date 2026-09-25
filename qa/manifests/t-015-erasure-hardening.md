# Manifest: t-015-erasure-hardening

**Contract:** qa/contracts/counselling-engine.md (B15 primary; B8, B12, D-016)
**Goal task:** T-015
**Status:** checked-PASS (cycle 0; senior review Approve)
**Status:** ready-for-check
**Fix cycle:** 0
**Design:** no new decision; closes five follow-ups the T-014 reviews and checker left open
(`qa/issues.jsonl` `ISS-t-014-rev-1..4`, `ISS-t-014-c0-2`).
**Diff range:** `63b1e77..HEAD` on branch `wave/t-015-erasure-hardening`, one commit:
"fix(db,api): t-015 erasure hardening (per-op timeouts, sweep logging, startApi cleanup, tick guard,
timeout cap)". `63b1e77` is main's tip ("tasks: T-014 done; T-015 follow-ups"), the branch point (no
merge in between — this unit branches directly off main).
**Scope:** `packages/db/src/{erasure,client}.ts`, `packages/db/scripts/db-init.ts`,
`packages/db/tests/{erasure,client,db-init}.test.ts`, `packages/db/tests/fakes.ts` (deleteMany /
countDocuments option recording + a recording-only `createIndex` stub), `apps/api/src/index.ts`,
`apps/api/tests/index.test.ts`, this manifest.
**Not touched:** `.claude/**`, `docs/DECISIONS.md`, `scripts/**`, `qa/contracts/**`, `TASKS.md`
(left `open`; the checker/close-out step flips it), `packages/engine/**`, `packages/schemas/**`,
`mcp/**`, `packages/providers/**`, `packages/observability/**`.
**Dual check:** no
**Issues addressed:** ISS-t-014-rev-1 (medium), ISS-t-014-rev-2 (medium), ISS-t-014-rev-3 (medium),
ISS-t-014-rev-4 (low), ISS-t-014-c0-2 (medium)
**Executor:** claude-opus-subagent (maker build subagent)

## What changed

### rev-1 (medium) — `erasure.ts` / `db-init.ts`: explicit per-op `timeoutMS`, larger than the client default

**The bug.** T-014 made every client this package hands out carry a client-level `timeoutMS`
backstop (`client.ts`'s `connectFromEnv`, `DEFAULT_MONGO_CLIENT_TIMEOUT_MS = FENCE_MARGIN_MS` = 30s,
D-016). But that 30s budget was sized for a single fenced writer's post-check margin, not for
`executeErasure`'s own `deleteMany`/`countDocuments` calls (up to 9 collections x up to 5 rounds per
attempt) or `db-init`'s one-time `createIndex` calls (which can take longer against a
collection that already holds data). Neither had a per-op override, so both silently inherited a
budget sized for something else — a large purge or a slow index build risked a spurious timeout.

**The fix.**
- `erasure.ts`: new `ERASURE_PURGE_OP_TIMEOUT_MS = 120_000` (4x the client default), named as a
  constant with its rationale documented inline (headroom for a multi-collection, multi-round purge;
  still finite — a genuinely stuck step still fails and the request retries, per the module's
  existing partial-failure design). Passed explicitly to both call sites: the `deleteMany` in the
  phase-1/phase-2 delete loop and the `countDocuments` in the read-back loop (both inside
  `executeErasure`).
- `db-init.ts`: new `DB_INIT_CREATE_INDEX_TIMEOUT_MS = 120_000`, same rationale (index builds, not
  purges). The `createIndex` loop that was inline in `main()` is split out into an exported
  `createPlannedIndexes(db, plan = INDEX_PLAN)` so it is testable offline (B8: `main()` itself is
  still never run by tests, connects to a real server, and is unchanged in behaviour) — `main()` now
  just calls `createPlannedIndexes(db)`.
- `tests/fakes.ts`: `FakeCollection.deleteMany`/`countDocuments` now accept and RECORD the options
  they were called with (`deleteManyCalls`/`countDocumentsCalls`, each `{filter, options}`); a new
  recording-only `createIndex(keys, options)` stub does the same (`createIndexCalls`). This proves the
  option reaches the driver-shaped call, not just an argument some intermediate wrapper received.

### rev-2 (medium) — `apps/api/src/index.ts`: `startApi`'s default `onError` is a structured log line

**The bug.** `startErasureFenceSweep`'s own `onError` defaults to a no-op (by design — `packages/db`
does not own a logger). `startApi` wired no `onError` of its own, so a failing sweep tick vanished
silently: nothing was ever visible that a fence had failed to release.

**The fix.** `apps/api/src/index.ts` gains `defaultSweepErrorLogger(err)`: a single
`console.error(JSON.stringify({level, event: "erasure_fence_sweep_failed", name, message, ts}))`
line. `startApi` now passes `onError: onError ?? defaultSweepErrorLogger` to
`startErasureFenceSweep` — a caller-supplied `onError` still wins (not double-logged); only the
absence of one falls back to the structured log line.

### rev-3 (medium) — `apps/api/src/index.ts`: `startApi` closes the client on a post-connect failure

**The bug.** `startApi` called `client.connect()` then `startErasureFenceSweep(db, sweepOptions)`
with no try/catch around the second call. `startErasureFenceSweep` throws synchronously
(`RangeError`) for a non-positive `intervalMs`; if it (or anything else added later between connect
and the return) threw, the already-connected client was never closed — the only `close()` path was
`stop()`, which the caller never receives when `startApi` itself throws.

**The fix.** Everything after `client.connect()` now runs inside a try/catch: on any error, the
client is closed before rethrowing. A successful start is unaffected (`stop()` still owns the close
in the normal path); a `console.error`/no-op default was rejected outright — leaking a live
connected client is a resource leak, not something to just log.

### rev-4 (low) — `erasure.ts`: `startErasureFenceSweep` gets an in-flight guard

**The bug.** `startErasureFenceSweep`'s `setInterval` fires unconditionally on schedule, regardless
of whether the previous tick's own `releaseExpiredErasureFences` call had finished. On a slow tick
(a large fence backlog, or a slow server), two ticks' reads and best-effort releases could overlap.
Nothing was known to be actively UNSAFE about this (each fence's own release is a CAS by
`{_id, requestId}` plus a `hasFencingRequest` re-check), but it was untested and wasteful.

**The fix.** A closure-scoped `inFlight` boolean: `tick()` returns immediately if the previous tick's
`releaseExpiredErasureFences` promise has not yet settled (checked/set synchronously, cleared in a
`.finally()`), so at most one sweep runs at a time. A skipped tick is silent by design — the next
tick, at most `intervalMs` later, covers the same ground; this is not lost work, unlike a genuine
failure (which still goes to `onError`, unaffected by this change).

### c0-2 (medium) — `client.ts`: `resolveClientTimeoutMs` rejects an override above `FENCE_MARGIN_MS`

**The bug (checker finding, T-014 cycle 0, `ISS-t-014-c0-2`).** `DEFAULT_MONGO_CLIENT_TIMEOUT_MS` is
capped at `FENCE_MARGIN_MS` by construction, but `MONGO_CLIENT_TIMEOUT_MS` (the operator override)
had no upper bound at all — an operator could set e.g. 10 days and silently defeat the exact
liveness guarantee the client-level backstop exists for (an unguarded operation, e.g. the scribe's
LangGraph checkpointer, must finish within the fence's own margin window).

**The fix (chosen: reject, not clamp — documented in `resolveClientTimeoutMs`'s docstring).** An
override above `FENCE_MARGIN_MS` now throws, naming the cap and the reason. Clamping was rejected as
the alternative: a silent clamp would let an operator believe they had configured e.g. 5 minutes of
headroom while the real client still behaved as 30s — a worse trap than a loud failure at startup
(`connectFromEnv` time). The default is unchanged (`DEFAULT_MONGO_CLIENT_TIMEOUT_MS = FENCE_MARGIN_MS`,
still 30s) — this only closes the override's own missing cap.

## TDD: RED before implementation, and falsification (revert-and-confirm-RED) for every fix

Every fix below was implemented, its test(s) written, then the fix was reverted in place, the exact
relevant test file re-run to confirm the new test(s) went RED (and only those), and the fix restored
and re-confirmed GREEN. Full command output for each revert/restore pair is in the maker's session
transcript (not persisted to a file per HARD RULES — only code and this manifest are committed).

- **rev-1 (deleteMany):** reverted `erasure.ts`'s `deleteMany` call to drop the `{timeoutMS: ...}`
  argument. `ISS-t-014-rev-1: every executeErasure deleteMany/countDocuments call REALLY CARRIES...`
  failed with `deleteMany on consents: expected 120000, got undefined`. Restored — green.
- **rev-1 (countDocuments):** same revert on the `countDocuments` call. The same test failed with
  `countDocuments on consents: expected 120000, got undefined`. Restored — green.
- **rev-1 (db-init createIndex):** reverted `createPlannedIndexes`'s `createIndex` call to drop
  `timeoutMS`. `ISS-t-014-rev-1: createPlannedIndexes passes {timeoutMS: ...} to EVERY createIndex
  call` failed with `createIndex(facts_studentId_key_active_true_unique): expected 120000, got
  undefined`. Restored — green.
- **rev-2:** reverted `startApi` to pass `onError` through unmodified (no `?? defaultSweepErrorLogger`
  fallback). `ISS-t-014-rev-2: startApi's default onError logs a structured JSON line...` failed
  (`expected exactly one console.error call for the failing tick`, `0 !== 1`); the sibling
  "caller-supplied onError still wins" test stayed green (regression check: the fix does not break
  the override path). Restored — both green.
- **rev-3:** reverted `startApi` to drop the try/catch (back to the T-014 shape: `connect()`, then
  `startErasureFenceSweep` unguarded). `ISS-t-014-rev-3: startApi closes the client and rethrows...`
  failed (`the client must be closed on the post-connect error path, not leaked`, `0 !== 1`); the
  regression test (`a SUCCESSFUL startApi does not close the client until stop()`) stayed green.
  Restored — both green.
- **rev-4:** reverted `startErasureFenceSweep`'s `tick` to the unguarded version (no `inFlight`
  check). `ISS-t-014-rev-4: an in-flight tick is not overlapped...` failed
  (`tick 2 was skipped: tick 1 had not finished yet (no overlap)`, `2 !== 1` — the second tick was
  NOT skipped without the guard). Restored — green.
- **c0-2:** reverted `resolveClientTimeoutMs` to drop the `> FENCE_MARGIN_MS` check. Both
  `ISS-t-014-c0-2: MONGO_CLIENT_TIMEOUT_MS above FENCE_MARGIN_MS is rejected...` and
  `...a HUGE override... is rejected...` failed with "Missing expected exception"; the boundary-accept
  and normal-override tests stayed green throughout (regression check). Restored — all green.

## Verification (exact commands, run in the worktree, final state — all five fixes in place)

```
$ pnpm install
  Done in 8.6s using pnpm v10.33.0 (no new dependencies)

$ pnpm -r typecheck
  apps/web, packages/providers, packages/schemas, packages/observability, packages/db, apps/api,
  mcp/university-kb, mcp/student-profile, packages/engine (+ evals/tsconfig.json): all "Done", exit 0

$ pnpm -r test
  packages/providers 8/8 · packages/schemas 50/50 · apps/web 1/1 · packages/observability 57/57
  packages/db 157/157 · apps/api 6/6 · mcp/university-kb 9/9 · mcp/student-profile 12/12 ·
  packages/engine 105/105
  TOTAL: 405 tests, 405 pass, 0 fail, exit 0

$ python contracts/verify_contracts.py
  verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity   (exit 0)
```

`packages/db` grew from 146 to 157 (11 new: 2 for rev-1's executeErasure timeoutMS + 1 sanity, 3 for
rev-1's db-init timeoutMS (incl. a default-plan test and a self-check-on-the-test-harness sanity
test), 1 for rev-4, 4 for c0-2). `apps/api` grew from 2 to 6 (2 for rev-2, 2 for rev-3, incl. one
regression test each proving the caller-override / successful-start paths are unaffected).

## Claims → evidence

| Criterion | Claim | Evidence | Status |
|---|---|---|---|
| rev-1 | `ERASURE_PURGE_OP_TIMEOUT_MS` and `DB_INIT_CREATE_INDEX_TIMEOUT_MS` are each larger than the client-level default. | `erasure.test.ts` / `db-init.test.ts`: direct numeric assertions (120000 > 30000). | VERIFIED |
| rev-1 | Every `deleteMany`/`countDocuments` call inside `executeErasure`, for every `ERASURE_PLAN` step, carries `{timeoutMS: ERASURE_PURGE_OP_TIMEOUT_MS}` as an OUTCOME (the fake's own recorded call), not just an argument some wrapper received. | `erasure.test.ts` "every executeErasure deleteMany/countDocuments call REALLY CARRIES..." — runs a real `executeErasure` to completion, then inspects `FakeCollection.deleteManyCalls`/`countDocumentsCalls` for every plan step. | VERIFIED (+ RED/GREEN falsification, both call sites) |
| rev-1 | Every `createIndex` call `createPlannedIndexes` makes, for every `INDEX_PLAN` entry, carries `{timeoutMS: DB_INIT_CREATE_INDEX_TIMEOUT_MS}`. | `db-init.test.ts` "createPlannedIndexes passes {timeoutMS: ...} to EVERY createIndex call" — runs the real exported function against the fake, inspects `createIndexCalls`. | VERIFIED (+ RED/GREEN falsification) |
| rev-1 | `createPlannedIndexes` defaults to `INDEX_PLAN` and importing `db-init.ts` still performs no I/O (B8 unaffected). | `db-init.test.ts` "createPlannedIndexes defaults to INDEX_PLAN..."; the pre-existing "importing db-init.ts... does not attempt a Mongo connection" test is unmodified and still passes. | VERIFIED (regression) |
| rev-2 | `startApi`'s default `onError` logs one structured JSON line (`event: erasure_fence_sweep_failed`, `message`, `level`, `ts`) per failing tick. | `apps/api/tests/index.test.ts` "startApi's default onError logs a structured JSON line..." — forces a real sweep-tick failure via the fake, captures `console.error`, parses the JSON. | VERIFIED (+ RED/GREEN falsification) |
| rev-2 | A caller-supplied `onError` still wins; the default does not also fire (no double logging). | `apps/api/tests/index.test.ts` "a caller-supplied onError still wins over the default..." — same forced failure, asserts the caller's callback received it AND `console.error` was never called. | VERIFIED |
| rev-3 | If starting the sweep fails after `connect()`, `startApi` closes the client and rethrows. | `apps/api/tests/index.test.ts` "startApi closes the client and rethrows when starting the sweep fails after connect" — `intervalMs: 0` forces `startErasureFenceSweep`'s own `RangeError`; asserts `client.close()` was called exactly once and the error propagates. | VERIFIED (+ RED/GREEN falsification) |
| rev-3 | A successful `startApi` does NOT close the client itself (only `stop()` does). | `apps/api/tests/index.test.ts` "(regression): a SUCCESSFUL startApi does not close the client until stop() is called". | VERIFIED (regression) |
| rev-4 | A tick is skipped while the previous tick's `releaseExpiredErasureFences` call has not yet settled. | `erasure.test.ts` "an in-flight tick is not overlapped by the next scheduled tick..." — `mock.timers`, a stuck first tick (gated `find()`), a second tick fired while the first is stuck: `findCalls` stays 1. | VERIFIED (+ RED/GREEN falsification) |
| rev-4 | A tick fired AFTER the previous one finished is NOT skipped. | Same test, second half: gate opened, a later tick fires normally (`findCalls` becomes 2). | VERIFIED |
| c0-2 | `MONGO_CLIENT_TIMEOUT_MS` above `FENCE_MARGIN_MS` is rejected, naming the cap. | `client.test.ts` "MONGO_CLIENT_TIMEOUT_MS above FENCE_MARGIN_MS is rejected..." + the checker's own repro (10 days in ms). | VERIFIED (+ RED/GREEN falsification, both) |
| c0-2 | The boundary (exactly `FENCE_MARGIN_MS`) is still accepted and reaches the driver. | `client.test.ts` "...exactly at FENCE_MARGIN_MS (the boundary) is accepted and reaches the driver". | VERIFIED (regression) |
| c0-2 | A normal override well within the cap (5000ms) is unaffected. | `client.test.ts` "...a normal override well within the cap... is unaffected by the new cap check" — matches the pre-existing override test's assertion. | VERIFIED (regression) |

## Residuals (not fixed here, by design or scope)

- **rev-4's skip is silent by design.** No counter or log line records how many ticks were skipped.
  If a sweep is consistently slower than `intervalMs` (a real operational problem — the sweep would
  never catch up), nothing surfaces that today beyond the fences simply not clearing on schedule.
  Flagging this as a follow-up rather than guessing at a metrics/logging shape that wasn't asked for.
- **c0-2's cap is enforced only in `resolveClientTimeoutMs` (the env-var path).** Nothing stops a
  future caller from constructing a `MongoClientOptions` with a larger `timeoutMS` directly and
  passing it to a client factory that bypasses `connectFromEnv` entirely — same class of gap as the
  T-014 checker's `ISS-t-004-langfuse-1` finding for tracing config (a caller can always skip the
  validating entry point). `connectFromEnv` is documented as the ONE shared DB helper (contract B12
  file banner), so this is the same trust boundary the rest of the package already relies on, not a
  new one.
- **ERASURE_PURGE_OP_TIMEOUT_MS / DB_INIT_CREATE_INDEX_TIMEOUT_MS are not independently configurable**
  (unlike `MONGO_CLIENT_TIMEOUT_MS`, they are not read from env). Not asked for by the brief (which
  said "name them as constants with a rationale," not "make them ops-configurable"); flagging in case
  operational experience later wants a knob here too.

## Open questions for the checker

1. rev-1's timeout values (120s for both purge ops and index builds) are the maker's own judgement
   call ("larger than the client default" was the brief's only hard requirement) — reasonable as
   headroom, but no SLA was given for how long a purge or index build should be allowed to run in
   production. Worth a decision if this ships live (same class of open question T-014's rev-3 left
   for its sweep interval default).
2. c0-2 chose "reject" over "clamp" for the override cap, per the brief's "choose one and document
   it." The rationale (a silent clamp is a worse trap than a loud failure) is documented in
   `resolveClientTimeoutMs`'s own docstring — flagging for the checker to confirm this reading of
   "document it" (in-code docstring) satisfies the brief, versus e.g. also wanting a decisions-log
   entry (this is not an enforcement-path or `ARCHITECTURE.md` change, so no DECISIONS entry was
   made per the project's Update Authorization rule).
