# Read-only probe — Ollama key + model ids (D-100 G-REAL). NEVER print, log or write the key value.
1. Read packages/providers/src/index.ts (prepareOllamaProvider / OllamaProvider) to learn the env var names (OLLAMA_API_KEY, base URL var, model var) and the request shape.
2. In D:/vc/.env check each var: present? non-empty? trimmed length? Report only "present, length N, first 3 chars masked as ***". Do not echo .env lines.
3. One free probe: list models from the configured base (GET {base}/api/tags, or the provider's documented list endpoint; default base https://ollama.com) with the Bearer key, from a short node or curl command that reads the key from .env without printing it (no -v, no echo). Report HTTP status only plus the model ids returned that match /glm|deepseek|gemma|qwen/i.
4. Identify the exact ids for "GLM 5.3 flash" and "DeepSeek 4.1 flash" (closest matches, say if absent). If the list includes pricing/plan info, report it.
5. Do NOT make any /api/chat (billable) call. No file edits. Final message: key status, probe status, exact model ids, the env var to set for the model (VC_REAL_MODEL format per parseRealModel, e.g. ollama:<id>), anything missing.
