# Manifest: t-014-erasure-followups
**Contract:** qa/contracts/counselling-engine.md (B15 primary; B8, B12, B14)
**Goal task:** T-014
**Date:** 2026-09-25
**Status:** checked-PASS (cycle 0; reviews: data-engineer Warning, senior Warning → follow-up T-015)
**Fix cycle:** 0
**Design:** D-016 (fence + writer deadline + minimum hold); this unit does not open a new decision, it closes four follow-ups the T-011 cycle-3 reviews left open (`qa/issues.jsonl` ISS-t-011-c3-rev-1..4) plus documents ISS-t-011-c3-note-1.
**Diff range:** `8df46de..HEAD` on branch `wave/t-014-erasure-followups`, one commit: "fix(db): t-014 erasure follow-ups (edge ownership, client timeoutMS, fence sweep, server version)". `8df46de` is main's tip ("tasks: T-011 done; T-014 erasure follow-ups"), the branch point (no merge in between — this unit branches directly off main).
**Scope:** `packages/db/src/{facts,edges,client,erasure}.ts`, `packages/db/scripts/db-init.ts`, `packages/db/tests/{facts,edges,client,erasure,db-init}.test.ts` (edges.test.ts unchanged — the edge fix's own regression coverage lives in erasure.test.ts's fenced-writer tests, and edges.ts's existing idempotency tests already cover the unrelated behavior), `packages/db/tests/fakes.ts` (FakeDb.admin().buildInfo() stub only), `apps/api/{package.json,src/index.ts,tests/index.test.ts}`, `pnpm-lock.yaml` (apps/api's new `@vc/db` workspace dependency), this manifest.
**Not touched:** `.claude/**`, `docs/DECISIONS.md`, `scripts/**`, `qa/contracts/**`, `TASKS.md` (left `open`; the checker/close-out step flips it), `packages/engine/**`, `packages/schemas/**`, `mcp/**`.
**Dual check:** no
**Issues addressed:** ISS-t-011-c3-rev-1 (high), ISS-t-011-c3-rev-2 (medium), ISS-t-011-c3-rev-3 (medium), ISS-t-011-c3-rev-4 (low), ISS-t-011-c3-note-1 (medium, documented only — no code change, per the brief's explicit instruction not to touch the 60s deadline)
**Executor:** claude-opus-subagent (maker build subagent)

## What changed

### rev-1 (high) — `facts.ts` / `edges.ts`: linkTracked no longer over-deletes a pre-existing edge

**The bug.** Edge ids are deterministic (`deriveEdgeId`). `applyApprovedDiff`'s `linkTracked` helper records an edge id into `createdEdgeIds` in a `finally` block whenever `link()`'s outcome is AMBIGUOUS (it threw — e.g. a timeout where the write may or may not have landed). Before this fix, that record was unconditional: if the ambiguous edge id happened to belong to an edge a **different, earlier** `applyApprovedDiff` call already created (the same deterministic id — an idempotent replay), the post-write fenced `undo()` would delete it anyway, by id alone. That contradicts the module docstring's claim ("deletes … the edges it CREATED") and was not documented as a residual.

**The fix.**
- `edges.ts`: `EdgeDoc` gains an optional `writerToken`, stamped ONLY via `$setOnInsert` on `link()`'s upsert (so a second, idempotent `link()` call for the same id never overwrites it). `LinkOptions` gains `writerToken?: string`.
- `facts.ts`: `applyApprovedDiff` generates one `writerToken` (`randomUUID()`) per call, at the top of the function (before any write). Every `linkTracked` call passes it through to `link()`. The fenced `undo()`'s edge delete is now `edges.deleteMany({_id: {$in: [...createdEdgeIds]}, writerToken})` instead of `{_id: {$in: [...createdEdgeIds]}}`.
- Effect: `createdEdgeIds` can still speculatively contain an id this call never actually created (the ambiguous-outcome fallback is unchanged — a genuine creation must never go uncompensated), but the delete now only ever matches a document whose `writerToken` this exact call's own insert stamped. A pre-existing edge from a different call (no writerToken, or a different call's token) can never match, whatever the ambiguous outcome guessed.
- Both module docstrings (`facts.ts` top-of-file and the `undo`/`linkTracked` inline comments) are updated to state the writerToken mechanism, not just "deletes the edges it created" as an unqualified claim.

