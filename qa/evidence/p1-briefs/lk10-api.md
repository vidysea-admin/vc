# LK10 follow-up before check (same branch p1/lk10, worktree D:/vc/.worktrees/lk10)
A unit with a known red downstream test is not ready-for-check. Fix the apps/api knock-on in this branch:
- apps/api/tests/anonymous-zero-persistence.test.ts:406 and :611 - expect the language-aware crisis message (use crisisMessageFor / the hi-Latn catalog entry for the Hinglish case), never a weaker assertion (still exact-string equality). No other apps/api file (LK7/LK9 own src and other tests).
- Run the FULL apps/api suite + apps/api typecheck on the final sha and record Pre-check lines; keep Merge-hold line. Tests via `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 600 <cmd>` (long lock waits normal), TMP/TEMP on D:.
- Commit on p1/lk10, keep Status ready-for-check. Never push/merge, never touch .claude/**, never kill processes. Report sha + counts.
