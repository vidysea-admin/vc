# Verdict (dual check, coordinator A) - w1-chat-privacy, repair check C1
**Cycle checked:** 1
**Unit:** worktree D:/vc/.worktrees/w1-chat-privacy, branch wave/w1-chat-privacy, head 8835203 (code 4135e1c), repair base 8c6657e
**Policy-Version:** proportional-verification/2026-10-19.17 (Tier L, dual-trigger: security apps/api/src/chat.ts)
**Checked:** 2026-10-25T07:45+05:30 (read from `date -Iseconds`)

VERDICT: FAIL (C1)

Dual check: no side effects; findings are PROPOSED-ISSUE lines, qa/issues.jsonl untouched. The cycle-0 verdict is kept as qa/verdicts/w1-chat-privacy.A.r0-1.md. C2-C4 re-checked only as regressions of the diff 8c6657e..4135e1c (chat.ts 3 lines, tests only): none (the diff touches only the budget key, a comment and tests).

## Commands run (all through vc-testlock, long waits normal)
- apps/api `tsx --test tests/chat-privacy.test.ts` (worktree) -> 58 pass, 0 fail (matches manifest).
- Hostile suite, own file (scratchpad chk-c1-A/hostile.test.ts, importing the worktree fixtures; and a copy under chk-c1-A/copy with a junctioned node_modules): 10 tests X1-X10. Unmutated copy: 9 pass, 1 fail (X10 below; X2 only prints the observation).
- Falsification in the COPY (chat.ts restored byte-identical afterwards, `cmp` same): (a) budget key without the kind (cycle-0 behaviour) -> X1, X5, X10 fail (so the instrument sees the cycle-0 defect); (b) key = consent/over-long x level instead of slotRank -> all pass, including X10 (so the gap below is real and a one-line change closes it).

## What held (adult / consenting student)
- X1: 15 rounds of {concern on new thread, over-long concern, over-long crisis, concern on one thread, over-long crisis on one thread} (75 non-crisis writing turns), then a short crisis on a new thread -> 200, helpline 14416, +1 escalation (11 total), +1 flag row of kind crisis. PASS.
- X5: 60 concurrent mixed turns (concern / over-long crisis / over-long concern) over 60 threads, then a crisis -> escalated (+1) and flagged. PASS.
- X3: consenting minor (guardianConsent true), 12 concern turns then crisis -> escalated (10 -> 11). PASS.
- Bound (X4): 40 crisis + 40 concern + 40 over-long crisis turns interleaved in one window: escalations 20, flags 30, chat_turns 40, usage 30, every turn 200 and every crisis-class answer carries the unchanged helpline. Writes per kind capped at 10 (<=30 total), 2x at a window edge as the builder says. PASS.
- X8: 25 crisis turns with a malformed body (unknown key, ISS-350 salvage) over 25 threads: all helpline, escalations capped at 10. PASS. X7: window rollover escalates again (20 -> 21). PASS.
- Starvation by rank: a non-crisis text cannot rank 2 (`slotRank` is `LEVEL_RANK[level]` of the server-side guard scan of the same text, and 0 for over-long or unconsented turns), and over-long crisis text spends only the kind-0 budget. The budget key carries tenant + student + kind and not the thread, so a thread switch does not reset it; another tenant or student id is a separate identity (separate token).

## C1 - FAIL: a concern flood still silences an unconsented minor's crisis turn
Repro (X10 / X2, chat.ts:727 `takeCrisisBudget(... ${slotRank})`): an UNCONSENTED minor (`minor()` with no guardianConsent) sends 12 concern turns, each on its own thread, then "I want to kill myself" on a new thread. The crisis turn is answered with the helpline (200, state escalated) but writes NO flag row: flag rows 10 before and 10 after, and no row carries the crisis turn's turnId. Control (X9): the same crisis turn with no flood is flagged. Cause: for an unconsented minor every turn has `slotRank` 0 (chat.ts:~712 `consentOk && !overlong ? LEVEL_RANK[level] : 0`), so concern-level and crisis-level turns share the one kind-0 budget; the fix groups "textless" turns by who cannot escalate, not by severity. (Over-long crisis flood then a short crisis, both crisis level, share a budget and stay capped: acceptable; the defect is the concern/crisis mix inside kind 0.)
Why it fails C1 here: the brief for this check names "unconsented-minor" turns in the mix and requires the crisis turn to be flagged. For this student the flag row is the only record of the crisis (the textless variant has no escalate port), the student is the most protected population, and before this unit (no budget, or the p1-u8r thread slot) the same crisis turn was flagged. It is the cycle-0 defect (low severity silencing high severity) left in one population. The builder tests use adult students only (`adult()`), so they cannot see it.
Fix, verified in the copy: key the budget by (consentOk && !overlong) and `level` instead of `slotRank`, e.g. `${consentOk && !overlong ? "f" : "t"}${level}` at chat.ts:727; writes stay capped per key (at most 4 keys, 40 per window). Add a test: unconsented minor, 12 concern turns across threads, then a crisis turn -> a flag row with that turnId, helpline unchanged.

## PROPOSED-ISSUE lines (not written to the ledger)
- PROPOSED-ISSUE (high, safety, C1): an unconsented minor's concern flood spends the shared kind-0 budget, so the next crisis turn gets the helpline but no flag row (details above). Test: minor, 12 concern turns on separate threads, then a crisis turn -> flag row with that turnId.
- PROPOSED-ISSUE (medium, safety): a budget unit is spent before the writes succeed and is never refunded. X6: the escalate port throws on the first 10 crisis turns (outage; each turn still 200 + helpline), then the port recovers: the 11th crisis turn is quiet (no escalation attempt, no flag row; attempts stay 10). An outage of 10 crisis turns therefore blocks escalation for the rest of the 10 minute window after recovery. Refund the unit when the holder releases its slot (releaseCrisisSlot) or only count units for confirmed writes. Same on cycle 0; not part of the failed criterion text, so not a FAIL by itself.
- PROPOSED-ISSUE (low): builder residuals judged. In-memory per-process budget (restart or second process resets it) and the fixed window edge (up to 2x the cap, 60 writes at an edge): acceptable against C1 ("capped" is met per window; the exact bound is documented in the manifest), no FAIL. After 10 crisis turns the 11th crisis writes nothing; the earlier 10 are on record: acceptable.

Return: `VERDICT FAIL 8835203`
