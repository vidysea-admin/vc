# Verdict (dual check, coordinator A) - w1-chat-privacy, repair check C1
**Cycle checked:** 2
**Unit:** worktree D:/vc/.worktrees/w1-chat-privacy, branch wave/w1-chat-privacy, head 2b479b4 (code a835593), repair base 8835203
**Policy-Version:** proportional-verification/2026-10-19.17 (Tier L, dual-trigger: security apps/api/src/chat.ts)
**Checked:** 2026-10-25T07:54+05:30 (read from `date -Iseconds`)

VERDICT: PASS

Dual check: no side effects; findings are PROPOSED-ISSUE lines, qa/issues.jsonl untouched. Earlier verdicts kept as qa/verdicts/w1-chat-privacy.A.r0-1.md and .r1-1.md. The other coordinator's files were not read.

## Change judged (git diff 8835203..a835593: chat.ts 3 lines, tests only)
chat.ts:728 budget key = tenant + student + (`slotRank === 0 ? "textless" : "full"`) + `level`. Level is never "none" when a slot key exists, so the key space is {full, textless} x {concern, crisis}; the thread is not in the key. C2-C4: the diff touches only the budget key, a comment and tests: no regression path found.

## Commands run (all through vc-testlock, long waits normal)
- worktree apps/api `tsx --test tests/chat-privacy.test.ts tests/chat.test.ts tests/chat-profile.test.ts tests/voice-crisis-turn.test.ts tests/anonymous-route.test.ts tests/anonymous-zero-persistence.test.ts` -> 235 pass, 0 fail (5 "w1 C1 fix2" tests among them).
- worktree apps/api `pnpm exec tsc --noEmit` -> exit 0.
- Own hostile suite (scratchpad chk-c2-A/copy/apps/api/tests/hostile2.test.ts, run in a COPY of the unit at 2b479b4): 44 tests, 44 pass, 0 fail.
- Falsification in the COPY (chat.ts restored byte-identical, `cmp` same as the worktree): key = fix1 `slotRank` -> 16 fail (all unconsented-minor flood cases + overlong cases, so the instrument sees the cycle-1 defect); key = path only (no level) -> 24 fail (concern flood starves crisis on every kind); key = level only (no path) -> 9 fail (overlong crisis starves short crisis, adult/consenting). The three mutants are killed; the unmutated code passes.

## What held, per brief point (adult, consenting minor, unconsented minor; short and over-long paths)
1. Flood of 14 non-crisis writing turns (short concern, over-long concern, spread over threads; mixed on one thread; 60 concurrent mixed), then a crisis turn (short, over-long, same thread, new thread): helpline (14416) every time, own flag row of kind crisis (+1) every time, for all three student kinds. Short crisis escalated (+1) for adult and consenting minor; the textless paths (unconsented minor, over-long) have no escalate port, esc stays as before. The unconsented minor case that failed in cycle 1 now gets +1 flag.
2. No cross-starvation: exhausting any one of the four (path, level) keys (14 turns) leaves every other key still flagged (+1) for adult and consenting minor. For the unconsented minor short and over-long share one textless key per level (by design): crisis-vs-concern still separate, so no concern turn lands in a crisis slot and no level starves the other.
3. Bounds: 40 short crisis turns -> 10 flag rows (adult, consenting, unconsented), unconsented minor stores 0 chat_turns; 25x4 interleaved combos in one window -> flags 40 (adult/consenting, 10 per key) and 20 (unconsented, 2 keys), usage equals flags, nothing unbounded.
4. Every crisis-class turn answered 200 with the unchanged helpline, including every quiet one past the cap; 25 concern turns on each kind return the identical reply as the first (no quiet/loud difference visible).
5. Thread switch: 12 crisis turns on one thread then new threads stay within the cap of 10 (unconsented 10 -> 10); thread id in upper case and student id in upper case in the path both 404 (no budget reset path). Window rollover (+11 min) flags the unconsented minor again.

## Residuals judged against C1's text
- 11th crisis turn on a key is unflagged (cap of 10 per kind per window; e.g. unconsented minor: 12 over-long crisis then a short crisis -> flags 10 -> 10, helpline still given, the earlier 10 crisis turns are on record): cap design, not a FAIL.
- Window edge (up to 2x the cap at a boundary), in-memory per-process budget (restart or second process resets it; an eviction only hands out a fresh budget): acceptable, "capped per window" is met; not a FAIL.
- No refund on a failed write (R3: escalate port throws on the first 10 crisis turns, then recovers: the 11th is 200 + helpline but quiet, attempts stay 10, flags 10): not C1's text; PROPOSED-ISSUE below.

## PROPOSED-ISSUE lines (not written to the ledger)
- PROPOSED-ISSUE (medium, safety): a budget unit is spent before the writes succeed and never refunded; an escalate-port outage of 10 crisis turns blocks escalation and the flag row for the rest of the 10 minute window after recovery. Refund the unit in releaseCrisisSlot or count units only for confirmed writes. Unchanged from cycles 0-1; not a C1 FAIL.
- PROPOSED-ISSUE (low): in-memory per-process budget and fixed window edge (see above); document, or move to the shared store when one exists.

Return: `VERDICT PASS 2b479b4`
