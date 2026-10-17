# Verdict - p1-u4-eval-harness
Verdict: PASS
Cycle checked: 0
Bound to: D:/vc (worktree p1/u4, head 345bc66, code d05dca8, base 38e751d, integration main). Policy proportional-verification/2026-10-15.12. Tier M (eval tooling, no auth/tenant/prod-write; mock only). Lane: normal (quick lane off).
Metrics: start=2026-10-17T14:21:59+05:30 end=2026-10-17T14:24:22+05:30 wall_min=3 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=3 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-15.12 lane=normal check_s=190 mutants=3 defects_unit=0 defects_6c=0

## Check plan
Logic changed (eval harness, budget guard) -> affected tests + 1 falsification per changed criterion (A24, A2a). No UI, no security/auth, no data artifact, no LLM output. Plumbing criteria A1/A4/A8/A10/A14 covered by the affected tests only (their real proof is REAL under G-REAL, correctly reported NOT PROVEN by the harness).

## Scope (step 4c, read in full)
git diff 38e751d..345bc66 --stat: 28 files, all under packages/engine/evals/** (new modules, 5 runners, 3 synthetic fixtures, tests, run-eval.ts +123/-1, report.ts), packages/engine/package.json (+5 eval:* scripts) and qa/manifests/p1-u4-eval-harness.md. No src/, apps/, packages/db, scribe, .claude, TASKS, DECISIONS, contracts change. Read in full: budget.ts, kb-eval.ts, run-eval.ts diff, the 5 runners, decideAnswer (probes.ts), buildJudgeSheets (h2h.ts). Grep of evals/*.ts for fetch/http/net/child_process/WebSocket/Mongo: none; only process.env for the VC_G_REAL gate.

## Criteria
- A24 PASS. Contract B24.9 (USD 50 per run, USD 200 per month, spend recorded per run, G-REAL gate): budget.ts enforces both caps before recording a charge, refused charge not counted, month computed from the append-only ledger across runs, corrupt ledger fails closed, non-finite/non-positive caps rejected. Every REAL runner routes through runRealPath -> assertGReal -> executeReal. Own run, no VC_G_REAL: eval:kb/h2h/probes/latency/live --real each exit 1 "REAL mode refused", no output dir, no ledger. VC_G_REAL=1 run-live --real: exit 1 "not wired", no ledger. VC_G_REAL=0: refused. Mock eval:kb: exit 0, no ledger, only the --out dir written.
- A2a PASS (harness). Hit@3 ranks by score, top-3, unrecorded queries count as misses, verdict PASS/FAIL/NOT PROVEN with 45 English / 10 countries / 5 themes breadth rule, A2b always NOT PROVEN in mock. Own run of eval:kb on the fixture: 44/45 (97.8%), countries 12, themes 6, A2a PASS, A2b NOT PROVEN, synthetic banner, g-008 miss.
- A1/A4/A8/A10/A14 plumbing PASS (tests green; decideAnswer serves only verdict=correct, insufficient_coverage=false, web_used=false, internal sources non-empty; judge sheets exclude the judge's own authored answers). None claimed PROVEN by this unit.

## Commands run by me (cwd packages/engine of the worktree, under D:/vc/scripts/vc-testlock.sh)
1. node --import tsx --test evals/{budget,kb-eval,claims-check,probes,latency,h2h,live-audio,p1-runners,dataset,run-eval}.test.ts -> exit 0, tests 119, pass 119, fail 0, cancelled 0, skipped 0 (lock wait counted outside the run; not reused from the maker).
2. pnpm exec tsc --noEmit -p evals/tsconfig.json -> exit 0.
3. The CLI probes above (eval:kb mock; --real without flag x5; VC_G_REAL=1 run-live; VC_G_REAL=0 run-kb). Worktree git status after: clean.

## Falsification floor (throwaway copies outside the worktree: scratchpad/u4chk-row1..3, one mutant per copy; green before, red after)
| Criterion | Mutant | Green before | Red after (named) |
|---|---|---|---|
| A24 per-run | row1: delete the runWould > perRunCapUsd abort (budget.ts:170) | budget.test.ts 15/15 | 11/15; RED: "a charge that would pass USD 50 in one run aborts, is NOT recorded as spent...", "exactly USD 50 in a run is allowed; the next cent is not (boundary)", "executeReal returns an aborted-budget result..." and "caps are adjustable per guard..." |
| A24 per-month | row2: delete the monthWould > perMonthCapUsd abort (budget.ts:172) | 15/15 | 13/15; RED: "month cap USD 200 counts spend across separate runs and aborts the run that would pass it", "caps are adjustable per guard..." |
| A2a | row3: rank order reversed and window widened to k+3 in isHit (kb-eval.ts:56-57; two edits in one scoring expression) | kb-eval.test.ts 11/11 | 8/11; RED: "A2a on the sample: hit@3 = 44/45...", "the threshold is 0.95 and a drop below it is FAIL (falsification: rank-4 hits do not count)", "toKbMarkdown reports the verdict, provenance and every miss" |
Failures are assertion failures, not import errors. The bound tree was not edited.

## Non-blocking observations (low ledger candidates, no cycle)
1. Contract B24.9 says per-use approval of qa/gates/g-real.md; the code gate is the env flag VC_G_REAL=1 alone and does not read g-real.md. Acceptable as a harness gate while no REAL caller is wired (RealNotWiredError); wire a g-real.md read when U2/U6/U9 add real callers.
2. A2a prints "PASS" on a synthetic fixture (banner says harness only). A reader skimming the verdict word could over-read it; consider NOT PROVEN while fixture.source is synthetic. Wording/low.
3. Budget ledger append has no cross-process lock (two simultaneous REAL runs could each pass a month check). Single-operator use today; note for U6.
4. Per-runner REAL hard-stop nodes (p1-runners.test.ts) were not separately mutated; they share the budget.ts seam proven above.

## Explanation
All mandatory evidence executed by me: tests 119/119, typecheck, REAL-refusal and no-ledger/no-network behaviour, one named falsification each for A24 (both caps) and A2a. Diff contained to the declared scope. PASS.
