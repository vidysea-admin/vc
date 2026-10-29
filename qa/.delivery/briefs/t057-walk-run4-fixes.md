# t057-walk-run4-fixes

Maker fix lane (TDD, edit IN PLACE). Source of truth: qa/evidence/t057/walk-run4-diagnosis.md (source 2). Two fixes, different files:

A) Engine memory bug (real, high): the fact extractor never stores facts. Gemini returns a bare JSON array of facts, but ExtractionSkillOutputSchema (packages/engine/src/scribe/schemas.ts ~95) requires {facts:[...]}, and skills/fact-extraction/SKILL.md:33-35 documents Fact[]. Result "schema-invalid after 2 attempts", swallowed silently, so "I prefer studying in Canada, budget 20 lakh, remember that" is lost.
 - Red test first in the existing scribe/schemas (or extractor) test file: a bare array [{key:'target_country',...}] parses into facts; {facts:[...]} still parses; garbage still rejected; an empty array = no facts (not an error).
 - Fix: in schemas.ts accept both shapes (z.preprocess(v => Array.isArray(v) ? {facts: v} : v, existing object schema)). Do not change SKILL.md wording beyond making it consistent if trivially needed (prefer leaving the skill and accepting both).
 - At packages/engine/src/scribe/nodes.ts ~1339 log the failure reason as a text-free event (event name + reason code + attempt count, never the student text or model output).
 - Run the focused scribe tests + any profile-facts tests that touch this, plus tsc --noEmit for packages/engine.

B) Walk script bugs in qa/.delivery/requests/t057-walk.mjs (test harness, not product):
 - ~279 and ~280: the reply selectors must also count '[data-vc-widget] .log .m.note' (no_sourced_answer notes render as .m.note, vc-widget.js:545-546).
 - ~349: Confirm button match must be name /^Confirm\b/ (aria-label is 'Confirm <key>', vc-widget.js:649), not exact 'Confirm'.
 - ~351: to close/reopen the panel click the panel's close button (button.close) with a 2 s timeout instead of the 'Open chat' bubble whose label is 'Close chat' while open (vc-widget.js:904); then reopen via the bubble. No 60 s waits in a loop.
 - Verify syntax with node --check. Do NOT run the walk (no browser).

Do NOT touch packages/engine/src/student/graph.ts or mcp/university-kb/** (another lane owns them). Do not restart the API. Write qa/evidence/t057/walk-run4-fixes.md (file:line changes, test commands + output). Return <= 15 lines.

