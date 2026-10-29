# t057-fix-kb-latency

Fix the KB latency chain described in qa/evidence/t057/reply-fail-diagnosis.md (source 2). Files you own: packages/engine/src/graph.ts, mcp/university-kb/src/kb-client.ts, the source-kind.ts named in the report, apps/api/src/chat.ts (turn deadline only), and their existing test files.
1. graph.ts ~1350: when /search timed out or errored, do NOT fall back to /ask; go straight to the graceful no-answer path. (Keep /ask fallback for a successful but sub-threshold search.)
2. kb-client.ts ~421/448: keep the abort timer armed until the body (res.json) is read. Cap /ask at ~8 s (~586). Lower the DEFAULT KB timeout to 8000 ms where VC_KB_TIMEOUT_MS is unset; note the .env key name VC_KB_TIMEOUT_MS currently 25000 — report it, do not edit .env (main will).
3. source-kind.ts ~198: pass k=5 to /search.
4. chat.ts ~967: one overall turn deadline (e.g. 25 s, env-overridable) around runGraph that yields the existing graceful AI-unavailable/no-answer reply, never a 500, and never affects the crisis path.
Run focused tests for engine graph/kb, mcp/university-kb, and apps/api chat tests touching turns; tsc for the touched packages.
