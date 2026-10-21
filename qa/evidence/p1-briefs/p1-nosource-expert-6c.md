# 6c pre-push check (policy .13-1 scoped), bound to D:/vc (main, HEAD f730c9b)
You are /checker running maker step 6c for the merge of p1-nosource-expert (checker PASS 9a11ec1). Code changed since the last pushed head aae1b1a: packages/engine/src/student/{graph,lang}.ts, apps/api/src/openapi.ts, plus tests. Verify with `git diff --stat aae1b1a..HEAD -- . ':!qa' ':!docs'`.
Run every command as `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 900 <cmd>` (long lock waits are normal; wait), TMP/TEMP set to D:/tmp/6c-f730c9b, ONE test file per command:
1. Engine: student-graph, lk5, crisis-defaults, lang tests -> all green (expected 195 total).
2. Api: anonymous-zero-persistence, acceptance-student-journey, student-openapi, chat-privacy, chat -> green, except the KNOWN baseline red chat "A20 flag on but gate closed" (B13 signed, D-109; proven red on base 03f475a in qa/verdicts/p1-nosource-expert.md). Do NOT run anonymous-route or chat-profile (known baseline reds that hang to timeout, same verdict).
3. Engine and api typecheck -> rc 0.
4. Collection check: every apps/api and packages/engine test file loads (import only).
If ALL green apart from that one named known red, and `git status --porcelain` shows only qa/.6c-green, qa/.last-tick and the untracked .codex/, AGENTS.md, qa/evidence/p1-briefs/kb-local-probe.md: first `git stash push -u -m 6c-f730c9b -- .codex AGENTS.md`, run `node D:/ai_os/.claude/skills/maker/tools/tick.mjs --stamp-6c-green` once, then `git stash apply` and `git stash drop stash@{0}`; report the stamp output verbatim. Do not commit qa/.6c-green. Any other red: name it and do NOT stamp.
Never push or merge, never edit code, never kill processes (never PID 36944, never by image name). Metrics: prepush_wall_min, tests, mode=scoped.
Report GREEN plus the stamp line, or RED plus the failures, in max 8 lines.
