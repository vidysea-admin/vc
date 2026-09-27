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


---

# Verdict: t-032-failover-attribution — Cycle checked: 1

**Cycle checked:** 1
**Date:** 2026-09-27
**Checker:** fresh Claude Sonnet subagent, bound root `D:/vc/.worktrees/t-032-failover-attribution`, branch `wave/t-032-failover-attribution`, HEAD `a69c844d7d04563d35a086a1773785b8c80e07cd`
**Contract:** qa/contracts/counselling-engine.md (B6 runtime failover / D-020 gate `provider-fallback`; B5, B11, B13, B14)

## What I re-ran myself (all through the machine test lock, bound worktree)

- `pnpm -C D:/vc/.worktrees/t-032-failover-attribution --filter @vc/providers test` → **50/50 pass** (matches manifest; up from cycle 0's 49, the +1 is the new capability-4b test).
- `pnpm -C D:/vc/.worktrees/t-032-failover-attribution --filter @vc/providers typecheck` → exit 0, no output.
- `python contracts/verify_contracts.py` → "no frozen contracts yet (research phase) -- PASS by vacuity", exit 0.
- `git diff c4e2212...HEAD --stat` (unit scope) and `git diff c4e2212 f94e4de --stat -- packages/providers/` (confirms main has zero conflicting changes to this package since the worktree's base) — only `packages/providers/src/index.ts`, `packages/providers/tests/failover.test.ts`, plus this unit's own `qa/issues.jsonl`/`qa/manifests/`/`qa/verdicts/` writes. No existing function/export/test deleted or renamed anywhere in the diff. 4c clean.
- Read the new test at `failover.test.ts:307-374` and the full `FailoverProvider.generate` body (`index.ts:730-769`) line by line against the manifest's mechanism claim (two timers due at the identical fake-timer instant fire in registration order; `provider.generate()` registers before `raceDeadline` wraps it) — the code and the test match the claim.

## Capability coverage — reproduced in MY OWN throwaway worktree (outside the bound root, fresh this cycle)

`git worktree add <scratch> a69c844 --detach` + `pnpm install --offline` (baseline confirmed GREEN 50/50 before any edit; removed after). All three rows below are independent falsifications from that copy, never the bound tree, never re-using cycle-0's worktree (deleted, recreated fresh at the new HEAD):

| # | Claim | Falsifying edit | Result |
|---|---|---|---|
| 1/2 | isRetryableProviderError whitelist narrowed to ModelOutputSchemaError | Reverted :540 to `if (err instanceof z.ZodError) return true;` | GREEN 50/50 before -> RED 48/50 after (exactly the 2 named tests: the whitelist test, the "scopes ZodError to MODEL-OUTPUT validation only" direction test) -> restored GREEN 50/50. Reproduced as claimed. |
| 4a | The pre-attempt deadline check (:737) attributes the stop to the deadline unconditionally | Reverted :737 to `lastError = lastError ?? new FailoverDeadlineExceededError(...)` | GREEN 50/50 before -> RED 49/50 after (exactly the "BETWEEN attempts (during backoff)" test) -> restored GREEN 50/50. Reproduced as claimed. |
| 4b | The mid-cycle deadline-during-backoff block (:753-759, the cycle-0 gap this cycle's new test targets) attributes the stop to the deadline, not the retryable error that landed the same instant | Reverted :753-759 to the bare `if (remainingForBackoff <= 0) break;` | GREEN 50/50 before -> RED 49/50 after -- exactly and only the NEW test ("the deadline expires the INSTANT attempt 1's own retryable failure lands"; actual lastErrorName = LiteLlmTimeoutError, expected FailoverDeadlineExceededError) -- the OLDER "BETWEEN attempts (during backoff)" test stays green, confirming (independently of the maker's own claim) that the two tests genuinely exercise two different branches -> restored GREEN 50/50, byte-identical to the bound tree (diff confirmed). This is the exact gap cycle 0's FAIL (ISS-t-032-c0-1) and the reviewer's Warning (ISS-t-032-rev-1) both named -- closed, on my own reproduction, not the maker's pasted output. |

3/5 capability rows independently falsified this cycle (rows 1, 2 combined as one edit; 4a; 4b -- the one that actually needed re-proving). Row 3 (the "all 3 models wrong-shape" lastErrorName rename) was independently falsified last cycle by this checker (see cycle-0 section above, row 3) and is unchanged this cycle -- not re-run, since neither its code path nor its test text changed between HEAD 8fdba5c and a69c844 (confirmed via the diff above: only failover.test.ts gained the new test block; the pre-existing "all 3 models" test at line ~569 is untouched by this cycle's commit).

## FAILURES

None. Both the medium finding from cycle 0 (ISS-t-032-c0-1) and the reviewer's Warning (ISS-t-032-rev-1) are closed on my own reproduced evidence (see Capability coverage row 4b above) -- not the maker's pasted claim.

## CAPABILITY-COVERAGE

5/5 rows now backed by a checker-reproduced falsification across the two cycles (1, 2, 3 last cycle; 1(again)/4a/4b this cycle). No unenumerated claims, no surviving UNVERIFIED rows.

## Other checks

- **4c diff scope:** clean -- only the two named files plus this unit's own qa/ writes (issues.jsonl, manifest, verdict) changed relative to base c4e2212; nothing deleted/renamed; `git diff c4e2212 f94e4de -- packages/providers/` confirms zero conflicting drift from main (still at f94e4de as of this check).
- **B11 (secrets):** not applicable -- this unit touches no config/env code; no key values in the diff, manifest or this verdict.
- **5bb persona walk / Mode D live-browser:** not applicable -- diff is entirely inside packages/providers/ (no UI surface, no apps/web change). LIVE-BROWSER: not-applicable.
- **5c (external data / scope):** not applicable -- code fix unit, not a data-collection unit.
- **B19 scenario matrix:** not applicable -- non-UI unit.
- **Ledger:** ISS-t-032-c0-1 flipped open -> verified (my own reproduction, this cycle -- see append above). ISS-t-032-rev-1 flipped fixed -> verified (same reproduction; this is the maker's fix for the identical gap). ISS-t-021-rev-3 already verified from cycle 0, unchanged.
- **Executor independence:** this check ran as a fresh Claude Sonnet subagent under the standard Anthropic session (no ANTHROPIC_BASE_URL override); manifest's Executor: claude-opus-subagent differs from mine, as required.
- **Resume-note cross-check:** the manifest's claim that the diff is byte-identical to a pre-session state is not independently checkable by me (no access to the maker's earlier scratchpad logs), but is immaterial to this verdict -- I judged the code and tests as they exist at HEAD a69c844, not the manifest's narrative about how they got there.

```
VERDICT: PASS
SCOREBOARD: 5/5 criteria met (whitelist narrowing, pre-attempt deadline attribution, mid-cycle deadline-during-backoff attribution -- now test-backed, no regression to the 47 pre-existing tests, clean diff scope), 5/5 invariants hold (B5 typed boundaries via parseModelOutput at all 3 sites, B14 outcome-not-construction now satisfied for the mid-cycle block, no student data / no config touched, engine's isSchemaError unaffected, no other package touched)
FAILURES (if any):
- none
CAPABILITY-COVERAGE: 5/5 rows reproduced (rows 1/2, 4a, 4b falsified fresh this cycle in my own throwaway worktree; row 3 falsified independently last cycle, code/test unchanged since)
LIVE-BROWSER: not-applicable (diff confined to packages/providers/src/index.ts and packages/providers/tests/failover.test.ts, no apps/web / UI surface touched)
ISSUES-WRITTEN: none new; ISS-t-032-c0-1 (open -> verified), ISS-t-032-rev-1 (fixed -> verified)
EXECUTOR: claude-opus-subagent (manifest) / claude-sonnet-subagent (checker)
EXPLANATION: Cycle 0's one gap -- the mid-cycle deadline-during-backoff block (index.ts:753-759) shipping with no test that actually exercised it -- is closed. The maker's new test times the stub provider's own rejection to land in the same fake-timer instant as raceDeadline's per-attempt timeout; I independently reproduced GREEN-before/RED-after by reverting only that block, confirmed the older "BETWEEN attempts" test stays green throughout (proving the two tests exercise genuinely different branches, not one masking as two), and confirmed 50/50 + clean typecheck fresh through the lock. All 5 capability rows now have a checker-reproduced falsification across the two cycles. No regressions, no scope creep, no unexpected files touched.
```
