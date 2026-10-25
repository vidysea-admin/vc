# Manifest — w1-chat-privacy
**Contract:** brief qa/evidence/p1-briefs/w1-chat-privacy.md, criteria C1-C4 (verbatim below); rules qa/evidence/p1-briefs/w1-common-rules.md. Authorized by D-112. Not an edit to qa/contracts.
**Goal task:** none
**Date:** 2026-10-25
**Issues addressed:** ISS-157, ISS-147, ISS-148, ISS-156, ISS-198, ISS-152
**Executor:** claude-sonnet-subagent
**Executor rationale:** one build unit in one worktree (D:/vc/.worktrees/w1-chat-privacy, branch wave/w1-chat-privacy, base da2faad), owner of apps/api/src/chat.ts.

Policy-Version: proportional-verification/2026-10-19.17

## Criteria (verbatim from the brief)
### C1: repeated crisis turns stay bounded (ISS-157)
- Crisis turns still get the fixed crisis reply immediately.
- They count against a separate, bounded limiter. Repeated crisis phrases must not cause unbounded `chat_turns` writes or escalations.
- A student's first crisis turn is never blocked.
- Test: N rapid crisis turns each get the reply, and the number of writes and escalations is capped.

### C2: the student's name is redacted (ISS-147, ISS-148, ISS-156)
- Redact the student's name from stored `chat_turns` and from replays, in every case those rows name: a lowercase name, the name inside the reply, and name variants.
- Write one test per case.

### C3: redaction fails closed (ISS-198)
- When the profile port throws, redaction fails closed: the turn is stored redacted or refused, never raw.
- Test this with a fake port that throws.

### C4: raw crisis text is not passed on (ISS-152)
- Do not send the raw crisis text onward to `escalateTurns` or the classifier beyond what D-093 6A allows.
- The stored rationale must never restate the raw text.
- The test asserts that the stored rationale contains none of the raw phrase.

## Where the code stood (found, with file:line)
Most of the ledger rows were already repaired in the merged unit p1-u8r-chat-privacy (the ledger rows were never closed): the per-thread crisis slot (chat.ts `takeCrisisSlot`), the profile-outage fail-closed branch (`profileDown`), lower-case intros and echoed stated names (`redactPii`, `stated`/`allNames`), redacted escalation text (`escalationText`). This unit proves each with a named test and closes the REAL remaining gaps:
- ISS-157 / U8r checker A P1: the slot is per thread only. 25 threads x 1 crisis turn = 25 escalations; 40 over-long (textless) crisis turns in one thread = 40 flag rows (a textless holder never confirms its slot, so it is never quiet). Fixed by a per-student write budget across threads, chat.ts:465 `takeCrisisBudget`, consulted at chat.ts:727 `overBudget` (spent only by a turn that would write: slot holder or loose turn). Over budget the turn is `quiet` (answered with the helpline, nothing written, slot given back).
- ISS-198: a lower-case one-letter initial ended the name run. Fixed in packages/schemas/src/redact.ts (`LOWER_INITIAL`, `realUsed`/`realConsumed` in the EN_NAME replacer): initials continue the name, trailing initials with no name behind them are not redacted.
- ISS-152: `escalationText` (chat.ts:~500) fell back to the RAW text when both redacted views hid the crisis wording (a profile-name token that is itself the wording, e.g. "Kill"). Last resort is now email and phone redaction only (chat.ts:505), never raw.

