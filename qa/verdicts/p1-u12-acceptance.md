# Verdict: p1-u12-acceptance
**Verdict:** FAIL
**Cycle checked:** 0
**Tier:** M (tests + evidence only, no product file differs from origin/main 626214d). One checker. Policy: proportional-verification/2026-10-18.15
**Base:** origin/main 626214d **Head checked:** e60e914
Metrics: start=2026-10-19T10:13:47+05:30 end=2026-10-19T10:21:17+05:30 wall_min=9 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=2 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-18.15 lane=normal check_s=540 mutants=0 defects_unit=1 defects_6c=0
slow: isolated copy setup (junction layout; the first copy returned 500 until skills/ and the root files were linked) 3 min

## Plan
Diff scope vs origin/main; trace spot-check (A5, A7, A16/A17, A20, A22, A23, A24, plus the 3 journey tests read in full); re-run A16/A17 tests on the merged head; run acceptance-*.test.ts once; one falsification per new test file in a copy; typecheck.

## FAILing criterion
**Journey test 2 (hostile "35 crisis messages"; cited by trace rows A11b and A23) is RED on the merged head.**
- Command: `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test tests/acceptance-*.test.ts` -> tests 7, pass 6, fail 1, EXIT=1 (qa/evidence/p1-u12/check/acc-run.txt).
- Failure: `acceptance-student-journey.test.ts:79` `assert.equal(flags.length, 35)` -> `1 !== 35`. All 35 turns returned 200 / escalated / 14416 and the model was never called (lines 68-78 passed); only the "each write one text-free flag" half is wrong.
- Cause (read in this check): `apps/api/src/chat.ts:581-582` "p1-u8r M2: one stored, flagged, escalated crisis turn per student and thread per window; the rest are answered and write nothing". U8r arrived through the merge (18aa0d2); the builder's runs were at d1e511e, before it. The test pins the old per-turn flag behaviour, so the manifest's "300 pass" and the PASS claims for A11b and A23 do not hold on the head under check.
- Repair (maker): change the expectation to the U8r contract (1 flag row for the window, still 35 x 200 and 0 model calls), or spread the 35 turns across threads; re-run and refresh the run table. No product change needed.

## Evidence that passed (head e60e914, all through vc-testlock.sh, no full suite)
- Diff scope: `git diff --name-only origin/main HEAD | grep -v ^qa/` = apps/api/tests/acceptance-student-journey.test.ts and acceptance-trace.test.ts only; `git diff --stat 626214d HEAD -- apps packages mcp scripts` = those 2 files, 193 insertions. chat.ts and every product file are identical to origin/main (the in-place falsification was restored). `git status` clean.
- Trace test 4 of 4 pass; journey tests 1 and 3 pass.
- A16/A17 on the merged head: `pnpm -C packages/engine exec tsx --test tests/rank.test.ts evals/coverage.test.ts tests/source-kind.test.ts evals/budget.test.ts evals/p1-runners.test.ts tests/crisis-defaults.test.ts` -> tests 131, pass 131, fail 0, EXIT=0 (engine-spot.txt). The `coverage` script exists at packages/engine/package.json:23. A16 and A17 count as PASS; the maker moves both trace rows from PENDING-INTEGRATION to PASS citing rank.test.ts and evals/coverage.test.ts (wording, low).
- API sample: `pnpm -C apps/api exec tsx --test tests/go-live-gate.test.ts tests/chat.test.ts tests/voice-limits.test.ts tests/chat-profile.test.ts tests/chat-privacy.test.ts` -> tests 93, pass 93, fail 0, EXIT=0 (api-spot.txt).
- `pnpm -r typecheck` EXIT=0 (typecheck.txt).
- Trace spot check, 10 rows read against their tests, all genuinely assert the criterion: A5 (real response parsed by TurnResponseSchema), A7 (read-back zero in 5 student collections plus API 404), A16/A17 (rank and coverage tests green), A20 (go-live-gate.test.ts, real qa/gates refusal at :61), A22 (source-kind.test.ts, 8-word drop at :45), A23 (chat.test.ts:357 31st request 429 plus Retry-After; voice-limits.test.ts :27 60 min, :58 20 min, :112 tenant override), A24 (budget.test.ts :36-:38 caps, :74 boundary, :81 month cap; p1-runners.test.ts :71, :97). A2a "NOT PROVEN" is the accepted close per D-097 item 2, not a FAIL.

