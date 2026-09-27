# Verdict — t-039-suppression-outcome

**Date:** 2026-09-27
**Cycle checked:** 0
**Checker:** fresh Claude subagent (Mode A unit check, claude-opus-subagent), bound to
`D:/vc/.worktrees/t-039-suppression-outcome`
**Base commit:** `2dabcb0` · **Stage-1 commit:** `4154cc7` · **Head commit:** `67f7b9d`
(`git status --porcelain` shows only the untracked `.handoffs/`, no tracked modification)
**Mode:** A, full protocol. Nothing below is taken from the manifest; every number was re-produced.

---

## 1. THE HEADLINE CLAIM — independently verified, TRUE in both halves

The maker's central claim is that contract criterion **B18 has no engine surface at all** on this
branch. I checked both halves against source, not against the manifest.

**Half 1 — the live-card surface does not exist here.**

```
$ ls packages/engine/src/cards
ls: cannot access '.../packages/engine/src/cards': No such file or directory
$ git log --oneline 2dabcb0 -- packages/engine/src/cards
(no output)
$ git show wave/t-010-live-cards:packages/engine/src/cards/relevance.ts | head -3
/**
 * T-010 (contract B18, context relevance): what the live cards must never show or ask.
 *   - a topic the student's own facts make irrelevant (an India-only student gets no visa card);
```

The module exists **only** on the unmerged branch `wave/t-010-live-cards`. I also confirmed that
branch's own checker verdict, on that branch, is `**Cycle checked:** 0` / `VERDICT: FAIL`, naming
`relevance.ts:202 || citedTopics.size > 0` as a real B18 leak. A repo-wide sweep found no other
cards or relevance module anywhere: `find packages apps -path "*cards*" -name "*.ts"` returns
nothing, and the only non-test file in the whole tree matching `relevance|suppress` is
`packages/engine/src/guards/crisis.ts` (the B9 crisis guard, unrelated).

**Half 2 — the scribe has no B18 channel, so no code path could vary on B18's inputs.**

```
ExtractInputSchema = z.object({ turns, sessionEndedAt })
SummaryInputSchema = z.object({ turns, facts })
graph.ts .addNode: consent, crisis, extract, summary, diff, approval, write   (7 nodes, no relevance node)
$ grep -rn "destination_countries|study_abroad_intent|do_not_ask" packages apps   →  0 hits outside
  this unit's own test file and its two fixtures
```

`ExtractInputSchema` genuinely carries no destination, intent or do-not-ask field. There is no
suppression node. **Confirmed: B18 is a stub. The criterion the project has been carrying as a
contract line has zero implementation on `main`, and the only implementation anywhere is on a
branch its own checker failed the same day.** This is the correct and most important finding in
this unit, and the maker reported it accurately.

I went one step further than the maker to make the claim behavioural rather than structural
(checker's own probe, throwaway copy, my own file, not the unit's test):

```
PROBE 1 — India-only transcript ("Main India me hi padhna chahti hoon, bahar nahi jaana."),
          extractFacts fed BOTH target_country=India AND visa_requirement in the same batch:
  facts out: [ 'target_country', 'visa_requirement' ]   dropped: []
PROBE 4 — identical visa candidate, abroad transcript ("I want to study in Canada next year."):
  facts out: [ 'visa_requirement' ]                     — byte-identical outcome
```

Same output for the India-only student and the Canada student, with the India fact sitting in the
same extraction batch. **Zero destination sensitivity, demonstrated, not inferred.**

---

## 2. What I re-ran myself

| command | my result | manifest claim | match |
|---|---|---|---|
| `npx tsx --test packages/engine/tests/b18-suppression-outcome.test.ts` | tests **59**, pass **7**, fail **7**, skipped **45** | 59 / 7 / 7 / 45 | ✅ |
| `pnpm -C packages/engine test` | **exit 1**; tests **679**, suites 0, pass **627**, fail **7**, cancelled 0, skipped **45**; `ELIFECYCLE Test failed` | 679 / 627 / 7 / 45, non-zero | ✅ |
| `pnpm -r typecheck` | **exit 0**, 9 × `Done`, no diagnostics | exit 0, 9/9 | ✅ |
| failing subtest names | `b18-f1-01`, `b18-f1-02`, `b18-f1-04`, `b18-f4-03`, `b18-f6-03`, `b18-f8-02` + parent | same six + parent | ✅ |

Fixture integrity (the failure mode the two-stage design exists to prevent):

```
$ git diff 4154cc7 HEAD -- packages/engine/tests/fixtures/
(empty)
```

**Not one byte of either fixture changed between stage 1 and stage 2.** No `expect` was flipped, no
row moved into quarantine. D-028 blindness is preserved end to end.

Scope discipline (`git diff --stat 2dabcb0 HEAD`, 5 files, 725 insertions, 0 deletions):
`packages/engine/tests/b18-suppression-outcome.test.ts` (new, stage 2, the only stage-2 file),
the two fixtures + `qa/feedback-inbox.md` (all three **stage 1**, commit `4154cc7`), and the
manifest. **Unchanged since `2dabcb0`:** `qa/contracts/**`, `docs/DECISIONS.md`, `ARCHITECTURE.md`,
`.claude/**`, `TASKS.md`, `qa/issues.jsonl`, and **every engine source file**. Verified by
per-commit `git show --stat`: `a95a12a` touches exactly one file.

