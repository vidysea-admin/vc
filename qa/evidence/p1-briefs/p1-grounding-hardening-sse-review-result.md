# senior-software-engineer review result: p1-grounding-hardening (diff 3772f4a..00a671a)
VERDICT: Warning
- [medium, fails H6] packages/providers/src/index.ts GroundingBudget.#charge (~936-955): check -> await spend -> increment, so concurrent calls all pass the cap check when a spend guard is wired (startApi wires it with a text chain, apps/api/src/index.ts:519-521, the production setup). Probe: 20 parallel answer() with maxPerSession=2, maxPerDay=5 and a sync spend -> 20 reached the answerer; without spend -> 2. Fix: increment day + per-key counts before awaiting spend, roll back if spend throws. Add a concurrency test. Probe script: scratchpad/race.mts.
- [low] apps/api/src/chat.ts:742: chat cap keyed per thread; a new thread gets a fresh allowance (day cap + spend guard still bound it). Design note.
- Clean: H2 startup refusal (index.ts:596-604 before connect 626, no graph bypass), env cap parsing, day rollover, 20k key bound, D-110 fallback, no double charge, H3 behaviour and the changed G5 test (a deliberate spec change, not a weakened assertion).
- Open: H3 changes D-105 behaviour (screen error -> crisis text) on no-source turns; needs Umesh confirmation + a decision entry. gemini-3-flash gets thinkingBudget 0: unproven that Gemini 3 honours it.
- Test gaps: no concurrent GroundingBudget test; no test of startApi spend wiring through chainGuard.
