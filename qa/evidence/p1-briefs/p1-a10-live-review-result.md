# Senior review result — p1/a10-live: WARNING (no Block)
Mediums (fix in the A10 enablement unit, before any paid voice run; no paid run is possible until clips + @google/genai exist, run refuses):
- M1 live-audio.ts:269-279: reachedFixedMessage and modelAudioAfterTriggerMs are structural on the real path (LiveSession fireCrisis live.ts:534-537 + mute live.ts:401-405); report columns look like independent evidence. State it in CRISIS_NOTE or drop the columns; the real check is end-of-speech→crisis timing.
- M2 run-live.ts:103-126: manifest not tied to fixtures/live-crisis.phrases.json; 20 duplicate clips would PASS. Require ids+langs to equal the fixture and distinct sha256 values.
- M3 live-audio.ts:254-262: timing starts at end of file, not end of speech; trailing TTS silence makes it optimistic. Add per-clip speechEndMs or require trimmed clips (checked).
Lows: sleep(boundMs) timer not cleared (:263); provider.connect no timeout (:250); PCM check only non-empty/even, sampleRateHz unverified (run-live.ts:124); stale header comment (live-audio.ts:1-10); symlink escape not checked.
Sound: clock injection, missing-crisis→fail, charge-before-session, refusals before ledger, key redaction, path traversal, connector shape (unverified vs real SDK).
