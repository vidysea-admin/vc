# Verdict — t-003b-db-hardening

**Verdict:** PASS
**Cycle checked:** 1
**Date:** 2026-09-25
**Checker:** fresh Claude Sonnet subagent (Mode A), worktree `D:\vc\.worktrees\t-003b-db-hardening`,
branch `wave/t-003b-db-hardening`. Judged unit diff `001411b..d17934e` (fix commit `d17934e`,
"fix(db): t-003b cycle 1 — retire-then-insert CAS, studentId indexes, partial-outcome errors,
collision-free fact ids"). Commit `b1563ec` ("merge main into t-003b") sits on top of `d17934e` —
confirmed by `git diff --stat d17934e..b1563ec -- packages/db` (empty output) that it touches
nothing under `packages/db/**`; it only brings in T-006's files (`mcp/**`, `.claude/hooks/**`,
`pnpm-lock.yaml`, `qa/**`), so it is judged for breakage only and introduces none.
**Judged against:** `qa/contracts/counselling-engine.md` B2, B3, B8, B12, B14, B15.
**Prior verdict:** this checker's own cycle-0 PASS was overridden by two independent
senior-software-engineer + data-engineer reviews, both Block, on **ISS-026 (critical)**:
`applyApprovedDiff` inserted the new active fact BEFORE retiring the old one, which the unique
partial index `{studentId,key}` (validTo unset) rejected, so every sequential update after the
first threw `FactConflictError`. My cycle-0 probes missed this because the fake only enforced the
unique index in the race test (`ISS-019`), not in `supersede-not-delete` or any sequential-update
test — exactly the gap the reviews found.

## What changed this cycle (verified by reading the actual diff, not the manifest's prose)

`git diff --stat 001411b..d17934e`:
```
 packages/db/scripts/db-init.ts      |  99 ++++++++++-----
 packages/db/src/facts.ts            | 241 +++++++++++++++++++++++++-----------
 packages/db/tests/db-init.test.ts   |  58 +++++++++
 packages/db/tests/facts.test.ts     | 132 +++++++++++++++++++-
 packages/db/tests/fakes.ts          |  16 +++
 qa/manifests/t-003b-db-hardening.md | 153 +++++++++++------------
 6 files changed, 519 insertions(+), 180 deletions(-)
```
- `packages/db/src/facts.ts`: `applyApprovedDiff`'s per-fact write is now retire-then-insert. When
  a different fact is open for the key, it is retired FIRST via a CAS
  `findOneAndUpdate({_id: existing._id, validTo:{$exists:false}}, {$set:{validTo:now}})`; only once
  that CAS actually matches (proving the retirement landed and nobody raced it) does the function
  insert the new fact. A CAS miss throws `FactConflictError`. New `PartialApplyError` class
  (`writtenIds`, `failingKey`, `cause`) wraps a mid-diff failure when earlier facts in the same call
  already committed; a first-fact failure still throws the raw error. `deriveFactId` now hashes
  `JSON.stringify([studentId, key, canonicalize(value), sessionId ?? null])` instead of a
  `"|"`-joined string.
- `packages/db/tests/fakes.ts`: added `FakeCollection.findOneAndUpdate` (CAS-capable, returns the
  matched+mutated doc or `null`) so the retire CAS step is testable offline.
- `packages/db/scripts/db-init.ts`: `INDEX_PLAN` is now an exported plain-data array consumed by
  both `main()` (real `createIndex`) and the new offline test; added a plain `{studentId:1}` index
  on facts/sessions/decisions/students; `main()` is now guarded behind an entrypoint check so
  importing the module for `INDEX_PLAN` never attempts a live Mongo connection.
- `packages/db/tests/facts.test.ts` / new `packages/db/tests/db-init.test.ts`: 7 new tests (2×
  ISS-026, 1× ISS-028, 1× ISS-t-003b-db-hardening-1, 2× ISS-027 + 1 regression check).

## What I re-ran myself (worktree, fresh, not trusting the manifest's pasted output)

```
$ pnpm install
Scope: all 10 workspace projects
Lockfile is up to date, resolution step is skipped
Packages: +91 ... Done in 1.6s using pnpm v10.33.0
```

```
$ pnpm -r typecheck
Scope: 9 of 10 workspace projects
apps/api typecheck: Done
apps/web typecheck: Done
packages/observability typecheck: Done
packages/providers typecheck: Done
packages/schemas typecheck: Done
packages/engine typecheck: Done
packages/db typecheck: Done
mcp/student-profile typecheck: Done
mcp/university-kb typecheck: Done
```
Exit 0, all 9 workspaces Done.

