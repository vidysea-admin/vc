# Verdict: w1-chat-privacy (coordinator B of a DUAL check), repair re-check
**Cycle checked: 2**
**Checker:** /checker coordinator B (Mode A), blind to coordinator A
**Unit:** worktree D:/vc/.worktrees/w1-chat-privacy, branch wave/w1-chat-privacy, head 2b479b4 (code a835593), Fix cycle 2 (LAST), repair base 8835203
**Checked at:** 2026-10-25T07:55:55+05:30
**Policy-Version:** proportional-verification/2026-10-19.17 (Tier L, dual-trigger security apps/api/src/chat.ts)

VERDICT: PASS

In a dual check this verdict has no side effects: findings are PROPOSED-ISSUE lines; qa/issues.jsonl was not edited.

## Diff judged
8835203..a835593: chat.ts:728 only code change. Budget key is now `budget\0tenant\0student\0(textless|full)\0level` (textless when slotRank is 0: unconsented minor or over-long), was `...\0slotRank`. Plus 5 tests in chat-privacy.test.ts. Reply/LK10 helpline path untouched.

## Executed (all via vc-testlock; worktree clean)
- My hostile suite (scratchpad chk-c2-B/hostile.test.mts), 16 tests, 16 pass on the real head, across adult / consenting minor / unconsented minor.
- Same suite on a mutated COPY (key reverted to slotRank, the cycle-1 code): 3 FAIL (H1, H2, H5 for the unconsented minor: crisis turn after a concern flood gets no flag row), 13 pass. So the suite discriminates the cycle-1 defect and the head removes it.
- tsx --test chat-privacy, chat, chat-profile, voice-crisis-turn, anonymous-route, anonymous-zero-persistence: 235 tests, 235 pass, 0 fail (incl. the 5 "w1 C1 fix2" tests). tsc --noEmit in apps/api: exit 0.

## C1 outcome, by the brief's questions
1. Flood of 12+ concern and 12+ over-long concern turns on separate threads (H1), 25+25 on one thread (H2), 48 parallel (H5), then a crisis turn: adult and consenting minor get +1 escalation, +1 flag row, helpline; unconsented minor gets its own +1 flag row (no escalate port, 0 chat_turns text stored), helpline unchanged. Same thread and new thread both flagged.
2. No cross-kind starvation: a crisis flood of 30 short + 30 over-long then a concern and an over-long concern turn: each still flagged (flag delta 2; escalation delta 1 where a port exists) for all three kinds (H3). No non-crisis turn can land in a crisis-level key since level is in the key.
3. Bounds in ONE window (H8, 100 turns of 4 kinds in <10 min): adult and consenting minor flags 40, escalations 20; unconsented minor flags 20, escalations 0. Crisis-only flood of an unconsented minor: 40 turns -> exactly 10 flags, 0 stored text (H4).
4. Every crisis-kind turn asserted 200 + state escalated + 14416 helpline, in and over budget.
5. Thread switching and same-thread alternation after the cap add 0 (H6); window: no reset at ~9 min, fresh budget after 10 min; an upper-case studentId in the path is 404 (token-bound), no budget reset (H7).
C2-C4: the diff touches nothing they depend on; their tests are in the 235 green.

## Residuals judged against C1 text
- NOTE (design, not a defect): for an unconsented minor, short and over-long crisis turns both use the textless+crisis key, and concern and over-long concern share textless+concern, so within one window 10 over-long crisis turns use up the budget a later short crisis turn would need. Both are crisis-level turns of the same kind (no text stored, flag row only); this is the same "11th crisis turn unflagged by cap design" residual, not non-crisis starvation. PROPOSED-ISSUE (low, inherent).
- PROPOSED-ISSUE (low): budget unit is spent before writes succeed (no refund on a failed write). Bounded by the cap.
- PROPOSED-ISSUE (low, hardening): in-memory per-process budget (N processes -> N x cap) and fixed-window edge (2x at the edge). Writes stay bounded, first crisis turn admitted.
- PROPOSED-ISSUE (low, inherent): 11th genuine crisis turn per kind per window is answered with the helpline but not flagged, by cap design.
None of these fails C1 ("separate, bounded limiter; first crisis turn never blocked; writes capped").
