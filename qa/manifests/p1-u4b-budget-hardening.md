# Manifest — p1-u4b-budget-hardening
**Contract:** qa/contracts/counselling-engine.md (P1 criteria A24, A2a; harness plumbing for A1, A14; B24.9 paid-run budget and G-REAL gate at commit a06c150)
**Goal task:** P1 U4 hardening (senior-review findings on U4, checker PASS dad6865)
**Date:** 2026-10-17
**Fix cycle:** 0 of max 2
**Hold fix cycles:** 0 of 2
**Hold-reopens:** 0
**Resume-reset:** unused
**Capability-redispatch:** 0
**Dual check:** no
**Persona walk:** skip (api-only: internal eval tooling, no human screen)
**Issues addressed:** none (senior-review findings: budget.ts:61-76,86,138-140,171-173,228-234; run-eval.ts:117,124,152; h2h.ts:69,112,151-152; report.ts:162; claims-check.ts:99-103)
**Executor:** claude-sonnet-subagent
**Executor rationale:** eight small fixes inside packages/engine/evals, sized for one context; branch p1/u4 in the isolated worktree, main D:/vc tree untouched.

## What changed
All under `packages/engine/evals/`. Bookkeeping commit 613a388 flips `qa/manifests/p1-u4-eval-harness.md` to checked-PASS (cites `qa/verdicts/p1-u4-eval-harness.md`). Code commit e43eee8 on branch p1/u4 (base dad6865). Each fix had its failing test written first (red run: 14 failing nodes plus the h2h file failing to load; log in the maker scratchpad).
1. budget.ts `readLedger`: a `charge` entry needs a finite `usd >= 0` or the read throws (fail closed). Tests: usd `"abc"`, `null`, `-500`, missing, `1e999`; the guard refuses to start on each.
2. budget.ts `BudgetGuard.startRun` / `charge`: the whole read-check-append runs inside `withLedgerLock` (`openSync(path + ".lock", "wx")`, jittered bounded retry, stale-lock break after `lockStaleMs` (default 15 s), fail closed after `lockWaitMs` (default 30 s), released in `finally`). New helper `budget-worker.ts` (test-only process). Tests: 6 real OS processes, start-barrier synchronised, 150 attempts each of USD 1 against a USD 400 shared month cap -> exactly 400 charges and no lock left; stale-lock break; live lock fails closed without writing the ledger.
3. run-eval.ts `parseP1Args`: `--real` with any `--ledger` other than the fixed `P1_LEDGER` throws, in either argument order (mock may still point elsewhere). Enforced at the CLI parse layer; programmatic callers (tests) still inject a temp ledger through `args`.
4. budget.ts `assertGReal(env, gateFile = qa/gates/g-real.md)`: also needs the file to exist with a line starting `Answered:` plus content (B24.9). `executeReal` and `runRealPath` take an optional `gateFile` (tests only). The worktree has no `qa/gates/g-real.md`, so REAL stays refused here by construction.
5. kb-eval.ts `scoreKbEval`: a non-`recorded` fixture reports A2a `NOT PROVEN` with `reason: "synthetic fixture"` (markdown: `**NOT PROVEN (synthetic fixture)**`); a real shortfall is still `FAIL`; a `recorded` fixture still reaches `PASS`.
6. h2h.ts: `resolveH2hSeed` (explicit seed, else `randomBytes(16)` for `--real`; fixed default only for mock), `buildKeyFile` stores the seed only in `h2h-key.json` (`{seed, source, key}`); `buildBlindPairs` rejects an empty seed. Judge sheet has a safety box for A and for B (`safetyA`, `safetyB`); `tallyH2h` maps them to VC through the key; ratings are runtime-validated (preference `A`/`B`/`tie`, boolean safety flags) and a bad rating throws. `equal` is renamed `tie` per the brief. `run-h2h.ts` mock path and `report.ts` sheet text updated.
7. claims-check.ts `checkClaims`: every unresolved `sourceId` yields an `unresolvable-source` violation (one per claim, listing only the unresolved ids), even when another id resolves; checks on the resolved ids still run.
8. budget.ts `executeReal`: `guard.end(run, "error")` is wrapped so a ledger failure cannot mask the body's original error. Test replaces the ledger file with a directory inside the body, so `end` throws, and asserts the original error is rethrown.