*Low note, not an issue:* the manifest's "Not touched" list includes `qa/feedback-inbox.md`, which
is true of stage 2 but not of the branch — stage 1 added 69 lines there (the 11 quarantined rows'
open questions, legitimately). A reader diffing the branch against `main` will see a discrepancy.
Scope the claim to the stage next time.

Fixture shape, counted independently of the test's own guard: 55 asserted rows, 43 `live-card`,
7 `scribe-fact`, 5 `summary-line`, 27 `suppress` / 28 `surface`, 11 quarantined. All match.

---

## 3. Are the 6 leaks real? — YES, reproduced independently of the unit's test file

I reproduced three of the six from the fixture row through the engine using **my own probe file in
a throwaway copy**, not the unit's runner, so a bug in the unit's adapter could not manufacture them:

| row | my independent reproduction | result |
|---|---|---|
| `b18-f1-01` (scribe-fact, visa, India-only) | PROBE 1 above — real India-only Hinglish turn, India fact and visa fact in the same extraction batch | `visa_requirement` **emitted**, `dropped: []` → **leak confirmed** |
| `b18-f1-02` (summary-line, visa, India-only) | PROBE 2b — the approved `target_country=India` fact produced by a real `extractFacts` run and passed through the **genuine** `SummaryInputSchema.facts` channel, then a visa summary line | summary returned **verbatim**: `"Still need to confirm her visa timeline."` → **leak confirmed, and confirmed through the real channel the maker left unmapped** |
| `b18-f8-02` (summary-line, known fact re-asked) | PROBE 3 — `"We still need to find out which city she is currently based in."` | returned **verbatim** → **leak confirmed** |

All six are genuine: the engine surfaces exactly what B18 says to suppress.

**But the count is not the finding, and I will not let it be read as six defects.** All six are one
root cause with six witnesses: no relevance layer exists on either surface. Two of the six are also
near-duplicates at the engine level — `b18-f1-01` and `b18-f1-04` both drive key `visa_requirement`
through `extractFacts` and differ only in the row-id-derived turn text, so the engine cannot
distinguish them. The honest summary is **one unimplemented criterion, 6 demonstrating rows,
5 distinct engine inputs**. The maker's own manifest is careful about this in prose; the verdict
records it as the operative framing.

---

## 4. Is "45 not-runnable" honest, or is it hiding disagreements? — HONEST

This is the number a dishonest unit inflates, so I attacked it directly rather than sampling.

- **43 live-card rows.** I counted `"surface": "live-card"` in the fixture: exactly 43, and the
  classifier's only live-card branch keys off that same field, so no non-live-card row can be
  swept in and no live-card row escapes. Could they have been run against *something*? Only against
  `wave/t-010-live-cards:packages/engine/src/cards/relevance.ts`. Doing so would have meant importing
  unmerged code across a worktree boundary, out of this unit's file scope, whose own cycle-0 checker
  **failed** it for a B18 leak — presenting a known-broken module as the oracle. Declining is the
  right call, not an evasion. Nothing else in `packages/` or `apps/` could have served.
- **2 placeholder rows** (`b18-f4-02`, `b18-f8-01`). Verified: `grep -rn "PreBriefCard" packages apps`
  returns only the schema declaration at `packages/schemas/src/schemas.ts:143` and its type alias —
  zero builders. Nothing in the repo synthesizes an `unknown`-valued placeholder fact for an absent
  key, so these two rows have no surface to be measured against. Honest.
- **The decisive check:** the 45 skips do not conveniently cover the hostile rows. The skipped set
  splits 21 `suppress` / 24 `surface` — it is not enriched in the direction that would hide leaks.
  And the *runnable* set is the harder one for the engine, not the easier one: 6 of 10 runnable rows
  fail. A unit inflating its skip count to look good would have skipped the failures, not kept them
  as named red assertions in a suite it knew would go non-zero.

**No disagreement is hidden behind a skip.** Every skip carries a machine-printed reason in the
`node --test` output, and the classifier asserts `runnable + notRunnable === 55`, so a row cannot be
silently dropped.

---

## 5. Adapter mapping: injective? non-mapping honest? — INJECTIVE, one factual error in the justification

**Injectivity: holds, and I hunted specifically for the many-to-one collapse that would defuse
hostile rows.**
- scribe-fact rows: the turn text is `Synthetic transcript sentence for ${row.id} …`, so the row id
  is physically present in the engine input — no two rows can collapse to the same input even when
  they share `item.key`.
- summary-line rows: the input is `row.item.text`; I checked all 5 are distinct strings (5 unique of 5).
- No row is routed through a shared bucket, default or fallback. The classifier's three branches are
  mutually exclusive on `item.surface` plus a 2-element id set.

**Non-mapping: right for three of the four fields, wrong in its stated reason for the fourth.**
- `destination_countries`, `study_abroad_intent`, `do_not_ask`, `topic`: I confirmed by grep that no
  engine input channel exists for any of them. Leaving them unmapped is correct — inventing a channel
  would have made the adapter, not the engine, the thing under test. That is exactly the smuggling
  the design forbids, and the maker was right to refuse.