## What changed
Code commit 8dba0ac on wave/w1-chat-privacy (base da2faad). 4 files: apps/api/src/chat.ts (edited in place), packages/schemas/src/redact.ts (edited in place), apps/api/tests/chat-privacy.test.ts (+15 tests, nothing deleted), packages/schemas/tests/redact.test.ts (+2 tests). New constant `CRISIS_MAX_WRITES_PER_STUDENT = 10` (per CRISIS_WRITE_WINDOW_MS, 10 min) and optional dep `ChatApiDeps.crisisWritesPerStudent`. Not touched: packages/engine/**, packages/db/**, `.claude/**`, qa/contracts, qa/gates, docs/DECISIONS.md, ARCHITECTURE.md, TASKS.md, qa/QUEUE.md, pnpm-lock.yaml (restored after `pnpm install --offline --frozen-lockfile`).

## Acceptance criteria and evidence
Dual check: required
dual-trigger: security apps/api/src/chat.ts:724
Round: 3 (est 20 min)
Base da2faad, repair base 8835203, code commits 8dba0ac, 4135e1c, then a835593 (fix cycle 2; the final sha for every check below; the manifest commit adds only this file).

Tests[C1]: chat-privacy.test.ts "w1 C1 (ISS-157): one student's crisis turns spread over 25 threads ..." (every turn 200 + helpline; escalations 1..10, flags <=10, chat_turns <=20, usage <=10; after the window the next crisis turn escalates again), "w1 C1 (ISS-157): one student hitting the crisis cap does not block another student's first crisis turn", "w1 C1 (ISS-157, U8r checker A P1): 40 over-long crisis turns ... write at most 10 flag rows" (every turn helpline, flags 1..10, 0 stored turns). Existing per-thread tests (M2 flood: 40 turns, 1 stored exchange) unchanged and green. Fix cycle 1 adds 4 tests "w1 C1 fix1: ..." (12 concern turns on separate threads then a crisis turn escalates; 12 over-long crisis turns on separate threads and on one thread then a short crisis turn escalates; interleaved concern / over-long / crisis turns: a crisis turn after the flood escalates and escalations, flags and stored turns stay capped; a flood of 30 crisis turns still escalates at most 10) Fix cycle 2 adds 5 tests "w1 C1 fix2: ..." (12 concern turns on separate threads, then a crisis turn has its own flag row, for an unconsented minor, an unconsented minor with over-long concern turns, a consenting minor and an adult with over-long concern turns; plus 30 crisis turns of an unconsented minor stay at 1..10 flag rows with no text stored) — these are the only tests that drive crisis turns past the per-student write budget across threads and over-long turns, the changed code path (chat.ts takeCrisisBudget/overBudget).
Tests[C2]: chat-privacy.test.ts 5 tests "w1 C2 (ISS-198): '<intro>' leaves the surname in nothing that is stored or read back" ('my name is s. kumar', 'i am j. r. d. tata', 'my name is a. p. j. abdul kalam', 'my name is dr. s. kumar', 'call me k. v. rao'; stored rows and GET history), "w1 C2 (ISS-148): a name the Pathlynks profile supplies and the model echoes in lower case, as a first name, a surname or a possessive ..." (stored, replay, history); existing "p1-u8r A1" (lower-case name) and "p1-u8r A2" (echo of a stated name, capitalised and lower case) cover ISS-147 and ISS-148 and stay green; packages/schemas/tests/redact.test.ts "w1 ISS-198 ..." x2 (redaction and the no-over-redaction negatives 'i am a student', 'i am a. i want to study in germany', 'i am s. and i want to study', 'my name is a.').
Tests[C3]: chat-privacy.test.ts 4 tests "w1 C3 (ISS-156): when the profile port fails with <an async Error | a rejected string | a rejected undefined | a synchronous throw> ..." (ordinary turn 503, zero model calls, zero chat_turns; crisis turn answered with the helpline, zero chat_turns, name in no stored row and not in GET history; the same turn id works once the port is back); existing "p1-u8r M1" x2 stay green.
Tests[C4]: chat-privacy.test.ts "w1 C4 (ISS-152): the classifier is never handed the student's name, phone or email, so the stored rationale restates none of them" (REAL escalateTurns, a classifier that restates its whole input as the rationale; the stored crisis_flag_reviews rationale does not contain the raw text, nor priya / sharma / the email / the phone / meera / kulkarni; the crisis wording is still visible), "w1 C4 (ISS-152): even when a profile-name token would hide the crisis wording, the email and phone are still never passed on" (profile name "Kill Bill"). — they run the real escalateTurns with an echoing classifier and read back the stored rationale, the changed path (chat.ts escalationText).

Pre-check[C1]: a835593 `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 900 pnpm exec tsx --test tests/chat-privacy.test.ts` (apps/api) -> exit 0, 63 passed, 0 failed (whole file; the 19 w1 tests included)
Pre-check[C2]: a835593 `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 900 pnpm exec tsx --test tests/chat-privacy.test.ts` (apps/api) -> exit 0, 63 passed, 0 failed; `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 900 pnpm exec tsx --test tests/redact.test.ts` (packages/schemas) -> exit 0, 21 passed, 0 failed (packages/schemas unchanged since 8dba0ac, where this ran)
Pre-check[C3]: a835593 `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 900 pnpm exec tsx --test tests/chat-privacy.test.ts` (apps/api) -> exit 0, 63 passed, 0 failed
Pre-check[C4]: a835593 `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 900 pnpm exec tsx --test tests/chat-privacy.test.ts` (apps/api) -> exit 0, 63 passed, 0 failed
Pre-check[regression]: a835593 `... tsx --test tests/chat.test.ts tests/chat-profile.test.ts tests/anonymous-route.test.ts tests/anonymous-zero-persistence.test.ts tests/partners.test.ts tests/partner-voice.test.ts tests/main.test.ts tests/server.test.ts` -> exit 0, 316 passed, 0 failed.
Pre-check[regression fix2]: a835593 `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 900 pnpm exec tsx --test tests/chat.test.ts tests/chat-profile.test.ts tests/voice-crisis-turn.test.ts tests/anonymous-route.test.ts tests/anonymous-zero-persistence.test.ts` (apps/api) -> exit 0, 172 passed, 0 failed; `pnpm exec tsc --noEmit` (apps/api) -> exit 0.
Pre-check[typecheck]: a835593 `... pnpm exec tsc --noEmit` in apps/api -> exit 0, no output; in packages/schemas -> exit 0, no output.
TDD red run (before the code change, same tests): `... tsx --test --test-name-pattern="w1 " tests/chat-privacy.test.ts` -> 15 tests, 6 passed, 9 failed (3 C1, 5 ISS-198, 1 C4 fallback); the 6 that passed already (ISS-148 echo, 4 C3 throw styles, C4 main case) document behaviour that p1-u8r had fixed.

Falsify[C1]: in a copy outside the tree (scratchpad build-w1-chat-privacy/fals, control = unmutated copy 15/0) `takeCrisisBudget` never denies -> 3 failing (all three C1 tests).
Falsify[C1 fix1]: in the copy, the budget key without the kind (`the NUL separator, ${slotRank}` removed, the cycle-0 behaviour) -> 3 of the 4 "w1 C1 fix1" tests fail (the crisis turn after the concern / over-long flood escalates 0 or 10 times instead of one more); unmutated copy of the same files: `--test-name-pattern="w1 C1"` 7 passed, 0 failed.
Falsify[C1 fix2]: in the copy, the budget key put back to the cycle-1 form (`${slotRank}` only) -> 2 failing (the two unconsented-minor "w1 C1 fix2" tests: "the crisis turn has its own flag row"); the other 10 "w1 C1" tests pass; unmutated: 12 passed, 0 failed.
Falsify[C2]: copy of packages/schemas, `LOWER_INITIAL` made unmatchable -> redact.test.ts 20 passed, 1 failing ("w1 ISS-198: a lower-case one-letter initial ...").
Falsify[C3]: `profileDown = true` -> `profileDown = false` (redaction fails open) -> 4 failing (all four C3 throw styles).
Falsify[C4]: `escalationText` returns the raw text (early return) -> 2 failing (both C4 tests); last resort put back to `return raw` -> 1 failing (the profile-name-token fallback test; the main C4 test passes, as the fallback is only reached then). Control 15/0.

## Fix cycle 1 (C1, both blind checkers FAIL on 8c6657e)
Cause: the per-student budget in apps/api/src/chat.ts (takeCrisisBudget, consulted at the `overBudget` line in handleTurn) was one counter for every writing turn, so concern-level, textless (over-long, unconsented minor) turns spent what an escalation-capable crisis turn needs; 10-12 such turns silenced the next real crisis turn (0 escalations, no flag row), against the p1-u8r cycle 2 guarantee.
Fix (edited in place, chat.ts `overBudget` line, plus the comments at the constant and at takeCrisisBudget): the budget key now carries the kind of turn, `slotRank` (2 crisis that can escalate, 1 concern that can escalate, 0 textless). The first turn of each kind in a window is always admitted; each kind is still capped at 10 writes per window, so all writes stay bounded (at most 30). Every turn is still answered with the unchanged helpline (LK10 untouched). Not folded in: the profile-port deadline and Hinglish names (Candidates).
Red run before the fix (same 4 tests): 3 failed, 1 passed (the flood-cap test). Green: chat-privacy 58 passed, regression 316 passed, tsc exit 0 (Pre-check lines above).

## Fix cycle 2 (C1, coordinator A FAIL on 8835203)
Cause: the cycle-1 budget key was `slotRank`, which is 0 for every turn of an unconsented minor and every over-long turn, so on the textless path concern and crisis turns shared one counter: 12 concern turns then a crisis turn gave the helpline but no flag row (the flag is the only crisis record there).
Fix (edited in place, chat.ts `overBudget` line ~727): the key now carries the write path (`textless` when slotRank is 0, else `full`) AND the crisis level (`level`), so a concern-level turn never spends a crisis-level turn on any path. The per-kind cap of 10, the overall bound, the unchanged helpline, D-110 and anonymous zero persistence are untouched. Not folded in (ledger rows): no refund of a budget unit when the write then fails, the in-memory per-process budget, the window edge.
Red before the fix: 2 of the 5 new tests failed (both unconsented-minor cases), 3 passed. Green: chat-privacy 63 passed, regression 172 passed, tsc exit 0.

## Metrics
Metrics: start=2026-10-25T06:53:48+05:30 end=2026-10-25T07:49:27+05:30 builder_min=unavailable wall_min=unavailable agent_min=unavailable blocked_min=unavailable suite_runs=0 repeat_runs=10 mutations=7 cycle=2 policy=proportional-verification/2026-10-19.17 tokens=unavailable
Sessions: 2b04f90e-6b56-4682-a76c-d8515b93405c

## Not verified here (for the checker)
- OPEN RISK: during a profile outage the escalation text of a crisis turn is redacted without the Pathlynks name (unknown), so a profile-only name in that text can still reach escalateTurns and the classifier rationale. Unchanged from p1-u8r (accepted gap); closing it needs the engine to redact the stored rationale (packages/engine, outside this unit's files).
- OPEN RISK: the classifier rationale is model output; this unit only guarantees the classifier is never handed email, phone, stated or profile names (except the pathological case where a profile-name token IS the crisis wording). It does not scrub a rationale a model invents.
- OPEN RISK: the per-student budget is in memory and per process, like the limiter and the thread slot (a restart or a second process resets it). Fixed window, so up to 2x the cap can land across a window edge. After 10 writing crisis turns in a window the 11th is answered with the helpline and writes nothing (no flag row); the earlier 10 are on record.
- Hinglish "naam hai priya" without "mera" is still not redacted (U8r P3, low, not in this brief).
- No fresh-context senior-software-engineer review was run by the maker (a subagent cannot dispatch one); the dual checker covers review. Real Mongo and any live model were not used (fakes only).

**Fix cycle:** 2
**Status:** checked-PASS (cycle 2, verdicts a88785b A + d786d19 B, merged 4df4a0e)