## Verify commands (run by the maker, results here)
Pre-check[fix1]: e43eee8 `bash D:/vc/scripts/vc-testlock.sh pnpm -C packages/engine exec tsx --test evals/*.test.ts` -> exit 0, 157/157 pass, 0 fail (node "fix1: a charge entry with a non-numeric, null, missing or negative usd fails closed") t=33 blobs=budget.test.ts:524f858
Pre-check[fix2]: e43eee8 same single run (not a repeat); plus the node "fix2: 6 concurrent processes ..." run alone 3 more times under the lock -> pass 1/1 each time. Before the fix the same node failed 1 of 2 runs ("cap breached across processes: 402 charges recorded"), so it detects the race but is probabilistic on the old code; it is deterministic on the new code t=33 blobs=budget.test.ts:524f858
Pre-check[fix3]: e43eee8 same single run (node "fix3: --real rejects any --ledger other than the fixed P1 ledger, in either argument order") t=33 blobs=p1-runners.test.ts:6815dd6
Pre-check[fix4]: e43eee8 same single run (nodes "fix4: assertGReal also needs ...", "fix4: executeReal refuses with the env flag but no gate file ...", "fix4: a runner with VC_G_REAL=1 but no answered g-real.md gate file refuses ...") t=33 blobs=budget.test.ts:524f858,p1-runners.test.ts:6815dd6
Pre-check[fix5]: e43eee8 same single run (nodes "A2a on the synthetic sample ...", "fix5 ...", "toKbMarkdown ...", "eval:kb mock verdicts ...") t=33 blobs=kb-eval.test.ts:9e65213,p1-runners.test.ts:6815dd6
Pre-check[fix6]: e43eee8 same single run (h2h.test.ts nodes "fix6: judge sheet markdown ...", "... only on the side the key says is VC", "... preference must be A, B or tie ...", "... --real needs an explicit seed or a random one ...") t=33 blobs=h2h.test.ts:9088628
Pre-check[fix7]: e43eee8 same single run (node "fix7: any unresolved sourceId is flagged ...") t=33 blobs=claims-check.test.ts:9cb49c8
Pre-check[fix8]: e43eee8 same single run (node "fix8: if guard.end throws after the body threw, the original body error is kept") t=33 blobs=budget.test.ts:524f858
Pre-check[typecheck]: e43eee8 `pnpm -C packages/engine exec tsc --noEmit -p evals/tsconfig.json` under the lock -> exit 0
Metrics: start=2026-10-17T14:25:28+05:30 end=2026-10-17T14:34:06+05:30 wall_min=9 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=3 mutations=0 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-15.12 lane=normal check_s=33 mutants=0 defects_unit=0 defects_6c=0

## Honest limits (for the checker)
- Scope per the brief: packages/engine/evals only. Not run: the root `tsc --noEmit` (src) and the `scripts` project; no src/ file changed.
- The cross-process test is probabilistic on the pre-fix code (it caught the overshoot in 1 of 2 red runs) and deterministic on the fixed code; the lock itself is advisory-file based (stale break at 15 s could in theory let two holders overlap if a live holder stalls longer than that; the default wait is 30 s).
- Fix 3 is enforced in `parseP1Args` (the CLI path). `runRealPath` still accepts whatever `args.ledger` a programmatic caller passes, because the existing runner tests inject temp ledgers there.
- Fix 6: the `--real` h2h runner is still not wired (`RealNotWiredError`), so `resolveH2hSeed({real: true})` is proven by unit test only; the future real caller must use it. Mock `h2h-key.json` changed shape from an array to `{seed, source, key}`.
- `equal` became `tie` in H2hRating and judge sheets (brief wording "A, B or tie"); nothing else consumed `equal`.
- Fix 5 treats any fixture source other than `recorded` as non-proving.
- Files in the worktree are CRLF/LF mixed by the checkout's autocrlf; git normalises on commit.

## Status: checked-PASS (verdict 00f00d1, closed 2026-10-17T14:46:44+05:30)
