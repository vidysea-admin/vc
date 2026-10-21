# 6c pre-push check (policy .13-1 scoped), bound to D:/vc (main, HEAD 5424862)
You are /checker running maker step 6c. Since the last green stamp (814a286, 428/428) the only change is commit 5424862: qa/gates/p1-u0-amendment-signatures.md (B13 now SIGNED by Umesh) and docs/DECISIONS.md (D-109). No code changed. Verify with `git diff --stat 814a286..HEAD`; if any non-qa, non-docs file changed, run the full apps/api suite instead and say why.
The behaviour this change flips: the real-repo A20 go-live gate now ALLOWS student-routes, and apps/api/tests/go-live-gate.test.ts guards its real-gate refusal assertions with REAL_B13_PENDING.
Run every command as `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 1800 <cmd>`, with TMP/TEMP set to D:/tmp/6c-5424862:
1. `pnpm -C D:/vc/apps/api exec node --test --import tsx tests/go-live-gate.test.ts` (or the package's own runner for that one file) -> all green.
2. `pnpm -C D:/vc/apps/api go-live-gate student-routes --gates-dir ../../qa/gates` -> prints ALLOWED, exit 0.
3. `pnpm -C D:/vc/apps/api typecheck` -> rc 0.
4. Collection check: every apps/api test file loads.
If ALL green and `git status --porcelain` shows only qa/.6c-green and qa/.last-tick: run `node D:/ai_os/.claude/skills/maker/tools/tick.mjs --stamp-6c-green` once and report its output verbatim. Do not commit qa/.6c-green. If anything is red, name it and do NOT stamp.
Never push or merge, never edit code, never kill processes. Metrics: prepush_wall_min, tests, mode=scoped.
Report GREEN plus the stamp line, or RED plus the failures.
