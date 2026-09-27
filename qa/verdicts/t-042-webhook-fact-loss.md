# Verdict — t-042-webhook-fact-loss

**Cycle checked:** 0
**Unit head checked:** `ba8d3d4` (fix), manifest `cb4ea6e`, forked from `main@57b2c70`
**Checker:** Mode A, full protocol

## VERDICT: FAIL

## The arithmetic discrepancy — resolved

The manifest's own three numbers do not reconcile (1224 stale-baseline + 12 own-contribution ≠ 1235
reported total). I re-derived all three independently rather than rounding it off.

**Baseline (1224) was NOT stale.** I checked out the true fork point `57b2c70` in an isolated worktree
(`git worktree add --detach`, fresh `pnpm install --frozen-lockfile`, 24s, no source changes needed)
and ran the suite. `git diff --stat 63900b2..57b2c70` (T-040's merge commit to the fork point) touches
only `TASKS.md`, `qa/.last-tick`, `qa/debug/**`, `qa/gates/**`, `qa/manifests/t-040-*` — zero test or
source files. The repo's own history independently states **1224/1179/0/45** three separate times at
that exact point (T-039 close-out `9251f71`'s parent state, T-040 close-out `9251f71` itself, and
`qa/.last-tick:33`). My own fresh measurement at `57b2c70` confirms the per-package split behind that
total: `packages/engine` 682 (one flaky fail on rerun — the pre-existing, already-filed ISS-089 timing
flake, not this unit's), `packages/db` 247, `apps/api` 42 (all three re-run clean). The other five
packages are untouched by this unit's diff (confirmed by `git diff --stat 57b2c70 ba8d3d4`), so their
counts carry over unchanged. **1224 stands.**

**The maker's own "+12" is what's wrong — off by exactly one, in `packages/db/tests/erasure.test.ts`.**
`git diff 57b2c70 ba8d3d4 -- packages/db/tests/erasure.test.ts` (pasted in full, checked) shows exactly
**one** new `test(...)` block ("T-042/B15: a queued webhook_emit_gaps row…") plus one line added to an
**existing** test's hardcoded `expected` map (`[COLLECTION_NAMES.webhook_emit_gaps]: 0`) — necessary
maintenance, not a new test, exactly as T-034 had to do the same thing for `webhook_outbox`. The
manifest's capability table double-counted this file as "2" new tests when it is 1 new + 1 modified.
Measured deltas per package, baseline -> branch: `apps/api` 42->45 (+3, matches), `packages/engine`
682->689 (+7, matches), `packages/db` 247->248 (**+1, not +2** as claimed).

**1224 (accurate) + 3 + 7 + 1 = 1235 (accurate) — exactly the branch total already reported.** Nothing
is lost, silently skipped, or hidden; the manifest's arithmetic-explanation paragraph was simply wrong
on two counts (baseline mislabeled stale; one file's delta miscounted), while the underlying numbers on
both ends (1224 and 1235) were each independently correct all along. My own fresh `bash
scripts/vc-testlock.sh pnpm -r test` on the bound worktree reproduces 1235/1190/0/45 exactly, per-package
identical to the manifest's table, with zero flakes on this run.

## Leak 1 — verified on outcome, via the real path

Reproduced through `apps/api/tests/server.test.ts`'s own mechanism (`dropOneFromNextIdInRead`, which
patches `facts.find()`'s `_id:{$in:[...]}` cursor to drop one row — the real `getFactsByIds` code path,
not a call to `checkFactReadbackGap` directly) plus my own hostile lever (below). The happy-gap path is
solid: a genuine short read-back is alerted (`webhook_fact_readback_gap:1_of_2_missing`, logged) and
recorded as one `readback-gap` row per missing fact, while the fact that WAS found still gets its
webhook. Confirmed by direct test run.

**The erasure carve-out, attacked as instructed:**
- Concurrent fence landing AFTER the write (the real race, since a pre-existing fence would make
  `applyApprovedDiff` refuse the whole approval as `kind:"fenced"` before any write happens): the
  existing test plants the fence via `onTrigger` at the exact moment `getFactsByIds`' cursor resolves,
  confirmed correct — not alerted, not recorded, and the found fact's event still emits.
- Fence check failing/throwing (the lever the brief specifically asked me to try): **this is where I
  found a real, high-severity defect.** See below.
- Fence appearing "immediately after" then releasing inside the narrow window: the manifest's own
  disclosed judgment (low-probability given `MINIMUM_FENCE_HOLD_MS`) is reasonable and I did not find
  reason to override it — this scope call stands.

### New defect — ISS-090 (high): the fence check itself is unguarded

`apps/api/src/server.ts:711`, inside `checkFactReadbackGap`:
```
const fenced = await isStudentFenced(deps.dbForTenant(tenantId!), studentId);
```
has no try/catch, unlike every other new I/O call this unit added in the same function and in
`emitWebhookEvents` (`outbox.enqueue` at `:662`, `gapsForTenant(...).record` at `:678` and `:726`, each
wrapped and logged as `webhook_emit_gap_record_failed` on failure, per the manifest's own stated design
intent of "recoverable, never silent, never fatal").

**Reproduced end-to-end via a real HTTP round trip** (throwaway probe, `apps/api/checker-probe.test.ts`,
copied from the real `server.test.ts`, run via `npx tsx --test`, deleted after use — never committed,
never touched the bound worktree's real files):
1. `scribeToApproval` + `dropOneFromNextIdInRead(w.fakeDb, "facts")` — the exact leak-1 scenario, a
   genuine 1-of-2 readback gap.
2. Monkeypatched `erasure_fences.findOne` to throw, but **only** on the options-less call
   (`isStudentFenced` called with no third arg -> default `{}`, which is exactly and only
   `checkFactReadbackGap`'s call shape) — the engine's own pre/post-write fence checks
   (`packages/engine/src/scribe/graph.ts:411,517`, `nodes.ts:1430`) always pass
   `{timeoutMS: FENCE_POSTCHECK_TIMEOUT_MS}` and were deliberately left untouched, so the write path
   itself is provably unaffected by this lever.
3. Result: `w.fakeDb.collection("facts").size()` == 2 (both facts genuinely, durably written — verified
   before asserting on the response), the found fact's webhook still enqueued, and yet:
   ```
   PROBE RESULT status: 500 body: {"error":"internal"}
   ```
   instead of the 200 the approval actually earned. The uncaught throw propagates through `route.run`
   to `server.ts:749`'s generic catch; `mapError` returns `null` for an unrecognised `Error`, so
   `status` defaults to 500 at `:753`.

This directly violates the invariant this brief named explicitly ("Never turns a successful write into
an error response... verify... including when the gap ledger itself is unavailable or throws") under
the one adjacent I/O call the manifest left undefended. It is not a laundering-through-the-fence-branch
case (that one is correctly handled) — it is the fence CHECK becoming a new single point of failure for
an otherwise-successful request, introduced by this unit's own new code, in the exact class of fault
(a Mongo read failing) this same function already defends against for its other two calls.

Filed as **ISS-090** (severity high, `qa/issues.jsonl`), not folded into ISS-085 — it's a defect in the
fix, not the original leak. **ISS-085 stays open.**

## Leak 2 — verified

The enqueue-failure path (`emitWebhookEvents`'s catch, `:676-699`) is fully guarded: the ledger `record`
call is itself wrapped in its own try/catch with a last-resort structured log
(`webhook_emit_gap_record_failed`) if even that fails — I found no unguarded call in this path. The
recorded row is genuinely replayable: `packages/engine/tests/webhooks-gaps-mongo.test.ts`'s
"enqueue-failed row with the full event round-tripping byte-identical" test (`assert.deepEqual(all[0].event,
event, ...)`) proves the stored `event` is the complete, unmodified `WebhookEvent`; a future drain job
would key its replay on `gap.event.id` (the event's own id), not the ledger row's compound `_id`
(`enqueue-failed:<event.id>`) — correct, and consistent with `WebhookOutbox.enqueue`'s own id contract.
"No replay/drain worker yet" is honestly disclosed and, given the row is provably complete, is a
reasonable scope boundary for this unit, not a defect.

## WebhookEmitGapLedger — confirmed

- **Tenant scoping:** constructor refuses an unscoped `Db` (`TenantScopeError`), mirroring
  `MongoWebhookOutbox`; the B21 tenancy test (`webhooks-gaps-mongo.test.ts`) proves tenant A's ledger
  never sees tenant B's rows on the same underlying `Db`.
- **Erasure coverage:** `packages/db/src/erasure.ts:1436` adds a phase-1 `ERASURE_PLAN` entry using the
  plain `byStudent` filter against the flat top-level `studentId` field — confirmed by reading the
  entry directly and by the new `packages/db/tests/erasure.test.ts` test (full diff read: seeds rows
  for both a `readback-gap` and an `enqueue-failed` kind, both purged for the erased student, the
  sibling student's row untouched, receipt line `purged`/`deleted:1`/`remaining:0`).
- **D-016/D-020 no-TTL:** `packages/db/scripts/db-init.ts:187-188`'s two new `INDEX_PLAN` entries carry
  no `expireAfterSeconds` key (read directly) — covered by the repo-wide scanner
  (`packages/db/tests/db-init.test.ts` "ISS-t-013r-c0-3 scanner", which greps every source file under
  `packages/`, `apps/`, `mcp/` for any TTL pattern, not a per-file allowlist), which ran green in my own
  full-suite run.
- **Flat `studentId` does not escape the tenant fence:** the ledger's own `tenantScopedDb` wrapper stamps
  `tenantId` and prefixes `_id` before any document reaches Mongo — the flat field is a filter-shape
  convenience for B15, not a tenant-scoping mechanism, and the B21 tenancy test above confirms isolation
  holds regardless.

## Integrity

- Reproduced both levers myself with the exact assertion text pasted above (mine and the manifest's).
- `git diff 57b2c70 ba8d3d4 -- packages/db/tests/erasure.test.ts apps/api/tests/server.test.ts
  packages/db/tests/db-scope.test.ts` read in full: every change is a pure addition (new `test()` blocks,
  one added line in an existing `expected` map, one added `FENCE_AWARE_WRITERS` entry) — **no test
  weakened or deleted.**
- **45 skips confirmed exactly 45**, both in the manifest's own run and in my independent full-suite
  rerun on the bound worktree (`packages/engine` `tests 689 / pass 644 / fail 0 / skipped 45`) — T-039's
  B18 rows, unchanged.
- `pnpm -r typecheck`: 9/9 exit 0 (reran myself).
- `python contracts/verify_contracts.py`: exit 0 (vacuous PASS, reran myself).
- Scope: `git diff --stat 57b2c70 ba8d3d4` touches only `apps/api/src/{server,index}.ts`,
  `apps/api/tests/server.test.ts`, `packages/db/{scripts/db-init,src/collections,src/erasure}.ts`,
  `packages/db/tests/{db-scope,erasure}.test.ts`, `packages/engine/src/webhooks/{gaps,index}.ts`,
  `packages/engine/tests/webhooks-gaps-mongo.test.ts` — nothing in `qa/contracts/**`, `qa/verdicts/**`,
  `docs/DECISIONS.md`, `ARCHITECTURE.md`, `TASKS.md`, `.claude/**`, or
  `packages/engine/tests/fixtures/**`.
- ISS-088 (testlock primary-liveness no-redundancy) noted, not re-tested this cycle — out of scope for
  this unit. No oddity in the lock's behaviour observed this session.
- My own throwaway probe file (`apps/api/checker-probe.test.ts`) and throwaway baseline worktree
  (`D:/vc/.worktrees/checker-baseline-57b2c70`) were both deleted after use; neither ever touched the
  bound worktree's real files.

## Issues ledger

- **ISS-085: stays OPEN.** Leak 2 is solid. Leak 1's happy path (alert + record on a genuine gap,
  correct erasure carve-out) is solid. But the fence-check call this same fix added is an unguarded new
  failure mode that turns a successful write into a 500 under a plausible fault (a transient Mongo
  error on `erasure_fences`) — the fix is not yet safe to call complete for leak 1.
- **ISS-090 (new, high):** filed above, full evidence in `qa/issues.jsonl`.

## Clear to merge to main?

**No.** Fix cycle 1 needed: wrap the `isStudentFenced` call in `checkFactReadbackGap`
(`apps/api/src/server.ts:711`) in try/catch, log a failure (e.g.
`webhook_fact_readback_gap_fence_check_failed`) the same way the ledger-record failures already are,
and fall through to alert + record the gap (treating "can't determine fenced status" as "assume not
fenced, don't lose the signal") rather than letting the exception propagate and fail the whole request.
Everything else in this unit (leak 2, the ledger's tenant/erasure/TTL properties, the arithmetic) is
sound and should carry forward unchanged into the next cycle.

---

**Cycle checked:** 1
**Unit head checked:** `da5db5c` (fix cycle 1), forked from `main@57b2c70`, responds to cycle-0 FAIL at `937714b`
**Checker:** Mode A, full protocol

## VERDICT: PASS

## Scope, first

`git diff 937714b da5db5c --stat` (cycle 0's verdict commit to this cycle's head): exactly
`apps/api/src/server.ts` (+18/-2), `apps/api/tests/server.test.ts` (+57), and
`qa/manifests/t-042-webhook-fact-loss.md`. Nothing in `qa/contracts/**`, `qa/verdicts/**`,
`qa/issues.jsonl`, `docs/DECISIONS.md`, `ARCHITECTURE.md`, `TASKS.md`, `.claude/**`, or fixtures.
Matches the manifest's own claim exactly.

## 1. The invariant, end to end -- reproduced myself

Ran `bash scripts/vc-testlock.sh pnpm -C apps/api test`: 46/46 green, including the committed
ISS-090 regression test (`server.test.ts:522`), which drives a real HTTP round trip through
`dropOneFromNextIdInRead` (genuine 1-of-2 readback gap) plus `throwOnFenceCheckOnly` (fence check
throws). Asserted directly, not just the ledger row: response **status 200**, `facts` collection
size 2 (both durably written), the found fact's webhook still enqueued (`outbox.list().length ===
1`), the fence-check failure alerted (`webhook_fact_readback_gap_fence_check_failed:`), the
now-unexplained gap alerted (`webhook_fact_readback_gap:1_of_2_missing`), and exactly one
`readback-gap` row in the gap ledger. All confirmed by my own run, not taken from the manifest.

## 2. `fenced = false` is the right fall-through, not the wrong one

Reasoning re-derived: on a fence-check failure the code cannot distinguish "fence-explained" from
"real gap." Falling through as unexplained means the failure mode is an occasional false alert (a
legitimate erasure racing a transient Mongo blip on `erasure_fences`) rather than a silently
swallowed real defect or (the cycle-0 bug) a 500 on a successful write. That is the correct
direction for a system whose named invariant is "never lose the signal, never fail an
already-successful write."

Checked the fix didn't turn the correct carve-out into noise: the pre-existing "erasure
interaction" test (`server.test.ts:466`, a genuinely fenced student with a *working* fence check)
is untouched by this cycle's diff and still passed in my run -- 0 alerts, 0 recorded rows, the
found fact's webhook still emitted. A working fence check still correctly excuses a real gap; only
a *failing* fence check now falls through to alert.

## 3. Test isolation claim -- attacked, holds for the flow it tests

`throwOnFenceCheckOnly` (`server.test.ts:511-520`) throws only when `erasure_fences.findOne` is
called with no third argument (`options` defaults to `{}`). Grepped every `isStudentFenced` call
site in the source:

- `packages/engine/src/scribe/graph.ts:411,517,817,844` and `nodes.ts:1430` (the write path's own
  pre/post-write checks) all pass an explicit `{timeoutMS: ...}` -- confirmed untouched by the
  lever, exactly as claimed.
- `apps/api/src/server.ts:718` (`checkFactReadbackGap`'s own call) -- options-less, the one the
  lever targets.
- **A third call site the manifest/test comment does not mention:** `packages/db/src/consent.ts:41`
  (`requireConsent`'s `isStudentFenced(db, studentId)`, pre-existing from T-011/ISS-043) is *also*
  options-less. Checked whether this widens the lever's blast radius in this test: `decideApproval`'s
  read-back path (`getFactsByIds`, `packages/db/src/facts.ts:992-999`) is deliberately **not** gated
  on `requireConsent` by its own docstring ("Deliberately NOT gated on requireConsent like
  readActiveProfile: this reads back the engine's OWN just-completed write... not a disclosure to
  any external caller"), and `requireConsent` itself is only called from the scribe write path
  (`nodes.ts:85`) and `readActiveProfile`/MCP profile reads, none of which run inside this test's
  `decideApproval` call. So the test's practical isolation claim holds for the flow it actually
  exercises. The comment's framing ("the engine's own pre/post-write fence checks... are left
  untouched") is accurate but incomplete -- it doesn't name this third site -- a documentation
  precision gap, not a test-correctness defect. Noting it here rather than treating it as blocking.

## 4. Missing-guard pattern elsewhere in this unit's new code -- none found

Re-read every new I/O call this unit added (`packages/engine/src/webhooks/gaps.ts`,
`apps/api/src/server.ts`'s `emitWebhookEvents` and `checkFactReadbackGap`):
- `gaps.ts`'s `MongoWebhookEmitGapLedger.record` wraps its own `insertOne` (handles the 11000
  dup-key race, rethrows anything else) -- and every *caller* of `.record(...)` in `server.ts`
  (lines ~677, ~726, ~744) is itself wrapped in try/catch with a `webhook_emit_gap_record_failed`
  last-resort log, per cycle 0's already-cleared review.
- `gaps.ts`'s `.list()` is unguarded but is never called from a request path -- test-only.
- `checkFactReadbackGap`'s `isStudentFenced` call is now guarded (this cycle's fix); everything
  else in the function was already guarded at cycle 0.
No other unguarded new I/O call found.

## 5. Manifest arithmetic correction -- confirmed retracted, not softened

Re-read the "Baseline note" and "Manifest arithmetic correction" sections. The "other maker-checker
ticks landed in between" explanation is **gone** -- replaced with: 1224 was not stale (cycle-0's
three independent confirmations), and the maker's own "+12" was off by one in
`packages/db/tests/erasure.test.ts`. Verified the file diff myself (`git diff 57b2c70 HEAD --
packages/db/tests/erasure.test.ts`): exactly one new `test(...)` block plus one added line
(`[COLLECTION_NAMES.webhook_emit_gaps]: 0`) in an existing test's hardcoded `expected` map -- 1 new
+ 1 maintenance line, not 2 new tests, exactly as corrected. `apps/api` +3, `packages/engine` +7,
`packages/db` +1 = +11; 1224 + 11 = 1235. The false explanation is retracted, not hedged.

## 6. Counts -- re-run myself, with one unrelated discrepancy found and disclosed

- `apps/api` test: **46/46**, confirmed by direct run (twice).
- `pnpm -r typecheck`: **9/9 exit 0**, confirmed by direct run.
- `python contracts/verify_contracts.py`: **exit 0** (vacuous PASS), confirmed.
- `pnpm -r test` (full repo): ran **twice**, independently. Both runs: `packages/schemas` 61/61,
  `packages/observability` 59/59, `packages/providers` 54/54, `packages/db` 248/248,
  `mcp/university-kb` 29/29, `mcp/student-profile` 12/12, `apps/web` 38/38, `apps/api` 46/46 --
  all matching the manifest. **`packages/engine`: 689 tests / 643 pass / 1 fail / 45 skip**, both
  runs, same test, same assertion -- this does **not** match the manifest's claimed 689/644/0/45.

  Investigated rather than waved off: the failure is
  `packages/engine/tests/concern-classifier.test.ts:210` ("T-041 (ISS-t-037-2): a real in-flight
  LiteLLM HTTP request is actually cancelled..."), `AssertionError: the stub must have received the
  request before the timeout fires`. This file is **untouched** by this unit's diff (`git diff
  57b2c70 HEAD` touches only db/engine-webhooks/api files, confirmed by stat). Re-ran the file alone,
  in isolation, three separate times: **16/16 clean every time.** It only fails under full-suite
  parallel load. This is a machine-load/timing flake, not a regression this unit introduced --
  same class as the already-filed ISS-089 (testlock timing flake under RAM contention), but a
  different test/file, so filed separately as **ISS-091** (low severity, test-fragility) rather than
  folded into ISS-089 or silently ignored. **Grand total across my two reruns: 1236 tests / 1190
  pass / 1 fail / 45 skip** (not the claimed 1191/0 fail) -- the gap is exactly this one unrelated
  flake, not a hidden regression. **45 skips confirmed exactly 45**, both runs.
- Test-file diffs (`erasure.test.ts`, `db-scope.test.ts`, `server.test.ts`) re-checked line by line:
  the only removed (`-`) lines across all touched test files are two import-statement extensions
  (adding `erasureFenceKey` / `InMemoryWebhookEmitGapLedger` etc. to an existing import line) --
  no assertion, test body, or test case was weakened or deleted anywhere.

## 7. Falsification lever -- reproduced myself, in the bound worktree

Edited `apps/api/src/server.ts` directly (not a throwaway copy this time -- a git-tracked, cleanly
revertible change): replaced the try/catch with the bare pre-fix `const fenced = await
isStudentFenced(...)`. Ran `bash scripts/vc-testlock.sh pnpm -C apps/api test`:

```
T-042 api (ISS-090): ... -- never a 500  [FAIL]
  AssertionError [ERR_ASSERTION]: {"error":"internal"}
  500 !== 200
  at tests/server.test.ts:533:10
tests 46  pass 45  fail 1  skipped 0
```

Exactly the named assertion, exactly one failure, all 45 other tests in the file green. Reverted
with `git checkout -- apps/api/src/server.ts`; confirmed `git status` clean and the try/catch
restored; reran -- 46/46 green again.

## 8. Hygiene: the maker's throwaway worktree

`git worktree list` (both before and after my own verification work) shows no entry for
`checker-lever-t042c1`, and `D:/vc/.worktrees/` on disk has no such directory -- only
`t-010-blind-cards-eval`, `t-010-live-cards`, `t-039-suppression-outcome`, and this unit's own
`t-042-webhook-fact-loss`. The maker's throwaway is genuinely gone. Noting for the record (ISS-045
is about worktree directories surviving teardown with live handles): placing a throwaway inside
`.worktrees/` was still a poor choice even though this one cleaned up correctly -- no action needed
this cycle since nothing was left behind, but a future maker should place throwaways outside the
repo's own `.worktrees/` as the brief already flagged.

## Issues ledger

- **ISS-090: verified-resolved, closed.** Fix reproduced end-to-end; lever confirms the defect is
  real and the fix is what closes it.
- **ISS-085: verified-resolved, closed for BOTH leaks.** Leak 2 was already solid at cycle 0; leak 1
  was blocked on ISS-090 and is now closed by this cycle's fix.
- **ISS-091 (new, low, test-fragility):** filed for the unrelated `concern-classifier.test.ts` T-041
  timing flake found during this cycle's full-suite reruns -- does not block this unit.

## Clear to merge to main?

**Yes.** Both leaks (ISS-085) and the fence-check defect (ISS-090) are closed and independently
reproduced. The one discrepancy found (packages/engine's 1-test full-suite flake) is demonstrably
unrelated to this unit's diff -- untouched file, clean in isolation, a pre-existing machine-load
timing sensitivity (now tracked as ISS-091) -- and does not gate this merge.
