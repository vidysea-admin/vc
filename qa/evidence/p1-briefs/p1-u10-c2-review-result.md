# Senior review result: U10 voice WebSocket cycle 2 (f71f387..9067502), 2026-10-19

VERDICT: Warning. No critical or high findings. The cycle-1 Warning items are fixed: PROBE1 and PROBE2 pass on 9067502. The 4 apps/api voice files pass 88/88, apps/api typecheck is OK, and the test diff is additions only.

- Medium F1 (crisis safety), voice.ts:752 and 781-784 (endIfFenced :665-666): a FencedWriterDeadlineError on the crisis flag write is treated as StudentFencedError. The result is no retry, no escalation, a misleading `voice_crisis_escalate_skipped_fenced` log, and the student is ejected with `student_fenced`. PROBE3 (D:/vc/.worktrees/p1-u10-c2-review-probe/c2.probe.test.mts) got 0 escalations. This is not a regression, because cycle 1 skipped this case too. Fix: skip escalation only on StudentFencedError; on a deadline error, retry the flag write and still escalate.
- Low: voice.ts:936-947, writes still running after the drain timeout are not tracked by `voice.close()`. A SIGTERM after the timeout can lose an in-flight escalation.
- Low: voice.ts:1060-1067, a superseded start that is still connecting can briefly overlap the new paid provider session. This existed before cycle 2.
- Open question: is `escalateForTenant` idempotent when delivery succeeds and then throws? The C17 retry could escalate twice.

## Disposition (maker, 2026-10-19)
U10 is at the fix-cycle cap, and voice is not wired (no production exposure). If both blind checkers PASS, U10 merges with these 4 items as ledger rows. F1 and the two lows are fixed in U10w BEFORE voice is wired into startApi, with the PROBE3 test written first. The open question goes to U10w as a criterion. U10w has its own blind check.
