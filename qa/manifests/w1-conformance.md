# Manifest - w1-conformance
Policy-Version: proportional-verification/2026-10-19.17
**Unit:** w1-conformance (wave 1, qa tooling, Tier M). Brief: qa/evidence/p1-briefs/w1-conformance.md; common rules qa/evidence/p1-briefs/w1-common-rules.md.
**Branch / base:** wave/w1-conformance from main da2faad. Final code sha: 2237880.
**Files changed (2, both existing, edited in place):** scripts/vc-regression-check-conformance.py, scripts/vc-regression-check-conformance.test.sh. `qa/issues.jsonl` NOT touched (checker owns it).

## Criteria (verbatim from the brief)
- **Q1 (ISS-093).** The script reports a decorative regression_check as non-conforming. A decorative check runs a test that does not exercise the cited defect; ISS-t-013-rev-1 is an example. Test it with a fixture row.
- **Q2 (ISS-099).** The script reports coverage-absence: a row whose regression test file exists but has no test touching the cited file or symbol. An empty test file never passes. This is the companion of ISS-094.
- **Q3 (ISS-100).** Ledger rows copied across branches (same id, identical body) are detected and reported once, not counted twice.
- **Q4 (ISS-076).** The report lists fixed->verified rows separately from named-unverified rows, and prints both counts. Record both counts for main in the manifest.

**Dual check:** no (qa tooling script and its fixture tests; no auth, persistence or safety product code)
Round: 1 build round, 2 files, 4 criteria, 1 checker, est 30 min

## What changed (file:line on 2237880)
- `merge_ledger` (py:~85-125) now also returns `{"dupes","stale"}`: copies detected by (id, canonical JSON body), merge still applies every line in file order. Only caller updated: `main()`.
- `decorative_findings` + `RE_FINDING_TARGET` (py:~175-195): an unresolved `type: decorative-regression-check` finding marks its targets (`targets`/`target` field, else the leading "<id>'s" of the title). Resolved = fixed/verified/closed/wontfix.
- `cited_tokens`, `Checker.coverage_absence`, `Checker._is_empty_test_file` (py:~196-232, ~330-380): coverage-absence for direct-tsx rows. Cited tokens, most specific first: explicit `cited_symbols`/`cited_files`; quoted/backticked literals (plus 3+ digit numbers only alongside one); else file stems and identifiers. Nothing cited = "unassessable", never guessed. Empty/whitespace/comments-only test file is rejected with "empty test file" in `conforms_one`'s direct-tsx branch.
- `main()` (py:~455-540): decorative and coverage-absence feed the existing non-conforming list; header prints raw lines and unique rows after collapsing duplicates; DUP and STALE sections; verified / named-unverified / fixed-no-named-check counts and id lists.
- Tests 25, 25b, 25c, 26, 26b-26e, 27, 27b, 28, 28b, 28c, 29 appended (39 new assertions) to the .test.sh.

## Metrics for main (Q4), ledger at da2faad, 170 fixed/verified rows after the field-level merge
- fixed->verified (status verified): **4** (ISS-012, ISS-055, ISS-t-032-c0-1, ISS-t-032-rev-1)
- named-unverified (status fixed, regression_check named): **109**
- fixed, no named check (null/missing): **57**
- 4 + 109 + 57 = 170. The conforming figure moved 133 -> 126 because 7 rows are newly reported (6 coverage-absence + 1 decorative). Conforming 126/170 (74.1%) under the new rules (133/170 under the old script). 44 FAIL rows, of which 6 are new coverage-absence (ISS-t-013-rev-3, ISS-t-013-rev-6, ISS-t-013-c2-rev-1, ISS-t-013-c2-rev-2, ISS-t-013-c2-rev-3, ISS-t-017-c1-1) and 1 is new decorative (ISS-t-013-rev-1). 15 conforming direct-tsx rows are coverage-unassessable. Duplicate copies on main: 0 (the ISS-100 dedupe already landed); STALE copies: 0.

## Tests (TDD, red first)
Red run before any implementation, on the new test file: `bash scripts/vc-regression-check-conformance.test.sh` -> 62 pass, 29 fail (27 new-feature assertions red, plus 2 environmental failures in Test 22 because the fresh worktree had no node_modules; the same untouched test file passes 52/0 in D:/vc, run as the baseline).
After the change, with node_modules junctioned from D:/vc into the worktree (git-ignored): 91 pass, 0 fail.

