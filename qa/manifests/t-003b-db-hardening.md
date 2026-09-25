# Manifest — t-003b-db-hardening
**Contract:** qa/contracts/counselling-engine.md (B2, B3, B4, B8, B12, B14, B15)
**Goal task:** T-003b
**Date:** 2026-09-25
**Status:** ready-for-check
**Fix cycle:** 2
**Fix cycle budget:** 2 of max 3 (cycle-1 PASS overridden: data-engineer + senior Block, ISS-t-003b-c1-1 critical, -2 high)
**Design:** D-012 (fact identity separate from content: fresh `_id`, `contentHash` for idempotency) + D-013 (open facts flagged `active: true`; partial unique index `{active: true}`)
**Unit diff range (cycle 2, extended for D-013):** `1dd38b0..HEAD`. `1dd38b0` = "qa: reopen t-003b fix cycle 2". It includes `4c4878c` (D-012 fix), `1242b3b` (merge main, which brings in D-013) and the D-013 fix commit at HEAD.
**Dual check:** no
**Issues addressed this cycle:** ISS-t-003b-c1-1 (critical), ISS-t-003b-c1-2 (high), ISS-t-003b-c1-3, ISS-t-003b-c1-4, and the D-013 index fix (partialFilterExpression `$exists:false` is uncreatable)
**Prior issues, unchanged this cycle (regression-covered):** ISS-018..ISS-021, ISS-026..ISS-028, ISS-t-003b-db-hardening-1, ISS-t-003-student-kg-1
**Executor:** claude-opus-subagent
**Executor rationale:** in-scope fix of one module (packages/db) against a fully specified decision (D-012); no external tool worth delegating to.

## What changed (cycle 2)

- `packages/db/tests/fakes.ts` (ISS-t-003b-c1-3, done FIRST):
  - `insertOne` of a duplicate `_id` now throws `FakeDuplicateKeyError` (`code: 11000`), like the real driver's built-in `_id_` unique index. The old plain `Error` hid ISS-t-003b-c1-1.
  - `findOneAndUpdate(filter, update, {returnDocument?})` returns a copy of the PRE-image by default and the post-image only with `{returnDocument: "after"}`. This matches mongodb@6 (`node_modules/mongodb/mongodb.d.ts` `FindOneAndUpdateOptions.returnDocument`: "The default is 'before'"; overload with no options returns `Promise<WithId<TSchema> | null>`).
- `packages/db/tests/facts.test.ts`: new `setup()` helper declares every unique index from `scripts/db-init.ts` `INDEX_PLAN` on the fake (not hand-copied). EVERY test in the file now uses it, so every facts test runs against the production unique partial index. The hand-written `declareUniqueIndex` calls were removed.
- `packages/db/src/facts.ts` `applyApprovedDiff` (ISS-t-003b-c1-1, D-012):
  - Every write gets a fresh `_id` (`new ObjectId().toHexString()`, from the existing `mongodb` dependency; no new dependency).
  - `deriveFactId` renamed to `deriveContentHash` (same material: sha256 of JSON `[studentId, key, canonical value, sessionId ?? null]`). It is stored as `contentHash`. The only callers were inside packages/db (tests), and they are updated. Nothing outside packages/db referenced it (grep over apps/, mcp/, packages/: none).
  - Idempotent replay compares the active fact's `contentHash`, not its `_id`.
- `packages/db/src/facts.ts` (ISS-t-003b-c1-2): on a CAS miss the writer re-reads the active fact. If the contentHash matches, the write already landed and counts as success. A different open fact throws `FactConflictError`. If no fact is open (the other writer is inside its retire->insert window, or crashed there), the writer falls through to the insert and the unique partial index picks one winner. On an 11000 from the insert, the same rule applies: a matching contentHash is success, anything else throws `FactConflictError`.
- `packages/db/src/collections.ts`: `FactDoc` gains `contentHash?: string` (optional only so legacy pre-D-012 docs still type; such a doc never matches a replay and is superseded).
- ISS-t-003b-c1-4, documentation plus a test:
  - The facts.ts module docstring now documents that a retry with a different sessionId is a NEW write with its own provenance edge. The old fact keeps its edge to the old session, so provenance is never silently re-pointed.
  - It also documents the live retire->insert zero-fact window that T-007 readers must tolerate: "no open fact" means unknown or being updated, never "no value", and a reader must not write on the strength of it.
  - `scripts/db-init.ts` gains an ERASURE NOTE for T-011 (B15): edges carry no studentId, so erasure resolves in two hops through the student's fact ids and session ids, plus the student --has--> edges.
- `scripts/db-init.ts` `INDEX_PLAN`: **no** `{studentId, key, contentHash}` index was added. The docstring records why: no query filters on `contentHash`. The active fact is read by `{studentId, key, validTo unset}`, which the unique partial index serves, and the hash is compared in memory.

