# Verdict — t-017-residuals

**Verdict:** FAIL
**Cycle checked:** 1
**Unit:** T-017 (residuals: recordApprovedSessionSummary fence-compensation, writer-deadline/lease
binding, and the T-015 sweep/startApi hardening residuals) — cycle 1: async onError, summary
residue window
**Contract:** B3, B12, B14, B15 primary (qa/contracts/counselling-engine.md); D-012, D-014, D-015,
D-016, D-017
**Diff range checked:** `5c748fe..1cbc701` (`e44444d` + `b77b3d9`, two commits: async onError fix,
summary-residue-window fix)
**Manifest read:** `qa/manifests/t-017-residuals.md` (Status: ready-for-check, Fix cycle: 1,
"Cycle 1" section)
**Issues addressed (claimed):** ISS-t-017-rev-2 (high, senior review BLOCK), ISS-t-017-c0-1
(medium, same defect found independently by cycle 0), ISS-t-017-rev-1 (medium, data-engineer
review — summary residue window)

## Cycle-0 history (kept, not re-litigated)

Cycle 0 checker verdict: PASS. A fresh, independent adjudication subagent then reproduced the
senior-review BLOCK (ISS-t-017-rev-2: an async `onError` rejection escapes `tick()` as an
unhandled rejection and crashes the sweep's process) and overturned it to FAIL, reasoning that "a
process-crash path cannot be carried forward as an accepted residual" because it stops the DPDP
erasure-fence sweep. T-017 went to fix cycle 1 to close that plus a data-engineer review finding
(ISS-t-017-rev-1, the summary residue window one write later). The full cycle-0 method and
findings are preserved below the `---` separator (byte-intact, as the brief requires).

## 1. Verification commands re-run (worktree `D:\vc\.worktrees\t-017-residuals`)

```
$ pnpm install
Scope: all 10 workspace projects; lockfile up to date. Done in 1.1s (exit 0)

$ pnpm -r typecheck
9/9 packages "Done" (apps/web, packages/providers, packages/schemas, packages/observability,
packages/db, apps/api, mcp/student-profile, mcp/university-kb, packages/engine + evals/tsconfig.json)
-- exit 0, no errors.

$ pnpm -r test
apps/web 1/1, packages/providers 8/8, packages/schemas 50/50, packages/observability 57/57,
packages/db 182/182, apps/api 8/8, mcp/student-profile 12/12, mcp/university-kb 9/9,
packages/engine 134/134
TOTAL 461/461, 0 fail -- matches the manifest's claimed count exactly.

$ python contracts/verify_contracts.py
verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity (exit 0)
```

## 2. Method

Read the full cycle-1 diff (`git diff 5c748fe..1cbc701`) for both commits: `packages/db/src/erasure.ts`
(`tick()`'s onError handling), `packages/db/src/facts.ts` (`undoApprovedSessionSummary`,
`RecordApprovedSessionSummaryResult.approvedAt`), `packages/engine/src/scribe/nodes.ts`
(`writeApproved`'s new catch branch), `packages/engine/src/scribe/graph.ts` (`invokeFenceAware`'s
updated docstring), plus the new tests in `erasure.test.ts` and `scribe-persistence.test.ts`.
Cross-read `compensateIfFenced`, `isStudentFenced`, `WriterDeadline`, and `invokeFenceAware`'s full
body (`graph.ts:363-410`) to trace exactly which error type reaches which catch, since the open
questions the manifest itself poses (FencedWriterDeadlineError vs StudentFencedError; a
never-settling onError) require tracing the control flow precisely, not just reading the diff.

Falsification ran in a scratch copy (robocopy, `.git`/`node_modules` excluded, `pnpm install`) at
`...\scratchpad\t017-c1-falsify`, per the brief's hard rule:
- Reverted `packages/db/src/erasure.ts` to the pre-cycle-1 commit (`5c748fe`) and re-ran
  `erasure.test.ts`: RED confirmed — the new `ISS-t-017-rev-2` async test fails with the escaping
  error, and the NEXT test's mock-timer state is corrupted (`MockTimers is already enabled!`),
  reproducing the exact failure signature the manifest documents. Restored: 60/60 green.
- Reverted `packages/engine/src/scribe/nodes.ts` to `5c748fe` and re-ran
  `scribe-persistence.test.ts`: RED confirmed — the new `ISS-t-017-rev-1` test fails
  (`actual: '<summary text>', expected: undefined`). Restored: 26/26 green.

Four new probe files (scratch-only, not committed to the project):
- `packages/db/tests/checker-probe-c1.test.ts` — hostile `onError` shapes beyond the manifest's
  own tests: a promise that never settles, a thenable, a non-function value, and a sync-throw
  regression check.
- `packages/engine/tests/checker-probe-c1-summary-window.test.ts` — engineers the exact scenario
  the manifest's own "Open questions for the checker" raises: applyApprovedDiff ending
  `FencedWriterDeadlineError` while a fence is confirmed in the same narrow window.
- `packages/db/tests/checker-probe-c1-undo-matchkey.test.ts` — directly probes
  `undoApprovedSessionSummary`'s match-key guarantee (a stale `approvedAt` must never clobber a
  later legitimate write) at the exact exported function `writeApproved` now calls.

