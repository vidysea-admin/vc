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

---

## Stall diagnosis appended (`qa/debug/t-010-live-cards-cycle3.md`, `4883bb1`)

**Verdict on the AIOS split: LOOP DESIGN, not execution. Unambiguously.** The unit was competently
built against a boundary that cannot hold it.

**The number that settles it, and it is not in any verdict.** On the *same commit*, two independent
authors each drew fresh hostile B1 rows and self-reported honestly: the **maker's 67 rows leaked 2
(3.0%)**; the **checker's 41 rows leaked 26 (63.4%)**. A twenty-fold spread between two good-faith
samples of the same population means **there is no convergent measurement of B1 on this unit.**
Every cycle's score describes its sampler, not its code. That also reframes the three earlier
cycles: they were not careless, they were scoring an unmeasurable thing.

**Shown vs fresh, every cycle:** c1 2/2 shown closed, 25/28 fresh leaked · c2 33/33 shown closed,
fresh leaked and **B18 regressed** · c3 **61/61 shown closed**, 26/41 fresh leaked. Monotone across
a **polarity inversion** of the mechanism — the same defect class survived default-open →
default-closed. That is a property of the approach, not of any implementation.

**Two structural impossibility proofs, verified in the tree:**
1. `NON_VERB_OPENERS` (`verifier.ts:152-202`) must be two contradictory things at once: lever C
   proves it is load-bearing for *keeping* legitimate elliptical cards, and the leak analysis proves
   it is the escape hatch for 12/12 imperatives. It must cover counselling nouns and contain no bare
   verb — but `note/plan/open/score/test/profile/cost/grade/board/right/reference/still` are both.
   **No assignment of those ~300 words satisfies both sides.**
2. **B18's primary finding is the citation exemption, not the card-type hole.** The card-type test
   is a free one-line fix. The other is unfixable inside this boundary: the guard must drop *"Is the
   budget still an unknown for the family?"* and keep CE-054 *"Is the 20 lakh budget per year or for
   the whole course?"* — **identical on every feature the code can see** (clarify, cited,
   interrogative, names the topic), differing only by entailment.

**Contract finding, stated and not decided:** **B1 as written is not satisfiable by any
implementation of this shape.** It demands a universal negative over open-class natural language
*and* that a code guard enforce it — jointly impossible. B18's re-ask bullet is satisfiable in
principle, but not over a bare `prompt: z.string()`.

**Smallest recovery is a boundary change, not a code fix.** Move the judgement out of prose and into
the schema: `CandidateCardSchema` is `{type, prompt: string, sources, confidence}`, which forces
both criteria onto free text. For B18, require a declared `knownFactId` plus an `asks` enum
(`unit|scope|timing|confidence|source|none`) and check the enum — CE-054 declares `scope`, a re-ask
can declare nothing, so it **fails closed by construction** while still satisfying "a code guard
enforces this". B1 does not fully yield to that: it needs `NON_VERB_OPENERS` split in two plus a
real bare-verb signal (verb lexicon or POS tagger) — **a new dependency, i.e. new scope.**

**Correction to this gate's own option (a).** The semantic verifier skill exists and is drop-only,
but it is **B2's citation-support judge**, it is **default-off** (`nodes.ts:57`,
`semanticVerifier?: boolean`), and **B1's own text forbids it from being the enforcement of record.**
So (a) as written above is not available as stated; the schema change is the real version of it.

**Avoidable, judged fairly — three small things, none of them the cause.** Cycle 2's fail-closed
claim was false and careless (the falsifying allow-list was the return statement of the same
14-line function, not a hidden gate) — but inverting it, which cycle 3 did, still failed, so it cost
trust rather than progress. Cycle 2 also never ran the two-column comparison against cycle 1 that
would have caught its regression before shipping. Cycle 3 added three words to an escape list its
own comment reasons against — 3 of 26 leaks. Against all that: **the maker refused two wrong
instructions with reproducible evidence and was right both times.**

**Harness:** CARDS-EVAL 62/62 across four cycles with the fixture byte-identical is real evidence
that D-028 discipline held under pressure, and **zero** evidence about B1/B18. It contributed by
omission — there was no standing regression detector for these criteria between cycles, so "fix the
rows you were shown" was the only measurable strategy available.

**Branch disposition: keep it, unmerged, not reverted.** Cycle 3 is the best version this boundary
admits, and `namedInPassing` survived four directed attacks.

## The four decisions, all yours

- **D1 — re-scope T-010, or open a successor unit on the schema change?** (the `knownFactId` +
  `asks` enum above)
- **D2 — are B1/B18 as written the pilot bar?** If they are not, that is a checker amendment first
  and then your call. Neither the debugger nor I recommend relaxing them; we are telling you B1 as
  written cannot be met by this shape.
- **D3 — is a non-deterministic LLM pass acceptable on a live safety surface?** This is the price of
  any semantic approach.
- **D4 — a separate growing adversarial corpus**, checker-owned, which must never touch the blind
  fixture. This is the missing regression detector.

**Until D1 and D2 are answered, there is nothing a maker can usefully build here.** That is the
diagnosis's conclusion and I am not working around it.

---

## Relayed (UNCONFIRMED in this session) — 2026-09-27

A peer session (vc-f5) reports that Umesh answered this gate directly over AskUserQuestion on
2026-09-27 ~17:45 IST, and recorded it to disk in commit `f7f5260` ("checker: record Umesh's six
decisions"), as decision **#3** of six in the `qa/QUEUE.md` block. That block states plainly that
it is "the record, not the authorization", and that the maker still owes this gate its
`Answered:` line and its DECISIONS entry.

**This is deliberately NOT an `Answered:` line.** A peer relay cannot authorize an append-only
decisions log, however likely it is to be correct — the same rule under which the relayed hook-fix
approval was refused earlier today. A rule that only holds when the relay looks doubtful is not a
rule. The relayed content is preserved here so nothing is lost if that session ends.

Umesh has been asked in the maker session for a one-line confirmation. On his confirmation the
`Answered:` line and the DECISIONS entry are written the same turn; until then this gate counts as
unanswered for sweep purposes.
