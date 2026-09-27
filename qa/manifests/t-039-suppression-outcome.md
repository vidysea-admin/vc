# Manifest — t-039-suppression-outcome

**Contract:** qa/contracts/counselling-engine.md, B18 (context relevance — an India-only student gets
zero visa items; an already-approved fact is never re-asked; nothing on the do-not-ask list is
raised; "proof is an outcome test on synthetic transcripts... a test that only checks a filter
function exists does not count").
**Goal task:** T-039 stage 2 (TASKS.md: "ISS-077 part 2 + the B18/O8 queue line ... `consumes:` scribe
graph, cards relevance"). Stage 1 (commit `4154cc7`) authored the blind fixture; this is stage 2,
wiring it to the real engine.
**Date:** 2026-09-27
**Fix cycle:** 0 of max 3
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
| `student.destination_countries`, `student.study_abroad_intent`, `do_not_ask`, `facts[]`, `item.topic` (as a filter key), `item.card_type` | **NOT mapped to anything — deliberately** | there is no engine input channel for any of these (headline finding). Inventing one here would mean this file's adapter, not the engine, decides suppression — the exact smuggling the brief warns against. Leaving them unconsumed is the honest choice, and it is why the runnable rows' real, reproducible answer is always "surface": nothing downstream ever reads them. |
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
- **Not touched:** `packages/engine/tests/fixtures/b18-suppression-blind.jsonl`,
  `...-unsettled.jsonl` (both stage-1 files, zero rows edited/moved), `qa/contracts/**`,
  `docs/DECISIONS.md`, `ARCHITECTURE.md`, `.claude/**`, `TASKS.md`, `qa/feedback-inbox.md`,
  `qa/issues.jsonl`, any engine source file in the bound worktree.

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

## Status: ready-for-check