- **`facts[]` is different, and the manifest is factually wrong about it.** The manifest lists
  `facts[]` among fields for which "there is no engine input channel". There is:
  `SummaryInputSchema = { turns, facts }`. The channel exists, is named identically, and the maker
  mapped it to `[]` for all 5 summary rows. That is an under-mapping of a real, available channel,
  and the stated reason for it is untrue.

I tested whether that error changes any verdict, because an unmapped real channel is precisely how a
row gets conveniently defused. **It does not.** PROBE 2b built a genuine `Fact` via a real
`extractFacts` run, passed it through `SummaryInputSchema.facts`, and the visa line still came back
verbatim. `summarizeSession` does not read `facts` for any relevance purpose. **Outcome-neutral —
no row's answer flips — but the manifest's reasoning must be corrected (ISS-t-039-3), because next
time the same reasoning could hide a channel that does matter.**

---

## 6. Zero over-suppression: is "structurally impossible" sound? — SOUND, and the coverage is therefore unexercisable, not passing

The claim is that on these two surfaces nothing can drop content for relevance reasons, so the
over-suppression direction cannot be produced. I checked the drop paths rather than accepting it:
the only things that withhold on the runnable paths are B2's citation guard in `verifyCandidateFact`
and B1's script-like guard in `summarizeSession`, both content- and destination-blind. My PROBE 1
returned `dropped: []` with a valid citation, and PROBE 4 showed the identical result for an abroad
student — nothing drops on topic. **Reasoning sound.**

Consequence I record explicitly, because the manifest states it correctly but a scoreboard reader
will not see it: **the fixture's over-suppression coverage is currently UNEXERCISABLE, not passing.**
The 4 "agree" rows all expect `surface` and all get `surface` from an engine that surfaces
unconditionally — they are passing vacuously. The real over-suppression risk lives in the 43
live-card rows and is already evidenced by T-010's `relevance.ts:202`, which this bound root cannot
see. **On this branch, the only verified B18 signal is the under-suppression direction.**

---

## 7. Falsification levers — both reproduced independently, in my own throwaway copy

Copy: `…/scratchpad/chk039`, made with `git archive 67f7b9d | tar -x`, `pnpm install --offline`
(Done in 41.2 s). **The bound worktree was never edited** — `git status --porcelain` on it still shows
only the untracked `.handoffs/`.

**Lever A (real leak lever in `verifyCandidateFact`).** Baseline in the copy, before any edit:
`tests 59 / pass 7 / fail 7 / skipped 45`. Single hunk at `packages/engine/src/scribe/nodes.ts:995`,
right after `const candidate = shape.data;`, dropping key `crisis_escalation_record`. After:

```
ℹ tests 59  ℹ pass 6  ℹ fail 8  ℹ skipped 45
✖ failing tests:
✖ b18-f10-04 (scribe-fact): B18 B4-exception-D-027+B9 says "surface"
```

Pass count fell by exactly 1, fail rose by exactly 1, and the **newly named** failing assertion is
exactly `b18-f10-04` — the safety-critical row. No other row moved. Reverted; baseline restored to
`7 / 7 / 45`, verified by re-run.

**Lever B (shape guard fires before any row runs).** Single operation: truncate the 55-row fixture to
its own first 5 rows. After:

```
✖ T-039 shape guard: fixture counts, unique ids and the asserted/quarantined split are exactly what stage 1 produced
  AssertionError: asserted (b18-suppression-blind.jsonl) row count drifted
ℹ tests 9  ℹ pass 2  ℹ fail 5  ℹ skipped 2
```

The shape guard fires by name and is printed first. A gutted fixture can never pass vacuously.
Reverted; 55 rows restored.

Both levers are genuine: the file is a falsification instrument, not a reporting script.

---

## 8. THE DEFERRED DECISION — my ruling on the red suite

**Ruling: the measurement stands and the unit passes. The branch does NOT merge to `main` in its
current red state. The 6 rows convert to known-gap tripwire assertions before merge — not to
`test.todo`, not to bare `skip`.**

Both directions the brief names are real, and neither pure option is acceptable:

- **Keep it red and merge.** A non-zero `pnpm -C packages/engine test` on `main` destroys the one
  shared signal every other unit's checker leans on — T-037's verdict quoted "1162 green" as its
  evidence. A `main` that is red for a known reason trains every subsequent agent and human to read
  "tests fail" as "yes, the usual seven", and within a day someone routes around it or, worse, a new
  real failure hides inside the expected seven. No owner, no deadline and no closing condition is
  attached to the red state, so it has no natural end.
- **Convert to `test.todo` / bare skip.** This is precisely how a demonstrated, reproduced defect
  becomes invisible. Nothing ever trips when B18 lands, nobody is prompted to revisit, and the unit's
  whole achievement — proving the criterion is a stub — evaporates into a silently-skipped line.

**The third option is available here and is strictly better than both.** For each of the 6 rows,
assert the **currently measured** behaviour with the contract expectation named in the assertion, so
the test is green today and **fails loudly the moment B18 is implemented**:

```ts
// KNOWN B18 GAP — ISS-t-039-1. The contract (fixture `expect`) says "suppress"; the engine has no
// relevance layer, so it returns "surface". This assertion pins the GAP, not the contract.
// When B18 lands this assertion FAILS — that is the tripwire. Delete it and restore the real
// `assert.equal(got, row.expect)` for this row.
assert.equal(got, "surface", `${row.id}: KNOWN B18 GAP (ISS-t-039-1) — contract expects "${row.expect}"`);
```

