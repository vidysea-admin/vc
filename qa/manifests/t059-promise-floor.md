# t059-promise-floor - T-059 promise-floor residual false negatives (D-142 item 2)

Status: ready-for-check
Fix cycle: 0
Policy-Version: proportional-verification/2026-10-19.17
Tier: M (engine safety guard)
Round: 1 (est 30 min)
Worktree: D:/vc/.worktrees/vc-completion/.worktrees/t059-promise-floor, branch wave/t059-promise-floor, base fa678fb4
Authority: D-142 (Changes-authorized: packages/engine/src/student promise-floor detection and its tests only)

## What changed (all in place)

- packages/engine/src/student/graph.ts
  - `NEGATION_BEFORE`: dropped the bare `na` (a Hindi plea particle: "aao na ...").
  - `CLAUSE_BREAK`: a `.` between two digits (99.9) is no longer a clause break.
  - `IDIOMATIC_NEGATION` (stripped before the negation test): not only/just/merely/simply, don't/do not miss (out), no risk/hassle/fee(s)/stress/fuss/cost/catch/obligation, koi baat/fikar/fikr/bhi (+ optional nahi), Devanagari koi baat nahi, and negator + hide/hesitate/deny/shy/afraid/ashamed/embarrassed/reluctant (+ "to say/to admit/that").
  - new `NOBODY_BEFORE` (nobody/noone/none + can/could/will/would/may/is able to, right before the phrase) and `NA_NEGATION` (`na` only at the start of its clause or right before the phrase); both used in `negatedBefore`.
- packages/engine/tests/student-graph.test.ts: T059_PROMISES / T059_NEUTRAL / linear-time tests kept. One test-data fix: `"do not hide ".repeat(1700)` is 20,400 chars and tripped the test's own `h.length <= 20_000` assert, so it is now `.repeat(1660)` (19,920 chars).
- NOT touched: docs/DECISIONS.md, qa/contracts, .claude/**, any other file.

## Tests

Tests[C1]: packages/engine/tests/student-graph.test.ts "T-059: promisesOutcome flags the residual idiom, unrelated-verb and Hindi classes" — asserts every one of the 16 T059_PROMISES sentences is flagged, which is exactly C1.
Tests[C2]: packages/engine/tests/student-graph.test.ts "T-059: promisesOutcome keeps decimal-point and real-negation phrasing neutral", the S13/C4A promise and neutral tests, "T-059 ... stays linear" — the 6 T059_NEUTRAL sentences and every existing neutral fixture stay unflagged, and the new idioms stay linear on 20,000 chars; importers lk5, coach-first, crisis-defaults, lang, pathlynks-tools, capability-manifest, evals/coverage re-run because they import student/graph.

Pre-check[C1]: fa678fb4 `cd packages/engine && npx tsx --test tests/student-graph.test.ts` -> green, 142 pass, 0 failures (C1 test ok)
Pre-check[C2]: fa678fb4 `cd packages/engine && npx tsx --test tests/lk5.test.ts tests/coach-first.test.ts tests/crisis-defaults.test.ts tests/lang.test.ts tests/pathlynks-tools.test.ts tests/capability-manifest.test.ts evals/coverage.test.ts` -> green, 232 pass, 0 failures (plus student-graph 142/142)

## Capability coverage

| Criterion | Red (base fa678fb4, no src change) | Green (worktree) |
|---|---|---|
| C1 residual false negatives flagged | `AssertionError: should flag: Not only is admission guaranteed, it is fast` | `✔ T-059: promisesOutcome flags the residual idiom, unrelated-verb and Hindi classes` |
| C2 neutral text and existing fixtures unflagged | `AssertionError: should pass: There is no 99.9 percent guarantee` | `✔ T-059: promisesOutcome keeps decimal-point and real-negation phrasing neutral`; student-graph.test.ts 142/142 |

Ad-hoc probe (not asserted in tests): "Nobody can stop you, admission is guaranteed" -> true (flagged); "no one can guarantee a seat" -> false; "Na pakka hai" -> false; "no fees guaranteed? no, not guaranteed" -> true (over-flag, documented direction: flag over miss). Residual over-flag: "It's not only about guarantee: nobody can guarantee admission" is flagged.

Metrics: suite_runs=0 (touched file + importers only), files_edited=2 (graph.ts, student-graph.test.ts) + this manifest.
