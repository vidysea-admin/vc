# Manifest: t-017-residuals

**Contract:** qa/contracts/counselling-engine.md (B3, B12, B14, B15 primary; D-012, D-014, D-015, D-016, D-017)
**Goal task:** T-017
**Status:** ready-for-check
**Fix cycle:** 0
**Diff range:** `8e5ed73..HEAD` on branch `wave/t-017-residuals`, one commit:
"fix(db,engine,api): t-017 summary fence compensation, lease bound, sweep/startApi hardening".
`8e5ed73` is main's tip ("decisions: D-017 session row + summary + claim lease (T-016); tasks: T-016
done, T-017 scope"), the branch point.
**Scope:** `packages/db/src/{facts,erasure,client}.ts`, `packages/db/tests/{facts,erasure,client,db-scope}.test.ts`,
`packages/engine/src/scribe/{graph,nodes}.ts`, `packages/engine/tests/scribe-persistence.test.ts`,
`apps/api/src/index.ts`, `apps/api/tests/index.test.ts`, this manifest.
**Not touched:** `.claude/**`, `docs/DECISIONS.md`, `scripts/**`, `qa/contracts/**`, `TASKS.md` (left `open`),
`packages/schemas/**`, `packages/providers/**`, `packages/observability/**`, `mcp/**`, `apps/web/**`.
**Dual check:** no
**Issues addressed:** ISS-t-016-rev-1 (high), ISS-t-016-c0-1 (medium), ISS-t-016-c0-2 (low),
ISS-t-015-c0-1 (medium), ISS-t-015-c0-3 (medium), ISS-t-015-c0-2 (low), ISS-t-015-c0-4 (low)
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
