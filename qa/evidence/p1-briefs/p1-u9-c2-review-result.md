# U9 cycle 2 senior review: BLOCK (one high finding)
## H1 [high]
- **Where:** live.ts:402 (turnComplete) and live.ts:348 (inputTranscript).
- **Defect:** turnComplete calls flushUser(true), which resets crisisFiredForUtterance in the middle of an utterance. The next chunk then hits the guard `muted && !crisisFiredForUtterance` and the mute lifts, so the model's audio is heard with no new student speech.
- **Probe:** inputTranscript("I will kill myself", false) -> emitTurnComplete() -> inputTranscript("because of exams", false) -> model audio. Result: 1 chunk heard, expected 0.
- **Why it matters:** this is the realistic Gemini order. translateGeminiMessage always sends final=false.
- **Fix, and the catch:**
  - Using flushUser(!crisisMute) as in R1 means the Gemini path never resets the flag.
  - A rule for "new student speech" on a path with no final flag is required first.
## L [low]
- **Where:** live.ts:458.
- **Defect:** a second spoken crisis in the same utterance does not re-fire. The probe gave 1 event, where 2 were expected.
- **Fix:** settle this together with H1.
## OK
- interrupted
- toolCall (R1)
- queue cap 256 with the protected pendingCrisisInterrupt
- the double-attach guard
- typed vs spoken
- slice()
- the two changed tests, which are strengthened, not weakened
