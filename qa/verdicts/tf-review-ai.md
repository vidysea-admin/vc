# Tool-first ai-engineer review (2026-10-29)

Fresh read-only ai-engineer review, saved by the main session.

**Verdict: Warning.** No path invents a tool or link.

**Probe:** 48 phrasings (`qa/evidence/tool-first/routing-probe.ts`). 35 of 42 routed correctly; 23 of 30 tool asks routed; 0 of 12 KB near-misses were stolen.

## Findings
1. **[warning]** navigate.ts:90/127/129. V_PLACE has one slot, so "best universities in Canada with 20 lakh budget" and "top universities for MBA in Germany" go to the KB.
   - Fix: add a bounded budget slot and a second "for <subject>" slot.
   - Never echo the budget.
2. **[warning]** classify.ts:192-198. Hinglish and colloquial progress asks fall to the KB: kahan tak pahuncha, dikhao/batao, a bare "next steps", "did I apply", "track my visa".
   - Keep "my" required so "mera visa reject ho gaya" stays in the KB.
3. **[warning]** ToolRecipe.auth "public" is dead (graph.ts:590, 1396). Anonymous users never get the public links that spec U1 expects. Wire it, or remove it and amend the spec.
4. **[warning]** navigate.ts:60, 341+. The SECTION_KEYS and COUNTRIES slugs are unverified [ASSUMPTION]s, so a wrong key is a silent dead link. Verify them against the frontend STUDENT_SECTIONS; add a drift test.
5. **[info]** The empty catalogue degrades to "nothing yet", so the G-sync catalogue is a functional dependency.
6. **[info]** "what next" ignores context (by design). Add a probe case.
7. **[approve]** The c6 fix. Nit: nodes.ts ~1340 has a raw newline in a template literal.

## Recommendation
Freeze the probe as a regression table. Pass line: 0 stolen and ≥90% of tool asks routed.

## Re-runs
- engine navigate/classify/pathlynks-tools/manifest: 85/85
- fact-extractor: 17/17
- tsc: exit 0