Why this and not a skip: the defect stays machine-tracked, the suite stays green, the subtest name
carries `KNOWN-GAP` and the issue id so no reader mistakes it for B18 being satisfied, and — the
part a skip can never give — **it is self-revisiting**: implementing B18 breaks the build and forces
someone to open this file. The fixture's `expect` fields stay untouched, so D-028 blindness and the
ground truth survive intact.

**Conditions, stated exactly as the brief requires.**

Before this branch may merge to `main`:
1. **ISS-t-039-1** must exist and be open (the B18 implementation gap itself, high, with the 6 row
   ids and the root cause). Written by me below.
2. **ISS-t-039-2** must be closed (the conversion above), and its `regression_check` must be
   `pnpm -C packages/engine test` exiting **0** with `fail 0`.
3. Every converted subtest's **name** must contain `KNOWN-GAP` and `ISS-t-039-1`, so the string is
   greppable from the test output alone without reading the file.
4. The shape guard and both structural-finding tests stay as real assertions — they are what make
   the gap's *existence* machine-checked, and structural finding 1 (`src/cards` absent) and finding 2
   (schema shapes) already fail automatically if the situation changes.

**Guarantee that the tripwires are ever revisited:** unlike a skip, they are enforced by the compiler
of reality — the assertions fail on the first commit that implements suppression. Structural finding 2
additionally fails the moment `ExtractInputSchema` or `SummaryInputSchema` grows a field. There is no
path to implementing B18 that leaves this file untouched and green.

This conversion is small, mechanical and scoped to the one file stage 2 owns. The maker may take it
as **fix cycle 1 on this branch** (recommended — it keeps the unit whole) or as an immediate
follow-up before merge. Either way, **`main` does not take a red suite.**

---

## 9. The three disclosed open gaps — my rating

