# Gate: t-010-b1-b18-unsatisfiable

**Opened:** 2026-09-27 (T-010 live cards, STALLED at max fix cycles)
**Status:** open — stall diagnosis in flight, will be appended here. Opened now rather than after it,
because the decision this needs is yours regardless of what the diagnosis concludes.

## What happened

T-010 (live cards) has had **four checker passes and three fix cycles**, the maximum. It is now
STALLED. It fails on the same two contract criteria every time: **B1** (no scripted lines / recital
to the counsellor) and **B18** (never re-ask what is already known).

This is not a unit that was built carelessly. The cycle-3 checker verified the final attempt
structurally — the phrase-window machinery was genuinely deleted, the guard genuinely defaults to
suppressing, `namedInPassing` survived four directed attacks, every previously-exhibited leak went
to zero, all three falsification levers reproduced, 602/602 engine tests, nothing weakened, fixture
untouched. It then wrote **fresh** hostile rows and **26 of 41 B1 rows and 8 of 10 B18 rows leaked.**

Each cycle scored near-perfectly on the rows it had been shown and poorly on new ones. The leaking
phrases are ordinary English — *Note the budget…*, *Nudge and reassure the parents…* — not
adversarial coinages.

## The two findings that are not list-tuning problems

1. **The B18 guard applies only to `type === "clarify"`.** The identical re-ask typed `widen`,
   `challenge` or `compare` is shown. The planner decides whether the guard applies by writing one
   field.
2. **Citing the fact you re-ask turns the guard off** (`!citesKnownFact`) — and
   `skills/exploration-planner/SKILL.md:47` **instructs exactly that shape**: "cite the fact and
   widen or clarify it." The guard is disabled for the card shape the system is designed to emit.

## Why this is yours and not the maker's

The honest reading is that B1 and B18 are being enforced by **lexical rules over open-class
language** — deciding "is this a verb", "is this a request for a value", in arbitrary English and
Hindi, with word lists. Four structurally different implementations have now failed the same way.
A fifth list edit is not the answer, and the maker must not be the one to decide that the contract's
bar should move.

**Three things follow, none of them a maker call:**

- **Pilot scope.** B18 is "never re-ask what the student already told you" — one of the CEO's own
  north-star clauses. B1 is "never hand the counsellor a script to read." Whether a supervised pilot
  ships with these partially enforced is a product decision.
- **Approach.** The checker notes an **optional semantic verifier skill already exists and already
  fails closed.** Moving the open-class judgement there is a real option, and it is a boundary
  change, not a fix cycle.
- **The planner conflict.** Finding 2 means the contract and `exploration-planner` currently
  contradict each other. One of them has to change.

## Question for Umesh

T-010 has exhausted its fix cycles with both criteria still open. Which way does it go?

**Options:**
- **(a) Re-scope the unit and move the open-class judgement to the semantic verifier skill.** Most
  likely to actually satisfy B1/B18, since the skill reasons over meaning instead of spelling.
  Cost: a new unit with its own plan gate, latency on the live-card path, and a cost-per-card
  question. It also does not by itself resolve the planner conflict.
- **(b) Ship the live-card surface for the supervised pilot with the leak rates documented.**
  Defensible where a counsellor reviews every card before it reaches a student — a scripted line or
  a repeated question is visible noise, not silent harm. Cost: the contract says one thing and the
  engine does another, and this is the second criterion (after B18's scribe surface) where that gap
  would be knowingly accepted.
- **(c) Narrow B1/B18 in the contract** to what lexical enforcement can actually deliver, and record
  the rest as post-pilot. Cost: this is the second contract-narrowing proposal today, and narrowing
  the contract to fit the code is the direction that loses information. It also needs a checker
  amendment, not just your yes.

**Recommendation:** (a) for B18's `!citesKnownFact` and card-type holes — those are design faults
with a clear owner, and (1) and (2) above are each roughly one line plus a decision about the
planner; (b) for the residual open-class B1 morphology, documented, because no lexical rule will
close it and a reviewing counsellor is a real mitigation. Not (c) first.

**Separately and not optional:** the contract–planner contradiction in finding 2 needs resolving
whichever option you pick, because right now the system instructs the shape that defeats its own
guard.

**Also note:** a PASS on this unit would never have meant "B18 is implemented" — the scribe and
summary surfaces have no B18 code at all on `main` (gate `b18-unimplemented.md`). These two gates
are about the same criterion on different surfaces and should be answered together.

**Answer format:** chat reply. The maker appends `Answered:` here, then a DECISIONS entry.
