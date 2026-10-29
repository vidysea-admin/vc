# t057-model-options

Model check, read-only. Use the GEMINI_API_KEY from D:/vc/.worktrees/vc-completion/.env without ever printing it, and send it only in the x-goog-api-key header.
1. GET https://generativelanguage.googleapis.com/v1beta/models (paginate) and list every model whose name contains 'flash' or 'lite', with supportedGenerationMethods. Find whether a 'gemini-3.5-flash-lite' (or the nearest 3.x flash-lite) exists. Umesh asked for '3.5 flash lite'.
2. For the current VC_LLM_MODEL (gemini-2.5-flash) and each candidate flash-lite model, send 3 tiny SYNTHETIC generateContent calls (no student data; JSON mode like packages/providers/src/index.ts GeminiProvider; thinkingBudget 0 if supported). Record status and latency p50.
3. Check whether the candidate supports the google_search grounding tool (send one synthetic call with tools:[{google_search:{}}]).
4. Read packages/providers/src/index.ts and apps/api/src/index.ts to state exactly which env keys select the model per role: answer, safety screen (VC_CONCERN_MODEL), extraction. Say how to make the answer model configurable without code changes, if that is already possible.
Write qa/evidence/t057/model-options.md with the model ids, latencies, grounding support and the env keys. Do not edit .env or code. Total spend must stay trivial (at most about 20 tiny calls).
