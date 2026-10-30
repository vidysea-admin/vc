# t060-voice-turn-id - T-060 / D-143 voice readout attribution by provider turn id

Status: ready-for-check
Fix cycle: 0
Policy-Version: proportional-verification/2026-10-19.17
Tier: M (provider + api voice path)
Contract: task acceptance C1, C2 (no qa/contracts file; the criteria are the unit task's)
Round: est 30 min (1)
Worktree: D:/vc/.worktrees/vc-completion/.worktrees/t060-voice-turn-id, branch wave/t060-voice-turn-id, base 66eef499, code commit 7242a9b7
Authority: D-143 (Changes-authorized: apps/api/src/voice.ts readout attribution path, packages/providers/src/live.ts turn id, their tests only)

## What changed (all additive; nothing deleted or renamed)

- packages/providers/src/live.ts
  - `LiveEvent` audio / transcript / interrupted / turn_complete gain optional `turnId`.
  - `LiveBackend.sendText` may return the provider turn id of the model turn that answers the text; `LiveSession.sendText` returns it (`string | undefined`; a crisis text returns undefined, the model is not prompted).
  - `LiveBackendSink.outputTranscript / outputAudio / turnComplete / interrupted` take an optional trailing `turnId`; `LiveSession` stamps it on the emitted event (key absent when the transport gave none, helper `turnIdField`).
  - `MockLiveBackend`: `textTurnId` hook (what sendText returns) and optional `turnId` arg on `emitOutputTranscript / emitOutputAudio / emitTurnComplete / emitInterrupted`.
- apps/api/src/voice.ts (readout-attribution path only; crisis-message path untouched)
  - `Conn.readoutTurnId`, set from `session.sendText(...)` at both readout dispatch sites (fact prompt, repeat after ambiguous answer), cleared when the readout is done.
  - `readoutOwnsOutput(c, turnId)` (new tiny helper, used by the audio and partial-transcript cases): by id when both the readout and the output carry one, else the existing S13 arrival rule.
  - `turn_complete` case: when both ids exist, a turn_complete of another turn is "an earlier/other turn" (does not arm); otherwise the S13 `readoutEarlierTurnOpen` rule exactly as before.
- Tests (new files only): packages/providers/tests/live-turn-id.test.ts (3), apps/api/tests/voice-readout-turn.test.ts (3).

## Tests and pre-checks

Tests[C1]: apps/api/tests/voice-readout-turn.test.ts "T-060 C1: a reply whose first output arrives after the readout dispatch is its own turn, so it does not arm the yes/no"; packages/providers/tests/live-turn-id.test.ts "T-060 C1: model output and turn_complete carry the provider turn id; sendText returns the id of the turn that answers it" — the first drives a fake Live session whose reply output arrives after the readout dispatch and asserts it neither arms the yes/no nor decides, while the readout's own turn does; the second asserts the provider layer stamps and returns the id.
Tests[C2]: apps/api/tests/voice-readout-turn.test.ts "T-060 C2: with matching turn ids an ordinary readout ..." and "... fall back to arrival order"; packages/providers/tests/live-turn-id.test.ts "T-060 C2" x2; existing apps/api/tests/voice-history.test.ts S13 fix-b/c2/c3b/c4b and apps/api/tests/voice-usage.test.ts, packages/providers/tests/live.test.ts D-140 usage — they import the changed readout and event code and pin the unchanged attribution and usage.

Pre-check[C1]: 7242a9b7 `cd apps/api && npx tsx --test tests/voice-readout-turn.test.ts` -> green: tests 3, pass 3, 0 failures
Pre-check[C1]: 7242a9b7 `cd packages/providers && npx tsx --test tests/live-turn-id.test.ts tests/live.test.ts` -> green: tests 86, pass 86, 0 failures
Pre-check[C2]: 7242a9b7 `cd apps/api && npx tsx --test tests/voice-readout-turn.test.ts tests/voice-history.test.ts tests/voice-usage.test.ts` -> green: tests 35, pass 35, 0 failures
Pre-check[C2]: 7242a9b7 `cd apps/api && npx tsx --test tests/voice.test.ts tests/voice-audit.test.ts tests/voice-crisis-turn.test.ts tests/partner-voice.test.ts tests/voice-limits.test.ts tests/voice-wiring.test.ts` -> green: tests 160, pass 160, 0 failures
Pre-check[C2]: 7242a9b7 `npx tsc --noEmit -p .` in packages/providers and apps/api -> exit 0 (no output)

## Capability coverage (one falsification per criterion, throwaway copy outside the worktree)

| Criterion | Falsification | Result |
|---|---|---|
| C1 late reply attributed to its own turn | base 66eef499 in throwaway worktree, new test copied in | red line below |
| C2 ordinary readout/reply keep attribution | throwaway copy of the change with `readoutOwnsOutput` legacy fallback mutated to `return false` | red line below |

```
RED C1 (base): not ok T-060 C1: a reply whose first output arrives after the readout dispatch is its own turn ... Error: timed out waiting for: early yes recorded as plain speech | pass 2 | fail 1
GREEN C1 (7242a9b7): ok T-060 C1: a reply whose first output arrives after the readout dispatch is its own turn, so it does not arm the yes/no | tests 35 | pass 35 | fail 0
RED C2 (mutated copy): voice-history.test.ts: S12 yes/no, S13 fix-b, fix-c2, fix-c3b x2, fix-c3b interrupted, fix-c4b all FAIL (timeout) | pass 20
GREEN C2 (7242a9b7): voice-history.test.ts pass 27 | fail 0 (in the 35 above)
```

## Notes for the checker
- The Gemini wire protocol has no turn id field that this code can rely on, so `translateGeminiMessage` and `GeminiLiveBackend.sendText` supply none (not invented): in production the id path is inert and the S13 arrival-order rule still decides. The seam, the voice use and tests exist for a transport that reports ids (mock now, Gemini when/if a wire id is available). This is a finding for D-143 review, not hidden.
- Ownership respected: no edit to apps/api/src/index.ts, apps/api/tests/voice-wiring.test.ts, packages/engine/src/student/graph.ts, docs/DECISIONS.md, qa/contracts/, .claude/**. voice.ts crisis-message path untouched.
- CORE-REQUEST: none.

Metrics: suite_runs=0; files changed 4 + manifest; tests added 6; touched-file runs only.
