You are /checker running a 6c pre-push integration check (Mode A, scoped, policy .17). Read only section 6c of C:/Users/Lenovo/.claude/skills/checker/SKILL.md.

Project: D:/vc/.worktrees/int-lk1w (bound). Branch int/lk1w was created from local main 489227f. That commit contains origin/main c001f55 (LK1 plus LK4, both 6c-green and pushed) plus docs-only qa commits.

Steps:
1) Run `git -C D:/vc/.worktrees/int-lk1w merge --no-edit p1/lk1w`. If there is a conflict, stop and report it.
2) Run the scoped set. Every command goes only through `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh <cmd>`, with `export TMP=D:/vc/.tmp TEMP=D:/vc/.tmp`. Wrap each run in `timeout 900` and never pipe it.
   a) `pnpm install --offline --frozen-lockfile`
   b) `pnpm -r typecheck`
   c) All test files in packages/providers/tests.
   d) apps/api tests chat-profile, anonymous-route, index, server, voice-wiring, chat; packages/engine tests concern-classifier, student-graph, lang. Run them one file at a time.
   e) Exactly ONE full run, `pnpm -r --workspace-concurrency=1 test`, as the collection check. A red that passes on rerun goes to qa/checkpoints/baseline-reds.md as flaky. Allow at most one rerun.
   f) `python contracts/verify_contracts.py`
3) If everything is green, run `node D:/ai_os/.claude/skills/maker/tools/tick.mjs --stamp-6c-green` in D:/vc/.worktrees/int-lk1w. Leave qa/.6c-green uncommitted. Do not push.

Never kill a PID you did not start. PID 47984 is a known hung run owned by the user; leave it alone. Lock waits are long and normal.

Return:
- the int/lk1w HEAD sha;
- the stamp line;
- a Metrics fragment `prepush_wall_min=<n> tests=<n> mode=scoped+full-collection`;
- any red, with its test node id.
