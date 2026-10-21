# Verdict - golive-b13guard (checker, Mode A, cycle 0)
Cycle checked: 0
Date: 2026-10-21T17:21:00+05:30
Bound to: D:/vc/.worktrees/golive-b13guard (checked state 9e9b749; test change 2646806 blob; base 28dc4ff)
Policy-Version: proportional-verification/2026-10-19.17

## Check plan (step 0)
Diff 28dc4ff..HEAD: apps/api/tests/go-live-gate.test.ts (+1/-1) plus qa files only. Protected test change (assertion made conditional), tier L, single checker. Checks: (1) test file green on HEAD, (2) same file with B13 signed in a throwaway copy, (3) falsification in that copy, (4) diff scope.

VERDICT: FAIL
SCOREBOARD: 0/1 criteria met (C1)
TIER: L (protected test change)

## FAILURES
- C1 FAIL. With B13 changed to `SIGNED 2026-10-21T17:00:00+05:30 by Umesh` (copy), the A20 CLI test is RED, not green. 12 pass, 1 fail, 1 skipped (the real-repo A20 test skips as intended; the CLI test is the failure).
  Failing line: apps/api/tests/go-live-gate.test.ts:316 `assert.equal(refused.status, 1, refused.stderr)` -> `0 !== 1` (I read the line in the copy and the test body at 313-333).
  Cause (reproduced by running the CLI directly, evidence file below): `node --import tsx scripts/go-live-gate.ts student-routes --gates-dir qa/gates` with B13 signed prints `target=student-routes: ALLOWED`, all four records ok (p1-u0-amendment-signatures.md, g-publish.md [Answered 2026-10-21T15:42 option b], g-prod.md [2026-10-21T15:18 option c], nights.md), exit 0. B13 is the only unmet record for student-routes today (it is also what golive-a20's verdict found), so once it is signed the real repo is correctly allowed and the test's premise "the real gates refuse student-routes" is gone, not just the B13-name line.
  The guard added at :318 covers only the `includes(GATE_FILES.b13)` assertion. Three more assertions on the real qa/gates stay unguarded and depend on the refusal: :316 exit 1 (fails first), :317 /REFUSED/, and :320-321 `voice` exit 1 plus a10 named (voice still refuses on a10-voice-gate.md, so that part would hold), plus :331 `run([])` exit 1 "default target is student-routes against the real qa/gates" (would also go red; not reached because :316 aborts the test).
  Net: the unit does not achieve its purpose. Signing B13 still turns the next 6c red through this same test, just on :316 instead of :318 (ISS-golive-a20-1 not fixed).

## Criterion evidence (I ran every command; builder output not trusted)
- Step 1, HEAD content (`git archive HEAD` extracted to a throwaway dir outside the worktree, node_modules junctioned to D:/vc): `node --import tsx --test tests/go-live-gate.test.ts` in apps/api -> tests 14, pass 14, fail 0, skipped 0, exit 0 (17:18:31). Matches the maker's pre-check. B13 PENDING there, so the guard is true and nothing is skipped.
- Step 2, same copy, line 13 of qa/gates/p1-u0-amendment-signatures.md changed from `B13-signed: PENDING` to the SIGNED line (diff showed exactly that one line): tests 14, pass 12, fail 1, skipped 1. Output: qa/evidence/b13guard/signed-copy-with-guard.txt. The brief expected "green"; it is RED.
- Step 3, falsification (remove `if (REAL_B13_PENDING) ` from :318 in the signed copy; green-before/red-after/restored): the "green before" state does not exist, the test is already red with the guard, so the falsification cannot discriminate. Removing the guard gives the identical failure (12 pass, 1 fail, 1 skipped, same :316 AssertionError). Restored byte-identical (diff against the saved original empty); restoring does not make it green, it was never green when signed.
- Step 4, scope: `git diff 28dc4ff..HEAD --name-only` = apps/api/tests/go-live-gate.test.ts, qa/evidence/p1-briefs/chk-golive-b13guard.md, qa/manifests/golive-b13guard.md. The only test hunk is the :318 line; the unguarded refusal assertions are unchanged (no weakening beyond the B13 line). This part of the brief holds.

## CAPABILITY-COVERAGE: 0/1 (C1 falsification not reachable, see Step 3; floor not met because the criterion itself fails)
LIVE-BROWSER: not-applicable (test file only)
ISSUES-WRITTEN: none (worktree-bound checker does not write qa/issues.jsonl)
PROPOSED-ISSUE: {"severity":"medium","type":"test-premise","title":"A20 CLI test still red once B13 is signed: asserts exit 1 / REFUSED against real qa/gates, which then ALLOW student-routes","where":"apps/api/tests/go-live-gate.test.ts:316-317,331","repro":"signed copy, node --import tsx --test tests/go-live-gate.test.ts -> :316 0 !== 1","fixing":"golive-b13guard"}
Repair hint (not a mandate): guard the whole real-gates refusal block (:315-321 and the :331 default-target assertion) on REAL_B13_PENDING and keep the fixture-based ALLOWED/REFUSED/usage (exit 2) assertions unconditional; keep the voice-refuses-on-a10 assertion only if it is run in a way that does not depend on B13. Then re-prove the signed-copy run is green.
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)

Evidence files: qa/evidence/b13guard/signed-copy-with-guard.txt, qa/evidence/b13guard/cli-signed-gates.txt
Metrics: start=2026-10-21T17:17:46+05:30 end=2026-10-21T17:21:00+05:30 wall_min=3 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=1 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=190 mutants=0 defects_unit=1 defects_6c=0