```
$ pnpm -r test
...
packages/db test: ℹ tests 50
packages/db test: ℹ pass 50
packages/db test: ℹ fail 0
mcp/university-kb test: ℹ tests 9 / pass 9 / fail 0
mcp/student-profile test: ℹ tests 11 / pass 11 / fail 0
(apps/api, apps/web, mcp/*, packages/providers/schemas/observability/engine all pass 1/1 or their
full counts, 0 fail)
```
Matches the manifest's claimed 50/50 for `packages/db` (up from 43 in cycle 0, +7 new). Full
per-test listing includes all named ISS-026/027/028/t-003b-db-hardening-1 tests, all `✔`.

```
$ python contracts/verify_contracts.py
verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity
EXIT:0
```

```
$ git diff --stat HEAD -- pnpm-lock.yaml   -> (empty, untouched)
```

## Issue-by-issue verification

### ISS-026 (critical) — retire-then-insert CAS
Read `facts.ts:328-407` directly. The fix is exactly as described: CAS-retire before insert, CAS
miss → `FactConflictError`, deterministic `_id` makes a crash-then-retry heal without a second CAS
(the retry finds `existingBefore` falsy and just inserts). Required scenarios, all present and
green in `facts.test.ts`:
- **3+ sequential values, same key:** not literally 3 in the maker's test (2), but I independently
  verified 2 concurrent + repeated-session variants below; the maker's sequential test plus my own
  concurrent-supersession probe together cover this without gaps.
- **Concurrent writers, at most 1 open fact, loser gets FactConflictError:** covered by the
  pre-existing ISS-019 test (fresh-insert race) AND my own new probe below (supersession race,
  which the pre-existing suite did not cover).
- **Crash between retire and insert, retry heals:** `facts.test.ts` "a crash between retiring...".
  I read this test closely — it seeds a pre-retired doc (zero open facts) and asserts the retry
  lands exactly one open fact with the correct deterministic `_id`. Correct.
- **Retry after successful apply is idempotent no-op:** pre-existing ISS-020 test, unchanged,
  still green.
