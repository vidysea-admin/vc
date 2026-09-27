# Manifest — t-041-concern-classifier-abort
**Contract:** qa/contracts/counselling-engine.md (B16 "crisis escalation" / D-020 "downgrade, never hide"; B9 crisis guard runs first and never reads the classifier; B11 secrets — no key value in an error message)
**Goal task:** T-041 (ISS-t-037-2)
**Date:** 2026-09-27
**Fix cycle:** 0 of max 3
**Dual check:** no
**Persona walk:** TRUE (backend-only, no UI/persona surface: `packages/engine/src/guards/concern-classifier.ts` and its own test suite; no counsellor-facing behaviour changes at all — the classified/unavailable annotation shape, the "downgrade, never hide" rule, and `escalationDecision`'s fail-open behaviour on a guard flag are all byte-for-byte unchanged. This unit only stops the abandoned HTTP request from continuing to run — and bill — after the `unavailable`/`timeout` state is already reached, exactly the same scope T-037's own persona walk carried for the sibling call site.)
**Issues addressed:** ISS-t-037-2 (this unit's whole scope — see "What changed"). No other open issue touched.
**Executor:** claude-sonnet-subagent
**Executor rationale:** a well-scoped, single-file fix applying an already-checker-PASSed precedent (T-037's `AbortController`/`request.signal` seam) to a second, previously-flagged call site, with the existing test idiom (real `node:http` stub servers, `MockProvider`/hand-rolled fakes) already established in this exact test file. No external tool or model was worth delegating a contained, single-function change to.

## What changed

- `packages/engine/src/guards/concern-classifier.ts`:
  - `classifyConcern` now binds one `AbortController` per call and passes `controller.signal` as
    `request.signal` on the `deps.provider.generate()` call (the optional seam T-037 added to
    `GenerateRequest<T>` in `packages/providers/src/index.ts`).
  - The internal `Promise.race` timeout's `setTimeout` callback now calls `controller.abort()`
    **before** `reject(new ConcernClassifierTimeoutError(...))` — same ordering `FailoverProvider`'s
    own `raceDeadline` uses, so a real provider's own eventual (later-tick) rejection from the abort
    can never win the race ahead of the timeout rejection, and can never change which branch of the
    `try`/`catch` in `classifyConcern` runs.
  - Module docstring (top of file) and the function's own doc comment updated to describe the fix in
    place and to state explicitly that observable behaviour on this safety path is unchanged (no
    separate changelog file — same discipline as T-037's manifest).
  - No other function touched. `reviewedFlagView` and `escalationDecision` (the "downgrade, never
    hide" logic) are byte-for-byte unchanged — they take a `ClassifierAnnotation` and never look at
    how it was produced.

- `packages/engine/tests/concern-classifier.test.ts` — 3 new tests, plus 2 new fixture classes:
  - `SignalRecordingHangingProvider` — a hung provider that records the `request.signal` it was
    handed (mirrors T-037's `hangsForeverButRecordsSignal` fixture in
    `packages/providers/tests/failover.test.ts`).
  - `AsyncAbortingProvider` — simulates a REAL provider's own abort behaviour: it does not settle the
    instant the signal fires, it rejects on a later tick (a real `fetch` `AbortError` needs one too),
    used to prove the late rejection is harmless.
  - "a timeout aborts the abandoned provider call's own AbortSignal — not merely classifyConcern's
    own race": proves `classifyConcern` actually aborts the signal it hands the provider (not merely
    its own internal race), and that the outcome is still `unavailable`/`timeout`.
  - "a real in-flight LiteLLM HTTP request is actually cancelled (the stub server observes the
    connection close) …": a real `node:http` stub server that never responds, driven through a real
    `LiteLlmProvider` (from `@vc/providers`, no mocking) with a `timeoutMs` far longer than
    `classifyConcern`'s own `timeoutMs`, so ONLY `classifyConcern`'s own abort can end the call.
    Asserts the SERVER's own `req.on("close", …)` fires — server-observed cancellation, not a
    client-side inference — near the 50ms `classifyConcern` timeout, not the 5s provider timeout.
  - "a real provider's LATE rejection after an abort never turns into anything but the pre-existing
    unavailable/timeout outcome, and never becomes an unhandled rejection": listens on
    `process.on("unhandledRejection", …)` for the duration of the test plus a grace window after the
    deliberately-delayed rejection fires, and asserts (a) the outcome is exactly `unavailable`/
    `timeout` (never misread as `error`, never a classified/benign result) and (b) no unhandled
    rejection was ever observed.

No other file changed. `packages/engine/src/guards/escalation.ts` (the one production caller of
`classifyConcern`, in `runConcernReview`) needed no change — it already calls `classifyConcern`
without a `signal` argument, which the new optional internal `AbortController` does not require from
callers at all; the abort is entirely internal to `classifyConcern` now.

## How to verify (commands + expected)

- `pnpm -C packages/engine test` → expected: exit 0, all tests pass (**623/623** — was 620 before
  this unit, +3 new).
- `pnpm -C packages/providers test` → expected: exit 0, all tests pass (**54/54**, unchanged — no
  file in this package was touched by this unit; `LiteLlmProvider`/`GenerateRequest.signal` are
  reused exactly as T-037 shipped them).
- `pnpm -r typecheck` → expected: exit 0, clean across 9/10 workspace projects (`apps/web` is not
  TypeScript-checked in this workspace's scope list, same as every prior unit's manifest notes).

There is a shared machine-wide test lock at `Temp/claude/vc-testlock/`. Checked before starting:
the lock directory did not exist (`ls` found nothing at
`C:/Users/Lenovo/AppData/Local/Temp/claude/vc-testlock`), so no wait was needed and nothing was
touched or deleted. No wrapper script for it exists anywhere in this repo (confirmed again this
session, same finding as T-037's manifest) — commands below were run directly.

## Actual outputs (this session's own real runs, bound worktree)

```
$ pnpm -C packages/engine test
...
ℹ tests 623
ℹ suites 0
ℹ pass 623
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 40274.6762
```

```
$ pnpm -C packages/providers test
...
ℹ tests 54
ℹ suites 0
ℹ pass 54
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 2860.8958
```

```
$ pnpm -r typecheck
Scope: 9 of 10 workspace projects
packages/observability typecheck: Done
packages/schemas typecheck: Done
packages/providers typecheck: Done
packages/db typecheck: Done
mcp/student-profile typecheck: Done
mcp/university-kb typecheck: Done
packages/engine typecheck: Done
apps/api typecheck: Done
apps/web typecheck: Done
```

(`node_modules` was missing in this fresh worktree at session start — `pnpm install` was run once,
lockfile unchanged, resolution skipped, +177 packages linked from the pnpm store. No dependency
version changed.)

## Falsification actually run this session (two throwaway `git archive` copies, never the bound root)

Both levers were run against the SAME throwaway copy, built via `git archive HEAD | tar -x` into
`%LOCALAPPDATA%/Temp/claude/…/scratchpad/t041-falsify/copy` (outside
`D:/vc/.worktrees/t-041-concern-classifier-abort`), then
`pnpm install --offline --filter @vc/providers... --filter @vc/engine...`. The bound worktree's
`git status` was clean (`1c1b5e6`, nothing uncommitted) before, during and after both falsifications;
only the scratchpad copy was ever edited. The scratchpad copy was deleted after use.

**Lever A — remove the abort propagation, show the new tests name the failure:**
- GREEN baseline in the copy first: `pnpm -C packages/engine test` → 623/623.
- Single-hunk edit (`packages/engine/src/guards/concern-classifier.ts`, the timeout's `setTimeout`
  callback): removed the one line `controller.abort();`, reverting to "reject only" (the pre-fix
  behaviour this whole unit exists to fix).
- RED, exact names and assertion text:
  ```
  ✖ T-041 (ISS-t-037-2): a timeout aborts the abandoned provider call's own AbortSignal — not merely classifyConcern's own race (40.6169ms)
    AssertionError [ERR_ASSERTION]: the signal must be aborted once the timeout has fired
    false !== true
  ✖ T-041 (ISS-t-037-2): a real in-flight LiteLLM HTTP request is actually cancelled (the stub server observes the connection close), and the outcome is still unavailable/timeout — unchanged safety behaviour (5095.7819ms)
    AssertionError [ERR_ASSERTION]: the stub server must observe the connection actually close — the request was really cancelled, not merely abandoned client-side
  ℹ tests 623 / pass 621 / fail 2
  ```
  The third new test ("a real provider's LATE rejection … never becomes an unhandled rejection")
  stayed GREEN under this edit — expected and disclosed, not hidden: `AsyncAbortingProvider`'s
  rejection is wired to the signal's own `"abort"` event, so with `controller.abort()` removed the
  signal never fires at all, the fixture's promise just stays pending forever (same as
  `HangingProvider`), and no rejection — handled or unhandled — is ever produced. This confirms the
  fixture's shape (no false positive from an unrelated cause) rather than weakening the falsification:
  the two tests that DO fail are exactly the two whose entire point is proving the abort itself, and
  no other test in the 623-test suite (including the pre-existing "a hung provider resolves to
  unavailable/timeout" test) was disturbed.
- Reverted (`cp` from a pre-edit backup) and diffed byte-identical against the pristine copy; re-run
  → 623/623 green again.

**Lever B — shortcut a TEST FIXTURE (not the source), show the test's own shape guard fires (proves
the test isn't vacuously green regardless of what the fixture actually records):**
- GREEN baseline confirmed again (623/623) before this edit.
- Single-hunk edit (`packages/engine/tests/concern-classifier.test.ts`, the
  `SignalRecordingHangingProvider` fixture): removed the one line
  `this.observedSignal = request.signal;` — the fixture still behaves identically from the *source's*
  point of view (its `generate()` still never settles, so `classifyConcern`'s own behaviour is
  completely untouched by this edit) but now never records what it was actually handed.
- RED, exact name and assertion text:
  ```
  ✖ T-041 (ISS-t-037-2): a timeout aborts the abandoned provider call's own AbortSignal — not merely classifyConcern's own race (34.0803ms)
    AssertionError [ERR_ASSERTION]: the provider must have been handed a signal
  ℹ tests 623 / pass 622 / fail 1
  ```
  Only this one test goes red — proving its assertion is load-bearing against the fixture's own
  correctness, not merely against the source under test; a fixture that silently failed to observe
  the signal is caught, not rubber-stamped.
- Reverted, diffed byte-identical, re-run → 623/623 green again.

## Capability coverage (each new claim -> its isolating falsification)

| capability | the check that covers it | the falsifying edit | observed |
|---|---|---|---|
| `classifyConcern` actually aborts the abandoned provider call's own `AbortSignal` on timeout (not just its own internal `Promise.race`) | "a timeout aborts the abandoned provider call's own AbortSignal…" | Lever A: removed `controller.abort();` from the timeout callback | PASS before → FAIL after: `AssertionError: the signal must be aborted once the timeout has fired` (also caught by Lever B's fixture-shortcut, see above) |
| The abort is a REAL cancellation of the in-flight HTTP request (server-observed connection close), driven by `classifyConcern`'s own (short) timeout rather than the provider's own (long) one | "a real in-flight LiteLLM HTTP request is actually cancelled…" | Lever A (same edit as above) | PASS before → FAIL after: `AssertionError: the stub server must observe the connection actually close…` |
| The timeout outcome is UNCHANGED (`unavailable`/`timeout`, never `error`, never a classified/benign result) whether or not the abort happens | all three new tests assert `out.status === "unavailable"` / `reason === "timeout"` on every path, including the two above and the late-rejection test | Not separately falsified — this is the same assertion the PRE-EXISTING "a hung provider resolves to unavailable/timeout" test already covers (unchanged, still green under both levers); the new tests add the signal/cancellation proof on top without touching this claim's own coverage |
| An aborted call's own LATE rejection (a real provider's `fetch` AbortError arrives on a later tick, after `classifyConcern` has already resolved) never surfaces as an unhandled rejection and never flips the outcome | "a real provider's LATE rejection after an abort never turns into anything but the pre-existing unavailable/timeout outcome…" | Manually verified by inspection + the green run above (`unhandled` array stays empty across the suite, including under both levers where relevant); not independently falsified with a third lever — the reasoning is identical to, and directly reuses, T-037's own re-derived proof that `Promise.race` already attaches a rejection handler to the losing promise (its manifest, "Close-out (cycle 0)"), which the checker already re-verified by tracing microtask ordering for the sibling `raceDeadline` path. A third lever against the identical `Promise.race`-attaches-a-handler mechanism was judged redundant. |

Two of the three new-claim rows share Lever A (the same single-hunk source edit falsifies both at
once, since they both depend on `classifyConcern` actually calling `controller.abort()`). This is
disclosed rather than manufacturing a second lever against the identical line, matching T-037's own
manifest precedent for the analogous situation in `FailoverProvider`.

## Live browser evidence

Not UI-touching — no surface changed. The only changed/added paths are backend-only:
`packages/engine/src/guards/concern-classifier.ts`,
`packages/engine/tests/concern-classifier.test.ts`. No `apps/web` file is touched by this unit.

## The crisis-guard interaction (brief's explicit ask)

Checked directly, not assumed: `escalationDecision` (in the same file) decides the guard-crisis branch
**first**, and returns `{ escalate: true, reason: "guard_crisis", severity: "critical" }` without ever
reading the `classifier` argument at all when `guard.level === "crisis"` — this line is untouched by
this unit. A guard-flagged turn whose classification times out (now cancelled, previously merely
abandoned) still produces the exact same `{status: "unavailable", reason: "timeout"}` annotation it
always did, which `escalationDecision` still reads as `classifier_unavailable` and escalates on the
flag alone (fail-open) for a `concern`-level guard flag, or ignores entirely (already escalating on
`guard_crisis` alone) for a `crisis`-level one. Nothing about which HTTP request keeps running changes
what the counsellor or admin sees. All pre-existing crisis/escalation tests
(`T-012 never-hide: …`, `T-012 fail-open: …`, `T-012 raise: …`, and the scribe-level `B9` tests in
`packages/engine/tests/scribe.test.ts`) pass unchanged, exercising this exact guarantee.

## Open gaps

- **`FailoverProvider` does not forward an externally-supplied `request.signal` from its own caller**
  (ISS-t-037-3, already tracked by the checker from T-037, not re-litigated here). `classifyConcern`
  never calls through `FailoverProvider` at all (its provider config deliberately drops any failover
  chain — see `concernClassifierProviderConfig`'s doc comment, unchanged), so this gap is orthogonal
  to this unit and not touched by it.
- **The "real HTTP cancellation" test (`LiteLlmProvider` against a real hang stub) takes ~5s of real
  wall-clock time** (it waits past the 300ms server-observation grace window plus the request/stub
  setup) — same cost profile T-037's own equivalent test in `packages/providers/tests/failover.test.ts`
  carries, disclosed there and here rather than shortened at the cost of a weaker proof.
  `pnpm -C packages/engine test`'s total duration (~40s) already reflects this; it is not a new
  regression against baseline proportion (T-037's own equivalent single test took ~5s too).
  Nothing in this unit's own scope shortens it further without giving up the server-observed
  assertion.
- **No new engineering alert or metric was added for a cancelled concern-classification.** T-037 added
  `emitFailoverAlert` for the whole-chain-exhausted case; this call site has no equivalent alert
  before or after this unit — a timed-out classification was, and remains, a silent (to observability)
  fail-open, recorded only in the annotation itself (`status: "unavailable", reason: "timeout"`) and
  whatever the caller (`runConcernReview` in `escalation.ts`) does with it. Out of this unit's named
  scope (cancelling the abandoned request), flagged here rather than silently left unrecorded — a
  follow-up issue is a call for the checker/Umesh, not filed unilaterally by the maker per this
  project's maker-checker discipline.

## Status: ready-for-check