### rev-2 (medium) — `client.ts`: the MongoClient now actually carries a `timeoutMS` backstop

**The bug.** `erasure.ts`'s "Honest caveats" comment claimed writes the scribe's LangGraph checkpointer makes are "bounded by the graph's AbortSignal plus the MongoClient's own timeoutMS **where one is configured**" — but `client.ts`'s `defaultClientFactory` built `new MongoClient(url)` with no options at all, so that backstop never existed. The comment was aspirational, not true.

**The fix.**
- `client.ts`: `connectFromEnv` now always passes `{timeoutMS}` to the client factory. `DEFAULT_MONGO_CLIENT_TIMEOUT_MS = FENCE_MARGIN_MS` (30s, imported from `erasure.ts`; no import cycle — `erasure.ts` does not import `client.ts`). Overridable via `MONGO_CLIENT_TIMEOUT_MS` (an env var read the same way `MONGODB_URL` is — an ops/config knob, never a secret), validated as a positive number (throws otherwise). `MongoClientFactory`'s signature grew an optional `options?: MongoClientOptions` second parameter (backward-compatible: every existing test factory that ignores its second argument still type-checks).
- `erasure.ts`: the "Honest caveats" comment (formerly lines 248-250) is corrected to say the backstop is no longer conditional — `connectFromEnv` always sets it.
- The new client.test.ts tests build a REAL (unconnected — no `.connect()` call, so no network I/O, matching the file's own B8 guarantee) `MongoClient` via `connectFromEnv`'s default factory and read back `client.options.timeoutMS`, proving the option reaches the driver's own parsed options (an outcome), not merely an argument some intermediate factory received.

### rev-3 (medium) — `erasure.ts` / `apps/api`: `releaseExpiredErasureFences` gets a real, scheduled caller

**The bug.** `releaseExpiredErasureFences` had no caller outside tests. A fence left behind by a crash right after the completion CAS (before `releaseErasureFence` ran), or one whose own best-effort release attempt failed, had nothing that would ever come back and clear it — every future write for that student stayed refused forever.

**The fix.**
- `erasure.ts`: new `startErasureFenceSweep(db, options)` — an unref'd `setInterval` (default `intervalMs = MINIMUM_FENCE_HOLD_MS`; a fence can't be release-eligible any sooner) that calls `releaseExpiredErasureFences` on a timer, with `stop()` to clear it (idempotent) and `onError` so one bad tick never kills the interval.
- `apps/api/src/index.ts`: the brief said "the existing app entry (apps/api, or wherever the Mongo client is owned)" and "do not create a new app." `apps/api` is presently a scaffold placeholder with no live Mongo connection at all, so this adds the MINIMAL wiring needed to make it the real owner: `startApi(env, options)` calls `connectFromEnv` (never a direct call to the driver's own database-selection method — the B12 scanner in `db-scope.test.ts` still passes, see Verification), `client.connect()`, then `startErasureFenceSweep(db, ...)`, and returns `{stop}` which stops the sweep and closes the client. `startApi` is never called on import (contract B8 preserved — importing `apps/api` still performs no I/O and starts no timer); it is a function a future server bootstrap calls explicitly. `apps/api/package.json` gained `@vc/db` as a normal (not dev) dependency — `pnpm-lock.yaml` reflects the new workspace link.
- Tests: `erasure.test.ts` tests `startErasureFenceSweep` directly with `node:test`'s `mock.timers` (fake `setInterval`) against the fake db — proving a tick releases an expired fence, `stop()` really stops further ticks, a non-positive `intervalMs` is rejected, and a failing tick reports via `onError` without killing the interval. `apps/api/tests/index.test.ts` proves the same end-to-end through `startApi` (fake Mongo client, fake timers): `client.connect()` is actually called, only `virtual_counsellor` is ever opened (B12), a scheduled tick releases a seeded expired fence, `stop()` closes the client, and no further sweeps run after `stop()`.

### rev-4 (low) — `db-init.ts`: fails loudly on an unsupported server version, before creating anything

**The bug.** `erasure_requests_open_studentKey_unique`'s partial filter uses `$in`, which MongoDB only supports in a `partialFilterExpression` from 6.0 (D-013, checked against the manual). Nothing checked this — a pre-6.0 server would fail deep inside the `createIndex` loop in `main()`, after every earlier collection and index had already been created, with a generic server error that never named the real cause.

**The fix.** `db-init.ts` exports `MIN_SERVER_VERSION = "6.0.0"`, `isServerVersionAtLeast(version, required?)` (numeric major.minor.patch compare — a lexicographic compare would get `"6.2.0" >= "6.10.0"` backwards), `UnsupportedServerVersionError`, and `assertServerVersionSupportsPartialIn(db)` (reads `db.admin().buildInfo()`, throws if below `MIN_SERVER_VERSION`; an unreadable/missing version fails closed, not open). `main()` calls it first, before `ensureCollection`/`createIndex`. `tests/fakes.ts`'s `FakeDb` gains a minimal `admin(): {buildInfo}` stub (`buildInfoVersion`, default `"7.0.0"` so every other test using `createFakeDb()` is unaffected) so this is testable offline without touching a real server.

### note-1 (medium) — documented only, no code change

Per the brief: the 60s `FENCED_WRITER_DEADLINE_MS` is NOT changed. The manifest records the residual (below) that it needs a p99 scribe-latency measurement before the live Gemini run, exactly as `qa/issues.jsonl`'s `ISS-t-011-c3-note-1` already specifies.

## TDD: RED before implementation, and falsification (revert-and-confirm-RED) for every fix

For rev-1 (the only issue where the RED/GREEN distinction is meaningful against genuinely new behavior — rev-2/3/4 are new capabilities with no prior test to be red against, so falsification there means "revert the fix, confirm the NEW test goes red," done for all four):

- **rev-1:** the two new tests in `erasure.test.ts` ("a PRE-EXISTING edge survives even when THIS call's link() to it throws" and "an edge THIS call actually created is still removed") were run against the code with the `writerToken` filter reverted to plain `{_id: {$in: [...createdEdgeIds]}}`. The first test failed exactly as expected — `assert.deepEqual` showed the pre-existing edge `fact:...c1->sourced_from->session:stu-A-sess-1` deleted from the fake that should have survived. Restoring the writerToken filter turned it green again; the second test (own edge still removed) passed in both states, confirming the fix does not weaken the existing compensation guarantee.
- **rev-2:** reverted `connectFromEnv` to call `clientFactory(url)` with no options. The 2 new "outcome" tests (`client.options.timeoutMS` under the default and under `MONGO_CLIENT_TIMEOUT_MS=5000`) both failed (`actual: undefined`). Restored — both green.
- **rev-3:** reverted `startErasureFenceSweep`'s `setInterval(tick, intervalMs)` to `setInterval(() => {}, intervalMs)` (tick never fires). Both the "releases an expired fence" test and the "failing tick reaches onError" test failed as expected (fence count stayed 1; `errors.length` stayed 0). Restored — both green.
- **rev-4:** commented out the `if (!isServerVersionAtLeast(...))` throw in `assertServerVersionSupportsPartialIn`. Both the "throws below 6.0" and the "missing version fails closed" tests failed with "Missing expected rejection." Restored — both green.

Full command output for each revert/restore pair is in the maker's session transcript (not persisted to a file per HARD RULES — only code and this manifest are committed).

## Verification (exact commands, run in the worktree, final state — all four fixes in place)

```
$ pnpm install
  Done in 2.4s using pnpm v10.33.0 (added apps/api -> @vc/db workspace link)

$ pnpm -r typecheck
  apps/web, packages/providers, packages/schemas, packages/observability,
  packages/db, apps/api, mcp/university-kb, mcp/student-profile, packages/engine: all "Done", exit 0

$ pnpm -r test
  apps/web 1/1 · packages/providers 8/8 · packages/schemas 50/50 · packages/observability 57/57
  packages/db 146/146 · apps/api 2/2 · mcp/university-kb 9/9 · mcp/student-profile 12/12 · packages/engine 105/105
  TOTAL: 390 tests, 390 pass, 0 fail, exit 0

$ python contracts/verify_contracts.py
  verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity   (exit 0)
```

`packages/db` grew from 137 to 146 tests (2 new in `erasure.test.ts` for rev-1, 4 new in `client.test.ts` for rev-2, 3 new in `erasure.test.ts` for rev-3, 3 new in `db-init.test.ts` for rev-4 — `client.test.ts` also converted 1 existing assertion group into a `for`-loop of 3 named cases, and `db-init.test.ts` similarly; exact per-file test counts: `git show 8df46de:packages/db/tests/<f>` vs the working tree). `apps/api` grew from 1 to 2 (the new rev-3 integration test).

### B12 / D-016 write-path scanners still pass against the new apps/api code

`packages/db/tests/db-scope.test.ts` (11/11 green) proves `apps/api/src/index.ts` never calls the driver's own database-selection method directly (only through `connectFromEnv`) and is not a fence-aware writer requiring the D-016 allowlist (it only calls `client.connect()`/`client.close()`/the sweep, none of which write student-data collections).

## Claims → evidence

| Criterion | Claim | Evidence | Status |
|---|---|---|---|
| rev-1 | An unknown/ambiguous `link()` outcome never lets the fenced `undo` delete a pre-existing edge from a different call. | `erasure.test.ts` "a PRE-EXISTING edge survives even when THIS call's link() to it throws (ambiguous outcome), because it lacks this call's writerToken" — real `applyApprovedDiff` replay, `edges.updateOne` overridden to apply-then-throw, fence appears mid-write, full edge snapshot byte-identical before/after. | VERIFIED (+ RED/GREEN falsification) |
| rev-1 | An edge this call DID create is still removed under the same ambiguous-outcome + fenced conditions. | `erasure.test.ts` "an edge THIS call actually created is still removed by the fenced undo, even though link()'s own outcome to it was ambiguous" — new fact/edges, same throw-after-apply pattern, edge set returns to its pre-call baseline; the new fact is also compensated (`docsMentioning` empty). | VERIFIED |
| rev-1 | The existing "idempotent replay, link() completes normally" guarantee (onCreated never fires) is unweakened. | Pre-existing test "D-016 lows (ISS-t-011-c2-rev-3)" still passes unmodified. | VERIFIED (regression) |
| rev-2 | The MongoClient's own parsed options carry `timeoutMS`, not just an argument passed to some factory. | `client.test.ts` "the OPTION REALLY REACHES the driver" — a real, unconnected `MongoClient` built by `connectFromEnv`'s default factory; `client.options.timeoutMS === DEFAULT_MONGO_CLIENT_TIMEOUT_MS`. | VERIFIED |
| rev-2 | The default is at most `FENCE_MARGIN_MS` (D-016). | `client.test.ts` "DEFAULT_MONGO_CLIENT_TIMEOUT_MS is at most FENCE_MARGIN_MS" — direct numeric assertion (30000 <= 30000). | VERIFIED |
| rev-2 | `MONGO_CLIENT_TIMEOUT_MS` overrides the default and reaches the real driver; a non-positive-number value is refused. | `client.test.ts` override test (`client.options.timeoutMS === 5000`) + 3 rejection tests (`"nope"`, `"0"`, `"-5"`). | VERIFIED |
| rev-2 | `erasure.ts`'s "Honest caveats" comment no longer claims a conditional backstop that doesn't exist. | Comment text updated in place (see diff); no test asserts comment text — read directly. | DOCUMENTED |
| rev-3 | A scheduled tick actually calls `releaseExpiredErasureFences` and releases an expired fence. | `erasure.test.ts` "startErasureFenceSweep's timer actually releases an expired fence" — `mock.timers`, seeded expired fence, one tick, fence count 1→0. | VERIFIED |
| rev-3 | `stop()` actually stops further sweeps. | Same test, second half: reseed, advance 10s of fake time, fence count stays 1. | VERIFIED |
| rev-3 | A failing tick is reported via `onError`, not thrown, and does not kill the interval. | `erasure.test.ts` "a failing tick is reported via onError…" — first tick's `fences.find` throws, `onError` receives it, fence untouched; second tick (no scripted failure) still runs and releases it. | VERIFIED |
| rev-3 | `startApi` really connects, opens only `virtual_counsellor`, wires the sweep, and `stop()` closes the client. | `apps/api/tests/index.test.ts` — `connected === 1`, `dbCalls === ["virtual_counsellor"]`, a seeded expired fence is released on a fake tick, `closed === 1` after `stop()`, and no further release after `stop()`. | VERIFIED |
| rev-3 | Importing `apps/api` performs no I/O and starts no timer (B8 preserved). | `startApi` is a named export the test calls explicitly; `apiStatus` (the only thing the OLD test imported) is unchanged and still passes with no other side effects observed. | VERIFIED (by absence — no connection/timer artifacts before `startApi` is called) |
| rev-4 | `db-init` refuses a server below MongoDB 6.0 before touching any collection/index. | `db-init.test.ts` "assertServerVersionSupportsPartialIn throws UnsupportedServerVersionError against a server below MongoDB 6.0" (fake `buildInfoVersion = "4.4.20"`). | VERIFIED (+ RED/GREEN falsification) |
| rev-4 | The version compare is numeric, not lexicographic. | `db-init.test.ts` "isServerVersionAtLeast compares NUMERICALLY…" — `"6.10.0" >= "6.9.0"` true, `"6.2.0" >= "6.10.0"` false. | VERIFIED |
| rev-4 | An unreadable/missing version fails closed. | `db-init.test.ts` "an unreadable/missing buildInfo.version is treated as unsupported" — `buildInfoVersion = undefined`, throws. | VERIFIED |
| rev-4 | A server at/above 6.0 is accepted (main() is not blocked on a supported server). | `db-init.test.ts` "…does not throw for a server at or above MongoDB 6.0" — 6.0.0, 6.0.1, 7.0.4, 8.2.1 all pass. | VERIFIED |

## Residuals (not fixed here, by design or scope)

- **ISS-t-011-c3-note-1** (documented, not fixed — explicit instruction): `FENCED_WRITER_DEADLINE_MS` (60s) bounds the whole scribe run including both provider calls. Before the live Gemini run, someone must measure p99 scribe latency (both provider calls plus the write path) and either confirm 60s has headroom or raise the deadline together with `MINIMUM_FENCE_HOLD_MS` (D-016: raising the deadline raises the hold). This manifest does not perform that measurement — it requires a live (or realistically-latent) run this unit deliberately stayed offline for.
- **rev-3 scope note:** `startApi` is the minimal wiring asked for — it is not a full server bootstrap (no Fastify, no signal handlers calling `stop()` on SIGTERM/SIGINT yet). Whichever unit adds the real server loop should call `startApi`'s `stop()` from its shutdown handler; this is flagged here rather than guessed at, since apps/api's actual server framework is still undecided (plan.md §5 "Backend" row, unchanged by this unit).
- **rev-2 residual carried from erasure.ts's own "Honest caveats":** a write the server applies AFTER the client already timed out is still only bounded server-side by the same `timeoutMS` (`maxTimeMS`); a request that sits on the network longer than `FENCE_MARGIN_MS` is not covered by anything in this repo. Unchanged by this unit — it was already documented as a caveat, not a defect this unit was asked to close.
- **The writerToken itself is not indexed.** `db-init.ts`'s `INDEX_PLAN` gets no new index for `edges.writerToken` — no query filters on it alone (the fenced `undo`'s delete is always `{_id: $in, writerToken}`, and `_id` is the collection's own unique index, so the compound filter is still a point lookup per id, not a scan). Flagging this so a future index-audit doesn't treat it as an oversight.

## Open questions for the checker

1. Is `apps/api` gaining a `@vc/db` dependency (previously it had none) an acceptable scope expansion for a "wire the existing app entry" instruction, given `apps/api` had zero Mongo wiring before this unit? The alternative (declining to wire rev-3 into any process, leaving `startErasureFenceSweep` exported-but-uncalled in production code) seemed to defeat the point of the review item ("has no caller").
2. `startErasureFenceSweep`'s default `intervalMs = MINIMUM_FENCE_HOLD_MS` (90s: `FENCED_WRITER_DEADLINE_MS` 60s + `FENCE_MARGIN_MS` 30s) — reasonable as a "no faster than a fence could possibly become eligible" floor, but no SLA was given for how promptly a stuck fence should actually clear in production. Worth a decision if this ships live.
