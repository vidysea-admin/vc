# golive-json-robust — tolerate fenced / unquoted-key JSON from the litellm path; retry one malformed reply in the safety classifier

Status: checked-PASS (qa/verdicts/golive-json-robust.md, 1edda6a, cycle 0)
Fix cycle: 0
Policy-Version: proportional-verification/2026-10-19.17
Tier: M (shared provider module, safety path); one checker later
Bound root: D:/vc/.worktrees/golive-json-robust (branch wave/golive-json-robust, base main 5305e82)
Brief: qa/evidence/p1-briefs/golive-json-robust.md
Touched: packages/providers/src/index.ts (new private parseModelJson, used by LiteLlmProvider.generate); packages/engine/src/guards/concern-classifier.ts (classifyConcern retry + errorName whitelist); tests packages/providers/tests/litellm.test.ts, packages/engine/tests/concern-classifier.test.ts. apps/api and mcp/ untouched.

## Change
C1 packages/providers/src/index.ts parseModelJson (called from LiteLlmProvider.generate where bare JSON.parse was): strip one leading ``` / ```lang fence and one trailing ```, trim, JSON.parse; on failure quote bare identifier keys with the brief's regex but ONLY outside string literals (content is split on string literals; odd segments are never touched), parse once more; else the same LiteLlmMalformedResponseError. Zod schema validation after it is unchanged.
C2 packages/engine/src/guards/concern-classifier.ts classifyConcern: on an error named LiteLlmMalformedResponseError the provider call is repeated ONCE (same input, same abort signal, same overall deadline race); any other error, and a second malformed reply, goes to the unchanged unavailable annotation (safetyScreen then returns possible/unavailable, fail closed). LiteLlmMalformedResponseError added to the errorName whitelist so it is recorded. No budget/cost accounting exists in classifyConcern (grep budget|cost finds comments only), so none was adjusted.

Deviation from the brief, deliberate: the brief's regex applied to the whole text would corrupt a string value such as "see, note: this" (it would become "see, \"note\": this"). The regex is applied only outside string literals; test below proves a colon inside a value survives.

## Pre-check (builder, worktree, node:test via tsx)
Pre-check: red first (src reverted to base): packages/providers/tests/litellm.test.ts 19 tests, 14 pass, 5 fail (the 5 new fence/unquoted/in-string/schema tests); packages/engine/tests/concern-classifier.test.ts 27 tests, 24 pass, 3 fail (the 3 new retry/fail-closed tests).
Pre-check: green after fix, both files restored from the same working copy.

## Tests
Tests: `npx tsx --test tests/litellm.test.ts` (packages/providers): tests 19, pass 19, fail 0. New: fenced ```json parses; bare ``` fence parses; unquoted keys parse; colon inside a string value survives the repair; garbage / fenced garbage / `{answer: }` still throw LiteLlmMalformedResponseError; repaired-but-wrong-shape is still ModelOutputSchemaError.
Tests: `npx tsx --test tests/concern-classifier.test.ts` (packages/engine): tests 27, pass 27, fail 0. New: malformed then valid -> classified with exactly 2 calls; malformed twice -> unavailable, errorName LiteLlmMalformedResponseError, exactly 2 calls (bounded); safetyScreen malformed twice -> {possible, unavailable, LiteLlmMalformedResponseError}, never clear, and malformed once -> classified critical; a LiteLlmHttpError is NOT retried (1 call).
Tests: neighbours: packages/providers `tests/*.test.ts` 188/188 pass; engine concern-classifier.test.ts + lk5.test.ts (the other safetyScreen/classifyConcern user) 92/92 pass.
Tests: `pnpm -C packages/providers typecheck` exit 0; `pnpm -C packages/engine typecheck` exit 0.

## Live (synthetic text only; D:/vc/.env OLLAMA_API_KEY read in-process, never printed)
probe: 2026-10-21T15:50:41+05:30 one safetyScreen call, provider LiteLlmProvider base https://ollama.com/v1 model deepseek-v4.1-flash, text "I don't want to live anymore": {possible, classified, severity high}, 3457 ms; raw content shape plain-json.
live: 2026-10-21T15:51:02+05:30 six safetyScreen calls, same text: 6/6 {possible, basis classified} (severity high x2, critical x4); unavailable 0 of 6. A fetch wrapper logged the raw reply shape of each HTTP call (no headers/key): plain-json x3, non-plain-json (fenced or unquoted-key, loosely classified) x3, and there were exactly 6 HTTP calls for 6 screens, so the three non-plain replies were handled by the new parser without needing the retry. Before the fix the brief records ~25% of such calls falling to unavailable. The probe script was a scratch file and is deleted, not committed.

## Falsification (one per criterion; src reverted to base in the same worktree, then restored from a scratchpad copy)
C1 revert providers/src/index.ts: fence, bare-fence, unquoted-keys, in-string-colon, repaired-schema tests FAIL (5 of 19). Restored: 19/19.
C2 revert concern-classifier.ts: retry-once, bounded-twice (errorName falls to "Error"), safetyScreen-retry tests FAIL (3 of 27). Restored: 27/27.
Not mutation-tested: the "other errors are not retried" and "garbage still throws" controls pass on both base and fix by design (they pin unchanged behaviour).

## Metrics
Live unavailable rate on synthetic crisis text: 0/6 after fix (brief: ~25% before). Added provider-side cost: none. Added classifier cost: at most one extra provider call, only after a malformed reply.

## Open risks
- Live n=6 is small; the 25% figure is the screen-verify agent's, not re-measured here on base.
- The retry shares the original timeoutMs deadline: a slow first attempt leaves little time for the retry, which then times out to unavailable (fail closed, safe).
- Unquoted-key repair does not handle single-quoted strings, trailing commas, or comments; those still throw and fall to the retry then fail-closed.

Format-fixup: lint gaps (no-pre-check, no-test-selection, live-before-fake, no Metrics line) noted at close-out; checker re-ran all product checks itself (verdict 1edda6a). (1)
