# Gate — t013-extra-cycle (T-013 hit max fix cycles)
**Opened:** 2026-09-26 · **Blocks:** T-013 merge, and behind it T-025, T-029, T-012, T-022

**Situation:** fix cycle 2 (the last of max 3) cut fabricated auto-verified facts from 14 to 0 on the eval, using an allow-list of approved sentence patterns. The fresh ai-engineer review still BLOCKs:
- ISS-t-013r-rev-9: another clause in the same turn can retract or attribute the fact, and it still auto-verifies ("I want to study in UK. Scratch that, Canada." / "Rahul said, I want to study in UK").
- ISS-t-013r-rev-10: invisible zero-width characters hide a "not".

Blast radius is bounded: every fact, verified or not, still needs the counsellor's explicit approve/reject click (ApprovalScreen, B3), so nothing is written silently. The review's proposed fix is small and structural: auto-verify only single-clause turns, and strip zero-width characters.

**Question:**
- A) Allow one extra fix cycle (cycle 3) scoped to exactly rev-9 + rev-10 (Recommended).
- B) Accept as-is: merge with rev-9/rev-10 as tracked follow-ups, since B3 approval bounds the risk.
- C) Keep T-013 STALLED and re-plan.

**Also (ISS-t-013r-rev-11, review load):** add the templates "we have finalised <C>", "we want to go to <C>" and "I finally decided on <C>"? (The reviewer says do NOT add "I am interested in studying in <C>".)

Answer format: `Answered: <ISO> — <A|B|C> — templates <yes|no> — <who/where>`

Answered: 2026-09-26T21:11:55+05:30 — A (one extra fix cycle 3, scoped to ISS-t-013r-rev-9, rev-10 + any finding from the in-flight checker c2 / DE review) — templates: no change (Umesh: "no idea regarding this" → keep the fail-safe list as-is; rev-11 stays a parked product question) — Umesh in chat (AskUserQuestion)
