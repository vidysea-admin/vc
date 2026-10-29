# voice-crisis-followups

Follow-ups to the voice-crisis-same-as-chat change (D-137: voice crisis shows the same STUDENT_CRISIS_MESSAGE text as chat, no pre-recorded audio; packages/providers/src/live.ts fireCrisis now emits no audio, LiveCrisisMessage is {text}).
1. The A10 eval harness still expects fixed crisis audio: packages/engine/evals/live-audio.ts:318,390 and run-live.ts:206 check fixedAudio && fixedText. Change the crisis check to: model audio muted after the signal, the final fixed transcript equals the crisis message text, and NO crisis audio. TDD with the existing eval unit tests (hand-built events). Run its tests + tsc for the evals config (pnpm run typecheck in packages/engine covers it).
2. Stale docs/comments: docs/lld.md:100,142 and apps/api/src/index.ts:428,436 still describe the crisis PCM file and hash; update to the text-only behaviour.
3. Widget: a session shows the crisis notice only once; a SECOND crisis in the same voice session renders the fixed message as an ordinary counsellor line. TDD: every crisis signal must render the crisis block (message + helpline) the same way, without duplicating the block for the same signal. Run apps/widget tests (node --test "tests/*.test.js").
Report before/after and files changed.
