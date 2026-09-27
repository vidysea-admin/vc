# Gate: p2-application-drafting-scope
**Opened:** 2026-09-27 (maker; corrective — tracked only as the T-038 TASKS row and ISS-077 until now,
never as a gate file, so the sweep could not surface it.)
**Status:** awaiting Umesh. Blocks T-038 entirely; blocks nothing else.

## The ask
Outcome **O4 — "an application drafted in 15 minutes"** (contract **B10**, P2, draft-only) has
**zero build tracking anywhere in the repo**. No unit, no code, no tests, no fixtures. T-038 exists
only so the absence stops being invisible.

Every other P1 criterion has either shipped code or a named open unit. This one does not, and it is
the only outcome in the contract in that position.

## Question
Is P2 application drafting in scope for this pilot?

**Options:**
- **(a) Out of scope for the pilot.** Say so explicitly, mark B10 deferred in the contract with a
  dated note, close T-038. Recommended if the pilot is the counsellor copilot only — it makes the
  honest statement of scope match the code, which is the same problem `b18-unimplemented` raises.
- **(b) In scope.** T-038 becomes a real build unit and needs a spec first: what "drafted" means,
  which application, what the counsellor reviews, and how B2 citation rules apply to generated
  application prose. That is a `/grill` + spec cycle before any code, not a queue row.
- **(c) Decide after the pilot review.** Leave T-038 open and blocked; accept that O4 is unmeasured
  when the pilot is assessed.

**Answer format:** chat reply. The maker appends `Answered:` here, then a DECISIONS entry.
