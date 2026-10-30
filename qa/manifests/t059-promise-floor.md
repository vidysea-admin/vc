# t059-promise-floor - T-059 promise-floor residual false negatives (D-142 item 2)

Status: ready-for-check
Fix cycle: 1
Policy-Version: proportional-verification/2026-10-19.17
Tier: M (engine safety guard)
Round: 2 (repair fix cycle 1, est 25 min; touched graph.ts + student-graph.test.ts + this manifest)
Repair base: d79b49f8 (carries the cycle-0 checker PASS)
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

## Repair cycle 1 (senior review qa/evidence/reviews/t059-promise-floor-senior.md, Warning)

- packages/engine/src/student/graph.ts, in place:
  - R1 (M2 regression): `CLAUSE_BREAK` now treats a `.` between digits as a non-break only when the digits are followed by percent / % / per cent (`\.(?!\d+\s{0,2}(?:%|percent|per\s?cent))`); "2.5 GPA" is a break again, "99.9 percent" is not.
  - R2 (M1): `NA_NEGATION` (na right before the phrase) removed; `na` negates only at the start of its clause.
  - R3 (L1): `negatedBefore(before, matched)` applies `NOBODY_BEFORE` only when the matched phrase is a guarantee/assurance word (`GUARANTEE_WORD`: guarant, garan, gyaran, assur, Devanagari guarantee).
  - R4 (L2): danda and double danda are clause breaks; Devanagari `कोई भी` added to `IDIOMATIC_NEGATION`.
- packages/engine/tests/student-graph.test.ts: 8 sentences appended to T059_PROMISES, 4 to T059_NEUTRAL; nothing removed or weakened.
- Not touched: docs/DECISIONS.md, qa/contracts, .claude/**. The stray zz-probe-tmp.ts named by the review is not present in this worktree (git status clean before the edit).

Tests[R1]: packages/engine/tests/student-graph.test.ts "T-059: promisesOutcome flags the residual idiom, unrelated-verb and Hindi classes" (flags "No 2.5 GPA needed admission guaranteed") and "... keeps decimal-point and real-negation phrasing neutral" ("There is no 99.9 percent guarantee", "Not 99.9 percent guaranteed" stay neutral).
Tests[R2]: same flag test ("Aap join kar lo na pakka milega", "Aao na guaranteed admission", "ye admission hai na pakka") and neutral test ("Na pakka hai", "Na pakka hai, koi guarantee nahi").
Tests[R3]: same flag test ("Nobody will definitely get rejected here") and neutral test ("Nobody can guarantee admission").
Tests[R4]: same flag test ("कोई भी आए। एडमिशन पक्का", "कोई भी आए एडमिशन पक्का", "कोई नहीं आया। एडमिशन पक्का") and neutral test ("कोई भी गारंटी नहीं दे सकता").
Tests[C-all]: all 16 original T059_PROMISES flagged, 6 original T059_NEUTRAL clean, the linear-time guard (20,000 chars, under 50 ms) and the 7 importer files below.

Pre-check[R1]: 732445e8 `cd packages/engine && npx tsx --test tests/student-graph.test.ts` -> green, 142 pass, 0 failures (flag + neutral tests ok)
Pre-check[R2]: 732445e8 `cd packages/engine && npx tsx --test tests/student-graph.test.ts` -> green, 142 pass, 0 failures (flag + neutral tests ok)
Pre-check[R3]: 732445e8 `cd packages/engine && npx tsx --test tests/student-graph.test.ts` -> green, 142 pass, 0 failures (flag + neutral tests ok)
Pre-check[R4]: 732445e8 `cd packages/engine && npx tsx --test tests/student-graph.test.ts` -> green, 142 pass, 0 failures (flag + neutral tests ok)
Pre-check[C-all]: 732445e8 `cd packages/engine && npx tsx --test tests/lk5.test.ts tests/coach-first.test.ts tests/crisis-defaults.test.ts tests/lang.test.ts tests/pathlynks-tools.test.ts tests/capability-manifest.test.ts evals/coverage.test.ts` -> green, 232 pass, 0 failures; linear-time guard 10.9 ms (limit 50 ms) inside the 142/142 run

Falsification[R1]: golden red-before/green-after - on d79b49f8 (before) "No 2.5 GPA needed admission guaranteed" was NOT flagged; after, flagged. Mutation in a throwaway copy of the promise section (scratchpad, outside the worktree): decimal rule back to `\.(?!\d)` -> sentence unflagged (red); restored -> flagged.
Falsification[R2]: golden - on d79b49f8 "Aap join kar lo na pakka milega", "Aao na guaranteed admission", "ye admission hai na pakka" were all NOT flagged; after, all flagged. Mutation: `na` right before the phrase negates again -> all three unflagged (red).
Falsification[R3]: golden - on d79b49f8 "Nobody will definitely get rejected here" NOT flagged; after, flagged. Mutation: NOBODY_BEFORE applied to every phrase -> unflagged (red); "Nobody can guarantee admission" stays neutral on both.
Falsification[R4]: golden - on d79b49f8 "कोई भी आए। एडमिशन पक्का", "कोई भी आए एडमिशन पक्का" NOT flagged; after, flagged. Mutations: danda removed from CLAUSE_BREAK -> "कोई नहीं आया। एडमिशन पक्का" unflagged (red); `|कोई\s+भी` removed from IDIOMATIC_NEGATION -> "कोई भी आए एडमिशन पक्का" unflagged (red). (With the idiom present the first sentence survives without the danda; the second sentence pins the danda break.)

Metrics: suite_runs=0 (touched file + 7 importers only), files_edited=3 (graph.ts, student-graph.test.ts, this manifest), residual known over-flags unchanged from cycle 0 ("It's not only about guarantee: nobody can guarantee admission").
