# t057-gemini-thinking-config

Make gemini-3.5-flash-lite usable as VC_LLM_MODEL / VC_CONCERN_MODEL / VC_GROUNDING_MODEL. Findings are in qa/evidence/t057/model-options.md (source 2). Files you own: packages/providers/src/index.ts (~548 generate thinking config, ~936 grounded answerer) and packages/providers/tests/index.test.ts. Touch nothing else.
1. Empirically confirm with at most 8 tiny SYNTHETIC calls (the key is from the worktree .env, header only, never printed) which thinking config each model accepts: thinkingBudget:0 vs thinkingLevel:'minimal' for gemini-2.5-flash, gemini-2.5-flash-lite, gemini-3.1-flash-lite, gemini-3.5-flash-lite, gemini-3.5-flash.
2. TEST FIRST (red): the request body for each model family carries the accepted config. Unknown future models default to no thinking config, rather than one that 400s.
3. Implement one small pure helper (in the same file) used at both call sites.
4. Green: providers tests, plus tsc for packages/providers and apps/api.
5. Live-verify one synthetic JSON-mode call and one google_search grounded call through the provider code path with gemini-3.5-flash-lite, using a tiny scratch script that imports the provider. Record status and latency.
Append a 'Fix' section to qa/evidence/t057/model-options.md. Do NOT edit .env and do NOT restart the API; main will.
