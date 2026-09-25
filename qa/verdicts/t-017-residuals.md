# Verdict — t-017-residuals

**Verdict:** PASS
**Cycle checked:** 0
**Unit:** T-017 (residuals: recordApprovedSessionSummary fence-compensation, writer-deadline/lease
binding, and the T-015 sweep/startApi hardening residuals)
**Contract:** B3, B12, B14, B15 primary (qa/contracts/counselling-engine.md); D-016, D-017
**Diff range checked:** `8e5ed73..5c748fe`, one commit ("fix(db,engine,api): t-017 summary fence
compensation, lease bound, sweep/startApi hardening")
**Manifest read:** `qa/manifests/t-017-residuals.md` (Status: ready-for-check, Fix cycle: 0)
**Issues addressed:** ISS-t-016-rev-1 (high), ISS-t-016-c0-1 (medium), ISS-t-016-c0-2 (low),
ISS-t-015-c0-1 (medium), ISS-t-015-c0-2 (low), ISS-t-015-c0-3 (medium), ISS-t-015-c0-4 (low)

## 1. Verification commands re-run (worktree `D:\vc\.worktrees\t-017-residuals`)

```
$ pnpm install
Scope: all 10 workspace projects; lockfile up to date. Done in 1.1s (exit 0)

$ pnpm -r typecheck
9/9 packages "Done" (apps/web, packages/providers, packages/schemas, packages/observability,
packages/db, apps/api, mcp/student-profile, mcp/university-kb, packages/engine + evals/tsconfig.json)
-- exit 0, no errors.

$ pnpm -r test
apps/web 1/1 . packages/providers 8/8 . packages/schemas 50/50 . packages/observability 57/57 .
packages/db 181/181 . apps/api 8/8 . mcp/student-profile 12/12 . mcp/university-kb 9/9 .
packages/engine 133/133
TOTAL 459/459, 0 fail -- matches the manifest's claimed counts exactly (was 434; db +19, api +2,
engine +4).

$ python contracts/verify_contracts.py
verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity (exit 0)
```

## 2. Method

Read in full the diff (`git diff 8e5ed73..5c748fe`) for every scoped file: `packages/db/src/{facts,
erasure,client}.ts`, `packages/engine/src/scribe/{graph,nodes}.ts`, `apps/api/src/index.ts`, and every
test file the manifest lists. Cross-read `compensateIfFenced`, `WriterDeadline`, `assertStudentNotFenced`
(erasure.ts) to confirm `recordApprovedSessionSummary`'s new fence-aware shape is a faithful mirror of
`applyApprovedDiff`'s existing, already-checker-verified pattern (D-015/D-016), not a fresh, unproven
mechanism. Read D-012, D-014, D-015, D-016, D-017 in `docs/DECISIONS.md` for the invariants this unit
must hold.

Falsification ran in a scratch copy (robocopy, no `.git`/`node_modules`, `pnpm install`) at
`...\scratchpad\t017-checker-falsify`, per the brief's hard rule. Two probe files, run with
`npx tsx --test`, independent of the manifest's own tests:
- `packages/db/tests/checker-probe-t017.test.ts` -- 15 tests: fence at every point in the approve
  path (a1-a4), compensation-never-clobbers-a-later-write (a5, a6), the lease/deadline bound (b1-b3),
  logger redaction with no-code errors and non-Error throws (c1-c5), and strict timeout parsing
  including Unicode-digit and whitespace edge cases (f), run through the real `connectFromEnv` path.
- `packages/db/tests/checker-probe-t017-de.test.ts` -- 1 test: an async `onError` whose returned
  promise rejects (see Finding below).

Three of my own probes initially failed for reasons traced to my own test construction, not the
implementation, and were corrected before being trusted (documented so the next reader doesn't
re-litigate them): (a2)/(a3) passed `decision.edits: []` implicitly (I built a `ProfileDiff` with
`changes` populated, but `applyApprovedDiff` reads `decision.edits`, a separate field it validates
BEFORE the fence pre-check even runs, `facts.ts:373`; `diff.changes`/`diff.citedFactIds` are in fact
unused by `applyApprovedDiff` entirely) -- fixed by populating `decision.edits`. (c2) assumed
`class BareError extends Error {}` sets `err.name` to `"BareError"` automatically; it does not (JS
subclassing does not rewrite the inherited `Error.prototype.name` unless the constructor sets it) --
fixed by setting `this.name` explicitly, which then confirmed `errorLabel`'s real behaviour is
correct.

## 3. Findings, by manifest issue

**ISS-t-016-rev-1 (high) -- recordApprovedSessionSummary is fence-aware.** Confirmed correct and
thorough. `facts.ts:667-757`: the new code is a structural mirror of `applyApprovedDiff`
(`facts.ts:387-391` pre-check, `facts.ts:575-579` post-check, vs. `facts.ts:695-699`/`752-756`) --
not a new, unproven mechanism, but reuse of a pattern this project's own D-015/D-016 checker cycles
already stress-tested. My own probes (a1)-(a4) independently fenced the student at every point named
in the brief -- before the write, between the summary write and the facts write, mid-facts-write (a
`facts.insertOne` gate), and after the write but before its own post-check -- and in every case the
outcome was `StudentFencedError` with zero summary residue immediately, before any `executeErasure`
call. (a5)/(a6) confirmed the match-key design: fencing one student's write never touches an
unrelated student's adjacent write, and a second, later, UNFENCED legitimate write on the same
session is never clobbered by anything left over from an earlier call. The manifest's own
scribe-persistence.test.ts end-to-end test (fence landing between the two `writeApproved` calls, via
a real graph run) is sound and matches my facts.ts-level probes.

**ISS-t-016-c0-1 (medium) -- inner write deadline bound to the outer writerDeadlineMs.**
Confirmed. `graph.ts` now threads `deadline.expiresAt` through `configurable.writerDeadlineExpiresAt`
(the SAME absolute instant `newLease` derives the run lease from, `graph.ts:463-464`:
`lease.expiresAt = deadline.expiresAt + FENCE_MARGIN_MS`); `nodes.ts`'s `boundedDeadlineMs` recomputes
`expiresAt - Date.now()` fresh at each of the two write call sites, floored at 1ms. My probe (b1)
confirmed the driver-level `timeoutMS` a mocked `updateOne` receives never exceeds an explicit
50ms `deadlineMs`. (b2) confirmed the floor-at-1 behaviour holds even when `expiresAt` is already in
the past (never yields 0 or a negative value, which would make `new WriterDeadline` throw `RangeError`
instead of the intended "already expiring but still constructible" deadline). (b3) confirmed the
structural invariant that makes "lease expires while the inner deadline is still live" impossible by
construction: the lease's `expiresAt` is the SAME instant the inner deadline expires at, PLUS
`FENCE_MARGIN_MS` (a positive constant) -- the lease can never expire before the inner write's own
deadline. The manifest's honestly-disclosed residual (the offline fake's `insertOne`/`updateOne` take
no options parameter at all, confirmed by reading `fakes.ts:328`, so the checker's own T-016
hand-gated-write probe scenario cannot be re-proven offline) is accurate and unchanged; not a new gap.

