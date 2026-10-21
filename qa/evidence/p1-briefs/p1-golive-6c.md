# 6c pre-push integration check (policy .17; FULL per .13-2(b): pnpm-lock.yaml changed in golive-launcher)
You are /checker running maker step 6c, bound to D:/vc (main, HEAD d436e90). The batch since the last pushed head dc2bc97:
- golive-student-ui (afd4a6d: apps/student static page)
- golive-json-robust (acafd93: packages/providers parseModelJson, engine concern-classifier retry)
- golive-launcher (1553166: apps/api/src/main.ts, mcp/university-kb source-kind.ts/index.ts, package.json and pnpm-lock.yaml, infra/ubuntu)
- golive-harden (d436e90: infra/ubuntu nginx and README, apps/api main.ts redaction)
Confirm there are no conflict markers: git grep -n '^<<<<<<< \|^>>>>>>> ' -- . ':!node_modules'
Run every command as `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 2400 <cmd>`, with TMP/TEMP set to D:/tmp/6c-d436e90. Long lock waits are normal. If node_modules is stale, first run `pnpm install --offline --frozen-lockfile` in D:/vc.
1. Typecheck every package: `pnpm -r typecheck`.
2. Full suite: the complete test suite of every workspace package that has tests, including packages/engine, packages/providers, apps/api, mcp/university-kb and the rest. Run them sequentially, with no -x and no --maxfail. Skip only the live/paid provider files (engine evals/run-live*).
3. Collection check: every test file in every package loads.
For a timing flake that passes when run alone: rerun that test alone, at most once.
If ALL is green and `git status --porcelain` shows only qa/.6c-green, .codex/ and AGENTS.md (these are pre-existing): run `node D:/ai_os/.claude/skills/maker/tools/tick.mjs --stamp-6c-green` once and report its output. If it refuses because of those untracked files, report the refusal verbatim and do not delete them. Do not commit qa/.6c-green. If anything is red: name the failing tests and the merge that owns them, and do NOT stamp.
Never push or merge, never edit product code, never kill processes, never touch .claude/**. Metrics: prepush_wall_min, tests, mode=full.
Report GREEN plus the stamp line, or RED plus the failures.
