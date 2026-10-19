# Integration view for A16 and A17 (throwaway)
`git worktree add --detach D:/vc/.worktrees/p1-u12-int 1c9fafb`, then `git merge p1/u6b` (fce8f83) and `git merge p1/u11` (06469b6): both clean, result `7eab007` (detached, not a branch, never pushed). `pnpm install --offline --frozen-lockfile` exit 0.
Results: `tests/rank.test.ts evals/coverage.test.ts` 55 tests, 55 pass; `pnpm -C packages/engine coverage -- --out <tmp>` exit 0 (report written); `pnpm -C apps/api test` 293 tests, 293 pass. Raw output: `runs/integration-*.txt`.
