# Verdict - golive-b13guard (checker, Mode A, cycle 1, repair)
Cycle checked: 1
Date: 2026-10-21T17:24:19+05:30
Bound to: D:/vc/.worktrees/golive-b13guard (branch of base 28dc4ff; checked state aeb90f2 = test b9963fa + manifest/brief commits; repair base cacfca0, verified against git log)
Policy-Version: proportional-verification/2026-10-19.17

## Check plan (step 0)
Repair checker, scope = failed criterion C1 plus the repair diff cacfca0..HEAD (one test file, +9/-6 of which the c1 hunk is the guard). Tier L (protected test change; an assertion made conditional). No full suite. Throwaway copies are git archive of HEAD outside the tree, node_modules junctioned to D:/vc; qa/gates of the real tree was never edited.

VERDICT: PASS
SCOREBOARD: 1/1 criteria met (C1)
TIER: L (protected test change)
FAILURES: none

## Criterion evidence (I ran every command; builder output not trusted)
- C1 / (1) HEAD, B13 PENDING (copy c1A, line 13 of qa/gates/p1-u0-amendment-signatures.md = `B13-signed: PENDING`): `node --import tsx --test tests/go-live-gate.test.ts` in apps/api -> tests 14, pass 14, fail 0, skipped 0. The CLI test ran its guarded block (real-gate student-routes exit 1, REFUSED, b13 and g-publish named).
- C1 / (2) Same archive, B13 line set to `B13-signed: SIGNED 2026-10-21T17:00:00+05:30 by Umesh` (copy c1B): tests 14, pass 13, fail 0, skipped 1 (the real-repo A20 test, skip: !REAL_B13_PENDING, as intended). The A20 CLI test passed; the voice real-gate refusal (exit 1, A10 named), fixture ALLOWED (exit 0), usage exit 2 all ran.
- C1 / (3) Falsification (copy c1C = c1B with only the `if (REAL_B13_PENDING) {` line at test.ts:316 replaced by `{`, body kept; sed also stripped the CRLF, checked: the only semantic diff vs c1B is that line): tests 14, pass 12, fail 1, skipped 1. The failing test is the A20 CLI test, at test.ts:318 `assert.equal(refused.status, 1, refused.stderr)`, actual 0, expected 1. Green before (c1B), red after (c1C), restored (c1B unchanged). Not an import or setup failure.
- C1 / (4) Repair diff cacfca0..HEAD read in full (git diff, apps/api/tests only the one file): the only product-test hunks are (a) the real-gate student-routes block (run, status 1, REFUSED, b13 named, g-publish named) wrapped in if (REAL_B13_PENDING), and (b) the default-target `run([])` exit-1 assertion made conditional on REAL_B13_PENDING. The b13-named assertion was already conditional in c0 and is now inside the block. Unconditional and unchanged: voice real-gate exit 1 plus A10 named (:323-325), fixture ALLOWED exit 0 plus /ALLOWED/ (:329-330), usage exit 2 for "nonsense" (:334). No other assertion in the file was weakened. Whole-unit scope scan 28dc4ff..HEAD excluding qa/: this one file only.
- Not shielded by c1: with B13 PENDING (the real state today) every guarded assertion still runs (see 1), so the pin on the legal-owned PENDING state is intact.

## Notes
- Non-blocking observation: under B13 signed but g-publish unanswered, the real-gate student-routes result is the human's call and the test now asserts nothing about it; consistent with the file's own comment at :60-64. Not a finding.
- No new ledger rows; ISS-golive-a20-1 fix is evidenced by C1 (the maker flips status per its own close-out).

Metrics: start=2026-10-21T17:21:50+05:30 end=2026-10-21T17:24:19+05:30 wall_min=3 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=1 cycle=1 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=190 mutants=0 defects_unit=0 defects_6c=0
