# Build brief: b22-harness (/maker build subagent, tier M, single check)
Policy-Version: proportional-verification/2026-10-19.17. Contract B22 (qa/contracts/, approved in qa/gates/plan-approved.md:14-16): golden-session novice-vs-expert eval harness; case set = T-009 golden sessions (anonymised fixtures already in the repo); rubric grader; result NOT-YET-MEASURABLE until Sapna ma'am's reference rubric exists. This is not the P1 B22-S head-to-head (h2h.ts, A14), which exists and must stay green.

Workspace: worktree D:/vc/.worktrees/b22-harness, branch wave/b22-harness from main HEAD; node_modules via a junction to D:/vc/node_modules only.

Scope: extend packages/engine/evals/report.ts and/or h2h.ts IN PLACE (cite file:line per edit) plus their existing tests. Do NOT create a new product module; if the grader genuinely cannot live in an existing evals file, stop and return BLOCKED-NEW-FILE <proposed path> <why>. The rubric is a TS type only; you author no rubric content (Goodhart, ISS-081). With no reference rubric the harness must report NOT-YET-MEASURABLE, never a score. Deterministic mock/rule providers only (no live provider calls; g-real is per-run and not granted).

Manifest qa/manifests/b22-harness.md (in the worktree): criteria verbatim, Pre-check[<id>] lines, one falsification per criterion in a copy, Tests[] lines, `Dual check: no` (no auth/tenancy/prod-write). Tests via `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 900 pnpm exec tsx --test <files>` (long lock waits are normal), plus tsc for packages/engine. Lint with tick.mjs --lint-manifest; set Status: ready-for-check when green.

Never: python, live calls, Mongo, .claude/**, qa/contracts, qa/gates, qa/verdicts, qa/issues.jsonl, git add -A, push, killing processes you did not start. Commit by pathspec, message ending Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>. Return `READY b22-harness <sha>` + 5 lines.
