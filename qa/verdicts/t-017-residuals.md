# Verdict — t-017-residuals

**Verdict:** PASS
**Cycle checked:** 2
**Unit:** T-017 (residuals: recordApprovedSessionSummary fence-compensation, writer-deadline/lease
binding, and the T-015 sweep/startApi hardening residuals) — cycle 2: fire-and-forget onError,
deadline-error summary undo
**Contract:** B3, B12, B14, B15 primary (qa/contracts/counselling-engine.md); D-012, D-014, D-015,
D-016, D-017
**Diff range checked:** `16c1370..bd22ade` (one commit: "fix(db,engine): t-017 cycle 2 —
fire-and-forget onError, deadline-error summary undo")
**Manifest read:** `qa/manifests/t-017-residuals.md` (Status: ready-for-check, Fix cycle: 2,
"Cycle 2" section)
**Issues addressed (claimed):** ISS-t-017-rev-3 / "ISS-t-017-c1-1" (never-settling `onError`
silently stalls the sweep forever), ISS-t-017-c1-2 (a `FencedWriterDeadlineError` from
`applyApprovedDiff` can still leave the summary behind)

## Cycles 0 and 1 history (kept, not re-litigated)

Cycle 0 checker verdict: PASS. A fresh, independent adjudication subagent then reproduced the
senior-review BLOCK (ISS-t-017-rev-2: an async `onError` rejection escapes `tick()` as an
unhandled rejection and crashes the sweep's process) and overturned it to FAIL. Cycle 1 fixed that
by making the outer `.catch(...).finally(...)` wait for `onError`'s own promise chain to settle,
plus a data-engineer-review finding (ISS-t-017-rev-1, the summary residue window one write later).
Cycle 1 checker verdict: **FAIL** — the cycle-1 fix traded a loud crash for a silent hang: an
`onError` that returns a promise that never settles (not rejects — never settles at all) makes
`.finally` never run either, so `inFlight` is never reset and every later tick silently no-ops
forever (filed as ISS-t-017-rev-3, called "ISS-t-017-c1-1" in the cycle-1 verdict's own prose). The
same cycle-1 verdict also filed a second, non-blocking NEW FINDING: `writeApproved`'s catch only
compensated the summary on `StudentFencedError`, not on `FencedWriterDeadlineError` (ISS-t-017-c1-2).
T-017 went to fix cycle 2 to close ISS-t-017-rev-3 and, optionally, ISS-t-017-c1-2. Both full prior
verdicts are preserved byte-intact below the `---` separator.

## 1. Verification commands re-run (worktree `D:\vc\.worktrees\t-017-residuals`)

```
$ pnpm install
Scope: all 10 workspace projects; lockfile up to date. Done in 1.3s (exit 0)

$ pnpm -r typecheck
9/9 packages "Done" (apps/web, packages/providers, packages/schemas, packages/observability,
packages/db, apps/api, mcp/student-profile, mcp/university-kb, packages/engine + evals/tsconfig.json)
-- exit 0, no errors.

$ pnpm -r test
apps/web 1/1, packages/providers 8/8, packages/schemas 50/50, packages/observability 57/57,
packages/db 185/185, apps/api 8/8, mcp/university-kb 9/9, mcp/student-profile 12/12,
packages/engine 136/136
TOTAL 466/466, 0 fail -- matches the manifest's claimed count exactly (was 461 after cycle 1;
db +3, engine +2).

$ python contracts/verify_contracts.py
verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity (exit 0)
```

## 2. Method

Read the full cycle-2 diff (`git diff 16c1370..bd22ade`) for both files it touches:
`packages/db/src/erasure.ts` (`tick()`'s onError handling, now fire-and-forget) and
`packages/engine/src/scribe/{nodes,graph}.ts` (`writeApproved`'s new `FencedWriterDeadlineError`
branch, `invokeFenceAware`'s updated docstring), plus the 5 new committed tests
(`erasure.test.ts` x3, `scribe-persistence.test.ts` x2). Cross-read `isStudentFenced`,
`compensateIfFenced`, `FENCE_POSTCHECK_TIMEOUT_MS`, and D-016's full "why that is enough" proof in
`erasure.ts`'s own comment block (lines ~211-249) and `docs/DECISIONS.md` D-016, since the checker
brief's own open question (a race after `writeApproved`'s own re-check) requires tracing that proof
precisely, not just reading the diff.

Falsification ran in a scratch copy (robocopy, `.git`-file/`node_modules` excluded, `pnpm install`)
at `...\scratchpad\t017-c2-falsify`, per the brief's hard rule. Two new probe files (scratch-only,
not committed):
- `packages/db/tests/checker-probe-c2-onerror.test.ts` — 4 tests: `onError` slow-then-rejects,
  rejects on the Nth call only, synchronously throws a non-`Error` value (plain string + a
  hostile-`toString` object), and a never-settling `onError` sustained across 300+ real ticks with
  a quantitative memory check.
- `packages/engine/tests/checker-probe-c2-writeapproved.test.ts` — 2 tests: an unreadable fence
  state on `writeApproved`'s own re-check (fail-safe undo), and the undo's match-key confirmed to
  touch only the calling session (an unrelated student's concurrent write is untouched).

All 6 pass against the fixed source (`bd22ade`). To confirm they are load-bearing, `erasure.ts`,
`nodes.ts` and `graph.ts` were reverted to the cycle-1 commit (`16c1370`) shape in the scratch copy
and re-run:
- The never-settling-`onError` probe hangs indefinitely against the cycle-1 shape (bounded-timeout
  re-run confirms it never completes — `onErrorCalls` never advances past 1, matching the cycle-1
  verdict's own empirical finding word-for-word: "the sweep is dead"). RED confirmed by hang, the
  correct signature for this exact bug class.
- The other 3 onError probes (slow-then-reject, Nth-call, non-Error throw) still pass against the
  cycle-1 shape — expected and correct: cycle 1's fix already fully closed the reject/throw cases;
  only the never-settle case was broken. Not a falsification gap — regression coverage confirming
  cycle 1's own fix is still solid, not the property cycle 2 changed.
Source restored to `bd22ade`; all 6 probes green again.

## 3. Findings, by manifest issue

**ISS-t-017-rev-3 / "ISS-t-017-c1-1" (a never-settling `onError` silently stalls the sweep) —
CONFIRMED FIXED, falsified, and the checker's own memory-growth question answered
empirically.** The fix makes `tick()`'s `onError` call fully fire-and-forget: it is still invoked
inside `Promise.resolve().then(() => options.onError?.(err)).catch(() => undefined)` (so a
synchronous throw or an eventual async rejection is fully absorbed, zero `unhandledRejection`
either way), but that chain is now constructed and left running on its own — never `return`ed from
or otherwise adopted by the outer `.catch(...)` callback. The outer `.catch`'s own returned promise
therefore settles immediately regardless of what `onError` does, so `.finally` (which resets
`inFlight`) always runs. Read `erasure.ts:626-654` directly to confirm the outer `.catch` callback
body no longer has a `return` statement in front of the `Promise.resolve()...` chain (cycle 1's own
bug was exactly that `return`).

Verified against the manifest's own 3 new committed tests (never-settling native promise,
never-resolving thenable, non-function `onError` — all pass, all confirm a later tick recovers) and
my own 4 independent probes:
- slow-then-rejects, rejects-on-Nth-call-only, sync-throw of a non-`Error` value: all pass, zero
  `unhandledRejection`, the interval recovers on the next tick in every case.
- **The memory-growth question the checker brief itself asks — answered empirically, not just
  reasoned about.** Ran 300 real ticks (real timers, `intervalMs: 5`) with `onError` returning a
  promise that NEVER settles on every single tick (the worst case: every tick fails, forever).
  `onErrorCalls` reached 300+ — the sweep kept ticking throughout, not stalled by any earlier
  never-settling chain (this alone falsifies the cycle-1 bug class). Then, with `--expose-gc`,
  forced a GC, ran 300 MORE ticks under the same conditions, forced GC again, and compared
  `process.memoryUsage().heapUsed`: **delta = -0.03MB over 300 additional ticks** (before=18.30MB,
  after=18.27MB) — flat, not growing. This is the correct, expected result: each tick's detached
  `Promise.resolve().then(...).catch(...)` chain, once constructed and left un-adopted, is held
  alive only by the never-settling inner promise `onError` returns; since nothing external
  (no array, no Set, no timer, no closure over a growing collection) references either promise,
  V8's GC can and does collect the whole chain once it is unreachable, even while technically
  "pending" forever. **Answer: not a memory growth concern, and it is bounded** — bounded not by an
  explicit cap but by the structural fact that these are genuinely detached objects with nothing
  rooting them, confirmed empirically rather than assumed.
- Falsified: reverting `erasure.ts` to the cycle-1 (adopted-promise) shape reproduces the exact
  cycle-1 bug — the never-settling probe hangs forever (`onErrorCalls` stuck at 1), the sweep is
  provably dead. The fix is load-bearing.

**ISS-t-017-c1-2 (`FencedWriterDeadlineError` from `applyApprovedDiff` can leave the summary
behind) — CONFIRMED FIXED for both tested windows, plus two hostile variants the manifest's own
tests didn't cover.** `writeApproved`'s catch (`nodes.ts:443-465`) adds a branch for
`FencedWriterDeadlineError` that re-checks the fence itself (`isStudentFenced`, the same read
`compensateIfFenced`'s own post-check uses, bounded by `FENCE_POSTCHECK_TIMEOUT_MS`) before
deciding: fenced now → undo via `undoApprovedSessionSummary`; unreadable → fail-safe undo (treated
as fenced, matching `compensateIfFenced`/`fencedForPostCheck`'s own documented rule); unfenced →
leave the summary alone (legitimate, idempotent retry under D-012).

Verified against the manifest's own 2 new committed tests (a fenced deadline-error → undone
immediately; an unfenced deadline-error → summary kept) and my own 2 independent probes:
- **Unreadable fence state (fail-safe).** Made `erasure_fences.findOne` throw specifically on
  `writeApproved`'s own re-check read (the 5th fence read in this call's sequence — confirmed the
  same 4 pre-existing reads the manifest's own tests document happen first). Result: the summary
  was undone anyway — the fail-safe branch works as documented, not just as claimed.
- **Match-key scope, one layer up from where cycle 1's own probe tested it.** Ran a genuinely
  fenced call (undone, confirmed) on one student/session, then a concurrent, unrelated, unfenced
  student's legitimate write on a different session through the SAME `writeApproved` function: the
  second write landed cleanly (`status: "written"`) and its summary was completely untouched by the
  first call's compensation. (The narrower, same-session stale-`approvedAt` match-key guarantee was
  already independently reprobed by the cycle-1 checker directly against `undoApprovedSessionSummary`
  itself — not re-litigated here, since the code path that guarantee lives in did not change in
  cycle 2, and a same-session "later legitimate write to an already-fenced student" scenario is not
  reachable in this system at all: once fenced, the pre-check refuses every subsequent write for
  that student until the row is purged.)

**Open sub-question from the checker brief: is there still a window after `writeApproved`'s OWN
re-check, and is it bounded/disclosed?** Yes, there is still a window — not reproduced (it requires
winning a race narrower than the one just closed), but real by construction: any single
read-then-decide check has a race after its own last read; this is not specific to this fix, it is
the same structural property every fence-aware check in this codebase already has
(`fencedForPostCheck`, `compensateIfFenced`, `recordApprovedSessionSummary`'s own post-check).
Traced through D-016's own proof (`erasure.ts:211-249`): a writer's write that lands BEFORE the
fence is guaranteed to be caught by `executeErasure`'s purge, because the purge's first selector
resolve happens strictly AFTER the fence is created (`confirmErasure` sets the fence before its own
confirm CAS). So if a fence is confirmed strictly after `writeApproved`'s re-check found "not
fenced," the summary this call left behind necessarily predates the fence — and `executeErasure`
will catch it when it eventually runs, per the SAME argument the whole design already relies on for
every other writer. **Bounded, yes — by D-016's write-predates-fence argument plus B15's own
absolute backstop (the full session row is hard-deleted on purge regardless).** Honestly disclosed
in substance, but not by name: the manifest's cycle-2 "Residuals" section states this cycle
"introduces no new residual," which is defensible (it truly is the same class of race already
accepted everywhere else in this design, not a fresh mechanism), but doesn't name this specific
instance the way `facts.ts`'s module docstring explicitly names ISS-t-017-rev-1 and ISS-t-017-c1-2
themselves. Logged as **ISS-t-017-c2-1** (low, non-blocking, documentation-only — add one sentence
to `facts.ts`'s module docstring on the next touch).

## 4. Judgment on the two open questions (cycle 2)

- **Should the fire-and-forget `onError` chain log (via a separate, non-`onError` path) if it is
  still pending after some bound, as an operator liveness signal?** Agree with leaving it out here.
  The correctness guarantee (the sweep itself keeps working, proven above) no longer depends on
  `onError` at all, so this is a pure observability improvement, not a fix — and adding a new
  timer/constant into `tick()` right after this exact function was over-fixed once already (cycle 1
  traded one bug for a worse one by adding complexity to this same 20-line block) argues for
  restraint, not more surface area, in a residual-fix cycle. Logged as **ISS-t-017-c2-2** (low,
  observability enhancement, non-blocking) so the suggestion isn't lost, per the manifest's own
  framing.
- **Is re-reading the fence directly (`isStudentFenced`) at the `writeApproved` caller level
  equivalent to a hypothetical exposed post-check result from `applyApprovedDiff` itself?** Agree
  with the manifest's reasoning, and would go further: re-reading independently is not just
  equivalent, it is strictly better. `applyApprovedDiff`'s own post-check, by construction, can only
  ever have observed "not fenced" on the path that reaches this branch (a fenced observation there
  produces `StudentFencedError` instead, a different, already-handled branch) — so an exposed value
  from that post-check would always read "not fenced," a stale answer by definition. A fresh,
  independent read at `writeApproved`'s own catch is the only way to pick up a fence confirmed in
  the (small but real) window between `applyApprovedDiff`'s post-check and this catch running.

## 5. Regression

The full `pnpm -r test` re-run (466/466) covers every cycle-0/cycle-1 fix, since none of their
underlying production code changed in cycle 2 — only `erasure.ts`'s `tick()` callback body and
`nodes.ts`'s `writeApproved` catch (plus `graph.ts`'s docstring) changed. The cycle-1 checker's own
regression argument (the committed suite stands in for cycle-0's ad-hoc scratch probes, which were
session-local) still applies unchanged. My own cycle-2 probes are additive, scratch-only, and
target specifically the two files this cycle touched.

## 6. Verdict rationale

**PASS.** Both defects this cycle was scoped to close are genuinely closed, not just claimed:
ISS-t-017-rev-3 (the never-settling `onError` silent stall) is fixed by making `tick()`'s `onError`
invocation fully fire-and-forget — verified via the manifest's own 3 tests, 4 independent hostile
probes (including an empirical, not just reasoned-about, answer to the memory-growth question this
checker brief specifically asked: heap stayed flat, -0.03MB over 300 additional never-settling
ticks), and falsified by reproducing the cycle-1 hang when reverted. ISS-t-017-c1-2 (the
`FencedWriterDeadlineError` summary-residue gap) is fixed by `writeApproved`'s new re-check branch
— verified via the manifest's own 2 tests plus 2 independent probes (an unreadable fence fails safe;
the compensation never touches an unrelated student's write). `pnpm -r typecheck`, `pnpm -r test`
(466/466, matching the manifest's claimed count exactly), and `verify_contracts.py` all reproduce
green.

One narrower residual remains, reasoned through but not reproduced: a fence confirmed strictly
after `writeApproved`'s own re-check. This is not a new kind of gap — it is the same
"a race exists after any check's last read" property already accepted throughout this codebase's
entire fence-based design, bounded by D-016's own write-predates-fence argument and backstopped by
B15's full purge — but the manifest's cycle-2 "Residuals" section doesn't name this specific
instance, only the three carried-forward from cycle 0. Logged as ISS-t-017-c2-1 (low,
non-blocking, documentation-only). A second, purely-observability suggestion from the manifest's own
open questions is logged as ISS-t-017-c2-2 (low, non-blocking). Neither blocks: both are the same
severity class (low) as issues this project has repeatedly shipped units with (T-015, T-016, T-017
cycle 0 all PASSed with open low/medium issues queued for the next touch), and neither touches B15
DPDP correctness, B12 data-boundary, or B3 approval-gating in a way this cycle's own fixes didn't
already close for the cases that matter.

**T-017 is DONE.** ISS-t-017-c1-1 and ISS-t-017-c1-2 are updated to `fixed` in the ledger
(`qa/issues.jsonl`), with `fixed_by` pointing to this cycle's commit and the specific tests/probes
that verify each. ISS-t-017-c2-1 and ISS-t-017-c2-2 are appended as new, low-severity, non-blocking
follow-ups for the next touch of this area.

---

## Cycle 1 (preserved byte-intact below)

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
