# @vc/db

Mongo access layer for the engine's one database, `virtual_counsellor`, on the production Mongo
server (contract B12, D-008/D-009, `qa/gates/mongo-host.md`).

- `src/client.ts` — `VC_DB_NAME`, `getVcDb`, `connectFromEnv`. The only place in the repo allowed
  to call the driver's `client.db(` (proven by `tests/db-scope.test.ts`, which greps
  `packages/**`, `apps/**` and `mcp/**` source).
- `src/collections.ts` — typed accessors for `students`, `sessions`, `facts`, `decisions`,
  `consents`, `edges`. `universities`/`courses` are name constants only (owned by the
  university-kb unit).
- `src/consent.ts` — `requireConsent` (contract B4).
- `src/facts.ts` — `proposeFactChanges` (pure, writes nothing) and `applyApprovedDiff` (the only
  function that writes to `facts`; contract B3, supersede-not-delete via `validTo`).
- `src/edges.ts` — the generic `{from, to, rel}` edge shape and the idempotent `link()` helper.
- `src/erasure.ts` — DPDP erasure and export (contract B15, T-011): `requestErasure` (pending) →
  `confirmErasure` (a different staff actor) → `executeErasure` (hard delete across every engine
  collection, two-phase so a failed step leaves the anchor collections for the retry; anchors are
  deleted by resolved id and the purge loops, at most `ERASURE_MAX_ROUNDS` times, until a read-back
  finds nothing, so a writer active mid-erasure can not leave orphan edges or checkpoints; a
  counts-only receipt; throws `ErasureIncompleteError` on any failure, with the ids carried into
  the retry; the final row update is a checked CAS, so concurrent calls all get the stored receipt). The `erasure_requests` audit row keeps only a salted studentId hash, staff actor
  ids, a reason code and the receipt once completed. `exportStudent` returns the student's own
  access bundle (not purpose-filtered; release only to the authenticated student/guardian).
- **Erasure fence (D-015, T-011 cycle 2; D-016, cycle 3).** `confirmErasure` sets a fence in
  `erasure_fences` (keyed by an unsalted sha256 of the studentId, no clear id) before its confirm
  CAS; `executeErasure` re-sets it before resolving anything. Every student-data writer must be
  fence-aware: `assertStudentNotFenced` before writing, and `compensateIfFenced` (undo by id, then
  `StudentFencedError` with the writer's own error as `cause`) after all its writes, **in a
  `finally`**, so also after an error or a timeout. `applyApprovedDiff`, `requireConsent` and the
  engine's `startScribe`/`resumeScribe` are.
  - **Writer deadline (D-016).** Every fence-aware writer runs under `FENCED_WRITER_DEADLINE_MS`
    (60 s), measured from just before its fence pre-check (`WriterDeadline`). Each driver
    operation carries `timeoutMS` = the time left (mongodb@6 client-side operation timeout, which
    also sends `maxTimeMS` to the server), and an application timer aborts the writer at the
    deadline (for the scribe, through LangGraph's `signal`). A writer that runs past its deadline
    keeps nothing: it is undone and throws `FencedWriterDeadlineError`, whose `settled` promise
    resolves once an operation still in flight at the abort has landed and been undone too. A
    caller may use a shorter deadline, never a longer one (`RangeError`).
  - **Minimum hold (D-016).** A fence is never removed before `createdAt + MINIMUM_FENCE_HOLD_MS`
    (deadline + `FENCE_MARGIN_MS` 30 s = 90 s). `createdAt` is set once and not reset when a
    request re-arms the fence. On completion the fence is deleted if
    `max(createdAt + hold, completedAt + ERASURE_FENCE_GRACE_MS)` has passed; otherwise it is
    stamped `releaseAfter` and removed later by `releaseExpiredErasureFences` (the sweep, which a
    scheduled job must run). `ERASURE_FENCE_GRACE_MS` (default 0) is only the re-enrolment policy
    of gate erasure-fencing Q1; correctness does not depend on it.
  - **One open request per student (D-016).** `erasure_requests` has a unique partial index on
    `studentKey` among `pending`/`confirmed`/`failed` rows; `requestErasure` throws
    `ErasureRequestAlreadyOpenError` for a second one. The fence is removed only when no
    confirmed/failed request for the student remains.
  - **Enforced, not by convention.** `tests/db-scope.test.ts` fails if any module under
    `packages|mcp|apps/**/src` writes to a student-data collection unless it is on the
    fence-aware allowlist.
  - **What is guaranteed, exactly.** For every fence-aware writer: its writes either landed before
    the fence (so the purge, which resolves after the fence, deletes them) or its post-check runs
    while the fence still exists and removes them. **Residual caveats:** (1) a write the server
    applies after the client timed out is bounded server-side by the same `timeoutMS`/`maxTimeMS`,
    but a request delayed on the network by more than the margin, or clock skew between app servers
    beyond the margin, is not covered; (2) the scribe checkpointer's (MongoDBSaver) own writes do
    not carry our per-operation `timeoutMS`: they are bounded by the graph's abort signal and by a
    client-level `timeoutMS` if the MongoClient is configured with one, and the post-check runs again
    when an aborted run settles; (3) a writer that bypasses the fence entirely is covered only by the
    scanner (a method name built at runtime from variables can not be proven statically); (4) all of
    this is proven against the in-memory fake and MemorySaver, not yet against the live server.

## Live DB init (NOT run by T-003)

`scripts/db-init.ts` creates the engine's collections and a small set of indexes inside
`virtual_counsellor` on the real server named in `.env` `MONGODB_URL`. It is written and reviewed
but deliberately not executed by this unit (contract B8: automated work stays offline).

To run it later, as an explicit human-invoked step:

```sh
pnpm --filter @vc/db db:init
```

This requires a real `.env` with `MONGODB_URL` set. It never touches any database other than
`virtual_counsellor` (enforced by `getVcDb`), and it never calls `dropDatabase` — that stays gated
per D-009.