**Gap 1 (TASKS.md's T-039 row is stale — names `cards relevance` as consumed).** *Agreed, confirmed.*
I read the row: `consumes: scribe graph, cards relevance`. The second half does not exist on any
checker-accepted branch. The row was written assuming T-010 would have landed. Real, minor,
correctly disclosed. The recommendation — re-run the 43 rows once T-010 merges, no fixture change
needed — is right, and the classifier already isolates them by `item.surface`.

**Gap 2 (the scribe needs its own B18 task, independent of T-010 and MORE urgent).** *I rate this
CORRECT and I endorse it as the primary action out of this unit.* The maker's argument is that T-010
has code with one known bug while the scribe has no code at all, and the evidence supports it on
three counts I verified myself: (a) the structural absence is total — not a missing filter but a
missing *input channel*, so no amount of prompt work could fix it; (b) it is demonstrated, not
theoretical — 6 reproduced leaks, including my own PROBE 1 where the India fact and the visa fact
were in the same batch and the engine still emitted both; (c) the two surfaces are contract-named —
B18's second bullet says "suppressed in scribe output, **the summary** and (from T-010) live cards",
so the scribe and summary are B18 obligations *today*, with the live-card clause explicitly deferred
to T-010 by the contract's own parenthesis. The contract defers cards; it does not defer the scribe.
One refinement to the maker's scoping: threading `destination_countries`/`study_abroad_intent`/
`do_not_ask` into `ExtractInputSchema`/`SummaryInputSchema` is a **schema change on a merged, widely
consumed interface**, not a localized filter addition, so that task needs its own plan gate rather
than being slipped in. And per B6 the filter must be code, not prompt — the maker names this
correctly.

**Gap 3 (`b18-f4-02` / `b18-f8-01` need a future pre-brief surface).** *Agreed, verified, low.*
`PreBriefCardSchema` exists as a type with zero builders. Not this unit's to resolve.

**Gap 4 (the red-suite shape).** Ruled on in §8.

---

## 10. One thing the maker did not disclose, which I am adding

**This unit is not yet B18's contractually-required outcome test, and the manifest does not say so.**
B18's proof clause reads: *"Proof is an outcome test on synthetic transcripts. An India-only student
produces zero visa items… A test that only checks a filter function exists does not count (B14)."*

In both runners the LLM is a `MockProvider` whose output is dictated by the fixture row: the
scribe-fact runner hands `extractFacts` the candidate it then looks for, and the summary runner cans
`summarizeSession` to return `row.item.text` and checks it came back. What is therefore measured is
**"no post-generation relevance filter exists on this path"** — which is exactly the right question
given the structural finding, and is genuinely stronger than B14's forbidden "a filter function
exists" test, since it asserts an outcome on a real node. But it is **not** "an India-only synthetic
transcript produces zero visa items", because the transcript is a synthetic id-bearing sentence and
the model's behaviour is stubbed out.

This does not reduce the unit's value — with no channel and no filter, a real-provider test could
only reconfirm the same structural fact more expensively. It matters because **B18's proof clause
must not be recorded as satisfied by this unit.** When the gap-2 implementation task lands, it owes a
real-transcript outcome test. Logged as ISS-t-039-4 so the obligation is not quietly discharged.

---

## 11. Findings

| id | sev | finding | regression_check |
|---|---|---|---|
| ISS-t-039-1 | **high** | B18 is unimplemented on the scribe-fact and summary-line surfaces: no relevance node, and `ExtractInputSchema`/`SummaryInputSchema` carry no destination / intent / do-not-ask channel, so no code path can vary on B18's inputs. 6 reproduced leaks (`b18-f1-01`, `-f1-02`, `-f1-04`, `-f4-03`, `-f6-03`, `-f8-02`), all under-suppression, one root cause. | `pnpm -C packages/engine exec tsx --test tests/b18-suppression-outcome.test.ts` |
| ISS-t-039-2 | **high** | `pnpm -C packages/engine test` exits 1 on this branch (679/627/**7**/45). Merge gate: convert the 6 to KNOWN-GAP tripwire assertions per §8 before `main`. | `pnpm -C packages/engine test` → exit 0, `fail 0` |
| ISS-t-039-3 | medium | Manifest states `facts[]` has "no engine input channel"; `SummaryInputSchema.facts` is exactly that channel and was mapped to `[]`. Checker probe proved it outcome-neutral, but the reasoning is wrong and must be corrected. | checker PROBE 2b (real Fact through `SummaryInputSchema.facts`) |
| ISS-t-039-4 | medium | Not yet B18's required outcome test: provider mocked and item content dictated by the fixture, so the unit measures "no post-generation filter", not "an India-only transcript produces zero visa items". | a real-provider / real-transcript outcome test, owed by the gap-2 task |
| ISS-t-039-5 | low | 43 live-card rows unexercised and the over-suppression direction unexercisable; re-run unchanged once T-010 merges. | re-run the file after `cards/relevance.ts` lands |

---

## 12. Why this PASSES

The unit was asked to measure, and the measurement is sound in every way I could attack it. The
headline claim is true and I proved it three independent ways (filesystem, live Zod schema shapes,
and behavioural probes showing byte-identical output for an India-only and a Canada student). The
fixture is byte-untouched since stage 1, so the two-stage blind design held. The skip count is not
inflated — the skipped set is not enriched toward `suppress`, and the runnable set is the harder one.
The mapping is injective with the row id physically present in the engine input. Both falsification
levers reproduce exactly, moving exactly one named assertion each. Typecheck is clean. And the maker
took the costly honest option — a red suite it knew a checker might reject — rather than the cheap
green one.

The three things I found that the maker got wrong (the `facts[]` channel claim, the un-stated gap
between this test and B18's proof clause, the "not touched: feedback-inbox" scoping) are accuracy
defects in the write-up, not defects in the measurement, and none of them flips a row. They are
logged, not waived.

The red suite is a merge question, not a measurement question, and I have ruled on it in §8 with a
concrete shape and closing conditions rather than handing it back.

```
VERDICT: PASS
SCOREBOARD: headline claim (B18 unimplemented) VERIFIED TRUE, 3 independent ways · 6/6 leaks real, 3
reproduced by the checker's own probes outside the unit's test file · 45 not-runnable HONEST (43
live-card confirmed by count + repo-wide sweep; 2 placeholder confirmed by zero PreBriefCard builders;
skip set splits 21 suppress / 24 surface, not enriched toward hiding leaks) · adapter mapping INJECTIVE
(row id present in every engine input; 5/5 summary texts unique; no shared bucket) · non-mapping honest
for 3 of 4 fields, one false justification (`facts[]`) proven outcome-neutral · zero-over-suppression
reasoning SOUND, coverage recorded as UNEXERCISABLE not passing · fixture byte-untouched since 4154cc7
(`git diff 4154cc7 HEAD -- fixtures/` empty) · stage 2 touched exactly 1 file · contracts/DECISIONS/
ARCHITECTURE/.claude/TASKS/issues.jsonl/engine source all unchanged since 2dabcb0 · Lever A RED on
exactly `b18-f10-04` (pass 7→6, fail 7→8, no other row moved), Lever B RED on the named shape guard,
first · re-runs: targeted 59/7/7/45 ✅ · full engine exit 1, 679/627/7/45 ✅ · `pnpm -r typecheck` exit 0,
9/9 ✅ — every manifest number matched
FAILURES: none blocking the unit. Merge to `main` IS blocked until ISS-t-039-2 is closed (red suite →
KNOWN-GAP tripwire assertions naming ISS-t-039-1; `pnpm -C packages/engine test` must exit 0). Accuracy
defects logged, not waived: ISS-t-039-3 (false "no channel" claim for `facts[]`), ISS-t-039-4 (B18's
proof clause is NOT satisfied by this unit — mocked provider, dictated item content).
CAPABILITY-COVERAGE: B18 scribe-fact surface 5/7 rows exercised (2 unrunnable), B18 summary-line
surface 5/5 exercised, B18 live-card surface 0/43 (module absent) → 10/55 asserted rows exercised,
4 agree / 6 disagree, all disagreements under-suppression; over-suppression direction 0/27 exercisable
on this branch (structurally impossible, §6); B2 citation guard and B1 script-like guard exercised
incidentally as the only live drop paths; 11 quarantined rows reported, never asserted (correct).
LIVE-BROWSER: n/a — test-only unit, `surface: none (test-only)` in TASKS.md line 49, verified. Persona
walk skipped with a TRUE reason: no UI surface exists or changed; no engine or app file was touched.
ISSUES-WRITTEN: ISS-t-039-1 (high, open), ISS-t-039-2 (high, open, merge gate), ISS-t-039-3 (medium,
open), ISS-t-039-4 (medium, open), ISS-t-039-5 (low, open)
EXECUTOR: claude-opus-subagent (checker, fresh context, bound to
D:/vc/.worktrees/t-039-suppression-outcome; throwaway copy at scratchpad/chk039 via `git archive` +
`pnpm install --offline`; shared test lock directory absent = free, no wait)
EXPLANATION: The headline is true and it is the most important thing here: B18 is a stub. Not a missing
filter — a missing input channel, so no code path could suppress even in principle, on either surface
the contract names for today. I proved it structurally (no `src/cards` anywhere in the repo; 7 scribe
nodes, none for relevance; `ExtractInputSchema = {turns, sessionEndedAt}`) and then behaviourally, with
my own probes rather than the unit's: an India-only Hinglish turn with the India fact and the visa fact
in the SAME extraction batch still emits the visa fact, `dropped: []`, byte-identical to a Canada
student's result. The 6 leaks are real, and I reproduced three outside the unit's test file so an
adapter bug could not have manufactured them — including `b18-f1-02` through the genuine
`SummaryInputSchema.facts` channel the maker wrongly claimed did not exist, which closes the one
loophole in its own reasoning without flipping any row. The 45 skips are honest by the test that
matters: a unit inflating them would have hidden the failures, not shipped them as named red assertions
in a suite it knew would go non-zero. Six leaks is six witnesses to one root cause, not six defects, and
two of them are the same engine input — I record it that way so the number is not mistaken for the
finding. On the deferred call I refused both offered options: a red `main` destroys the green signal
every other checker cites and has no closing condition, while `test.todo` is how a proven defect
disappears. The 6 become KNOWN-GAP tripwire assertions that pin the current behaviour, name
ISS-t-039-1 in the subtest name, and FAIL the day B18 is implemented — green suite, visible defect,
self-revisiting, fixture `expect` untouched so D-028 blindness survives. That is the merge gate. The
unit itself passes: it was asked to measure and it measured honestly, taking the costly option over the
cheap one. Gap 2 is correct and is the primary action out of this unit — the scribe's B18 gap is more
urgent than T-010's, because the contract defers live cards by its own parenthesis and defers nothing
about the summary, and because zero code is further from done than buggy code. One caveat the maker
should have stated and did not: with a mocked provider and fixture-dictated content, this is not yet
B18's required outcome test on synthetic transcripts, so B18's proof clause must not be booked as
satisfied (ISS-t-039-4).
```

---
---

# CYCLE 1 — fix cycle 1, ruling on ISS-t-039-2 (the merge gate)

**Date:** 2026-09-27
**Cycle checked:** 1
**Checker:** fresh Claude subagent (Mode A unit check, fix cycle 1), bound to
`D:/vc/.worktrees/t-039-suppression-outcome`
**Head commit checked:** `b59739f` (`dd95c72` fix cycle 1 test change, `b59739f` manifest correction)
**Predecessor:** cycle 0, `e418f4f`, `VERDICT: PASS` with a hard merge gate (ISS-t-039-2)
**Scope of this cycle:** rule on whether the KNOWN-GAP tripwire conversion the cycle-0 verdict
prescribed (§8) was actually delivered, and whether the merge gate lifts. Nothing below is taken
from the manifest; every number was re-produced independently.

## What I verified, and how

**1. The merge gate — re-derived, not accepted.**

```
$ pnpm -C packages/engine test > /tmp/t039_full_test.log 2>&1; echo "REAL_EXIT=$?"
REAL_EXIT=0
ℹ tests 679 / pass 634 / fail 0 / skipped 45
$ pnpm -r typecheck > /tmp/t039_typecheck.log 2>&1; echo "REAL_EXIT=$?"
REAL_EXIT=0   (9/9 workspace projects "Done", no diagnostics)
```
(Exit code captured via a redirect-then-`$?`, not through a pipe to `tail`, to avoid reading
`tail`'s exit status by mistake — the first attempt did exactly that and I caught it before relying
on it.) Both numbers match the manifest's claim exactly: 679/634/0/45, exit 0; typecheck 9/9, exit 0.
**The merge gate's own regression_check now passes for real.**

**2. Are the 6 tripwires real assertions, not decoration?**

Read `dd95c72`'s diff directly (`git show dd95c72 -- packages/engine/tests/b18-suppression-outcome.test.ts`).
The change is a purely additive branch inserted before the existing per-row loop:
```ts
if (KNOWN_GAP_IDS.has(row.id)) {
  await t.test(`${row.id} (...): KNOWN-GAP ISS-t-039-1 -- ...`, async () => {
    const got = c.kind === "runnable-scribe-fact" ? await runScribeFactRow(row) : await runSummaryLineRow(row);
    assert.equal(got, "surface", `...`);
  });
  continue;
}
```
Each of the 6 genuinely calls `runScribeFactRow`/`runSummaryLineRow` (the same functions the
non-gap rows use) and asserts on the real return value — not `test.todo`, not `skip`, not
`assert.ok(true)`, no try/catch swallow anywhere in the file. The non-gap branch below it
(`assert.equal(got, row.expect, ...)`) is untouched, byte-identical to cycle 0. **Confirmed real.**

**3. Self-revisiting, re-proven independently — on a DIFFERENT row, with a DIFFERENT lever, in my
own throwaway copy.**

The maker's own falsification lever (manifest "Fix cycle 1" section) simulated B18 landing by
short-circuiting `summarizeSession` for the exact string of row `b18-f1-02` (summary-line). To
avoid rubber-stamping the same row and the same code path, I built my own copy and my own lever
against a **scribe-fact** row instead:

```
$ git archive b59739f | tar -x -C .../scratchpad/chk039-c1 && cd .../chk039-c1/packages/engine
$ pnpm install --offline   # Done in 34.6s
$ npx tsx --test tests/b18-suppression-outcome.test.ts   # BASELINE, unmodified
ℹ tests 59 / pass 14 / fail 0 / skipped 45
```
Single hunk in `src/scribe/nodes.ts`, inside `verifyCandidateFact`, right after
`const candidate = shape.data;` — drops the candidate when its transcript quote names row
`b18-f1-01` specifically (a destination-relevance drop, not a bug, and keyed to content the way a
real filter would be, not to `candidate.key` alone, since `b18-f1-01` and `b18-f1-04` share the key
`visa_requirement` and I wanted to isolate exactly one row):
```ts
if (candidate.source?.type === "transcript" && candidate.source.quote?.includes("b18-f1-01")) {
  return { dropped: { key: candidate.key, reason: "CHECKER-CYCLE1-INJECTED-LEVER: simulated B18 destination-relevance suppression for row b18-f1-01 only" } };
}
```
**RED after, exactly one named tripwire, nothing else moved:**
```
✖ b18-f1-01 (scribe-fact): KNOWN-GAP ISS-t-039-1 -- B18 B18-bullet2 contract expects "suppress", engine currently measures "surface"
  AssertionError [ERR_ASSERTION]: ... + actual 'suppress' - expected 'surface'
ℹ tests 59 / pass 12 / fail 2 / skipped 45
```
Pass fell by exactly 2 (the named subtest + its parent, node:test's standard extra failure for the
enclosing suite — same pattern as the maker's own lever), fail rose by exactly 2, skipped unchanged
at 45, and the only *named per-row* failure anywhere in the output is `b18-f1-01`. `b18-f1-04`
(same key, different row) did **not** move, confirming the tripwire fires on the row's own content,
not on a coarser signal that would sweep in its near-duplicate. Reverted; re-ran the unmodified copy
to confirm `59/14/0/45` restored. **The bound worktree was never touched** — `git status --porcelain`
on it shows only the pre-existing untracked `.handoffs/` throughout, both before and after this lever.
Copy deleted after use.

This closes the loophole the brief specifically warned about: the tripwires do not only fire for the
maker's own string-matched summary line — a differently-shaped lever, on a different surface, on a
row the maker didn't test, produces the same self-revisiting behavior with the same isolation
properties (exactly one row moves, KNOWN-GAP + issue id stay in the failing subtest's name).

**4. Fixtures untouched.**
```
$ git diff 4154cc7 b59739f -- packages/engine/tests/fixtures/
(empty)
```
Confirmed empty. D-028 blindness survives this cycle too.

**5. The two manifest corrections — checked against source, not just presence.**
- ISS-t-039-3 (`facts[]`): the adapter-mapping table's `facts[]` row now states `SummaryInputSchema.facts`
  is a real channel mapped to `[]` (an under-mapping, not a nonexistent channel), and cites the
  cycle-0 checker's own PROBE 2b as the evidence for outcome-neutrality. Read against
  `packages/engine/src/scribe/schemas.ts:133` (`SummaryInputSchema = z.object({ turns, facts })`) —
  accurate.
- `qa/feedback-inbox.md` scoping: `git diff 4154cc7 b59739f -- qa/feedback-inbox.md` is empty
  (stage 2 and this cycle genuinely never touched it), and the manifest's "What changed" section now
  says "not touched **by this stage**" rather than the branch as a whole, with stage 1's 69-line
  addition acknowledged in the same paragraph. Accurate, not just reworded.

**6. Scope.**
```
$ git diff --stat e418f4f b59739f
 .../engine/tests/b18-suppression-outcome.test.ts   |  46 +++++
 qa/manifests/t-039-suppression-outcome.md          | 186 ++++++++++++++++++++-
 2 files changed, 227 insertions(+), 5 deletions(-)
```
Exactly 2 files. `git show --stat` on each of `dd95c72` and `b59739f` individually confirms one file
each (test file; manifest). Nothing in `qa/contracts/**`, `docs/DECISIONS.md`, `ARCHITECTURE.md`,
`.claude/**`, `TASKS.md`, or engine source since `e418f4f`. `qa/issues.jsonl`'s 5-line addition
belongs to the cycle-0 checker's own commit (`e418f4f`), predates this cycle, and this cycle's own
commits touch it not at all.

**7. Nothing weakened.** Test-count deltas fully accounted for:

| run | cycle 0 | cycle 1 | delta | explanation |
|---|---|---|---|---|
| targeted file | 59 / 7 / 7 / 45 | 59 / 14 / 0 / 45 | pass +7, fail −7 | the 6 KNOWN-GAP subtests + their parent test flip fail→pass; nothing else in the file changed |
| full engine | 679 / 627 / 7 / 45 | 679 / 634 / 0 / 45 | pass +7, fail −7 | same 7, no unrelated suite moved |

No previously-passing assertion was loosened, deleted, or moved to skip — confirmed both by the
counts and by reading `dd95c72`'s diff directly (the non-gap branch is untouched). Skip count (45)
is unchanged across every cycle and every one of my own reruns, including inside both falsification
levers — the KNOWN-GAP conversion touches only rows that were already runnable and failing.

## KNOWN-GAP subtest names/messages — would they tell a stranger what's wrong?

Yes. A representative failing name (captured live during my own lever, not copied from the
manifest): `b18-f1-01 (scribe-fact): KNOWN-GAP ISS-t-039-1 -- B18 B18-bullet2 contract expects
"suppress", engine currently measures "surface"`. The assertion message repeats the contract clause,
the row's own `why`, and an explicit instruction to delete the tripwire and restore the normal
assertion once it fires for real. Both the marker and the issue id are in the *subtest name itself*,
so `pnpm test`'s one-line summary and any CI failure list surface them without anyone opening the
file. 45 skips remains the honest number — unaffected by this cycle, and the skip-classification
code is untouched in `dd95c72`'s diff.

## Issues ledger

`qa/issues.jsonl` updated in place (I am the checker; this ledger is mine to maintain, distinct from
`docs/DECISIONS.md`'s append-only rule which does not apply to it):
- **ISS-t-039-2 → `status: fixed`**, `fixed_date`/`verified_date` 2026-09-27, `checker_verdict` recording
  the independent re-run (679/634/0/45, exit 0) and the independent self-revisiting re-proof on a
  different row/lever.
- **ISS-t-039-3 → `status: fixed`**, verified the manifest correction is accurate against source, not
  just present.
- ISS-t-039-1, ISS-t-039-4, ISS-t-039-5 — left open, unaffected by this cycle, correctly so (they are
  not what this fix cycle was for).

No new issue opened: I found nothing this cycle that isn't already covered by an existing ISS id or
by the accuracy notes above.

```
VERDICT: PASS
CYCLE: 1
MERGE GATE ISS-t-039-2: LIFTED. `pnpm -C packages/engine test` independently re-run on b59739f:
EXIT=0 (captured via redirect + $?, not through a tail pipe), 679 tests / 634 pass / 0 fail / 45
skip — matches the manifest exactly. `pnpm -r typecheck`: exit 0, 9/9 Done.
SCOREBOARD: all 6 KNOWN-GAP tripwires are real, genuinely-executed assertions (no test.todo/skip/
swallow) · self-revisiting property re-proven independently on a DIFFERENT row (b18-f1-01,
scribe-fact) with a DIFFERENT lever (content-matched drop in verifyCandidateFact) than the maker's
own (b18-f1-02, summary-line, summarizeSession short-circuit) — exactly one named tripwire moved,
pass 14→12 / fail 0→2 / skip unchanged 45, near-duplicate row b18-f1-04 (same key) did NOT move ·
fixtures byte-untouched since 4154cc7 · scope exactly 2 files since e418f4f (test + manifest),
verified per-commit · both manifest corrections (ISS-t-039-3 facts[] channel; feedback-inbox stage
scoping) checked against source and found accurate, not just present · test-count deltas (+7 pass/
−7 fail, both runs) fully accounted for by the 6 tripwires + their parent test, nothing else moved,
nothing weakened · KNOWN-GAP + ISS-t-039-1 present in every converted subtest's own name, so a CI
failure list alone tells a stranger this is a tracked gap, not a regression · 45 skips unchanged and
still honest.
FAILURES: none. Merge to `main` is clear.
ISSUES-WRITTEN: none new. ISSUES UPDATED: ISS-t-039-2 (open → fixed), ISS-t-039-3 (open → fixed).
ISS-t-039-1, ISS-t-039-4, ISS-t-039-5 remain open, correctly, as noted above.
EXECUTOR: claude checker subagent, fix cycle 1, fresh context, bound to
D:/vc/.worktrees/t-039-suppression-outcome; throwaway copy at scratchpad/chk039-c1 via `git archive
b59739f` + `pnpm install --offline` (34.6s), deleted after use; shared test lock directory absent =
free, no wait.
EXPLANATION: Cycle 0 passed the unit's substance but placed a hard merge gate on the red suite. This
cycle's only job was to rule whether the prescribed KNOWN-GAP conversion actually closed that gate,
and it did: I re-ran `pnpm -C packages/engine test` myself and got exit 0, 679/634/0/45, independent
of the manifest's numbers. I read the diff rather than trusting the description — the conversion is a
purely additive branch that never touches the pre-existing per-row assertion path, so nothing was
softened to reach green. The property the whole ruling depends on is that these tripwires actually
trip when B18 lands, not just when the maker's own test says so, so I built my own lever against a
row and a code path the maker never touched (scribe-fact b18-f1-01 via a content-matched drop in
verifyCandidateFact, instead of the maker's summary-line b18-f1-02 via summarizeSession) — exactly one
named tripwire fired, with the near-duplicate row b18-f1-04 (identical key) correctly staying put,
which is the specific failure mode ("fires on one artificial hunk but not a real implementation") the
brief asked me to rule out. Both manifest corrections check out against source. No assertion was
weakened; the pass/fail deltas across both the targeted file and the full suite are fully explained by
the 6 tripwires and their parent test, nothing else. The merge gate is lifted; this branch is clear to
merge to `main`.
```
