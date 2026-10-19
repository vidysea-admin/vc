# Task runner (NAME = `runner`)
Your scratch copy `D:/vc/.worktrees/p1-u10w-chkB-s1` ALREADY EXISTS and is installed at 0c2b981 (use it instead of creating one; do not mutate it - it is your clean-run tree).
Task: independently execute and report counts for the unit's test sets, each ONCE, sequentially, via the test lock, on that clean copy. Save each full tap log in your evidence dir:
1. api voice+chat set: `... pnpm -C D:/vc/.worktrees/p1-u10w-chkB-s1/apps/api exec tsx --test --test-reporter=tap tests/voice.test.ts tests/voice-audit.test.ts tests/voice-history.test.ts tests/voice-limits.test.ts tests/voice-wiring.test.ts tests/voice-crisis-turn.test.ts tests/chat.test.ts` (maker claims 132 pass / 0 fail).
2. full api: `... exec tsx --test --test-reporter=tap tests/*.test.ts` in apps/api (claims 292/0).
3. packages/db: tests/chat-threads.test.ts tests/erasure.test.ts tests/erasure-approver.test.ts (claims 101/0).
4. packages/providers: tests/live.test.ts (claims 70/0).
5. `pnpm -C D:/vc/.worktrees/p1-u10w-chkB-s1 -r typecheck` through the lock (claims exit 0).
6. Collection check: list how many test files exist under apps/api/tests and confirm that every `tests/*.test.ts` file appears in the run of item 2 (compare file names; report any file that did not run).
7. Repeat item 1 a second time to see whether any test is flaky; report differing results.
Report the exact `# tests / # pass / # fail / # cancelled / # skipped` lines for each. If any test fails, report the test name, the assertion text and whether it also fails on a second run of just that file.
