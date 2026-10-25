# Verdict: w1-cards-b1 (Mode A, single coordinator)

**Cycle checked:** 0
**Checker:** /checker (fresh context), read-only toward the artifact; wrote only this file
**Code tested:** wave/w1-cards-b1 code commit 27f5418 (manifest 43570c7, base da2faad)
**Policy-Version:** proportional-verification/2026-10-19.17
**Overall:** PASS. K1 and K2 each proven by checker-run commands; one PROPOSED low row (homograph imperative + bare-noun object), not a criterion failure.

## K1 (13-line comparison): PASS
13 table rows, tally ON-MAIN 6 / PARTIAL 5 / MISSING 2. T-010 verdict column matches `git show wave/t-010-live-cards:qa/verdicts/t-010-live-cards.md` (cycle 3: met B2 B4 B5 B6 B12 B13 B17 B19 B20 B21; not met B1 B18 B9). Spot-checked 5 against `git show da2faad:<path>`:
- B4 ON-MAIN: graph.ts:111 `addNode(LIVE_CARDS_NODES.consent ...)` exists. Correct.
- B20 ON-MAIN: nodes.ts:98 `checkConcerns` exists. Correct.
- B1 PARTIAL: `liveScriptReason` / `isScriptLike` present on main with the c0..c2 rules. Correct.
- B17 MISSING: `apps/web/src/app` holds only api/{approvals,demo,sessions}, approvals, sessions/new; no cards panel or route. Correct.
- B19 MISSING: `qa/scenarios/` holds only counselling-engine.csv; SC-025 (:26) and SC-053 (:55) still `not-yet-built:T-010`. Correct.
- B12 PARTIAL / B21 PARTIAL: `git grep recordCardFeedback da2faad` no hit; graph.ts has `recordLiveCardFeedback` (:299) and `runLiveCards` (:275); apps/api/src has no cards route. Correct.
Line numbers drift by 0 to 1 only for nodes.ts:196 / relevance.ts:316 (content still matches). No misclassification.

## K2 (imperative ending in "?" never a question card): PASS
My own hostile set (not the builder's), run through `liveScriptReason` / `isScriptLike` at 27f5418:
- Set 1: 24 imperatives ending in "?" (English incl. "Please ...", coordinated, "Go through ...", Hinglish -iye/-ao/dijiye/kijiye/batayein, 2 Devanagari): 0 leaks.
- Set 2 (34 rows, adds set 1 plus homographs and bare-noun objects): 2 leaks = 5.9%: `Question parents about fees?` (clarify) and `Position scholarships as the main route?` (widen). These are exactly the 2 the builder disclosed. Base da2faad leaks the same 2 on my rows (builder's own rows are what base leaked, 17 of 26; head 2 of 26).
- Genuine: 17 rows (wh, aux-inversion, kya/kaise/kyun/kitna, "Course decide ho gaya?" kept). Over-suppressed 4: `She hasn't taken IELTS yet, has she?`, `Canada is on the list already, isn't it?` (English tag questions, same on base, pre-existing), `Aap kaisa mehsoos kar rahi hain?` (same on base), `Budget fix hai na?` (Hinglish tag question with no Hindi interrogative word: NEW fail-closed drop, 1 net regression versus base, in the safe direction).
- Residual judgement: K2 says "never"; the 2 leaks breach the absolute wording on a narrow shape (homograph/-tion verb head + bare-noun object, no determiner). Not a common phrasing; the mandatory semantic verifier (nodes.ts) is behind it. Per brief: PROPOSED row, not FAIL.
- Builder disclosure inaccuracy (minor): manifest says "Course decide ho gaya?" is now dropped; at 27f5418 it is KEPT (no Hinglish marker word in it, so it goes through the English fragment test). Benign direction (a genuine question is shown).

## Regression (bound worktree D:/vc/.worktrees/w1-cards-b1, all via vc-testlock)
- `pnpm exec tsx --test packages/engine/tests/cards-verifier.test.ts cards-eval.test.ts cards-graph.test.ts` -> tests 86, pass 86, fail 0, skipped 0; CARDS-EVAL 62/62.
- `pnpm exec tsx --test packages/schemas/tests/guards.test.ts card.test.ts` -> 32/32 pass.
- apps/web `pnpm exec tsx --test tests/ui.test.tsx tests/new-session-ui.test.tsx` -> 27/27 pass.
- `pnpm exec tsc --noEmit` in packages/schemas and packages/engine -> exit 0 each.
- Builder's targeted run in my copy: `--test-name-pattern="w1-cards-b1|instruction-led|merely contains"` -> 5 tests, 5 pass.

## Falsification (git-archive copy of 27f5418 under the session scratchpad `fc/`, never in D:/vc; baseline 5/5 green)
- guards.ts `return !endsWithQuestion || INSTRUCTION_LEAD.test(trimmed)` -> `return !endsWithQuestion` : 4 pass / 1 fail ("instruction-led prompt is script-like even with a trailing '?'").
- verifier.ts `if (hasVerbObjectJunction(tokens)) return false;` removed : 1 fail, `B1 leak: widen | Plan her intake first?`.
- verifier.ts `if (hinglish && HINGLISH_IMPERATIVE.test(own)) return false;` removed : 1 fail, `B1 leak (Hinglish): clarify | Student ko dikhao ki kitna lagega?`.
- Restored: 5/5 green again.

## Scope
`git diff da2faad 27f5418 --name-only`: packages/engine/src/cards/verifier.ts, packages/engine/tests/cards-verifier.test.ts, packages/schemas/src/guards.ts, packages/schemas/tests/guards.test.ts, qa/evidence/w1-cards-b1-t010-vs-main.md (+ manifest at 43570c7). All inside the allowed paths; nothing in .claude/**, contracts, qa/contracts. Worktree clean.

## Proposed rows (not written to the ledger by this checker run; orchestrator to file)
- LOW/MEDIUM, B1: question-card leak for a homograph/-tion imperative with a bare-noun object: `Question parents about fees?`, `Position scholarships as the main route?` (verifier.ts `isNounPhraseFragment`; hasVerbObjectJunction has no determiner to key on). Defence is the semantic verifier only.
- LOW, B1 over-suppression: tag questions (English and Hinglish `... hai na?`) dropped; only the Hinglish case is new in this unit.
