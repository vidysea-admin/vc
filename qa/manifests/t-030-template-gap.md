# Manifest: t-030-template-gap

**Contract:** qa/contracts/counselling-engine.md, B2 as amended on main (checker `733cb9f`, D-026, the
auto-verify property: `needsReview:false` = (i) the cited turn's speaker is the student, (ii) the matched
template is bound to this fact's key, (iii) the match is on the original-language text, not
`translatedText` alone, (iv) within one turn). Also B13 (synthetic data only) and B14 (outcome proof).
**Goal task:** T-030 (TASKS.md row T-030), widened by D-025/D-026.
**Fix cycle:** 0 of max 3
**Ledger issues owned:** ISS-069 (key), ISS-070 (speaker), ISS-072 (translation-only), ISS-t-013r-rev-14
(open word gap in COUNTRY_TEMPLATES[0]), ISS-t-013-c2-rev-4 (range / compound eval rows). ISS-071
(cross-turn) is out of scope (wontfix, outside the B2 property).
**Merge:** branch `wave/t-030-template-gap` had WIP from two earlier attempts on top of `7942702`. Stashed it,
merged current main (`8a783bb`: T-013 at `7b14a55`, T-022 at `8a783bb`). The merge was a fast-forward with no
conflicts. Then I restored the WIP (a clean stash pop) and reviewed it; it is kept, with the additions below.
**Commits:** `45eed2c` (the gate, templates, tests, eval rows), `4350fe9` (true-positive recovery), and this
manifest commit.
**Executor:** maker build subagent (Opus). **Offline:** every test is in-process with synthetic transcripts.
There are no network calls and no `.env` reads.

## Scope (files)

- `packages/engine/src/scribe/nodes.ts` (edited in place, template region and gate):
  - `COUNTRY_CONNECTOR_PHRASES` / `COUNTRY_CONNECTOR` (new constants, :498)
  - `COUNTRY_TEMPLATES` (:529)
  - `BUDGET_TEMPLATES` (:563)
  - `SCORE_EXAM_FAMILIES` / `SCORE_SHAPES` / `SCORE_TEMPLATES`. These replace the old flat
    `NUMBER_TEMPLATES` strings, which now form a list built from them.
  - `AUTO_VERIFY_TEMPLATE_SOURCES` (a new frozen export at :650, read only by the tests)
  - `matchesAllowedTemplate` (:725)
  - `declaredKeysForClause` (:750, replaces `clauseMatchesTemplate`)
  - `REVIEW_REASONS` (+`speaker`, `keyNotDeclared`, `translationOnly`)
  - `CitedTurnProvenance` (:848)
  - `assessFactForReview` (:883): it now also takes the `key` and `provenance`.
  - `verifyCandidateFact` (:978): passes the speaker and the original text at :1028.
- `packages/engine/tests/scribe-auto-verify-property.test.ts`: **new file.** The property test is new
  functionality: a closure-check grammar spec with its own parser, enumerator and matcher. It does not fit
  inside the example-based rescope test file. **Correction (T-036, ISS-t-030-rev-1):** that grammar spec
  is transcribed from the same templates it tests, so it is mechanically independent of the JS `RegExp`
  engine but not independent of the production grammar's content -- it can only prove the code equals
  itself. **Correction 2 (T-036 fix cycle 1, ISS-t-036-1):** the first replacement offered for it --
  `tests/fixtures/auto-verify-oracle.jsonl` -- is ALSO not independent. The cycle-0 checker found 23 of
  its 102 rows are byte-for-byte copies of sentences already in `nodes.ts`'s doc comments
  (nodes.ts:515-517) and in this same property test's pre-existing T-030 (d) probes and controls, and
  that all six `neg-speaker-01..06` rows are those controls with `speaker` flipped. Any claim that it was
  authored from B2/D-026 before the implementation was read is withdrawn as false. It is retained only as
  REGRESSION coverage of 102 already-known input/output pairs. The independent check is
  `tests/fixtures/auto-verify-oracle-blind.jsonl` (T-036-blind block), authored in a separate agent
  context structurally forbidden from opening `nodes.ts`, this test file or the older fixture, from the
  prose of B2 + D-026 alone (commit 7823f91). Its first run against the engine found **0 auto-verify
  leaks** and 24 rows the contract does not settle, which are quarantined unasserted in
  `auto-verify-oracle-blind-unsettled.jsonl` and filed to `qa/feedback-inbox.md` (2026-09-27) as open
  contract questions -- unsettled questions, not passing tests.
- `packages/engine/tests/scribe-citation-rescope.test.ts` (extended). The earlier tests that used the free
  keys `score` / `budget` now use the bound keys, since under D-026 those keys correctly need review.
