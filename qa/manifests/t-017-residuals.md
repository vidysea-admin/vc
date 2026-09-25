# Manifest: t-017-residuals

**Contract:** qa/contracts/counselling-engine.md (B3, B12, B14, B15 primary; D-012, D-014, D-015, D-016, D-017)
**Goal task:** T-017
**Status:** checked-PASS (cycle 2; senior re-review Approve)
**Fix cycle:** 2
**Diff range (cycle 0):** `8e5ed73..5c748fe` on branch `wave/t-017-residuals`, one commit:
"fix(db,engine,api): t-017 summary fence compensation, lease bound, sweep/startApi hardening".
`8e5ed73` is main's tip ("decisions: D-017 session row + summary + claim lease (T-016); tasks: T-016
done, T-017 scope"), the branch point.
**Diff range (cycle 1):** `5c748fe..b77b3d9`, two commits: `e44444d` ("fix(db): t-017 cycle 1 part 1 —
async onError rejection no longer unhandled") and `b77b3d9` ("fix(db,engine): t-017 cycle 1 part 2 —
closes the summary residue window"). (`30e38ea` and `a708ee7` between them are the checker's own
cycle-0 verdict/re-check commits, not maker changes — see "What changed in cycle 1" below.)
**Diff range (cycle 2):** on top of `16c1370` (checker's cycle-1 FAIL verdict commit) — see the fix
commit below.
**Scope:** `packages/db/src/{facts,erasure,client}.ts`, `packages/db/tests/{facts,erasure,client,db-scope}.test.ts`,
`packages/engine/src/scribe/{graph,nodes}.ts`, `packages/engine/tests/scribe-persistence.test.ts`,
`apps/api/src/index.ts`, `apps/api/tests/index.test.ts`, this manifest.
**Not touched:** `.claude/**`, `docs/DECISIONS.md`, `scripts/**`, `qa/contracts/**`, `TASKS.md` (left `open`),
`packages/schemas/**`, `packages/providers/**`, `packages/observability/**`, `mcp/**`, `apps/web/**`.
**Dual check:** no
**Issues addressed (cycle 0):** ISS-t-016-rev-1 (high), ISS-t-016-c0-1 (medium), ISS-t-016-c0-2 (low),
ISS-t-015-c0-1 (medium), ISS-t-015-c0-3 (medium), ISS-t-015-c0-2 (low), ISS-t-015-c0-4 (low)
**Issues addressed (cycle 1):** ISS-t-017-rev-2 (high, senior review BLOCK), ISS-t-017-c0-1 (medium,
the same bug, found independently by the checker), ISS-t-017-rev-1 (medium, data-engineer review)
**Issues addressed (cycle 2):** ISS-t-017-rev-3 (medium/high per the c1 senior re-review, "ISS-t-017-c1-1"
in the cycle-1 checker verdict's own numbering — a never-settling onError silently stalls the sweep
forever), ISS-t-017-c1-2 (medium, the cycle-1 checker's own NEW FINDING — a FencedWriterDeadlineError
from applyApprovedDiff can still leave the summary behind when the student is genuinely fenced by the
time writeApproved's catch runs)
**Executor:** claude-sonnet-subagent (maker build subagent)
**Offline:** every run below is offline (B8). Nothing connected to MONGODB_URL.

## What changed

### ISS-t-016-rev-1 (high) — recordApprovedSessionSummary is now fence-aware

`packages/db/src/facts.ts` `recordApprovedSessionSummary`: previously a bare `updateOne`, no fence
check of its own. It relied entirely on the OUTER `invokeFenceAware` wrapper (graph.ts) to catch a
fence via applyApprovedDiff's pre-check, which ran only AFTER this write. A fence landing between the
two calls left `summary` / `summaryApprovedAt` / `summaryWithheldReason` on the session row while the
outcome was reported `fenced`, surviving until `executeErasure` eventually purged the whole row
(node.ts:352, graph.ts:356-364 per the T-016 senior review).

Now mirrors `applyApprovedDiff` exactly:
- a pre-check (`assertStudentNotFenced`, under a `WriterDeadline`) refuses a fenced student before
  writing anything;
- the write stamps `summaryApprovedAt` ONCE (`approvedAt`, computed before the write) and reuses that
  exact value as the compensation's match key (`{_id, studentId, summaryApprovedAt: approvedAt}`), so
  the undo can only ever remove the value THIS call wrote — a later legitimate write (a fresh
  approval, or an idempotent replay, each with its own fresh timestamp) is never clobbered by a stale
  compensation, even though the filter has no separate "did we write" flag (the match is inherently a
  no-op if this call's write never landed, exactly like applyApprovedDiff's delete-by-id against an
  insert that never happened);
- a post-check (`compensateIfFenced`), always run (success, failure, or a timeout), unsets exactly
  those three fields when the student is fenced now, and throws `StudentFencedError`;
- a timed-out call (`FencedWriterDeadlineError`) carries a `settled` promise that re-runs the undo
  once the late write actually lands, matching `applyApprovedDiff`'s own `settled` pattern.

### ISS-t-016-c0-1 (medium) — the write node's own deadline is bound to the outer writerDeadlineMs

Root cause: the run lease (`graph.ts` `newLease`) is derived from the OUTER `WriterDeadline`
(`opts.writerDeadlineMs`, caller-shortenable per D-016's own docs), but `applyApprovedDiff` and
`recordApprovedSessionSummary`, called with no options from `nodes.ts` `writeApproved`, each built
their OWN independent `WriterDeadline` at the package default (`FENCED_WRITER_DEADLINE_MS` = 60s) —
so the driver-level `timeoutMS` their own operations received was NEVER bound to a caller-shortened
outer deadline. A caller shrinking `writerDeadlineMs` (e.g. a snappier T-008 UI timeout) shrank the
lease's window without shrinking the write's own internal bound at all.

Fix (option (a) from the two offered — "bind the INNER write deadline to the OUTER writerDeadline" —
chosen over deriving the lease from `max(outer, inner)`, since the latter would let a genuinely slow
write silently stretch the lease's window with it, undermining the fixed margin D-016 relies on):
- `graph.ts` `runnableConfig` now takes the `WriterDeadline` object (not just its `signal`) and adds
  `configurable.writerDeadlineExpiresAt = deadline.expiresAt` — the SAME absolute instant `newLease`
  derives the run lease from;
- the write node reads it back from its second (`Runtime`) argument and passes
  `{ writerDeadlineExpiresAt }` to `writeApproved`;
- `nodes.ts` `writeApproved` recomputes `expiresAt - Date.now()` FRESH at each of its two write calls
  (`recordApprovedSessionSummary`, then `applyApprovedDiff`), floored at 1ms, so neither call's own
  deadline can outlive the other's or the outer one, however much real time elapsed between them.
  Absent (a graph invoked outside start/resumeScribe): both calls fall back to their own package
  default, unchanged from before this fix.

Documented in `nodes.ts`'s new `WriteApprovedOptions.writerDeadlineExpiresAt` docstring and
`graph.ts`'s `runnableConfig` docstring.

**What this closes, and what it does not (honestly, per the checker's own probe).** With this fix, a
caller-shortened `writerDeadlineMs` now bounds the driver-level `timeoutMS` the inner writes'
Mongo operations receive too (verified in `ISS-t-016-c0-1` in scribe-persistence.test.ts, capturing
the actual `timeoutMS` option reaching `sessions.updateOne` and `facts.insertOne`). In a REAL server,
this closes the gap: a fenced writer's operations are now driver-timed-out within the SAME window the
lease's margin budgets for. It does NOT (and can not, offline) make the checker's exact probe scenario
—a hand-gated `insertOne` that blocks indefinitely regardless of any `timeoutMS` passed, combined with
manually forcing `lease.expiresAt` into the past — show `invokeCount: 1`, because the offline fake
does not enforce `timeoutMS` at all (confirmed by reading `packages/db/tests/fakes.ts`'s `insertOne`,
which takes no options parameter whatsoever). That specific residual is the same class of "needs a
live server" caveat erasure.ts's own "Honest caveats" section already carries for `timeoutMS`
enforcement — logged as Residual 1 below, not silently closed.

### ISS-t-016-c0-2 (low) — test-coverage gaps (no code bugs; both closed with tests only)

- `packages/engine/tests/scribe-persistence.test.ts`: the `ISS-t-007-rev-9` loop (previously
  `[undefined, ""]`) now also covers a whitespace-only studentId (`"  "`) at the `resumeScribe` claim
  layer, exercising `resumeUnderDeadline`'s own `.trim() === ""` check directly (previously only
  exercised at the `ensureScribeSessionRow` layer in `facts.test.ts`).
- A new test covers a student with TWO DISTINCT sessions (not one session with two threads), each
  with its own scribe thread, end-to-end through export and erasure — confirming `resolveSelectors`'s
  generic `flatMap` over `sessions` really does cover a second session, not just a second thread.

### ISS-t-015-c0-1 (medium) — the sweep logger no longer leaks err.message

`packages/db/src/erasure.ts`: `errorLabel` (previously private, used only inside `executeErasure`'s
receipt lines) is now exported. `apps/api/src/index.ts` `defaultSweepErrorLogger` logs
`error: errorLabel(err)` (name + code only) instead of `name` + raw `message` — the same redaction
`executeErasure`'s own receipt lines already use, so a realistic Mongo-shaped error whose message
embeds a document field value (e.g. an E11000 duplicate-key line) can not reach this log line either.

### ISS-t-015-c0-3 (medium) — a throwing onError can no longer produce an unhandledRejection

`packages/db/src/erasure.ts` `startErasureFenceSweep`'s `tick()`: the `.catch((err) =>
options.onError?.(err))` callback now wraps the `onError` call in its own try/catch. Before, an
`onError` that itself threw made the `.catch(...)`'s returned promise reject, and since `tick()` never
awaits or further catches that chain, it became a genuine Node `unhandledRejection` — which, under
Node's default policy (>=15), crashes the process. `onError`'s docstring is updated to say this
explicitly. The sweep's own failure was already handed to `onError`; a broken `onError` is now
silently swallowed rather than escalated, so one bad tick never kills the interval OR the process.

### ISS-t-015-c0-2 (low) — startApi preserves the root error when close() also throws

`apps/api/src/index.ts` `startApi`'s post-connect catch: `await client.close(); throw err;` silently
discarded the ROOT cause (e.g. `startErasureFenceSweep`'s `RangeError`) whenever `close()` itself
threw. Now `client.close()` is wrapped in its own try/catch; if it throws too, an `AggregateError`
carrying BOTH the original error (first) and the close failure (second) is thrown instead, so a caller
always sees the real root cause and never mistakes a close-time symptom for it.

### ISS-t-015-c0-4 (low) — MONGO_CLIENT_TIMEOUT_MS accepts only a strict decimal integer

`packages/db/src/client.ts` `resolveClientTimeoutMs`: a new `STRICT_DECIMAL_INTEGER` regex
(`/^[0-9]+$/`) is checked BEFORE `Number(raw)`, rejecting hex (`"0x1000"`), exponential notation
(`"1e5"`), fractional ms (`"30000.5"`), signs (`"+5000"`), the `BigInt` suffix (`"5000n"`),
`"Infinity"`/`"NaN"`, and any surrounding whitespace — all of which `Number(raw)` alone silently
accepted or (for `Infinity`/`NaN`-shaped strings) let through the `Number.isFinite` gate incorrectly
in some cases. The `FENCE_MARGIN_MS` cap itself was never bypassed by any of these notations (D-016's
safety was intact); this closes a config-hygiene gap so a typo fails loudly at startup instead of
quietly meaning something other than what was typed.

## TDD: RED before implementation, and falsification for every fix

Every fix below was developed by temporarily restoring the pre-fix source (`git show
8e5ed73:<path>`) over the already-written new/updated tests, running the targeted suite to confirm
RED, then restoring the fixed source and re-running to confirm GREEN. Two rounds:

**Round 1 (ISS-t-015-c0-1/2/3/4 — client.ts, erasure.ts sweep, apps/api/src/index.ts):**
```
cd packages/db && npx tsx --test tests/client.test.ts tests/erasure.test.ts
  RED: 12 fail (all "ISS-t-015-c0-4: ... rejects surprising-but-Number()-parseable notation ...")
  RED: "ISS-t-015-c0-3: an onError that itself throws ..." — the unhandled rejection crashed the
       test itself (attributed to it by node:test) and corrupted mock-timer state for the NEXT test
       ("MockTimers is already enabled!") — an even stronger demonstration of the bug than a plain
       assertion failure
cd apps/api && npx tsx --test tests/index.test.ts
  RED: 3 fail — "startApi's default onError logs ..." (still had `message`), "a Mongo-shaped error
       ... does not survive" (embedded value DID survive), "when close() throws too, the ORIGINAL
       error is preserved" (was just the close() error, not an AggregateError)
```
After restoring the fixed sources: `packages/db` 92/92, `apps/api` 8/8, all green.

**Round 2 (ISS-t-016-rev-1, ISS-t-016-c0-1, ISS-t-016-c0-2 — facts.ts, nodes.ts, graph.ts):**
```
cd packages/db && npx tsx --test tests/facts.test.ts
  RED: 4 fail — the three new ISS-t-016-rev-1 StudentFencedError tests ("Missing expected
       rejection"), plus RangeError test; the "runs past its writer deadline" test needed a
       { timeout: 5000 } guard added (pre-fix `recordApprovedSessionSummary` has NO deadline
       mechanism at all, so the stuck write hangs the process indefinitely rather than failing
       cleanly — the guard is now permanent, harmless post-fix)
cd packages/engine && npx tsx --test tests/scribe-persistence.test.ts
  RED: 2 fail — "ISS-t-016-rev-1: a fence that appears BETWEEN the summary write and
       applyApprovedDiff ..." (the summary text was still present after the fenced outcome), and
       "ISS-t-016-c0-1: ... bound to the SAME (short) outer writerDeadlineMs ..." (the summary
       write carried NO explicit timeoutMS at all pre-fix)
```
After restoring the fixed sources: `packages/db` (facts.test.ts) 46/46, `packages/engine`
(scribe-persistence.test.ts) 25/25, all green.

**Falsification, folded into the RED/GREEN cycles above** (each fix's own new test IS its
falsification — the pre-fix source is the mutation, restored and re-verified for every fix
individually before being combined):

| # | Mutation (= pre-fix source) | Result (targeted suite) |
|---|---|---|
| F1 | `recordApprovedSessionSummary` has no fence pre/post-check | facts.test.ts: 3 fail (fenced-before, fenced-after, compensation-match) |
| F2 | `recordApprovedSessionSummary` has no WriterDeadline at all | facts.test.ts: 2 fail (deadline timeout hangs; RangeError test fails) |
| F3 | `writeApproved` passes no deadline to its inner writes | scribe-persistence.test.ts: 1 fail (ISS-t-016-c0-1, zero timeoutMS captured) |
| F4 | the fence lands between the summary write and applyApprovedDiff (end-to-end, real graph) | scribe-persistence.test.ts: 1 fail (ISS-t-016-rev-1, summary text survives the `fenced` outcome) |
| F5 | `defaultSweepErrorLogger` logs `err.message` | apps/api/tests/index.test.ts: 2 fail (message present, embedded value leaks) |
| F6 | `tick()`'s onError call is unguarded | erasure.test.ts: 1 fail (unhandledRejection crashes the test + corrupts the next one) |
| F7 | `startApi`'s catch does a bare `client.close(); throw err;` | apps/api/tests/index.test.ts: 1 fail (root error discarded) |
| F8 | `resolveClientTimeoutMs` uses bare `Number(raw)` | client.test.ts: 12 fail (every surprising notation accepted) |

## Verification (exact commands, run in the worktree, final state)

```
pnpm -r typecheck                      -> exit 0 (every package, incl. evals/tsconfig.json)
pnpm -r test                           -> exit 0
  apps/web 1/1, packages/providers 8/8, packages/schemas 50/50, packages/observability 57/57,
  packages/db 181/181 (was 162; +19: facts.test.ts +5, client.test.ts +13, erasure.test.ts +1),
  apps/api 8/8 (was 6; +2), mcp/student-profile 12/12, mcp/university-kb 9/9,
  packages/engine 133/133 (was 129; +4: rev-9 loop +1 case, +3 new tests)
  total 459 / 459 (was 434)
python contracts/verify_contracts.py   -> "no frozen contracts yet (research phase) -- PASS by vacuity", exit 0
```

## Claims → evidence

| Claim | Evidence (test, file) |
|---|---|
| ISS-t-016-rev-1: recordApprovedSessionSummary refuses a student already fenced, before writing | "a student already fenced BEFORE the call is refused" (facts.test.ts) |
| ISS-t-016-rev-1: a fence AFTER the write unsets exactly summary/summaryApprovedAt/summaryWithheldReason, throws StudentFencedError | "a fence that appears AFTER the write is compensated" (facts.test.ts) |
| ISS-t-016-rev-1: compensation matches only THIS call's write; a later legitimate write is never clobbered | "compensation matches on the value THIS call wrote" (facts.test.ts) |
| ISS-t-016-rev-1: a timed-out call is undone once its late write lands | "a call that runs past its writer deadline ..." (facts.test.ts) |
| ISS-t-016-rev-1: a deadline > FENCED_WRITER_DEADLINE_MS is refused (RangeError), nothing written | "RangeError on a deadline longer than FENCED_WRITER_DEADLINE_MS" (facts.test.ts) |
| ISS-t-016-rev-1 end-to-end: a fence BETWEEN the summary write and applyApprovedDiff leaves zero summary residue IMMEDIATELY (before executeErasure) | "a fence that appears BETWEEN the summary write and applyApprovedDiff ..." (scribe-persistence.test.ts) |
| ISS-t-016-c0-1: the inner writes' own timeoutMS is bound to a short outer writerDeadlineMs, not the 60s default | "ISS-t-016-c0-1: recordApprovedSessionSummary's and applyApprovedDiff's own writes are bound to the SAME (short) outer writerDeadlineMs ..." (scribe-persistence.test.ts) |
| ISS-t-016-c0-2: whitespace studentId refused at the resumeScribe claim layer | the extended `ISS-t-007-rev-9` loop, `"  "` case (scribe-persistence.test.ts) |
| ISS-t-016-c0-2: a student with two DISTINCT sessions is exported and erased to zero residue for both | "ISS-t-016-c0-2: a student with TWO DISTINCT sessions ..." (scribe-persistence.test.ts) |
| ISS-t-015-c0-1: the default sweep logger never logs err.message, only a name:code label | "startApi's default onError logs a structured JSON line ..." + "a Mongo-shaped error whose message embeds a value does not survive ..." (apps/api/tests/index.test.ts) |
| ISS-t-015-c0-3: a throwing onError does not produce an unhandledRejection and the interval survives | "an onError that itself throws does not produce an unhandledRejection ..." (erasure.test.ts, a live `process.on("unhandledRejection")` listener) |
| ISS-t-015-c0-2: close() throwing too preserves the root error via AggregateError | "when close() throws too, the ORIGINAL error is preserved ..." (apps/api/tests/index.test.ts) |
| ISS-t-015-c0-4: hex/exponent/fraction/sign/whitespace notations are rejected; plain integers still work | the 12-case loop + "a plain decimal integer ... is still accepted" (client.test.ts) |

## Residuals (not fixed here)

1. **ISS-t-016-c0-1's exact checker-probe scenario (a hand-gated, indefinitely-blocking insertOne
   combined with a manually-forced-expired lease) is not, and can not be, closed by this fix alone
   offline.** The fix binds the inner write's OWN driver-level `timeoutMS` to the outer
   `writerDeadlineMs` (verified: `ISS-t-016-c0-1` in scribe-persistence.test.ts), which is the real
   mechanism that keeps a REAL server's operation from outliving the lease's margin. The offline fake
   (`packages/db/tests/fakes.ts`) does not enforce `timeoutMS` at all (its `insertOne`/`updateOne`
   ignore the option entirely), so a test that manually blocks a write indefinitely and separately
   forces `lease.expiresAt` into the past will still show a second concurrent invoke — same class of
   "needs a live server" caveat already disclosed in `erasure.ts`'s own "Honest caveats" section and
   the T-016 manifest's "What the MongoDBSaver probe proves, and what it can not". Not a regression:
   D-012's content-hash replay detection still absorbs the duplicate without data corruption (same
   idempotency argument the T-016 checker verdict already accepted for this residual, at medium
   severity, non-blocking).
2. **The T-016 manifest's Residual 1 (unclaimed recovery not leased) is unchanged.** A thread with no
   claim yet (crash before the approval interrupt) still has no lease to take; this unit did not touch
   that path. The T-016 manifest's proposed D-entry item (b) — moving/extending the lease to the
   session row — remains the concrete fix path, not built here (out of T-017's scope: the T-017 row
   named ISS-t-016-rev-1/c0-1/c0-2 and the T-015 residuals specifically, not a new D-entry).
3. **`recordApprovedSessionSummary`'s compensation match key (`summaryApprovedAt`) has a theoretical
   timestamp-collision window** (two writes to the SAME session+student landing within the same
   millisecond) that a dedicated per-call token would close entirely. Not exercised as a real risk:
   `writeApproved` is the only caller, always sequential per thread (one claim, one invoke, per
   ISS-t-007-rev-8's own exactly-once guarantee), so two of its own writes to the same row can not
   race each other. Flagged for the record, not fixed, since introducing a new persisted field
   (`summaryApprovedToken`) on `SessionDoc` felt like scope creep for a residual-fix unit; worth
   revisiting if `recordApprovedSessionSummary` ever gets a second caller.

## Open questions for the checker

- Is deriving the inner deadline from `expiresAt - Date.now()` (recomputed fresh at each of the two
  write call sites, floored at 1ms) the right shape, or would it read more safely as a single
  `boundedDeadlineMs` computed ONCE at the top of `writeApproved` and reused for both calls (simpler,
  but reintroduces a small amount of the same "clock drift between two writes" gap this fix closes,
  just far smaller in magnitude than the pre-fix 60s-vs-outer gap)?
- Is the `summaryApprovedAt`-as-match-key compensation design (Residual 3) an acceptable trade-off
  against a dedicated token field, given `writeApproved` is currently the only caller?

---

# Cycle 1: fix cycle (ISS-t-017-rev-2, ISS-t-017-c0-1, ISS-t-017-rev-1)

The checker PASSed cycle 0 (`qa/verdicts/t-017-residuals.md`), but the senior review BLOCKED it
(ISS-t-017-rev-2) and a data-engineer review filed a second, medium finding (ISS-t-017-rev-1). This
cycle fixes both. Two commits, each green before the next started (per the build brief's "commit as
you go" rule):

- `e44444d` fix(db): async onError rejection no longer unhandled (ISS-t-017-rev-2 / ISS-t-017-c0-1)
- `b77b3d9` fix(db,engine): closes the summary residue window (ISS-t-017-rev-1)

## What changed

### ISS-t-017-rev-2 (high, senior review BLOCK) / ISS-t-017-c0-1 (medium, same bug, found by the checker)

`packages/db/src/erasure.ts` `startErasureFenceSweep`'s `tick()`: the cycle-0 fix
(`try { options.onError?.(err); } catch { ... }`) only ever catches a SYNCHRONOUS throw from the
`onError` call itself. An async `onError` (e.g. `async (err) => { await logToService(err); }`) whose
returned promise rejects on a LATER microtask is not a throw at all from `tick()`'s point of view —
the call returns normally (a pending promise), and the rejection surfaces afterwards with nothing
awaiting or catching it: a genuine Node `unhandledRejection`, reproduced, crashing the process under
Node's default policy (>=15). `ErasureFenceSweepOptions.onError`'s type (`(err: unknown) => void`)
does not prevent this: TypeScript's structural typing accepts a `Promise`-returning function where
`void` is expected, so the unsafe shape compiled silently.

Fix: `tick()`'s `.catch((err) => ...)` now routes the `onError` call through
`Promise.resolve().then(() => options.onError?.(err)).catch(() => undefined)`, returned (not just
executed) so the outer `.catch` — and therefore `.finally`'s `inFlight` reset — waits for it. Whether
`onError` throws synchronously or its returned promise rejects later, the inner `.catch(() =>
undefined)` fully consumes it before anything is left unhandled. `onError`'s type is widened to
`(err: unknown) => void | Promise<void>`, making an async `onError` a documented, supported shape
instead of one that happened to compile via structural typing while silently losing its own
rejections.

### ISS-t-017-rev-1 (medium, data-engineer review) — the summary residue window between the two writes

`recordApprovedSessionSummary`'s own pre/post-check (added in cycle 0 for ISS-t-016-rev-1) can only
see a fence that exists by the time ITS post-check runs. A fence confirmed strictly AFTER that — in
the window before or during the very next call in the same approval, `applyApprovedDiff` — is
invisible to either write taken alone: `recordApprovedSessionSummary` has already returned
successfully (nothing further to compensate from inside it), and `applyApprovedDiff`'s own
pre-check/post-check only know about ITS OWN facts/edges, never the sibling summary write. The result:
a `fenced` outcome from `writeApproved` (via `applyApprovedDiff` throwing `StudentFencedError`) left
the approved summary on the session row, surviving until `executeErasure` eventually purged it — the
same class of bug ISS-t-016-rev-1 fixed for the OTHER ordering (fence during the summary write
itself), just shifted one write later. Three locations overclaimed this window as already closed by
the cycle-0 fix: `packages/db/src/facts.ts`'s module docstring (~106-118), `db-scope.test.ts`'s
`FENCE_AWARE_WRITERS` entry for `facts.ts` ("no longer leaves the summary behind"), and
`packages/engine/src/scribe/graph.ts`'s `invokeFenceAware` docstring (~352, "the approved summary
lives on the session row" — stated as a settled fact, not flagged as the open gap it was).

Fix (chosen over reordering the two writes, which the module docstring documents as intentional —
summary-before-facts so an erased row can never be silently recreated by facts alone):
- `packages/db/src/facts.ts` `recordApprovedSessionSummary` now returns `{ approvedAt: string }`
  instead of `void` — the exact match-key value its own post-check would use to undo its write.
- A new exported `undoApprovedSessionSummary(db, { sessionId, studentId, summaryApprovedAt })` factors
  out the same match-key `$unset` `recordApprovedSessionSummary`'s internal `undo` already ran; the
  internal `undo` now calls it, so there is exactly one implementation of this compensation.
- `packages/engine/src/scribe/nodes.ts` `writeApproved` keeps the `approvedAt` from
  `recordApprovedSessionSummary`'s result and, when the subsequent `applyApprovedDiff` call throws
  `StudentFencedError`, calls `undoApprovedSessionSummary` with it before rethrowing — so the fenced
  outcome is never reported until the summary this call wrote is actually gone too, whichever of the
  two writes caught the fence. If the undo itself throws, that error propagates instead of the
  original (never a silently-masked residue), matching `compensateIfFenced`'s own documented contract.
- The three overclaiming locations above are corrected to describe the real, now-accurate mechanism
  (cross-write compensation in `writeApproved`, not either write alone) instead of asserting the race
  was already closed.

**Reuse of the cycle-0 Residual 3 trade-off, not a new one.** `undoApprovedSessionSummary` reuses
`summaryApprovedAt` as its match key — the same theoretical same-millisecond-collision window cycle
0's Residual 3 already disclosed and reasoned about (still not a real risk: `writeApproved` is the
only caller of both `recordApprovedSessionSummary` and this new export, always sequential per thread).
No new field was introduced for this fix; the existing trade-off simply gained a second caller.

## TDD: RED before implementation, for both fixes

**ISS-t-017-rev-2** (`packages/db/tests/erasure.test.ts`, new test "ISS-t-017-rev-2: an ASYNC onError
whose returned promise rejects..."): temporarily reverted `tick()`'s `.catch` to the cycle-0
`try/catch` shape (source restored from the pre-cycle-1 commit), ran `npx tsx --test
tests/erasure.test.ts`:
```
RED: ✖ ISS-t-017-rev-2: ... — Error: async onError's own promise rejects ...
     (the unhandledRejection crashed the test itself, per node:test's own attribution, and corrupted
     mock-timer state for the NEXT test: "MockTimers is already enabled!" — the identical failure
     signature the cycle-0 manifest recorded for the synchronous-throw case, now reproduced for the
     async-rejection case the cycle-0 fix missed)
     2 failing (this test + the timer-state casualty after it)
```
Restored the fix, re-ran: `packages/db` 60/60, all green (was 59 before this test was added).

**ISS-t-017-rev-1** (`packages/engine/tests/scribe-persistence.test.ts`, new test "ISS-t-017-rev-1: a
fence that appears DURING applyApprovedDiff..."): temporarily removed the `StudentFencedError` branch
from `writeApproved`'s catch block (nodes.ts), ran `npx tsx --test tests/scribe-persistence.test.ts`:
```
RED: ✖ ISS-t-017-rev-1: ...
     AssertionError: ISS-t-017-rev-1: the summary must be compensated by writeApproved, not left for
     the purge
     + actual:   'Student wants to study computer science in Canada; the family budget is around 20
                  lakh rupees a year.'
     - expected: undefined
     1 failing
```
Restored the fix, re-ran: `packages/engine` 26/26, all green (was 25 before this test was added).

**Falsification, folded into the RED/GREEN cycles above** (each fix's own new test IS its
falsification):

| # | Mutation (= pre-fix source) | Result (targeted suite) |
|---|---|---|
| G1 | `tick()`'s onError call uses a plain `try { onError(err) } catch {}` (cycle-0 shape) | erasure.test.ts: the new async test's `process.on("unhandledRejection")` listener fires; the unhandled rejection crashes the test AND corrupts mock-timer state for the next one |
| G2 | `writeApproved`'s catch has no `StudentFencedError` branch | scribe-persistence.test.ts: the new test's summary-residue assertion fails — the summary text survives the fenced outcome |

## Verification (exact commands, run in the worktree, final state)

```
pnpm -r typecheck                      -> exit 0 (every package, incl. evals/tsconfig.json)
pnpm -r test                           -> exit 0
  apps/web 1/1, packages/providers 8/8, packages/schemas 50/50, packages/observability 57/57,
  packages/db 182/182 (was 181; +1: erasure.test.ts ISS-t-017-rev-2), apps/api 8/8,
  mcp/student-profile 12/12, mcp/university-kb 9/9,
  packages/engine 134/134 (was 133; +1: scribe-persistence.test.ts ISS-t-017-rev-1)
  total 461 / 461 (was 459)
python contracts/verify_contracts.py   -> "no frozen contracts yet (research phase) -- PASS by vacuity", exit 0
```

## Claims -> evidence (cycle 1)

| Claim | Evidence (test, file) |
|---|---|
| ISS-t-017-rev-2: a synchronous throw from onError is still caught (regression) | "ISS-t-015-c0-3: an onError that itself throws ..." (erasure.test.ts, unchanged, still green) |
| ISS-t-017-rev-2 / ISS-t-017-c0-1: an ASYNC onError whose returned promise rejects produces zero unhandled rejections; the interval survives | "ISS-t-017-rev-2: an ASYNC onError whose returned promise rejects ..." (erasure.test.ts, a live `process.on("unhandledRejection")` listener) |
| ISS-t-017-rev-1: a fence confirmed strictly after recordApprovedSessionSummary's own post-check, during applyApprovedDiff's first facts write, still leaves zero summary residue IMMEDIATELY (before executeErasure) | "ISS-t-017-rev-1: a fence that appears DURING applyApprovedDiff ..." (scribe-persistence.test.ts) |
| ISS-t-017-rev-1: applyApprovedDiff's own facts/edges compensation is unaffected by the new summary compensation | same test, `assert.equal(h.facts.size(), 0, ...)` |
| ISS-t-016-rev-1 (cycle 0, regression check): a fence DURING the summary write itself is still compensated by recordApprovedSessionSummary's own post-check | "ISS-t-016-rev-1: a fence that appears BETWEEN the summary write and applyApprovedDiff ..." (scribe-persistence.test.ts, unchanged, still green) |

## Residuals (unchanged from cycle 0, still not fixed here)

Cycle 0's three residuals (the offline-fake `timeoutMS` gap for ISS-t-016-c0-1's exact checker-probe
scenario; the T-016 manifest's unclaimed-recovery-not-leased residual; the theoretical
`summaryApprovedAt` same-millisecond collision window) are unchanged by this cycle — see the
"Residuals" section above. This cycle's own fix reuses, rather than deepens, Residual 3.

## Open questions for the checker (cycle 1)

- Is compensating the summary from `writeApproved` (one level up, on `StudentFencedError` from
  `applyApprovedDiff`) the right layer, or should `applyApprovedDiff` itself take an optional
  "also undo this on fence" callback so the compensation stays inside the fence-aware primitive
  rather than in the caller? Chose the caller-side shape here because `applyApprovedDiff` has no
  reason to know about a sibling write in a DIFFERENT collection that isn't its own concern, and
  because the existing precedent (`invokeFenceAware` in graph.ts) already compensates sibling
  writers — claim, session row, checkpoints — one level up from the writes themselves.
- Should `undoApprovedSessionSummary` also run when `applyApprovedDiff` throws
  `FencedWriterDeadlineError` (a timeout, not necessarily a confirmed fence) rather than only
  `StudentFencedError`? Left out deliberately: a timeout alone does not mean the student is fenced
  (D-016's deadline exists to bound EVERY fenced-writer scenario defensively, fenced or not), and
  `invokeFenceAware` (graph.ts) already re-checks the actual fence state via `fencedForPostCheck`
  after any thrown error — including a propagated `FencedWriterDeadlineError` — and compensates
  checkpoints/claim/sessionRow if genuinely fenced at that point. Whether that same later check should
  ALSO trigger the summary undo (a fence confirmed after `applyApprovedDiff`'s own post-check already
  ran clean, caught only by `invokeFenceAware`'s later, broader check) is a narrower, not-yet-tested
  residual of the same class as ISS-t-016-c0-1's own offline-fake gap — flagging it for the checker
  rather than silently expanding this fix's scope.

---

# Cycle 2: fix cycle (ISS-t-017-rev-3 / "c1-1", ISS-t-017-c1-2)

Cycle 1 FAILED (`qa/verdicts/t-017-residuals.md`, "Cycle checked: 1"): the async-onError fix from
cycle 1 traded a loud crash (ISS-t-017-rev-2) for a silent hang (a never-settling `onError` stalls
the whole sweep forever, filed as `ISS-t-017-rev-3` — the checker verdict's own prose calls it
"ISS-t-017-c1-1"), and a data-engineer-style finding from the SAME cycle-1 checker verdict
("ISS-t-017-c1-2" in its own prose; no separate ledger row exists for it, only the cycle-0
`ISS-t-017-rev-1` row it extends) showed the cycle-1 summary-compensation fix still misses one case:
`applyApprovedDiff` ending `FencedWriterDeadlineError` instead of `StudentFencedError`. One commit,
green before it landed (per the build brief's "commit as you go" rule):

- fix(db,engine): t-017 cycle 2 — fire-and-forget onError, deadline-error summary undo

## What changed

### ISS-t-017-rev-3 / "ISS-t-017-c1-1" (never-settling `onError` silently stalls the sweep forever)

`packages/db/src/erasure.ts` `startErasureFenceSweep`'s `tick()`: the cycle-1 fix RETURNED
`Promise.resolve().then(() => options.onError?.(err)).catch(() => undefined)` from the outer
`.catch(...)` callback, so the outer `.catch`'s own returned promise adopted that chain — and
therefore `.finally(() => { inFlight = false; })` waited for it too. That correctly closed the
async-rejection case (ISS-t-017-rev-2), but a caller-supplied `onError` can also return a promise
that NEVER settles at all (the realistic shape of an unbounded `fetch`/HTTP call to a logging or
alerting endpoint with no internal timeout — exactly the shape the docstring itself encourages: "a
caller SHOULD pass one wired to its logging"). A promise that never settles means `.finally` never
runs either, `inFlight` is never reset to `false`, and `if (inFlight) return;` silently no-ops every
later tick forever — the sweep dies silently instead of crashing loudly, still failing the same "one
bad tick never kills the interval or the process" guarantee the docstring makes.

Fix: make the `onError` call fire-and-forget. It is still invoked inside its own
`Promise.resolve().then(...).catch(() => undefined)` chain (so a synchronous throw or an async
rejection is still fully absorbed, with zero risk of an `unhandledRejection`), but that chain is now
constructed and left to run on its own — never `return`ed from, or otherwise adopted by, the outer
`.catch(...)` callback. The outer `.catch`'s own returned promise therefore settles immediately
regardless of what `onError` does, so `.finally` always runs as soon as the sweep's OWN
`releaseExpiredErasureFences` work settles — a hung `onError` can delay nothing, ever, because
nothing waits for it. `ErasureFenceSweepOptions.onError`'s docstring and `tick()`'s own inline comment
are both corrected to describe this fire-and-forget contract explicitly (previously they only
promised "never throw or reject", not "never hang", and described the OLD adopted-promise shape).

### ISS-t-017-c1-2 (a `FencedWriterDeadlineError` from `applyApprovedDiff` can still leave the summary behind)

`packages/engine/src/scribe/nodes.ts` `writeApproved`'s catch (cycle 1) only compensated the summary
on `err instanceof StudentFencedError`. `applyApprovedDiff` can ALSO end `FencedWriterDeadlineError`
— thrown specifically when its OWN post-check (`compensateIfFenced`) found the student NOT fenced at
that exact instant (a genuine fence there is `StudentFencedError` instead, the case already handled).
A `FencedWriterDeadlineError` alone is therefore ambiguous: it could be a plain slow write with
nothing to do with erasure (legitimate; D-012 makes the eventual retry idempotent, so the summary
should stay), or it could be an erasure confirmed strictly AFTER `applyApprovedDiff`'s own post-check
ran clean — a race narrower than the window `ISS-t-017-rev-1` already closed, invisible to
`applyApprovedDiff` itself for the same structural reason.

Fix: `writeApproved`'s catch adds a branch for `FencedWriterDeadlineError` that re-checks the fence
itself (`isStudentFenced`, the SAME read `compensateIfFenced`'s own post-check and `graph.ts`'s
`fencedForPostCheck` both use) before deciding. If the student is fenced now, OR the fence state can
not be read at all (fail-safe — matching `compensateIfFenced`'s and `fencedForPostCheck`'s own
"unreadable counts as fenced" rule), the summary is undone (via `undoApprovedSessionSummary`, the
same match-key compensation cycle 1 introduced) before rethrowing. An UNFENCED deadline error is left
alone: nothing to compensate, and the retry is idempotent under D-012. `nodes.ts`'s own docstring and
`graph.ts`'s `invokeFenceAware` docstring (which already documented the summary compensation as "not
this function's job") are both updated to describe the deadline-error branch too.

## TDD: RED before implementation, for both fixes

**ISS-t-017-rev-3** (`packages/db/tests/erasure.test.ts`, three new tests: never-settling promise,
a never-resolving thenable, and a non-function `onError`): temporarily restored `tick()`'s cycle-1
shape (the ADOPTED-promise version, from `git show HEAD:packages/db/src/erasure.ts` where `HEAD` was
the checker's cycle-1 FAIL verdict commit), ran `npx tsx --test tests/erasure.test.ts`:
```
RED: 2 of the 3 new tests fail —
  "an onError that returns a NEVER-SETTLING promise ...": 1 !== 0 (a later tick never recovers; the
    sweep is dead — the exact bug)
  "onError returning a THENABLE ... that never resolves ...": 1 !== 0 (adopted the same way, same hang)
  (the non-function-onError test already passed under the cycle-1 shape — regression coverage, not a
  gap the fire-and-forget fix closes; it throws synchronously inside the SAME `.then()`, already
  absorbed by the cycle-1 code's own `.catch(() => undefined)`)
```
Restored the fix, re-ran: `packages/db` 66/66, all green (was 63 before these 3 tests were added).

**ISS-t-017-c1-2** (`packages/engine/tests/scribe-persistence.test.ts`, two new tests calling
`writeApproved` directly — not through the full graph, to isolate applyApprovedDiff's own inner
deadline from the OUTER graph-level `invokeFenceAware` deadline/AbortController, which otherwise races
unpredictably against the same short `writerDeadlineMs` and obscures which layer actually compensated
the summary): temporarily removed the new `FencedWriterDeadlineError` branch from `writeApproved`'s
catch, ran `npx tsx --test tests/scribe-persistence.test.ts`:
```
RED: 1 of the 2 new tests fails —
  "an erasure confirmed strictly AFTER applyApprovedDiff's own post-check ran clean ...":
    AssertionError: expected at least 5 fence reads (4 pre-existing + writeApproved's own re-check),
    got 4 -- writeApproved's catch never re-checked the fence at all pre-fix, so the summary
    survived (confirmed separately: row.summary was still DEFAULT_SUMMARY, not undefined)
  (the UNFENCED-deadline-error test already passed pre-fix — correct behaviour needs no new code
  there, since the pre-fix catch already left the summary alone on any non-StudentFencedError)
```
Restored the fix, re-ran: `packages/engine` 28/28, all green (was 26 before these 2 tests were added).

**Falsification, folded into the RED/GREEN cycles above:**

| # | Mutation (= pre-fix source) | Result (targeted suite) |
|---|---|---|
| H1 | `tick()`'s `.catch` callback RETURNS (adopts) the onError chain (cycle-1 shape) | erasure.test.ts: never-settling and thenable tests both fail — a later tick never recovers |
| H2 | `writeApproved`'s catch has no `FencedWriterDeadlineError` branch (cycle-1 shape) | scribe-persistence.test.ts: the fenced-deadline-error test's fence-read-count assertion fails, and the summary is left on the row |

**Hostile probes run before handback (scratch-only, not committed, per the build brief's "second-to-last
cycle" requirement) — all passed against the FIXED source:**
- `packages/db`: slow-then-reject `onError` (resolves several microtask turns, THEN rejects); a sync
  throw on tick 1 combined with an async reject on tick 2 (back-to-back, no unhandledRejection either
  time); an `onError` that throws only on its SECOND call (3 failing ticks, only the middle one's
  `onError` call is broken) — no cross-tick contamination, the interval recovers on the 4th tick.
- `packages/engine`: `writeApproved`'s own re-check (the 5th fence read) itself throws (the erasure
  fence collection is unreachable at that exact instant) — the fail-safe path undoes the summary
  anyway, matching `compensateIfFenced`'s and `fencedForPostCheck`'s own "unreadable = fenced" rule.

## Verification (exact commands, run in the worktree, final state)

```
pnpm -r typecheck                      -> exit 0 (every package, incl. evals/tsconfig.json)
pnpm -r test                           -> exit 0
  apps/web 1/1, packages/providers 8/8, packages/schemas 50/50, packages/observability 57/57,
  packages/db 185/185 (was 182; +3: erasure.test.ts, ISS-t-017-rev-3's 3 new tests), apps/api 8/8,
  mcp/student-profile 12/12, mcp/university-kb 9/9,
  packages/engine 136/136 (was 134; +2: scribe-persistence.test.ts, ISS-t-017-c1-2's 2 new tests)
  total 466 / 466 (was 461)
python contracts/verify_contracts.py   -> "no frozen contracts yet (research phase) -- PASS by vacuity", exit 0
```

## Claims -> evidence (cycle 2)

| Claim | Evidence (test, file) |
|---|---|
| ISS-t-017-rev-3: a never-settling `onError` does not stall `inFlight`'s reset; a LATER tick still runs and releases an expired fence | "ISS-t-017-rev-3: an onError that returns a NEVER-SETTLING promise does not stall the sweep ..." (erasure.test.ts) |
| ISS-t-017-rev-3: a never-resolving THENABLE (not a native Promise) behaves identically — never adopted | "ISS-t-017-rev-3: onError returning a THENABLE ..." (erasure.test.ts) |
| ISS-t-017-rev-3 (regression): a synchronous throw and an async rejection are both still absorbed, zero unhandledRejection | "ISS-t-015-c0-3: an onError that itself throws ..." + "ISS-t-017-rev-2: an ASYNC onError whose returned promise rejects ..." (erasure.test.ts, unchanged, still green) |
| ISS-t-017-rev-3 (defensive): a non-function `onError` does not crash `tick()` or stall the sweep | "ISS-t-017-rev-3: a non-function onError ..." (erasure.test.ts) |
| ISS-t-017-c1-2: a FENCED `FencedWriterDeadlineError` (fence confirmed strictly after applyApprovedDiff's own post-check ran clean) still removes the summary IMMEDIATELY | "ISS-t-017-c1-2: an erasure confirmed strictly AFTER applyApprovedDiff's own post-check ran clean ..." (scribe-persistence.test.ts, calls `writeApproved` directly) |
| ISS-t-017-c1-2: an UNFENCED `FencedWriterDeadlineError` (a plain slow write) leaves the summary alone | "ISS-t-017-c1-2: an UNFENCED FencedWriterDeadlineError ..." (scribe-persistence.test.ts) |

## Residuals (unchanged from cycle 0/1, still not fixed here)

The same three residuals from cycle 0 (the offline-fake `timeoutMS` gap; the T-016
unclaimed-recovery-not-leased residual; the theoretical `summaryApprovedAt` same-millisecond
collision window) are unchanged by this cycle — see the "Residuals" section above cycle 1. Neither
of this cycle's own fixes introduces a new one: the fire-and-forget `onError` change is strictly a
liveness fix inside `tick()` (no new persisted state, no new match key); the `FencedWriterDeadlineError`
branch reuses the EXISTING `undoApprovedSessionSummary` match-key compensation cycle 1 already
introduced, with one extra read (`isStudentFenced`) that carries the same `FENCE_POSTCHECK_TIMEOUT_MS`
bound every other post-check read in this codebase already uses.

## Open questions for the checker (cycle 2)

- The fire-and-forget `onError` call is now a genuinely detached, unobserved promise chain (by
  design — that is exactly what stops a hung `onError` from blocking `inFlight`'s reset). Is leaving
  it fully unobserved acceptable, or should `tick()` at least log (via a SEPARATE, non-configurable
  path — not `onError` itself, to avoid re-introducing the same hang risk one level up) if the
  fire-and-forget chain is still pending after some bound, as a last-resort liveness signal for an
  operator? Left out here as likely scope creep for a residual-fix cycle (it would need its own new
  constant, its own test, and arguably its own issue), but flagging it since "silent" is exactly the
  property ISS-t-017-rev-3 itself criticized in the crash-vs-hang tradeoff.
- `writeApproved`'s re-check on `FencedWriterDeadlineError` adds one more `erasure_fences` read to the
  approval path's worst case (a 5th read, only reached when applyApprovedDiff itself already timed
  out — not on the common, fast path). Is re-reading directly (`isStudentFenced`) the right layer, or
  would it be cleaner for `applyApprovedDiff` to expose whatever its OWN post-check already observed
  (even though, by construction, that observation is always "not fenced" for exactly this branch,
  since a fenced post-check produces `StudentFencedError` instead) — i.e., is there ever a case where
  re-reading at the caller level says something DIFFERENT from what a hypothetical exposed post-check
  result would have said? Reasoned through and believed equivalent (the whole reason this branch
  exists is that the fence changed state AFTER applyApprovedDiff's own read), but flagging the
  reasoning for a second look rather than asserting it silently.