## Evidence per issue (cycle 2)

| Issue | Tests (all in `packages/db/tests/facts.test.ts`) | RED before the fix (old code, driver-faithful fake) | GREEN after |
|---|---|---|---|
| ISS-t-003b-c1-1 (critical) | "A -> B -> A succeeds; one open fact with value A, history holds 3 docs with the old A still retired"; "A -> B -> A -> B also succeeds"; "every write gets a fresh _id that is not derived from content"; "replaying an identical decision is a no-op" | The first 3 were `✖`. The A->B->A failure was `Error: FakeCollection.insertOne: duplicate _id "bc44d7a0…"` from `facts.ts:372`. With the fixed fake it became 11000, then re-read found no open fact, then `FactConflictError`, with the key stuck at zero open facts. The replay test passed on old code too (old replay was already idempotent) and is a regression guard. | `✔` all 4 |
| ISS-t-003b-c1-2 (high) | "two CONCURRENT identical decisions against a key holding a different open fact both succeed, one open fact" (Promise.allSettled); "concurrent identical decisions still succeed when the loser re-reads inside the winner's retire->insert window"; "an 11000 on insert whose winner has our contentHash is success"; kept: "concurrent writers with DIFFERENT values … losers get FactConflictError" (now asserts exactly 1 rejection) plus the original ISS-019 race test | The first 3 were `✖`, for example `identical concurrent replay must not fail: FactConflictError: … another writer already holds the open fact`. The different-value tests were `✔` on old code as well, and remain guards. | `✔` all 5 |
| ISS-t-003b-c1-3 | "FakeCollection.insertOne of a duplicate _id throws a code-11000 error"; "FakeCollection.findOneAndUpdate returns the PRE-image by default and the post-image only with returnDocument:'after'"; "the facts tests run with the production unique partial index from INDEX_PLAN" | First 2 `✖` against the old fake | `✔` all 3 |
| ISS-t-003b-c1-4 | "the same value re-approved under a different sessionId is a new write with a provenance edge to the new session" (asserts supersededKeys, 2 docs, 1 open, the new contentHash, the new fact's sourced_from edge to session-2, and the old fact's edge still to session-1) | `✖` (no `contentHash` on docs) | `✔` |
| Crash healing | "crash between retire and insert: re-running the same decision heals to exactly one open fact" (real crash: insertOne throws after the CAS retire; asserts 0 open, then heals to 1 open, 2 docs). The kept ISS-026 seeded-crash test now asserts `contentHash` in place of the `_id` | `✔` on old code as well (a guard) | `✔` |

RED run (after the rename-only refactor so the file loads, before the fake and facts fixes): `ℹ tests 63 / ℹ pass 53 / ℹ fail 10`. After the fake fix only: `ℹ fail 8` (the 2 fake-fidelity tests turned green). After the facts.ts fix: `ℹ fail 0`.

## Falsification (cycle 2): each fix reverted, the named test goes RED, then restored

This ran as a script. Each mutation was applied to the file, `pnpm --filter @vc/db test` was run, and then the original bytes were written back.

| Fix | Mutation (revert) | Observed RED |
|---|---|---|
| c1-1 fresh `_id` | `_id: new ObjectId().toHexString()` → `_id: contentHash` | fail=3: A->B->A; A->B->A->B; fresh-_id |
| c1-2 CAS-miss re-read | throw `FactConflictError` straight away on a CAS miss | fail=2: both concurrent-identical tests |
| c1-2 null fall-through | `else if (current)` → `else` (throw when no fact is open) | fail=1: the retire->insert-window concurrent test |
| c1-2 11000 contentHash match | winner check → `false` | fail=2: 11000-winner-ours; the window test |
| replay short-circuit (ISS-020/D-012) | replay check → `false` | fail=2: ISS-020 idempotent; c1-1 replay no-op |
| c1-4 sessionId in contentHash | drop sessionId from the hash material | fail=1: the c1-4 provenance test |
| crash heal (active filter) | remove `validTo: {$exists:false}` from activeFilter | fail=7, including ISS-026 seeded crash, the new crash-heal test, and A->B->A |
| c1-3 fake dup `_id` → 11000 | throw a plain `Error` | fail=1: fake dup-_id test |
| c1-3 fake pre-image | `return existing` (post-image) | fail=1: fake pre-image test |
| c1-3 production index in setup | skip every INDEX_PLAN index | fail=4: ISS-019 race; 11000-winner-ours; window test; INDEX_PLAN test |
| RESTORED | all originals written back | `tests=63 pass=63 fail=0` |

## D-013 evidence (cycle 2 follow-up, before the checker)

