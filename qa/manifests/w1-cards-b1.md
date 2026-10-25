# Manifest - w1-cards-b1
Policy-Version: proportional-verification/2026-10-19.17
**Contract:** ISS-t-010-c0-1 (B1, qa/issues.jsonl); briefs qa/evidence/p1-briefs/w1-cards-b1.md and qa/evidence/p1-briefs/w1-cards-b1-rescope.md (criteria K1, K2 verbatim below). Not an edit to qa/contracts.
**Goal task:** none
**Date:** 2026-10-25
**Fix cycle:** 0
**Status:** ready-for-check
**Executor:** claude-sonnet-subagent
**Base:** main da2faad, branch wave/w1-cards-b1, worktree D:/vc/.worktrees/w1-cards-b1, code commit 27f5418.
**Re-scope:** the original K1 (merge wave/t-010-live-cards) hit non-cards conflicts and was returned BLOCKED (apps/api/src/index.ts, apps/api/src/server.ts, apps/api/tests/server.test.ts, apps/web/demo/seed.ts, packages/engine/src/index.ts, packages/engine/tests/loader.test.ts, packages/schemas/src/guards.ts, packages/schemas/src/schemas.ts, skills/exploration-planner/SKILL.md). The orchestrator re-scoped to a read-only comparison (K1) and a B1 fix on main's T-049 code (K2). Nothing from wave/t-010-live-cards was merged or ported.

