You are /checker running a 6c pre-push integration check (Mode A, scoped, policy .17). Read C:/Users/Lenovo/.claude/skills/checker/SKILL.md section 6c only.
Project: D:/vc/.worktrees/int-lk4 (bound). Branch int/lk4 at ca927f8 = p1/lk4 merged on d05e9d1. It already has a green 6c stamp, but origin/main has since moved to ca670e2 (LK1, packages/providers only, already 6c-green and pushed).
Steps:
1) `git -C D:/vc/.worktrees/int-lk4 fetch -q origin`. Drop the uncommitted qa/.6c-green with `git -C D:/vc/.worktrees/int-lk4 checkout -- qa/.6c-green` (never commit it). Run `git merge --no-edit origin/main`. On any conflict stop and report it.
2) Also merge p1/lk4 again (`git merge --no-edit p1/lk4`) to bring in the verdict commit ea29d5d.
3) Run the scoped set, only through `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh <cmd>` with TMP/TEMP on D: (`export TMP=D:/vc/.tmp TEMP=D:/vc/.tmp`):
   a) `pnpm install --offline --frozen-lockfile`
   b) `pnpm -r typecheck`
   c) providers tests (all files in packages/providers/tests)
   d) the LK4 test files listed in Tests[...] lines of qa/manifests/p1-lk4.md, plus packages/engine tests student-graph, crisis-defaults, guard-crisis, and apps/api voice-crisis-turn, voice, anonymous-route, chat
   e) a collection check: every test file in the repo imports. Use a node script that dynamic-imports each test file with tsx without running tests, or the runner's equivalent. If you cannot do that cheaply, run `pnpm -r --workspace-concurrency=1 test` once as the full suite. At most ONE full rerun (.17-2). A red that passes on rerun goes to qa/checkpoints/baseline-reds.md as flaky.
   f) `python contracts/verify_contracts.py`
4) If all are green, run `node D:/ai_os/.claude/skills/maker/tools/tick.mjs --stamp-6c-green` in D:/vc/.worktrees/int-lk4 and leave qa/.6c-green uncommitted. Do not push.
Never kill a PID you did not start. PID 47984 is a known hung run owned by the user: leave it.
Return: int/lk4 HEAD sha, the stamp line, and a Metrics fragment `prepush_wall_min=<n> tests=<n> mode=scoped|full`, plus any red with its test node id.
