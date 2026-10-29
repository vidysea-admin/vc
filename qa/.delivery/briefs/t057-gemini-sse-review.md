# t057-gemini-sse-review

Read-only senior review (never edit, never start or stop servers, never touch DBs) of the T-057 change that makes Gemini a real text provider.

Scope: `git -C D:/vc/.worktrees/vc-completion diff` limited to:
- packages/providers/src/index.ts (GeminiProvider around lines 440-620, createProvider, isRetryableProviderError)
- apps/api/src/index.ts lines 600-720 (VC_TEXT_CHAIN ignored when VC_LLM_PROVIDER=gemini; classifier model)
- the new tests in packages/providers/tests/index.test.ts:454-504 and apps/api/tests/chat-profile.test.ts:1533-1600
The maker's evidence is qa/evidence/t057/gemini-safety-extract.txt.

Check:
1. The API key never reaches a URL, log, error message or thrown error text.
2. Abort and timeout handling. The 12 s default must hold the C5 30 s turn budget, including retries and failover.
3. Schema validation of the model output, and fail-closed behaviour of the safety screen on every Gemini error class.
4. No silent fallback to Ollama when gemini is configured. Behaviour for ollama/litellm is unchanged.
5. The cards/nodes.ts:189 'AI down' error-name set no longer covers the Gemini error classes. Assess the impact.
6. Admin per-turn usage metering is empty for Gemini turns. Is that a correctness or billing gap that matters for the demo?
7. Test quality: do the tests prove the outcome (calls go to Gemini, 0 Ollama calls), and do hostile variants exist (malformed JSON, 429, 503, abort mid-stream)?

Re-run: node --import tsx --test packages/providers/tests/index.test.ts, plus apps/api/tests/chat-profile.test.ts with --test-name-pattern=T-057.

Return Approve / Warning / Block with file:line evidence, most severe first. The main session saves your verdict.
