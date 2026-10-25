# Verdict: b22-harness

Cycle checked: 0
Checked: 2026-10-25T09:22:02+05:30
Verdict: PASS
Artifact: worktree D:/vc/.worktrees/b22-harness, branch wave/b22-harness, head 7ba49ad (code cb4c900), base 852e0e8. Mode A, tier M, single coordinator, Dual check: no.
Policy-Version: proportional-verification/2026-10-19.17

## Executed checks (this checker, identity validated: head 7ba49ad, worktree clean)
- `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 900 pnpm exec tsx --test evals/h2h.test.ts` (cwd packages/engine) -> exit 0, tests 27, pass 27, fail 0.
- `... pnpm exec tsc --noEmit` (packages/engine) -> exit 0, no output.
- Diff 852e0e8..HEAD: 3 modified product files (h2h.ts, h2h.test.ts, report.ts) + the manifest; 0 added product files; h2h.ts has 0 deleted lines (A14 logic untouched), report.ts and h2h.test.ts change only an import line. No fetch/http/child_process/env/provider reference in h2h.ts: no live call path.

## Own falsification (script outside the tree, imports the worktree modules; worktree stayed clean)
- C1 absent / null rubric, source synthetic, source "Recorded" (case-variant), author != sapna-expert, author "Sapna-Expert", rubric covering 1 of 2 cases, a case with an empty item list, a missing walk, only one persona walked, whitespace-only walk, zero cases -> every one NOT-YET-MEASURABLE, score null, blocksRelease false. Controls: complete recorded rubric with matching walks -> PASS 1.0; with non-matching walks -> FAIL 0, blocksRelease true.
- C5 hostile rubric: weights 0, negative, NaN, Infinity, string "5" -> hard throw (refused), never a PASS. Rubric JSON with source "Recorded" -> parse refused. Extra unknown keys at top level and item level -> parsed with the keys stripped (no effect on grading). Missing anyOf or undefined cases built programmatically -> raw TypeError throw (refused, not a pass).
- C3 blind: grader invoked once per walk per rubric item with exactly 2 arguments (item, answer); item keys are id/criterion/weight/anyOf only. Persona-bearing answer text ("persona=gaurav-pm sapna-expert") reaches the grader only as the answer text; no persona or case id is passed. A walk with persona sapna-expert is refused.
- C4 bar: exact per-persona 0.9, overall = the worse persona (builder tests 9/10 pass, 8/10 fail, one weak persona fails).
- C6: the 16 pre-existing tests (A14 and fix6 groups) are green in the 27/27 run.
- C2: case set comes from qa/evals/scribe/sessions.jsonl via loadDataset (builder test, green); a walk naming a non-golden case throws (reproduced).

## PROPOSED-ISSUE lines (none contradicts the contract text; none blocks PASS)
- PROPOSED-ISSUE (Umesh/Sapna ma'am, [ASSUMPTION] 1): the expert benchmark per case is taken as the rubric's total weight; the contract does not say whether sapna-expert is itself graded on the same rubric. Acceptable reading of "reaches 90 % of the expert benchmark"; confirm when the rubric is recorded.
- PROPOSED-ISSUE (Umesh, [ASSUMPTION] 2): rubric items carry anyOf terms for the deterministic rule grader; the contract's "independent grader" will be an LLM grader injected via the grader argument and needs g-real. Consistent with "no live calls" now.
- PROPOSED-ISSUE low: the rubric author is a forgeable string (a file claiming author sapna-expert and source recorded passes). Provenance can only be enforced by the recorded-rubric gate/commit trail, not by this code; the check is a tripwire, not authentication.
- PROPOSED-ISSUE low: manifest says 12 B22 tests and 15 pre-existing; actual is 11 added (16 at base, 27 now). Count error only; coverage per criterion is real.
- PROPOSED-ISSUE low: ReferenceRubricSchema is non-strict (unknown keys silently stripped); a malformed programmatic rubric (missing anyOf) throws a raw TypeError. Both fail closed. Optional hardening: .strict() and a clearer message.
- PROPOSED-ISSUE low: ruleGrader treats any truthy grader return as met in gradeB22 (type says boolean). Irrelevant to the default grader; matters when the LLM grader is injected.
- Not run by this checker: senior-software-engineer review (orchestrator to dispatch, per manifest item 7).

Metrics: criteria=6 falsifications=27 suite_runs=2 (h2h.test.ts, tsc) fix_cycle=0
