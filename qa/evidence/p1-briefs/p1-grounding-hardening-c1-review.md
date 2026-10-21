# Review brief: p1-grounding-hardening fix cycle 1 (senior-software-engineer, read-only)
Worktree D:/vc/.worktrees/p1-grounding-hardening. Review `git diff 7247d5f bc75b12` only.
Focus: (1) packages/providers/src/index.ts GroundingBudget#charge: reserve-before-await, rollback on spend throw, no double-count or leak under concurrency (your earlier "cap race" Warning); (2) apps/api/src/anonymous.ts salted key and the shared no-client-key bucket; (3) packages/engine/src/student/lang.ts regexes for catastrophic backtracking or over-broad matches.
Read-only: no edits, no commits, no test runs that write to the tree. Return Approve / Warning / Block with file:line evidence, as the last line `REVIEW p1-grounding-hardening-c1 <Approve|Warning|Block>`.
