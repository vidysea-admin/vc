# 6c pre-push check, bound to D:/vc (main, HEAD b4ebfb1)
You are /checker running maker step 6c. Last green 6c stamp covered 28dc4ff (tree 1b3c1e7). Since then only wave/golive-b13guard merged (checker PASS f17eafe): apps/api/tests/go-live-gate.test.ts plus qa/ files. Verify with `git diff --stat 28dc4ff..HEAD`; if any other non-qa file changed, run the full suite of every affected package and say why.
Run every command as `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 1800 <cmd>`, with TMP/TEMP set to D:/tmp/6c-b4ebfb1:
1. `pnpm -C apps/api typecheck`
2. The full apps/api suite: `pnpm -C D:/vc/apps/api test`, with no -x.
3. Collection check: every apps/api test file loads.
If ALL is green and `git status --porcelain` shows only qa/.6c-green, qa/.last-tick, qa/issues.jsonl, .codex/ and AGENTS.md: run `node D:/ai_os/.claude/skills/maker/tools/tick.mjs --stamp-6c-green` once and report its output verbatim. If the stamp refuses on a dirty tree, do NOT stash or delete anything; report the refusal and stop (the maker will clear it and resume you). Do not commit qa/.6c-green. If anything is red: name it and do NOT stamp.
Never push or merge, never edit code, never kill processes. Metrics: prepush_wall_min, tests, mode=scoped.
Report GREEN plus the stamp line, or RED plus the failures.
