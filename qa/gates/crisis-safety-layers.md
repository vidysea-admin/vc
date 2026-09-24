# Gate: crisis-safety-layers
**Opened:** 2026-09-25 (ai-engineer review of T-005)
**Question:** The crisis check is currently the only safety layer for minors, and it is keyword-based. Its recall gaps
are known: indirect Hinglish ("sab khatam kar dunga", "marne ka mann kar raha hai") and no Devanagari coverage. Decide:
1. Is a **second, LLM-based concern classifier** in Phase 1 scope? It would run on turns the keyword check marks
   "none", before the exploration flow. Or is it deferred to the P3 red-team gate?
2. **Escalation SLA:** when an escalation card reaches the counsellor mid-session, what response time is expected,
   and what is the fallback if the counsellor does not act (e.g. alert a supervisor)?
**Options for 1:** (a) P1: always-on LLM pass on every turn (cost ~1 extra Flash-Lite call per turn); (b) P1: only on
"concern"-level turns plus a sample of "none"; (c) defer to P3 and rely on expanded keywords + a measured recall bar
for now.
**Not waiting on this gate** (these proceed in the T-005 fix round): expanding the Hinglish and Devanagari keyword
patterns, and a ~30-line crisis eval (crisis / indirect / concern / abuse / benign idioms) with a measured recall
target.
**Answer format:** chat reply. The maker appends `Answered:` here, then a DECISIONS entry.
**Blocks:** T-010 (live cards with students in session) and any real-student pilot. Does NOT block offline build units.

**Maker recommendation (brain-informed, 2026-09-25): option (b).**
- `concepts/krishnaik/guardrails.md`: the production norm is a hybrid. A deterministic guard runs first because it is
  instant, free and has no LLM on the path. A cheap model-based judge then handles borderline cases, because keyword
  lists have high false negatives on novel phrasing, which is exactly our indirect-Hinglish gap. Layered stacking is
  "defense in depth".
- `concepts/llm-evals/offline-vs-online-evals.md`:
  - Gate the crisis layer on an **offline golden set** with a recall threshold before any pilot. This is the proposed
    B15.
  - Online, **stratified-sample** conversations toward risk signals (concern-level turns, escalations, abrupt ends)
    for a reference-free LLM judge. That is cheaper than running the judge on every turn.
  - Feed misses back into the golden set (the self-improving loop).
- `patterns/agentic-architecture-standard.md` rule 3: deterministic guards go before LLM calls. Rule 6: voice needs a
  fast front agent, so the second pass runs async and must not block the live turn.
Net: expand the keywords now (not gated); run the LLM concern pass on "concern" turns plus a stratified sample of
"none"; measure recall offline. The SLA stays a product/ops decision for Umesh.
