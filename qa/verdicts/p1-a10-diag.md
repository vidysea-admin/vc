# p1-a10-diag — checker Mode A (single checker, Tier M)

Cycle checked: 0
Policy-Version: proportional-verification/2026-10-19.17
VERDICT: PASS
CHECKED-STATE: branch p1/a10-real, code 3e9eaba, evidence e5037ea, merged main 0c5a00a. Scope: runner/adapter change only (not whether voice passes A10; it does not, gate honestly FAIL 10/20).

CHECK-PLAN and results:
1. endAudio is not an interrupt, sent once per clip after the last chunk. packages/providers/src/live.ts: `LiveSession.endAudio` only calls `backend.endAudio?.()`; Gemini sends `audioStreamEnd` (not `interrupt`, session stays open); the new live.test.ts test asserts exactly one audioStreamEnd, session.closed false, model audio still delivered, no `interrupted` event. packages/engine/evals/live-audio.ts measureCrisisClip calls `session.endAudio()` once after the chunk loop (try/catch, `sendEndOfStream` default true). Fake backend that releases the transcript only on endAudio: with the marker it escalates (audioEnd=1); without it, `no_transcript` (audioEnd=0).
2. Diagnostic tail never flips pass/fail. `escalated = escalationMs <= boundMs` is computed from crisisAt minus speechEndAt after the tail, so a late event stays a miss. Own hostile run (scratch hostile.test.ts, boundMs 100, transcript released 150 ms and 400 ms after endAudio, tail 0 vs 1500): all four runs escalated=false, pass=false, endAudio count 1; the 1500 ms tail only reclassifies cause no_transcript to late_transcript (escalationMs 158 / 413). A crisis at 2.1 s therefore remains a miss.
3. 2 s bound and phrase set unchanged: `git diff 0c5a00a e5037ea` has no change to `A10_CRISIS_AUDIO_MS = 2000` (live-audio.ts:19), to qa/evals/p1/live-audio (manifest + clips), or to any crisis guard source. The tail is charged to the budget guard in run-live.ts (REAL_DIAGNOSTIC_TAIL_MS 4000; 0 when a provider factory is injected).
4. Gate file qa/gates/a10-voice-gate.md: `Result: FAIL`, 10/20, misses itemised, go-live stays refused, A10 NOT PROVEN. Matches the a10-diag-report.md cause table (10 escalated + 5 no transcript + 2 late + 2 connect + 1 guard miss = 20).
5. Secrets: the GEMINI_API_KEY value from D:/vc/.env (length 39) searched with `git grep -F` over HEAD: 0 hits; `git log -S` 0 hits; the only AIza-shaped string is the test dummy "AIza-test-key-must-never-appear-anywhere" in run-live.test.ts.

COMMANDS (via vc-testlock, TMP/TEMP on D:):
- engine `tsx --test evals/run-live.test.ts evals/live-audio.test.ts evals/live-audio-gen.test.ts evals/p1-runners.test.ts`: 125 tests, 125 pass, 0 fail.
- providers `tsx --test tests/live.test.ts`: 72 tests, 72 pass, 0 fail.
- `tsc --noEmit` engine `-p .`, engine `-p evals/tsconfig.json`, providers `-p .`: no errors.
- hostile scratch test: 4 tests, 4 pass.

FINDINGS (non-blocking):
- The report words the 6 to 10 improvement as plausible, not proven (one run each); correct. Gemini `close()` already sent audioStreamEnd before, so the change is about timing only.
- packages/engine/evals/live-audio.ts: the bound timer starts at the last chunk, not at speech end; pre-existing and harmless because `escalated` uses speechEndAt.
- Not run: scripts tsconfig and the full suite (declared by the maker). No real or paid run by the checker. No push.
ISSUES-WRITTEN: none.
