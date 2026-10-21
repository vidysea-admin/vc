# ai-engineer review result: p1-nosource-grounded (diff 8d0d529..6a501bd) - Warning, no Block
Sound: sources https-only/capped/sanitized both sides; app.js links via DOM+textContent (no XSS); key in header; non-STOP -> fallback; crisisGuard first.
W1 redaction floor only: name/age/school/address/pin/DOB ("4 March 2008") leave unredacted (graph.ts:770); /iu makes \p{Lu} match lowercase -> over-redaction. Confirm Gemini paid tier (no training use).
W2 grounding can run with no screen: api/index.ts:526 screen off for rules provider while loadGroundedAnswerer independent; auth path safetyScreen=false same. Fix: startup error.
W3 topic floor over-blocks (lang.ts:733-766): fake visa agents, fake offer letters, backlogs, credit transfer override, write SOP myself, break into systems engineering, forged marksheet consequences. Misses Devanagari injection, Hinglish "poem likh do".
W4 bare-domain guard misses "daad. de"; false-flags "cities.it depends", "etc.in Germany" (low cost).
W5 Gemini grounding ToS: searchEntryPoint (Search Suggestions) never rendered.
W6 grounded call: raw fetch, no spend guard/rate cap/tracing/preflight.
W7 screen fails closed -> crisis text on classifier outage even for a visa-fee question; floor-declined anon turns skip screen (graph.ts:748 before :749). thinkingBudget 0 only for flash models.
Evals to add: (1) in-scope scam/policy questions answered on both paths; (2) outbound leakage test with minor-style PII; (3) hostile mock output (spaced domain, javascript: source, 10 sources, Devanagari injection) + config test grounding+no-screen refuses start.
