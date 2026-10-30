# Manifest — voice-inner-caps
**Contract:** D-142 item 1 (voice inner per-read caps; D-139 20 s voice budget)
**Date:** 2026-10-30
**Fix cycle:** 0
Policy-Version: proportional-verification/2026-10-19.17
Tier: M (shared api module, timing)
Round: 1 src hunk + 2 tests, 2 criteria, est 30 min
Branch: wave/voice-inner-caps

## Criteria
- C1: a voice tool call whose inner read takes 8 s (fake provider) returns the student-context answer, not the unavailable message.
- C2: a voice tool call whose read never resolves still returns the existing unavailable message at about 20 s (fake timers); no non-voice cap changes behaviour.

## What changed (edited in place)
- apps/api/src/index.ts:170 createQuestVoiceTools.run: the graph turn now runs on a COPY of the selected deps with pathlynksTimeoutMs = VOICE_TOOL_TIMEOUT_MS (20 s). The outer Promise.race at VOICE_TOOL_TIMEOUT_MS is unchanged, so the tool never waits past 20 s.
- apps/api/tests/voice-wiring.test.ts:166 (C1), :187 (C2): new tests; existing tests untouched.

## Inner caps found in the voice tool path
The only inner read caps are the four sites in packages/engine/src/student/graph.ts that read deps.pathlynksTimeoutMs ?? PATHLYNKS_DEFAULT_TIMEOUT_MS (5 s): Vidysea native list/progress reads (:1454), Vidysea single reads (:1508), Pathlynks port reads (:1535), all via the same field; production deps set it from VC_PATHLYNKS_TIMEOUT_MS or leave it unset (5 s). One field, so one override covers all, with no engine edit (engine is outside Changes-authorized).
- Shared with chat: the field and graph.ts code are shared, but the override is applied to a copy inside the voice tool only. Chat deps (httpSetup/chatSetup) are not mutated, so chat keeps 5 s / VC_PATHLYNKS_TIMEOUT_MS (C2 asserts both).
- Not in the tool path, left unchanged: liveProfile.facts 5 s cap in apps/api/src/index.ts:~934 (feeds voice session-start profileFacts/profileNames and chat, not the tool call); the navCatalogue loader has no cap. LLM-call caps (expertTimeoutMs 20 s, lang/rewrite 1.5-2 s, safety screen) are not reads and are outside this unit.
- Behaviour note: a deploy that sets VC_PATHLYNKS_TIMEOUT_MS lower than 20 s is also overridden for voice only (D-142 asks that a slow read not cut a turn the 20 s budget allows).

Tests[C1]: apps/api/tests/voice-wiring.test.ts "D-142 C1" — 8 s read with pathlynksTimeoutMs unset, over Pathlynks profile, Vidysea single read and Vidysea list read, covers the three graph read sites
Tests[C2]: apps/api/tests/voice-wiring.test.ts "D-142 C2" — never-resolving read is pending at 19 s and unavailable at 20 s, shared deps unmutated, chat runStudentTurn keeps its 5 s cap
Pre-check[C1]: 649403f0 npx tsx --test --test-name-pattern="D-142" tests/voice-wiring.test.ts -> pass 2/2 (C1 8 s read answers with student data)
Pre-check[C2]: 649403f0 npx tsx --test --test-name-pattern="D-142" tests/voice-wiring.test.ts -> pass 2/2 (C2 unavailable at 20 s, chat 5 s kept); full file 24/24 pass, tsc exit 0

## Capability coverage
| Capability | Red (base fa678fb4) | Green (649403f0) |
|---|---|---|
| C1 8 s read answers in voice | "✖ D-142 C1 ... AssertionError: pathlynks_profile actual: {"message":"I can't see your Pathlynks data right now"} expected: /12/" | "✔ D-142 C1: a voice tool whose inner read takes 8 s still answers with the student's data ..." |
| C2 stuck read unavailable at 20 s, not before; chat 5 s unchanged | "✖ D-142 C2 ... still waiting just before 20 s: true !== false" | "✔ D-142 C2: a voice tool whose read never resolves still returns the unavailable message at 20 s (not before) ..." |

Falsification: red-on-base above is the falsification of both criteria (same tests, src reverted). No mutation copy of the C2 chat-5s guard was made; that assertion is green on base and fix by design (guard against regression).
Evidence: this manifest (no separate evidence file)
Metrics: start=2026-10-30T22:54:04+05:30 end=2026-10-30T22:54:04+05:30 wall_min=30 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=0 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17

## Status: ready-for-check