- `packages/engine/evals/score-perfect.test.ts`: 3 new eval tests.
- `qa/evals/scribe/sessions.jsonl`: +43 rows (h37-h70, p13-p21).
- This manifest.

**Not touched:** `qa/contracts/`, `docs/DECISIONS.md`, `ARCHITECTURE.md`, `TASKS.md`, `.claude/**`, any other
package. `assessFactForReview` has no caller outside `packages/engine` (grep checked), so the signature change
stays inside the package.

## What changed

1. **Speaker, clause (i), ISS-070.** `assessFactForReview` adds the `speaker` reason unless
   `provenance.speaker === "student"`. If the provenance is absent, the speaker counts as unknown and the fact
   is not auto-verified.
2. **Key binding, clause (ii), ISS-069.** Every template is an `AutoVerifyTemplate {keys, source}`:
   - Country templates declare `targetCountry` only.
   - A budget template declares `budget_inr_per_year` when the budget is bare, yearly or a maximum. It
     declares `budget_inr_total` when the clause says total, overall, poora or कुल. A clause that states
     both periods matches neither.
   - Score templates are built once per exam family, and each one declares that exam's key:
     `ielts_overall`, `class12_percentage`, `class10_percentage`, `toefl_total`, `pte_overall`,
     `gre_total`, `gmat_total`, `sat_total`, `duolingo_score`.

   `declaredKeysForClause` collects the keys of every template that matches with its value slot holding the
   value. If the fact's key is not among them, the gate adds the reason `key-not-declared`. Examples:
   `budget_inr_total` never verifies from "per year", `nationality` never verifies from a study clause, and
   `budget_usd` / `ieltsBand` / `loanAmount` never verify at all.
3. **Original text, clause (iii), ISS-072.** The clause must be a substantive clause of the turn's `text`. If
   the template clause is found only in `translatedText`, the reason is `translation-only`.
4. **Single turn, clause (iv).** The cycle-3 single-clause rule and the per-turn scope are unchanged.
5. **ISS-t-013r-rev-14.** The open `(?: [\p{L}]+){0,4}?` gap is replaced by at most one phrase from a closed
   set:
   - the connectors computer science / abroad / further / further studies;
   - 12 listed subjects;
   - an optional my/a/an plus the closed DEGREE set.

   Every phrase is 1-2 letter-only words, so the old gap admitted all of them: the change only narrows the
   template. The `my <modifiers> choice` run is now bounded at `{0,3}` (it was an unbounded `*`).
6. **Score surface narrowing (D-025).** A score clause must name its exam once, and its unit must fit the
   key. "My score was 92 in boards" (class 10 or 12 is not said) and "92 marks" (not a percentage) now need
   review.
7. **ISS-t-013-c2-rev-4 eval rows.** Added 13 rows:
   - numeric-range ×6: "15-20 lakh", "1500000 to 2000000", "1500000-2000000", "15 se 20 lakh", "15 से 20
     लाख", "7 to 7.5 IELTS";
   - numeric-compound ×4: "1.5 crore", "20 lakh plus 5 lakh", "2000000 plus 500000", "20 lakh aur 5 lakh";
   - marks-not-percentage ×1;
   - positives p20 (class-12 percent) and p21 (IELTS score).

   The earlier attempts' rows are kept: attributed-gap h37-h48, key / speaker / translation-only h49-h59,
   and connector / total / class-10 positives p13-p19.

Every change moves facts only **toward** `needsReview`. The only additions to the auto-verify surface are
the subjects, the third modifier, "max budget" and the standardised-test families. Each of these was
auto-verified on main (under any key), and is now auto-verified under exactly one declared key. The
"no widening" test pins this.

## How to verify (exact commands; each run under the machine-wide test lock)

```
bash <scratchpad>/vc-testlock.sh pnpm -C D:/vc/.worktrees/t-030-template-gap --filter @vc/engine test
bash <scratchpad>/vc-testlock.sh pnpm -C D:/vc/.worktrees/t-030-template-gap --filter @vc/engine typecheck
python D:/vc/.worktrees/t-030-template-gap/contracts/verify_contracts.py
# (g) true positives before/after (read-only probes; scripts in <scratchpad>/t030-tp-probe.mts, t030-tp-surface.mts)
pnpm -C <wt>/packages/engine exec tsx <scratchpad>/t030-tp-probe.mts   <root> <wt>/qa/evals/scribe/sessions.jsonl
pnpm -C <wt>/packages/engine exec tsx <scratchpad>/t030-tp-surface.mts <root>
```
Here `<scratchpad>` = `C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/6c22744a-b397-4515-a226-3516f0a93a31/scratchpad`, and `<root>` = `D:/vc` (main, "before") or the worktree ("after").

## Acceptance → evidence

