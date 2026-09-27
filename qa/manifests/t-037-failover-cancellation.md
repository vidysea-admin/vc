# Manifest — t-037-failover-cancellation
**Contract:** qa/contracts/counselling-engine.md (B6 "Runtime failover", gate `provider-fallback`; B14 outcome-not-construction; B11 secrets — the abort path must never leak a key value in an error message)
**Goal task:** T-037 (ISS-066)
**Date:** 2026-09-27
**Fix cycle:** 0 of max 3
**Dual check:** no
**Persona walk:** skip (backend-only, no UI/persona surface: `packages/providers/src/index.ts` and its own test suite; no counsellor-facing behaviour changes — the apologetic error state + Retry path B6 already specifies is unchanged, this unit only stops abandoned HTTP requests from running on after that state is shown)
**Issues addressed:** ISS-066 (this unit's whole scope — see "What changed"). No other open issue touched.
**Executor:** claude-sonnet-subagent
**Executor rationale:** a well-scoped, single-package fix to one already-identified root cause (`FailoverProvider.raceDeadline` abandons in-flight requests) with an existing, thorough test idiom (real in-process stub HTTP servers, `node:http`) already established in the same test files by prior units (T-019/T-021/T-032). No external tool or model was worth delegating a contained, single-file interface change to.

## What changed

- `packages/providers/src/index.ts`:
  - `GenerateRequest<T>` (the shared `LlmProvider.generate()` request shape) gains one new field:
    `signal?: AbortSignal` — optional, so both existing callers
    (`packages/engine/src/guards/concern-classifier.ts:249`, `packages/engine/src/scribe/nodes.ts:1096`)
    keep compiling and behaving unchanged; neither passes one. `MockProvider`, `RulesProvider` and
    `GeminiProvider` are untouched — nothing in-flight to cancel in any of them (deterministic/
    synchronous, or an unwired stub that throws immediately).
  - `LiteLlmProvider.generate()` — new behaviour when `request.signal` is set:
    - already aborted before the call starts → throws the new `LiteLlmAbortedError` immediately,
      **no `fetch` is ever issued** (no socket opened for a result nobody wants any more).
    - fires mid-flight → the same `AbortController` that already backs this provider's own
      `timeoutMs` timer is aborted, so the real `fetch` call is cancelled; the external signal is
      checked first in the catch block, so `LiteLlmAbortedError` and the pre-existing
      `LiteLlmTimeoutError` (this provider's own timer, unrelated to any caller signal) are never
      confused with each other, even if both would fire in the same tick.
  - New error class `LiteLlmAbortedError` (same key-free-message discipline as every other typed
    error in this file, B11) — deliberately **not** added to `isRetryableProviderError`'s whitelist:
    it only ever fires on an attempt `FailoverProvider` has already abandoned (whose rejection is
    discarded by `raceDeadline`'s own `Promise.race`) or on an external caller's own cancellation,
    neither of which should be silently retried.
  - `FailoverProvider.raceDeadline` — the actual root-cause fix. It used to take an
    already-started `Promise<T>` and just race it against a deadline timer, doing nothing to the
    promise itself when the timer won (ISS-066's bug: the abandoned `LiteLlmProvider` request kept
    its socket open and kept running/billing, unseen, until the remote side finished on its own).
    It now takes a `(signal: AbortSignal) => Promise<T>` factory, owns one fresh `AbortController`
    per attempt, and calls `controller.abort()` **before** rejecting when its own deadline timer
    wins the race. `FailoverProvider.generate()`'s call site now passes `{ ...request, signal }`
    into the chain member for that attempt.
  - Module docstring (top of file) and both changed methods' own doc comments updated to describe
    the fix in place (no separate changelog file).

- `packages/providers/tests/failover.test.ts` — 2 new tests:
  - "the deadline timer aborts the LOSING attempt's own AbortSignal…" — a fake `LlmProvider` that
    never settles, records the `signal` it was handed. Asserts `signal.aborted === false` before the
    deadline and `=== true` after, proving the abort reaches the attempt itself, not just
    `FailoverProvider`'s own promise.
  - "the wall-clock deadline actually aborts the real in-flight LiteLLM HTTP request…" — a real
    `node:http` stub that never responds (per-attempt `timeoutMs: 5_000`, far longer than
    `FailoverProvider`'s own `deadlineMs: 150`), run **concurrently** (`Promise.allSettled`) with an
    unrelated, independent `LiteLlmProvider` call against a second real stub that responds
    normally. Asserts: (a) the hang stub's own `req.on("close", …)` fires — the SERVER observes the
    connection actually close, near the 150ms deadline, not the 5s per-attempt timeout — and (b) the
    second, unrelated call still completes normally with its own uncorrupted response, proving one
    attempt's abort never leaks into a sibling attempt.

- `packages/providers/tests/litellm.test.ts` — 2 new tests (`LiteLlmProvider` in isolation, no
  `FailoverProvider` involved — proves the primitive itself, independent of who calls it):
  - an already-aborted `AbortSignal` → `LiteLlmAbortedError`, **zero requests reach the stub**
    (`stub.requests.length === 0`).
  - a signal that fires mid-flight against a real hang stub → the stub's own `close` event fires
    (server-observed abort, not just a client-side rejection), the error is `LiteLlmAbortedError`
    (asserted to NOT be shaped like the pre-existing timeout message), and the assertion for the
    server-side effect is given a short real wait (the FIN takes a real, if tiny, loopback round
    trip after the client-side promise settles — this was the one flaky edge hit and fixed during
    this unit, see "Verify" below).

No other file changed. No caller in `packages/engine` needed to change (both call sites keep
passing no `signal`, unaffected).

## How to verify (commands + expected)

- `pnpm -C packages/providers test` → expected: exit 0, all tests pass (54/54 — was 50 before this
  unit, +4 new).
- `pnpm -C packages/engine test` → expected: exit 0, all tests pass (620/620, unchanged — the
  interface change's blast radius; both `provider.generate()` call sites there are untouched).
- `pnpm -r typecheck` → expected: exit 0, clean across 9/10 workspace projects (apps/web is not
  TypeScript-checked in this workspace's scope list, same as every prior unit's manifest notes).

There is a shared machine-wide test lock at a `Temp/claude/vc-testlock` directory. No wrapper script
for it was actually present anywhere in this repo (checked: not at the repo root, not under
`scripts/`, not on `PATH`) despite an earlier manifest (`t-032-failover-attribution.md`) invoking one
as `bash vc-testlock.sh …` — it must have been that maker's own uncommitted local file. This session
wrote an equivalent minimal mkdir-based lock wrapper into its own scratchpad
(`vc-testlock.sh`: atomic `mkdir` acquire, breaks a lock only if it is older than 600s, always
releases via `trap … EXIT`) and ran every command in this manifest through it. No lock was ever held
by another process during this session; nothing was ever broken or deleted.

## Actual outputs (this session's own real runs)

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
ℹ duration_ms 1732.7397
```

```
$ pnpm -C packages/engine test
...
ℹ tests 620
ℹ suites 0
ℹ pass 620
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 27089.9437
```

```
$ pnpm -r typecheck
Scope: 9 of 10 workspace projects
packages/observability typecheck: Done
packages/schemas typecheck: Done
packages/db typecheck: Done
packages/providers typecheck: Done
mcp/student-profile typecheck: Done
mcp/university-kb typecheck: Done
packages/engine typecheck: Done
apps/api typecheck: Done
apps/web typecheck: Done
```

(Transient note, fixed during this session, not left in the shipped code: both new server-observed-
abort tests initially reported the server-side `close` event as never firing, because the assertion
ran immediately after `await pending` — before the FIN from the client's `AbortController.abort()`
had actually finished its loopback round trip to the stub server. Added a short real wait (200ms)
after the client-side promise settles, before asserting on the server-observed effect, in both
`litellm.test.ts` and `failover.test.ts`. Re-run after the fix: both green, shown above.)

## Falsification actually run this session (two throwaway `git archive` copies, never the bound root)

Both copies were built via `git archive HEAD | tar -x` into
`%LOCALAPPDATA%/Temp/claude/…/scratchpad/t037-falsify/copy` (outside
`D:/vc/.worktrees/t-037-failover-cancellation`), then `pnpm install --offline --filter @vc/providers...`.
The bound worktree's `git status` was clean (`ce8764d`, nothing uncommitted) before, during and after
both falsifications; only the scratchpad copy was ever edited. The scratchpad copy was deleted after
use.

**Lever A — remove the abort propagation, show the new tests name the failure:**
- GREEN baseline in the copy first: `pnpm -C packages/providers test` → 54/54.
- Single-hunk edit (`packages/providers/src/index.ts`, `raceDeadline`): removed the one line
  `controller.abort();` from the deadline timer's callback, reverting it to "reject only" (the
  pre-fix behaviour this whole unit exists to fix).
- RED, exact names:
  ```
  ✖ T-037 (ISS-066): the deadline timer aborts the LOSING attempt's own AbortSignal — not merely FailoverProvider's own promise (1.0015ms)
    AssertionError: FailoverProvider must pass a per-attempt signal into the chain member's request
  ✖ T-037 (ISS-066): the wall-clock deadline actually aborts the real in-flight LiteLLM HTTP request (the stub server observes the connection close, not just FailoverProvider giving up) — a concurrent, unrelated request is fully unaffected (5009.028ms)
    AssertionError: the hang server must observe the connection actually close — proving the request was really aborted, not merely abandoned client-side while its socket stayed open for the full 5s
  ℹ tests 54 / pass 52 / fail 2
  ```
  Every other test (including the 2 new `litellm.test.ts` tests, which exercise `LiteLlmProvider`
  directly rather than through `FailoverProvider`) stayed green — confirming these two, and only
  these two, exercise `raceDeadline`'s abort call.
- Reverted (`cp` from a pre-edit backup) and diffed byte-identical against the pristine copy; re-run
  → 54/54 green again.

**Lever B — shortcut a TEST FIXTURE (not the source), show the test's own shape guard fires (proves
the test isn't vacuously green regardless of what the fixture actually records):**
- GREEN baseline confirmed again (54/54) before this edit.
- Single-hunk edit (`packages/providers/tests/failover.test.ts`, the fake `hangsForeverButRecordsSignal`
  provider): removed the one line `observedSignal = request.signal;` — the fixture still behaves
  identically from the *source's* point of view (its `generate()` still never settles, so
  `FailoverProvider`'s own behaviour is completely untouched by this edit) but now never records what
  it was actually handed.
- RED, exact name:
  ```
  ✖ T-037 (ISS-066): the deadline timer aborts the LOSING attempt's own AbortSignal — not merely FailoverProvider's own promise (0.762ms)
    AssertionError: FailoverProvider must pass a per-attempt signal into the chain member's request
  ℹ tests 54 / pass 53 / fail 1
  ```
  Only this one test goes red — proving its assertion is load-bearing against the fixture's own
  correctness, not merely against the source under test; a fixture that silently failed to observe
  the signal is caught, not rubber-stamped.
- Reverted, diffed byte-identical, re-run → 54/54 green again.

## Capability coverage (each new claim -> its isolating falsification)

| capability | the check that covers it | the falsifying edit | observed |
|---|---|---|---|
| A losing/timed-out `FailoverProvider` attempt's own `AbortSignal` actually observes `aborted === true` (not just `FailoverProvider`'s promise rejecting) | `failover.test.ts`: "the deadline timer aborts the LOSING attempt's own AbortSignal…" | Lever A: removed `controller.abort();` from `raceDeadline`'s timeout callback | PASS before → FAIL after: `AssertionError: FailoverProvider must pass a per-attempt signal into the chain member's request` (also caught by Lever B's fixture-shortcut, see above) |
| The abort is a REAL cancellation of the in-flight HTTP request (server-observed connection close), not merely a client-side promise rejection, and a concurrent unrelated request is unaffected | `failover.test.ts`: "the wall-clock deadline actually aborts the real in-flight LiteLLM HTTP request…" | Lever A (same edit as above) | PASS before → FAIL after: `AssertionError: the hang server must observe the connection actually close…` |
| `LiteLlmProvider.generate()` never opens a socket for an already-aborted signal | `litellm.test.ts`: "a caller-supplied AbortSignal that is ALREADY aborted…" | Manually verified by inspection + the green run above (`stub.requests.length === 0`); not re-falsified with a separate lever — this claim is a strict subset of the mid-flight-abort mechanism already covered by Lever A/B on the same code path (the `request.signal?.aborted` early-throw guard) |
| `LiteLlmProvider.generate()` distinguishes a caller-triggered abort (`LiteLlmAbortedError`) from its own `timeoutMs` (`LiteLlmTimeoutError`) — never confused | `litellm.test.ts`: "a caller-supplied AbortSignal that fires MID-FLIGHT…" (asserts the error is NOT shaped like the timeout message) + the pre-existing, unchanged "a server that never responds times out with a typed LiteLlmTimeoutError…" (still green, proving the OLD behaviour is intact when no signal is ever passed) | Not separately falsified this cycle — the two tests already prove both directions live side by side, unchanged and new; a targeted third lever was judged out of proportion for what is fundamentally the same `if (externalSignal?.aborted)` branch already exercised above |

Two of the four rows share Lever A/B (the same single-hunk source edit falsifies both new
`failover.test.ts` claims at once, since they both depend on `raceDeadline` actually calling
`controller.abort()`). This is disclosed rather than manufacturing a third redundant lever against
the identical line.

## Live browser evidence

Not UI-touching — no surface changed. The only changed/added paths are backend-only:
`packages/providers/src/index.ts`, `packages/providers/tests/{failover,litellm}.test.ts`. No
`apps/web` file is touched by this unit.

## Open gaps

- **No caller passes a `signal` today.** `packages/engine/src/guards/concern-classifier.ts` and
  `packages/engine/src/scribe/nodes.ts` (`generateWithRetry`) each run their own, separate
  timeout/retry logic on top of `provider.generate()` and neither was changed — per the brief's hard
  constraint ("keep the new parameter optional… list explicitly if a caller genuinely must pass
  one"), no caller here genuinely must: `concern-classifier.ts` already races `provider.generate()`
  against its own `Promise.race` timeout, structurally identical to `FailoverProvider`'s own
  pre-fix bug (its losing `provider.generate()` call is abandoned, not cancelled). This is the same
  class of issue ISS-066 fixes inside `FailoverProvider`, now also latent at that call site — but
  wiring a `signal` through `concern-classifier.ts` (and reworking its own `Promise.race` to build
  and abort an `AbortController` the same way) is a distinct call site with its own test file and its
  own blast radius, out of this unit's named scope (`packages/providers/src/index.ts:651`). Flagging
  it here rather than silently leaving it unrecorded; a follow-up ISS is warranted if the checker or
  Umesh agrees it should be tracked (not filed to `qa/issues.jsonl` unilaterally by the maker — that
  ledger is the checker's to maintain per this project's maker-checker discipline).
- **`FailoverProvider` does not forward an externally-supplied `request.signal` from its own
  caller.** If a future caller ever passes `request.signal` into `FailoverProvider.generate()`
  itself (not into a chain member), today's code silently drops it — each attempt gets ONLY the
  internal per-attempt `AbortController`'s own signal via `{ ...request, signal }`, which overwrites
  whatever the caller supplied. No current caller does this (checked: neither engine call site sets
  `signal` at all), so this is not a regression, but it means the interface accepts a field it does
  not fully honour end-to-end yet. Documented rather than silently scoped around.
- **`isRetryableProviderError` does not (and should not) recognise `LiteLlmAbortedError`.** This is
  by design (fail-closed whitelist, matching the file's existing documented philosophy for every
  other unrecognised failure mode) — noted here so a future reader does not mistake the omission for
  an oversight.

## Status: ready-for-check
