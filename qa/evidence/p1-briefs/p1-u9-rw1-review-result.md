# Senior review result: U9 rewritten-brief repair (f42740e..da32f8a), 2026-10-19

VERDICT: Approve. No critical, high or medium findings.

- H1 closed. The mute lifts only in inputTranscript, behind `crisisTurnEnded && gapMs >= crisisResumeGapMs` (live.ts:373-381). turnComplete (live.ts:437), toolCall and final transcripts use `flushUser(!this.crisisMute)`. interrupted only arms crisisTurnEnded. Output audio/transcript is dropped while muted, and the lift is synchronous. Does not depend on the Gemini final flag.
- Low fixed without double-firing. The lift chunk calls flushUser(true) before appending. fireCrisis resets crisisTurnEnded (live.ts:526).
- No new leak path, race, unbounded state or clock misuse. The injected monotonicNow is separate from now, and the constructor rejects -1/NaN/Infinity.
- Checks: live.test.ts 70/70; tsc clean; 10 hostile probes pass (150 pass combined); 9 mutants, 5 caught (M1-M4, M6), 4 survived (M5, M7, M8, M9).

## Test gaps (low)
- M7: no test that `interrupted` alone (no turnComplete) arms lift condition 1.
- M5: no test that a second fire (e.g. a typed crisis) after turnComplete re-requires a new turn end.
- M8/M9: no test that a repeated crisis phrase after a toolCall, or after a final=true chunk, in the same utterance does not refire. A failure there would be a helpline double-fire, not a leak.

## Residual risks (record; G-REAL/A10)
- Turn-end ambiguity: turnComplete carries no turn id. A pre-crisis model turn ending just after the crisis arms the lift, so a reply that is still streaming could be heard if the student pauses 1.2 s or more and speaks. Fixing it needs a turn id or a model-audio-idle signal from real Gemini.
- Silence after crisis: with neither turnComplete nor interrupted, the model stays muted indefinitely (fails closed). The student's first reply may be spent arming the lift.
- A mid-sentence pause of 1.2 s or more after a turnComplete counts as new speech (the D-097 trade-off).