**Why:** MongoDB's partialFilterExpression accepts equality, `$exists: true`, `$gt/$gte/$lt/$lte`, `$type`, `$and`, `$or` and `$in`, but not `$exists: false` (mongodb.com/docs/manual/core/index-partial, checked 2026-09-25 by the coordinator; recorded as D-013). The previous index `{validTo: {$exists: false}}` would have failed at `db:init` on the live server.

**What changed:**
- `packages/db/scripts/db-init.ts` `INDEX_PLAN`: the unique partial index is now `{studentId:1, key:1}` with `partialFilterExpression: {active: true}`, renamed `facts_studentId_key_active_true_unique`. The docstring explains why `$exists:false` cannot be used.
- `packages/db/src/facts.ts`:
  - `activeFilter` is `{studentId, key, active: true}`.
  - The insert candidate carries `active: true`.
  - The retire CAS filter is `{_id, active: true}`. The update is `{$set: {validTo: now}, $unset: {active: ""}}`, one single-document update.
  - `proposeFactChanges` diffs only against `active === true` facts. A doc without `active`, including a pre-D-013 legacy doc with no validTo, is history.
  - The module docstring is updated.
- `packages/db/src/collections.ts`: `FactDoc` gains `active?: true`, which is optional and backward compatible. It is `true` on the open fact and absent on retired ones, never `false`.
- `packages/db/tests/fakes.ts`:
  - New exported `assertSupportedPartialFilter(filter)` throws "Expression not supported in partial index: …" on anything outside the documented set. It rejects `$exists:false`, `$ne`, `$nin`, `$not`, `$nor`, `$regex` and `field: null`, and it recurses into `$and`/`$or`. `declareUniqueIndex` calls it.
  - `findOneAndUpdate` supports `$unset`.
  - `{active: true}` equality was already evaluated by `matchesFilter`, and it is now exercised by the INDEX_PLAN fidelity test.
- Test fixtures that model an OPEN fact now carry `active: true`: the proposeFactChanges fixtures, the supersede seed, the INDEX_PLAN fidelity test and the ISS-021 drifted-open-fact fixture. The `open()` helpers count `active === true`.

**New tests (RED, then GREEN):**

| Test | File | RED | GREEN |
|---|---|---|---|
| D-013: every partialFilterExpression in INDEX_PLAN passes the server-supported-operator validator | tests/db-init.test.ts | ✖ (file failed to import: `does not provide an export named 'assertSupportedPartialFilter'`; after the fake: ✖ on the old plan) | ✔ |
| D-013: the fake rejects {validTo: {$exists: false}} as a partial filter, like the real server | tests/db-init.test.ts | ✖ (import) | ✔ |
| D-013: the partial-filter validator accepts the documented operators and rejects the rest | tests/db-init.test.ts | ✖ (import) | ✔ |
| ISS-019/ISS-021 regression: the facts unique-partial index is `{active: true}` and named `facts_studentId_key_active_true_unique` | tests/db-init.test.ts | ✖ | ✔ |
| D-013: an inserted open fact carries active:true and no validTo | tests/facts.test.ts | ✖ | ✔ |
| D-013: retiring a fact sets validTo and unsets active in ONE CAS update filtered on {_id, active:true} | tests/facts.test.ts | ✖ | ✔ |
| D-013: applyApprovedDiff treats only active:true as open (a doc without active is history, never CAS-retired) | tests/facts.test.ts | ✖ | ✔ |
| D-013: proposeFactChanges diffs only against active:true facts | tests/facts.test.ts | ✖ | ✔ |

RED sequence in `packages/db`:
1. Tests written first: `tests 65 / pass 49 / fail 16`. The failures were 15 facts tests plus the db-init file failing to import.
2. After the fake validator: `tests 70 / pass 41 / fail 29`. Every test on the production index failed with `Expression not supported in partial index: validTo: {$exists: false} ($not)`. The fake reproduces the live-server failure.
3. After INDEX_PLAN and facts.ts: `fail 1`. The remaining failure was the ISS-021 drifted fixture, which modelled an open fact without `active`, so the fixture was corrected.
4. Final: `tests 70 / pass 70 / fail 0`.

**Falsification (D-013): each change reverted by script, tests run, then restored**

