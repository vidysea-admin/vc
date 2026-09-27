# Verdict: t-032-failover-attribution

**Cycle checked:** 0
**Date:** 2026-09-27
**Checker:** fresh Claude subagent (Sonnet), bound root `D:/vc/.worktrees/t-032-failover-attribution`, branch `wave/t-032-failover-attribution`, HEAD `8fdba5cc53b3e2ee547658b51d2da42bf159d781`
**Contract:** qa/contracts/counselling-engine.md (B6 runtime failover / D-020 gate `provider-fallback`; B11, B13, B14)

## What I re-ran myself (all through the machine test lock, bound worktree)

- `pnpm -C D:/vc/.worktrees/t-032-failover-attribution --filter @vc/providers test` -> **49/49 pass** (matches manifest).
- `pnpm -C D:/vc/.worktrees/t-032-failover-attribution --filter @vc/providers typecheck` -> exit 0, no output (matches manifest).
- `python contracts/verify_contracts.py` -> "no frozen contracts yet (research phase) -- PASS by vacuity", exit 0.
- Diff scope (`git diff c4e2212...HEAD --stat` / full diff): only `packages/providers/src/index.ts`, `packages/providers/tests/failover.test.ts`, and the manifest itself changed. No existing function/export/test deleted or renamed. Matches the manifest's declared scope exactly - 4c clean.
- Read `packages/engine/src/scribe/nodes.ts`'s `isSchemaError` - confirmed unaffected: `err instanceof ZodError` still holds for the new `ModelOutputSchemaError` subclass, so the single-provider retry path is untouched, as the manifest claims.
- `qa/issues.jsonl`: confirmed `ISS-t-021-rev-3` (the reopening review) was open before this unit, describing exactly the two defects this unit's diff addresses.

## Capability coverage - reproduced in MY OWN throwaway worktree (outside the bound root)

`git worktree add <scratch> HEAD --detach` + `pnpm install --offline` (removed after). All GREEN-before / RED-after pairs below are from that copy, never the bound tree.

