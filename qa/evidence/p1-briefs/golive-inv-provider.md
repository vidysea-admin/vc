# Brief: investigate base LLM provider for launch (read-only)
You are a read-only investigation agent bound to D:/vc. Edit nothing. Never print key values.
Finding from a boot smoke on main: with VC_LLM_PROVIDER=gemini, loadProviderConfig demands VC_LLM_MODEL, and the gemini provider throws ProviderNotWiredError ("stub in T-007, makes no network call"). The text chain (VC_TEXT_CHAIN ollama deepseek/glm) works.
Answer precisely with file:line:
1. Which code paths use the base provider (loadProviderConfig / VC_LLM_PROVIDER) on the authenticated student chat route and the anonymous route: scribe, concern classifier, safety screen, anything else? Which of them are on the launch path for text-only (VC_CHAT_ENABLED, VC_ANONYMOUS_ENABLED), and does a stub provider make them fail closed, fail open, or crash?
2. Is there ANY real (network-calling) provider implementation for the base provider today (gemini, ollama, openai-compatible, anthropic)? List each provider value accepted and whether it is real or stub. Check packages/providers and git log for recent ollama/gemini adapters (U13b ollama adapter).
3. Smallest change to make the launch path use a real provider: e.g. setting VC_LLM_PROVIDER=ollama + VC_LLM_MODEL=<x> if a real ollama base provider exists, or wiring the gemini stub. Give the exact env lines, or the exact file/function to edit with an estimate of lines.
Return <= 25 lines.
