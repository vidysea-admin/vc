# Verdict — t-036-independent-oracle

**Date:** 2026-09-27
**Cycle checked:** 1
**Checker:** fresh Claude subagent (Mode A unit check, claude-opus-subagent), bound to
`D:/vc/.worktrees/t-036-independent-oracle`
**Base commit:** `19f75e2` · **Head commit:** `b9966fb` (working tree clean, `git status --porcelain` empty)
**Prior cycle:** the cycle-0 verdict (VERDICT: FAIL, ISS-t-036-1) is preserved verbatim in git at commit
`715e836`; this file now carries the cycle-1 verdict. Nothing from cycle 0 was softened — every cycle-0
FAILURE was re-tested below on its own terms.

---

## 1. What I re-ran myself (bound tree, nothing trusted from the manifest)

| command | my result |
|---|---|
| `pnpm -C packages/engine exec tsx --test tests/scribe-auto-verify-property.test.ts` | exit 0, **tests 9 / pass 9 / fail 0**; `[t036-regression] … rows=102 positive=30 negative=72 failures=0`; `[t036-blind] independent oracle asserted=78 (verify=1 review=77) failures=0` + the 24-row quarantine report. Matches the manifest. |
| `pnpm -C packages/engine test` | exit 0, **tests 596 / pass 596 / fail 0**. Matches. |
| `pnpm -r typecheck` | exit 0, all 9 workspace projects `Done`. Matches. |

## 2. Are the two cycle-0 FAILURES actually addressed?

**FAILURE 1 (23/102 rows copied from `nodes.ts` comments / pre-existing probes) — ADDRESSED, verified
mechanically, not on assurance.** I re-ran the cycle-0 checker's own containment test against the NEW
fixture: I extracted the base-commit (`19f75e2`) text of `nodes.ts`,
`scribe-auto-verify-property.test.ts`, `scribe-citation-rescope.test.ts`, plus the old fixture at
`d4d2e49`, concatenated them, and tested every one of the 102 blind rows' `text` for exact substring
containment (and again with the trailing period stripped).

```
blind rows byte-contained in base nodes.ts/tests/old fixture: 0 []
also matching without trailing period: 0 []
```

**Zero.** The duplication that sank cycle 0 is structurally gone. Independent corroboration that the
authoring context really was blind, beyond the process claim: the rows use key spellings this repo does
not have (`budget`, `ieltsScore`, `boardPercentage`), name exams the engine has no key for (JEE, NEET),
and name a country outside the engine's vocabulary (Netherlands). An author who had read `nodes.ts`
would have used `budget_inr_per_year`, `ielts_overall`, `class12_percentage` and stayed inside the alias
list. That behavioural signature is worth more than the process claim, and it points the same way.

