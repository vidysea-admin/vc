# Manifest — t-003b-db-hardening
**Contract:** qa/contracts/counselling-engine.md (B3, B4, B12, B14)
**Goal task:** T-003b
**Date:** 2026-09-25
**Fix cycle:** 1 of max 3 (cycle-0 checker PASS overridden by two independent Block reviews: ISS-026 critical)
**Dual check:** no
**Issues addressed this cycle:** ISS-026 (critical), ISS-027, ISS-028, ISS-t-003b-db-hardening-1
**Prior cycle (0) issues, unchanged this cycle:** ISS-018, ISS-019, ISS-020, ISS-021, ISS-t-003-student-kg-1
**Executor:** claude-opus-subagent
**Executor rationale:** in-scope hardening of an existing, well-understood module (packages/db) with a concrete, fully-specified fix (retire-then-insert CAS + index-plan test + error wrapping + id-collision fix); no external tool was worthy of delegation.

## What changed (cycle 1)

- `packages/db/src/facts.ts`:
  - **ISS-026 (critical).** `applyApprovedDiff`'s per-fact write is now **retire-then-insert**, not insert-then-retire. When a different fact is currently open for the key, the old fact is retired FIRST via a CAS `findOneAndUpdate({_id: existing._id, validTo: {$exists:false}}, {$set:{validTo:now}})`; only once that CAS has actually matched (proving the retirement landed and nobody else raced it) does the function insert the new fact. If the CAS matches nothing, `FactConflictError` is thrown — the old (insert-before-retire) order always collided with the unique partial index on `{studentId,key}` (validTo unset) on every update after the first, because for a moment two facts would be open for the same key; that made every sequential update throw `FactConflictError`. A real process crash between the CAS-retire and the insert leaves zero open facts for the key; re-running the SAME approved decision heals it because the deterministic `_id` (`deriveFactId`) means the retry finds no active fact (already retired) and just inserts, no CAS needed.
  - **ISS-028.** New `PartialApplyError` class (`writtenIds: string[]`, `failingKey: string`, `cause: unknown`). The per-fact loop body is now wrapped in a try/catch; if a later fact in a multi-fact `decision.edits` fails after earlier facts in the same call already committed, the error is re-thrown as `PartialApplyError` carrying the ids already written and the key that failed. A diff whose FIRST fact fails throws the raw underlying error (nothing partial to report yet) — this preserves the existing single-fact tests' `FactConflictError`-direct assertions unchanged.
  - **ISS-t-003b-db-hardening-1.** `deriveFactId` no longer joins its four fields with an unescaped `"|"` (`${studentId}|${key}|...`), which let a `"|"` character inside `studentId` or `key` make two different identities collide (`("alice|X","c")` and `("alice","X|c")` both joined to the same string). It now hashes `JSON.stringify([studentId, key, canonicalize(value), sessionId ?? null])` — a JSON array unambiguously delimits and escapes each element regardless of its contents.
  - Module docstring and `applyApprovedDiff`'s function docstring rewritten to describe all four failure modes (ISS-019/020/026/028) together.
- `packages/db/tests/fakes.ts` — added `FakeCollection.findOneAndUpdate(filter, {$set})`, a minimal CAS-capable stand-in for the real driver method (matches, mutates in place, returns the doc; returns `null` on no match) so `applyApprovedDiff`'s retire CAS step is testable fully offline (contract B8).
- `packages/db/scripts/db-init.ts` (script, NOT run by this unit):
  - **ISS-027.** Extracted the whole index set into an exported, plain-data `INDEX_PLAN: IndexSpec[]` array (no Mongo, no side effects), consumed by both `main()` (real `createIndex` calls) and offline tests. Added a plain (non-partial) `{studentId:1}` index on `facts`, `sessions`, `decisions` and `students` (`consents` already had one).
  - Guarded `main()` behind an entrypoint check (`fileURLToPath(import.meta.url) === process.argv[1]`) so importing the module for `INDEX_PLAN` — which the new test does — never attempts a live Mongo connection; previously `main().catch(...)` ran unconditionally at module load.
  - Docstring updated to describe `INDEX_PLAN`'s dual purpose and the new indexes.
