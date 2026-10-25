# Checker brief: b22-harness (/checker, Mode A, tier M, single coordinator)
Policy-Version: proportional-verification/2026-10-19.17. Worktree D:/vc/.worktrees/b22-harness, branch wave/b22-harness, head 7ba49ad (code cb4c900), base 852e0e8. Manifest qa/manifests/b22-harness.md (in the worktree), Fix cycle 0, Dual check: no. Brief qa/evidence/p2-briefs/b22-harness.md. Contract B22 in qa/contracts/.

Read-only toward the artifact. Write ONLY qa/verdicts/b22-harness.md on main in D:/vc (`Cycle checked: 0`, Metrics line). Budget M: 5 min target, 10 min hard.

## Prove the outcome, not the construction
- Reuse the builder's runs only after validating identity (.8-2); otherwise rerun `pnpm exec tsx --test evals/h2h.test.ts` and tsc for packages/engine via `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 900 ...` (long lock waits are normal).
- Your own falsification, at least one per criterion, in a copy: rubric absent / synthetic / not by sapna-expert / incomplete walks must each give NOT-YET-MEASURABLE with score null and blocksRelease false; a hostile rubric (a forged author field, extra unknown keys, weights summing to 0, negative weights, NaN) must be refused or stay NOT-YET-MEASURABLE, never a PASS.
- The grader must never see the persona (try passing persona-bearing text).
- A14 head-to-head behaviour unchanged (its 15 tests green, no edits to its logic beyond imports).
- Judge the two [ASSUMPTION]s: record them as PROPOSED-ISSUE lines for Umesh, not a FAIL, unless one contradicts the contract text.
- Confirm no new product file and no live call path.

Verdict: PASS or FAIL with criterion ids; findings as PROPOSED-ISSUE lines. Never edit code, .claude/**, gates or contracts; no python; no git add -A; no push; kill only processes you started. Commit the verdict file only, by name, message ending Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>. Return `VERDICT <PASS|FAIL> <sha>` + max 6 lines.
