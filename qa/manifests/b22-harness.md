# Manifest — b22-harness

Policy-Version: proportional-verification/2026-10-19.17
**Contract:** B22 (qa/contracts/counselling-engine.md:358-368, approved in qa/gates/plan-approved.md:14-16); brief qa/evidence/p2-briefs/b22-harness.md. Not an edit to qa/contracts. This is NOT the B22-S head-to-head (h2h.ts A14, contract line 369), which stays green.
**Date:** 2026-10-25
**Tier:** M
**Executor:** claude-sonnet-subagent
**Executor rationale:** one build unit in one worktree (D:/vc/.worktrees/b22-harness, branch wave/b22-harness, base 852e0e8). Code commit cb4c900.
**Fix cycle:** 0
**Dual check:** no
**Dual-check reason:** an offline eval grader and a markdown renderer; no auth, tenancy, gate or production-write behaviour.
**Status:** checked-PASS (cycle 0, verdict d019c92, merged 8b5c49b)
**Persona walk:** skip (no screen or flow)
**Live browser:** Not run (eval tooling only)

Round: 1 round, 3 files, 6 criteria, est 30 min (grader + renderer + tests in the existing evals files)
mutant-cap-raise: the brief requires one falsification per criterion (C1-C5), and C1 carries two sides (never a pass, never a block), so 6 mutants against the tier-M cap of 3.

## Acceptance criteria (verbatim from contract B22 and the brief)
- **C1 (before the reference exists):** "until Sapna ma'am's reference rubric is recorded, B22 is reported as `NOT-YET-MEASURABLE`, never as a pass, and it does not block unit PASS." Brief: "With no reference rubric the harness must report NOT-YET-MEASURABLE, never a score."
- **C2 (case set):** "the case set is the golden sessions (T-009), anonymised (B13)."
- **C3 (grader):** "an independent grader scores the `gaurav-pm` and `gaurav-bhaiya` walks with VC against that rubric." Brief: rubric grader; deterministic mock/rule providers only, no live provider calls.
- **C4 (once the reference exists):** "a person with no counselling background, working with VC, reaches at least 90 % of the expert benchmark (`sapna-expert`) on the same case"; "B22 becomes a release gate."
- **C5 (no authored rubric content):** "The rubric is a TS type only; you author no rubric content (Goodhart, ISS-081)."
- **C6 (regression):** the P1 B22-S head-to-head (`h2h.ts`, A14) "exists and must stay green".

## What changed (all in place, no new module, no file deleted)
- packages/engine/evals/h2h.ts
  - header comment (lines 15-17) points at the new section; imports `existsSync/readFileSync`, `z`, and `ProvenanceSchema/stripBom/Provenance` from `./dataset.js` (lines 19-21).
  - new section from line ~255 (after `tallyH2h`): `B22_TARGET` (267), `B22_PERSONAS`, types `RubricItem` / `ReferenceRubric` (the rubric TYPE; zod schema + `parseReferenceRubric` 299 + `loadReferenceRubric` 314: an absent file is `null`), `B22Walk`, `B22Grader` (sees an item and the answer text only), `ruleGrader` 334 (deterministic any-of substring, NFKC / lowercase / whitespace-collapsed), `gradeB22` 361.
