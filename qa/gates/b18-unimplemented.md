# Gate: b18-unimplemented
**Opened:** 2026-09-27 (T-039 stage 2, blind B18 oracle first contact)
**Status:** claim under check — the T-039 checker is verifying it independently right now. Opened
early because if it holds, it changes what "P1 is built" means, and that is not a decision a maker
should absorb quietly into a queue row.

**The claim.** B18 ("personalised, never repetitive") has **no engine surface at all** on `main`:
- `packages/engine/src/cards/relevance.ts` — the destination/topic filter — does not exist on `main`.
  It exists only on the unmerged `wave/t-010-live-cards`, whose own cycle-0 checker FAILED it and
  named a real B18 leak at `relevance.ts:202`.
- The scribe graph has zero B18 logic. `ExtractInputSchema` is `{turns, sessionEndedAt}` and
  `SummaryInputSchema` is `{turns, facts}` — neither carries `destination_countries`,
  `study_abroad_intent` or any do-not-ask channel, so **no code path could vary on them even in
  principle.**

**The measurement.** Of 55 blind rows authored from B18's text alone, only **10 are runnable** at
all. Of those 10: 4 agree, **6 disagree, every one in the under-suppression direction** — the engine
surfaces what B18 says to suppress. Zero over-suppression, because nothing on these surfaces drops
content for relevance reasons at all.

**Why this is a gate and not a task row.** Three things follow, and none is the maker's call:

1. **P1 status.** B18 is one of the criteria P1 is described as satisfying. If it is a stub, the
   honest statement of where the product stands changes. Somebody will otherwise repeat "P1 is built
   end to end" in front of a customer.
2. **Sequencing.** T-010 is building `relevance.ts` for the **live-card** surface only. The scribe
   and summary surfaces — which ship today and have no B18 code whatsoever — are not covered by any
   queued unit. The T-039 maker argues a scribe-side B18 unit is **more urgent than T-010's fix**,
   since T-010 has one-bug code and the scribe has none. That is a priority call.
3. **Scope.** Threading `destination_countries` / `study_abroad_intent` / do-not-ask into
   `ExtractInputSchema` and `SummaryInputSchema` is a schema change on the scribe's inputs. It
   touches D-013 territory and wants a decision, not a quiet patch.

**Question for Umesh:** given B18's scribe/summary surface is empty, does the pilot ship without it
(documented, with the 6 proven leaks listed), or does a scribe-side B18 unit go in front of the rest
of the queue?

**Options:**
- **(a) Queue a scribe-side B18 unit ahead of the remaining work.** Honest, and closes the largest
  known gap between contract and engine. Cost: a schema change on the scribe's inputs plus a
  deterministic filter, and it delays everything behind it.
- **(b) Ship the pilot without scribe-side B18, documented.** Defensible for a supervised pilot where
  a counsellor reviews everything anyway — an irrelevant visa fact shown to a counsellor is noise,
  not harm. Cost: the contract says one thing and the engine does another, and the 6 leaks are real.
- **(c) Narrow B18 in the contract** to what the engine will actually do for the pilot, and record
  the rest as post-pilot. Cost: contract-side work, and it must not become a habit of moving the
  goalposts to wherever the code happens to be.

**Recommendation:** (a) for the do-not-ask / already-approved half, which is cheap and is the part a
counsellor notices immediately (being re-asked something they already confirmed), and (b) with
explicit documentation for the destination-relevance half. Not (c) as a first move — narrowing the
contract to fit the code is the one direction that loses information.

**Related:** the 11 quarantined rows and their Q1-Q11 in `qa/feedback-inbox.md` mark where B18's own
text is unsettled — several would need answering before (a) could be built precisely.

**Answer format:** chat reply. The maker appends `Answered:` here, then a DECISIONS entry.

---

## Claim CONFIRMED independently (T-039 checker, cycle 0, verdict `e418f4f`)

The gate was opened while the claim was still the maker's. It is no longer. A fresh checker,
working from the contract and the tree rather than from the manifest, verified it four ways:

1. `packages/engine/src/cards` **does not exist anywhere on `main`** — not moved, not renamed.
2. The scribe graph has **7 nodes and no relevance node**.
3. `grep -rn 'destination_countries|study_abroad_intent|do_not_ask' packages apps` → **0 hits**
   outside this unit's own fixtures.
4. Behaviourally: an India-only turn emits `visa_requirement` with `dropped: []`, **byte-identical**
   to the same turn for a Canada-bound student.

The checker's framing, which sharpens option (a): *"This is not a missing filter — it is a missing
**input channel**. No prompt work could fix it."*

**One correction to the claim above, from the same verdict.** The text at line 13 saying
`SummaryInputSchema` carries no do-not-ask channel is **wrong in one respect**: `facts[]` *is* a
channel into the summariser, and this unit passed it `[]`. The checker tested the loophole — a real
`Fact` through the real channel — and the visa line still returned verbatim, so **no measured row
changes** and the six leaks stand. But the reason is "the channel exists and is ignored", not "there
is no channel". Tracked as ISS-t-039-3.

**And one thing the gate must now also decide (ISS-t-039-4, new).** B18's *proof clause* in
`qa/contracts/counselling-engine.md` is not satisfiable from this evidence and **must not be booked
as met**. What T-039 measured is "no post-generation relevance filter exists". What the clause asks
for is "an India-only synthetic transcript produces zero visa items". Those are different claims;
only the first is proven. Whichever option is chosen, the proof clause stays open.

**Unchanged:** the question, the three options, and the recommendation — (a) for the do-not-ask half,
(b) documented for the destination half, not (c) first. The confirmation only raises the cost of (b):
the six leaks are now independently witnessed, not self-reported.

---

## Relayed (UNCONFIRMED in this session) — 2026-09-27

A peer session (vc-f5) reports that Umesh answered this gate directly over AskUserQuestion on
2026-09-27 ~17:45 IST, and recorded it to disk in commit `f7f5260` ("checker: record Umesh's six
decisions"), as decision **#1** of six in the `qa/QUEUE.md` block. That block states plainly that
it is "the record, not the authorization", and that the maker still owes this gate its
`Answered:` line and its DECISIONS entry.

**This is deliberately NOT an `Answered:` line.** A peer relay cannot authorize an append-only
decisions log, however likely it is to be correct — the same rule under which the relayed hook-fix
approval was refused earlier today. A rule that only holds when the relay looks doubtful is not a
rule. The relayed content is preserved here so nothing is lost if that session ends.

Umesh has been asked in the maker session for a one-line confirmation. On his confirmation the
`Answered:` line and the DECISIONS entry are written the same turn; until then this gate counts as
unanswered for sweep purposes.
