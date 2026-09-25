# Verdict — t-016-scribe-persistence

**Verdict:** PASS
**Cycle checked:** 0
**Unit:** T-016 (scribe persistence prerequisites for the T-008 approval UI)
**Contract:** B3, B12, B14, B15 primary; B8, D-012, D-014, D-015, D-016
**Diff range checked:** `547bf0d..06c7e8b` (single commit `06c7e8b`, "feat(db,engine): t-016 scribe
persistence prerequisites")
**Manifest read:** `qa/manifests/t-016-scribe-persistence.md` (Status: ready-for-check, Fix cycle: 0)
**Issues addressed:** ISS-t-007-rev-6 (high), ISS-t-007-rev-7 (medium), ISS-t-007-rev-9 (medium),
ISS-t-007-rev-10 (medium), ISS-t-011-rev-5 (low)

## 1. Verification commands re-run (worktree `D:\vc\.worktrees\t-016-scribe-persistence`)

```
$ pnpm install
Scope: all 10 workspace projects; Lockfile up to date. Done in 3.3s (exit 0)

$ pnpm -r typecheck
9/9 packages "Done" (apps/web, packages/providers, packages/schemas, packages/observability,
packages/db, apps/api, mcp/student-profile, mcp/university-kb, packages/engine + evals/tsconfig.json)
— exit 0, no errors.

$ pnpm -r test
apps/web 1/1 · packages/providers 8/8 · packages/schemas 50/50 · packages/observability 57/57 ·
packages/db 162/162 · apps/api 6/6 · mcp/student-profile 12/12 · mcp/university-kb 9/9 ·
packages/engine 129/129
TOTAL 434/434, 0 fail — matches the manifest's claimed counts exactly (was 405; db +5, engine +24).

$ python contracts/verify_contracts.py
verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity (exit 0)
```

## 2. Method

Read in full: `packages/db/src/{collections,facts,erasure}.ts`, `packages/db/tests/fakes.ts` (the
whole file, not just the diff), `packages/engine/src/scribe/{graph,nodes,checkpointer,schemas}.ts`,
`packages/engine/tests/{scribe-fixtures,scribe-persistence}.ts`, the manifest in full, and the
relevant contract clauses. Cross-checked the fake against the **real** installed
`@langchain/langgraph-checkpoint-mongodb` source
(`node_modules/.pnpm/@langchain+langgraph-checkp_.../dist/checkpoint.js`) line by line for `setup`,
`getTuple`, `list`, `put`, `putWrites`, `deleteThread` — not just trusted the manifest's claim that
the fake is "driver-faithful."

Falsification and my own hostile probes were done in a **separate scratch copy**
(`C:\Users\Lenovo\AppData\Local\Temp\claude\d--vc\...\scratchpad\t016`, `robocopy` of the worktree
minus `.git`/`node_modules`, then `pnpm install` there). The reviewed worktree was never mutated for
probing. I wrote one probe file there (`packages/engine/tests/_checker-probe.test.ts`), run via
`npx tsx --test`, scratch-only, never committed to the worktree or the repo.

## 3. Fake fidelity (the brief's central question: could the fake pass a test production would fail?)

Verified against the real MongoDBSaver source, not just the manifest's prose:

- **`put()`** does a plain `$set`-only upsert (`updateOne(query, {$set: doc}, {upsert: true})`). The
  fake's upsert path seeds the inserted doc from `equalityFields(filter)` (the query's plain-equality
  fields) then applies `$set`/`$addToSet` on top — matches real Mongo upsert-insert semantics for a
  filter with no dotted paths, which is exactly what `put()`'s query is (`thread_id`, `checkpoint_ns`,
  `checkpoint_id`).
- **`putWrites()`** is the more interesting case: for non-"special" channels it upserts with
  `$setOnInsert` (write-once semantics — a repeat write to the same `(thread_id, ns, checkpoint_id,
  task_id, idx)` must NOT overwrite the first value). The fake's `updateOne`, on a MATCHED existing
  doc, calls `applyUpdate(existing, update)`, which only reads `update.$set` / `$unset` /
  `$addToSet` — it never looks at `$setOnInsert` on the update-existing path. That is exactly correct
  Mongo semantics ($setOnInsert is a no-op unless an insert actually happens), and it is not
  accidental: the fake's insert path deliberately DOES fold `$setOnInsert` into the seed. This is the
  single fidelity detail most likely to have been gotten wrong, and it's right.
- **`bulkWrite`**: MongoDBSaver calls it with no explicit `ordered` option (driver default: ordered,
  stop at first failure). The fake's loop `for (const op of ops) await this.updateOne(...)` — an
  exception from any `updateOne` propagates immediately and the loop never issues the remaining ops,
  matching ordered semantics.
- **Binary round-trip**: the fake imports the REAL `Binary` class from the `mongodb` package rather
  than reimplementing it, so `.value("utf8")` (which the saver's `getTuple`/`list` call on
  `doc.checkpoint`) is genuine bson behaviour, not a fake's guess. `cloneDoc` explicitly preserves the
  `Binary` prototype (`structuredClone` would drop it) — confirmed by reading `toStored`/`cloneDoc`.
