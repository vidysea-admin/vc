# Gate: How far should the citation check auto-approve? (T-013 stalled)
**Asked:** 2026-09-25 · **Answered:** (blank) · **Diagnosis:** qa/debug/t-013-citation-robustness-cycle3.md

**Why you're being asked:** T-013 failed 4 checks in a row. Numbers are now fully protected, and no new
number exploit was found. For text values (country, university, course), each cycle closes one trick and
the checker finds the next one (last: "my cousin is in new britain" read as UK). Rules alone can't reliably
decide whether text is really about the student. The same thing happened with the crisis guard (T-005b).

**Question:** What should B2 guarantee?
- **(a) Recommended:** full-confidence auto-accept only for typed numbers and a fixed vocabulary (country
  names plus the alias list), matched as whole words. Every other text fact is marked "needs review" by
  default, and the counsellor approves it (B3 already requires that approval). This is safe; the cost is
  that the counsellor checks more items.
- (b) Add an LLM check (Flash-Lite) as a second opinion, with a measured error rate instead of zero.
- (c) Replace the "zero exploits" bar with a fixed attack set and a measured fabrication rate.
- (d) Merge as-is and rely on counsellor approval (B3). Weakest: the checker has already rejected this.

**Follow-up for (a):** is the fixed vocabulary today's country names plus aliases, or should we write a full list?