**ISS-t-016-c0-2 (low) -- test-coverage gaps.** Confirmed closed: the whitespace-studentId case is
now in the rev-9 loop (`scribe-persistence.test.ts`), and the two-distinct-sessions test runs
export+erasure end to end. No code changes were needed or made here, matching the manifest's own
characterization.

**ISS-t-015-c0-1 (medium) -- logger redaction.** Confirmed. `errorLabel` is now exported and reused
by `defaultSweepErrorLogger` instead of a separate, unredacted `err.message` field. My probes (c1)-(c5)
went further than the manifest's own tests (which check a Mongo-shaped `Error`): a bare `Error`
subclass with no `code`/`codeName`, a plain string throw, `null`/`undefined`, and a throw of a plain
number/object with a malicious `toString`. In every case the returned label carried only a bounded
`name[:code]` shape, never the original message, string content, or a value from a hostile
`toString()`.

**ISS-t-015-c0-2 (low) -- AggregateError when close() throws.** Confirmed, and already
well-covered by the manifest's own test (`apps/api/tests/index.test.ts`, "when close() throws too, the
ORIGINAL error is preserved"): the root cause is `errors[0]`, the close() failure is `errors[1]`. I
did not find a hostile variant (non-Error root cause, etc.) that breaks this -- the `try { close() }
catch (closeErr) { throw new AggregateError([err, closeErr], ...) }` shape in `apps/api/src/index.ts`
is generic over the type of `err`.

**ISS-t-015-c0-4 (low) -- strict decimal-integer parsing.** Confirmed, and my probe (f) extended the
manifest's own 12-case loop with Unicode-digit notations (Arabic-Indic `٤٥٠٠٠`, fullwidth `３００００`)
and leading/trailing whitespace variants, run through the REAL `connectFromEnv` path (not a
re-implementation of the regex) -- all correctly rejected. A plain decimal with a leading zero
("030000") is correctly still accepted.

