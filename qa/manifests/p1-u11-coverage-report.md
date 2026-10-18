# Manifest — p1-u11-coverage-report
**Contract:** none yet for P1 units (checker-owned). Criteria come from the source brief `qa/evidence/p1-briefs/p1-u11-build.md`, spec v8 (sha e183ee9a) item A17 and scope item 6.
**Criteria:** C1 per-probe counts, C2 gap rows never missing, C3 KB /gaps rows, C4 VC gap counts via port, C5 reproducible, C6 text-free
**Goal task:** none
**Date:** 2026-10-19
**Status:** checked-PASS
**Close-out:** PASS at cycle 0, verdict qa/verdicts/p1-u11-coverage-report.md at d6688d9. Findings and limits filed as ISS-169..ISS-174 in qa/issues.jsonl (all low).
**Fix cycle:** 0 of max 2
**Dual check:** not required (tier S; mock-only eval script, no auth, no student data path, no outward action)
**Persona walk:** skip (no human screen: a CLI report)
**Issues addressed:** none
**Executor:** claude-sonnet-subagent (maker/builder p1-u11)
**Executor rationale:** one small self-contained module (builder, CLI, tests, fixture) in `packages/engine/evals`; nothing else shares its files.

## Criteria
- **C1 per-probe counts** — for every (country, theme) probe: hit count (score >= `DEFAULT_SEARCH_SCORE_THRESHOLD` 1.0), stale count (older than 24 months, `DEFAULT_STALE_AFTER_MONTHS`, configurable), date_unknown count (missing or unparseable session date, never stale, A13) and an unanswered flag (no hit at or above the threshold).
- **C2 gap rows, never missing** — a zero-hit or only-below-threshold probe, an unrecorded probe and a roster cell with no probe each get a row (`unanswered` / `unrecorded` / `no_probe`); a country (or theme) with no answered cell is listed as a no-answer gap; a probe naming a country or theme outside the roster is refused.
- **C3 KB /gaps rows** — the rows of `mcp/university-kb/kb-fixture/gaps.json` (loaded by path, not copied) are listed beside the probes with id, kind, status, description; a field the row lacks shows as `(none)`.
- **C4 VC gap counts via a port** — `listGapCounts`-shaped port, injected; read once per requested date (sorted); totals by kind and by date; a date with no rows shows 0; a failing port or a malformed count fails the report.
- **C5 reproducible** — no clock in the report; `--as-of` is an input (default: the fixture's recordedAt date); two runs write byte-identical files.
- **C6 text-free** — a hit is parsed down to `{score, session.date}`, a port row down to `{date, kind, count}`; turn text, session titles, student/thread ids and probe query text never reach the report.

## What changed
Branch `p1/u11` (base `p1/u8` e2b805d + `main` 114b30b merged, 82db70f), code commit `13ad807`. Four new files and one added script line, all in `packages/engine`:
- `packages/engine/evals/coverage.ts` (NEW) — pure builder `buildCoverageReport`, fixture and KB-gaps loaders, `toCoverageMarkdown`. Imports `DEFAULT_STALE_AFTER_MONTHS` (claims.ts:144) and `DEFAULT_SEARCH_SCORE_THRESHOLD` (graph.ts:211) so the defaults are the engine's own.
- `packages/engine/evals/run-coverage.ts` (NEW) — CLI in the `run-kb.ts` pattern (`writeP1Report`, `P1_REPORT_DIR`). It has its own arg parser because `parseP1Args` rejects `--as-of` and `--gaps`; `--real` is refused (no live mode: G-KB and the KB key D-093 12 are open).
- `packages/engine/evals/coverage.test.ts` (NEW) — 22 tests, picked up by the existing `evals/*.test.ts` glob.
- `packages/engine/evals/fixtures/coverage-probes.sample.json` (NEW, synthetic) — 12 countries x 6 themes (72 cells; 70 probes), 67 recorded searches with turn text on every hit (so a leak would show), 5 VC gap-count rows.
- `packages/engine/package.json` — ONE added script: `"coverage": "tsx evals/run-coverage.ts"`.
- Nothing deleted or renamed; `apps/api`, `packages/db`, `packages/schemas`, `packages/engine/src`, `mcp` untouched. `listGapCounts` is referenced as a type only (`import type`): the report never opens a database connection.
- CORE-REQUEST: packages/engine/src/student/claims.ts export `dateFlags` (and `monthsBetween`) — coverage.ts re-implements the same four-line staleness arithmetic because those are not exported and `src/**` is not mine. Parity is pinned by the C1 boundary test (24 months fresh, 25 stale, day-of-month borrow).

## Open questions (HUMAN_GATE, list only)
- Q-U11-1 [ASSUMPTION implemented]: the VC gap store is text-free and keyed by date and kind only (`GapCountDoc`), so spec A17's "unanswered count (gap counts)" cannot be per country or theme from VC data. Per-probe `unanswered` comes from the probe itself; the VC counts appear as overall totals by kind and by date, and the report says so in its own text. A country/theme dimension would be a schema and privacy change in U8's `packages/db`, not done.
- Q-U11-2: who supplies the real country x theme probe list (counsellor team)? A synthetic list ships; real-KB breadth stays NOT PROVEN, and the report says so.

## Verification scope
Policy-Version: proportional-verification/2026-10-17.14
Tier: S (mock-only eval script; no auth, student data path or outward action)
Round: est 25 min — install the worktree, 22 tests, one fixture, per-criterion falsification and this manifest (lock waits were short)
Base / checked state: base 82db70f (p1/u8 + main), code 13ad807, worktree clean except `qa/evidence/p1-u11/` and this manifest
Affected tests / full-suite trigger: only `packages/engine/evals/coverage.test.ts` is new and the only package file changed is one script line. The typecheck covers all 9 workspace projects. No whole-repo suite.
Tests[C1]: evals/coverage.test.ts — "C1 a counsellor opens the report ...", "C1 only hits below the score threshold ...", "C1 staleness boundary ...", "C1 the report records the asOf ...", "the staleness and score defaults are the engine's own ...".
Tests[C2]: evals/coverage.test.ts — five "C2 ..." tests (zero-hit country, unrecorded probe, no_probe cell and probe-less country, roster violations and duplicates, a throwing search), plus "A17 the coverage command on the sample fixture ...".
Tests[C3]: evals/coverage.test.ts — "C3 KB /gaps rows from the recorded gaps.json ..." (reads the real `mcp/university-kb/kb-fixture/gaps.json`) and "C3 the report carries the KB gap rows ...".
Tests[C4]: evals/coverage.test.ts — three "C4 ..." tests (port per date with totals, no per-probe VC count and the assumption note, failing port / malformed count / bad date).
Tests[C5]: evals/coverage.test.ts — "C5 two runs of the CLI ... byte-identical" and "C5 --as-of is an input ...".
Tests[C6]: evals/coverage.test.ts — "C6 the sample fixture's hits carry turn text, and neither the JSON nor the markdown ..." and "C6 a search hit that carries text or a port row that carries a student field ...".
Pre-check[C1]: 13ad807 bash scripts/vc-testlock.sh pnpm -C p1-u11/packages/engine exec tsx --test evals/coverage.test.ts -> green: 22 passed, 0 failed t=13s (`qa/evidence/p1-u11/coverage-test-final.log`; the C1..C6 tests are in this one file)
Pre-check[C2]: 13ad807 bash scripts/vc-testlock.sh pnpm -C p1-u11/packages/engine exec tsx --test evals/coverage.test.ts -> green: 22 passed, 0 failed t=13s (same run)
Pre-check[C3]: 13ad807 bash scripts/vc-testlock.sh pnpm -C p1-u11/packages/engine exec tsx --test evals/coverage.test.ts -> green: 22 passed, 0 failed t=13s (same run)
Pre-check[C4]: 13ad807 bash scripts/vc-testlock.sh pnpm -C p1-u11/packages/engine exec tsx --test evals/coverage.test.ts -> green: 22 passed, 0 failed t=13s (same run)
Pre-check[C5]: 13ad807 bash scripts/vc-testlock.sh bash -c "pnpm -C p1-u11/packages/engine coverage -- --out <tmp>/a; ... --out <tmp>/b" -> exit 0 twice; `cmp` of coverage-report.json and coverage-report.md between the two runs: BYTE-IDENTICAL (sha256 md 9350dc79..., json 9db34a70...)
Pre-check[C6]: 13ad807 same command -> green: `grep -c SENTINEL` on both report files = 0 (every recorded hit in the fixture carries that text, asserted by the C6 test); plus the C6 tests in the 22-pass run
Pre-check[A17 command]: 13ad807 bash scripts/vc-testlock.sh pnpm -C p1-u11/packages/engine coverage -- --out <tmp> -> exit 0, report head below and in `qa/evidence/p1-u11/coverage-report.md`
Pre-check[typecheck]: 13ad807 bash scripts/vc-testlock.sh pnpm -C p1-u11 -r typecheck -> exit 0 (9 of 10 workspace projects, `qa/evidence/p1-u11/typecheck-final.log`; run on the same tree as the commit)
Metrics: start=2026-10-18T23:45:20+05:30 end=2026-10-19T00:14:39+05:30 builder_min=29 wall_min=29 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=1 mutations=11 survivors_final=0 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-17.14 lane=normal check_s=13 mutants=11 defects_unit=unavailable defects_6c=0
mutant-cap-raise: the brief asks one falsification per criterion; C1, C2 and C6 each name several independent behaviours (boundary vs undated vs score; no_probe vs unrecorded; hit text vs query text vs port fields), so 11 single-line edits were run, all killed, none left in the tree (policy .9)
(repeat_runs=1: the test file was run once before a test-only edit and once on the final commit; the A17 command was run twice on purpose for the byte comparison. mutations=11: the brief asks one per criterion; C1, C2 and C6 name several independent behaviours, so 3, 2 and 3 edits.)

### A17 report head (`pnpm -C packages/engine coverage -- --out <tmp>`, full file in `qa/evidence/p1-u11/coverage-report.md`)
```
# Coverage report (A17)
Mode: `mock` · Fixture source: `synthetic` · As of: 2026-10-17 · Stale after 24 months · A hit counts at score >= 1
> Synthetic fixture: this proves the report only. Real breadth is NOT PROVEN until the counsellor team supplies the country x theme probe list (Q-U11-2) and a recorded KB capture exists (G-KB).
Cells: 72 · answered 53 · unanswered 14 · unrecorded 3 · no probe 2 · hits 159 (stale 20, date_unknown 14)
No-answer countries: Japan, Singapore
No-answer themes: none
```

## Capability coverage (each criterion -> falsifying edits, run by editing `evals/coverage.ts` in the p1-u11 worktree one line at a time, then restored; `git status` clean afterwards; log `qa/evidence/p1-u11/falsification.log`)
Column "before" is the green baseline of `evals/coverage.test.ts` (22/22); "after" is the run with exactly one edit. Not run in a separate copy of the tree: the worktree is a throwaway scratchpad branch, and the file was restored from the in-memory original and confirmed by a clean `git status`.
| id | falsifying edit | before (pass/tests) | after | first failing test |
|---|---|---|---|---|
| C1a | stale boundary `>` becomes `>=` | 22/22 | 1 fail of 22 | C1 staleness boundary follows asOf and the months threshold |
| C1b | score boundary `<` becomes `<=` | 22/22 | 1 fail of 22 | C1 a counsellor opens the report ... each is counted in its own column |
| C1c | an unparseable date is counted fresh | 22/22 | 1 fail of 22 | C1 a counsellor opens the report ... |
| C2a | the no_probe cell row is dropped | 22/22 | 2 fail of 22 | C2 a country in the roster with no probe for a theme still gets a row |
| C2b | the unrecorded branch removed (undefined is iterated) | 22/22 | 14 fail of 22 | C1 a counsellor opens the report ... (it crashes; the C2 unrecorded test is among the 14) |
| C3 | KB gap rows not carried into the report | 22/22 | 2 fail of 22 | C3 the report carries the KB gap rows next to the probes |
| C4 | `totalsByKind` overwrites instead of adding | 22/22 | 2 fail of 22 | C4 VC gap counts are read through the port once per requested date |
| C5 | a `generatedAt` wall-clock field added | 22/22 | 1 fail of 22 | C5 two runs of the CLI ... byte-identical |
| C6a | the probe query text added to each row | 22/22 | 1 fail of 22 | C6 the sample fixture's hits carry turn text ... |
| C6b | a port row copied whole instead of projected | 22/22 | 1 fail of 22 | C6 a search hit that carries text or a port row ... |
| C6c | turn text copied from the hit into the row | 22/22 | 1 fail of 22 | C6 a search hit that carries text or a port row ... |

All 11 edits were killed; 0 survivors. C2b is a weak kill (a crash, not an assertion on the unrecorded status), so the checker may want a sharper edit there.

## Live browser evidence
Not applicable, script. No UI-touching path changed (`packages/engine/evals/**` only).

## Not done / stated limits (for the checker)
- **Synthetic data only.** The probe list, the recorded hits and the VC gap-count rows are invented; the report labels itself synthetic and says breadth is NOT PROVEN. A recorded KB capture needs G-KB and the KB key (D-093 12), both open.
- **VC gap counts are overall, not per country or theme** (Q-U11-1, above). In the CLI they come from the fixture through the port shape of `listGapCounts`; the live call is `(input) => listGapCounts(db, input)`, passed as `deps.gapCounts` to `runCoverage`. That wiring needs a tenant-scoped Db and is not made here (no Mongo connection).
- **"Hit" = score >= threshold.** Below-threshold hits are counted separately and do not count as an answer. Stale and date_unknown are counted over the counted hits only. Duplicate hits are not de-duplicated.
- **Probe query text** is read to look up the recorded search but never printed (only the probe id is). It is counsellor-authored probe text, not a student question.
- **Staleness arithmetic is duplicated from claims.ts** (CORE-REQUEST above).
- `--out` defaults to `qa/evals/p1/reports` like the other runners; the A17 command above used a temp directory.
- Commit trailer is `Co-Authored-By: Claude Sonnet 5.5` (the model that ran this build), not the Opus line in the common brief.
- No `senior-software-engineer` review dispatched (brief: no checker; the orchestrator owns it).

## How to verify (commands + expected)
- `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh pnpm -C <worktree>/packages/engine exec tsx --test evals/coverage.test.ts` -> tests 22, pass 22, fail 0.
- `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh pnpm -C <worktree>/packages/engine coverage -- --out <tmp>` -> exit 0; `coverage-report.json` and `.md` in `<tmp>`; run it twice into two directories and `cmp` them.
- `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh pnpm -C <worktree> -r typecheck` -> exit 0.
- Evidence: `qa/evidence/p1-u11/` (`coverage-test-final.log`, `typecheck-final.log`, `falsification.log`, `coverage-report.md`, `coverage-cmd-stdout.txt`).