| # | Claim | Falsifying edit | Result |
|---|---|---|---|
| 1/2 | `isRetryableProviderError` whitelist narrowed to `ModelOutputSchemaError` | Reverted `:540` to `if (err instanceof z.ZodError) return true;` | GREEN 49/49 before -> **RED 47/49** after (exactly the 2 named tests: the whitelist test and the "scopes ZodError to MODEL-OUTPUT validation only" direction test) -> restored GREEN 49/49. **Reproduced as claimed.** |
| 3 | `parseModelOutput` routes `MockProvider` through the tagged error (drives the `lastErrorName` in the "all 3 models wrong-shape" test) | Reverted `MockProvider.generate` (`:289`) from `parseModelOutput(...)` back to `request.outputSchema.parse(raw)` | GREEN 49/49 before -> **RED 46/49** after (the named test plus 2 others that exercise `MockProvider`'s output validation) -> restored GREEN 49/49. **Reproduced (stronger than the manifest's own claim - the manifest said this row was not independently falsified this session; it is falsifiable, and I did).** |
| 4 | The deadline-during-backoff block (`:753-759`, new code) attributes the stop correctly | Reverted `:753-759` (the manifest's own stated edit) back to the bare `if (remainingForBackoff <= 0) break;`, leaving the OTHER T-032 fix at `:737` (unconditional pre-attempt deadline assignment) intact | **The named test ("T-032 (ISS-t-021-rev-3): the deadline expires BETWEEN attempts...") STAYS GREEN, 49/49.** The manifest's own falsification claim for this row is FALSE - see finding below. Separately: reverting `:737` alone (leaving `:753-759` untouched) DOES redden this same test, proving `:737` - not the new block the row is named for - is what the test actually exercises. |

## FAILURES

- **[Capability #4] sev: medium** - The manifest's capability-coverage row 4 asserts a specific falsifying edit (revert `:756-761`) that "would leave `lastError` as the stale `LiteLlmTimeoutError` and fail the test's assertion." I applied exactly that edit in a throwaway worktree and the named test stayed green (49/49) - the claim is incorrect. Root cause: in the test, `t.mock.timers.tick(150)` fires the pending backoff `setTimeout` (advancing the clock) while the code is inside `await this.sleep(...)`, not before it starts, so `remainingForBackoff` (computed synchronously right after the failed attempt, before the sleep call) is still positive when checked - the new block at `:753-759` is never entered in this scenario. When the sleep's timer fires and the `while` loop re-enters, the PRE-EXISTING top-of-loop deadline check (`:737`, this unit's other, already-covered fix) is what actually produces the correct `FailoverDeadlineExceededError` attribution. The new block is therefore **production code added by this unit with no test in the suite that exercises it** - a real B14 ("outcome, not construction") gap on this specific addition, plus an inaccurate verification claim in the manifest (the maker's own "Open gaps" section honestly flagged the row as not run this session, but the specific reasoning offered for how to verify it later does not hold). - fix direction: either write a hostile test that drives `remainingForBackoff <= 0` synchronously right after a failed attempt (e.g., an attempt whose provider consumes nearly the entire remaining budget before rejecting with a non-deadline error, so the deadline is already gone before backoff is scheduled - distinct from the existing test's "expires during the backoff sleep" shape), or, if that race is unreachable in practice, remove the block and document that the top-of-loop check already covers every deadline-attribution path. - issue: ISS-t-032-c0-1

## CAPABILITY-COVERAGE

3/4 rows independently reproduced correctly (rows 1, 2, 3 - row 3 more thoroughly than the manifest itself attempted); row 4's own stated falsifying edit does not reproduce (see FAILURES). Per Mode A step 4b, a capability row whose stated falsifying edit survives when applied fails the unit on its own.

## Other checks

- **B11 (secrets):** not applicable - this unit touches no config/env code.
- **5bb persona walk / Mode D live-browser:** not applicable - diff is entirely inside `packages/providers/` (no UI surface, no `apps/web` change).
- **5c (external data / scope):** not applicable - this is a code fix unit, not a data-collection unit.
- **TASKS.md / qa/issues.jsonl scope:** the manifest correctly left TASKS.md untouched (checker convention); this verdict is the first thing to touch `qa/issues.jsonl` for this unit, per the project's "checker is the sole maintainer of the ledger" rule.
- **Executor independence:** this check ran as a fresh Claude Sonnet subagent under the standard Anthropic session (no `ANTHROPIC_BASE_URL` override); manifest's `Executor: claude-opus-subagent` differs from mine, as required.

## Ledger

- `ISS-t-021-rev-3` -> flipped to **fixed** (both named defects - the over-broad `ZodError` whitelist and the `??` deadline-attribution bug - independently reproduced fixed above). `regression_check: pnpm --filter @vc/providers test`.
- `ISS-t-032-c0-1` -> new, **open**, severity medium (capability-coverage gap on the unit's own bonus mid-cycle fix; see FAILURES).

```
VERDICT: FAIL
SCOREBOARD: 4/5 evidenced claims met (whitelist narrowing, deadline pre-attempt attribution fix, no regression to 47 pre-existing tests, clean diff scope), 3/4 capability-coverage rows independently reproduced
FAILURES (if any):
- [Capability #4] sev: medium - manifest's row-4 falsifying-edit claim for the new mid-cycle deadline-during-backoff block (index.ts:753-759) does not reproduce - the block is unexercised by any test in the suite, and the named test is actually driven by the OTHER (already-covered) fix at :737 - fix direction: add a hostile test that hits remainingForBackoff<=0 synchronously right after a failed attempt (before backoff is scheduled), or remove the unproven block - issue: ISS-t-032-c0-1
CAPABILITY-COVERAGE: 3/4 rows reproduced (rows 1/2 combined, and row 3 - falsified independently, stronger than the manifest's own attempt); row 4 UNVERIFIED-by-checker (manifest's stated falsification path does not hold) - issue ISS-t-032-c0-1
LIVE-BROWSER: not-applicable (diff confined to packages/providers/src/index.ts and packages/providers/tests/failover.test.ts, no apps/web / UI surface touched)
ISSUES-WRITTEN: ISS-t-032-c0-1 (new); ISS-t-021-rev-3 (flipped open -> fixed)
EXECUTOR: claude-opus-subagent (manifest) / claude-sonnet-subagent (checker)
EXPLANATION: The headline fix this unit exists to make (narrowing isRetryableProviderError from bare z.ZodError to the tagged ModelOutputSchemaError, ISS-t-021-rev-3) is real, correctly implemented, and independently reproduced RED/GREEN in my own throwaway worktree, along with the pre-attempt deadline-attribution fix. But the unit also shipped a second, untested code addition (the mid-cycle deadline-during-backoff block) whose own manifest-claimed falsification does not hold when I ran it - that block currently has zero test coverage proving it does anything, which is exactly the "outcome, not construction" gap B14 exists to catch. 49/49 tests and clean typecheck are real and reproduced; the fail is scoped to capability-coverage on one specific addition, not to the unit's core deliverable.
```
