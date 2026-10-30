# Verdict: t059-promise-floor

Cycle checked: 0
Checked: 2026-10-30T23:10:00+05:30
Verdict: PASS
Artifact: worktree D:/vc/.worktrees/vc-completion/.worktrees/t059-promise-floor, branch wave/t059-promise-floor, head dc3f33b6, base fa678fb4. Mode A, tier M, single checker.
Policy-Version: proportional-verification/2026-10-19.17

## Scope scan
`git diff --name-only fa678fb4 dc3f33b6` = packages/engine/src/student/graph.ts, packages/engine/tests/student-graph.test.ts, qa/manifests/t059-promise-floor.md. All inside D-142 Changes-authorized (promise-floor detection + its tests); no DECISIONS, contracts, .claude/** or other file touched. Full diff of both product files read.

## Executed checks (this checker)
- `cd packages/engine && npx tsx --test tests/student-graph.test.ts` (head) -> tests 142, pass 142, fail 0; the three T-059 tests ok.
- Importers on head: lk5, coach-first, crisis-defaults, lang, pathlynks-tools, capability-manifest, evals/coverage -> tests 232, pass 232, fail 0.
- Throwaway copy (outside root, scratchpad/fal; the worktree stayed clean, `git status` empty). Falsification, one per criterion plus extras:
  - C1/C2 base red: base graph.ts in the copy -> both T-059 flag and neutral tests fail (candidate confirmed by this checker, not the builder's claim).
  - C1 mutation: drop the `not (only|just|merely|simply)` idiom -> flag test fails on "Not only is admission guaranteed, it is fast".
  - C1 mutation: restore bare `na` in NEGATION_BEFORE -> flag test fails on "Aao na admission pakka hai".
  - C2 mutation: revert the decimal-point clause-break fix -> neutral test fails on "There is no 99.9 percent guarantee".
  - C2 mutation: remove the NOBODY_BEFORE use -> neutral test fails on "I am not shy to say nobody can guarantee a visa".
  - Each mutation was restored from the head file and re-run clean. (One unrelated test, B24.2, fails only in the copy because it reads a sibling dir the copy omits; it passes in the real worktree, 142/142.)

## Judgement: the repeat(1700) -> repeat(1660) edit
Not a protected-test change. The "stays linear" test and its `h.length <= 20_000` assert and `ms < 50` bound are all introduced by this same diff (`@@ -1817` addition, no deleted test lines in the diff), so no pre-existing assertion was weakened. 12 chars x 1700 = 20,400 > 20,000, so the input was over the test's own cap; 1660 gives 19,920. Bound and cap unchanged; measured 6.6 ms vs 50 ms. Input fix, accepted.

## Hostile variants (ad-hoc script, not left in the tree)
Promises, all flagged (true): "Not only fast, admission is guaranteed"; "Not only is it fast. Not just that, admission guaranteed"; "Koi baat nahi, admission pakka"; "Koi fikar nahi, seat pakki hai"; "We don't hesitate: your seat is guaranteed"; "Nobody can stop you, your visa is guaranteed"; "Nobody can say no, admission is 100% guaranteed"; "Na koi dikkat, admission guaranteed"; "No risk. Guaranteed admission"; "No risk, no fuss, your seat is guaranteed"; "Aap na chinta karo admission pakka hai"; "not only that nobody can beat us guaranteed admission"; "Do not miss guaranteed placement"; "Relax, no cost, guaranteed seat"; "Don't hide: admission is guaranteed"; "99.9% guaranteed admission". No bypass found.
Neutral, all unflagged (false): "Nobody can guarantee admission"; "No one can guarantee a seat"; "Nobody will ever guarantee a visa"; "Na pakka hai"; "Koi guarantee nahi hai"; "Guarantee nahi hai bhai"; "Admission is not guaranteed, na koi pakka"; "Nobody is able to guarantee admission"; "Pakka nahi hai, na hi guarantee"; "I cannot guarantee a seat"; "Seats are not only limited, they are not guaranteed"; "It is not 99.9 guaranteed". No new over-flag found.

## Criteria
- C1 PASS: all 16 T059_PROMISES flagged, all 6 T059_NEUTRAL unflagged; red on base, green on head; mutations bite.
- C2 PASS: S13/C4A tests and all 142 student-graph tests green, 232 importer tests green, linear-time guard holds.
- Scope PASS.

## Notes (non-blocking)
- Known documented residual over-flag direction (flag over miss), builder-declared: "It's not only about guarantee: nobody can guarantee admission" is flagged. Acceptable for a safety floor.
- Manifest's "tests kept" wording is loose: all three T-059 tests are new in this diff, none pre-existing.

Metrics: checker_wall_min=~9, suite_runs=0, targeted_runs=4 (student-graph x1 on head, importers x1, 6 mutation runs in copy), probes=2 (28 sentences), files_edited=0 product files, falsifications=5.