- **11000 on duplicate `_id` in an upsert**: reproduced the exact scenario by hand
  (`ensureScribeSessionRow` colliding on a foreign student's `_id`) — confirmed both by the maker's
  own `facts.test.ts` hostile test and by re-reading `updateOne`'s insert branch: it checks
  `this.docs.has(_id)` AFTER computing the seed and throws `FakeDuplicateKeyError` before storing,
  exactly where the real server would reject the insert half of the upsert.
- **Cursor `sort`/`limit`**: matches the saver's own usage (`find(query).sort("checkpoint_id",
  -1).limit(1)` in `getTuple`, `.sort("checkpoint_id", -1)` + conditional `.limit(limit)` in `list`) —
  both call shapes are exercised by the "mongo" variants of the new tests, not merely constructed.
- **Type-bracketed `$lt`/`$lte`/`$gt`/`$gte`**: used for the lease's `expiresAt` comparison and (in the
  saver) `list()`'s `before` cursor. The fake's `typeof actual !== typeof arg` guard is a reasonable
  and safe approximation for this codebase's own field types (ISO strings compared as strings), even
  though real Mongo's type-bracketing rules are more elaborate in general.

No fidelity gap found that would let a test pass here and fail against a real server for the
scenarios this unit's tests actually exercise.

## 4. Hostile variants from the brief, and what the manifest's own tests already prove

Checked each of (a)–(e) against the actual test file, not just the manifest's summary table:

- **(a) run ends without an interrupt, non-default thread id, erase, zero residue**: `[mongo, consent
  refused]` and `[mongo, crisis escalated]` variants in `scribe-persistence.test.ts` do exactly this,
  asserting export counts equal the real checkpoint doc counts and a full residue scan (every
  collection, by studentId/sessionId/threadId) is `[]`. `erasure.test.ts`'s new db-layer test covers
  the same shape directly against `ERASURE_PLAN`/`resolveSelectors`. A single session with TWO threads
  is covered ("a second run of the same session on a NEW thread"); a student with two DISTINCT
  sessions each with their own thread is not separately exercised, but `resolveSelectors` treats
  `sessions` generically (a `flatMap` with no per-session special-casing), so this is a low-risk test
  gap, not a suspected bug — logged as ISS-t-016-c0-2 (low).
- **(b) concurrent recoveries, racing an in-flight winner, expired lease, live lease**: all four are
  literally named and present (`ISS-t-007-rev-10` x2 concurrent-recovery variants on both memory and
  mongo savers, "racing the WINNER's resume... in_progress", "an EXPIRED lease... does not block",
  "a LIVE lease held by another process blocks... lease untouched"). I additionally probed a FIFTH
  variant not covered by name — see §5, ISS-t-016-c0-1.
- **(c) approve/reject/withheld summary + export/erasure**: `ISS-t-007-rev-7` memory/mongo variants
  assert the row's `summary` equals the approval request's summary, reject stores nothing, and the
  withheld case asserts `!JSON.stringify(row).includes("Canada is the best option")` — i.e. it
  actually greps the stored row for the withheld text, not just checks a flag. `recordApprovedSessionSummary` never upserts (confirmed: it throws `SessionRowMissingError` on
  `matchedCount === 0`, checked directly in `facts.test.ts`).
- **(d) blank/whitespace/missing studentId throws before any write**: `undefined` and `""` are
  covered at the `resumeScribe` claim layer (rev-9 loop); whitespace-only (`" "`) is covered at the
  `ensureScribeSessionRow` layer (`facts.test.ts`, the three-bad-inputs loop) via the SAME
  `requireNonEmpty` helper both call sites share, and `resumeScribe`'s own check
  (`latest.studentId.trim() === ""`) independently reads correctly for whitespace even though no test
  exercises it AT THAT LAYER by name. Logged as part of ISS-t-016-c0-2 (low, test-coverage only — the
  code is correct on inspection).
- **(e) sessionId owned by another student refused**: `"ISS-t-011-rev-5 hostile: a sessionId already
  owned by ANOTHER student is refused before any checkpoint"` (engine) plus the db-layer hostile test
  (`facts.test.ts`) both assert 11000, the row untouched, and (engine level) that no checkpoint was
  written for the second caller.

## 5. My own probe: a genuine gap, but idempotency-safe (ISS-t-016-c0-1, medium)

The manifest's rev-10 tests all name their invariant "exactly one graph.invoke". I probed a variant
none of them cover: a winner whose write is **genuinely still in flight** (not crashed, not
timed-out-and-abandoned) when its lease is judged expired.

