# Checker brief: w1-cards-b1 (/checker, Mode A, single coordinator)

Policy-Version: proportional-verification/2026-10-19.17. Tier L (student-facing safety classifier; shared guard). Dual check: no (text classifier, no auth/tenancy/prod-write).

## Unit facts
- Worktree D:/vc/.worktrees/w1-cards-b1, branch wave/w1-cards-b1, base da2faad (main's T-049 cards code, fe0937e / D-079).
- Code commit 27f5418; manifest commit 43570c7.
- Manifest: qa/manifests/w1-cards-b1.md (in the worktree), Fix cycle 0.
- Brief: qa/evidence/p1-briefs/w1-cards-b1-rescope.md (criteria K1, K2) plus qa/evidence/p1-briefs/w1-common-rules.md.
- Changed: packages/schemas/src/guards.ts, packages/engine/src/cards/verifier.ts, their tests, qa/evidence/w1-cards-b1-t010-vs-main.md.

## Rules
- Read-only toward the artifact. Write ONLY qa/verdicts/w1-cards-b1.md on main in D:/vc, `Cycle checked: 0`, commit it by name (no `git add -A`), commit message ends `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Tests only via `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 900 pnpm exec tsx --test [--test-name-pattern=...] <file>`; long lock waits are normal. apps/web tests run from apps/web.
- No full suite. No live LLM/Gemini calls. Never edit .claude/**. Kill only PIDs you started; leave 36452 and 23868.

## Prove the outcome
- K1: spot-check 4 of the 13 lines (at least one ON-MAIN, one PARTIAL, one MISSING) against `git show wave/t-010-live-cards:<path>` and main's file:line. Wrong classification = FAIL K1.
- K2: write your OWN hostile set (not the builder's): at least 10 imperatives ending in "?" (English + Hinglish, including coordinated imperatives, "please ..."-led, and Devanagari) must be rejected for question types; at least 8 genuine questions (incl. Hinglish with kya/kaise/kyun, and tag questions) accepted. Report the leak rate. The builder disclosed 2 residual leaks ("Question parents about fees?", "Position scholarships as the main route?") and a new fail-closed drop ("Course decide ho gaya?"): judge whether these breach K2's wording; residual homograph leaks behind the mandatory semantic verifier are a PROPOSED low/medium row, not a FAIL, unless a common phrasing leaks.
- Regression: cards-verifier, cards-eval (62/62), guards + card tests, apps/web ui.test.tsx and new-session-ui.test.tsx, tsc --noEmit for packages/schemas and packages/engine.
- One falsification per criterion in a copy outside D:/vc (scratchpad), green-before/red-after on a named test.
- Confirm no edit outside the allowed paths (guards.ts QUESTION_TYPES check, packages/engine/src/cards/**, tests, the K1 evidence file, the manifest).

## Return
`VERDICT <PASS|FAIL> <sha>` plus at most 6 lines.
