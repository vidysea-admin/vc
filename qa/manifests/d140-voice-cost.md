# Manifest - d140-voice-cost
Policy-Version: proportional-verification/2026-10-19.17
**Unit:** d140-voice-cost. Authorized by D-140 (docs/DECISIONS.md line 1309, Changes-authorized: live.ts usage parsing and price table; voice.ts tool log line and usage into turn_usage; index.ts createQuestVoiceTools outcome; their tests only).
**Branch:** wave/voice-cost (worktree D:/vc/.worktrees/voice-cost). Commits e86f7315 (build) and dd4bf8ec (review fixes).
**Date:** 2026-10-30
**Fix cycle:** 0
**Dual check:** no (observability and metering; no auth, persistence schema or safety path changed; turn_usage shape unchanged)
**Round cap:** (a) SECURITY CLASS, data write. This unit changes what voice `finalize` writes into the production `virtual_counsellor.turn_usage` collection (real token counts and USD instead of zeros, plus the HMAC studentKey row it already wrote). It also adds a log line that must stay free of student text. D-014 never caps a data-write class. It is also a first check of a new unit authorized by D-140, not round N+1 of an earlier unit; the 12 prior PASSes are other units that share files.
**Status:** ready-for-check

## What changed
1. `packages/providers/src/live.ts`: new `usage` LiveEvent and `LiveUsage`; `GEMINI_LIVE_PRICES` for gemini-3.1-flash-live-preview (per 1M tokens: in text 0.75, audio 3, image/video 1; out text 4.5, audio 12; read from ai.google.dev/gemini-api/docs/pricing 2026-10-30); `liveUsageFromMetadata` (input = prompt + toolUse, output = response + thoughts, priced per modality, undetailed remainder at the audio rate, unknown model -> tokens only, cost 0); `translateGeminiMessage` reads `usageMetadata` before the serverContent early return.
2. `apps/api/src/voice.ts`: per-connection `usage` meter summed on each `usage` event; `finalize` writes it into the turn_usage row (was zeros); toolHandler wrapped in try/finally logging one `voice_tool_call` line {tool (declared name or `unknown`), durationMs, outcome ok/unavailable/timeout/error}; refused `student_memory` calls report `unavailable` (review fix, dd4bf8ec).
3. `apps/api/src/index.ts` `createQuestVoiceTools`: returns outcome ok / unavailable / timeout alongside the result; the outcome never reaches the model.

## Tests (TDD; written before the code)
- packages/providers/tests/live.test.ts: 6 D-140 tests (pricing, modality split, toolUse/thoughts, garbage, unknown model, usage event).
- apps/api/tests/voice-usage.test.ts: 5 tests (summed row, unpriced row, ok log line with durationMs, timeout/unavailable/error/unknown, refused student_memory -> unavailable).
- apps/api/tests/voice-wiring.test.ts: 1 test (createQuestVoiceTools outcome ok / unavailable / timeout past 20 s; result unchanged).

## Verification run (dd4bf8ec)
`bash scripts/vc-testlock.sh` with `--test-concurrency=2`:
- `npx tsc --noEmit -p .` in apps/api and packages/providers: clean (API_TSC_OK, PROV_TSC_OK).
- packages/providers tests/*.test.ts: tests 233, pass 233, fail 0.
- apps/api tests/voice*.test.ts partner-voice main partners chat-usage: tests 291, pass 291, fail 0.

## Cumulative vs per-generation (senior review medium finding, settled)
Probe (synthetic text only, counts printed): 3 turns on one real Live session gave response 22, 235, 32 (cumulative would be 22, 257, 289); prompt 147, 190, 480, where each prompt includes earlier output audio as context (AUDIO 22, then 257 = 22 + 235). One report per generation, each billed in full, so summing is correct. Script: scratchpad probe/usage-probe.mjs.

## Real voice turn
Run 2026-10-30 at dd4bf8ec. Only the VC API was started (port 8787, `VC_VOICE_ENABLED=true`, `VC_VOICE_MODEL=gemini-3.1-flash-live-preview`). A node client signed an HS256 student JWT for synthetic student `d140-probe` in synthetic tenant `d140-probe`. Partner tenants `vidysea` and `pathlynks` are refused for student tokens by the partner-tenant guard, so they got 401. The client created a thread, minted a voice token and streamed a SAPI-spoken question ("Which careers suit me, and why?") as 16 kHz PCM16. It got back 57 audio frames, a final user transcript and a final assistant transcript, then the socket closed with code 1000.
- turn_usage row (`virtual_counsellor.turn_usage`, newest voice row for the probe student, 2026-10-30T13:54:03Z; counts only): mode `voice`, inputTokens 4336, outputTokens 334, costUsd 0.01149675, latencyMs 32071, answered true.
- API log, verbatim (text-free by design; copy in `qa/evidence/d140/api.log`):
  - `{"level":"info","event":"voice_tool_call","ts":"2026-10-30T13:53:34.716Z","tool":"student_memory","durationMs":1809,"outcome":"ok"}`
  - `{"level":"info","event":"voice_tool_call","ts":"2026-10-30T13:53:37.768Z","tool":"pathlynks_career_fit","durationMs":1700,"outcome":"unavailable"}`
  - `unavailable` is expected: the synthetic tenant has no Pathlynks data.
- Cleanup: API process tree stopped; port 8787 free (netstat shows 0 listeners). The only rows written were the probe student's thread, chat turns and turn_usage, all by the VC API itself.
- Limit: the turn ran under a synthetic tenant, not `vidysea`, so the Pathlynks tool returned unavailable rather than real data. Tool-ok with real data is still covered by the T-057 C10 walk.

## Senior review (e86f7315): Warning
- Medium: cumulative vs per-generation -> settled by the probe above (per generation; summing is right).
- Low: refused student_memory logged ok -> fixed in dd4bf8ec with a test.
- Low: remainder clamp prices undetailed tokens at the audio rate -> kept; it errs toward over-reporting (text input is cheaper), documented.
- Confirmed: try/finally logic, outcome never reaches the model, garbage handling, no break for other LiveEvent consumers, privacy clean.

## Known limits
- Price table is per model; a new Live model records cost 0 until its row is added.
- Cost is an estimate from Google's published rates, not an invoice reading.
