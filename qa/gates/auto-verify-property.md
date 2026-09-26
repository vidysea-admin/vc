# Gate: auto-verify-property (what `needsReview:false` promises)
**Opened:** 2026-09-26 (T-013 stall diagnosis, qa/debug/t-013-citation-rescope-cycle3.md; D-025)
**Blocks:** nothing now. T-030 builds the fail-safe structural checks (D-025) meanwhile.

**Question:** when the scribe marks a fact "auto-verified" (no review chip), what exactly is promised?
- **A (recommended by the diagnosis):** write the property down: "the student said this value, for this key, in their own words, in this one turn". Context from other turns (a hypothetical framed earlier, a retraction later) is out of scope. A leak is capped at high severity, because the counsellor still clicks approve on every fact (B3).
- **B:** drop auto-verify entirely. Every fact carries the review chip.
- **C:** keep today's rule for now, and later learn it from the counsellors' approve/reject clicks.

Answer format: `Answered: <ISO> — <A|B|C> — <who/where>`

Answered: 2026-09-26T23:53:03+05:30 — A — Umesh in chat (AskUserQuestion "Write the rule down (Recommended)"): auto-verified = the student said this value, for this fact type, in their own words, in this one turn; cross-turn context out of scope; a leak is capped at high severity (B3 approve click still required).
