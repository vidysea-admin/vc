# Manifest: t-016-scribe-persistence

**Contract:** qa/contracts/counselling-engine.md (B3, B12, B14, B15 primary; B8, D-012, D-014, D-015, D-016)
**Goal task:** T-016
**Status:** checked-PASS (cycle 0; reviews: data-engineer Approve x2, senior Approve + Warning → ISS-t-016-rev-1 in T-017)
**Fix cycle:** 0
**Design:** no new ACTIVE decision is written here. Two shape changes ride on existing authority and are
drafted as a recommended D-entry below for the Approver (see "Proposed D-entry").
**Diff range:** `547bf0d..HEAD` on branch `wave/t-016-scribe-persistence`, one commit:
"feat(db,engine): t-016 scribe persistence prerequisites". `547bf0d` is main's tip ("tasks: T-015 done;
T-016 scribe persistence prereqs, T-017 T-015 residuals"), the branch point.
**Scope:** `packages/db/src/{collections,facts,erasure}.ts`, `packages/db/tests/{fakes,facts.test,erasure.test,db-scope.test}.ts`,
`packages/engine/src/scribe/{graph,nodes,schemas,checkpointer}.ts`,
`packages/engine/tests/{scribe-fixtures,scribe-checkpointer.test}.ts`, new `packages/engine/tests/scribe-persistence.test.ts`,
this manifest.
**Not touched:** `.claude/**`, `docs/DECISIONS.md`, `scripts/**`, `qa/contracts/**`, `TASKS.md` (left `open`),
`packages/db/scripts/db-init.ts` (its INDEX_PLAN already mirrored setup(); now proven against the real saver),
`apps/**`, `mcp/**`, `packages/schemas/**`, `packages/providers/**`, `packages/observability/**`.
**Dual check:** no
**Issues addressed:** ISS-t-007-rev-6 (high), ISS-t-007-rev-7 (medium), ISS-t-007-rev-9 (medium),
ISS-t-007-rev-10 (medium), ISS-t-011-rev-5 (low)
**Executor:** claude-opus-subagent (maker build subagent)
**Offline:** every run below is offline (B8). Nothing connected to MONGODB_URL. The "mongo" test variants run the
REAL `MongoDBSaver` class from `@langchain/langgraph-checkpoint-mongodb` over `@vc/db/testing`'s in-process fake,
with every unique index from the production INDEX_PLAN declared.

## What changed

### Test infrastructure: the fake now runs the real MongoDBSaver (`packages/db/tests/fakes.ts`)

The task asked for a MongoDBSaver-faithful probe. The real class turned out to be compatible once the fake
grew the driver behaviour it relies on, so the probes use the real class, not a hand-written imitation:
- a Uint8Array is stored as bson `Binary` (what the driver returns; the saver calls `.value()` on it), and
  copies keep the Binary prototype (`structuredClone` dropped it);
- `find()` returns a cursor with `sort(field, dir)` / `sort({f: d})`, `limit`, `toArray` and async iteration;
- `updateOne` upsert seeds the insert from the filter's equality fields, then `$setOnInsert`, then `$set` /
  `$addToSet`, generates `_id` when none is given, and throws 11000 on a duplicate `_id` or unique key
  (before, it silently overwrote an existing `_id`); an unknown update operator throws;
