# p1-u9-live-adapter independent check (Mode A)

Cycle checked: 0
Policy-Version: proportional-verification/2026-10-17.14
VERDICT: FAIL

CHECK-PLAN: tier M floor (provider seam, mock only; no auth/tenancy/prod-write, so one checker, no dual). Whole-unit diff 47ab62a..aeca9c8 read in full (step 4c). Re-ran the full `@vc/providers` suite once, wrote 4 independent crisis/audit probes, ran 1 falsification per criterion (6) in throwaway copies. No full-repo suite, no network, no paid call.
TIER: M. Lane: normal (quick lane off; cycle 0 but multi-file/6 criteria).
CHECKED-STATE: worktree p1/u9 HEAD aeca9c8; code identical to e80c9b3 (diff e80c9b3..HEAD touches only qa/). Bound tree never mutated; copies under scratchpad/u9chk.

SCOPE READ: changed files = packages/providers/src/live.ts (new), src/index.ts (+4 re-export lines), tests/live.test.ts (new), qa/ evidence + manifest. Nothing outside the U9 seam. live.ts has no `import` statement at all (no apps/api, ws, SDK, fetch); the test file booby-traps fetch/WebSocket in every test and asserts 0 touches.

SCOREBOARD:
- `bash D:/vc/scripts/vc-testlock.sh bash u9chk/batch.sh` -> base `@vc/providers` all tests except my probe file: tests 108, pass 108, fail 0 (matches the manifest). Typecheck evidence (`qa/evidence/p1-u9/typecheck.txt`, exit 0, sha e80c9b3) reused: code tree unchanged since that sha.
- Independent probes `qa/evidence/p1-u9-check/chk.test.ts.txt` (4): 2 pass, 2 FAIL (findings F1, F2). Output `qa/evidence/p1-u9-check/batch-out.txt`.

CRITERIA:
- C1 interface: PASS. 16 kHz in / 24 kHz out, both transcripts, tool call, interrupt, close covered by 13 tests; Falsify[C1] constant LIVE_OUTPUT_SAMPLE_RATE_HZ 24000->16000 -> RED 4 (audio-format constants, Gemini exchange, wrong-rate).
- C2 mock: PASS. Falsify[C2] MockLiveBackend.sendText stops recording -> RED 1 (typed-message test).
- C3 gemini: PASS (compile-only confirmed: no import, injected connector, no connector -> LiveNotWiredError, no network reachable). Falsify[C3] drop `inputAudioTranscription: {}` from buildGeminiLiveConfig -> RED 1.
- C4 crisis: FAIL, see F1 (and F2). Trigger chunk itself is correct: probe CHK-P0 (audio before trigger forwarded, audio after the trigger chunk dropped, one crisis event) and CHK-P3 (one Gemini message carrying crisis transcript + model audio -> audio dropped) PASS. Falsify[C4] remove `this.muted = true` in fireCrisis -> RED 2.
- C5 audit (A9b): PASS as written (flag + audit record on a finding, clean answer none). Falsify[C5] auditor ignores sourced numbers -> RED 2. Cross-criterion defect F2 below.
- C6 sink: PASS (order, failure contained, injected-clock ISO, source-text import guard). Falsify[C6] `this.now = Date.now` ignoring the injected clock -> RED 1.
All six falsifications: green before (108/108 base), red after on assertion failures (not import errors), copies discarded (bound tree untouched).

FINDINGS (blocking, each reproduced by a command I ran):
F1 (C4, safety, CRITICAL control per contract B6 voice exception U0-4): `LiveSession.interrupted()` (live.ts:365-370, read in this check) sets `this.muted = false` unconditionally, so a backend `interrupted` event arriving after the crisis trigger reopens model audio. `inputTranscript` guards the same flag with `!crisisFiredForUtterance` (live.ts:316) and the module header (live.ts:10-11) promises "after the trigger NO model audio is forwarded at all"; the contract allows at most 2 s. Repro: probe CHK-P1 (`I will kill myself` -> `emitInterrupted()` -> `emitOutputAudio`) -> `AssertionError: model audio leaked after crisis trigger + interrupted`. Real Gemini reports `interrupted` as the server-side confirmation of a barge-in, and ordering against transcription chunks is not guaranteed. Fix: do not clear `muted` in `interrupted()` while `crisisFiredForUtterance` is true (keep the clear on `turnComplete`, which the existing recovery test pins), plus a test.
F2 (C4/C5 seam, A9b): `fireCrisis` does `this.assistantBuf = ""` (live.ts:429) so words the model had already spoken when the crisis arrived are never audited and never stored. The barge-in path (`interrupt()`/`interrupted()`) audits and stores the half reply as `interrupted:true` (pinned by a C5 test); the crisis path, which is also a student talking over the model, drops it. Contract B6 (b): output transcripts are audited after the fact, each breach writes an audit event. Repro: probe CHK-P2 (model says "The fee is 99999 rupees", then crisis chunk, auditor installed) -> `AssertionError: spoken uncited number in the half reply was never audited`. Fix: call `flushAssistant(true)` in `fireCrisis` before muting (audit + store as interrupted), plus a test.

NON-BLOCKING / LIMITS:
- Open risks the builder named, verified: Gemini compile-only with no reachable network call (yes); crisis hook stops audio on the trigger chunk (yes for that chunk, see F1 for a later event); nothing calls a paid provider (yes).
- `turnComplete` unmutes after a crisis by design (existing test); whether Gemini answers the crisis utterance before `turnComplete` is a G-REAL / A10 live-gate question, not provable offline.
- Gemini `interrupt()` sends only `audioStreamEnd` (stated ASSUMPTION in code); verified under G-REAL.
- Process: lock wait ~14 min (blocked_min) behind other units' suites; my probe file was first smoke-run once without the lock (4 tiny tests).

ISSUES-WRITTEN: none (checker ledger not touched; F1/F2 are FAIL findings for the maker's fix cycle 1).
Metrics: start=2026-10-18T02:01:19+05:30 end=2026-10-18T02:23:23+05:30 wall_min=9 agent_min=unavailable blocked_min=14 suite_runs=1 repeat_runs=0 mutations=6 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-17.14 lane=normal check_s=1360 mutants=6 defects_unit=2 defects_6c=0
