# Verdict - d140-voice-cost
**Unit:** d140-voice-cost (D-140, docs/DECISIONS.md:1309), branch wave/voice-cost, checked at 0b9df527 (builds e86f7315, dd4bf8ec)
**Mode:** A (independent, fresh context, read-only toward code)
**Cycle checked:** 0
**Verdict: PASS**

## Criteria
- C1 PASS. voice.ts toolHandler wraps every call in try/finally and logs one `voice_tool_call` line {tool, durationMs, outcome}. `tool` is the call name only if it is in `tools.declarations`, else `unknown`; no args, result or error text is logged. `outcome` is read from `out.outcome` or judged from the result, and only `out.result` is returned to the model (voice-wiring test asserts the result has no `outcome` key; voice-usage test asserts `student_memory` still returns `{messages,facts}`).
- C2 PASS. `liveUsageFromMetadata` prices text/audio/image-video input and text/audio output per modality; table values (in 0.75/3/1, out 4.5/12) equal the figures quoted in D-140; thoughts bill as text output, toolUse as text input; the undetailed remainder is billed at the audio rate (over-reports, documented). Unknown model gives tokens and no `costUsd` (test); row cost stays 0. I did not independently re-read Google's page; I checked code against the D-140 quotation only.
- C3 PASS. `Conn.usage` is summed per `usage` event and written via `{ ...c.usage }` into the single finalize turn_usage row (test: two reports summed to 6500/2400/0.04635; unpriced case 10/5/0). Per-generation summing is supported by the manifest probe (22/235/32 not cumulative) and the probe script is committed.
- C4 PASS. Diff e86f7315~1..HEAD touches only live.ts, voice.ts, index.ts, their tests, the D-140 append to docs/DECISIONS.md (0 removed lines), the manifest and qa/evidence/d140/usage-probe.mjs. All within D-140 Changes-authorized.
- C5 PASS (rerun through scripts/vc-testlock.sh, --test-concurrency=2): providers tsc clean, tests 233 / pass 233 / fail 0; api tsc clean, voice*/partner-voice/main/partners/chat-usage tests 291 / pass 291 / fail 0.
- C6 PASS with a caveat. Evidence log has the two `voice_tool_call` lines (student_memory ok 1809 ms; pathlynks_career_fit unavailable 1700 ms, expected for a synthetic tenant) and the manifest records a voice turn_usage row with 4336 in / 334 out / 0.01149675 USD. The row is not re-queryable by me without touching production Mongo; I accepted the manifest's counts as reported, and they are internally plausible (cost sits between the all-text and all-audio bounds for those counts). `qa/evidence/d140/api.log` is gitignored (`*.log`), so it exists only on disk in this worktree (sha256 e4b72237... matches the brief) and is not in the commit.

## Hostile variants
- Tool that throws: covered (`broken_tool` -> `error`, error text absent from logs); exception still propagates as before.
- Undeclared tool name carrying student text: covered (logs `unknown`, name text absent).
- Fenced/stale personal session, refused student_memory args/fence/revision mismatch: covered, all `unavailable`.
- Timeout: covered at createQuestVoiceTools (`timeout` past 20 s) and via a stubbed tool.
- usageMetadata negative/NaN/string/fractional counts, non-object metadata, all-zero report, malformed modality detail entries, tokenCount garbage: covered (count() accepts only positive safe integers; all-zero emits nothing). Infinity is rejected by the same safe-integer rule (reasoned, not separately tested). Modality detail summing above the prompt total cannot go negative (remainder clamped); detail over-count would be priced as given, not capped (acceptable).
- Unknown model: covered. Usage during crisis mute: covered.
- Usage after close: NOT covered by a test, and by design dropped: `LiveSession.emit` ignores events once `closedFlag` is set, and the row is written once at finalize, so a usage report arriving after close or after finalize is not billed in the row. Real turn shows the final report arrives before close, so this under-reports at most a trailing report. Residual limit, not blocking for a tracking-only, no-cap feature.
- Non-finite or non-positive costUsd from the provider: guarded in voice.ts (`Number.isFinite`, `> 0`).

## Notes (non-blocking)
- Cost is an estimate from published rates, per model table; a new Live model records cost 0 until added.
- Float accumulation of costUsd is plain addition; fine at this scale.
