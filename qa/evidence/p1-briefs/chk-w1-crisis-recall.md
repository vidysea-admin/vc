# Checker brief: w1-crisis-recall (/checker, Mode A, single coordinator)

Policy-Version: proportional-verification/2026-10-19.17. Tier L (student crisis-safety guard). Dual check: no (no auth/tenancy/prod-write).

## Unit facts
- Worktree D:/vc/.worktrees/w1-crisis-recall, branch wave/w1-crisis-recall, base da2faad. Code 750bff6, manifest 2738e1a.
- Manifest qa/manifests/w1-crisis-recall.md (in the worktree), Fix cycle 0. Brief: qa/evidence/p1-briefs/w1-crisis-recall.md (R1-R3).
- Changed: packages/engine/src/guards/crisis.ts, tests/guard-crisis.test.ts, tests/crisis-eval.test.ts (HELDOUT_BASELINE raised 12/28 -> 14/28).

## Rules
- Read-only toward the artifact. Write ONLY qa/verdicts/w1-crisis-recall.md on main in D:/vc, `Cycle checked: 0`, commit by name (no `git add -A`), message ends `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Tests only via `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 900 pnpm exec tsx --test [--test-name-pattern=...] <file>` from the package dir; long lock waits are normal. No full suite, no live LLM/Gemini calls, never `python -`. Never edit .claude/**. Kill only PIDs you started; leave 36452 and 23868.
- The crisis reply text (LK10) and routeBeforeGeneration must be unchanged: verify with git diff.

## Judge
- R1: the builder reports held-out recall 12/28 -> 14/28 (bar 0.95 not reached) and says the 14 remaining misses are new phrase families, not Hindi/Hinglish/English spelling variants. Re-measure both numbers yourself. Read every remaining miss and decide whether each is a variant the brief required fixing; any missed variant within R2/R3 scope = FAIL R1. Also judge the builder's admission that it tuned on 2 held-out abuse rows and raised HELDOUT_BASELINE: ISS-t-012-rev-4 says not to tune on the held-out set. Decide whether this contaminates the measure (FAIL R1, or a PROPOSED-ISSUE requiring a fresh held-out slice); explain.
- R2: write your OWN Tamil and Bengali crisis phrases (>=5 each) and >=10 benign sentences per script, including idioms ("die laughing", "don't die"); report flags.
- R3: the named variants (maarna hai, maarna h, mrna hai, k ms, mar jana h, kmss, wanna kmsss) flag; your own benign probe for over-match ("mRNA hai kya", "k ms meeting", "want 2 diet"); confirm 0 drops on the 280-row grid and the 0/71 benign Devanagari claim (the builder could not find that list; say what you used).
- Regression: guard-crisis, crisis-eval, crisis-defaults, apps/api chat, voice-crisis-turn, anonymous-zero-persistence, tsc --noEmit for packages/engine.
- One falsification per criterion in a copy outside D:/vc, green-before/red-after.

## Return
`VERDICT <PASS|FAIL> <sha>` plus at most 6 lines.