## Falsification floor (isolated copy D:/vc/.worktrees/_chk_u12_fals, junctioned to the checked tree; the bound tree was never edited)
| id | edit | before | after |
|---|---|---|---|
| F-journey | copy chat.ts:605 `redact` returns its input unchanged | A5/A6/A7 green | A5/A6/A7 RED (raw name/email stored) |
| F-trace | copy trace.md: row A24 deleted | 4/4 trace tests green | "trace covers every criterion" RED |
The crisis test could not be falsified (red before any edit). Output: qa/evidence/p1-u12/check/fals-copy.txt.

## Findings (ledger rows in qa/issues.jsonl)
- ISS-237 medium: the FAIL above. ISS-238 low: P12-1 A5 draft-vs-served openapi wording. ISS-239 low: P12-3 A7 gap-count wording. ISS-240 low: spec file names for A13/A23/A24 and the A16/A17 row text.
- Environment: C: nearly full per brief; no OOM seen.

---

# Cycle 1 (repair check, fix cycle 1)
**Verdict:** PASS
**Cycle checked:** 1
**Head checked:** c86ad3a (repair b67423a). Cycle-0 verdict 8b3f52f FAIL. Tier M, one checker, Policy: proportional-verification/2026-10-18.15
Metrics: start=2026-10-19T10:24:30+05:30 end=2026-10-19T10:27:17+05:30 wall_min=4 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=2 cycle=1 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-18.15 lane=normal check_s=240 mutants=0 defects_unit=0 defects_6c=0

## Checks (all executed in this check)
- Diff scope: `git -C D:/vc/.worktrees/p1-u12 diff 626214d --stat -- apps packages mcp scripts` lists only apps/api/tests/acceptance-student-journey.test.ts (115 +) and apps/api/tests/acceptance-trace.test.ts (86 +), 201 insertions, no product file. Repair diff 8b3f52f..b67423a on the journey test is 12 lines: the flag expectation 35 -> 1 plus a second-thread block.
- Product intent: apps/api/src/chat.ts:581-586 (p1-u8r M2) keys the crisis slot on sha256(tenant, student, thread) and later turns in the window are `quiet` (answered, nothing written); chat.ts:582 key includes threadId. The repaired test (1 flag after 35 same-thread turns, 35 x 200 with 14416, model never called, then 2 flags after a turn in a second thread) matches that contract.
- Run: `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test tests/acceptance-*.test.ts` -> tests 7, pass 7, fail 0, EXIT=0 (qa/evidence/p1-u12/check/acc-run-c1.txt). Run by this checker on c86ad3a, not reused from the maker (the maker's run was on b67423a; the only commit after it, c86ad3a, is qa-only).
- Trace: rows A16 and A17 are PASS and cite rank.test.ts / evals/coverage.test.ts (checker cycle-0 engine run, 131/131, 8b3f52f); A11b and A23 are PASS and cite the repaired acceptance-student-journey.test.ts (qa/evidence/p1-u12/trace.md). The 4 trace tests are in the 7/7 above.

## Falsification (isolated copy D:/vc/.worktrees/_chk_u12_fals, src and tests re-synced from c86ad3a; bound tree never edited; chat.ts restored byte-identical, `diff -q` clean; output qa/evidence/p1-u12/check/fals-c1-checker.txt)
| id | edit in copy | before | after |
|---|---|---|---|
| F1 | chat.ts:596 `const quiet = false` (dedup broken) | 3/3 | journey test 2 RED, `35 !== 1` |
| F2 | chat.ts:582 slot key drops `threadId` (per-thread dedup broken) | 3/3 | journey test 2 RED, `1 !== 2` (the second-thread half) |
Both halves of the repaired test are therefore live. (A first F2 attempt by sed did not match the line, ran 3/3 green and was discarded as a no-op, not a survivor; the node-script edit above is the one that counts.)

## Findings
- ISS-237: fixed (this verdict). ISS-238, ISS-239, ISS-240 stay open as low wording rows; they are not a FAIL.
- Environment: no OOM, shared test lock acquired at once (slot 0).