Root cause read from the code: `newLease` computes `expiresAt = deadline.expiresAt +
FENCE_MARGIN_MS`, where `deadline` is the OUTER `WriterDeadline` built from `opts.writerDeadlineMs`
(the caller's `resumeScribe`/`startScribe` argument). But the actual write —
`recordApprovedSessionSummary` then `applyApprovedDiff`, both called from `nodes.ts`'s `writeApproved`
— is bound by NEITHER that outer deadline NOR its signal. `applyApprovedDiff` is called with no
`options`, so it builds its OWN independent `WriterDeadline` at the package default
(`FENCED_WRITER_DEADLINE_MS` = 60s), started when the write node itself runs, not when the outer
deadline started. `ScribeRunOptions.writerDeadlineMs` is explicitly documented as a caller-settable,
SHORTER-than-default option ("D-016: this call's fenced-writer deadline, SHORTER than
FENCED_WRITER_DEADLINE_MS") — so a caller (a future T-008 UI wanting a snappier timeout) can shrink
the outer deadline (and therefore the lease's window) without shrinking the write's own internal
bound at all.

**Probe** (scratch-only, `_checker-probe.test.ts`): gated `facts.insertOne` so a winner's write
genuinely blocks; called `resumeScribe(..., {writerDeadlineMs: 50})`; let the outer deadline fire
(winner's own promise rejects with `FencedWriterDeadlineError`, confirmed) while the gated write is
STILL blocked in the background; forced the claim's lease to look expired (the exact same technique
the manifest's own "EXPIRED lease" test uses to simulate elapsed wall-clock time, not a contrived
one); started a `resumeScribe(null)` recovery; released the gate.

**Result, empirically**: `invokeCount: 2` — a second `graph.invoke` really did run concurrently with
the first, still-in-flight one. This falsifies "exactly one graph.invoke" as an unconditional
invariant. HOWEVER: `openFactCount: 2`, `distinctKeyCount: 2` — no duplicate facts landed.
D-012's content-hash replay detection (in `applyApprovedDiff`: a losing `insertOne`'s 11000 is
re-read, and an equal `contentHash` is treated as success, not conflict) absorbed the double invoke
without data corruption. The visible cost is wasted duplicate work — an extra DB round trip here, or
(if the race happened earlier, during extraction/summarization) a duplicate provider call, which is
the same class of risk the manifest's own Residual #1 already accepts for the unclaimed-recovery
case.

**Severity judgment: medium, not blocking.** It requires either a caller-shortened
`writerDeadlineMs` or driver/provider latency that genuinely outlives `FENCE_MARGIN_MS` (30s) — not
the default path, which the manifest's Residual #4 already flags in general terms ("assumes the
holder's in-flight driver ops end within FENCE_MARGIN_MS of its deadline"). This unit is scoped as
"prerequisites for the T-008 approval UI", not final hardening, and idempotency prevents the failure
mode B15/B3 actually care about (no double-committed data, no orphaned residue). Filed as
ISS-t-016-c0-1 (medium) recommending that `writeApproved` thread a bound derived from the SAME
deadline `invokeFenceAware` uses (or that the docstring on `ScribeRunOptions.writerDeadlineMs`
explicitly warn that shortening it does not shorten the write's own bound) before T-008 starts
relying on a short custom deadline.

## 6. Residuals and the proposed D-entry

- **Residual 1 (unclaimed recovery not leased) — acceptable for this stage.** Before any claim
  exists, two concurrent `resumeScribe(null)` calls can both invoke. Impact is bounded to checkpoints
  only (no facts/claims/summary, per B3 — nothing is written that erasure or export would need to
  reconcile) plus a repeated provider call. This is honestly disclosed, not hidden, and the proposed
  D-entry item (b) names a concrete fix path (move/extend the lease to the session row, which now
  exists from the start of every run). Acceptable to ship for a prerequisites unit; should not survive
  past T-008 actually going live with real counsellor traffic.
- **Residuals 2–5**: read and agree with the manifest's own framing; residual 4's general language
  ("without the client backstop would need its own bound") is the same root cause as my ISS-t-016-c0-1
  finding, just not spelled out as concretely — ISS-t-016-c0-1 gives it a specific mechanism and an
  empirical reproduction.
- **Proposed D-entry**: part (a) (what's actually implemented — session row before first checkpoint,
  summary on the row, scribeThreadIds feeding erasure/export) matches the shipped code exactly on
  inspection; recommend the Approver adopt it as written. Part (b) is correctly marked not-built.

## 7. Answers to the manifest's open questions

- `in_progress` as the outcome name: reasonable and self-explanatory for a UI to render ("someone
  else is already resuming this"); no objection.
- `resumeScribe(null)` on a thread with nothing pending returning the current outcome without
  invoking: consistent with the idempotent-recovery philosophy already used elsewhere (D-012); no
  objection to keeping it implicit rather than a separate `done`-only contract.

## 8. Scope discipline

`git status` in `D:\vc\.worktrees\t-016-scribe-persistence` shows only this verdict and the issues
ledger append before commit. No `.claude/**`, `docs/DECISIONS.md`, `scripts/**`, or product code
touched by this review. Probe file lives only in the scratch copy and was never copied back.
