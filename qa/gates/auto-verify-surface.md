# Gate: auto-verify-surface
**Opened:** 2026-09-27 (T-036 fix cycle 1, blind oracle first contact)
**Blocks:** nothing today. It does not block a build unit. It is a PRODUCT decision that changes how
much manual work the counsellor does in every session, so it should be answered before a pilot.

**What was found.** T-036 had a second agent author 102 test sentences from criterion B2 and D-026
alone, structurally blind to the implementation. On first contact with the engine:
- all 72 rows the contract requires to be needs-review came back needs-review (the safety property
  held — nothing auto-verified that should not have);
- but **29 of the 30 rows the contract reader expected to AUTO-VERIFY did not**. Every disagreement
  is in the stricter direction.
- **21 of those 29 hinge on one rule that appears nowhere in B2 or D-026**: the engine also requires
  the cited clause to match a closed template grammar, else `unrecognised-form`.

So a competent reader of the contract expects this to auto-verify:
  *"Honestly, Australia is the only country I'm seriously considering for my undergrad."*
It does not. It goes to the counsellor for manual review.

**Question:** is B2's list of auto-verifiable things **necessary-only** (these are the only KINDS
that may auto-verify, and the engine may additionally demand any sentence shape it likes), or is it
also **sufficient** (a typed number or a vocabulary country match in a clean student assertion
SHOULD auto-verify)?

**Options:**
- **(a) Necessary-only — the engine is right, the contract is under-specified.** Amend B2 to state
  the template-grammar requirement plainly, so the narrowness is a documented choice. Cost: the
  counsellor manually reviews most facts, including obvious ones. Safe, but the "AI assists" promise
  gets thinner the more the counsellor has to hand-confirm.
- **(b) Sufficient — the engine is too narrow and should be widened** toward what B2 promises, one
  documented family at a time, each widening gated on the crisis/citation safety tests. Cost: real
  work, and every widening is a new chance to auto-verify something wrong. B2's whole point is that
  a wrong auto-verified fact is worse than a reviewed one.
- **(c) Split the difference — keep auto-verify as narrow as it is, but stop calling the rest
  "needs-review" as though it were doubtful.** Surface template-unrecognised facts to the counsellor
  as "confirm this wording" rather than "we are unsure this is true", so the UI cost falls without
  the safety surface moving at all.

**Recommendation:** (c) first, then (b) family by family if the counsellor still does too much.
(a) alone documents the gap rather than closing it.

**Related, same finding, smaller:** the fixed country vocabulary holds 10 entries (Australia,
Canada, France, Germany, India, Ireland, New Zealand, Singapore, UK, USA) — the Netherlands is
absent, and B2 never enumerates the list. JEE and NEET have no key or template family at all, so
Indian domestic exam scores cannot auto-verify. Both are listed as Q2 and Q5 in qa/feedback-inbox.md
for the checker to fold into the contract; they do not need a separate gate.

**Answer format:** chat reply. The maker appends `Answered:` here, then a DECISIONS entry.