## 3. Findings, by manifest issue

**ISS-t-017-rev-2 (high, senior review BLOCK) / ISS-t-017-c0-1 (medium, same defect) —
SYNCHRONOUS and single-rejection ASYNC onError. Confirmed fixed, falsified, and regression-tested
against a hostile case the manifest didn't cover.** The fix (`Promise.resolve().then(() =>
options.onError?.(err)).catch(() => undefined)`, returned so the outer `.catch`/`.finally` wait
for it) correctly closes both the synchronous-throw case (regression, still green) and the
single-async-rejection case the manifest's own new test targets (falsified above). My own probes
extended this with a thenable (not a native Promise) and a non-function `onError` value: both
recover cleanly, no unhandled rejection, the interval survives.

**NEW FINDING — ISS-t-017-c1-1 (high, blocking): a never-settling `onError` permanently and
silently stalls the entire sweep, not just the failing tick.** `tick()`'s fix makes the outer
`.catch(...).finally(() => { inFlight = false })` WAIT for `onError`'s own promise chain to settle
(a correct fix for the rejection case). But `.finally()`'s callback only runs when its antecedent
promise SETTLES — and if `onError` returns a promise that never resolves NOR rejects (e.g. an
`async` logging call with no timeout, hung on a stuck connection — exactly the documented,
encouraged usage: "a caller SHOULD pass one wired to its logging"), the whole
`Promise.resolve().then(...).catch(...)` chain never settles either, so `.finally()` NEVER runs.
`inFlight` is never reset to `false`, and every subsequent tick hits `if (inFlight) return;` and
silently no-ops — forever, for the remaining life of the process, not just the one failing tick.

Empirically confirmed (`checker-probe-c1.test.ts`, "PROBE c1: onError returns a promise that NEVER
settles"): `onError` was called exactly once; across 4 further ticks it was never called again
(the sweep is dead). This directly contradicts the code's own docstring, word for word: "so one
bad tick never kills the interval OR the process" (`erasure.ts` ~641-645) — for this one case, a
bad tick DOES kill the interval, silently, with no crash, no log line, no `unhandledRejection`, and
nothing anywhere in this codebase that monitors sweep liveness (no last-tick metric, no watchdog —
confirmed by grep across `erasure.ts` and `apps/api/src/index.ts`).

**Why this is FAIL, not a residual, by the SAME reasoning the cycle-0 independent check already
established for this exact function.** That check's own words: "the effect is actually a crash of
the API process that runs the DPDP fence sweep. When that process dies, the sweep stops, and
expired erasure fences are never released (the B15 fence behaviour stops). A process-crash path
cannot be carried forward as an accepted residual." The load-bearing clause is the IMPACT — "the
sweep stops, and expired erasure fences are never released" — not the specific mechanism (a crash).
My finding produces the identical impact (the sweep stops; B15 fence releases stop) through a
different, arguably WORSE mechanism: no crash means no process-manager restart, no loud signal, no
`unhandledRejection` for anything watching the process — just silence. A student's erasure fence
that should release after `MINIMUM_FENCE_HOLD_MS` instead stays up indefinitely once any sweep tick
hits a broken async `onError`, refusing every subsequent legitimate writer for that student forever
(exactly the "stuck-CLOSED fence" failure mode `startErasureFenceSweep`'s own docstring says this
sweep exists to prevent — inverted from a crash into a silent hang).

**Mitigating context, weighed and still not enough to avoid FAIL.** The SHIPPED default
(`apps/api/src/index.ts` `defaultSweepErrorLogger`) is a plain synchronous `console.error` and is
NOT exposed to this — today's actual deployment is safe. This is a defect in the exported,
reusable `startErasureFenceSweep` API contract and its explicit docstring promise, reachable the
moment any caller (a very plausible next step, given the docstring's own encouragement to wire a
real logger) passes an async `onError` without an internal timeout — a common real-world shape
(an unbounded `fetch`/HTTP call to a logging/alerting endpoint). Given the severity of the
consequence when it does trigger (total, silent, permanent halt of the B15 fence-release
mechanism) and the precedent already set in this exact review chain for a sweep-halting defect,
this is graded the same way: not an acceptable residual.

**ISS-t-017-rev-1 (medium, data-engineer review) — the summary residue window between the two
writes. Confirmed fixed and falsified for its two tested windows** (a fence appearing between the
summary write and applyApprovedDiff, and a fence appearing DURING applyApprovedDiff's first fact
write — both via `StudentFencedError`, both immediately compensated by `writeApproved`'s new catch
calling `undoApprovedSessionSummary`). The match-key guarantee (a stale `approvedAt` never clobbers
a later legitimate write) holds, independently reprobed directly against the exported
`undoApprovedSessionSummary` function (not just recordApprovedSessionSummary's own internal call
to it) — `checker-probe-c1-undo-matchkey.test.ts`.

**NEW FINDING — ISS-t-017-c1-2 (medium, non-blocking, logged for the next touch): the summary can
still survive when applyApprovedDiff ends `FencedWriterDeadlineError` instead of
`StudentFencedError`.** `writeApproved`'s catch (`nodes.ts:411`) only compensates on
`instanceof StudentFencedError`; a `FencedWriterDeadlineError` falls through to the bottom `throw
err`, untouched. Traced precisely: `applyApprovedDiff` can only throw `FencedWriterDeadlineError`
when its OWN `compensateIfFenced` post-check found the student NOT fenced at that instant (a
genuine fence there throws `StudentFencedError` instead, which IS handled) — so this is reachable
only when an erasure is confirmed in the narrow window strictly AFTER that post-check ran clean.
Reproduced in `checker-probe-c1-summary-window.test.ts` by seeding a real fence document
immediately after intercepting that exact post-check's read: the summary was left on the row; in
this probe's specific timing the outer `invokeFenceAware`'s own later, broader fence check also
raced the same narrow window and did not observe the injected fence either, so the run surfaced a
raw `FencedWriterDeadlineError` rather than a clean `{kind:"fenced"}` — but the fact under test
(nothing compensates the summary on this path) held regardless of how the outer outcome landed.
Judged non-blocking: it requires losing a race narrower than the one D-016's own
`MINIMUM_FENCE_HOLD_MS` margin is sized around (this is a NEW erasure confirmed after the writer's
own post-check, not a missed existing one — D-016's proof doesn't cover that case, and can't: no
finite margin can), it self-heals via a caller retry (`resumeScribe(null)`, idempotent per D-012)
or, absent a retry, via `executeErasure`'s eventual purge of the whole row, and it matches the
already-accepted precedent of the T-016 manifest's own disclosed Residual 1 and Residual 3
(narrow-timing, bounded, self-healing, no data corruption or unbounded residue). The manifest's
own "Open questions for the checker" flagged this exact scenario before shipping, which is why it
is logged rather than escalated to blocking.

## 4. Regression

The full `pnpm -r test` re-run (461/461) covers every cycle-0 fix, since none of the underlying
production code for those (facts.ts's fence pre/post-check shape, client.ts's strict timeout
parsing, the AggregateError close()-throws-too path) changed in cycle 1 — only `erasure.ts`'s
`tick()`, `facts.ts`'s new `undoApprovedSessionSummary`/`RecordApprovedSessionSummaryResult`, and
`nodes.ts`'s `writeApproved` catch branch changed. Cycle 0's own ad-hoc scratch probe files were
session-local and not preserved between checker sessions; the committed regression coverage
(`facts.test.ts`, `client.test.ts`, `erasure.test.ts`'s pre-existing tests, all green) stands in
for re-running them verbatim, and my own new probes target specifically the code cycle 1 touched.

## 5. Verdict rationale

**FAIL.** ISS-t-017-c1-1 (a never-settling `onError` permanently and silently halts the entire
DPDP erasure-fence sweep, contradicting the code's own explicit docstring guarantee) is the same
class of defect — a path that stops the B15 fence-release mechanism — that this exact review chain
already ruled can not be carried forward as an accepted residual, for the same reason: the impact
(fence releases silently stop, forever, for the life of the process) is what matters, not whether
the specific mechanism is a crash or a silent hang. `pnpm -r typecheck`, `pnpm -r test` (461/461),
and `verify_contracts.py` all reproduce green, and ISS-t-017-rev-1's summary-residue fix is solid
for its two tested windows (independently falsified and reprobed) — but the async-onError fix
(ISS-t-017-rev-2 / ISS-t-017-c0-1) traded a loud failure mode for a silent one that is, if
anything, worse for operators to detect. ISS-t-017-c0-1 is updated to `fixed` in the ledger (the
SPECIFIC defect it described — a synchronous try/catch missing an async rejection — is genuinely
closed); ISS-t-017-c1-1 is the new, higher-severity replacement in the same area. T-017 goes to fix
cycle 2.

**Fix needed for ISS-t-017-c1-1** (small, scoped): race the `onError` call against an internal
timeout inside `tick()`, e.g. `Promise.race([Promise.resolve().then(() =>
options.onError?.(err)), delay(SOME_BOUND_MS)]).catch(() => undefined)`, so a hung `onError` can
never prevent `.finally` from resetting `inFlight`. Add a test with a never-settling `onError`
asserting the sweep recovers on a later tick (the shape of my probe test can be adapted directly).
ISS-t-017-c1-2 does not block; note it in `facts.ts`'s module docstring next to the existing
ISS-t-017-rev-1 note, or fix it in the same pass if convenient (check the fence directly in
`writeApproved`'s catch for `FencedWriterDeadlineError` too, rather than trusting the error type
alone).

---

## Cycle 0 (preserved byte-intact below)

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

---

## INDEPENDENT CONCURRENT CHECK
**Cycle checked: 0** · **Date:** 2026-09-25 16:45 · **Checker:** fresh read-only adjudication subagent, dispatched by
the standing checker session. The verdict above is left byte-intact.

**VERDICT: FAIL. The PASS above does not stand.**

**Trigger:** the senior-software-engineer review Block (ISS-t-017-rev-2, high, main `2943658`, 13:27) conflicts with
the PASS above (13:40). Project rule: a review Block overrides a checker PASS unless it is disproved. It was **not**
disproved. It was reproduced.

**What I re-ran myself** (scratch copy of HEAD `30e38ea` outside D:\vc, `pnpm install` clean, `packages/db` 181/181
green before probing), using a probe built on the package's own `createFakeDb()` with `erasure_fences.find` forced to
throw:
```
CASE A (sync-throw onError):   unhandledRejections = 0  caughtBySweep = 8   -> handled as intended
CASE B (async-reject onError): unhandledRejections = 7  caughtBySweep = 0   -> every tick escapes
```
`tick()` (erasure.ts ~621-640) wraps the *call* `options.onError?.(err)` in a synchronous try/catch. An async
`onError` rejects later, is never awaited, and becomes a process-level `unhandledRejection`. Node >= 15 exits the
process on that. `ErasureFenceSweepOptions.onError: (err) => void` accepts an async function silently.

**Why this is FAIL and not a medium residual:** the PASS above graded ISS-t-017-c0-1 as "a log line lost". The effect
is actually a **crash of the API process that runs the DPDP fence sweep**. When that process dies, the sweep stops,
and expired erasure fences are never released (the B15 fence behaviour stops). A process-crash path cannot be carried
forward as an accepted residual.

FAILURES:
- [B14/B15] sev: high · an async `onError` rejection escapes `tick()` as an unhandledRejection and crashes the process
  hosting the erasure fence sweep · `await` the handler: `try { await options.onError?.(err) } catch {}` (or wrap the
  handler in `Promise.resolve().then(...)`). Add a test that registers an `unhandledRejection` listener and asserts
  it fires 0 times for an async-rejecting onError · issue: ISS-t-017-rev-2 (ISS-t-017-c0-1 is the same defect,
  escalated to high)

CAPABILITY-COVERAGE: not re-run (adjudication scope: the Block claim only)
LIVE-BROWSER: not-applicable (packages/db, packages/engine only)
ISSUES-WRITTEN: ISS-t-017-c0-1 escalated medium -> high (main ledger)
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent, adjudication)
EXPLANATION: The review Block is technically correct and reproduced. The cycle-0 PASS under-graded a process-crash
path as a logging nit. The fix is small, and T-017 goes to fix cycle 1.
