# 6c pre-push re-run (policy .17-2: the one allowed rerun after a red), bound to D:/vc (main, HEAD e4f151b)
You are /checker running maker step 6c. The previous full 6c on d436e90 was red on exactly one test, apps/api/tests/go-live-gate.test.ts (the stale real-repo A20 assertion). Every other package was green on that same tree: db 289, engine 1763 (+45 skipped), observability 59, providers 188, schemas 98, web 44, student-profile 12, university-kb 77. typecheck rc=0.
The only change since d436e90 is the merge of wave/golive-a20, which touches apps/api/tests/go-live-gate.test.ts and qa/ files only. Verify this yourself with `git diff --stat d436e90..HEAD`. If any other non-qa file changed, run the full suite of every package instead and say why.
Run every command as `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 1800 <cmd>`, with TMP/TEMP set to D:/tmp/6c-e4f151b:
1. `pnpm -C apps/api typecheck`
2. The full apps/api suite: `pnpm -C D:/vc/apps/api test`, with no -x.
3. Collection check: every apps/api test file loads.
If ALL is green and `git status --porcelain` shows only qa/.6c-green, qa/.last-tick, qa/issues.jsonl, .codex/ and AGENTS.md: run `node D:/ai_os/.claude/skills/maker/tools/tick.mjs --stamp-6c-green` once and report its output verbatim. Do not commit qa/.6c-green. If anything is red: name it and do NOT stamp.
Never push or merge, never edit code, never kill processes. Metrics: prepush_wall_min, tests, mode=scoped-rerun.
Report GREEN plus the stamp line, or RED plus the failures.
