You are /checker running a 6c pre-push integration check (Mode A, scoped, policy .17). Read only section 6c of C:/Users/Lenovo/.claude/skills/checker/SKILL.md.

Project: D:/vc/.worktrees/int-lk6 (bound). Branch int/lk6 was created from local main 5d5df6f, which contains origin/main 0b4f4fe (LK1, LK4 and LK1w, all 6c-green and pushed) plus docs-only qa commits.

Steps:
1) Run `git -C D:/vc/.worktrees/int-lk6 merge --no-edit p1/lk6`. If there is a conflict, stop and report it.
2) Run the scoped set. Every command goes only through `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh <cmd>`, with `export TMP=D:/vc/.tmp TEMP=D:/vc/.tmp`. Wrap each run in `timeout 900` and never pipe it.
   a) `pnpm install --offline --frozen-lockfile`
   b) `pnpm -r typecheck`
   c) All test files in packages/providers/tests.
   d) Run one file at a time: engine tests student-fact-extractor, scribe, scribe-per-fact, scribe-concern, student-graph; db tests student-store, chat-threads, db-scope; apps/api tests chat-profile, chat, voice, voice-wiring, index, server.
   e) Exactly ONE full run, `pnpm -r --workspace-concurrency=1 test`, as the collection check. A red that passes on rerun goes to qa/checkpoints/baseline-reds.md as flaky. Allow at most one rerun.
   f) `python contracts/verify_contracts.py`
3) If everything is green, run `node D:/ai_os/.claude/skills/maker/tools/tick.mjs --stamp-6c-green` in D:/vc/.worktrees/int-lk6. Leave qa/.6c-green uncommitted. Do not push.

Never kill a PID you did not start. PID 47984 is a known hung run owned by the user; leave it alone. Lock waits are long and normal.

Return:
- the int/lk6 HEAD sha;
- the stamp line;
- a Metrics fragment `prepush_wall_min=<n> tests=<n> mode=scoped+full-collection`;
- any red, with its test node id.