- `bulkWrite` (ordered `updateOne` upserts: the saver's `putWrites`);
- `$lt/$lte/$gt/$gte` with type bracketing; `$addToSet` (scalar or `$each`);
- inclusion projections are applied (before, the fake ignored them, so a reader that forgot to project a
  field it later used would pass offline and read `undefined` in production; F3 below proves this now bites);
- `createFakeMongoClient()` has `appendMetadata` (the saver's constructor calls it).
All 405 pre-existing tests still pass on the stricter fake.

### ISS-t-011-rev-5 (low) — a session row before the first checkpoint

- `facts.ts` `ensureScribeSessionRow(db, {sessionId, studentId, threadId, endedAt})`: one upsert on
  `{_id: sessionId, studentId}` with `$setOnInsert {sessionId, endedAt}` + `$addToSet {scribeThreadIds: threadId}`.
  Returns `{created}`. A sessionId owned by another student makes the upsert's insert collide on `_id` (11000):
  refused, the other row untouched. Empty ids throw.
- `graph.ts` `startScribe`: after the fence pre-check and before `graph.invoke`, under the same writer deadline
  (`deadline.op()`), so the row exists before the saver's first `put`.
- `graph.ts` `invokeFenceAware`: its compensation now also deletes the session row THIS call created
  (`CreatedByCall.sessionRow`), never a pre-existing one (the erasure purges that).
- `erasure.ts` `resolveSelectors`: thread ids now also come from `sessions.scribeThreadIds` (projected), so
  a run on ANY thread id (not only `scribe:<sessionId>`) that ended without an interrupt (no claim) is
  exported and purged.
- `collections.ts` `SessionDoc`: `consentId` and `startedAt` become optional (the scribe writes the row before
  its consent gate runs); new `scribeThreadIds`, `summary`, `summaryWithheldReason`, `summaryApprovedAt`.

### ISS-t-007-rev-7 (medium) — the approved summary has a durable home

- `facts.ts` `recordApprovedSessionSummary(db, {sessionId, studentId, summary, summaryWithheldReason})`: `$set`
  on `{_id: sessionId, studentId}`, NEVER upsert (a late write can not resurrect a purged row), throws
  `SessionRowMissingError` when nothing matched.
- `nodes.ts` `writeApproved`: on approve/edit only (B3), stores the summary first, then the facts. `schemas.ts`
  `WriteInputSchema` gains `studentId`, `summary`, `summaryWithheldReason`; `graph.ts`'s write node passes them
  from state. A withheld (B1) summary is stored as `""` + the reason; the withheld text never reaches the row.
- Export needed no change: `exportStudent` already returns full `sessions` rows, which now carry the summary.

### ISS-t-007-rev-9 (medium) — no empty-studentId claim

`graph.ts` `resumeUnderDeadline`: the claim branch throws when the state's `studentId` is missing or blank,
BEFORE the claim insert and before any invoke (was `studentId: latest.studentId ?? ""`).

### ISS-t-007-rev-10 (medium) — recovery takes the D-014 claim's run lease

- `collections.ts` `ScribeResolutionDoc.lease?: {token, expiresAt}`.
- The winning resume inserts its claim WITH a lease (`newLease`: expiresAt = its writer deadline +
  FENCE_MARGIN_MS) and releases it (`releaseLease`: CAS on the token) when its invoke settles (`underLease`).
- `resumeScribe(null)` on a claimed thread takes the lease with ONE `findOneAndUpdate({_id, $or: [{lease:
  {$exists: false}}, {"lease.expiresAt": {$lt: now}}]}, {$set: {lease}})`. The loser returns the new outcome
  `{kind: "in_progress"}` without invoking. Under the lease it re-reads the state (`recoverUnder`), and a
  thread with nothing pending is not invoked at all.
- After a writer-deadline timeout (`FencedWriterDeadlineError`) the lease is NOT released: the aborted invoke
  may still settle, so it expires by itself.
- `ScribeOutcome` gains `{kind: "in_progress"}` (only `evals/score.ts` consumes outcomes; it is unaffected).

### ISS-t-007-rev-6 (high) — checkpoint collections governed, setup() really runs

Most of this landed in T-011 (COLLECTION_NAMES, INDEX_PLAN mirroring setup(), erasure/export by thread id). What
was still open and is closed here:
- `checkpointer.ts` `initScribeCheckpointer(client)`: builds the saver and awaits `setup()`. `MongoDBSaver.setup()`
  returns errors instead of throwing, so a non-empty array becomes a thrown `AggregateError`.
- Proven against the REAL saver: `setup()`'s createIndex calls equal the INDEX_PLAN entries (keys, key order, name)
  for both collections; a real scribe run's checkpoints land in `scribe_checkpoints`/`_writes` of the fake db, and a
  FRESH saver + graph on the same db resumes the paused thread (durability, not memory); erasure purges those real
  checkpoint docs to zero (rev-5 tests, "mongo" variants).
- `db-scope.test.ts`: the D-016 allowlist reasons for `facts.ts` and `graph.ts` now name the new writes (no new
  file on the allowlist; the scanner still passes with the exact allowlist).

## TDD: RED before implementation, and falsification for every fix

**RED** (new tests written first, implementation absent; fake extensions already in place):
```
cd packages/db     && npx tsx --test tests/facts.test.ts tests/erasure.test.ts
  ℹ tests 59  ℹ pass 57  ℹ fail 2
  ✖ ISS-t-011-rev-5: checkpoints of a thread recorded on the session row (NOT scribe:<sessionId>) are exported and purged to zero
  ✖ tests\facts.test.ts  (SyntaxError: '../src/facts.js' does not provide an export named 'SessionRowMissingError')
cd packages/engine && npx tsx --test tests/scribe-persistence.test.ts tests/scribe-checkpointer.test.ts
  ℹ tests 20  ℹ pass 1  ℹ fail 19
  (scribe-checkpointer.test.ts: no export 'initScribeCheckpointer'; every rev-5/-7/-9/-10 test failed on its assertion,
   e.g. rev-7 [mongo] "undefined !== <summary>", rev-10 [mongo] "exactly one graph.invoke across both recoveries: 2 !== 1")
```
The rev-10 RED reproduces the issue on the REAL MongoDBSaver: two concurrent recoveries invoked the graph twice. The
one RED pass was "an EXPIRED lease does not block recovery" (expected: without a lease nothing blocks).

**Falsification** (scratchpad `falsify.py`: apply ONE mutation, run the targeted suites, restore the file; the final
state below is the unmutated code):

| # | Mutation | Result (targeted suites) |
|---|---|---|
| F1 | rev-5: `startScribe` skips `ensureScribeSessionRow` | engine 8 pass / **18 fail** (row-before-checkpoint, no-interrupt erasure, summary, recovery tests) |
| F2 | rev-5: erasure ignores `scribeThreadIds` | engine **3 fail** (both no-interrupt runs, the second-thread run); db **1 fail** |
| F3 | rev-5: selector projection drops `scribeThreadIds` | db **1 fail** (only caught because the fake now honours projections) |
| F4 | rev-5: fenced start keeps the row it created | engine **1 fail** (fence-during-start removes the row) |
| F5 | rev-7: summary not recorded | engine **3 fail** (approve memory+mongo, withheld) |
| F6 | rev-9: empty-studentId claim allowed | engine **2 fail** (undefined and "") |
| F7 | rev-10: recovery ignores the lease | engine **6 fail** (concurrent x4, live lease, in-flight winner) |
| F8 | rev-10: winner claims without a lease | engine **1 fail** (recovery racing the in-flight winner) |
| F9 | rev-6: `initScribeCheckpointer` skips `setup()` | engine **2 fail** |
| F10 | rev-6: `setup()` errors swallowed | engine **1 fail** |

## Verification (exact commands, run in the worktree, final state)

```
pnpm -r typecheck                      -> exit 0 (every package)
pnpm -r test                           -> exit 0
  packages/db           tests 162 pass 162 fail 0   (was 157)
  packages/engine       tests 129 pass 129 fail 0   (was 105)
  packages/observability 57/57, packages/schemas 50/50, packages/providers 8/8,
  apps/api 6/6, apps/web 1/1, mcp/student-profile 12/12, mcp/university-kb 9/9
  total 434 / 434 (was 405)
python contracts/verify_contracts.py   -> "no frozen contracts yet (research phase) -- PASS by vacuity", exit 0
```

## Claims → evidence

| Claim | Evidence (test, file) |
|---|---|
| rev-5: the session row (with the thread id) exists before the saver's first `put` | "ISS-t-011-rev-5 [memory] / [mongo]: the session row ... exists BEFORE the first checkpoint" (scribe-persistence.test.ts) — spies `checkpointer.put` |
| rev-5: a run that ends WITHOUT an interrupt (consent refused; crisis escalated) is exported and erased to zero residue, real checkpoints included, on a thread id that is NOT `scribe:<sessionId>` | "[mongo, consent refused]" and "[mongo, crisis escalated]" — export counts equal the real checkpoint docs; residue scan of every collection for studentId, sessionId and thread id = [] |
| rev-5: a second thread for the same session is recorded and erased too | "a second run of the same session on a NEW thread" |
| rev-5 hostile: another student's sessionId is refused (11000), row untouched, no checkpoint | "hostile: a sessionId already owned by ANOTHER student" (engine) + facts.test.ts hostile test |
| rev-5 + D-015: a fence during start removes only the row this call created | the two "+ D-015" tests (created → removed; pre-existing → kept for the purge) |
| rev-5 at the db layer: recorded threads are purged and exported | erasure.test.ts "checkpoints of a thread recorded on the session row" |
| rev-7: approve stores the summary; export carries it; erasure removes it | "ISS-t-007-rev-7 [memory] / [mongo]" |
| rev-7: reject stores no summary (B3); withheld summary stored as "" + reason, never the text (B1) | "reject stores NO summary", "a withheld (script-like) summary" |
| rev-7: the summary write never upserts, never crosses students | facts.test.ts "recordApprovedSessionSummary ... NEVER creates one" |
| rev-9: missing or "" studentId → throw, zero claims, zero invokes, zero facts | "ISS-t-007-rev-9: ... studentId=undefined" and '=""' |
| rev-10: two concurrent recoveries → exactly one `graph.invoke`, the other `in_progress`, no double write | crash-after-claim and crashed-write variants, each on memory AND the real MongoDBSaver |
| rev-10: a recovery racing the in-flight winner → `in_progress`, one invoke | "a recovery while the WINNER's resume is still in flight" |
| rev-10: an expired lease does not block; a live foreign lease blocks and is left untouched | the two lease tests |
| rev-6: `setup()` runs and equals INDEX_PLAN; setup errors fail loudly; the real saver is durable across instances | scribe-checkpointer.test.ts, three ISS-t-007-rev-6 tests |

## What the MongoDBSaver probe proves, and what it can not

Proven offline (real `MongoDBSaver` class, fake db): the saver's exact query/update shapes work against the engine's
collection names; checkpoints and pending writes persist and are read back by a fresh saver; its `setup()` indexes equal
INDEX_PLAN; erasure's `{thread_id: {$in}}` purge and read-back reach every doc the real saver wrote; the lease makes
concurrent recoveries on the real saver invoke once.

Not proven (needs a live server, which B8 forbids in tests):
- real server atomicity/interleaving: the fake runs each single-document op synchronously, so the lease's safety rests
  on MongoDB's documented single-document atomicity of `findOneAndUpdate`, not on an observed race against a server;
- BSON round-trip details the fake does not emulate (e.g. `undefined` → `null` without `ignoreUndefined`, ObjectId `_id`
  types; the fake stores string `_id`s);
- `timeoutMS` enforcement (the fake ignores it), index build behaviour on a populated collection, and write concerns;
- non-unique indexes are recorded, not enforced (query plans are not modelled).

## Residuals (not fixed here)

1. **Unclaimed recovery is not leased.** A thread with no claim yet (a crash before the approval interrupt, e.g.
   mid-extraction) has no D-014 claim doc to lease, so two concurrent `resumeScribe(null)` on it can both invoke.
   Impact: only checkpoints are written (no facts, claims or summary; B3), plus a repeated provider call. Closing it needs
   a lease on a doc that exists from the start (the session row now does), i.e. a new lease home → see Proposed D-entry (b).
2. **A response-resume on a thread with no pending interrupt and no decision** (pre-existing path, `graph.ts` claim
   branch skipped) still invokes without a claim or lease. Unchanged behaviour; same fix as residual 1.
3. **Threads started before T-016 have no session row**, so an approval on one would throw `SessionRowMissingError` in the
   write node (retryable, never silent). No such production threads exist (nothing wrote SessionDoc before, and the engine
   is not live), so no backfill was written.
4. The lease's safety window assumes the holder's in-flight driver ops end within FENCE_MARGIN_MS of its deadline (D-016's
   client `timeoutMS` cap). An operator who raises neither keeps this; a future writer path without the client backstop would
   need its own bound.
5. `recordApprovedSessionSummary` runs inside `graph.invoke` without a per-op `timeoutMS`; it relies on the client-level
   backstop (as the saver's own writes do).

## Proposed D-entry (NOT written; for the Approver)

Recommended for the record; the implemented items are within the T-016 row and the issue ledger's own suggested fixes, so
nothing here is blocked on it. Item (b) is NOT implemented and would need this entry first.

```
## D-0XX | 2026-09-25 | type: decision | status: ACTIVE
**What:** (a) The scribe owns the start of a `sessions` row: startScribe upserts {_id: sessionId, studentId} with
scribeThreadIds ($addToSet) BEFORE the first checkpoint; consentId/startedAt are optional until the session writer (T-008)
fills them; the counsellor-approved summary lives on that row (summary, summaryWithheldReason, summaryApprovedAt), written
only on approval and never by upsert. Erasure/export resolve scribe threads from scribeThreadIds as well as
scribe:<sessionId> and claims. (b) [proposed, not built] Move or extend the ISS-t-007-rev-10 run lease to the session row,
so an unclaimed (pre-approval) recovery is leased too.
**Why:** ISS-t-011-rev-5 (a run ending without an interrupt had no discoverable anchor), ISS-t-007-rev-7 (no durable home for
the approved summary), ISS-t-007-rev-10 (recovery not claimed). The D-014 claim doc now also carries a run lease
(lease.token, lease.expiresAt = writer deadline + FENCE_MARGIN_MS); claims are still never deleted in normal operation.
**Links:** T-016, T-008, ISS-t-007-rev-6/7/9/10, ISS-t-011-rev-5, D-014, D-015, D-016
```

## Open questions for the checker

- Is `in_progress` the right public outcome name for T-008 (the approval UI shows "a recovery is already running")?
- Should `resumeScribe(null)` on a thread with nothing pending keep returning the current outcome without invoking (new,
  tested implicitly by every old recovery test still passing), or should it be an explicit `done`-only contract?
