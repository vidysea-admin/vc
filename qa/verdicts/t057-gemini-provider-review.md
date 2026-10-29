# T-057 Gemini text provider: dual review (2026-10-28)

The reviewers ran with fresh context and read-only access; the main session saved their verdicts. The maker's evidence is in qa/evidence/t057/gemini-safety-extract.txt.

## Senior SWE: **Warning** (no critical/high)
Passed: the key never appears in the URL or in errors; abort and timeout are under one controller, with the timer held through `res.json`; a non-STOP finishReason is rejected; the screen fails closed; Gemini mode never silently falls back to Ollama; the ollama/litellm paths are unchanged. Test results: providers 31/31, chat-profile T-057 2/2, apps/api tsc clean.
- [medium] Gemini mode has no spend cap and no per-turn usage metering (apps/api/src/index.ts:631-649). **Backlog.** Umesh chose "no cap" for the demo (D-127). The admin usage rows for Gemini turns are empty.
- [medium] The cards AI_DOWN_ERRORS set lacked the Gemini names (packages/engine/src/cards/nodes.ts:189). **FIXED** by adding Http/Network/Timeout/Malformed; Aborted is excluded on purpose. Cards tests 86/86 pass, engine tsc clean.
- [low] The comment says language detection runs on Gemini, but the offline detector is what is used (index.ts:626 vs :838). Backlog.
- [low] The Gemini branch of isRetryableProviderError has no failover test. Backlog.

## AI engineer: **Warning**
Approved: JSON mode plus Zod with fail-closed; one model for every role (no cheaper screen until the crisis eval runs); latency (the screen runs in parallel, extraction runs after the reply, the critical path is max(screen, KB+answer)); grounding (the C4 answers are deterministic and cited); the crisis path makes zero LLM calls.
- W1: a malformed Gemini reply was not retried on the screen, so a benign student could see the crisis message. **FIXED** in packages/engine/src/guards/concern-classifier.ts:315,327, with a new test ("T-057 W1"). concern-classifier tests 28/28. Note: the test was written after the fix, so it was never seen red.
- W2: the answer call has no re-ask on a schema miss (graph.ts:1373). Backlog, unless the walks show apology replies.
- Open: is GEMINI_API_KEY on the paid tier? On the unpaid tier Google may use prompts to train its models, which matters for real student data. **Umesh must confirm.** The 429 behaviour on this key is also unprobed.

## Re-review of session fixes (2026-10-28, fresh senior-software-engineer, read-only): **Approve**
Covered: W1 retry (concern-classifier.ts:312-316), cards AI_DOWN_ERRORS (nodes.ts:189), Vidysea grade fallback SQL, security.py age parse. Results: classifier 28/28, cards 86/86, vidysea vc_ 28 pass. W1 test confirmed by reading to fail without the fix.
Backlog (all low): no cards test for the Gemini names; no planCards retry on GeminiMalformedResponseError; GeminiHttpError 4xx maps to ai_unavailable; no test for the VC_DEMO_ELIGIBILITY SQL branch; LiteLlm* names are absent from AI_DOWN_ERRORS (open question).
