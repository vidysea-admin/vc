# Verdict p1-u9-live-adapter (repair check)
Cycle checked: 2
Date: 2026-10-18 · Checker: /checker Mode A repair subagent · Policy: proportional-verification/2026-10-17.14 (+.15 rules at dispatch)
Base 47ab62a · Repair base f2af54f (verified with git) · Head 425ad48 (git rev-parse; worktree clean; live.ts blob 99e8699, live.test.ts blob e0302d6) · Integration branch main

VERDICT: PASS
SCOREBOARD: 6/6 criteria met (C4 re-proved incl. R1, R2 and the four lows; C1, C2, C3, C5, C6 keep recorded results, whole file re-run green 63/63)
TIER: M (provider seam, mock only; no auth, tenancy or prod-write trigger in the repair diff)
FAILURES: none

## Plan
Repair diff f2af54f..HEAD read in full: live.ts (+50/-21), live.test.ts (+91/-3), qa evidence/manifest. Whole-unit diff 47ab62a..HEAD scanned: every file is under packages/providers or qa (git diff --name-only | grep -v -E '^(packages/providers/|qa/)' printed nothing). Repaired: R1 (toolCall), R2 (turnComplete), D-096 rule, lows (queue cap 256 with crisis interrupt kept apart, double attach throws, typed crisis does not set the spoken no-refire flag, audio emitted as a copy).

## Evidence (clean copy outside the bound tree, via `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh python -X utf8 chk-u9c2/run.py`; files in qa/evidence/p1-u9-check/cycle2/)
- Clean copy `tsx --test tests/live.test.ts`: tests 63, pass 63, fail 0. `tsc --noEmit`: rc 0, no output. (An earlier run of the same script crashed in its own print on cp1252 before the mutants; re-run with -X utf8.)
- My own hostile probes chk2.test.ts (7 tests, written by me): pass 7, fail 0.
  - H1 (the brief's sequence): crisis, toolCall, turnComplete, model audio + transcript, typed harmless message, more audio, turnComplete, audio -> 0 model audio, 1 fixed helpline audio, model words absent from the thread.
  - H2 crisis, interrupted, toolCall, turnComplete, toolCall, turnComplete, audio -> silent; next student speech lifts it.
  - H3 crisis partial, toolCall, same-utterance continuation chunks, audio -> silent, exactly 1 crisis and 1 fixed audio (no refire).
  - H4 toolCall before any crisis still ends the utterance (crisis then fires normally). H6 a plain client interrupt() mute still lifts at turnComplete (no over-reach). H5 typed crisis then toolCall/turnComplete/audio silent until speech. H7 second crisis after recovery re-arms the mute and replays the helpline (2 fixed audios).
- Falsification, one isolated copy per mutant, whole live.test.ts + probes against each:
  - R1 revert (`flushUser(!this.crisisMute)` -> `flushUser(true)`): 2 fail of 70: "C4 crisis R1" and my H3.
  - R2 revert (turnComplete clears muted + crisisMute): 6 fail of 70: "C4 crisis R2", the amended "C4 crisis F1: ...audible again once the student speaks", H1, H2, H5, H7.
  - Both failed on named assertions, not import errors; the clean copy was green first (above). The maker's own six-mutant record (fix2-falsification.txt: R1, R2, L1a, L1b, L2, L3 each rc=1 on their own test, restored rc=0) was read and is consistent; I re-ran only R1 and R2 (floor).

## Existing tests changed by the builder (step 4): both ALLOWED, neither weakened
- "C4 crisis: the student recovers and later says it again in a new turn": the diff adds one line (a student utterance "okay, I will talk to my sister" final) before the model's next reply. Every assertion is unchanged (still exactly 1 non-fixed audio). The old test encoded "turnComplete lifts a crisis mute", which D-096 forbids; it now encodes "student speech lifts it".
- "C4 crisis F1: after crisis + interrupted ... the next reply is audible again once the student speaks": title amended, the original assertion (exactly 1 non-fixed audio at the end) kept, and a new assertion added (0 model audio after turnComplete and before speech, message "D-096: turnComplete alone never lifts a crisis mute"). Strictly stronger. R2 mutant turns both red, so they still bite.
No assertion deleted, no threshold lowered, no skip/xfail added.

## Lows verified by the maker's tests and read in the diff (not separately mutated beyond the maker's record)
queue cap (live.ts queueBeforeAttach, 256, oldest dropped with an error event; crisis interrupt in pendingCrisisInterrupt, replayed first on attach), double attach throws LiveConfigError, typed crisis passes spoken=false so crisisFiredForUtterance is untouched, audio .slice() copy. Each has its own passing test in the 63.

## Non-blocking observations (low, no FAIL)
- L1: after a crisis a typed harmless message never lifts the mute (only inputTranscript does), so a text-only reply stays silent until the student speaks aloud. Consistent with D-096 "until the student speaks again"; a G-REAL/A10 product question, not this unit.
- L2: turnComplete ends the utterance (flushUser(true)), so a late chunk of the same crisis utterance arriving after a turnComplete counts as new student speech and lifts the mute (live.ts turnComplete / inputTranscript). Read from the code, not executed; D-096 wording makes it defensible, worth confirming in A10.
- Carried from cycle 1: L2 close-before-attach replay; L3 M3 byteLength check.

Metrics: start=2026-10-18T04:24:07+05:30 end=2026-10-18T04:54:24+05:30 wall_min=6 agent_min=unavailable blocked_min=26 suite_runs=0 repeat_runs=1 mutations=2 cycle=2 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-17.14 lane=normal check_s=unavailable mutants=2 defects_unit=0 defects_6c=0
slow: shared test lock wait ~26 min across 3 attempts (holders were other checkers' runs; the second attempt hit my own 580 s shell timeout while queued, retried); the tests themselves ran in 5-10 s per invocation. repeat_runs=1: one re-run after the cp1252 print crash in my own runner, not a product failure.
(end is the last clock read before the session interruption, 04:54:24; the verdict was written and committed after the resume at 23:30, so wall time excludes that gap. wall_min = 30 elapsed - 26 blocked + verdict writing.)
