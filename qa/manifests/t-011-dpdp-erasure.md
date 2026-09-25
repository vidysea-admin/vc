# Manifest: t-011-dpdp-erasure
**Contract:** qa/contracts/counselling-engine.md (B15 primary; B4, B8, B11, B12, B14)
**Goal task:** T-011
**Date:** 2026-09-25
**Status:** fix-in-progress
**Fix cycle:** 3 of max 3 (cycle-2 checker FAIL 57a92aa: ISS-t-011-c2-1 grace-0; D-016)
**Fix cycle budget:** 2 of max 3 (cycle-1 checker FAIL 4b6ad21: ISS-t-011-c1-1 non-atomic read-back; design D-015 fence + post-write compensation)
**Design:** qa/gates/dpdp-erase-design.md answer (a) "hard delete with confirmation and verification"; D-003 (history by retirement, so erasure must include retired facts), D-012 (fact `_id` is a fresh ObjectId, so edges are found through the resolved fact ids), D-013 (`active: true` marks open facts; retired facts have it unset), D-014 (scribe_resolutions hold approved fact values, so they are erased)
**Diff range (cycle 2):** `58a38f6..HEAD` on branch `wave/t-011-dpdp-erasure`, a single commit: "fix(db,engine): t-011 cycle 2 — erasure fence + post-write compensation (D-015)". `58a38f6` is "qa: t-011 fix cycle 2 (D-015)", after the main merge `5a9a2a3` (which brought D-015). Cycle 2 touches `packages/db/src/{erasure,facts,consent,collections}.ts`, `packages/db/scripts/db-init.ts`, `packages/db/tests/{erasure,consent,db-init}.test.ts`, `packages/db/tests/fakes.ts`, `packages/db/README.md`, `packages/schemas/src/schemas.ts` (additive: `MAX_CARRIED_IDS`, `ErasureCarriedSelectorsSchema`), `packages/engine/src/scribe/graph.ts`, `packages/engine/tests/{scribe-erasure-fence.test.ts (new), scribe-fixtures.ts}` and this manifest. `packages/engine/src/scribe/nodes.ts` is NOT touched (T-013 owns it).
**Diff range (cycle 1):** `1d7facb..58a38f6` on branch `wave/t-011-dpdp-erasure`, a single commit: "fix(db): t-011 cycle 1 — stable-loop purge (no orphan edges under concurrent writers), checked final CAS". `1d7facb` is "qa: t-011 fix cycle 1", after the main merge `b5e6b55`. Cycle 1 touches `packages/db/src/erasure.ts`, `packages/db/tests/{erasure.test.ts, fakes.ts}`, `packages/db/README.md`, `packages/schemas/src/schemas.ts` (additive: optional `ErasureReceipt.rounds`) and this manifest.
**Diff range (cycle 0):** `e10e49d..HEAD` on branch `wave/t-011-dpdp-erasure`. It is a single commit: "feat(db): T-011 DPDP erasure (confirm → hard delete → read-back verify → receipt) + export". `e10e49d` is "tasks: T-007 done; T-008 prerequisites", the main branch point.
**Scope:** `packages/db/src/erasure.ts` (new, the unit's module), `packages/db/src/{collections,consent,index}.ts`, `packages/db/scripts/db-init.ts` (INDEX_PLAN), `packages/db/tests/{erasure.test.ts (new), consent.test.ts, db-init.test.ts, fakes.ts}`, `packages/db/README.md`, `packages/schemas/src/schemas.ts` (additive: the Erasure* schemas), this manifest.
**Not touched:** `.claude/**`, `docs/DECISIONS.md`, `scripts/**`, `guards/**`, `qa/contracts/**`, and `packages/engine/**` except (cycle 2 only) `src/scribe/graph.ts` and `tests/**`.
**Dual check:** no
**Issues addressed:** cycle 2: ISS-t-011-c1-1 (high), ISS-t-011-c1-rev-1 (high), ISS-t-011-c1-rev-2 (medium), ISS-t-011-c1-rev-3 (low). Cycle 1: ISS-t-011-c0-1 (medium), ISS-t-011-rev-1 (low), ISS-t-011-rev-3 (high). Cycle 0: ISS-t-011-pre-1 (medium), ISS-t-007-rev-6 (high; the erasure half plus the INDEX_PLAN half: the checkpoint collections are now named and indexed; `saver.setup()` wiring stays with the first live-wiring unit), ISS-043 (low)
**Executor:** claude-opus-subagent (maker build subagent)

## What changed

- **`src/erasure.ts`** (new):
  - `requestErasure(db, {studentId, requestedBy, reason})` creates a `pending` row in `erasure_requests`. `reason` is a closed code (`ErasureReasonSchema`), never free text. `requestedBy` must be a non-empty staff actor id and must not be the student's id.
  - `confirmErasure(db, {requestId, confirmedBy})` refuses self-confirmation. The comparison ignores case and surrounding whitespace, and the confirmer can not be the student either. The update is a CAS on `status: "pending"` and records `confirmedBy` and `confirmedAt`.
  - `executeErasure(db, requestId)`:
    - It refuses a pending request before it reads any student collection.
    - It resolves the selectors once: fact ids (active and retired), session ids, and thread ids from both `scribe:<sessionId>` and the student's `scribe_resolutions.threadId`.
    - **Phase 1** runs `deleteMany` on consents (first, which blocks processing for the rest of the erasure), decisions, edges (seven kind-qualified clauses: student in either direction, fact in either direction, `profile_fact` → fact, session in either direction), `scribe_checkpoints` and `scribe_checkpoint_writes` (both by `thread_id $in`).
    - **Phase 2** covers the anchor collections: facts, sessions, scribe_resolutions and students. It runs only if every phase-1 step succeeded. Otherwise each anchor is `deferred`, so a retry can still resolve the edge and checkpoint selectors.
    - **Verification** runs `countDocuments` with the same pre-purge selectors on every collection in the plan.
    - The receipt (`ErasureReceiptSchema`, strict) holds requestId, attempt, verified, totalRemaining, per-collection `{outcome, deleted, remaining, error?}`, startedAt and verifiedAt. The error is recorded as its name or code only.
    - If the run verifies, the row becomes `completed`, the receipt is stored and `studentId` is `$unset`. Otherwise the row becomes `failed`, keeps `studentId` so it can be retried, and the call throws `ErasureIncompleteError(receipt)`.
    - Calling it on a completed request returns the stored receipt with `alreadyCompleted: true`.
  - `exportStudent(db, studentId)` returns a read-only bundle: `format`, `purpose: "data_subject_access"`, the student, facts (full history, sorted), sessions, decisions, consents, edges (the same edge selector as the erasure), approvalClaims, and checkpoint counts plus thread ids. The bundle is not filtered by purposeTags, because the student is entitled to all of their own data. Only the caller may release it to the authenticated student or guardian (documented on the type).
  - `ERASURE_PLAN` holds the plan as data. `ERASURE_EXEMPT_COLLECTIONS` lists universities, courses and erasure_requests, each with a reason.
  - `erasureRequestMatchesStudent` checks a row against a studentId. `scribeCheckpointThreadId` builds a thread id.
- **Audit-row PII design.** The row survives erasure, so its contents were chosen deliberately:
  - `studentHash = sha256("vc-erasure-v1|" + perRequestSalt + "|" + studentId)` and `hashSalt` identify the student without storing the id.
  - It also holds the staff actor ids, the reason code, the timestamps, the attempts and the receipt.
  - The clear `studentId` exists only while the request is open, and the student's data still exists at that point anyway.
  - Residual risk: a dictionary check works against enumerable ids. The option to close it is an HMAC keyed from `.env`, listed in the open questions below.
- **`collections.ts`**: `COLLECTION_NAMES` gains `scribe_checkpoints`, `scribe_checkpoint_writes` and `erasure_requests`.
- **`db-init.ts` INDEX_PLAN** adds these indexes:
  - `scribe_checkpoints.thread_ns_checkpoint_idx {thread_id:1, checkpoint_ns:1, checkpoint_id:-1}` and `scribe_checkpoint_writes.thread_ns_checkpoint_task_idx {thread_id, checkpoint_ns, checkpoint_id, task_id, idx}`. Their keys and names match `MongoDBSaver.setup()` exactly (checked in `@langchain/langgraph-checkpoint-mongodb/dist/checkpoint.js`), so a later `setup()` is a no-op. They lead with `thread_id`, so the erasure's `thread_id $in` is served by the index.
  - `erasure_requests_studentId` and `erasure_requests_status {status, requestedAt}`, with no unique index.
- **`consent.ts`** (ISS-043): the three refusals now share one message, `CONSENT_REQUIRED_MESSAGE`. It names neither the student nor the purpose and does not reveal minor status. `ConsentRequiredError` takes no arguments.
- **`fakes.ts`** (test only): adds `deleteMany`, `countDocuments`, dotted paths, `$in`, `$eq`, and top-level `$or`/`$and`. Any other operator now **throws** instead of silently matching.
- **`@vc/schemas`** (additive): `ErasureReasonSchema`, `ErasureStatusSchema`, `ErasureCollectionLineSchema` and `ErasureReceiptSchema`.

## TDD: RED before implementation

The tests were written before `src/erasure.ts` and the other src changes existed (full output: the maker's scratchpad `t011/red.txt`). `pnpm --filter @vc/db test` gave `tests 77 | pass 72 | fail 5`:
- `tests\erasure.test.ts`: `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '...packages\db\src\erasure.js'`
- ✖ ISS-043: every refusal carries ONE generic message…
- ✖ ISS-027: every studentId-bearing collection has a plain … index led by studentId (erasure_requests missing)
- ✖ T-011: the scribe checkpoint collections carry EXACTLY the indexes MongoDBSaver.setup() creates…
- ✖ T-011: the erasure_requests audit log has a status index and no unique index

## Verification (exact commands, run in the worktree)

```
$ pnpm install                    -> exit 0 ("Done in 549ms using pnpm v10.33.0")
$ pnpm -r typecheck               -> exit 0 (apps/api, apps/web, providers, observability, schemas, db, mcp/student-profile, mcp/university-kb, engine: Done)
$ pnpm -r test                    -> exit 0
    apps/web 1/1 · apps/api 1/1 · providers 8/8 · schemas 50/50 · observability 57/57
    db 94/94 · mcp/student-profile 12/12 · mcp/university-kb 9/9 · engine 67/67   (total 299, 0 fail)
$ python contracts/verify_contracts.py
    verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity   (exit 0)
```

## Claims → evidence

Every test below is in `packages/db/tests/erasure.test.ts` unless noted otherwise. The fixture seeds **two** students through the real `applyApprovedDiff`, which produces real edges and one retired fact each. Every production unique index from INDEX_PLAN is declared on the fake. The "nothing left" checks do not reuse the implementation's selectors. They JSON-scan every document in every fake collection for the student's id, session ids, fact ids, thread ids, and a marker planted in every free-text value.

| Criterion | Claim | Evidence | Status |
|---|---|---|---|
| B15 confirm | An unconfirmed request deletes nothing. | "an unconfirmed request deletes NOTHING (every collection byte-identical)": `ErasureNotConfirmedError`, the full snapshot is equal before and after, and the row stays `pending`. | VERIFIED |
| B15 confirm | A self-confirm is refused. | "a self-confirm is refused (incl. case/whitespace variants)…": `counsellor-7`, ` Counsellor-7 ` and `COUNSELLOR-7` are all refused, `confirmedBy` stays unset, execute is still refused and the snapshot is unchanged. | VERIFIED |
| B15 audit | The requester, confirmer and times are recorded, and a double confirm is refused. | "confirm records requester, confirmer and times…": `ErasureStateError` on the second confirm. | VERIFIED |
| B15 audit | No free-text reason, the student is never an actor, and blank or unknown ids are refused. | "request validation — …" | VERIFIED |
| B15 purge | The purge leaves zero documents for the student in every collection, including retired facts, edges, claims, checkpoints and checkpoint writes. | "the full purge leaves ZERO documents…": the fixture has more than 20 hits before and `[]` after. The fixture test proves a retired fact, edges, claims, checkpoints and writes all exist first. Every receipt line is `purged` with `remaining 0`. | VERIFIED |
| B15 verify | The receipt counts are real read-backs. | "the receipt counts match…": facts 3 (2 active + 1 retired), sessions 2, consents 1, decisions 1, students 1, scribe_resolutions 2, scribe_checkpoints 4, scribe_checkpoint_writes 4, edges 6. | VERIFIED |
| B15 verify | The read-back is a real pass and not an echo of deleteMany. | "the verification pass catches a delete that reports success but leaves documents": a stubbed `deleteMany` returns `deletedCount 0` and deletes nothing. The line reads `purged` with `remaining 4`, the receipt has `verified:false`, the call throws and the row becomes `failed`. | VERIFIED |
| B15 isolation | Another student's data is untouched. | "ANOTHER student's data is untouched, byte for byte": every B document is JSON-equal before and after. Also "an unrelated global edge (kb_record → kb_record) survives". | VERIFIED |
| B15 receipt | The receipt and the surviving audit row carry no personal data. | "the receipt and the surviving audit row carry NO personal data…": both are searched for every identifier. The row has `studentId === undefined`, `erasureRequestMatchesStudent` returns true for A and false for B, and `ErasureReceiptSchema.parse` passes. Also "the audit hash is salted per request". | VERIFIED |
| B15 partial failure | A failure is reported and not swallowed, anchors are deferred, and the retry completes idempotently. | "a deleteMany failure on edges is REPORTED…": edges fails, the four other phase-1 collections are purged, and the four anchors are `deferred` with `remaining > 0`. The receipt does not echo the driver message, which contained the studentId. The row is `failed` with attempts 1. The retry reaches `completed` with attempt 2, A is scanned to zero and B is intact. A third call returns `alreadyCompleted` with the identical receipt. | VERIFIED |
| B15 partial failure | An anchor failure is also reported and retryable. | "a failure on an anchor collection (sessions)…": `failed` with `remaining 2`, and the retry completes to zero. | VERIFIED |
| B15 coverage | No engine collection is missed, and a future cards/feedback collection fails the test until it is planned. | "every COLLECTION_NAMES entry is in ERASURE_PLAN or explicitly exempt with a reason". No cards or feedback collection exists in COLLECTION_NAMES yet. | VERIFIED |
| ISS-t-011-pre-1 / ISS-t-007-rev-6 | The checkpoint names and thread-id format match the engine. | "drift guard": the test reads `packages/engine/src/scribe/checkpointer.ts` and `graph.ts` source. | VERIFIED |
| B15 export | The export holds everything for A and nothing for B. | "B15 export: the bundle holds all of A's facts (with history)…": exact fact-id set (3, of which 1 retired), sessions, 1 decision, 1 consent, 6 edges, 2 claims, checkpoint counts 4 and 4, zero B identifiers in the JSON, and the export writes nothing (snapshot equal). Also "an unknown student yields an empty bundle". | VERIFIED |
| INDEX_PLAN | Every studentId-bearing collection keeps a plain studentId index, the checkpoint indexes mirror `setup()`, and the audit log has a status index and no unique index. | `tests/db-init.test.ts`: the ISS-027 test (now including erasure_requests) and two T-011 tests. The existing D-013 partial-filter validator test still passes over the whole plan. | VERIFIED |
| ISS-043 | There is one generic consent message, with no minor, guardian or purpose leak. | `tests/consent.test.ts` "ISS-043: every refusal carries ONE generic message…". The 5 existing B4 tests stay green, and the mcp/student-profile regex `/ConsentRequiredError\|no valid recorded consent/` still matches (12/12). | VERIFIED |
| B8 / B12 | Tests are offline. No `client.db(`, no `dropDatabase`, no collection drop. | The whole suite uses `createFakeDb`, and the `db-scope.test.ts` B12 scanner passes. `erasure.ts` uses only `deleteMany`, `countDocuments` and `find` inside `virtual_counsellor`. | VERIFIED |
| Live DB | The erasure and export run against the real `virtual_counsellor` on the production server, the INDEX_PLAN additions are created, and `$or` + `$in` behave as they do in the fake. | Not run (B8: automated tests never connect; live CRUD needs an explicit script run). | **UNVERIFIED** |
| Live checkpoints | Real MongoDBSaver documents carry `thread_id` equal to `scribe:<sessionId>`. | The field name was checked in the library source (`checkpoint.js` writes and `deleteThread` use `thread_id`). No real saver run was made. | **UNVERIFIED** |
| Concurrency | (cycle 0 claim; superseded by the "Fix cycle 1" section below) | Cycle 1 adds dedicated concurrent-writer and concurrent-execute tests. | see Fix cycle 1 |
| Transcripts | Raw transcript and audio collections are erased. | No such collections exist yet. Transcripts live only inside the scribe checkpoints, which are erased. The coverage test forces any new collection into the plan. | **N/A yet** |

## Fix cycle 2 (D-015: ISS-t-011-c1-1, ISS-t-011-c1-rev-1; lows ISS-t-011-c1-rev-2, ISS-t-011-c1-rev-3)

### What changed
- **The fence (`src/erasure.ts`, section "The erasure fence").**
  - It is a new `erasure_fences` collection, with one doc per fenced student: `{_id = studentKey, studentKey, requestId, createdAt, releaseAfter?}`.
  - It is in `COLLECTION_NAMES` and in INDEX_PLAN (`erasure_fences_studentKey_unique`, UNIQUE, non-partial). It is also in `ERASURE_EXEMPT_COLLECTIONS`, with the reason that it must outlive the purge it protects and holds only a hash.
  - **Key decision:** the fence stores NO clear studentId. `studentKey = sha256("vc-erasure-fence-v1|" + studentId)` is unsalted on purpose, because every writer must compute the lookup key from the studentId it already holds. The residual (a dictionary check against candidate ids) is the same as the audit row's hash, and gate erasure-fencing Q2 (HMAC) covers both.
  - **Order:** `confirmErasure` sets the fence BEFORE its confirm CAS, so no confirmed request is ever unfenced. If the CAS then loses, the only way out of `pending` is a concurrent confirm, so the fence is still right.
  - `executeErasure` re-sets the fence (an idempotent upsert that also takes it over for this request and clears a stale `releaseAfter`) BEFORE the first `resolveSelectors`.
  - The fence is released only AFTER the completion CAS succeeds, and also on the CAS-miss → already-completed path, so a concurrent run can not leave it lingering. With the grace period at 0 it is deleted, only when `requestId` matches. Otherwise it is stamped `releaseAfter`.
  - The release is best effort: a failure leaves the fence, which fails safe because writes stay refused. `releaseExpiredErasureFences(db, now, graceMs)` sweeps expired fences and fences orphaned by a crash after completion.
  - `ERASURE_FENCE_GRACE_MS = 0` is documented as the place where gate erasure-fencing Q1's re-enrolment policy goes.
  - A failed request keeps its fence until its retry completes.
- **The writer API** consists of `isStudentFenced`, `assertStudentNotFenced` (the pre-check) and `compensateIfFenced(db, studentId, undo)` (the post-check). If the post-check finds the student fenced, it runs `undo` and then throws `StudentFencedError`. An error from `undo` is never masked.
- **`applyApprovedDiff` (`src/facts.ts`)** now does three things:
  - It runs the pre-check before any write.
  - It tracks the fact ids it INSERTED and the edge ids it LINKED (`deriveEdgeId`).
  - After ALL its writes, and also after a partial failure, it runs `compensateIfFenced`. If fenced, it deletes those facts (`{studentId, _id $in}`) and edges (`{_id $in}`) and throws `StudentFencedError`.
  - `writeApproved` (nodes.ts, untouched) inherits this, because it rethrows a non-conflict error.
- **`requireConsent`** refuses while the student is fenced, with the same generic `ConsentRequiredError` (ISS-043: nothing reveals that an erasure is running).
- **`startScribe` / `resumeScribe` (`packages/engine/src/scribe/graph.ts`)** return a new outcome kind, `{kind: "fenced"}`:
  - `startScribe` pre-checks the student and refuses before any node runs.
  - `resumeScribe` pre-checks the thread's `studentId` from state BEFORE claiming, on both the response path and the `null` recovery path.
  - `invokeFenceAware` wraps every invoke. After it (or when the invoke threw `StudentFencedError`), if the student is fenced it calls `checkpointer.deleteThread(threadId)` and deletes the claim THIS call inserted (by `_id` and `responseHash`), then returns `fenced`.
  - The compiled graph's `WeakMap` now holds `{db, checkpointer}`. `startScribe` now also fails closed for a graph not built by `compileScribeGraph`, as `resumeScribe` already did.
- **Why this closes ISS-t-011-c1-1 and -rev-1.** Take any fence-aware writer W, whose post-check follows all of its writes:
  - If W's post-check runs while the fence exists, W removes its own writes.
  - If W's post-check ran before the fence, every write of W landed before the purge's first resolve, so the purge deletes it.
  - Either way, a write that lands between two read-back counts, or between the last count and the CAS, is removed.
- **Lows.**
  - rev-2: `MAX_CARRIED_IDS = 20_000` per list, with `ErasureCarriedSelectorsSchema` (zod, strict) in @vc/schemas. The carried ids are validated on read, and a corrupt row gives `ErasureStateError` before anything is touched. A round whose merged ids would exceed the cap deletes nothing more, keeps the within-cap ids, and ends `failed` with the distinct label `selectors:over_cap` on the line for that list. A concurrent run's carry is merged only if it is valid and stays within the cap.
  - rev-3: on CAS exhaustion, the attempt is recorded anyway (`failed`, attempts+1, an unverified receipt, carried ids, studentId and the fence kept) and the call throws `ErasureStateError`. `resolveSelectors` failures carry the failing collection, so the round-2+ label is accurate (for example `sessions: resolve:MongoNetworkError`, which also covers the senior's round-2 resolve-failure label). An INDEX_PLAN note records why `sessions` has no `sessionId` index: every erasure query on sessions carries studentId.
- **Test support:** the fake `updateOne` now honours `$unset`. The scribe harness exposes `db`/`fakeDb` (an additive change).

### TDD: RED before the implementation
The tests were written first, against skeleton exports (right names, no behaviour), so each test failed on its own. Raw output is in the maker scratchpad `t011c2/red-db.txt` and `red-engine.txt`.
- `npx tsx --test tests/erasure.test.ts tests/consent.test.ts tests/db-init.test.ts`: **tests 60, pass 42, fail 18**. All 18 new db tests were red. One example: the rev-3 resolve label was `undefined` instead of `'resolve:MongoNetworkError'`.
- `npx tsx --test tests/scribe-erasure-fence.test.ts`: **tests 5, pass 1, fail 4**. The resume race returned `{kind:'done', result:{status:'written'}}` instead of `{kind:'fenced'}`. The one pass is the isolation guard (another student's scribe runs normally), which is green by design.

### New tests (outcome-based: a full scan of every fake collection, plus the MemorySaver itself)
| Test | What it proves |
|---|---|
| H4 (the checker's fact + edge probe) | The REAL `applyApprovedDiff` starts before confirm and is paused after its pre-check. It is released inside `students.countDocuments`, the LAST read-back, after the real count. Its fact and 2 edges really exist mid read-back (3 docs observed). Its post-check compensates and it gets `StudentFencedError`. The erasure ends `verified`, with a zero full-scan residue, no orphan fact edge, and B untouched. |
| H4 variant | A writer that STARTS inside the same hook, after confirm, is refused by its pre-check. The residue is zero. |
| H4b (the checker's session + checkpoint + edge probe) | A fence-aware writer (pre-check → a session row, checkpoint, checkpoint write and session edge → `compensateIfFenced`) is released inside `scribe_resolutions.countDocuments`. It is fenced, and the residue is zero, including the late session and thread ids. |
| H4b with the REAL scribe (engine) | `resumeScribe` is paused inside `applyApprovedDiff`, after it has claimed. It is released inside `scribe_resolutions.countDocuments` of a real `executeErasure`. Its writes landed mid read-back. The outcome is `{kind:'fenced'}`, the erasure is `verified`, the residue across every collection is zero, the MemorySaver holds nothing for the thread, and the fence is released. |
| before confirm → after confirm | A writer paused across the confirm removes its own fact and edges, and the erasure then completes clean. |
| starts after confirm | It is refused, and every collection is byte-identical. |
| racing the completion CAS (rev-1) | The writer is released inside the `completed` CAS. It is fenced, and the residue is zero. |
| another student | B writes while A is fenced, and B's fact and both its edges survive A's erasure. On the engine side, B's scribe start and resume write normally. |
| fence lifecycle | Confirm sets the fence with no clear studentId, and a pending request sets none. The fence is present during the purge and removed on completion, and re-enrolment works with a grace of 0. A failed attempt keeps it. Execute re-creates a missing fence before the first resolve. Two concurrent executes leave no fence. A grace period makes it linger, then the sweep releases it. A failed release does not fail a verified erasure, and the sweep clears it. |
| requireConsent | It refuses while fenced, with the same generic message, and another student is unaffected. |
| engine pre-checks | A fenced `startScribe` gives `fenced` with 0 provider calls and no checkpoint. A fenced `resumeScribe` gives `fenced` with 0 claim inserts attempted and the thread left as it was. A fence that appears mid-`startScribe` gives `fenced` and the thread is deleted. |
| rev-2 / rev-3 | These cover the over-cap label and parse, the zod refusal of a corrupt carry, CAS exhaustion being recorded, and the resolve failure labelled `sessions`. |
| db-init | `erasure_fences` has exactly one UNIQUE non-partial `{studentKey:1}` index. |

The cycle-1 test "rev-3: a fact … written at the START of phase 2" injected through the real `applyApprovedDiff`, which the fence now refuses by design. The test targets the round loop, so it now lifts the fence around its two late writes (modelling a writer that does not check the fence) and restores it. Its assertions are unchanged.

### Verification (exact commands, run from the worktree root, final tree)
```
pnpm install                          -> exit 0, "Done in 537ms using pnpm v10.33.0"
pnpm -r typecheck                     -> exit 0; 9 "typecheck: Done", 0 "error TS"
pnpm -r test                          -> exit 0; every package fail 0:
  apps/web 1 · apps/api 1 · packages/providers 8 · packages/schemas 50 · packages/observability 57
  packages/db 119 (was 99; +20) · mcp/university-kb 9 · mcp/student-profile 12 · packages/engine 102 (was 97; +5)
  total 359 tests, 0 fail
python contracts/verify_contracts.py  -> "verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity", exit 0
```

### Falsification (mutate → red → restore; each file restored from a backup and confirmed byte-identical with filecmp)
The runs used db `tests/{erasure,consent,facts}.test.ts` (85 tests) and engine `tests/{scribe-erasure-fence,scribe}.test.ts` (37 tests). Script and output: the maker scratchpad `t011c2/falsify.py` and `falsify.txt`.

| # | Mutation | db | engine | Red tests |
|---|---|---|---|---|
| C2-F1 | Remove the writer's post-check (`if (false) await compensateIfFenced(...)` in applyApprovedDiff). | fail 3 / 85 | fail 1 / 37 | H4 fact probe, before→after confirm, the completion-CAS race; engine H4b with the real scribe |
| C2-F2 | Remove the fence insert (`setErasureFence` returns before its upsert, in both confirm and execute). | fail 14 / 85 | fail 4 / 37 | every fence test: H4, H4 variant, H4b, CAS race, after-confirm refusal, lifecycle, grace, re-create, requireConsent, CAS-exhaustion fence; engine: all 4 fence tests |
| C2-F3 | Remove the pre-check in `resumeScribe` (response path). | fail 0 / 85 | fail 1 / 37 | "resumeScribe for a FENCED student is refused BEFORE claiming" (a claim insert was attempted; the post-check alone still ends `fenced`, which the test tells apart) |

### Residuals (not blocking; they belong to gate erasure-fencing)
- **Grace 0:** a writer whose writes landed before completion, but whose post-check runs AFTER the fence is released, keeps its writes. A grace period longer than the slowest writer closes this. That is Q1, and its recommendation is 24h.
- **Coverage:** the fence binds only fence-aware writers. Today these are applyApprovedDiff, requireConsent, startScribe and resumeScribe. No code writes `sessions` or `students` rows yet. Any new student-data writer must use `assertStudentNotFenced` and `compensateIfFenced`, as the README and the module doc now say. A raw write that does not check the fence (the checker's original raw-seed H4) still hits the non-atomic read-back.
- **Fence key:** an unsalted hash. See Q2 (HMAC).
- **Live DB:** the fence upsert (`$set` + `$setOnInsert` + `$unset`), `deleteThread` against a real MongoDBSaver, and the `status $in` fallback update run only against the fake and MemorySaver. This is the same UNVERIFIED live row as before.

## Fix cycle 1 (ISS-t-011-rev-3, ISS-t-011-c0-1, ISS-t-011-rev-1)

### What changed
- **Stable-loop purge (rev-3)** is in `src/erasure.ts` `executeErasure` and `ERASURE_PLAN`:
  - Each `ErasureStep` now has a delete `filter` and a read-back `residue`.
  - Anchors are deleted **by the ids resolved in that round**:
    - facts use `{studentId, _id: {$in: factIds}}`;
    - sessions use `{studentId, $or: [_id|sessionId $in sessionIds]}`;
    - scribe_resolutions use `{studentId, threadId: {$in: threadIds}}`.
  - Anchors are read back **broadly**, by studentId.
  - Each round does resolve → merge with every id seen so far → phase 1 → phase 2 → read-back. The loop stops at the first clean read-back or at any failure, and never runs more than `ERASURE_MAX_ROUNDS = 5` rounds. A late fact, session or claim therefore survives the round it arrived in, together with its dependents, and the next round resolves it.
  - Ids accumulate across rounds, so an edge or checkpoint written *after* its anchor was deleted is still found.
  - An unclean attempt stores the accumulated ids on the failed row as `carriedSelectors`. The retry merges them in, because a deleted anchor can not be re-resolved. `carriedSelectors` is `$unset` on completion, together with `studentId`.
  - A resolve error in a round after the first is recorded as `facts: resolve:<label>`, and the attempt ends failed, so the carried ids are kept.
  - The receipt gains an optional `rounds` field. This is additive; old receipts still parse.
- **Checked final CAS (c0-1 / rev-1).**
  - The CAS filter is `{_id, status, attempts}`. It uses a snapshot taken at the initial read, and its result is checked.
  - If the CAS misses and a concurrent run has completed the request, the call returns that run's **stored** receipt with `alreadyCompleted: true` and records nothing.
  - If the CAS misses and a concurrent run has recorded a failure, this run is recorded as the next attempt against the fresh row, and any carried ids are merged in. The number of re-tries is bounded.
  - The documented meaning of `attempts` is now "recorded attempts".
- **Fake fidelity** (`tests/fakes.ts`): `findOne` now returns a copy, as the real driver does. Returning the stored object had let a caller's snapshot change under a concurrent writer.

### TDD: RED before the fix
5 new tests were added to `tests/erasure.test.ts` first. They were run against the cycle-0 `erasure.ts` with `npx tsx --test tests/erasure.test.ts`: **tests 23, pass 18, fail 5**. All 5 new tests were red:
- rev-3 fact: the orphan was `fact:<id>->sourced_from->session:stu-A-sess-1`;
- rev-3 session: the late session's checkpoints, checkpoint writes and edge were orphaned;
- rev-3 bound: the retry completed with an orphan;
- c0-1 concurrent success: `alreadyCompleted` was `[false,false]` and the receipts differed;
- c0-1 concurrent failure: attempts were `[1,1]`.

This was re-confirmed after the fix by swapping in `git show HEAD:packages/db/src/erasure.ts`: **fail 5 / 23**, the same 5 tests.

### New tests (outcome-proven: full scans of every collection, not the implementation's selectors)
| Test | What it proves |
|---|---|
| rev-3 fact | The write is injected at the START of phase 2, which is the first `facts.deleteMany`. It goes through the **real `applyApprovedDiff`** and writes 2 facts. One cites a known session. The other cites `sess-unrecorded`, which has no session row, so only its fact id can find its `sourced_from` edge. The run must complete, possibly after retries, and every unverified attempt must leave the row `failed`. At the end, `orphanFactEdges` (any edge referencing a fact id that is not in `facts`) is `[]`, the full scan for A's ids and the late fact ids is `[]`, and B is untouched. |
| rev-3 session | A session row, a checkpoint, a checkpoint write and a session edge are inserted at the start of phase 2. At the end, the full scan (including the late session and thread ids) is `[]`, there are no orphan fact edges and B is untouched. |
| rev-3 bound + carry | A writer adds a late edge for an **already deleted** fact on every facts delete, so the run never stabilises. The run throws `ErasureIncompleteError` with `verified:false` and `totalRemaining>0`. The writer ran between 2 and 10 times, which shows the loop is bounded. The row is `failed` and still holds its studentId. Once the writer stops, the retry completes with no orphan edge and a clean full scan, and the completed audit row leaks none of A's ids. |
| c0-1 concurrent success | Two `executeErasure` calls on one confirmed request, run with `Promise.all`. Both receipts deep-equal the stored `row.receipt`. `alreadyCompleted` is `[false,true]`, `row.attempts === 1`, A is clean and B is untouched. |
| c0-1 concurrent failure | Two concurrent failing runs (checkpoint delete stubbed to a no-op). Both throw. Their attempts are `[1,2]`, `row.attempts === 2`, and the stored receipt is attempt 2. |

### Verification (exact commands, worktree root, after the fix)
```
pnpm install                  -> exit 0, "Done in 531ms using pnpm v10.33.0"
pnpm -r typecheck             -> exit 0; 9 "typecheck: Done", 0 "error TS"
pnpm -r test                  -> exit 0; every package fail 0:
  apps/web 1 · apps/api 1 · packages/providers 8 · packages/schemas 50 · packages/observability 57
  packages/db 99 (was 94; +5 cycle-1 tests) · mcp/university-kb 9 · mcp/student-profile 12 · packages/engine 67
  total 304 tests, 0 fail
python contracts/verify_contracts.py -> "verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity", exit 0
```

### Falsification (revert one fix → red → restore; `npx tsx --test tests/erasure.test.ts`, 23 tests)
The file was restored from a backup each time, and `cmp` confirmed it was byte-identical.

| # | Fix reverted | Result | Red tests |
|---|---|---|---|
| C1-F1 | Anchors deleted by studentId again (facts and sessions `filter: byStudent`). | fail 2 / 23 | rev-3 fact, rev-3 session |
| C1-F2 | No loop (`ERASURE_MAX_ROUNDS = 1`). | fail 1 / 23 | rev-3 bound + carry (the writer ran 1 time, not ≥2) |
| C1-F3 | `carriedSelectors` not merged into the retry. | fail 1 / 23 | rev-3 bound + carry (the retry completed with an orphan edge) |
| C1-F4 | Unchecked CAS (`if (updated \|\| true)`). | fail 2 / 23 | both c0-1 tests |
| C1-F5 | Fake `findOne` returns the stored object by reference (fake fidelity). | 99/99 green | Not load-bearing now, because production snapshots the CAS keys at the read. With the snapshot taken late, this mutation made c0-1 red, and that is why the snapshot was moved. |
| cycle-0 file | The whole cycle-0 `erasure.ts`. | fail 5 / 23 | all 5 new tests |

The cycle-0 falsification table below (F1–F7) still applies: all 18 original tests are unchanged and green.

### Residual (not blocking)
- A write that lands **after** a verified completion (for example, a resumed scribe thread) is outside any erasure. This is follow-up #3 below.
- A writer faster than 5 rounds leaves the request `failed` and retryable, never `completed`. That outcome is proven by the bound test.
- Live DB: the new `$or`, `$in` and `_id $in <hex strings>` filters are exercised only in the fake. This is the same UNVERIFIED live row as cycle 0.

## Falsification (mutate → red → restore) — cycle 0

Each mutation was applied to `src/erasure.ts`, then `npx tsx --test tests/erasure.test.ts` was run (18 tests), and the file was restored from a backup. `diff -q` confirmed the restore.

| # | Mutation | Result | Red tests |
|---|---|---|---|
| F1 | Remove the confirm gate (pending may execute). | fail 2 / 18 | "an unconfirmed request deletes NOTHING", "a self-confirm is refused…" |
| F2 | Verification pass skipped (`remaining = 0`). | fail 3 / 18 | "verification pass catches a delete that reports success…", both partial-failure tests |
| F3 | Isolation broken: the studentId selector is widened to `{}`. | fail 3 / 18 | "ANOTHER student's data is untouched", "receipt counts match", "anchor collection (sessions)…" |
| F3b | Isolation broken: the student→ edge clause drops its id (`{"from.kind":"student"}`). | fail 4 / 18 | "ANOTHER student's data is untouched", "receipt counts match", both export tests |
| F4 | Partial failure swallowed (the catch records nothing). | fail 2 / 18 | both partial-failure tests |
| F5 | Self-confirm check removed. | fail 1 / 18 | "a self-confirm is refused…" |
| F6 | Anchors not deferred after a phase-1 failure. | fail 1 / 18 | "a deleteMany failure on edges is REPORTED…, anchors are deferred…" |
| F7 | `$unset studentId` dropped on completion. | fail 1 / 18 | "the receipt and the surviving audit row carry NO personal data" |

## Open questions / follow-ups (not blocking this unit)

1. **Keyed audit hash.** Replacing the salted sha256 with an HMAC keyed from `.env` (for example `VC_ERASURE_HASH_KEY`) would close the dictionary check against enumerable studentIds. It needs a B11 key name and an Approver call.
2. **Who may call execute and export.** The functions trust the actor ids they are given. Authentication and authorisation (the confirmer is an admin; the export is released only to the student or guardian) belong to the API layer.
3. **Writes after completion.** A scribe thread resumed after erasure could write the student again. The erasure removes the claims and checkpoints, so a resume has no state, but the caller or API should also refuse new work for an erased student hash.
4. **ISS-t-007-rev-6 remainder.** `saver.setup()` is still never called. The INDEX_PLAN now creates identical indexes, so `db:init` covers it, and the first live-wiring unit should still call `setup()` or rely on `db:init`.
5. **Live run.** A one-off script run against `virtual_counsellor` with a synthetic student (the two UNVERIFIED rows) needs to be scheduled as an explicit, human-invoked step.
