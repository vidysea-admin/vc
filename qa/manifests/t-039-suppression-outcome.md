# Manifest — t-039-suppression-outcome

**Contract:** qa/contracts/counselling-engine.md, B18 (context relevance — an India-only student gets
zero visa items; an already-approved fact is never re-asked; nothing on the do-not-ask list is
raised; "proof is an outcome test on synthetic transcripts... a test that only checks a filter
function exists does not count").
**Goal task:** T-039 stage 2 (TASKS.md: "ISS-077 part 2 + the B18/O8 queue line ... `consumes:` scribe
graph, cards relevance"). Stage 1 (commit `4154cc7`) authored the blind fixture; this is stage 2,
wiring it to the real engine.
**Date:** 2026-09-27
**Fix cycle:** 1 of max 3
**Dual check:** no
**Persona walk:** skip (test-only, no UI surface — `surface: none` in TASKS.md's own T-039 row)
**Issues addressed:** none yet opened against this unit; this run is first contact between the
blind fixture and the engine
**Executor:** claude-sonnet-subagent (maker build subagent, T-039 stage 2)
**Executor rationale:** wiring an already-authored blind fixture to real, existing engine code is
mechanical/plumbing work with a documented adapter — Sonnet-appropriate per the lifecycle rule's
model-escalation guidance, and no cross-system architecture judgement was needed once the
structural findings below were established by direct source inspection.

---

## THE HEADLINE FINDING: B18 has no engine surface on this branch — not for cards, not for scribe

TASKS.md's own T-039 row states this unit `consumes: scribe graph, cards relevance`. Both halves
were checked directly against source, not assumed:

1. **`packages/engine/src/cards/relevance.ts`** (the module that implements B18's destination/topic
   suppression for the `live-card` surface — 43 of the 55 asserted rows) **does not exist on `main`**.
   `git log --oneline -- packages/engine/src/cards` from this branch's base (`main` @ `2dabcb0`)
   returns nothing; the module exists ONLY on the unmerged branch `wave/t-010-live-cards`
   (`git show wave/t-010-live-cards:packages/engine/src/cards/relevance.ts`). That branch's own
   cycle-0 checker verdict (`qa/verdicts/t-010-live-cards.md` on that branch, commit `8e5f918`,
   dated 2026-09-27 — the same day) already **FAILED** the unit and named a real B18 leak:
   `relevance.ts:202 "|| citedTopics.size > 0" lets a clarify card re-ask an already-known topic
   whenever it cites ANY known-topic profile fact, even an unrelated one`. Building an adapter
   against that module from this bound root would have meant (a) reaching across this unit's file
   scope into T-010's own diff, (b) silently importing code its own checker has not yet accepted,
   and (c) presenting a known-broken oracle as if it were settled. None of that is done here.
2. **The scribe graph** (`packages/engine/src/scribe/{nodes,schemas,graph}.ts`, which DOES exist on
   this branch — covers the 12 remaining `scribe-fact`/`summary-line` rows) **has no B18 logic
   either**. `graph.ts`'s `.addNode` calls are exactly consent, crisis, extract, summary, diff,
   approval, write — no relevance/suppression node. More decisively: `ExtractInputSchema` is
   `{turns, sessionEndedAt}` and `SummaryInputSchema` is `{turns, facts}` — **neither carries
   `destination_countries`, `study_abroad_intent`, or a do-not-ask list at all**, so no code path
   through `extractFacts`/`summarizeSession` could vary its answer on them even in principle. Both
   skill prompts (`skills/fact-extraction/SKILL.md`, `skills/session-summary/SKILL.md`) were also
   grepped for `destination|visa|irrelevant|do.not.ask|B18` — zero hits. The two live findings above
   are asserted directly in the test file (`existsSync` on the real path; `.shape` on the real, live
   Zod schemas), not claimed from memory — see the test's "structural finding 1/2" blocks.

**Net effect: every one of the 55 asserted rows targets behaviour that has never been implemented
on any branch that has passed its own checker.** This is a scope/staleness gap in T-039's own
TASKS.md line (written assuming "cards relevance" would exist by the time this stage ran), not a
defect in the stage-1 fixture or in this wiring.

---

## Adapter mapping (rule 3: injective and documented — this is the ENTIRE mapping)

| fixture field | engine field it becomes | why |
|---|---|---|
| `item.key` (scribe-fact rows) | `CandidateFact.key` / the resulting `Fact.key` | direct passthrough, 1:1, injective |
| `item.text` (summary-line rows) | the MockProvider's canned `session-summary` output | direct passthrough, 1:1, injective — the only way to ask "does the merged `summarizeSession` let this exact sentence through" |
| (scribe-fact rows only) a synthetic sentence `Synthetic transcript sentence for ${row.id} (topic: ${row.item.topic}).` | `ScribeTurn.text` / `.translatedText`, and IS the candidate fact's `source.quote` (quote === the whole turn text, so the citation guard's substring check trivially succeeds) | invented ONLY to satisfy B2's citation guard mechanically (a transcript source needs a turn to cite); derived from the row's OWN `id`/`topic`, never from `student`/`facts`/`do_not_ask`, so it cannot smuggle destination information into the engine |
| `student.destination_countries`, `student.study_abroad_intent`, `do_not_ask`, `item.topic` (as a filter key), `item.card_type` | **NOT mapped to anything — deliberately** | there is no engine input channel for any of these (headline finding). Inventing one here would mean this file's adapter, not the engine, decides suppression — the exact smuggling the brief warns against. Leaving them unconsumed is the honest choice, and it is why the runnable rows' real, reproducible answer is always "surface": nothing downstream ever reads them. |
| `facts[]` | `SummaryInputSchema.facts` (summary-line rows only) | **Correction, fix cycle 1 (ISS-t-039-3): this row was originally wrong.** The cycle-0 version of this table claimed `facts[]` had "no engine input channel" alongside the three genuinely-unmapped student fields above. That is false — `SummaryInputSchema = { turns, facts }` names `facts` as a real, live channel, and `runSummaryLineRow` maps it to `[]` for all 5 summary rows, which is an *under-mapping of an available channel*, not a nonexistent one. The checker (verdict §5) tested the loophole directly — a real `Fact` built through a genuine `extractFacts` run, passed through the real `SummaryInputSchema.facts` channel, into `summarizeSession` — and found it outcome-neutral: `summarizeSession` does not read `facts` for any relevance purpose, so no row's verdict flips. The mapping choice (`[]`) stands unchanged; only the stated reason for it is corrected here so the next reader doesn't inherit the false claim. |
| `item.surface === "live-card"` | (none — not-runnable) | no cards module on this branch (finding 1) |
| `item.id` in `{b18-f4-02, b18-f8-01}` | (none — not-runnable) | both ask whether the scribe re-emits an "unknown"-valued placeholder fact for an already-approved key; no code in `packages/` or `apps/` ever synthesizes a placeholder fact for an absent key (`PreBriefCardSchema.knownFacts`/`openQuestions` in `@vc/schemas` has zero builder-function reference anywhere in the repo — `grep -rn "PreBriefCard" packages apps` returns only the schema declaration and its own type alias) |

No row's `expect` was changed. No engine source in the bound worktree was changed to make a row
pass.

---

## Row classification (55 asserted)

| class | count | ids |
|---|---|---|
| not-runnable — live-card (finding 1) | 43 | every `item.surface === "live-card"` row |
| not-runnable — placeholder re-emission | 2 | `b18-f4-02`, `b18-f8-01` |
| **runnable — scribe-fact** (via `extractFacts`) | 5 | `b18-f1-01`, `b18-f1-04`, `b18-f5-02`, `b18-f10-03`, `b18-f10-04` |
| **runnable — summary-line** (via `summarizeSession`) | 5 | `b18-f1-02`, `b18-f4-03`, `b18-f5-04`, `b18-f6-03`, `b18-f8-02` |

**45 not-runnable, 10 runnable, 55 total.**

## Agreement / disagreement on the 10 runnable rows (exact, from the real run)

**4 agree, 6 disagree — 0 over-suppression, 6 under-suppression (leaks).** Every disagreement runs
the SAME direction: `expect: "suppress"`, engine returns `"surface"`. This is mechanically the only
disagreement direction these two runners can produce (`extractFacts` never drops a validly-cited
candidate for content reasons; `summarizeSession` never withholds a non-script-like sentence), so a
row whose runner produced the opposite direction would itself be a bug in this test file, not the
engine — the test's own comments say so and there were none.

| id | surface | expect | engine got | verdict |
|---|---|---|---|---|
| `b18-f1-01` | scribe-fact | suppress | surface | **DISAGREE (leak)** — India-only visa fact slot |
| `b18-f1-02` | summary-line | suppress | surface | **DISAGREE (leak)** — India-only visa mention in summary |
| `b18-f1-04` | scribe-fact | suppress | surface | **DISAGREE (leak)** — India-only, reinforced |
| `b18-f4-03` | summary-line | suppress | surface | **DISAGREE (leak)** — summary narrates an already-approved fact as unknown |
| `b18-f5-02` | scribe-fact | surface | surface | agree |
| `b18-f5-04` | summary-line | surface | surface | agree |
| `b18-f6-03` | summary-line | suppress | surface | **DISAGREE (leak)** — summary quotes the pre-edit (stale) value |
| `b18-f8-02` | summary-line | suppress | surface | **DISAGREE (leak)** — already-known fact phrased as an open question |
| `b18-f10-03` | scribe-fact | surface | surface | agree |
| `b18-f10-04` | scribe-fact | surface | surface | agree |

**Over-suppression: 0 instances — there is no code path capable of producing it on the runnable
surfaces** (neither `extractFacts` nor `summarizeSession` has ANY mechanism that drops or withholds
content for topic/relevance/staleness reasons; the only things that can drop/withhold at all are B2's
citation guard and B1's script-like guard, both content- and destination-blind). This is worth
stating plainly because the brief calls over-suppression the harder failure to notice: on THIS branch
it cannot happen yet for scribe-fact/summary-line, precisely because nothing suppresses anything at
all. The 43 not-runnable live-card rows are exactly where B18 over-suppression risk actually lives
today (`relevance.ts:202`, already caught by T-010's own checker) — this unit cannot see it because
that code isn't in this bound root.

---

## Design decision: runnable rows are individually-named, genuinely-failing subtests (not soft-logged)

Rules 1–3 of this unit's brief forbid two things at once: changing a disagreeing row's `expect`, and
moving a disagreeing row into quarantine on this maker's own authority. T-036's own way out of the
analogous situation (triage each disagreement into a correction, a quarantine, or a confirmed
agreement) is closed off here by design. The only way left to be honest about a currently-unfixed gap
is to let it show up as a currently-failing, individually-named assertion — not a log line inside an
otherwise-green test. So each of the 55 asserted rows is its own `node:test` subtest:

- not-runnable rows are `{ skip: <reason> }` — reported as SKIPPED, never counted as a pass;
- runnable rows genuinely `assert.equal(got, row.expect, ...)` — **6 of them currently FAIL, on
  purpose, left failing.**

**Consequence: `pnpm -C packages/engine test` for this branch returns non-zero** (7 failing
node:test entries: the 6 named rows above + their parent test). This is the accurate, current state
of the code, not a defect in this delivery — see "Actual outputs" below for the full, real
`node --test` output including every failure's assertion message. The alternative (soft-logging
disagreements without failing) was tried first and rejected specifically because it made a real,
reproducible B18 gap invisible to `pnpm test`, which is the opposite of what rule 5's shape guard is
for. **The checker should read this as: this unit correctly reports 6 open, unfixed B18 leaks; it is
this maker's judgement call that "leave them failing, named" is more honest than "make the suite
green by softening the assertion," but the checker may direct otherwise** (e.g. `test.todo`/skip with
an ISS reference instead, if a red `pnpm test` is operationally unacceptable to merge).

---

## Falsification levers (throwaway copies, `git archive` @ `a95a12a` + `pnpm install --offline`;
the bound worktree was never edited)

### Lever A — real leak lever

Copy: `C:\Users\Lenovo\AppData\Local\Temp\claude\d--vc\0054ca0d-a404-4b51-91a8-8494436c429c\scratchpad\t039-levers\lever-a`.

Since this branch has no B18 suppression rule at all to break (the headline finding), the literal
brief ask ("break a suppression rule in engine source") has no direct target. The closest faithful
substitute: inject a single-hunk, realistic bug of exactly the shape a hasty B18 implementation could
introduce — a naive keyword-based filter that accidentally matches a **safety-critical** key
(`crisis_escalation_record`, row `b18-f10-04`, contract clause `B4-exception-D-027+B9`) and drops it.

**GREEN first** (unmodified copy, before the edit):
```
✔ b18-f10-04 (scribe-fact): B18 B4-exception-D-027+B9 says "surface" (26.6884ms)
ℹ pass 7 / fail 7 / skipped 45   (the pre-existing 6 real leaks + their parent are the "fail 7")
```

**The single hunk** (`packages/engine/src/scribe/nodes.ts`, inside `verifyCandidateFact`, right after
`const candidate = shape.data;`):
```diff
   const candidate = shape.data;
 
+  // LEVER-A-INJECTED-BUG (throwaway falsification copy ONLY -- never in the bound worktree):
+  // simulates a naive keyword-based B18 suppression filter that accidentally matches a
+  // safety-critical key and drops it. This is the real-leak lever for T-039 stage 2's manifest.
+  if (candidate.key === "crisis_escalation_record") {
+    return { dropped: { key, reason: "LEVER-A-INJECTED-BUG: simulated over-suppression of a safety-critical key" } };
+  }
+
   const sources = toCitationSources(candidate.source);
```

**RED after** (exact assertion name + message):
```
✖ b18-f10-04 (scribe-fact): B18 B4-exception-D-027+B9 says "surface" (2.7322ms)
  AssertionError [ERR_ASSERTION]: b18-f10-04: expected "surface", the merged engine returns
  "suppress" -- D-027 / the B4 exception says a crisis turn escalates even without a recorded
  consent row. That escalation record must still surface (identifiers and the flag only, never
  transcript text) -- B18's relevance suppression, which is about topical facts, has no bearing on
  this life-safety path and cannot be read to gate it on consent either.
ℹ pass 6 / fail 8 / skipped 45
```
The block names the specific row (`b18-f10-04`) and only that row moves; no other row's verdict
changed (confirmed: pass count dropped by exactly 1, fail count rose by exactly 1).

### Lever B — shape guard fires before any row runs

Copy: `...\scratchpad\t039-levers\lever-b`.

**GREEN first:**
```
✔ T-039 shape guard: fixture counts, unique ids and the asserted/quarantined split are exactly what stage 1 produced (0.81ms)
ℹ pass 7 / fail 7 / skipped 45
```

**The single-hunk edit:** `head -n 5 tests/fixtures/b18-suppression-blind.jsonl` overwriting the
55-row file with its own first 5 rows (a truncation, not a content edit — one operation on one file).

**RED after** (exact assertion name + message, and it is the FIRST failure printed, before the row
runner's own failures):
```
✖ T-039 shape guard: fixture counts, unique ids and the asserted/quarantined split are exactly what stage 1 produced (1.4153ms)
  AssertionError [ERR_ASSERTION]: asserted (b18-suppression-blind.jsonl) row count drifted
  5 !== 55
```
The row-runner test also ran afterward (`node:test` does not abort a file on an earlier test's
failure) and, working from the truncated 5-row array, reported only those 5 rows (2 pass, 3 fail) —
but the shape guard had already fired and printed first, so a truncated fixture can never pass
vacuously or silently: `pnpm test`'s summary line always shows the shape-guard failure by name.

---

## Open gaps (for the checker)

1. **TASKS.md's T-039 row is stale against reality**: it names `cards relevance` as something this
   unit consumes, but that code does not exist on any branch that has passed its own checker (it
   exists only on `wave/t-010-live-cards`, itself cycle-0 FAIL for a real B18 leak). Recommend a new
   task be opened once T-010 merges: re-run the 43 not-runnable live-card rows against the merged
   `cards/relevance.ts` (they need no changes — the fixture and this file's classification logic
   already single out exactly those 43 by `item.surface === "live-card"`).
2. **The scribe graph itself has zero B18 implementation** for the `scribe-fact`/`summary-line`
   surfaces (12 rows), independent of T-010 entirely. This is arguably the more urgent gap: T-010 at
   least has code (with a known bug) for the live-card surface; the scribe graph has none for its two
   surfaces, and 6 of its 10 testable rows demonstrate a real, reproducible leak today. Recommend a
   new implementation task (parallel to T-010, scoped to `packages/engine/src/scribe/nodes.ts` +
   `schemas.ts`: thread `destination_countries`/`study_abroad_intent`/`do_not_ask` through
   `ExtractInputSchema`/`SummaryInputSchema` and add a deterministic (B6: code, not prompt) filter).
3. **`b18-f4-02`/`b18-f8-01`** (placeholder re-emission) may need their own future surface once a
   pre-brief/known-facts UI is built (`PreBriefCardSchema` already exists as a type with no builder);
   until then they stay not-runnable and are not this unit's finding to resolve.
4. This manifest does not decide whether "6 failing named subtests" or "6 skipped/soft-logged rows"
   is the right shape for a merged test file — see the design-decision section above. The checker's
   call.

No entry was added to `qa/feedback-inbox.md`: nothing here is a NEW contract-text ambiguity (B18's
prose is clear that these items must be suppressed); it is an implementation-status gap, which
belongs in TASKS.md/a follow-up task, not the contract-questions inbox.

---

## What changed

- `packages/engine/tests/b18-suppression-outcome.test.ts` — **new**. Shape guard (2 structural
  findings + the 55/11/66/28/27 count guard) + 55 per-row subtests (45 skip, 4 pass, 6 fail) + a
  report-only print of the 11 quarantined rows. Full header comment carries the headline finding and
  the mapping table.
- **Not touched by this stage (stage 2):** `packages/engine/tests/fixtures/b18-suppression-blind.jsonl`,
  `...-unsettled.jsonl` (both stage-1 files, zero rows edited/moved), `qa/contracts/**`,
  `docs/DECISIONS.md`, `ARCHITECTURE.md`, `.claude/**`, `TASKS.md`, `qa/issues.jsonl`, any engine
  source file in the bound worktree. **Correction, fix cycle 1 (checker's "manifest scoping" note):**
  `qa/feedback-inbox.md` was originally listed here as flatly "not touched", which is true of this
  stage's own commit but false of the branch as a whole — stage 1 (commit `4154cc7`) legitimately
  added 69 lines there (the 11 quarantined rows' open questions). The claim is now scoped to what
  stage 2 itself touched, not the whole branch.

## How to verify (commands + expected)

- `npx tsx --test tests/b18-suppression-outcome.test.ts` (from `packages/engine/`) → 59 tests: 7
  pass, 7 fail (named above), 45 skip (named, with reasons).
- `pnpm -C packages/engine test` → 679 tests total: 627 pass, 7 fail, 45 skip (non-zero exit —
  expected, see design-decision section).
- `pnpm -r typecheck` → exit 0, no diagnostics, all 9 workspace projects "Done".

## Actual outputs (from this maker's own run, this session, on the bound worktree)

`pnpm -C packages/engine test` summary line:
```
ℹ tests 679
ℹ suites 0
ℹ pass 627
ℹ fail 7
ℹ cancelled 0
ℹ skipped 45
```
The 7 failures are exactly: the parent test
`T-039 B18 blind fixture vs the real engine (55 asserted rows, one subtest each)` plus its 6 failing
named subtests (`b18-f1-01`, `b18-f1-02`, `b18-f1-04`, `b18-f4-03`, `b18-f6-03`, `b18-f8-02`), each
with the assertion message shown in the "Agreement / disagreement" table above.

`pnpm -r typecheck` (all 9 workspace projects): every line ends `Done`, no diagnostics.

---

## Fix cycle 1 (2026-09-27) — KNOWN-GAP tripwire conversion, merge gate ISS-t-039-2

**Cycle-0 verdict:** PASS (`qa/verdicts/t-039-suppression-outcome.md`), with a hard merge gate:
`main` does not take a red `pnpm -C packages/engine test`. This cycle closes that gate and the two
accuracy findings raised alongside it (ISS-t-039-3, and the "not touched" scoping note).

### The checker's reasoning for the gate (preserved verbatim in substance, from verdict §8)

Cycle 0 left the 6 real, reproduced B18 leaks as genuinely failing named subtests and offered the
checker two ways out: keep the suite red, or convert the 6 to `test.todo`. **The checker refused
both:**

- **Keep it red and merge.** A non-zero `pnpm -C packages/engine test` on `main` destroys the one
  shared green signal every other unit's checker leans on (T-037's own verdict cited "1162 green" as
  evidence). A `main` that is red for a known reason trains every subsequent agent and human to read
  "tests fail" as "yes, the usual seven" — and it has no owner, no deadline and no closing condition,
  so it never ends on its own.
- **Convert to `test.todo` / bare skip.** This is precisely how a demonstrated, reproduced defect
  becomes invisible. Nothing ever trips when B18 lands, nobody is prompted to revisit, and the unit's
  whole achievement — proving the criterion is a stub — evaporates into a silently-skipped line.

The checker's ruling: convert the 6 to **KNOWN-GAP tripwire assertions** — assert the *measured*
(current, wrong) value rather than the fixture's `expect`, name the contract expectation in the
assertion message, and carry both the `KNOWN-GAP` marker and the issue id `ISS-t-039-1` in the
subtest name. This keeps the suite green today while making it **self-revisiting**: the assertion is
pinned to today's wrong answer, so it FAILS the day a relevance layer actually suppresses that row —
which is the tripwire firing, not a regression, and the signal to delete it and restore a normal
`assert.equal(got, row.expect)` for that row.

### What changed in this cycle

`packages/engine/tests/b18-suppression-outcome.test.ts` — added a `KNOWN_GAP_IDS` set (`b18-f1-01`,
`b18-f1-02`, `b18-f1-04`, `b18-f4-03`, `b18-f6-03`, `b18-f8-02`) and branched the per-row subtest: for
these 6, the subtest name becomes `${row.id} (${row.item.surface}): KNOWN-GAP ISS-t-039-1 -- B18
${row.contract_clause} contract expects "${row.expect}", engine currently measures "surface"`, and
the assertion is `assert.equal(got, "surface", ...)` with a message that repeats the contract
expectation, the row's own `why`, and an explicit instruction ("If it just FAILED, B18 has been
implemented for this row -- delete this tripwire and restore `assert.equal(got, row.expect)`."). All
other rows (including the 4 agreeing runnable rows and the 45 not-runnable rows) are unchanged.

**Fixture untouched:** `git diff 4154cc7 HEAD -- packages/engine/tests/fixtures/` is still empty.
Every `expect` field is exactly what the blind stage-1 author wrote (D-028); only this test file's
assertion target changed, and only for the 6 named ids.

**No engine source and no `test.todo`/`skip` was used** for the 6 — both explicitly forbidden by this
fix cycle's brief and by the checker's ruling.

### Corrections to the two accuracy findings (ISS-t-039-3, manifest scoping)

Both are applied in place above (Adapter mapping table and "What changed" section) rather than only
noted here:

1. **ISS-t-039-3 (medium):** the mapping table's cycle-0 claim that `facts[]` has "no engine input
   channel" was false — `SummaryInputSchema.facts` is exactly that channel, and stage 2 mapped it to
   `[]`. The checker's own probe (a real `Fact`, built through a genuine `extractFacts` run, passed
   through the real `SummaryInputSchema.facts` channel) proved this outcome-neutral — no row flips —
   but the stated reason was wrong and is now corrected in the table rather than left standing.
2. **Manifest scoping:** "Not touched: `qa/feedback-inbox.md`" was true of stage 2's own commit but
   false of the branch — stage 1 legitimately added 69 lines there. The claim is now scoped to "not
   touched by this stage."

### Verification (real output, this session)

`npx tsx --test tests/b18-suppression-outcome.test.ts` (from `packages/engine/`):
```
ℹ tests 59
ℹ pass 14
ℹ fail 0
ℹ cancelled 0
ℹ skipped 45
```
All 6 KNOWN-GAP subtests pass (pinned to "surface"); the 4 previously-agreeing runnable rows and the
2 structural findings + shape guard are unaffected.

`pnpm -C packages/engine test`:
```
ℹ tests 679
ℹ suites 0
ℹ pass 634
ℹ fail 0
ℹ cancelled 0
ℹ skipped 45
```
**Exit code: 0.** This is the merge gate (ISS-t-039-2) and it is now closed.

`pnpm -r typecheck`: exit 0, all 9 workspace projects "Done", no diagnostics — unchanged from
cycle 0.

### Falsification lever — proving the tripwire is self-revisiting, not permanently green

Per this cycle's brief, this lever was built and run in a **throwaway copy outside the bound root**
(`git archive HEAD | tar -x` into a scratch directory, then `pnpm install --offline`, done in
~30s) and the bound worktree was never edited for it — confirmed by `git status --porcelain` on the
bound root showing only the pre-existing untracked `.handoffs/` throughout.

**The lever simulates B18 actually being implemented**, rather than breaking something that already
works (that was cycle 0's Lever A). Single-hunk edit in
`packages/engine/src/scribe/nodes.ts`, inside `summarizeSession`, immediately after
`const output = generated.output;`:

```ts
  // LEVER-IMPLEMENTED-B18-INJECTED (throwaway falsification copy ONLY -- never in the bound
  // worktree). Simulates B18 landing a relevance-suppression filter on the summary surface, for
  // exactly the one sentence that is T-039's KNOWN-GAP tripwire row b18-f1-02, so this single-hunk
  // edit flips exactly one tripwire and proves it is self-revisiting rather than permanently green.
  if (output.summary === `Draft summary sentence: "Still need to confirm her visa timeline."`) {
    return SummaryOutputSchema.parse({
      summary: "",
      summaryWithheldReason:
        "LEVER-IMPLEMENTED-B18-INJECTED: simulated B18 relevance suppression (India-only destination makes the visa topic irrelevant).",
    });
  }
```

This targets the exact `item.text` string of row `b18-f1-02` (a summary-line row, India-only,
`B18-bullet2`), so the engine now correctly returns `"suppress"` for that one row and nothing else.

**GREEN before the edit** (unmodified throwaway copy): `tests 59 / pass 14 / fail 0 / skipped 45`.

**RED after the edit** — exactly one tripwire flips, named, with the exact assertion text:
```
✖ b18-f1-02 (summary-line): KNOWN-GAP ISS-t-039-1 -- B18 B18-bullet2 contract expects "suppress", engine currently measures "surface"
  AssertionError [ERR_ASSERTION]: b18-f1-02: KNOWN-GAP ISS-t-039-1 -- B18 contract (B18-bullet2)
  expects "suppress" (B18 bullet 2 names three surfaces explicitly: "suppressed in scribe output,
  the summary and (from T-010) live cards." The summary is one of the named surfaces, so an
  India-only student's summary must not mention visa timelines either.); engine has no relevance
  layer and currently returns "surface". This assertion pins the GAP, not the contract. If it just
  FAILED, B18 has been implemented for this row -- delete this tripwire and restore
  `assert.equal(got, row.expect)`.
  + actual - expected
  + 'suppress'
  - 'surface'
ℹ tests 59
ℹ pass 12
ℹ fail 2
ℹ skipped 45
```
(`fail 2` = the one named subtest above + its parent test, exactly as node:test always reports one
extra failure for the enclosing suite — no other row moved: pass count fell by exactly 2 including
the parent, and the only *named per-row* failure anywhere in the output is `b18-f1-02`.)

This proves the tripwire is genuinely self-revisiting: the moment the engine's real behaviour changes
to match the contract for a KNOWN-GAP row, that row's own assertion — pinned to today's wrong value —
fails loudly, by name, with `KNOWN-GAP` and `ISS-t-039-1` still in the subtest name so a reader of the
failure immediately knows this is the "go delete the tripwire" signal and not a new regression.

**Reverted** immediately after capturing the above: the injected hunk was removed from the throwaway
copy, and a re-run confirmed the copy is green again (`tests 59 / pass 14 / fail 0 / skipped 45`).
The bound worktree (`D:/vc/.worktrees/t-039-suppression-outcome`) was at no point edited to produce
this lever.

### Status of the three prior open issues after this cycle

- **ISS-t-039-1** (B18 unimplemented, high) — stays open; it is the gap the tripwires exist to track,
  not something this cycle closes.
- **ISS-t-039-2** (red suite / merge gate, high) — **closed by this cycle.**
  `pnpm -C packages/engine test` now exits 0 with `fail 0`, verified above.
- **ISS-t-039-3** (`facts[]` false "no channel" claim, medium) — **corrected** in the adapter mapping
  table above.
- **ISS-t-039-4** (B18's proof clause not yet satisfied — mocked provider, fixture-dictated content,
  medium) — unaffected by this cycle; remains open, owed by the future gap-2 implementation task, not
  this unit.
- **ISS-t-039-5** (43 live-card rows unexercised, low) — unaffected; re-run once T-010 merges.
- Manifest scoping note (`qa/feedback-inbox.md` "not touched") — **corrected** in "What changed" above.

Nothing else in this cycle touched `qa/contracts/**`, `docs/DECISIONS.md`, `ARCHITECTURE.md`,
`.claude/**`, `qa/issues.jsonl`, or `TASKS.md`. `git diff --stat` for this cycle's commit shows
exactly one file changed: `packages/engine/tests/b18-suppression-outcome.test.ts`.

## Close-out (maker, after cycle-1 checker PASS)

**Verdicts:** cycle 0 PASS `e418f4f` (with merge gate ISS-t-039-2), cycle 1 PASS `a5b2c2e`
(**gate LIFTED**). **Merged to `main`** — see the merge commit below.

**Main verify after merge:** `pnpm -r typecheck` exit 0, 9/9 Done · `pnpm -r test` exit 0,
**1224 tests, 1179 pass, 0 fail, 45 skipped.**

**One honest change to main's shape, stated rather than buried.** Before this merge every suite on
`main` reported `skipped 0`. It now reports 45. All 45 are this unit's legitimately not-runnable
blind rows (21 suppress-side / 24 surface-side), and the cycle-0 checker verified the skip set is
not enriched toward hiding leaks. But "main has zero skips" was a property other checkers have
cited, and it is no longer true — anyone reading a future suite summary needs to know the 45 are
these, so a new skip elsewhere is not camouflaged by them.

**What the cycle-1 checker proved that the maker could not prove about itself.** The whole ruling
rests on the tripwires being self-revisiting rather than permanently-green comments. The maker's own
lever targeted summary-line row `b18-f1-02` via `summarizeSession`. The checker built its own lever
on a **different row and a different code path** (`b18-f1-01`, via `verifyCandidateFact`), and
confirmed that exactly one named tripwire fired while `b18-f1-04` — same `visa_requirement` key, a
near-duplicate — correctly did **not** move. That rules out precisely the failure mode the brief
warned about: a tripwire that fires only for one string-matched hunk. It also caught itself making
the exit-code-through-a-pipe mistake and re-ran with a redirect.

**Ledger:** ISS-t-039-2 and ISS-t-039-3 flipped open → fixed with `checker_verdict` recorded.
**Still open, and deliberately so** — ISS-t-039-1 (B18 unimplemented; the tracked gap itself, held on
`qa/gates/b18-unimplemented.md`), **ISS-t-039-4 (B18's proof clause must NOT be booked as
satisfied** — what is proven is "no relevance layer exists", not the contract's India-only-zero-visa
test), ISS-t-039-5 (43 live-card rows unexercised until T-010 merges).


## Status: checked-PASS
