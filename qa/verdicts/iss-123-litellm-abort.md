# Verdict: ISS-123 litellm mid-flight abort test (fix/iss-123 @ 78f161a)

**Verdict: PASS** (with one pre-existing oracle gap recorded as a risk, not a regression)
**Checked:** 2026-10-17T13:44:25+05:30 by iss123-checker (fresh context, read-only toward the artifact)
**Artifact:** worktree `C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/w123`, base `38e751d`.
Mutations ran only in a scratch copy (`.../scratchpad/mut123`, built with `git archive 78f161a`). The worktree was not modified.

## 1. Diff scope: PASS
`git diff --stat 38e751d 78f161a` -> 1 file changed, 24 insertions, 12 deletions: `packages/providers/tests/litellm.test.ts` only. No `src/` change.

## 2. Oracle weakening: none found
Read the full diff. Kept unchanged:
- `assert.ok(err instanceof LiteLlmAbortedError, ...)`
- `assert.doesNotMatch(message, /did not respond within/)`
- `assert.ok(abortedObserved, "the stub server must observe the connection actually close on external abort")`, which still requires the server to see the socket close with `!res.writableEnded`.
- `timeoutMs: 5_000` on the provider.

Changed, and not loosening:
- The fixed sleeps are replaced by promises: `requestArrived` (abort fires only after the stub has the request) and `connectionClosed` (waits on the stub's own `close`).
- The assertion that the request had arrived is now implied by `await requestArrived`.
- A `{ timeout: 20_000 }` test option was added.
- A missing close event now fails the test by timeout instead of by a 200 ms race.

The change is stricter against a slow machine and no looser anywhere.

## 3. Re-runs: PASS
- `bash scripts/vc-testlock.sh pnpm -C <w123>/packages/providers test` -> tests 60, pass 60, fail 0, cancelled 0, duration 3434 ms.
- `npx tsx --test tests/litellm.test.ts` x5 in `<w123>/packages/providers`: 13/13 pass, 0 fail in each of runs 1-5. The machine was heavily loaded (many node processes), so each run was slow, but none failed.

## 4. Hostile mutations (scratch copy `mut123`, `packages/providers/src/index.ts`, restored by diff after each)
- Baseline unmutated: 13 pass, 0 fail.
- **A.** Line 533 `LiteLlmAbortedError` -> `LiteLlmNetworkError("aborted")`: **RED**. tests 13, pass 12, fail 1; MID-FLIGHT test fails with `AssertionError: expected LiteLlmAbortedError, got LiteLlmNetworkError`.
- **B.** Line 509 `onExternalAbort` made a no-op (external signal no longer aborts the fetch): **GREEN** (13/13). The MID-FLIGHT test passed in 5059 ms. The deadline timer (`timeoutMs: 5_000`) aborts the fetch instead, and the error is still classed `LiteLlmAbortedError` because `externalSignal.aborted` is true.
- **B2.** Line 507 deadline timer made a no-op as well, so the fetch is never aborted at all: **RED**. The run hung and was killed at my 120 s cap (exit 124, 127 s). Before that, the file reported tests 8, pass 7, fail 1, with `tests\litellm.test.ts` failing at 97.6 s. This variant also breaks the unrelated timeout test, so it proves the test cannot pass without some abort, but not that the external-signal wiring is covered.

## Risk (pre-existing, not introduced by this diff)
Mutation B is GREEN. The test cannot tell a prompt external-abort cancellation from one delayed to the 5 s deadline.
- I ran mutation B against the pre-fix test at `38e751d` as well: it also passes (5217 ms, 13/13).
- The fix neither introduced nor closed this gap.
- Suggested follow-up for the orchestrator (a separate issue, not a blocker for ISS-123): add an upper bound on the elapsed time between abort and settle (for example, well under `timeoutMs`). Such a bound would turn mutation B RED.

## Files
Wrote this file only. No other file in `D:/vc` was touched.