**FAILURE 2 (the false blind-authorship prose) — ADDRESSED.** The file header now says in plain words
that `auto-verify-oracle.jsonl` is "**NOT an independent oracle**", that the earlier "written … BEFORE
reading the SPEC_* grammar … or the engine's templates in `nodes.ts`" claim "was false", cites the
cycle-0 verdict and `nodes.ts:515-517`, and states the fixture is "retained ONLY as REGRESSION coverage".
The test's own name now begins `T-036 regression oracle (NOT independent -- 23/102 rows are copies of
nodes.ts comments and pre-existing probes)`, the block header repeats the withdrawal, and
`qa/manifests/t-030-template-gap.md:40-46` carries the matching "Correction 2". All four read as
withdrawals, not as quiet deletions. The new block states its independence as a *mechanism* and adds, in
the same paragraph, that it "is a process claim about a separate context, not a proof".

## 3. Q4 — RULING ON THE FIVE ROW CORRECTIONS: **RATIFIED**

The five rows (`blind-pos-budget-01, -03, -05, -07, -09`) were moved `verify` → `review` because the
student typed "20 lakh rupees" while the row's `value` is `2000000`. **I ratify all five corrections.**

Reasoning, on the contract text alone and independently of what the code does:

- B2, verbatim: *"Only two kinds auto-verify at full confidence: **typed numbers**, and values matching
  a fixed country/alias vocabulary, matched as whole words."* `2000000` is not a typed number in
  "Mera total budget 20 lakh rupees hai" — `20` is. The digits `2000000` appear nowhere in the turn, in
  any script, in any form. The value is the extractor's arithmetic, not the student's keystroke.
- D-026, verbatim: *"the student … said this value, for this key, **in their own words** (matched against
  the original-language text, not only `translatedText`) …"*. The clause that carries the weight here is
  "matched against the original-language text": there is no match for `2000000` to be made against the
  original-language text. The candidate contrary reading — that "in their own words" *licenses* a
  normalised numeric because "20 lakh" is the student's own wording of that quantity — cannot survive
  B2's "typed numbers", which is about the token, not the quantity. On that reading "typed" would carry
  no work at all, and B2's whole point (D-020) was to shrink auto-verify to things that can be matched
  literally.
- The correction runs in the **safe** direction (verify → review), so it cannot be a way of hiding a
  leak; and it is the *stricter* answer, so it does not buy the unit a pass it would otherwise miss —
  the engine already answered `review` for these rows either way.

Two checks that this was a principled call and not a convenient one, both of which I verified:

1. **Internal consistency.** The five quarantined budget rows (`-02, -04, -06, -08, -10`) have values
   that ARE typed exactly (`45000` in "45000 dollars", `30000` in "30000 pounds"). They were *not*
   corrected — they were parked on a different, genuinely unwritten ground (the currency word). A
   builder looking for an easy pass would have corrected those too, because correcting them also turns
   them green. He did not.
2. **`blind-neg-wrongkey-05`** carries the same unit-converted shape (`18 lakh rupees` → `1800000`) and
   was already `review`; it was left untouched. No double standard.

Conversely, had I rejected Q4, the only honest alternative was to quarantine those five under a sixth
open question — not to assert `verify` against a value the student demonstrably never uttered. The
correction is the better of the two, and it is backed by a quoted sentence exactly as bucket (c)
requires. **RATIFIED; no revert required.**

## 4. THE HONEST LIMIT — RULING: the block **is** worth something; it is NOT near-vacuous

The builder's disclosure is accurate: asserted split is 1 `verify` / 77 `review`, so the block alone
would also be satisfied by an engine that auto-verifies almost nothing. I judge that this **does not**
hollow it out, for four reasons, three of them mechanical.

1. **The review side is not passive — it is where the leak lever fires.** I reproduced the leak lever
   myself (§6, row 1): removing the `key-not-declared` guard at `nodes.ts:930` turns the blind block RED,
   and the row that catches it, `blind-neg-wrongkey-04`, is one of the 77 **review** rows. A one-sided
   oracle whose single side detects a real widening of the auto-verify surface is a working detector,
   not a label. The "engine that auto-verifies almost nothing" hypothetical is exactly the engine this
   block is *not* aimed at; the failure it is aimed at is the engine that verifies too much, and that is
   the failure ISS-t-030-rev-1 was raised about.
2. **The 77 rows are not 77 of the same thing.** I counted the families: 12 distinct hostile classes ×
   6 rows each — `counsellor` (D-026 clause i), `wrongkey` (clause ii), `translation` (clause iii),
   `multiclause` (clause iv), plus `hedge`, `negated`, `thirdparty`, `question`, `conditional`, `range`,
   `compound`, `devanagari`. All four D-026 clauses have an independently authored hostile family. That
   is a real coverage lattice over the safety property, authored by someone who could not see the guards.
3. **The verify direction is not left unguarded overall — only unguarded *by this block*.** The T-030
   (d) controls, the T-030 positive property (every sampled sentence of the template language
   auto-verifies) and the 30 positive rows of the regression block all carry it. The honest-limit
   statement is about one block, not about the suite.
4. **The one-sidedness is imposed by a contract gap, not chosen by the builder.** The verify direction
   cannot be asserted independently until Q1 is answered (see §5). Parking it and saying so is the
   correct move for an agent forbidden to edit `qa/contracts/**` and forbidden to widen the engine.

**Ruling: ISS-t-030-rev-1 is closed by this unit.** What it asked for — "a hand-written, externally
reviewed positive/negative sentence list per template that is not derived from the regex" — now exists,
with zero derivation from the regex proven by measurement rather than claimed. I am recording the
residual weakness as an **open medium issue (ISS-t-036-2)**, not as a failure of this unit: the blind
oracle cannot detect the engine narrowing further, and that gap should be closed by answering Q1 and
re-asserting the parked positives, not by re-opening T-036.

## 5. THE QUARANTINE — legitimate, with one contract-side caveat I own, not the maker

**No row was deleted, softened, or edited on its way into quarantine.** I proved this rather than reading
it: I extracted the blind author's original fixture at `7823f91` and diffed all 102 rows field-by-field
against the union of the two current files.

```
orig 102 cur 102
missing from cur: set()        new in cur: set()
rows with substantive changes: 5
  blind-pos-budget-01/03/05/07/09 — fields changed: ['expect','why']  (verify -> review)
quarantined count 24
quarantined rows with ANY changed original field: []
```

Exactly the five ratified corrections changed; the 24 quarantined rows are byte-identical to what the
blind author wrote, with only `unsettled` / `open_question` added. Nothing was parked *and* reworded.

**Q2 (`blind-pos-country-08`, Netherlands) — quarantine is correct, and is the only honest call.** B2
says "a fixed country/alias vocabulary" and never enumerates it. Ruling this row *wrong* would mean
defining the contract's vocabulary as whatever `COUNTRY_ALIASES` currently holds — which is precisely
the code-equals-itself circularity ISS-t-030-rev-1 exists to break. Ruling it *right* would freeze
Netherlands into the vocabulary by test. Neither is the maker's to decide. Parked correctly.

**Q3 (`blind-pos-budget-02/04/06/08/10`, currency word on an exactly-typed number) — quarantine is
defensible.** The digits here genuinely are typed and match the value exactly, so on a naive reading B2
says auto-verify and the engine (`unit-multiplier` guard, a D-020 fail-safe) is stricter. But B2's
sentence is framed with "**Only** two kinds auto-verify" — a ceiling, not a floor — so whether a typed
number *must* auto-verify is not stated, and the contract says nothing at all about currency. There is
also a substantive reason these rows are not simply right: the mapped engine key is
`budget_inr_per_year`, and "45000 dollars" is not 45000 INR — reviewing it is arguably *correct*, not
merely strict. Since no contract sentence settles either the unit binding or the sufficiency question,
bucket (b) is right; bucket (c) would have required a sentence that does not exist.

**Q1 (21 rows) — legitimate for the maker to park, but I record a contract-side caveat.** B2 contains
one sentence that leans further toward sufficiency than the manifest allows: *"a test proves a
non-auto-verified fact is marked `needs-review` rather than dropped, **and that a number/vocabulary
match is accepted without review**."* Read strictly, that makes a clean single-clause vocabulary match
contract-*required* to auto-verify, which would make the engine's closed template grammar a B2 deviation
(in the safe direction — not a leak, never a Block under D-026). I do **not** convert this into a
failure of T-036: the maker may not edit `qa/contracts/**`, may not widen the engine, and did exactly
the right thing by quarantining and escalating. Resolving it is contract maintenance, which is mine, and
per the contract-maintenance rule it is decided **away from a pending verdict** — so I am filing it as
**ISS-t-036-3** for the inbox fold-in, not amending B2 inside this verdict.

Q5 (JEE/NEET: no engine key exists, B2 silent on exam scope) and the two negation-fail-safe notes folded
into Q7 are likewise genuinely unsettled. **Verdict on §5: 24/24 quarantined rows are legitimately
unsettled by the contract text. This is not a dumping ground.**

## 6. THE TWO HARNESS NORMALISATIONS — no smuggling found

**(a) `BLIND_KEY_ALIASES` injectivity — verified by hand, not accepted.** The map has 9 entries and 9
distinct targets (`targetCountry`, `budget_inr_per_year`, `ielts_overall`, `toefl_total`, `sat_total`,
`gre_total`, `gmat_total`, `duolingo_score`, `class12_percentage`) — **injective**. I then checked the
property that actually matters, which is that each hostile row's *mismatch survives the mapping*:

| row | text is about | declared key → mapped key | still hostile? |
|---|---|---|---|
| `wrongkey-01` | class-12 boards | `ieltsScore` → `ielts_overall` | yes |
| `wrongkey-02` | IELTS | `toeflScore` → `toefl_total` | yes |
| `wrongkey-03` | NEET | `jeePercentile` (unmapped) | yes |
| `wrongkey-04` | GMAT | `satScore` → `sat_total` | yes |
| `wrongkey-05` | budget | `greScore` → `gre_total` | yes |
| `wrongkey-06` | SAT | `toeflScore` → `toefl_total` | yes |

No two source keys collapse onto one engine key, so no hostile pairing is defused. Empirically confirmed
too: `wrongkey-04` is the row the leak lever catches — it could not be, if the map had neutralised it.

**(b) Numeric coercion and the cited quote — the claimed artifact is REAL.** I read
`assessFactForReview` (`nodes.ts:885-965`) directly. The dispatch is on the runtime type of
`candidate.value`: `typeof … === "number"` takes the typed-number branch; `typeof … === "string"` falls
into the `COUNTRY_ALIASES` branch and returns `"string value is not on the fixed country/alias vocabulary
(B2 auto-verify surface)"`. JSONL gives every `value` as a string, so **without the coercion every
numeric row — all ~50 of them — would indeed have been judged against the COUNTRY vocabulary and
returned `review` for a reason having nothing to do with the row's point**. That is a genuine harness
artifact that would have silently defused half the fixture, and catching it before running is to the
builder's credit, not against him.

The quote substitution (`quote: row.text` instead of the author's span note) runs the same way. `quote`
feeds `normalisedQuote`, which is what `hasMarker(…, FIRST_PERSON_MARKERS)` reads: with the span
("Canada", "7.5") as the quote, **every** row would have tripped `no-first-person` and returned `review`
for free. Using the turn text makes the engine *more* willing to verify, i.e. makes the 77 review rows
*harder* to satisfy, not easier. It cuts against the builder's interest, which is the direction a
smuggled normalisation never runs. Neither conversion changes any row's `expect` — confirmed by the
field-level diff in §5.

## 7. Falsification levers, reproduced in throwaway copies outside the bound root

Two separate copies (`…/scratchpad/t036-row1`, `…/scratchpad/t036-row2`), each built with
`tar --exclude=.git --exclude=node_modules` from the bound tree and independently
`pnpm install --offline --ignore-scripts`. **The bound working tree was never edited** (`git status
--porcelain` empty before and after; `git log` head still `b9966fb`).

**Row 1 — leak lever.** GREEN BEFORE in the copy (its own run, not step 3's):
`✔ T-036-blind independent oracle … (31.922ms)` / `ℹ tests 9 · pass 9 · fail 0`.
Single-hunk edit to a single file named in "What changed" — `packages/engine/src/scribe/nodes.ts`, the
one line `if (allowVerdicts.includes("key-not-declared")) guards.push(REVIEW_REASONS.keyNotDeclared);`
replaced by a comment. RED AFTER:

```
✖ T-036-blind independent oracle: … (32.6007ms)
  AssertionError [ERR_ASSERTION]: 1 of 78 blind-oracle rows disagree with the engine
  + 'blind-neg-wrongkey-04 (negative): expected "review", engine said "verify" [-] -- "Mera GMAT score 650 hai."'
ℹ tests 9 · pass 3 · fail 6
```

The assertion that fired is the block's own row-disagreement assertion naming exactly
`blind-neg-wrongkey-04` — **not** an import, parse or load error (the file compiled; 3 tests still
passed, and the other 5 reds are the pre-existing T-030 properties correctly catching the same guard
removal). **Row 1 reproduced, TRUE.**

**Row 2 — vacuity lever.** GREEN BEFORE in its own copy:
`✔ T-036-blind independent oracle … (27.509ms)` / `ℹ tests 9 · pass 9 · fail 0`.
`auto-verify-oracle-blind.jsonl` truncated to 0 bytes (`wc -c` = 0). RED AFTER:

```
✖ T-036-blind independent oracle: … (17.4444ms)
  AssertionError [ERR_ASSERTION]: expected 78 asserted rows in auto-verify-oracle-blind.jsonl
ℹ tests 9 · pass 8 · fail 1
```

The shape guard's **first** assertion fires, before a single row is run, and nothing else in the suite
moves. **Row 2 reproduced, TRUE.** Row deletion is mechanically impossible: the guard pins 78 asserted,
24 quarantined, 78+24 = 102 accounted for, 102 unique ids (I re-derived all four from the files
independently: 78/24, 102 unique of 102), the 1/77 split, and `unsettled:true` + non-empty
`open_question` on every quarantined row.

## 8. Diff scope (step 4c), `nodes.ts`, contracts, UI

- `git diff 19f75e2...b9966fb -- packages/engine/src/scribe/nodes.ts` → **0 lines. `nodes.ts` is at zero
  diff**, confirmed against the diff rather than the manifest.
- `git diff 19f75e2...b9966fb --name-only -- qa/contracts docs/DECISIONS.md ARCHITECTURE.md TASKS.md
  .claude` → **0 files**. The 8 contract questions went to `qa/feedback-inbox.md` (Q1–Q8 all present,
  timestamped `2026-09-27`, source line "T-036 blind oracle, fix cycle 1"), and `qa/contracts/**` was not
  touched. Correct: the maker never edits contracts.
- The maker's own commit `b9966fb` touches exactly 6 files, every one of them listed in "What changed".
  The only other files in the `19f75e2...b9966fb` range are `qa/issues.jsonl` and
  `qa/verdicts/t-036-independent-oracle.md`, both written by the **cycle-0 checker** in commit `715e836`
  — not maker scope creep.
- Deletions in the range are prose-only (9 header/comment lines, all of them the withdrawn overclaim).
  **No function, class, export, route, test or config key was deleted or renamed.** The old T-036 test
  was renamed in place; its assertions and all 102 regression rows are intact and still run.
- **No UI surface.** Verified against the diff: changed paths are two JSONL fixtures under
  `packages/engine/tests/fixtures/`, one `.test.ts`, and three markdown files under `qa/`. Nothing under
  `apps/web`, `pages/`, or `components/`. `Persona walk: skip (test-only, no UI surface)` is a true
  reason, so no `false-persona-skip` finding.

## 9. Issues

- **ISS-t-036-1** (cycle-0, high) → **fixed**. Root cause removed and verified at 0/102 duplicates.
- **ISS-t-030-rev-1** (medium) → **fixed**. Both halves delivered: the overclaim reworded, and a
  sentence list per template that is provably not derived from the regex.
- **ISS-t-036-2** (new, medium, open) — the blind block asserts one `verify` row, so it cannot detect the
  engine narrowing further; the independent oracle is one-sided by construction until Q1 is answered.
  Disclosed by the builder; recorded as debt, not charged against this unit.
- **ISS-t-036-3** (new, medium, open) — contract-side: B2's "a test proves … that a number/vocabulary
  match is accepted without review" reads as a sufficiency claim, which would make Q1 settled and the
  engine's closed template grammar a (safe-direction) B2 deviation. For the inbox fold-in / a B2
  amendment decided away from this verdict.

---

```
VERDICT: PASS
SCOREBOARD: 6/6 criteria met, 3/3 invariants hold
FAILURES (if any): none
CAPABILITY-COVERAGE: 2/2 rows reproduced (leak lever: blind block RED naming blind-neg-wrongkey-04 on the
named assertion, from an independently green throwaway copy; vacuity lever: shape guard fires first on
"expected 78 asserted rows", pass 8/fail 1). Both edits single-hunk, single file, file named in "What
changed"; bound tree never edited.
LIVE-BROWSER: not-applicable (no UI surface, confirmed against the diff; changed paths:
packages/engine/tests/scribe-auto-verify-property.test.ts,
packages/engine/tests/fixtures/auto-verify-oracle-blind.jsonl,
packages/engine/tests/fixtures/auto-verify-oracle-blind-unsettled.jsonl, qa/manifests/t-030-template-gap.md,
qa/manifests/t-036-independent-oracle.md, qa/feedback-inbox.md)
ISSUES-WRITTEN: ISS-t-036-2, ISS-t-036-3 (new, medium, open); ISS-t-036-1 and ISS-t-030-rev-1 moved to fixed
EXECUTOR: claude-opus-subagent (checker: claude-opus-subagent, fresh context, no ANTHROPIC_BASE_URL override)
EXPLANATION: Both cycle-0 failures are genuinely fixed and I proved it rather than read it: 0 of 102 blind
rows are byte-contained in the base nodes.ts, the pre-existing tests or the old fixture (the cycle-0 test
re-run against the new fixture), and the withdrawal prose now names the old claim as false in all four
places. Q4 is RATIFIED — B2's "typed numbers" and D-026's "matched against the original-language text"
make 2000000 wrong for a turn that says "20 lakh", and the triage proved principled by leaving the
exactly-typed budget rows and wrongkey-05 uncorrected. The one-sided block is NOT near-vacuous: the leak
lever fires through a review-side row, the 77 rows span 12 hostile families covering all four D-026
clauses, and the one-sidedness is forced by a contract gap the maker may not close. The alias map is
injective and every wrongkey pairing survives it; the numeric-coercion artifact is real (string values
fall into the COUNTRY_ALIASES branch at nodes.ts:946) and the quote substitution cuts against the
builder's interest. 24/24 quarantined rows are byte-identical to the blind author's originals and
genuinely unsettled — though I record, as the contract's owner and away from this verdict, that B2's own
"a number/vocabulary match is accepted without review" leans toward settling Q1 (ISS-t-036-3).
```
