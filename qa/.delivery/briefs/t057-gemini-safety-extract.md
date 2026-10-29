# t057-gemini-safety-extract

Context: T-057 local demo on real data (frozen contract = source 2). The headed Pathlynks walk on 2026-10-28 showed that with VC_LLM_PROVIDER=gemini only the MAIN chat model switches to Gemini. The safety screen (the pre-answer concern/safety classifier) and the profile-fact extraction (the step that turns a stated preference into a PROPOSED fact, C6) still go to the Ollama cloud chain (deepseek / glm), which times out after about 55 s. Result: three replies came back as a 43-char fallback, and C6 saved no fact.

Task (maker, TDD, edit in place):
1. Find exactly where the safety-classifier and fact-extraction LLM providers/models are constructed. Start at the provider wiring in apps/api/src/main.ts, then apps/api/src/index.ts, apps/api/src/chat.ts, packages/engine/src/guards/concern-classifier.ts and packages/engine/src/scribe/nodes.ts. Cite file:line.
2. Write a FAILING test first, in the most relevant EXISTING test file (e.g. apps/api/tests/main.test.ts). It asserts that with VC_LLM_PROVIDER=gemini (+ VC_LLM_MODEL), the safety and extraction calls use the Gemini provider/model and not the Ollama chain. Save the red output.
3. Fix it in place, so that safety and extraction follow the same configured provider seam as the main chat. No new module. When gemini is configured, there is no silent fallback to Ollama. Behaviour for the ollama and litellm providers stays unchanged. Bound the per-call timeouts well under the 30 s C5 budget.
4. Green: run node --import tsx --test --test-timeout=60000 on apps/api/tests/main.test.ts, apps/api/tests/chat.test.ts, apps/api/tests/chat-profile.test.ts, apps/api/tests/chat-privacy.test.ts and any engine guard tests you touched, plus pnpm -C apps/api typecheck. Report the counts.
5. Save the red and green output to qa/evidence/t057/gemini-safety-extract.txt. Do NOT restart the running VC API; the main session restarts it.
