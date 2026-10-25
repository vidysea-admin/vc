# Verdict: w1-conformance (Mode A, single coordinator)

**Cycle checked:** 0
**Checker:** /checker (fresh context), read-only toward the artifact; wrote only this file and two new finding rows in qa/issues.jsonl
**Code tested:** wave/w1-conformance tip 08fe8af (code commit 2237880, base da2faad)
**Policy-Version:** proportional-verification/2026-10-19.17
**Overall:** PASS. Q1-Q4 each proven by checker-built fixtures (not the maker's tests), green-before/red-after falsification per criterion, and an independent recount of main's ledger. Two LOW findings (ISS-w1-conformance-1, -2), neither a criterion failure.

## Commands (all outside D:/vc, fixtures and mutants under the session scratchpad `chk/`)
- `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 900 bash scripts/vc-regression-check-conformance.test.sh` in the worktree -> exit 0, `Summary: 91 passed, 0 failed`.
- `python -I scripts/vc-regression-check-conformance.py --repo-root <git archive da2faad>` and an independent `python -I recount.py` field-level merge of da2faad's `qa/issues.jsonl`.
- 15 own fixtures via `python -I mkfix.py` + the script; 5 mutants (sed on copies) rerun on the fixtures.

## Criteria
| Q | Verdict | Evidence |
|---|---|---|
| Q1 ISS-093 | PASS | Fixture q1: fixed row ISS-A (real test file touching its cited symbol), unresolved `type: decorative-regression-check` finding titled "ISS-A's ..." -> `FAIL ISS-A ... decorative regression_check (ISS-F1)`, exit 1. Control q1ctl (no finding) -> PASS exit 0. q1resolved (finding then `update` row status closed) -> PASS exit 0, so resolving clears it. Hostile q1hostile: title form incl. leading spaces flagged (ISS-C, ISS-D); explicit `target:"ISS-A "` (trailing space) and `targets:["iss-b"]` (case) are silently NOT matched -> logged as ISS-w1-conformance-2 (low, not a criterion failure; the criterion does not require normalisation). |
| Q2 ISS-099 | PASS | Fixture q2: test file touching nothing cited -> `coverage-absence (ISS-099)`; row citing nothing -> conforms and counted `coverage-unassessable: 1`; zero-byte and comments-only files -> `empty test file ... never passes` (even for a row citing nothing, ISS-ZEROUNA); covered row conforms. Hostile q2hostile: whitespace-only file rejected as empty; shebang-only file rejected (via the weaker "no real test()" reason, still never passes); token only in a comment or only inside a non-test string -> coverage-absence; case-different symbol in the same file -> covered (literal tier is case-insensitive, by design); missing file -> path-does-not-exist. |
| Q3 ISS-100 | PASS | Fixture q3: 3 identical rows -> `4 ledger lines (2 unique rows after collapsing 2 duplicate copies)`, `DUP ISS-X: 2 extra copies at line(s) 2, 3`, ISS-X listed once. q3stale (open row, update->fixed, identical open copy re-landing) -> `STALE ISS-X: line 3 ... state-revert hazard`; the merged row correctly reverts (not counted fixed). q3hostile: same body with different key order collapsed as a dup; a copy with one extra field NOT treated as a dup. q3stale2: adjacent identical copy is a DUP but not STALE. |
| Q4 ISS-076 | PASS | Fixture q4 (2 verified, 3 named, 2 unnamed incl. a whitespace-only check, 1 open): prints `fixed->verified: 2`, `named-unverified: 3`, `fixed, no named check: 2` and three separate id lists. Main at da2faad (git archive, my own recount agrees): 551 ids, 170 fixed/verified = **4 verified / 109 named-unverified / 57 no-named-check (4+109+57=170)**, `conforming: 126/170 (74.1%)`, 44 FAIL rows, 15 coverage-unassessable, 0 DUP, 0 STALE. All match the manifest. |

## Falsification (copies in scratchpad, green before / red after)
- Q1: `if False and rid in decorative` -> q1 exits 0, ISS-A no longer reported.
- Q2: `if False and cov == "absent"` -> ISS-ABS no longer reported (empty-file rows still reported); `_is_empty_test_file` disabled -> "empty test file" reason gone (ISS-ABS still reported).
- Q3: duplicate branch never taken -> q3 and q3stale show `4 unique rows after collapsing 0`, no DUP, no STALE.
- Q4: the `named-unverified` print removed -> that count absent from q4 output.

## The 6 new coverage-absence hits on main (read 2 plus the title/token extraction for the rest)
- ISS-t-017-c1-1: FALSE POSITIVE. `erasure.test.ts` has "ISS-t-017-rev-3: an onError that returns a NEVER-SETTLING promise does not stall the sweep" (line 1970), exactly the defect; the heuristic's tokens were code snippets from the title (`.finally()`, `if (inFlight) return;`). Row ISS-w1-conformance-1 (low, PROPOSED).
- ISS-t-013-rev-3: TRUE POSITIVE (partial). It cites "We cannot manage 20 lakh" / the `cannot` marker; `scribe-citation-rescope.test.ts` negation cases (line 357 onward) use don't/never/nahi/mat/instead but not `cannot` or this phrase. The other four ISS-t-013 rows cite single-scenario literals the same way; ISS-t-013-rev-6 ("out of the question", "unaffordable") is absent from the file (grep). Net: 5 plausible true positives, 1 false positive.

## Other observations (non-blocking)
- Comment stripper eats `//` inside a string (fixture `url`): can hide a cited token -> false coverage-absence. Logged in ISS-w1-conformance-2.
- Manifest's pre-existing caveat holds: senior-software-engineer review was not run by the maker; this checker's fresh read of the diff found no correctness bug in merge_ledger, decorative_findings, cited_tokens, coverage_absence or main().
- Decorative detection depends on an open finding row; today only ISS-093 (open) exists, and it is reported via its title form; closing ISS-093 clears ISS-t-013-rev-1 with no script change.
- Cosmetic: "1 unique rows" grammar in the header.

## New ledger rows
ISS-w1-conformance-1 (low, false-positive), ISS-w1-conformance-2 (low, instrument-gap).
