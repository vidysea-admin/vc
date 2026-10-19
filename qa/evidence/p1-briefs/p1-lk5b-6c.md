# You are /checker running the 6c pre-push check for p1-lk5b (merged into D:/vc main after acfdbb4)
- Protocol C:/Users/Lenovo/.claude/skills/checker/SKILL.md (Mode A, 6c), policy .17 pre-push rules (.13-1 scoped set + one collection check; LK5b is tier M, not a .13-2 trigger: no security/auth/tenancy/prod-write, no lockfile, conftest or runner config change; confirm that with `git diff --stat 6fd8a1d..HEAD -- . ':!qa'`).
- Bound tree: D:/vc main (HEAD = the close-out commit after f53f20c). Last pushed head: origin/main 6fd8a1d. Do NOT push. Never `git add -A`. Never touch .claude/**. Do not edit product code. 
- Tests via `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 1800 <cmd>`, TMP/TEMP on D:. Long lock waits are normal. Never kill PIDs 47984 or 36944, never kill by image name.
## Steps
1. `python contracts/verify_contracts.py`.
2. Behaviour-scoped set: every test file under packages/engine/tests and apps/*/tests that imports from packages/engine/src/student/lang.ts, graph.ts or the engine index exports changed in 6fd8a1d..HEAD (find with git grep), plus lk5, lang, student-graph, claims-guard, crisis-defaults. Run them through the engine/app runner with file args. Mongo-dependent skips are the known baseline.
3. One collection/typecheck pass across all packages: `pnpm -r typecheck` (the TS equivalent of collect-only).
4. Any red: name the owning unit, STOP, no stamp. OOM or disk failure = ENVIRONMENTAL, report, PASS nothing.
5. Green: ensure the tree is clean except untracked files, run `node D:/ai_os/.claude/skills/maker/tools/tick.mjs --stamp-6c-green` in D:/vc. DO NOT COMMIT qa/.6c-green. Write a short verdict qa/verdicts/p1-lk5b-6c.md with Metrics including `prepush_wall_min=<n> tests=<n> mode=scoped shards=1`, commit it with a narrow pathspec.
## Return (max 6 lines)
validator result, scoped files + pass/fail totals, typecheck result, diff-scope line, stamp result, verdict sha.
