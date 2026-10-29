# t057-r2-deadline-safety

Fix the SSE medium and the AI-engineer Lane A warnings in qa/verdicts/t057-fix-round-review.md (source 2). Files you own: apps/api/src/chat.ts, packages/engine/src/student/graph.ts, mcp/university-kb/src/kb-client.ts, and their tests (apps/api/tests/chat.test.ts, packages/engine/tests/student-graph.test.ts, mcp/university-kb/tests/kb-client.test.ts). Do NOT touch classify.ts, navigate.ts or routes.ts; another lane owns them.
TEST FIRST (red), then fix:
1. SAFETY: when the turn deadline fires, the result must honour the model safety screen. If the screen verdict is 'possible' (already resolved, or resolves within its own existing cap), return the same crisis/helpline reply finish() would have given, never PROVIDER_APOLOGY_TEXT. Expose the verdict from the graph run, e.g. a shared state object the graph fills, and await the pending screen promise bounded by its cap. Test: screen stub returns 'possible', answer hangs, short turnDeadlineMs.
2. Cap /search at about 8 s in kb-client.ts the same way /ask is capped (min of the configured value and the cap).
3. graph.ts ~1110: when navigate_steps returns no labelled service, or the catalogue is empty for a service intent, fall through to the KB answer path instead of NAVIGATE_UNKNOWN_TEXT. Keep the unknown text for explicit page requests ('where do I find', 'take me to').
4. Budget-aware fallbacks: pass the remaining turn budget into expertGuidance or the grounded/general calls (min of their timeout and remaining minus a margin), and skip the general call when under about 4 s remains. Test with a fake clock: KB timeout plus healthy grounded gives a grounded answer under 25 s.
5. Skip recordGap when searchFailed.
6. Log a text-free turn_deadline_hit event (no student text).
The crisis regex path stays untouched. Run the focused tests and tsc for apps/api, packages/engine and mcp/university-kb.
