# Checker: D-137 voice crisis = chat, crisis follow-ups, walk-3 routing (2026-10-29)

A fresh read-only senior-software-engineer ran this check over the uncommitted diff on top of 560158ac. The main session saved the verdict.

**VERDICT: PASS.** Nothing above low; the ship bar is met.

## L1: voice crisis = chat
- **One constant:** the crisis text exists only in `lang.ts:79,82`. `voice.ts` imports it and holds no copy.
- **Audio:** no audio follows the signal, and model output is muted.
- **Parity with chat:** one escalation, one flag, and the message is sent once. Event order is flag, state, then message. Logs carry no text.
- **Anonymous message:** the anonymous text is chosen correctly (`voice.ts:1289`).
- **Dedupe:** keyed on `t.fixed` (`voice.ts:970`), so a model transcript with identical text is neither suppressed nor double-sent. Proven by reading the code; no test covers it yet.
- **C4b:** the fix is intact.
- **Removed PCM keys:** nothing in src, scripts, docs or deploy files still reads them.

## L2: follow-ups
- **Two crises:** two crises in one session give two blocks; one signal gives one block. When the server sends no message, the block shows the helpline alone.
- **Eval harness:** it now checks the crisis text, with no audio expected.

## L3: routing (`classify.ts` ~:211-219)
- **Positives:** 42 of 43 progress phrasings route correctly. The miss is "I wanna check my status now", the checker's own test phrase.
- **Near-misses:** 0 of 33 leak into progress routing.
- **Regression:** none against HEAD.
- **Speed:** linear; at most 3 ms on a 20k-character input.

## Suites
| Suite | Result |
|---|---|
| providers | 227/227 |
| widget | 128/128 |
| api voice, partner-voice, main, chat | 417/417 |
| engine focused | 250/250 |
| engine evals | 316/316 |

tsc and typecheck are clean for providers, api and engine.

## Low findings
- **Hindi voice crisis (logged as T-061):** voice always sends the English crisis text. Chat matches the student's language (`crisisMessageFor`, `lang.ts:1041-1051`). This is not a regression.
- **Stale `.env` keys:** `VC_VOICE_CRISIS_PCM_FILE` and `VC_VOICE_CRISIS_PCM_SHA256` in the local gitignored `.env` are now unused.

## Test gaps
- A model final whose text equals the crisis message.
- A Hindi or Hinglish voice crisis.
