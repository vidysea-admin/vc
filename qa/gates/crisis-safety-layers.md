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