## Criteria (verbatim from the re-scope brief)
K1 (read-only comparison, no code): write qa/evidence/w1-cards-b1-t010-vs-main.md with one line for each of the 13 T-010 criteria, naming whether main already meets it and the evidence (main file:line or test name), marked ON-MAIN, MISSING or PARTIAL. Port nothing.
K2 (ISS-t-010-c0-1, B1, on main's current code): an imperative or script-like sentence that only ends in "?" is never shown as a question card; the QUESTION_TYPES checks are semantic, not punctuation-only. Allowed edits in place: packages/schemas/src/guards.ts (QUESTION_TYPES and its check) and the cards verifier/nodes under packages/engine/src/cards/**. Tests: at least 10 imperative phrasings ending in "?" are rejected (English and Hinglish); genuine questions are accepted; the existing cards tests stay green.

**Dual check:** no
**Dual-check reason:** not auth, tenancy or prod-write. The diff is four files: the B1 card-text classifier in packages/engine/src/cards/verifier.ts and packages/schemas/src/guards.ts, and their tests. No request authentication, tenant scope, consent, gate or collection write changes.
**Tier:** L (live cards guard).
**Persona walk:** skip (no screen or flow touched)
**Live browser:** Not run (no apps/** file changed)

## What changed (all in place, no new module)
- packages/schemas/src/guards.ts: new exported `INSTRUCTION_VERB_ALTERNATION` and `INSTRUCTION_LEAD` (next to QUESTION_TYPES, :76-90); the QUESTION_TYPES branch of `isScriptLike` now returns `!endsWithQuestion || INSTRUCTION_LEAD.test(trimmed)`, so an instruction-led prompt is script-like even with a "?".
- packages/engine/src/cards/verifier.ts: `INSTRUCTION_VERB` (:130) now aliases the shared export instead of a duplicate list; `WH_WORD` (:315) is split into `WH_CLAUSE_INITIAL` + `WH_ANYWHERE`, and an embedded wh-word counts only when the prompt opens with a function word (`isInterrogativeForm`); new `hasVerbObjectJunction` (structural content-word + object-determiner test) is called from `isNounPhraseFragment`; new `HINGLISH_MARKER` / `HINGLISH_IMPERATIVE` so a Hinglish prompt is a question only on an explicit Hindi interrogative and only if not imperative.
- Tests added (append-only): packages/engine/tests/cards-verifier.test.ts 3 tests (13 English rows, 8 Hinglish rows, 18 genuine rows); packages/schemas/tests/guards.test.ts 2 tests.
- qa/evidence/w1-cards-b1-t010-vs-main.md (K1). pnpm-lock.yaml restored after the offline install, not committed.

## Deviations and residuals the checker should know
1. verifier.ts header says "No new phrase-list repairs": the new rules are structural (verb+object junction, wh clause position, Hinglish postposition/imperative-ending class), not a larger verb list. The one list reused is the 26 instruction verbs, now shared from guards.ts.
2. DISCLOSED RESIDUAL, not fixed: an imperative whose head is a noun/verb homograph or a -tion/-able word AND whose object is a bare noun has no determiner junction. "Question parents about fees?" and "Position scholarships as the main route?" are still shown as widen/clarify (probe: 2 of 26 hostile rows). The mandatory semantic verifier (nodes.ts) is the only defence there.
3. Out of scope and unchanged: statement-card leaks (NON_VERB_OPENERS homographs, coordinated imperatives such as "Nudge and reassure ...", plain Devanagari imperatives), B18 (ISS-t-010-c0-2), indirect requests such as "Why not mention ...?".
4. Hinglish questions with no Hindi interrogative word ("Course decide ho gaya?") are now dropped (fail closed); a question with kya/kab/kitna/kaun etc. is kept.
5. Files are CRLF in the working copy and LF in the index (autocrlf).

## Acceptance evidence
Round: 1 round, 4 code/test files plus 1 evidence file, 2 criteria, est 40 min - diff of 27f5418 vs da2faad
Tests[K1]: qa/evidence/w1-cards-b1-t010-vs-main.md - one table row per T-010 criterion (13), tally ON-MAIN 6, PARTIAL 5, MISSING 2
Pre-check[K1]: 27f5418 `grep -c '^| B' qa/evidence/w1-cards-b1-t010-vs-main.md` -> exit 0, 13 table rows passed; status column ON-MAIN 6, PARTIAL 5, MISSING 2 (13 total), 0 failed
Tests[K2]: cards-verifier.test.ts "w1-cards-b1 / B1: an English imperative ...", "... a Hinglish instruction ...", "... genuine English and Hinglish questions ... stay shown" - 13 English and 8 Hinglish imperatives ending in "?" are dropped by liveScriptReason and verifyCards keeps 0; 18 genuine questions return null; guards.test.ts "widen/clarify/check-in: an instruction-led prompt is script-like ..." and "... merely contains an instruction verb is not flagged"
Pre-check[K2]: 27f5418 `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 900 pnpm exec tsx --test --test-name-pattern="w1-cards-b1|instruction-led|merely contains" packages/engine/tests/cards-verifier.test.ts packages/schemas/tests/guards.test.ts` -> exit 0, 5 tests, 5 passed, 0 failed (3 engine + 2 schemas)
Tests[R1]: packages/engine/tests/cards-verifier.test.ts whole file (existing cards B1/B2/B18 tests unchanged, append-only)
Pre-check[R1]: 27f5418 `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 900 pnpm exec tsx --test packages/engine/tests/cards-verifier.test.ts` -> exit 0, 26 tests, 26 passed, 0 failed, 0 skipped
Tests[R2]: engine cards-eval, cards-graph, guard-no-script, index, loader, scribe-auto-verify-property, scribe-citation-rescope, scribe-concern, scribe-rules-e2e, b18-suppression-outcome
Pre-check[R2]: 27f5418 `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 900 pnpm exec tsx --test packages/engine/tests/cards-eval.test.ts packages/engine/tests/cards-graph.test.ts packages/engine/tests/guard-no-script.test.ts packages/engine/tests/index.test.ts packages/engine/tests/loader.test.ts packages/engine/tests/scribe-auto-verify-property.test.ts packages/engine/tests/scribe-citation-rescope.test.ts packages/engine/tests/scribe-concern.test.ts packages/engine/tests/scribe-rules-e2e.test.ts packages/engine/tests/b18-suppression-outcome.test.ts` -> exit 0, CARDS-EVAL 62/62, 280 tests, 235 passed, 0 failed, 45 skipped (main's pre-existing T-039 skips)
Tests[R3]: packages/schemas/tests/guards.test.ts and card.test.ts whole files; apps/web ui.test.tsx and new-session-ui.test.tsx (consumers of isScriptLike)
Pre-check[R3]: 27f5418 `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 900 pnpm exec tsx --test packages/schemas/tests/guards.test.ts packages/schemas/tests/card.test.ts` -> exit 0, 32 tests, 32 passed, 0 failed; and from apps/web `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 900 pnpm exec tsx --test tests/ui.test.tsx tests/new-session-ui.test.tsx` -> exit 0, 27 tests, 27 passed, 0 failed
Tests[R4]: tsc --noEmit for packages/schemas and packages/engine
Pre-check[R4]: 27f5418 `pnpm exec tsc --noEmit` (packages/schemas, then packages/engine) -> exit 0, no output, 0 errors

TDD red: before the edits the new engine tests failed on `B1 leak: widen | Plan her intake first?` and `B1 leak (Hinglish): widen | Parents ko fees ka breakdown dikhao?`; a 26-row hostile probe showed 17 leaks and 0 over-suppressed; after the edits 2 leaks (the disclosed residual) and 0 over-suppressed of 26 genuine controls.

Falsifications (in a throwaway detached worktree under scratchpad build-w1-cards-b1/fcopy at 27f5418, never in the bound worktree; node_modules were junctions to the bound tree, removed afterwards; baseline of the unmodified copy: 1 of 1 pass):
- K2 English / junction rule: replace `if (hasVerbObjectJunction(tokens)) return false;` with a comment -> `B1 leak: widen | Plan her intake first?` (tests 1, fail 1); restored by git checkout.
- K2 Hinglish: remove `if (hinglish && HINGLISH_IMPERATIVE.test(own)) return false;` -> `B1 leak (Hinglish): clarify | Student ko dikhao ki kitna lagega?` (fail 1); restored.
- K2 wh position: `(FUNCTION_WORD.has(head) && WH_ANYWHERE.test(own))` replaced by `WH_ANYWHERE.test(own)` -> `B1 leak: clarify | Question how much she can afford?` (fail 1); restored.
- K2 schema guard: `return !endsWithQuestion || INSTRUCTION_LEAD.test(trimmed);` replaced by `return !endsWithQuestion;` -> guards.test.ts "instruction-led" fails on `widen` (fail 1); restored.
- K1: a deleted table row changes the `grep -c '^| B'` count from 13; the comparison is a document check, no code lever.

Metrics: 4 code/test files changed (+175 lines, 6 removed), 5 new tests, 1 evidence file, 0 files deleted, 0 tests deleted or weakened. Wall time about 55 min including blocked-lock waits.

**Fix cycle:** 0
**Status:** ready-for-check
