# 6c pre-push integration check (policy .17; FULL suite per .13-2(a): lk9 and lk7 are tier-L security units)
You are /checker running the maker step 6c pre-push check, bound to D:/vc (main, HEAD db51d1c). Batch since the last 6c head 8b485a2: p1-a10-diag (merge 95f4481), p1-lk9 (merge 69cff43), p1-lk7 (merge db51d1c; test-file conflict in apps/api/tests/chat-profile.test.ts resolved additively by the maker - check it).
Run, all via `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 1800 <cmd>` (long lock waits normal), TMP/TEMP on D: (e.g. D:/tmp/6c-db51):
1. typecheck every package (pnpm -r typecheck or per package: engine, providers, api, web, db, schemas, observability).
2. full test suite per package (no -x/--maxfail), sequentially, never two at once. Skip files that make live/paid provider calls (engine evals/run-live*), but include them in the collection check.
3. collection check: every test file in every package loads.
If a failure looks like a timing flake (wall-clock assertion, passes alone), rerun only that test alone; at most one full-suite rerun.
If ALL green and `git status --porcelain` is empty: run `node D:/ai_os/.claude/skills/maker/tools/tick.mjs --stamp-6c-green` once and report its output. Do not commit qa/.6c-green. If red: name failing tests + owning merge (intersect with each unit's files), do NOT stamp.
Never push, never merge, never edit product code, never kill processes, never touch .claude/**. Metrics: prepush_wall_min, tests, mode=full.
Report GREEN+stamp line or RED+failures.
