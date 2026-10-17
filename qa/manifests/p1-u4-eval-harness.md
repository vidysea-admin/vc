# Manifest — p1-u4-eval-harness
**Contract:** qa/contracts/counselling-engine.md (P1 criteria A2a, A24; harness plumbing for A1, A4, A8, A10, A14 from qa/evidence/p1-plan-draft-20261017/spec.md v8, plan.md U4 row, approved D-089)
**Goal task:** P1 U4
**Date:** 2026-10-17
**Fix cycle:** 0 of max 2
**Hold fix cycles:** 0 of 2
**Hold-reopens:** 0
**Resume-reset:** unused
**Capability-redispatch:** 0
**Dual check:** no
**Persona walk:** skip (api-only: no human screen; internal eval tooling)
**Issues addressed:** none
**Executor:** claude-sonnet-subagent
**Executor rationale:** single-package eval tooling unit, sized for one context; branch p1/u4 in an isolated worktree, main D:/vc tree untouched.

## What changed
All under `packages/engine/evals/` unless noted. Code commit d05dca8 on branch p1/u4 (base 38e751d).
- budget.ts (new, A24) — `BudgetGuard`/`BudgetRun`/`executeReal`/`assertGReal`: REAL refuses without `VC_G_REAL=1`; hard stop at USD 50/run and USD 200/month (UTC month, adjustable options, never unlimited); append-only JSONL spend ledger (start/charge/abort/end), charge recorded before it returns, refused charge never counted; corrupt ledger fails closed.
- dataset.ts:+106 (A2a) — `GoldenQuestionSchema`, `parseGoldenSet/loadGoldenSet`, `KbHit/KbFixture` schemas, `parseKbFixture/loadKbFixture`, `fixtureSearch` (frozen-fixture mode). Existing scribe loaders untouched.
- kb-eval.ts (new, A2a/A2b) — Hit@3 by score rank, verdicts PASS/FAIL/NOT PROVEN (needs >=45 English, >=10 countries, >=5 themes), A2b always NOT PROVEN in mock, unrecorded queries counted as misses.
- claims-check.ts (new, A1 harness) — `checkClaims`, `aggregateUnverified` (<=5%), spec scope-item-4 rules (/ask facts without fetched session text can only be `attributed`).
- probes.ts (new, A4 harness) — `/ask` serve rule oracle, `decideAnswer`, `scoreProbes`, 30-probe real bar.
- latency.ts (new, A8 harness) — nearest-rank percentile, `evaluateA8` (mock can never PROVE; real needs >=20 samples), `measureOnce`.
- h2h.ts (new, A14 harness) — seeded blind pairing (origin only in a separate key), per-judge shuffled sheets that exclude the judge's own authored answers, tally (>=60% equal-or-better, zero safety failures, >=2 judges, A1+A3 companions, NOT PROVEN when incomplete).
- live-audio.ts (new, A10 skeleton) — scorer + `MockLiveRunner` profiles + not-wired `RealLiveRunner`; mock never PROVES A10.
- report.ts:+138 — markdown renderers (kb, probes, latency, live, h2h, judge sheet, abort); existing `toMarkdown` untouched.
- run-eval.ts:+109 — `parseP1Args`, `runRealPath` (G-REAL -> wired? -> budget guard -> abort report), `writeP1Report`, `p1Main`; existing `eval:scribe` code untouched.
- run-kb.ts, run-h2h.ts, run-probes.ts, run-latency.ts, run-live.ts (new) — the five runners; mock default on fixtures; `--real` through `runRealPath`.
- fixtures/{golden.sample.jsonl,kb-fixture.sample.json,probes.sample.json} (new, SYNTHETIC; marked `source: synthetic`, U3 replaces with recorded data).
- packages/engine/package.json:+5 — scripts `eval:kb`, `eval:h2h`, `eval:probes`, `eval:latency`, `eval:live`.
- tests (new): budget, kb-eval, claims-check, probes, latency, h2h, live-audio, p1-runners (.test.ts). Existing dataset.test.ts and run-eval.test.ts re-run unchanged and green.
- falsified (unchanged): none (mutants applied to a throwaway copy of the unit's own new files and restored; see Capability coverage).

## Verification scope
Policy-Version: proportional-verification/2026-10-15.12
Tier: M (new eval tooling, no production data path, no auth/tenant/prod-write; mock only)
Base / checked state: base 38e751d, code commit d05dca8396916632f9de46c27dec640a1759c346 on p1/u4, clean tree at the pre-check run.
Gate answers: no production Mongo, no network, no paid provider call, no push; REAL path proven to refuse (no G-REAL flag; flag but not wired) and to hard-stop on injected overspend only. No `.claude/**`, TASKS.md, qa/QUEUE.md, DECISIONS.md, ARCHITECTURE.md, contracts/ or qa/contracts/ edited.
Affected tests / full-suite trigger: the 10 files in the command below (8 new + existing dataset.test.ts and run-eval.test.ts, which share the edited dataset.ts / run-eval.ts); plus engine `tsc --noEmit` and `tsc --noEmit -p evals/tsconfig.json`. No full suite run by the builder. Shared test lock respected (scripts/vc-testlock.sh). Environment: worktree deps from `pnpm install --offline --frozen-lockfile --ignore-scripts` (no network).
Pre-check[A24]: d05dca8 bash scripts/vc-testlock.sh node --import tsx --test evals/budget.test.ts evals/kb-eval.test.ts evals/claims-check.test.ts evals/probes.test.ts evals/latency.test.ts evals/h2h.test.ts evals/live-audio.test.ts evals/p1-runners.test.ts evals/dataset.test.ts evals/run-eval.test.ts (cwd packages/engine) -> exit 0, 119/119 pass, 0 fail/cancel/skip (A24 nodes: budget.test.ts 15 + the 5 runners' hard-stop/month-cap/refusal nodes in p1-runners.test.ts) t=26 blobs=budget.test.ts:a0773cc,p1-runners.test.ts:d05490d
Pre-check[A2a]: d05dca8 same single run as above (not a repeat) -> exit 0, 119/119 (A2a nodes: kb-eval.test.ts 11 + eval:kb mock verdict node) t=26 blobs=kb-eval.test.ts:a3fbf69,p1-runners.test.ts:d05490d
Pre-check[A1-A4-A8-A10-A14-plumbing]: d05dca8 same single run as above -> exit 0, 119/119 (claims-check 9, probes 10, latency 8, live-audio 13, h2h 12) t=26 blobs=claims-check.test.ts:96dfbcd,probes.test.ts:35d70ea,latency.test.ts:4eca4fe,live-audio.test.ts:cc9a661,h2h.test.ts:04ffaac
Pre-check[typecheck]: d05dca8 `pnpm exec tsc --noEmit -p evals/tsconfig.json` and `pnpm exec tsc --noEmit` (cwd packages/engine, under the lock) -> exit 0 and exit 0
Metrics: start=2026-10-17T14:00:42+05:30 end=2026-10-17T14:20:17+05:30 wall_min=20 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=5 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-15.12 lane=normal check_s=26 mutants=5 defects_unit=1 defects_6c=0

(start= is the mtime of the worktree's first on-disk artifact, node_modules at 14:00:42; end= from `date -Iseconds`. defects_unit=1: my own flawed judge-sheet test (asserted origin-free text over fixtures whose answers literally said "VC answer"), fixed before commit.)

## How to verify (commands + expected)
- `bash D:/vc/scripts/vc-testlock.sh node --import tsx --test evals/budget.test.ts evals/kb-eval.test.ts evals/claims-check.test.ts evals/probes.test.ts evals/latency.test.ts evals/h2h.test.ts evals/live-audio.test.ts evals/p1-runners.test.ts evals/dataset.test.ts evals/run-eval.test.ts` (cwd `<worktree>/packages/engine`) -> expected: exit 0, 119 pass, 0 fail.
- `pnpm eval:kb --out=<tmpdir>` -> expected: `A2a ... 44/45 (97.8%) ... PASS`, `A2b ... NOT PROVEN`, `synthetic` banner, `g-008: miss`.
- `pnpm eval:kb --real --out=<tmpdir>` (no env flag) -> expected: exit 1, "REAL mode refused: set VC_G_REAL=1 ...", no output dir.
- `VC_G_REAL=1 pnpm eval:live --real --out=<tmpdir>` -> expected: exit 1, "not wired" refusal, no ledger.
- `pnpm exec tsc --noEmit -p evals/tsconfig.json` and `pnpm exec tsc --noEmit` -> expected: exit 0.

## Actual outputs (from maker's own run)
```
ℹ tests 119 / ℹ pass 119 / ℹ fail 0 / ℹ cancelled 0 / ℹ skipped 0   (exit 0, 26 s wall incl. lock)
tsc_evals_exit=0  tsc_engine_exit=0
--- pnpm eval:kb (mock)
Fixture source: `synthetic` · Questions: 60 · k=3 · Unrecorded queries: 0
| A2a English hit@3 | 44/45 (97.8%) vs threshold 95.0% · countries 12 · themes 6 · **PASS** |
| A2b Hindi/Hinglish hit@3 | 15/15 (100.0%) · **NOT PROVEN** (... A2b is REAL-only (G-REAL).) |
- g-008: miss
--- eval:kb --real, no flag
REAL mode refused: set VC_G_REAL=1 only after Umesh's per-use G-REAL approval (plan gate G-REAL, contract B13). Mock mode needs no flag.
--- VC_G_REAL=1 eval:live --real
run-live --real: the real provider/KB/audio path is not wired in this unit (U4 delivers the harness; ...). Refusing rather than faking a real run.
```
TDD: `budget.test.ts` was run first with `./budget.js` absent -> `✖ evals\budget.test.ts` (fail 1, module not found) = red; implementation then 15/15 green. Remaining test files were written alongside the implementation in one pass (red not separately captured for them; the mutants below are their falsification evidence).

## Capability coverage (each new claim -> its isolating falsification)
Mutants were applied by `sed` to the unit's own new files in the worktree, one at a time, then restored from a byte copy; baseline GREEN is the 119/119 run above (budget+kb-eval subset re-run green after restore: 26 pass, 0 fail).

| Criterion | capability (one line) | the check that covers it | the falsifying edit | observed (pasted runner output) |
|---|---|---|---|---|
| A24 | per-run USD 50 hard stop | budget.test.ts "a charge that would pass USD 50 in one run aborts ..." | M1: delete `if (runWould > this.perRunCapUsd) abort(...)` in budget.ts | `✖ a charge that would pass USD 50 in one run aborts, is NOT recorded as spent, and logs the abort` ; `✖ exactly USD 50 in a run is allowed; the next cent is not (boundary)` ; `✖ executeReal returns an aborted-budget result ...` (pass 11, fail 4) |
| A24 | REAL refuses without VC_G_REAL | budget.test.ts "assertGReal refuses ..." + "executeReal refuses without G-REAL ..." | M2: replace the `env[G_REAL_ENV] !== "1"` throw with a comment | `✖ assertGReal refuses without the explicit VC_G_REAL flag, in every non-approved shape` ; `✖ executeReal refuses without G-REAL: body never runs and no ledger file is created` (pass 13, fail 2) |
| A24 | USD 200/month hard stop across runs/processes | budget.test.ts "month cap USD 200 counts spend across separate runs ..." | M3: delete the `monthWould > perMonthCapUsd` abort | `✖ month cap USD 200 counts spend across separate runs and aborts the run that would pass it` ; `✖ caps are adjustable per guard ...` (pass 13, fail 2) |
| A2a | Hit@3 threshold 0.95 | kb-eval.test.ts "the threshold is 0.95 and a drop below it is FAIL" | M4: `A2A_THRESHOLD = 0.5` | `✖ the threshold is 0.95 and a drop below it is FAIL (falsification: rank-4 hits do not count)` (pass 10, fail 1) |
| A2a | hits ranked by score, not array order | kb-eval.test.ts "hits are ranked by score, not by array order" | M5: slice top-k before sorting by score | `✖ hits are ranked by score, not by array order (a high-score hit listed last still counts)` (pass 10, fail 1) |
| A24 (all runners) | each REAL runner is hard-stopped and still writes an abort report | p1-runners.test.ts "<runner>: REAL hard-stops at USD 50 per run ..." and "... USD 200 per month across runs" for run-kb, run-h2h, run-probes, run-latency, run-live | covered by M1/M3 at the shared `runRealPath`->`executeReal` seam (no per-runner cap code exists to mutate) | the same M1/M3 edits (shared `budget.ts`) are what these 10 nodes depend on; per-runner nodes are green at 119/119. NOT separately mutated per runner. |
| A1, A4, A8, A10, A14 | harness oracles/plumbing | claims-check, probes, latency, live-audio, h2h tests incl. per-profile/per-rule falsification nodes (e.g. each Mock Live bad profile fails exactly one sub-check; leaky/web/paraphrasing answerers caught by probes; self-judged and safety-failure ratings caught by tally) | no source mutants run for these oracles (maker evidence is the negative-profile tests themselves); checker may mutate | n/a — stated gap, harness-only criteria whose real proof is REAL runs under G-REAL |

## Live browser evidence
Not UI-touching — no surface changed (changed paths are packages/engine/evals/*.ts, fixtures/*.json(l) and packages/engine/package.json scripts; no apps/web or apps/api file).

## Honest limits (for the checker)
- A2a PASS here is on a SYNTHETIC fixture (`source: synthetic`, banner in the report); it proves the harness, not retrieval quality. U2/U3 supply recorded data. A2b, A4-real, A8, A10, A14 are NOT PROVEN by this unit by design (mock cannot prove them; the reports say so).
- REAL runners have no real caller wired (`RealNotWiredError`); only the gate and the budget stop are proven, with an injected overspending `realBody`.
- The claims check's "supports" test for `kind: fact` is a lexical proxy (>=60% of content words); stated in code and not a semantic proof.
- Pre-existing spec figures USD 50/200, `VC_G_REAL` env name and the `syn-`-style choices are [ASSUMPTION]s I made where the spec left them open (flag name `VC_G_REAL=1`; ledger path `qa/evals/p1/spend-ledger.jsonl`, not created in mock mode).
- Dependencies for the worktree came from an offline frozen install; `pnpm-lock.yaml` unchanged.

## Status: ready-for-check