- packages/engine/evals/report.ts: import line 7 gains `B22Result`; new `toB22Markdown` (line 201, before `judgeSheetMarkdown`). Without a measurable verdict it prints NOT-YET-MEASURABLE and no score row.
- packages/engine/evals/h2h.test.ts: imports extended; 12 tests appended ("B22: ..."). Tests only added.
- Not touched: `buildBlindPairs`, `tallyH2h`, `run-h2h.ts`, `toH2hMarkdown`, qa/contracts, qa/gates, qa/verdicts, qa/issues.jsonl, .claude/**, docs/DECISIONS.md, ARCHITECTURE.md, TASKS.md.

## Design decisions the checker should know
1. **Verdict rules (gradeB22).** NOT-YET-MEASURABLE (score null, perCase empty, blocksRelease false) when ANY of: no rubric; rubric source is not `recorded` (a synthetic rubric cannot measure, same vocabulary as every eval input); rubric author is not `sapna-expert`; the rubric covers fewer cases than the golden set; any of the 2 personas x N cases walks is missing or blank; no cases. Only a complete, recorded, sapna-expert rubric yields PASS or FAIL.
2. **Bar.** Each persona's score = sum(rubric weight met) / sum(rubric total weight) over all cases; PASS needs BOTH personas >= 0.9; `score.overall` is the worse persona. FAIL sets `blocksRelease` (contract: "becomes a release gate"). A measurable FAIL blocks; NOT-YET-MEASURABLE never does.
3. **[ASSUMPTION]** The expert benchmark per case is the rubric's total weight (the rubric is Sapna ma'am's judgement of the full-marks outcome). The contract does not say whether `sapna-expert` is itself graded on the same rubric; if she should be, `gradeB22` takes an expert walk the same way. Flagged for Umesh/Sapna ma'am; no code depends on it beyond the denominator.
4. **[ASSUMPTION]** Rubric items carry `anyOf` terms so the deterministic rule grader can mark them. A real LLM grader (the contract's "independent grader") is injected through the `grader` argument and needs g-real; none is called here.
5. **Goodhart (C5).** No rubric content exists in code. The test rubric is placeholder tokens ("TEST-ONLY criterion", `tok-one`). The score is capped at the rubric total (a padded answer cannot exceed 100%, tested). The repo still has no recorded rubric, so a real run today is NOT-YET-MEASURABLE.
6. No CLI/runner was added (it would need a new file); `loadReferenceRubric(path)` + `gradeB22` + `toB22Markdown` are the integration points for one later.
7. Not done by the maker: the `senior-software-engineer` review (the writer never reviews its own code); the checker or orchestrator dispatches it.

## Tests and pre-checks (taken on the final code sha cb4c900, cwd packages/engine of the worktree)
Tests[C1]: h2h.test.ts "B22: with no reference rubric the verdict is NOT-YET-MEASURABLE, never a score, never a pass, and it does not block" (null and undefined rubric; score null, perCase empty, blocksRelease false, markdown has no PASS/FAIL and no persona row), and "B22: a rubric that is not the recorded sapna-expert one cannot measure ..." (synthetic, wrong author, empty, partial), and "B22: a missing or empty walk ..." (persona absent, one walk missing, one blank) — prove the unmeasurable cases never yield a score or a pass
Tests[C2]: h2h.test.ts "B22: the case set is the T-009 golden sessions, and the personas are the two non-expert walkers" (case ids read from qa/evals/scribe/sessions.jsonl via loadDataset; 113 sessions, unique) and "B22: malformed input is a hard error" (a walk naming a non-golden case throws) — prove the case set is the golden sessions
Tests[C3]: h2h.test.ts "B22: the grader is blind (sees a rubric item and answer text only) and order-independent" (one call per walk per item, exactly 2 args, no persona/sapna text in them; reversed case and walk order gives the same result), "B22: ruleGrader is a deterministic ..." (case-insensitive, Devanagari, empty anyOf) — prove both personas are scored blind against the rubric
Tests[C4]: h2h.test.ts "B22: once the rubric exists the 90% bar is exact per persona: 9/10 passes, 8/10 fails and blocks release" and "B22: both personas must clear the bar ..." (pm 100%, bhaiya 75% -> FAIL, overall 0.75, blocksRelease, markdown rows) — prove the 90% bar and the release gate
Tests[C5]: h2h.test.ts "B22: the rubric file loader: absent file is null ..., a BOM is stripped, a malformed file throws" (source "Recorded", empty anyOf, zero weight all refused) and "B22: a padded answer cannot beat the expert" — prove the rubric is a validated type and cannot be gamed upward
Tests[C6]: whole file h2h.test.ts (the 15 pre-existing A14 tests unchanged and green) plus every other test file in packages/engine/evals (312 tests in all) — regression
Pre-check[C1]: cb4c900 `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 900 pnpm exec tsx --test evals/h2h.test.ts` -> exit 0, 27 tests, 27 passed, 0 failed (whole file; 12 B22 tests included)
Pre-check[C2]: cb4c900 same command -> exit 0, 27 passed, 0 failed
Pre-check[C3]: cb4c900 same command -> exit 0, 27 passed, 0 failed
Pre-check[C4]: cb4c900 same command -> exit 0, 27 passed, 0 failed
Pre-check[C5]: cb4c900 same command -> exit 0, 27 passed, 0 failed
Pre-check[C6]: cb4c900 `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 900 pnpm exec tsx --test evals/h2h.test.ts` -> exit 0, 27 tests, 27 passed, 0 failed (the 15 pre-existing A14 tests included); and `... tsx --test evals/*.test.ts` -> exit 0, 312 tests, 312 passed, 0 failed
Pre-check[typecheck]: cb4c900 `pnpm exec tsc --noEmit` in packages/engine -> exit 0, no output
Pre-check[typecheck evals]: cb4c900 `pnpm exec tsc --noEmit -p evals/tsconfig.json` in packages/engine -> exit 0, no output
TDD red run (before the implementation, tests already appended): `... tsx --test evals/h2h.test.ts` -> 1 failed (module import of the B22 exports does not resolve), 0 passed. Baseline before any edit: `tsx --test evals/h2h.test.ts evals/dataset.test.ts` -> 32 passed, 0 failed.

Falsify[C1]: in a copy outside the tracked tree (packages/engine/evals-fals, untracked, deleted afterwards; control = unmutated copy 27/0) the no-rubric NOT-YET-MEASURABLE return changed to verdict "PASS" -> 3 failing (the no-rubric test, the non-sapna-rubric test, the missing-walk test). Second mutant: the NOT-YET-MEASURABLE result sets blocksRelease true -> 2 failing (no-rubric test, missing-walk test).
Falsify[C2]: same copy, the "is not a golden case" throw deleted -> 1 failing ("malformed input is a hard error").
Falsify[C3]: same copy, the grader called with the persona appended to the answer (`grader(it, answer + " " + persona)`) -> 1 failing (the blind-grader test).
Falsify[C4]: same copy, `B22_TARGET` 0.9 -> 0.8 -> 2 failing (the golden-case/target test and the 9/10-passes, 8/10-fails test).
Falsify[C5]: same copy, the `source !== "recorded"` refusal disabled -> 1 failing (the non-sapna-rubric test).
Falsify[C6]: the 15 A14 tests are untouched code paths (no edit to `buildBlindPairs`/`tallyH2h`); a regression there is caught by the unchanged pre-existing tests, which pass 27/27 with the B22 section present. Not separately mutated.

Metrics: files_edited=3 manifest=1 tests_added=12 mutants=6 suite_runs=0 (the `evals/*.test.ts` run is the 6c-scoped regression of one package, not a full-repo suite)
