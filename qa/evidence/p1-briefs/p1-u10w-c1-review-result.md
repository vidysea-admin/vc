# Senior review result: combined U10+U10w voice (8fca003..29962ce, 4371264..8fca003), 2026-10-19
VERDICT: Warning (no Block). voice-crisis-turn 6/6. Full suite not run (C: 0 bytes free: ENVIRONMENTAL risk).
- Queue/alignment (Q1): sound. One detectForConn push per LiveSession fireCrisis record, serial sinkChain (live.ts:496/529/544/606); growth bounded in practice; entries unclamped until consumed (low).
- turnId (Q2): consistent for spoken crises (flushUser before fixed reply, serial chain).
- Shutdown (Q3): sound; worst case ~2x10 s; upgrade refuses 503 once shuttingDown (voice.ts:1394).
- Silent crisis (Q4): only when no escalateForTenant is configured (voice.ts:807); index.ts always supplies it.
- [medium] voice.ts:801-802 redact(c, raw) outside try/catch and before the flag write: a throwing redactPii would lose flag + escalation with only a generic persist_failed. Hardening; throw not proven reachable. Fix: wrap, fall back to VOICE_CRISIS_NO_WORDS_TEXT, text-free log.
- [medium] voice.ts:529-533 + live.ts:386-388: escalated words are userBuf at the first triggering chunk, so they may be a prefix of the crisis utterance (product call).
- [low] index.ts stop(): await voice?.close() without try/finally; a rejection skips HTTP/Mongo close.
- [low] voice.ts:1198, 958-967: lingering/connecting not awaited at shutdown.
- Open question: under real Gemini (final always false) can an unanswered earlier utterance's userBuf carry into the next detection text?
- Test gaps: redactPii throw in onCrisisRecord; >=3 queued crises with stalled escalation; stop() closes DB when voice.close() rejects.
## Disposition (maker)
U10 is at its last cycle (D-099). Wait for both blind verdicts. If dual PASS: merge and push with voice OFF; the two mediums go to the TOP of Candidates as `priority: security` (crisis path) and must be fixed in a hardening unit before A20/voice go-live; lows and gaps become ledger rows.
