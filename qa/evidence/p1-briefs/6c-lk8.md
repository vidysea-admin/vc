# 6c pre-push integration check for main @ 71d5376 (merge of p1/lk8, khudkushi crisis vocab; policy .17 rule .13-1)
You are the 6c checker. In D:/vc main tree (read-only except qa/.6c-green via the tool). Run the behaviour-scoped set: packages/engine guard/crisis tests + every apps/api test file that imports crisisGuard / routeBeforeGeneration, plus one full collection check (test discovery for engine and api, no full run). Use
`VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 600 <cmd>` with TMP/TEMP on D:. Long lock waits are normal. Never kill processes, never touch .claude/**, never push, never commit qa/.6c-green.
On green ONLY: run `node D:/ai_os/.claude/skills/maker/tools/tick.mjs --stamp-6c-green` in D:/vc. Report commands + pass/fail counts + stamp output.
