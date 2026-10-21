# Verdict - golive-a20 (checker, Mode A, cycle 0)
Cycle checked: 0
Date: 2026-10-21T16:34:42+05:30
Bound to: D:/vc/.worktrees/golive-a20 (branch wave/golive-a20, checked state bba387d = test 15e55ec + manifest; base fac81b6)
Policy-Version: proportional-verification/2026-10-19.17

## Check plan (step 0)
Diff: apps/api/tests/go-live-gate.test.ts only (+8/-3). Protected change (assertion weakened, skip added), tier L. Checks: read qa/gates and run evaluateGoLive on them, prove the skip regex on the current line and on a SIGNED line, run the test file, one falsification in a copy outside the worktree.

VERDICT: PASS
SCOREBOARD: 1/1 criteria met (C1)
TIER: L (protected test change)
FAILURES: none

## Criterion evidence (I ran every command; builder output not trusted)
- Real gate state (evaluateGoLive on D:/vc/.worktrees/golive-a20/qa/gates, approver Umesh, now 2026-11-01): student-routes, anonymous and publish each fail on exactly one record, p1-u0-amendment-signatures.md (B13-signed "found PENDING"); g-publish.md (Answered 2026-10-21T15:42 option b), g-prod.md (2026-10-21T15:18 option c) and nights.md (tele-manas-disclosed) are satisfied. voice fails on B13 AND a10-voice-gate.md (Result: FAIL), so B13 is the only unmet record for three targets, not for voice (A10 is a separate, real gap the old test also covered).
- Live repo still refuses while B13 is PENDING: the new test runs (not skipped) and asserts, for every target, allowed === false, a failure containing "B13-signed", and assertGoLive throws GoLiveRefusedError. It is strictly narrower than the old ">=2 failures" but stronger on the invariant that matters (it names B13, so a refusal for any other reason cannot satisfy it).
- Skip condition: regex /^`?B13-signed:\s*PENDING`?\s*$/m matches the real line 13 (`B13-signed: PENDING`), also with CRLF line endings; replacing that line with `B13-signed: SIGNED 2026-10-21T10:00:00+05:30 by Umesh` (in the copy) makes the test SKIP visibly (node:test "# SKIP", skipped=1, other 12 fixture tests green). The regex is stricter than the evaluator, so a malformed or oddly spelled PENDING line would skip rather than run (visible in the skip count, still refused by the evaluator; see L2). A fenced or duplicate B13 line makes the test run and fail loud, never skip.
- Fixture coverage of multi-failure: "today's U0 files" (Nights the only satisfied record), "B13, g-publish and Nights are each required by every target; g-prod by the three student targets", "hostile", "B13 signer" and "directory/missing dir" tests are unchanged and assert the evaluator's per-record failures; all 4 of them (plus the real-repo test, the CLI test and the directory test) went red under the falsification below.
- Test run: `pnpm exec tsx --test tests/go-live-gate.test.ts` in apps/api of the worktree -> tests 14, pass 14, fail 0, skipped 0 (run twice, 16:33 and 16:34; no lock holder at that time).

## CAPABILITY-COVERAGE: 1/1 criteria falsified in a copy outside the worktree (floor met)
F-C1: in a copy under the scratchpad (src, tests, scripts, qa/gates copied, node_modules junctioned), evaluateGoLive changed to treat the B13 record as satisfied (`problem === null || file === GATE_FILES.b13`). Green before (14/14), red after: 7 of 14 fail, including "A20: the real repo qa/gates refuses every target while B13 is not signed". Restored (src recopied from the worktree) and SIGNED probe run afterwards. Worktree stayed clean (git status empty).
LIVE-BROWSER: not-applicable (test file only)
ISSUES-WRITTEN: none (a worktree-bound checker does not touch qa/issues.jsonl; the maker files the low rows below)
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)

## Low observations (non-blocking, not FAILs)
- L1 The "A20 CLI" test (go-live-gate.test.ts:313-333) also runs against the real qa/gates and asserts exit 1 for student-routes. When the legal team signs B13 (D-103) it goes red (verified in the copy: SIGNED flip -> 13 pass, 1 fail, 1 skipped = the CLI test), so the next 6c will be red for the same stale-premise reason unless that test gets the same B13-pending guard. It fails loud, not silent, and is outside this unit's criterion.
- L2 The skip regex accepts only the exact PENDING spelling; a differently worded non-SIGNED value (for example "PENDING legal") skips instead of running. The evaluator still refuses, and the skip shows in the count, so no silent pass.
- L3 Line 319 of the CLI test (`stdout.includes(GATE_FILES.gPublish)`) is now satisfied by the "ok g-publish.md" line, not by a MISSING line; it is vacuous since g-publish was answered.

EXPLANATION: The old assertion (>=2 failures) rested on g-publish being unanswered, which stopped being true on 2026-10-21. The replacement pins the one invariant that matters (live repo refuses every target and names B13 while B13 is PENDING), its skip condition provably matches today's line and flips on a SIGNED line, the fixture tests still cover multi-failure behaviour, and a mutant that drops the B13 failure turns the real-repo test red.
Metrics: start=2026-10-21T16:32:00+05:30 end=2026-10-21T16:34:42+05:30 wall_min=3 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=1 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=180 mutants=0 defects_unit=0 defects_6c=0
