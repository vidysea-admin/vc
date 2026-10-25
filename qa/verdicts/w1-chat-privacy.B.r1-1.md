# Verdict: w1-chat-privacy (coordinator B of a DUAL check), repair re-check
**Cycle checked: 1**
**Checker:** /checker coordinator B (Mode A), blind to coordinator A
**Unit:** worktree D:/vc/.worktrees/w1-chat-privacy, branch wave/w1-chat-privacy, head 8835203 (code 4135e1c), Fix cycle 1, repair base 8c6657e
**Checked at:** 2026-10-25T07:45:06+05:30
**Policy-Version:** proportional-verification/2026-10-19.17 (Tier L, dual-trigger security apps/api/src/chat.ts)

VERDICT: PASS

In a dual check this verdict has no side effects: findings are PROPOSED-ISSUE lines; qa/issues.jsonl was not edited.

## Diff judged
8c6657e..4135e1c: chat.ts:727 only code change: the per-student budget key now carries `slotRank` (2 crisis that can escalate, 1 concern that can escalate, 0 textless: unconsented minor or over-long), `sha256("budget\0tenant\0student\0rank")`. No other behaviour touched; the reply and LK10 helpline path is not in the diff.

## Executed (all via vc-testlock, worktree clean at 8835203)
- My hostile suite, scratchpad chk-c1-B/hostile.test.mts: 7 tests, 7 pass (V1-V6, V5b).
- Same suite against a mutated COPY (budget key without slotRank = the cycle-0 behaviour), scratchpad chk-c1-B/copy: V1 and V5b FAIL, V3 shows the starvation (concern turn after a crisis flood: escalation delta 0, totals esc 10 flags 10) while on the real head it is delta 1. So the tests discriminate the defect and the fix removes it.
- `tsx --test` chat-privacy, chat, chat-profile, voice-crisis-turn: 157 tests, 157 pass, 0 fail. `tsc --noEmit` in apps/api: exit 0.

## C1 outcome, by the checker's questions
1. Mixed flood (11 each of concern, over-long crisis, over-long concern, unconsented-minor crisis and concern, ~55 threads) then a real crisis turn: escalations +1, flag row +1, unchanged helpline (V1). Same-thread flood (45 turns on one thread) then crisis on that thread and on a new thread: escalated (V2). Parallel flood of 40 concern/over-long turns then crisis: +1 escalation, +1 flag (V5b).
2. Cross-kind starvation: rank 2 needs `crisisGuard(text).level === crisis` AND consent AND not over-long (chat.ts slotRank), so over-long crisis text and textless turns rank 0 and cannot spend rank-2 slots; a benign text never gets a slot or budget. Reverse direction also holds: 30 crisis turns (10 escalate) leave the concern budget intact (V3: concern after the flood escalates).
3. Bounds: after 30+ turns of each of 3 kinds (V3): escalations 20 (10 crisis + 10 concern), flags 30, chat_turns 40; 30 parallel crisis: capped at 10 (V3 first phase, V5 parallel mix: esc 20, flags 30). So <=3x10 writes per window per student, 2x at a window edge, as the builder claims; 30+ crisis turns still capped at 10 (V4: 12 crisis -> 10).
4. Every turn answered 200 with the helpline when crisis (asserted on every crisis-kind turn, in and over budget, in all tests).
5. Key: tenant and student come from the signed token; thread switching and same-thread alternation after the cap add 0 escalations (V6: stays 10); a different tenant string ("Tenant-A") has its own budget (correct, different identity); no reset at ~9 min, fresh budget after the window (V4).
C2-C4: diff touches nothing they depend on; their tests are in the 157 green.

## Residuals judged against C1 text ("separate, bounded limiter... first crisis turn never blocked... writes capped")
- In-memory per-process budget (N processes -> N x the cap) and fixed-window edge (2x): writes stay bounded, first crisis turn is admitted; PROPOSED-ISSUE (low, hardening), not FAIL. The same in-memory design already governs the p1-u8r slots.
- PROPOSED-ISSUE (low): the budget unit is spent before the graph runs, so a turn that then fails (thrown error, retryable provider failure) consumes a unit without a write. A crisis turn makes no model call (LK4), so I could not drive this from a student; bounded by the same cap.
- PROPOSED-ISSUE (low, inherent): the 11th genuine crisis turn in a window from one student is answered but not flagged/escalated; by design of the cap.
