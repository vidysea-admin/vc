# /maker build subagent — U12 repair, fix cycle 1 (test/trace only, no product change)

Worktree: D:/vc/.worktrees/p1-u12 (branch p1/u12, head has checker verdict 8b3f52f = FAIL). Read qa/verdicts/p1-u12-acceptance.md first.

## The one failure
apps/api/tests/acceptance-student-journey.test.ts:79 expects 35 crisis flags for 35 crisis turns. Product (apps/api/src/chat.ts:581-582, p1-u8r M2, already on main) now writes ONE crisis flag per student+thread+window by design (flood dedup). Fix the TEST, not product:
- Assert flags.length === 1 for the 35 same-thread turns in one window (the dedup behaviour, A11b), AND keep the existing assertions that all 35 turns return 200 with the 14416 helpline text and the model is never called.
- Optional if cheap: one extra thread → one more flag (proves per-thread keying). Do not over-build.
- Do NOT edit any file under apps/*/src or packages/*/src. No product diff vs origin/main may appear.

## Trace updates (qa/evidence/p1-u12/trace.md)
- A16, A17: PENDING-INTEGRATION → PASS, citing the checker's engine run (131 pass, verdict 8b3f52f).
- A11b, A23 rows: cite the repaired journey test 2 with the 1-flag-per-window expectation.
- Fix the low wording items ISS-238/239/240 in the trace text only if it is a one-line edit each; otherwise leave them.

## Verify (only via the test lock, TMP/TEMP on D:)
`VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test tests/acceptance-*.test.ts` → must be 7 pass 0 fail. Long lock waits are normal; wait, do not quit.
Falsification (1, in a copy under D:/vc/.worktrees/_u12r_fals, never the bound tree): change the expected flag count to 35 or break the dedup → red; restore. Record it.
`git -C D:/vc/.worktrees/p1-u12 diff origin/main --stat -- apps packages` must list only the two acceptance test files.

## Manifest
qa/manifests/p1-u12-acceptance.md: `Fix cycle: 1`, add `Pre-check[A11b]:` and `Pre-check[A23]:` lines (sha, command, 7/0), `Status: ready-for-check`. Commit with narrow pathspecs (never git add -A). Do not push, do not merge. Report the commit sha, the test output line and the diff stat.
