# Brief: production-like boot smoke (local, synthetic)
You are a /maker build subagent doing a local smoke only. Work in D:/vc (main, HEAD). Do NOT edit or commit any file. Never print API keys or .env values. Kill only PIDs you start (record them); never kill by image name; never kill PID 36944.
Purpose: prove main boots and serves a text turn with the launch config, before the team deploys.
Steps (cheapest first, stop at the first red and report it):
1. `pnpm -r typecheck` (or the repo's typecheck script) -> pass/fail.
2. Read docs/go-live-checklist.md section 1 and apps/api startup (apps/api/src/index.ts) to learn the required env. Start apps/api locally on a free port with the existing D:/vc .env plus: VC_CHAT_ENABLED unset, VC_ANONYMOUS_ENABLED=true, VC_VOICE_ENABLED unset, VC_LLM_PROVIDER=gemini, VC_TEXT_CHAIN=ollama:deepseek-v4.1-flash,ollama:glm-5.3-flash, VC_CHAIN_MONTHLY_CAP_USD=50. If the go-live gate refuses startup because records are missing, report that exact message (it is expected; do not forge records) and instead start in the mode the dev/test scripts use so step 3 can still run.
3. Provider probe: one call per provider (record `probe: <provider> ok|fail`). Then at most 3 live anonymous text turns with SYNTHETIC messages only (e.g. "Which courses suit me if I like biology?", one Hindi line, one mild-distress line "I feel very stressed about exams" to confirm the safety path answers with helpline text). Record status code, latency, which model answered, and whether a crisis/helpline line appeared. No real student data.
4. Stop the server (your PID only).
Return <= 25 lines: typecheck result, boot result (exact refusal message if any), probe lines, 3 turn results, any blocker for deploy.
