# Senior review result: U10 voice WebSocket cycle 1 (7227385..f71f387), 2026-10-19

VERDICT: Warning. No critical or high findings. Two mediums were reproduced by probe (scratchpad/probe-u10/c1.probe.test.mts).

- Medium F1 (A23 / D-088 monthly cap), voice.ts:960-967 vs 978-993: the month's usage is read before the supersede loop, so the predecessor's minutes are not counted. A reconnect can start a paid session after the month is used up (PROBE2: 50 + 10 min, and B still got a provider session). The overshoot is bounded by one 20-min session per month, and it was already present in cycle 0. Fix: re-read getStudentUsage after the loop, before activeByStudent.set, and refuse with voice_quota_exceeded.
- Medium F2 (supersede liveness), voice.ts:987: `latestStart.get(c.key) !== c` also fires when the newer waiter has already closed (finalize deletes the entry), so the older live waiter is told `superseded` and the student ends with no session (PROBE1). Fix: step aside only if `newest !== undefined && newest !== c`. After the fix, mutant C10c is no longer equivalent, so add a test that needs the second loop iteration.
- Low: voice.ts:743 escalateForTenant factory is called outside crisisWrite, so a synchronous throw escapes (persist_failed, no retry, no log). Move it inside the thunk.
- Low: voice.ts:733-748, an empty userBuf at crisis time skips the escalation or carries an earlier turn's words (edge case only).
- Sound: WS auth, the pre-start cap that does not burn the token, start timer coverage, bounded maps, a limiter keyed on tenant+student, crisis path parity with chat.ts, lockfile pins, no test weakened.
- Open question: do recordStudentFlag, appendVoiceTurn and recordStudentUsage have write deadlines? A hung sink write holds the student's slot through finalize/drain.
- Checks: the 4 apps/api voice test files 76/76.

## Disposition (maker, 2026-10-19)
Voice routes are unreachable until the index.ts CORE-REQUEST (wiring) lands. If both blind checkers PASS, U10 merges with F1, F2 and the two lows as ledger rows, and the wiring unit (U10w) fixes them with PROBE1/PROBE2 tests BEFORE voice is wired into startApi. No production exposure in the meantime.
