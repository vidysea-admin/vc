# Manifest: t-011-dpdp-erasure
**Contract:** qa/contracts/counselling-engine.md (B15 primary; B4, B8, B11, B12, B14)
**Goal task:** T-011
**Date:** 2026-09-25
**Status:** ready-for-check
**Fix cycle:** 0
**Fix cycle budget:** 0 of max 3
**Design:** qa/gates/dpdp-erase-design.md answer (a) "hard delete with confirmation and verification"; D-003 (history by retirement, so erasure must include retired facts), D-012 (fact `_id` is a fresh ObjectId, so edges are found through the resolved fact ids), D-013 (`active: true` marks open facts; retired facts have it unset), D-014 (scribe_resolutions hold approved fact values, so they are erased)
**Diff range:** `e10e49d..HEAD` on branch `wave/t-011-dpdp-erasure`. It is a single commit: "feat(db): T-011 DPDP erasure (confirm → hard delete → read-back verify → receipt) + export". `e10e49d` is "tasks: T-007 done; T-008 prerequisites", the main branch point.
**Scope:** `packages/db/src/erasure.ts` (new, the unit's module), `packages/db/src/{collections,consent,index}.ts`, `packages/db/scripts/db-init.ts` (INDEX_PLAN), `packages/db/tests/{erasure.test.ts (new), consent.test.ts, db-init.test.ts, fakes.ts}`, `packages/db/README.md`, `packages/schemas/src/schemas.ts` (additive: the Erasure* schemas), this manifest.
**Not touched:** `.claude/**`, `docs/DECISIONS.md`, `scripts/**`, `packages/engine/**` (read only, by the drift-guard test), `qa/contracts/**`.
**Dual check:** no
**Issues addressed:** ISS-t-011-pre-1 (medium), ISS-t-007-rev-6 (high; the erasure half plus the INDEX_PLAN half: the checkpoint collections are now named and indexed; `saver.setup()` wiring stays with the first live-wiring unit), ISS-043 (low)
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
| Concurrency | A writer racing the erasure is caught by the read-back, leaving the request `failed` and retryable. | By construction (the read-back runs after the deletes). There is no dedicated concurrent-writer test. | **UNVERIFIED (by construction)** |
| Transcripts | Raw transcript and audio collections are erased. | No such collections exist yet. Transcripts live only inside the scribe checkpoints, which are erased. The coverage test forces any new collection into the plan. | **N/A yet** |

## Falsification (mutate → red → restore)

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