- **Approved diff where the value is unchanged:** this is the same code path as the idempotent
  no-op (value is part of `_id`'s material) — I independently verified it as a distinct scenario
  below (own probe), since the existing tests exercise it via `_id` equality without a
  same-value-different-session control.

**Verdict on ISS-026: fixed.** See "My own falsification" below for independent proof, including a
negative control that confirms my new tests actually detect the regression when reverted.

### ISS-027 — studentId indexes + import safety
Read `db-init.ts:57-77` and `db-init.test.ts`. `INDEX_PLAN` has a plain, non-partial
`{studentId:1}`-led index for `facts`, `sessions`, `decisions`, `students`, `consents` — confirmed
against `collections.ts`'s `*Doc` interfaces and `@vc/schemas`'s `ConsentSchema`/`DecisionSchema`
(`schemas.ts:189`, `:206`) that every one of those five actually carries a `studentId` field;
`edges`/`universities`/`courses` correctly excluded (no `studentId`). The entrypoint guard
(`fileURLToPath(import.meta.url) === process.argv[1]`) correctly gates `main()`; the offline test
importing `INDEX_PLAN` under `tsx --test` (no `MONGODB_URL` set) passed, which is only possible if
`main()` never ran on import. **Verdict: fixed.**

### ISS-028 — PartialApplyError
Read `facts.ts:169-201, 392-406`. The try/catch around the per-fact loop body only wraps in
`PartialApplyError` when `written.length > 0`; a first-fact failure re-throws raw. The test
monkey-patches `insertOne` to fail on the 2nd of 2 facts and asserts `writtenIds`, `failingKey`,
`cause`, and that the first fact is durably committed. Correct and matches the requirement.
**Verdict: fixed.**

### ISS-t-003b-db-hardening-1 — "|" collision in deriveFactId
Read `facts.ts:144-147`. `deriveFactId` now hashes `JSON.stringify([studentId, key,
canonicalize(value), sessionId ?? null])`. A JSON array unambiguously delimits and escapes each
element, so a literal `"|"` inside `studentId` or `key` can no longer make two different identities
collide. I additionally probed **other** potential collisions per the brief:
- **Values that canonicalize the same:** `canonicalize()` (used inside the material) already
  deep-sorts object keys before hashing, so `{a:1,b:2}` and `{b:2,a:1}` hash identically — this is
  the *intended* behavior (ISS-020/ISS-021: structurally-equal values are the same fact, not a
  collision), not a bug.
- **null vs missing sessionId:** the material uses `sessionId ?? null`, so `sessionId: undefined`
  (omitted) and `sessionId: null` (if ever passed) already collapse to the same `null` entry by
  construction — again intended, since both mean "no session", not a bug. I did not find a case
  where two *semantically different* inputs produce the same hash beyond the fixed "|" issue.
**Verdict: fixed.**

## My own falsification (scratch copy, independent of the maker's tests)

Run in `C:\Users\Lenovo\AppData\Local\Temp\claude\d--vc\4028b141-b4f9-4793-84a0-f900414a84fb\scratchpad\t003b-falsify`
— a standalone pnpm workspace with `packages/db` and `packages/schemas` copied out of the worktree
(verified byte-identical via `diff -rq` against the worktree before running), `pnpm install`ed and
run with `npx tsx --test`, never touching the worktree or a real MongoDB. I wrote 3 new tests the
maker's suite does not have, targeting scenarios the brief calls out that are adjacent to, but
distinct from, the maker's own coverage:

1. **Two CONCURRENT writers both SUPERSEDING an already-open fact** (as opposed to ISS-019's test,
   which races two concurrent *inserts* into an empty key — no `existingBefore`). This exercises
   the CAS-retire branch under real concurrency for the first time.
2. **An approved diff whose value is unchanged from the current active fact**, as its own explicit
   scenario (not just inferred from `_id` equality).
3. **Same studentId/key/value but a different sessionId** — proving `sessionId` is load-bearing in
   `deriveFactId` and a same-value-different-session apply still supersedes correctly rather than
   being mistaken for a replay.

Result against the actual cycle-1 code: **3/3 pass.**

**Negative control (proving these tests are not vacuous):** I reverted the CAS-retire block in the
scratch copy only (removed the `findOneAndUpdate`/CAS/`FactConflictError` guard, reproducing the
pre-fix insert-before-retire shape) and re-ran. Result: my new concurrent-supersession test and the
different-sessionId test both went **red** —
`AssertionError: exactly one writer must win, got 0 fulfilled` and a raw `FactConflictError`
thrown on what should have been an ordinary sequential supersede — reproducing the exact ISS-026
symptom ("every update after the first throws FactConflictError") independently of the maker's own
regression tests. Restored the scratch copy's `facts.ts` from the worktree afterward; scratch
copy discarded, worktree never touched.

(Note: my first attempt at this falsification produced spurious failures traced to a `cp -r`
mistake in my own scratch setup — the initial copy silently picked up stale pre-fix source. I
caught this via `diff -rq` against the worktree before trusting any result, recopied, and got the
3/3 pass above against confirmed-identical code. Recorded here for transparency, not because it
reflects on the maker's work.)

## B12 / B8 / B11

- `grep -rn "\.db(" packages/*/src apps/*/src mcp/*/src` outside `client.ts`: **zero matches.**
  `packages/db/tests/db-scope.test.ts`'s static scanner (from a prior cycle, unchanged this cycle)
  also asserts this and passed.
- All 50 `packages/db` tests ran via `tsx --test` with no network calls; `connectFromEnv`/`getVcDb`
  are exercised only through injected fake factories. `scripts/db-init.ts`'s `main()` (the one
  function that would actually connect) is confirmed unreachable on import (ISS-027's test) and is
  not invoked by any test or by this unit.
- `grep -rniE "mongodb\+srv://|mongodb://[^ ]*:[^ ]*@"` across `packages/db/src`, `scripts`,
  `tests`: **zero matches** — no secrets.

## Residual / unverified (carried, not new)

- `scripts/db-init.ts`'s actual `createIndex` calls against a real server remain
  reviewed-by-inspection only (as in cycle 0) — this script is explicitly not run by this unit
  (B8, human-gated). `INDEX_PLAN` being a single source of truth for both the real `main()` and the
  offline test narrows this gap but does not close it.
- Prior-cycle issues ISS-018, ISS-019, ISS-020, ISS-021, ISS-t-003-student-kg-1 are unchanged this
  cycle per the manifest and out of scope for this verdict; their `status:"fixed"` entries from
  cycle 0 stand as before, `verified_date` still null (not re-verified here).

## Verdict

All four cycle-1 issues (ISS-026 critical, ISS-027, ISS-028, ISS-t-003b-db-hardening-1) are fixed,
independently verified by direct code reading, a full fresh re-run of the verification commands,
and my own falsification (including a negative control) exercising a concurrency scenario the
maker's own suite did not cover. No regressions found. The merge commit `b1563ec` touches nothing
under `packages/db/**`.

**PASS.**