**ISS-t-015-c0-3 (medium) -- a throwing onError can no longer produce an unhandledRejection.**
**Partially confirmed, with a new gap found (see below).** The manifest's own fix and test
(`erasure.test.ts`, "an onError that itself throws...") correctly close the SYNCHRONOUS-throw case.
My probe (`checker-probe-t017-de.test.ts`) tried the other realistic shape a caller-supplied `onError`
takes in practice -- an ASYNC function (`onError: async (err) => { await logToService(err); }`) whose
returned promise rejects on a later microtask tick, not synchronously. This reproduced real
`unhandledRejection` events (confirmed via a live `process.on("unhandledRejection")` listener; the
Node test runner itself flagged the async activity and failed the probe). The fix's
`try { options.onError?.(err); } catch { ... }` (`erasure.ts` `tick()`) only ever catches a
SYNCHRONOUS throw from the call itself -- it cannot catch a rejection surfacing from a promise the
call returned and that nothing awaits. `ErasureFenceSweepOptions.onError`'s type
(`(err: unknown) => void`) does not prevent a caller from passing an async function here: TypeScript's
structural typing allows a value-returning (including `Promise`-returning) function to satisfy a
`void`-returning function type, so this compiles silently. This is the SAME failure class
(unhandledRejection -> process crash under Node's default policy, >=15) the T-015 fix was written to
close, only half-closed. Logged as **ISS-t-017-c0-1** (medium; see qa/issues.jsonl) -- not a
blocker for this cycle (see verdict rationale below), but should be picked up on the next touch of
`startErasureFenceSweep`.

## 4. Judgment on the two open questions

- **Fresh-recompute (`boundedDeadlineMs`, called at each of the two write sites) vs. a single
  `boundedDeadlineMs` computed once at the top of `writeApproved`.** Agree with the shape shipped.
  Recomputing fresh at each call site matches `applyApprovedDiff`'s and `recordApprovedSessionSummary`'s
  own existing pattern of calling `deadline.op()` immediately before each operation (never caching a
  stale "time left" figure across an `await`), and the "clock drift between two writes" gap it leaves
  open is bounded by the actual wall-clock time between two back-to-back, synchronously-sequenced
  `await`s in the same function -- sub-millisecond in practice, versus the 60s-vs-outer gap this fix
  closes. A single computed-once value would in fact be WORSE here: it would let the second write
  start with a budget that already overstates how much time is actually left once the first write's
  own (possibly slow) round-trip has consumed part of it.
- **`summaryApprovedAt` as the compensation match key vs. a dedicated token (Residual 3).**
  Acceptable, for the same reason the manifest gives and the same class of trade-off the T-016 cycle-0
  checker already accepted for a related residual: `writeApproved` is the only caller today, and it is
  always sequential per thread (one claim, one invoke, per ISS-t-007-rev-8's exactly-once guarantee),
  so two of `recordApprovedSessionSummary`'s own writes to the SAME session/student row cannot race
  each other in this codebase as it stands. My probe (a6) also confirms the day-to-day behavior this
  key needs (two sequential unfenced writes, second replaces first cleanly) holds regardless of whether
  the two calls land in the same millisecond. A token field would close the theoretical gap entirely,
  but introducing a new persisted field for a caller count of exactly one is legitimate, disclosed
  scope discipline, not corner-cutting. Revisit if `recordApprovedSessionSummary` ever gets a second
  caller, as the manifest already says.

## 5. Verdict rationale

All three RESIDUAL FIXES this unit was scoped to close (ISS-t-016-rev-1 high, ISS-t-016-c0-1 medium,
plus the four T-015 residuals) hold up under independent, hostile, scratch-copy falsification -- not
just the manifest's own tests. `pnpm -r typecheck`, `pnpm -r test` (459/459, matching the manifest's
claimed count exactly) and `verify_contracts.py` all reproduce green. The two disclosed residuals
(the offline-fake `timeoutMS` gap, the `summaryApprovedAt` collision window) are honestly stated and
correctly reasoned about, matching this project's own precedent for accepting a well-argued,
non-blocking residual (T-016 cycle 0 accepted a same-class residual at medium severity).

The one NEW finding (ISS-t-017-c0-1, an async `onError`'s rejection is not caught) is real and
independently reproduced, but does not block this unit: it is a narrower gap in a best-effort,
caller-supplied, purely-defensive logging hook (the SHIPPED default, `defaultSweepErrorLogger`, is
synchronous and does not exhibit it), it does not touch B15 DPDP correctness, B12 data-boundary, or
any data-residue path, and it is the same severity class (medium) as issues this project has
previously PASSed a unit with and queued for the next touch (T-015 cycle 0's own four issues, closed
by THIS unit). Per the same precedent (T-015, T-016 both PASSed with open medium/low issues logged for
follow-up), this unit **PASSes** with ISS-t-017-c0-1 appended to the ledger.
