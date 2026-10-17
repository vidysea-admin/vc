# Verdict p1-u9-live-adapter (repair check)
Cycle checked: 1
Date: 2026-10-18 · Checker: /checker Mode A repair subagent · Policy: proportional-verification/2026-10-17.14 (+.15 rules at dispatch)
Base 47ab62a · Repair base a4864f8 (verified with git) · Head ebbb41f (git rev-parse; worktree clean) · Integration branch main

VERDICT: PASS
SCOREBOARD: 6/6 criteria met (C4 re-proved; C5 re-run because live.ts changed; C1, C2, C3, C6 keep results, whole file re-run green)
TIER: M (provider seam, mock only; no auth, tenancy or prod-write trigger found in the repair diff)
FAILURES: none

## Plan
Failed criterion C4 (cycle 0: F1 interrupted unmutes after a crisis, F2 half reply dropped on crisis). live.ts changed, so C4 and C5 (flushAssistant audit path) re-run. Read repair diff a4864f8..ebbb41f in full (live.ts +97/-26, tests +116, qa evidence). Whole-unit diff 47ab62a..ebbb41f scanned: files are packages/providers/src/{index.ts,live.ts}, packages/providers/tests/live.test.ts and qa/** only; nothing outside the declared scope, no existing test edited or weakened.

## Evidence (all in a throwaway copy outside the bound tree, via `bash D:/vc/scripts/vc-testlock.sh python chk-u9c1/run.py`; files under qa/evidence/p1-u9-check/cycle1/)
- Clean copy, `tsx --test tests/live.test.ts`: tests 57, pass 57, fail 0 (out-live-clean.txt). `tsc --noEmit`: rc 0, no output.
- My own hostile probes `chk1.test.ts` (17 tests, written by me, not the maker's): pass 17, fail 0 (out-probes-clean.txt). They prove outcomes, not construction:
  - P1-P5 F1: crisis then 3x `interrupted` stays silent (audio, words, dropped counter 1, backend interrupted once); crisis then client interrupt() then backend `interrupted` silent; later non-final chunk of the same utterance; crisis on a FINAL chunk then 2x interrupted silent, then the next student speech unmutes; a second crisis utterance re-fires and stays muted through `interrupted`.
  - P6-P9 F2: half reply with an uncited figure is audited once, stored `interrupted: true` as seq 1, then student words seq 2, fixed reply seq 3, no duplicate on repeated turnComplete, pre-crisis audio forwarded exactly once; a throwing auditor yields an `audit_error` flag and the crisis still plays and mutes; a sink that throws on every write and a listener that always throws do not break the crisis path.
  - P10-P12 M1: crisis and tool call before attach are replayed on attach; a throwing backend.interrupt on replay becomes an `error` event, attach does not throw and the queued tool call is still answered; a throwing pre-attach tool handler runs once, after attach, as one `error` event.
  - P13 M2: a throwing detector on typed text fails closed (crisis, not forwarded); typed crisis twice fires twice; harmless typed text is scanned once and forwarded.
  - P14 M3: Uint8Array(2) accepted; no detector with text-only message accepted; detector without message rejected; GeminiLiveProvider with a text-only crisis message rejects with LiveConfigError and the connector is never opened (opened=0).
  - P16 flags do not go stale (crisis, turnComplete, client interrupt, backend interrupted leaves audio audible; crisis, speech, interrupt, interrupted audible). P17 close right after a crisis stores the half reply once.
- Falsification, one isolated copy per mutant, whole live.test.ts + probes run against each (clean copy green first, above):
  - F1 `if (!this.crisisMute) this.muted = false;` -> `this.muted = false;`: 10 fail, including the two named cycle-1 tests "C4 crisis F1: the backend reports `interrupted`..." and "...FINAL transcript chunk..." plus P1-P5, P7-P9.
  - F1-naive (the brief's `!crisisFiredForUtterance` variant): 3 fail (the FINAL-chunk C4 F1 test, P4, P5), so the separate `crisisMute` flag is necessary and the test discriminates it.
  - F2 `flushAssistant(true)` -> `assistantBuf = ""` in fireCrisis: 4 fail ("C4 crisis F2", P6, P7, P17); this is also the C5 falsification (the half reply is no longer audited).
  All failed on named assertions, not import errors (out-mut-*.txt).
- C5 crisis audit: F2 test and P6/P7 show the interrupted half reply is audited, flagged and handed to the sink once. C1/C2/C3/C6: whole-file run green 57/57; their inputs in the repair diff are untouched.
- Downstream (M3): `git grep` of the bound worktree, the main tree D:/vc and the sibling p1-u8 worktree for `new LiveSession`, MockLiveProvider, GeminiLiveProvider, detectCrisis, crisisMessage outside packages/providers: no other caller. Nothing throws today. The future U8 caller must supply non-empty even-length 24 kHz PCM16 `crisisMessage.audio` whenever it wires a detector, or `connect()` rejects with LiveConfigError (intended).

## Non-blocking observations (low, no FAIL; wording/hardening, not units)
- L1: after a crisis, a harmless typed message gets no audible reply until `turnComplete` or the next student speech (P15 observed: 0 audible chunks). Consistent with D-088 Q5 as built; whether the live Gemini sequence leaves the student without an answer is an A10 / G-REAL live-gate question, not provable offline (the maker states the same residual risk for a reply sent as a new turn).
- L2: a pre-attach crisis followed by `close()` and then `attach()` still replays the backend interrupt on the closed session's backend (P10 observed `[{"type":"interrupt"}]`); harmless, but the queued tool handler would also run after close. Only reachable by closing before attach.
- L3: the M3 check tests `byteLength`, so a non-Uint8Array with an even byteLength (type-level misuse) passes; text-only `crisisMessage.text` empty string is not rejected.

Metrics: start=2026-10-18T03:04:30+05:30 end=2026-10-18T04:13:22+05:30 wall_min=27 agent_min=unavailable blocked_min=42 suite_runs=0 repeat_runs=0 mutations=3 cycle=1 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-17.14 lane=normal check_s=unavailable mutants=3 defects_unit=0 defects_6c=0
slow: shared test lock wait ~42 min (first attempt timed out at 1806 s, held by other checkers' runs; retried once with VC_TESTLOCK_TIMEOUT_SECS=7200); wall_min also spans an API network outage and a resume, so it is an upper bound. The tests themselves ran in 2 s per invocation. Retry: 1.
