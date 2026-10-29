# route-fix-1

Fix round 1 for routing and replies (ai-engineer findings 1-4 and 6, senior findings 3-4, data finding 5, nits). TDD, edit in place. Another lane owns apps/api/**, packages/db/**, packages/schemas/**, config/sources.json, mcp/pathlynks/src/index.ts and packages/engine/src/ingest/**. Do not touch them.
1. navigate.ts:90/127/129 V_PLACE: add a bounded optional budget slot (with|under|within|in <n> lakh(s)|lac|lakhs|crore|k [budget]) and a second "for <subject>" slot, so these route to university_search: "best universities in Canada with 20 lakh budget", "... under 20 lakhs", "top universities for MBA in Germany". Never echo the budget into links or replies. Keep the patterns linear (add a 5000-char hostile test).
2. classify.ts progress rules: Hinglish and colloquial asks must route: "mera visa kahan tak pahuncha", "meri journey kahan tak pahunchi", "mere scholarships dikhao", a bare "next steps?", "did I apply to anything yet", "track my visa". Keep "my/mera" required, so "mera visa reject ho gaya ab kya karu" stays in the KB. Coexist with the new pathlynks_* quest rules.
3. ToolRecipe.auth "public" is dead (graph.ts:590, 1396). Wire it: an anonymous navigate_steps for a public recipe returns the public link and steps; others keep the sign-in text. The manifest entry must reflect this. Add tests.
4. Add a test that every SECTION_KEYS key exists in the frontend STUDENT_SECTIONS. Read the synced list read-only from Mongo virtual_counsellor.source_artifacts (latest nav_catalogue for vidysea-frontend) once, and freeze it as a test fixture under packages/engine/tests/fixtures/. Fix any key that does not match. Drop the [ASSUMPTION] tag only if all match.
5. student-classify.test.ts:209: replace the absolute 100 ms bound with a relative two-length comparison.
6. Rename "next due" to "earliest open due" (graph.ts ~468), or filter end_date >= current_date in port.ts:461. Choose the filter plus a separate overdue count if simple; otherwise rename.
7. nodes.ts ~1340: replace the raw newline in the template literal with 
.
8. Freeze qa/evidence/tool-first/routing-probe.ts (48 phrases plus the new ones above, plus a "what next" after a KB answer) as an engine test table (packages/engine/tests/routing-probe.test.ts). Pass line: 0 KB near-misses stolen and >=90% of tool asks routed. Report the hit rate.
Run the focused engine and pathlynks tests, plus tsc for the engine and mcp/pathlynks. Write qa/evidence/tool-first/route-fix-1.md.