- `packages/db/tests/facts.test.ts`:
  - Enabled `factsColl.declareUniqueIndex(...)` (mirroring `db-init.ts`'s real index exactly) in the pre-existing `supersede-not-delete` test — under the OLD insert-before-retire code this test never declared the unique index, so ISS-026's bug was invisible to it.
  - New: `ISS-026: two SEQUENTIAL applyApprovedDiff calls with different values for the same key both succeed` (the exact required regression test — asserts the second call does not throw and `supersededKeys` contains the key).
  - New: `ISS-026: a crash between retiring the old fact and inserting the new one heals on retry of the same decision` (seeds a "zero open facts" precondition simulating the crash window, then proves a retry heals to exactly one open fact with the correct deterministic `_id`).
  - New: `ISS-028: a multi-fact diff that fails part-way throws PartialApplyError carrying the ids written so far and the failing key` (monkey-patches `FakeCollection.insertOne` to fail deterministically on the 2nd of 2 facts; asserts `PartialApplyError.writtenIds`, `.failingKey`, `.cause`, and that the first fact remains committed).
  - New: `ISS-t-003b-db-hardening-1: deriveFactId does not collide when a '|' character moves between studentId and key` (the exact collision pair from the issue).
  - Kept the existing `ISS-019: interleaving two applyApprovedDiff calls...` concurrent-race test unchanged — still asserts at most 1 open fact and a `FactConflictError` for the loser.
- New file `packages/db/tests/db-init.test.ts` (ISS-027): asserts every studentId-bearing collection in `COLLECTION_NAMES` (facts, sessions, decisions, consents, students) has a plain, non-partial index led by `studentId` in `INDEX_PLAN`; asserts importing the module for `INDEX_PLAN` does not throw/connect; regression-checks the ISS-019 unique partial index and ISS-021 edges indexes are still present in the plan.

## How to verify (commands + expected)

- `pnpm -r typecheck` → expected: exit 0, all 9 workspaces "Done"
- `pnpm -r test` → expected: exit 0, `packages/db test: ℹ pass 50` / `ℹ fail 0` (up from 43 in cycle 0; +7 new tests: 2x ISS-026, 1x ISS-028, 1x ISS-t-003b-db-hardening-1, 2x ISS-027 in the new db-init.test.ts file + 1 regression check in that same file)
- `python contracts/verify_contracts.py` → expected: exit 0 (`PASS by vacuity` — no frozen contracts yet)
- `git diff --stat HEAD -- pnpm-lock.yaml` → expected: empty (lockfile untouched)
- `git diff --stat HEAD` → expected: only `packages/db/**` (+ this manifest, once staged)

## Actual outputs (from maker's own run, this cycle)

```
$ pnpm -r typecheck
Scope: 9 of 10 workspace projects
apps/api typecheck: Done
apps/web typecheck: Done
mcp/student-profile typecheck: Done
mcp/university-kb typecheck: Done
packages/providers typecheck: Done
packages/schemas typecheck: Done
packages/observability typecheck: Done
packages/engine typecheck: Done
packages/db typecheck: Done

$ pnpm -r test   (all 9 workspaces; packages/db excerpt below, full run: 9/9 green)
mcp/student-profile test: ℹ tests 1 / pass 1 / fail 0
apps/web test: ℹ tests 1 / pass 1 / fail 0
apps/api test: ℹ tests 1 / pass 1 / fail 0
mcp/university-kb test: ℹ tests 1 / pass 1 / fail 0
packages/providers test: ℹ tests 1 / pass 1 / fail 0
packages/schemas test: ℹ tests 50 / pass 50 / fail 0
packages/observability test: ℹ tests 43 / pass 43 / fail 0
packages/engine test: ℹ tests 31 / pass 31 / fail 0
packages/db test:
  ✔ supersede-not-delete: approving a changed value closes the old fact via validTo instead of removing it (unique index now declared)
  ✔ ISS-026: two SEQUENTIAL applyApprovedDiff calls with different values for the same key both succeed
  ✔ ISS-026: a crash between retiring the old fact and inserting the new one heals on retry of the same decision (never stuck at zero open facts)
  ✔ ISS-028: a multi-fact diff that fails part-way throws PartialApplyError carrying the ids written so far and the failing key
  ✔ ISS-t-003b-db-hardening-1: deriveFactId does not collide when a '|' character moves between studentId and key
  ✔ ISS-027: every studentId-bearing collection has a plain (non-partial, non-unique) index led by studentId
  ✔ ISS-027: importing db-init.ts for its index plan does not attempt a Mongo connection
  ✔ ISS-019/ISS-021 (regression): the facts unique-partial and edges from/to indexes are still declared
  ✔ ISS-019: interleaving two applyApprovedDiff calls for the same (studentId,key) leaves at most one open fact (unchanged, still passes)
  ✔ ISS-020: applyApprovedDiff twice with the same inputs is idempotent (unchanged, still passes)
packages/db test: ℹ tests 50
packages/db test: ℹ pass 50
packages/db test: ℹ fail 0

$ python contracts/verify_contracts.py
verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity

$ git diff --stat HEAD -- pnpm-lock.yaml
(empty)

$ git diff --stat HEAD
 packages/db/scripts/db-init.ts  |  99 ++++++++++++-----
 packages/db/src/facts.ts        | 241 ++++++++++++++++++++++++++++------------
 packages/db/tests/facts.test.ts | 132 +++++++++++++++++++++-
 packages/db/tests/fakes.ts      |  16 +++
 4 files changed, 386 insertions(+), 102 deletions(-)
 (+ new file packages/db/tests/db-init.test.ts, untracked at diff time)
```

**Unit diff range for cycle 1:** `001411b..HEAD` (this cycle's fix commit), where `001411b`
("qa: reopen t-003b fix cycle 1 (ISS-026 critical, ISS-027, ISS-028 from reviews)") is the reopen
commit this cycle answers. Cycle 0's own fix landed at `8aafe46`.

## Capability coverage (each new claim -> its isolating falsification)

All falsification below was run directly in this worktree (`D:\vc\.worktrees\t-003b-db-hardening`)
via the Edit tool: GREEN confirmed first (50/50), then each row's fix was reverted to the exact
pre-fix form, `pnpm --filter @vc/db test` re-run to observe the named test(s) go RED, then the fix
was restored and GREEN re-confirmed (50/50 at the end, and again after all four falsifications).
No real MongoDB connection was made anywhere in this exercise.

| capability (one line) | the check that covers it | the falsifying edit | observed |
|---|---|---|---|
| ISS-026: retire-then-insert CAS — two sequential updates to the same key both succeed | `tests/facts.test.ts` "ISS-026: two SEQUENTIAL applyApprovedDiff calls..." + the now-hardened `supersede-not-delete` test | Reverted `applyApprovedDiff` to the old insert-before-retire order (removed the CAS-retire block entirely, insert directly) | BEFORE: both `✔`. AFTER: both `✖` — `supersede-not-delete` and the ISS-026 sequential-update test both failed (`ℹ fail 2`), reproducing the exact "every sequential update after the first throws FactConflictError" bug the issue describes. RESTORED: both `✔` again, 50/50 total. |
| ISS-026: a crash between retire and insert heals on retry of the same decision | `tests/facts.test.ts` "ISS-026: a crash between retiring..." | Removed `validTo: { $exists: false }` from `activeFilter` in `applyApprovedDiff`, so a historical (already-retired) doc for the key is mistaken for an active one | BEFORE: `✔`. AFTER: `✖ ISS-026: a crash between retiring... (ℹ fail 1)` — the seeded retired doc (simulating the crash window) was wrongly treated as still-active, so the code attempted a CAS-retire against a doc whose `validTo` is already set, the CAS matched nothing, and it threw `FactConflictError` instead of healing. RESTORED: `✔` again, 50/50 total. |
| ISS-028: a multi-fact diff that fails part-way throws `PartialApplyError` with the partial outcome | `tests/facts.test.ts` "ISS-028: a multi-fact diff that fails part-way..." | Removed the `if (written.length > 0) throw new PartialApplyError(...)` branch, leaving only `throw err;` | BEFORE: `✔`. AFTER: `✖ ISS-028: ... (ℹ fail 1)` — the raw `Error("simulated write failure...")` propagated instead of `PartialApplyError`. RESTORED: `✔` again, 50/50 total. |
| ISS-t-003b-db-hardening-1: `deriveFactId` does not collide across a `"|"` field boundary | `tests/facts.test.ts` "ISS-t-003b-db-hardening-1: deriveFactId does not collide..." | Reverted `deriveFactId`'s material to the old `` `${studentId}|${key}|${canonicalJson(value)}|${sessionId ?? ""}` `` join | BEFORE: `✔`. AFTER: `✖ ISS-t-003b-db-hardening-1: ... (ℹ fail 1)` — `deriveFactId("alice|X","c",...)` and `deriveFactId("alice","X|c",...)` produced the identical hash. RESTORED: `✔` again, 50/50 total. |
| ISS-027: every studentId-bearing collection gets a plain `{studentId:1}` index | `tests/db-init.test.ts` "ISS-027: every studentId-bearing collection has a plain..." | Removed the four new `INDEX_PLAN` rows (facts/sessions/decisions/students plain studentId indexes), leaving only the pre-existing `consents_studentId` entry | BEFORE: `✔`. AFTER: `✖ ISS-027: ... (ℹ fail 1)` — no plain studentId-led index found for `facts`/`sessions`/`decisions`/`students`. RESTORED: `✔` again, 50/50 total. |
| `scripts/db-init.ts`'s `INDEX_PLAN` and the actual `createIndex` calls it drives | Not automatically tested end-to-end — `scripts/db-init.ts`'s `main()` connects to the real production server and this unit is explicitly forbidden from running it (B8: offline tests only; still "NOT RUN by T-003/T-003b" per the script's own docstring) | n/a | `UNVERIFIED against a real server, same as cycle 0` — `INDEX_PLAN` is now a single source of truth consumed by both `main()`'s real `createIndex` loop and the offline test, so the offline test's coverage of the *plan's shape* directly constrains what `main()` will execute; the actual live `createIndex` calls remain reviewed-by-inspection only, enumerated debt, not silently shipped. |

## Live browser evidence
Not UI-touching — no surface changed. This unit only touches `packages/db/**` (a Mongo access
layer with no HTTP/UI surface) and this manifest file.

## Status: ready-for-check
