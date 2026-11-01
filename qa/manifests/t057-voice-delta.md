# Manifest: t057-voice-delta

Status: checked-PASS (verdict e2f01472)
Fix cycle: 0
Policy-Version: proportional-verification/2026-10-19.17
Tier: S (one widget product file plus the T-057 walk harness; no API, no security/auth/data write)
Dual check: no (no security/auth/tenancy/prod-write trigger)
Base: ef94d8a4
Candidate: 79cc922f (commits 65f5279d + 79cc922f)
Source: plan step "voice reply length" (walk 7c/7d/8 C10 showed reply=4-12ch). An investigation found that partials are delta chunks: packages/providers/src/live.ts:446 and :457 emit only the newest chunk, and apps/api/src/voice.ts:1226 relays it unchanged. The panel replaced the line with each chunk.

## Acceptance criteria
- V1: While the counsellor or the student speaks, the live line shows every partial chunk so far, joined the way live.ts joins its buffers (space plus trim). The final line replaces the live line exactly once, and a new turn starts a new line. This holds for both roles.
- V2: A spoken answer to a confirm prompt that gets no transcript.final (voice.ts:999-1009) is closed by the next confirm prompt, so later words start their own line and are never glued on.
- V3: The live buffers reset on every existing reset path: final, clearHistory (vc-widget.js:611), ended/teardown (around line 984).
- V4 (harness): the walk's voice step reads the reply after the turn has finished (6 s stable, then a re-read after the mic stops). The C5 citation check counts only the reply bubble, or the captured response when there is one.

## Changed files
- apps/widget/src/vc-widget.js
- apps/widget/tests/floater.test.js
- qa/.delivery/requests/t057-walk.mjs

Tests[V1,V2,V3]: cd apps/widget && npm test

Pre-check[V1]: 79cc922f node --test tests/floater.test.js ("t057 run8 voice: partial transcripts are delta chunks") -> pass
Pre-check[V2]: 79cc922f node --test tests/floater.test.js ("t057 run8 voice: a spoken confirm answer...") -> pass
Pre-check[V3]: 79cc922f npm test (apps/widget) -> pass 131 fail 0
Pre-check[V4]: 79cc922f node --check qa/.delivery/requests/t057-walk.mjs -> ok (live headed walk is run 8b)

## Falsification
- V1: the delta test was written first and was red on 65f5279d^ (it showed only the newest chunk), then green.
- V2: the confirm test was red before 79cc922f ("the unanswered line keeps what was said"), then green.

## Review
senior-software-engineer on 65f5279d: Warning.
- M: the confirm-answer path leaves the user live line open. Fixed in 79cc922f (V2).
- L-M: the walk citation DOM fallback was scoped to the parent. Fixed in 79cc922f (V4).
- Open question, not fixed: a partial and a final can arrive out of order across outputChain and sinkChain (voice.ts:953 versus :991). This is pre-existing, and append mode changes only the symptom. Recorded as a residual.

## Metrics
builder_min=30
