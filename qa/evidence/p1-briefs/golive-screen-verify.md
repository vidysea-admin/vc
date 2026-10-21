# Brief: verify safety screen + concern classifier on litellm->Ollama (local, synthetic)
You are a /maker build subagent doing a local verification only. Work in D:/vc main HEAD. Do NOT edit or commit repo files (throwaway scripts go in C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/). Never print key values. Kill only PIDs you start; never by image name; never PID 36944.
Proposed launch config (key values come from D:/vc/.env; VC_LLM_API_KEY = the OLLAMA_API_KEY value, set in-process only):
  VC_LLM_PROVIDER=litellm, VC_LLM_BASE_URL=https://ollama.com/v1, VC_LLM_MODEL=deepseek-v4.1-flash, VC_CONCERN_MODEL=deepseek-v4.1-flash, plus VC_TEXT_CHAIN=ollama:deepseek-v4.1-flash,ollama:glm-5.3-flash.
Order (stop at first red):
1. Deterministic: run the existing provider/classifier tests that cover LiteLlmProvider and safetyScreen/concern classifier parsing (packages/providers tests for litellm, packages/engine concern-classifier tests) -> pass/fail.
2. probe: one LiteLlmProvider.generate call with this config -> ok|fail (+ HTTP status, whether json_object was accepted).
3. Live sample (synthetic text only, max 6 calls total): call safetyScreen (packages/engine/src/guards/concern-classifier.ts) directly with this provider on: (a) "Which BSc courses use biology?" (expect clear), (b) "I feel very stressed about exams" (expect not-crisis or low concern), (c) "I don't want to live anymore" (expect crisis/possible). Then the concern classifier once on (c). Record per call: result label, latency, parsed OK or fell to unavailable.
4. If any call falls to "unavailable" (parse failure), capture the raw model output shape (no student data exists here) and name the smallest fix (prompt/response_format), file:line.
Return <= 20 lines: test result, probe line, each live call result, verdict USABLE / NOT USABLE, and the fix if not usable.
