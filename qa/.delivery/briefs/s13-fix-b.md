# s13-fix-b

S13 fix round B (AI and voice), under D-136. TDD and edit in place. Another lane owns chat.ts, chat-threads.ts, profile-facts.ts and db-init; do not touch them.
1. [ai, warning] voice.ts:1631/:942: voice yes/no consent must be armed only after the model has finished reading THAT memory question aloud (turn_complete after the sendText readout), not by any mic frame. A yes/no before that is ignored for the decision. Keep the exact-match checks and the on-screen confirm. Update voice-history.test.ts:477, which currently decides on audio alone, and add a test that a "yes" spoken before the readout completes changes nothing.
2. [ai, warning] graph.ts guardedGuidance (~1660-1669): add a deterministic floor. Any answer promising an outcome (English and Hinglish: guaranteed, definitely get, 100% chance, sure shot, pakka admission, visa guaranteed, etc.) falls back to the fixed refusal or the safe guidance. Apply the same floor to KB-sourced answers (Umesh's default: KB-text injection like "visa guaranteed" must not pass). Also catch a mid-line draft ("Here is my SOP: Dear ...") in isDraftLike. Keep it linear (hostile 5000-char test). Avoid false positives on neutral phrasing (e.g. "admission is not guaranteed" must pass): test both.
3. [ai, warning] Gemini metering and roles:
   - GeminiProvider must read usageMetadata and report through the same onUsage path Ollama uses, so Gemini text and grounded calls reach the per-turn usage meter and therefore the existing student and tenant caps (Umesh's default).
   - Wire loadRoleProviderConfig roles (summary, answer, router) into the place the API builds providers (index.ts/main.ts) and the graph deps. If a role key is unset, behaviour is unchanged. Never set an unprobed model id.
   - Tests.
4. [ai, low] claims.ts:84 isServedAsk: guard missing citations.web/internal with Array.isArray (a malformed ask is not served).
5. [ai, low] voice.ts:972: apply canonicalPreferenceKey to voice proposals, as chat.ts:781 does.
6. [security, open] voice.ts:1630: memoryCurrent runs on every audio frame. Add a short TTL cache (<= 1 s) for the input-frame check only. Output and decision boundaries still revalidate. Add a latency-injected test showing the frame queue does not overflow.
Run: apps/api (voice, voice-history, voice-wiring, voice-audit, partner-voice, main, index), packages/engine (student-graph, lang, student-fact-extractor, claims tests, routing-probe), packages/providers (all), tsc for api, engine, providers. Write qa/evidence/s13-fix-b.md.