| Acceptance | Test id (file) | Result |
|---|---|---|
| (a) single- and two-token insert / replace / delete edits of the finite template language need review unless still in L | `T-030 property (a1)` and `(a2)` (scribe-auto-verify-property.test.ts) | 134383 single-token and 29345 two-token edits outside L, **0 leaks**. Membership is decided by the test's own interpreter, never by a JS `RegExp` call into the engine -- but the grammar itself is transcribed from the same templates, not independent of them (see T-036, ISS-t-030-rev-1). The independent replacement is T-036's blind fixture, not `auto-verify-oracle.jsonl`, which the cycle-0 checker showed is itself code-derived (ISS-t-036-1). |
| (b) random off-grammar sentences need review | `T-030 property (b)` | 20000 checked, 0 leaks |
| (c) flipping one input (speaker, key, translation-only) flips to review, with exactly that one reason | `T-030 property (c)` | 23897 flips |
| (d) the 8 probes of qa/debug/t-013-citation-rescope-cycle3.md (K×4, S×2, P, W) need review, and so does the brief's "…as agent advised in Australia" | `T-030 (d): the 8 debug-report probes…` | all true, each with its named reason; the controls still verify |
| (e) eval rows per class | `ISS-t-013r-rev-14 (T-030): attributed-gap…`, `D-025 (T-030): key-not-declared, counsellor-speaker and translation-only…`, `ISS-t-013-c2-rev-4 (T-030): numeric-range, numeric-compound and marks…` (evals/score-perfect.test.ts) | perfect and case-drift modes both give fabricatedVerified 0; every hostile row is kept with verified 0; every positive verifies |
| (f) reopening each gap turns a named test red | the table below | 5/5 RED |
| (g) true positives before/after | the probes below | golden set 21/21 before and 21/21 after; hostile leaks 19 → 0 |
| the language is not empty (guards against a vacuous pass) | `T-030 property: every sampled sentence of the template language auto-verifies…` | 3951 of 3951 verify (178 cases, \|L\| = 421851778) |

## Capability coverage: falsification (throwaway worktree, not the bound root)

Scratch worktree: `C:/Users/Lenovo/AppData/Local/Temp/claude/t030-falsify` (`git worktree add … HEAD --detach`,
then `pnpm install --offline`), moved to `4350fe9`. The test command was `npx tsx --test
tests/scribe-auto-verify-property.test.ts tests/scribe-citation-rescope.test.ts evals/score-perfect.test.ts`.
Each mutation is an exact-string edit of `nodes.ts` made by `<scratchpad>/t030-mutate.mjs` and reverted
before the next one. The worktree was removed afterwards. GREEN baseline at 4350fe9: `ℹ pass 56 ℹ fail 0`.

| # | Claim | Falsifying edit | GREEN before (same id) | RED after |
|---|---|---|---|---|
| F1 | rev-14 gap closed (clause iv, whole clause) | `(?: ${COUNTRY_CONNECTOR})?` → the old `(?: [\\p{L}]+){0,4}?` | `✔ T-030 property (a1)…`, `✔ ISS-t-013r-rev-14 (T-030): an attributed or unlisted filler…`, `✔ …attributed-gap hostile rows…`, `✔ T-030 (d)…` | `✖ T-030 property (a1)…`, `✖ T-030 property (a2)…`, `✖ ISS-t-013r-rev-14 (T-030): an attributed or unlisted filler…`, `✖ ISS-t-013r-rev-14 (T-030): attributed-gap hostile rows…`, `✖ T-030 (d)…`, `✖ T-030 no widening…`, `✖ T-030 audit: none of the 9 country + 88 number templates…` (pass 46, fail 10) |
| F2 | speaker (i) | delete `if (provenance?.speaker !== "student") guards.push(REVIEW_REASONS.speaker);` | `✔ T-030 property (c)…`, `✔ T-030 (d)…`, `✔ D-025 (T-030)…` | `✖ T-030 property (c)…`, `✖ T-030 (d)…`, `✖ D-025 (T-030): key-not-declared, counsellor-speaker and translation-only rows…` (pass 49, fail 7) |
| F3 | key binding (ii) | delete `if (!declaredKeys.includes(key)) failed.push("key-not-declared");` | `✔ T-030 property (a1)/(a2)/(c)`, `✔ T-030 (d)`, `✔ T-030 (D-025): the key is bound to the clause…`, `✔ D-025 (T-030)…` | `✖ T-030 property (a1)`, `✖ (a2)`, `✖ (c)`, `✖ T-030 (d)`, `✖ T-030 (D-025): the key is bound to the clause…`, `✖ D-025 (T-030)…` (pass 47, fail 9) |
| F4 | original text (iii) | delete the `translation-only` line in `matchesAllowedTemplate` | `✔ T-030 property (c)`, `✔ T-030 (d)`, `✔ D-025 (T-030)…` | `✖ T-030 property (c)…`, `✖ T-030 (d)…`, `✖ D-025 (T-030)…` (pass 50, fail 6) |
| F5 | ranges / compounds need review | the per-year budget template gains `(?:(?:-\| to \| plus )\\p{Nd}+)?` after the number | `✔ ISS-t-013-c2-rev-4 (T-030): numeric-range, numeric-compound and marks rows…` | `✖ ISS-t-013-c2-rev-4 (T-030)…` and `✖ T-030 audit…` (pass 51, fail 5) |

