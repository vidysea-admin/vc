# 6c pre-push integration check (policy .17; SCOPED per .13-1: no security/auth/tenancy/prod-write L unit in this batch)
You are /checker running maker step 6c, bound to D:/vc (main, HEAD ddb1028). Batch since last pushed head dca99c6: p1-lk10 language-aware crisis messages (merge 3979595; engine guards/crisis.ts, student/lang.ts, graph.ts, skills/safety-escalation, apps/api anonymous tests), p1-alerts (merge ddb1028; apps/api chat.ts/index.ts, packages/providers index.ts), p1/b13 consent draft (merge 73adbab, docs only; resolved add/add conflict - confirm no conflict markers anywhere: git grep -n '^<<<<<<< \|^>>>>>>> ' -- . ':!node_modules').
If you find any L trigger in the changed non-test files (git diff dca99c6..HEAD --stat) that .13-2 lists, switch to the full suite and say why.
Run via `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 1800 <cmd>` (long lock waits normal), TMP/TEMP on D:/tmp/6c-ddb1028:
1. typecheck every package (engine, providers, api, web, db, schemas, observability).
2. behaviour-scoped set: full test suites of packages/engine, packages/providers, apps/api (no -x/--maxfail), sequentially; skip live/paid provider files (engine evals/run-live*).
3. collection check: every test file in every package loads.
Timing flake (passes alone): rerun that test alone, at most one rerun.
If ALL green and `git status --porcelain` shows only qa/.6c-green / .codex/ / AGENTS.md (pre-existing, not yours): run `node D:/ai_os/.claude/skills/maker/tools/tick.mjs --stamp-6c-green` once and report its output (if it refuses on those untracked files, report the refusal verbatim, do not delete them). Do not commit qa/.6c-green. If red: name failing tests + owning merge, do NOT stamp.
Never push/merge, never edit product code, never kill processes, never touch .claude/**. Metrics: prepush_wall_min, tests, mode=scoped.
Report GREEN+stamp line or RED+failures.
