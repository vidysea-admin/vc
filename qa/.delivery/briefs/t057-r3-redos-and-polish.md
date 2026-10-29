# t057-r3-redos-and-polish

Fix the R2 re-review findings in qa/verdicts/t057-fix-round-review.md (source 2, section 'R2 re-review'). Files you own: packages/engine/src/student/classify.ts, packages/engine/src/tools/navigate.ts, packages/engine/src/student/graph.ts (line ~1443 only), plus their tests (student-classify, pathlynks-tools, navigate, student-graph). Do not touch apps/api/src/index.ts or chat.ts.
TEST FIRST (red), then fix:
1. HIGH ReDoS: in classify.ts SVC_NOUN (~355), remove the ambiguous overlap (study(?:ing)?(?:[- ]abroad)? vs abroad). Audit EVERY regex in SERVICE_ASK_RULES and INTENT_RULES for nested or overlapping quantifiers. Hostile tests: for each of 'study abroad ', 'studying abroad ', 'student ', 'abroad ', 'study-abroad ' repeated 300 times after 'do you help with ' plus '!', and a 4000-char input, classifyIntent must finish in under 100 ms. Keep all existing routing tests green.
2. W2: in navigate.ts (~226), strip ASK and GENERIC words whenever a topic word exists, not only when copy.size > 0, so an unsynced catalogue with /help no longer sends 'do you help with visa' to /help. Keep 'I need help' -> /help-faq.
3. W4: add 'have' and 'available' to ASK_WORDS, so 'which services do you have?' gives the list.
4. W3: graph.ts ~1443, an /ask throw passes searchFailed=true (no gap record).
5. Low: stripExplicitLinks/cleanCopy drop tokens that start with '/' or contain ':' (javascript:, /admin).
Run the focused engine tests and tsc for packages/engine.