(The fail counts include each failing test's summary line, which node:test repeats.)

## Real outputs

Engine test (bound root, HEAD `4350fe9`, under the lock):
```
[t030-property] cases=178 |L|=421851778 sampled=3951 vocab=710 grammarTokens=271
[t030-property] true positives: 3951 of 3951 language sentences verify
[t030-property] (a1) single-token edits outside L checked=134383 leaks=0 (edits still in L, skipped=5704)
[t030-property] (a2) two-token edits outside L checked=29345 leaks=0
[t030-property] (b) random off-grammar sentences checked=20000 leaks=0
[t030-property] (c) one-input flips checked=23897
ℹ tests 346
ℹ pass 346
ℹ fail 0
```
Typecheck (engine): `tsc --noEmit && tsc --noEmit -p evals/tsconfig.json && tsc --noEmit -p scripts/tsconfig.json` exited with 0 and no diagnostics.
`python contracts/verify_contracts.py`: `verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity`.

(g) Golden set, every gold fact of the branch's 113-row `sessions.jsonl` through the real `verifyCandidateFact`:
```
[tp] root=D:/vc                               truthful gold facts=47 verified=21 | mustReview=70 verified(leaks)=19
[tp] root=D:/vc/.worktrees/t-030-template-gap truthful gold facts=47 verified=21 | mustReview=70 verified(leaks)=0
```
The same 21 ids verify before and after (p01-p21). Main's 19 leaks were h37-h42 and h47-h48
(attributed gap), h49-h53 (key), h54-h56 (speaker) and h57-h59 (translation-only).

(g) Old template surface: 30 synthetic single-clause statements, each with its natural key:
```
[tp-surface] root=D:/vc                                verified=29/30
[tp-surface] root=D:/vc/.worktrees/t-030-template-gap verified=27/30
- class12_percentage=92 "My score was 92 in boards"                <- unrecognised-form   (which class is not said: clause ii)
- class12_percentage=92 "I scored 92 marks in my class 12 boards"  <- unrecognised-form   (marks are not a percentage: clause ii)
- targetCountry=Canada "मैं कनाडा जाना चाहता हूँ"                    (needs review on main too; the Devanagari exonym is not in the alias list)
```
The first build of the WIP lost 7 of these statements (22/30): a subject outside "computer science", three
modifiers, "maximum budget", and TOEFL/GRE. Commit `4350fe9` recovered them with closed, key-bound additions.
The two statements still lost are deliberate: under clause (ii), no key can be bound to what they say.

## Open gaps

- **Standardised-test keys are declared, not observed.** The golden set uses only IELTS, class 10 and class 12
  scores. `toefl_total`, `pte_overall`, `gre_total`, `gmat_total`, `sat_total` and `duolingo_score` are this
  unit's naming. If the extractor uses another name, the fact needs review (fail-safe), so recall depends on
  the key names in the scribe prompt. There is no key registry in `@vc/schemas` (the ISS-t-013-c3-rev-3 idea).
- **Pre-existing fail-safe false negatives, not fixed here:**
  - dotted aliases ("U.K.") and Devanagari exonyms (कनाडा) never verify;
  - the Hinglish copula "he" is vetoed by the English third-party pronoun lexicon.

  The property spec leaves these out on purpose. See the comments in scribe-auto-verify-property.test.ts.
- **JEE / NEET / CAT / CUET have no family**, since percentile, rank and marks are ambiguous, so they always
  need review.
- **Cross-turn context (ISS-071)** is out of scope under D-026 (wontfix).
- **The ledger and TASKS rows are not flipped here** (the maker may not edit TASKS.md, and the ledger is the
  checker's). The checker should mark ISS-069, ISS-070, ISS-072, ISS-t-013r-rev-14 and ISS-t-013-c2-rev-4.

## Close-out
Checker c0 PASS (verdict f4b33ab; ISS-069, 070, 072, t-013r-rev-14, t-013-c2-rev-4 fixed). ai-engineer Approve (1 low → ISS-t-030-rev-2); senior-software-engineer Warning (medium: the property-test oracle copies the production regex, so it is a golden copy, not an independent spec → ISS-t-030-rev-1). A Warning is not a Block; merged.

## Status: checked-PASS
