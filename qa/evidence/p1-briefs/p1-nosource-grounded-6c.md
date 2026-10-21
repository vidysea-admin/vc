# 6c pre-push check (policy .13-1 scoped), bound to D:/vc (main, HEAD b115986)
You are /checker running maker step 6c for the merge of p1-nosource-grounded (checker PASS 25fa7ec, merge 18ef0f9). Code changed since the last pushed head 8d0d529: verify with `git diff --stat 8d0d529..HEAD -- . ':!qa' ':!docs'` (providers, schemas, engine student graph/lang, api anonymous/chat/index/openapi, apps/student/app.js, tests).
Run every command as `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 900 <cmd>` (long lock waits are normal; wait), TMP/TEMP set to D:/tmp/6c-b115986, ONE test file per command:
1. Providers: index test. Schemas: all test files. Engine: student-graph, lk5, crisis-defaults, lang tests.
2. Api: anonymous-zero-persistence, acceptance-student-journey, student-openapi, chat-privacy, chat -> green, except the KNOWN baseline red chat "A20 flag on but gate closed" (B13 signed, D-109). Do NOT run anonymous-route or chat-profile in full (baseline hangs); run anonymous-route with the targeted -t filter the checker used in qa/verdicts/p1-nosource-grounded.md.
3. Typecheck (tsc --noEmit) in providers, schemas, engine, api -> rc 0.
4. Collection check: every apps/api, packages/engine, packages/providers, packages/schemas test file loads (import only).
If ALL green apart from that one named known red, and `git status --porcelain` shows only qa/.6c-green and qa/.last-tick (.codex/ and AGENTS.md are in .git/info/exclude): run `node D:/ai_os/.claude/skills/maker/tools/tick.mjs --stamp-6c-green` once and report its output verbatim. No git stash. Do not commit qa/.6c-green. Any other red or dirty path: name it and do NOT stamp.
Never push or merge, never edit code, never kill processes (never PID 36944, never by image name, never the servers on 8080/8787/3399). Metrics: prepush_wall_min, tests, mode=scoped.
Report GREEN plus the stamp line, or RED plus the failures, in max 8 lines.