Tests[Q1]: scripts/vc-regression-check-conformance.test.sh Tests 25, 25b, 25c — decorative via title, via targets, resolved finding is not reported
Pre-check[Q1]: 2237880 `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 900 bash scripts/vc-regression-check-conformance.test.sh` -> exit 0, "Summary: 91 passed, 0 failed" (includes all Q1 assertions green)
Tests[Q2]: Tests 26, 26b, 26c, 26d, 26e — coverage-absence by symbol, covered negative, quoted-phrase+number, unassessable, explicit cited_symbols; Tests 27, 27b: zero-byte and comments-only test file never pass
Pre-check[Q2]: 2237880 same command as Pre-check[Q1] -> exit 0, "Summary: 91 passed, 0 failed" (includes all Q2 assertions green)
Tests[Q3]: Tests 28, 28b, 28c — 3 identical rows counted once and reported once, no-dup fixture, stale re-landing copy
Pre-check[Q3]: 2237880 same command as Pre-check[Q1] -> exit 0, "Summary: 91 passed, 0 failed" (includes all Q3 assertions green)
Tests[Q4]: Test 29 — 2 verified, 3 named-unverified, 1 fixed with null check; counts and id lists separate
Pre-check[Q4]: 2237880 same command as Pre-check[Q1] -> exit 0, "Summary: 91 passed, 0 failed"

Real-ledger run: `python -I scripts/vc-regression-check-conformance.py --repo-root D:/vc/.worktrees/w1-conformance` prints the 4 / 109 / 57 split above and 44 non-conforming rows (exit 1 expected on the real ledger).

Typecheck: no TypeScript package touched (python and bash only), so no `tsc --noEmit` applies.

## Falsification (one per criterion, in COPIES under the scratchpad, never the worktree)
Copies in `C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/build-w1-conformance/fals-<k>/scripts/`, each the 2237880 script with one behaviour disabled, then the full new test file run against it.
- Q1: `if status == "conforms" and rid in decorative:` -> `if False and ...` -> Tests 25 and 25b go red (5 assertions: exit 1, names the row, decorative reason).
- Q2 coverage: `if cov == "absent":` -> `if False and ...` -> Tests 26, 26c, 26e go red (7 assertions). Q2 empty file: `if self._is_empty_test_file(rel):` -> `if False:` -> Tests 27 and 27b go red ("empty test file" reason absent; the file then hits the weaker "no real test()" message).
- Q3: duplicate detection condition replaced by a never-true condition -> Tests 28 and 28c go red (header count, DUP line, once-only, STALE line, hazard text: 5 assertions).
- Q4: the `fixed->verified (status verified)` print line removed -> Test 29 goes red on that count. (Only the one line was removed, so the other Test 29 assertions stay green by design.)
- Results file: scratchpad `build-w1-conformance/fals-results.log`. Each falsified copy fails only the intended tests plus the unrelated Test 22 fixture message (the copy has no apps/web), which is not counted.

## Open risks
- Coverage-absence is a heuristic on text, not a coverage tool. False positive possible when a test exercises a defect through different names than the row text; false negative when a test mentions a cited word without testing it. The 6 new real-ledger hits are worth a human look: the five ISS-t-013 rows are the same file the checker named in ISS-099.
- Decorative detection relies on an OPEN finding row (ISS-093 is open on main today, so ISS-t-013-rev-1 is reported). When ISS-093 is closed the report clears without any script change.
- Independent senior-software-engineer review was not run by the maker: the Agent hook required a compact-handoff bundle I could not generate for this nested call. The checker's fresh review covers it.
- node_modules junctions in the worktree (root, apps/web, apps/api, packages/engine, packages/db, packages/schemas) are untracked and git-ignored; remove with `rmdir`, not `rm -r`, before deleting the worktree.

Metrics: start=2026-10-25T06:53:52+05:30 end=2026-10-25T07:16:56+05:30 wall_min=31 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=5 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=0 mutants=5 defects_unit=0 defects_6c=0
Fix cycle: 0
**Status:** ready-for-check