| Change | Revert | Observed RED |
|---|---|---|
| INDEX_PLAN filter `{active: true}` | back to `{validTo: {$exists: false}}` | fail=28, including the INDEX_PLAN-validator test and the ISS-019/021 plan test |
| INDEX_PLAN name | old name | fail=1 (ISS-019/021 plan test) |
| declareUniqueIndex validates | validation call removed | fail=1 (fake rejects `$exists:false`) |
| validator rejects `$exists:false` | check disabled | fail=2 (rejects-`$exists:false`; accepts/rejects matrix) |
| fake `$unset` | removed | fail=11, including the retire-CAS test |
| insert carries `active: true` | removed | fail=15, including the inserted-active and retire-CAS tests |
| CAS filter `{_id, active: true}` | `{_id, validTo: {$exists:false}}` | fail=1 (retire-CAS test) |
| CAS update `$unset: {active: ""}` | `$set` only | fail=11, including the retire-CAS test |
| activeFilter `active: true` | `validTo: {$exists:false}` | fail=1 (only-active-is-open test) |
| proposeFactChanges `active === true` | `validTo === undefined` | fail=1 (proposeFactChanges D-013 test) |
| RESTORED | | `tests=70 pass=70 fail=0` |

**Out of scope (mcp/, not edited per brief). These still use the old "open = no validTo" rule:**
- `mcp/student-profile/src/index.ts:108`: `get_profile_facts` query filter `validTo: { $exists: false }`. This is a query, not an index, so the server accepts it. It is inconsistent with D-013 and should become `active: true`. As written it would also return legacy docs with no `active` field.
- `mcp/student-profile/src/index.ts:154`: a comment ("proposeFactChanges itself filters to the active ones, no validTo") that D-013 makes stale.
- `mcp/student-profile/tests/index.test.ts`: `seedFact` fixtures at lines 97, 109, 134, 173, 304, 358, 413 and 469 seed OPEN facts without `active: true`. Under D-013, `proposeFactChanges` treats them as history. **Two mcp tests now fail as a result**:
  - `B3 propose_profile_diff writes nothing…`: its `['add','add']` does not equal the expected `['add','update']`.
  - `ISS-029: the legitimate path…` (`index.test.ts:505`): `'add' !== 'update'`.
  - The fix is to add `active: true` to the open-fact seeds (and change line 108), in the mcp/student-profile unit.
- `mcp/student-profile/tests/fakes.ts:16-18` and `mcp/university-kb/tests/fakes.ts:16-18`: `$exists` handling in the fake query matcher. This is valid for queries and needs no change, but those fakes have no partial-filter validator.

## How to verify (commands + expected)

- `pnpm -r typecheck` → exit 0, all 9 workspaces "Done"
- `pnpm -r test` → `packages/db test: ℹ tests 70 / pass 70 / fail 0`. **Exit 1** because of the 2 out-of-scope `mcp/student-profile` fixture failures listed above. Every other workspace is green.
- `python contracts/verify_contracts.py` → exit 0, PASS by vacuity
- `git diff --stat 1dd38b0..HEAD -- . ':!docs/DECISIONS.md'` → only `packages/db/**` and this manifest (docs/DECISIONS.md changes come only from the `merge main` of D-013); `pnpm-lock.yaml` is untouched

## Actual outputs (maker's own run, cycle 2 + D-013)

```
$ pnpm -r typecheck            (exit 0)
apps/api typecheck: Done
apps/web typecheck: Done
packages/providers typecheck: Done
packages/observability typecheck: Done
packages/schemas typecheck: Done
packages/engine typecheck: Done
packages/db typecheck: Done
mcp/student-profile typecheck: Done
mcp/university-kb typecheck: Done

$ pnpm -r test                 (exit 1: mcp/student-profile, out of scope, see above)
apps/web            ℹ tests 1  pass 1  fail 0
apps/api            ℹ tests 1  pass 1  fail 0
packages/providers  ℹ tests 1  pass 1  fail 0
packages/schemas    ℹ tests 50 pass 50 fail 0
packages/observability ℹ tests 43 pass 43 fail 0
packages/engine     ℹ tests 31 pass 31 fail 0
packages/db         ℹ tests 70 pass 70 fail 0
mcp/university-kb   ℹ tests 9  pass 9  fail 0
mcp/student-profile ℹ tests 11 pass 9  fail 2
  ✖ B3 propose_profile_diff writes nothing: the facts collection is unchanged after the call, read back directly
  ✖ ISS-029: the legitimate path (consented purpose, fact tagged with that purpose) still produces a correct update diff

$ python contracts/verify_contracts.py   (exit 0)
verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity
```

## Remaining risk

- `scripts/db-init.ts` `main()` is still not run by this unit (B8/B12: offline only). The index shape is now checked against the documented operator whitelist by the fake validator, but no live `createIndex` has run. The coordinator's scratch-collection probe was classifier-denied (D-013).
- Legacy pre-D-013 open facts (no `active` field) are treated as history. The production `facts` collection has not been initialised yet (db:init has never run), so none should exist. If any do, a one-off backfill `{validTo: {$exists: false}} → $set {active: true}` is needed before db:init creates the unique index.

## Live browser evidence
Not UI-touching. Only `packages/db/**` and this manifest changed.

---
# Cycle 1 history (kept for the record)

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

## Cycle 1 status (superseded by the header above)
