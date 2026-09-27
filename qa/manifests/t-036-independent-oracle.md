# Manifest — t-036-independent-oracle

**Contract:** qa/contracts/counselling-engine.md, B2 as amended by D-026 (the auto-verify property:
`needsReview:false` = (i) the cited turn's speaker is the student, (ii) the matched template is bound to
this fact's key, (iii) the match is on the original-language text, not `translatedText` alone, (iv) within
one turn).
**Goal task:** T-036 (ISS-t-030-rev-1, raised by a senior-software-engineer review of T-030: "replace the
golden-copy oracle claim with a real independent check").
**Date:** 2026-09-27
**Fix cycle:** 1 of max 3
**Dual check:** no
**Persona walk:** skip (test-only, no UI surface)
**Issues addressed:** ISS-t-030-rev-1, ISS-t-036-1
**Executor:** claude-opus-subagent
**Executor rationale:** cycle 0 failed on a judgement error, not a wiring error. The work of this cycle is
the triage of every blind-oracle disagreement into leak / contract-ambiguity / wrong-row, with a rule that
forbids changing a row merely because the code disagrees — that is heavy reasoning, not test plumbing.

---

## How each cycle-0 FAILURE is addressed

> **FAILURE 1 (cycle-0 verdict, sev high) — "[ISS-t-030-rev-1 not closed] 23/102 fixture rows, including
> all 6 neg-speaker rows used as the unit's own falsification proof, are byte-for-byte copies of sentences
> already in nodes.ts's comments and this test file's pre-existing T-030 probes/controls (base commit
> 19f75e2) · re-author the duplicated rows from B2/D-026 prose without looking at nodes.ts or the existing
> test file, or have an independent (non-authoring) reviewer confirm no row was picked because it was
> already known to pass · issue: ISS-t-036-1"**

Addressed by taking the first of the two named remedies, structurally rather than by assurance. A
**separate agent context** (commit `7823f91`) authored `tests/fixtures/auto-verify-oracle-blind.jsonl`,
102 rows, under a brief that forbade it from opening `packages/engine/src/scribe/nodes.ts`, this property
test, or the older fixture. Its inputs were the prose of B2 and D-026 only. It reported its full read list
and flagged 36 rows whose correct answer it judged the contract text does not settle.

The rows had never been run. **This cycle ran them for the first time and triaged every disagreement**
(full table below). The old fixture is NOT deleted and NOT re-authored: it is kept, its block renamed, and
its role restated in the file header, the block header and `qa/manifests/t-030-template-gap.md` as
regression coverage of already-known behaviour — nothing more.

> **FAILURE 2 (cycle-0 verdict, sev high) — "[overclaim not fixed] the new file header (lines 12-14) and
> the new T-036 test block's own header (lines 638-642) both claim the fixture was written 'BEFORE reading
> the SPEC_* grammar above or the engine's templates in nodes.ts' -- contradicted by the 23 duplicate rows
> · reword to drop the false temporal/blind-authorship claim once the fixture itself is fixed · issue:
> ISS-t-036-1 (same root cause)"**

Addressed in three places, by withdrawing the claim in the words the checker used rather than quietly
dropping it: the file header now says the old fixture is "**NOT an independent oracle**", names the false
claim as false, cites the verdict and `nodes.ts:515-517`, and says what the fixture is worth instead; the
block header repeats it and the test's own name now begins `T-036 regression oracle (NOT independent --
23/102 rows are copies of nodes.ts comments and pre-existing probes)`; `t-030-template-gap.md` carries a
"Correction 2" paragraph. The new block states its independence as a **mechanism** (a separate agent
context, structurally forbidden from reading three named files, given two named documents) and adds, in
the same breath, that this "is a process claim about a separate context, not a proof: it rules out the
specific failure that sank cycle 0, and nothing more". It also states its own HONEST LIMIT (the asserted
split is 1 verify / 77 review, so the block alone is one-sided).

---

## THE HEADLINE RESULT: no leak, but the engine is much narrower than B2 reads

**Real leaks found: 0. `nodes.ts` was not changed.** Every one of the 72 blind rows that the contract
requires to be needs-review came back needs-review on the first contact with the engine.

**29 of the 30 rows the blind author expected to AUTO-VERIFY did not.** Every disagreement ran in the safe
direction — the engine is *stricter* than the prose of B2 — so none of them is a leak and none of them
would ever have been fixed by widening the engine (which this unit is forbidden to do). But 29/30 is not a
clean result: it means a competent reader of B2 who has never seen the code expects the auto-verify
surface to be far wider than it is. **21 of the 29 hinge on one unwritten rule** — that the cited clause
must match a fixed template grammar, which appears nowhere in B2 or D-026. That is the substantive finding
of this unit and it is filed as open question Q1 for the checker.

---

## Triage of every disagreeing row (the heart of this cycle)

Rule applied: a row was moved to bucket (c) ONLY when a quoted contract sentence makes it wrong
independently of what the code does. Where no such sentence exists, the row is (a) or (b), never (c). No
disagreeing row was deleted; the test's shape guard asserts that the two files still account for all 102
blind rows.

### (a) REAL LEAK in the implementation — **0 rows**

None. A leak requires the engine to auto-verify a row the contract says must be needs-review. No blind row
produced that direction. `packages/engine/src/scribe/nodes.ts` has zero diff on this branch.

### (c) The row is simply wrong under a plain reading of B2/D-026 — **5 rows, corrected in place**

Corrected from `expect: "verify"` to `expect: "review"`, each with the contract sentence recorded in the
row's own `why` field and the original blind judgement preserved verbatim after it.

| row | what the student typed | row's `value` | contract sentence that makes the row wrong |
|---|---|---|---|
| `blind-pos-budget-01` | "20 lakh rupees" | 2000000 | B2: "Only two kinds auto-verify at full confidence: **typed numbers**, and values matching a fixed country/alias vocabulary, **matched as whole words**." + D-026: "the student ... **said this value**, for this key, **in their own words**". 2000000 is the extractor's unit conversion; it is not typed in the turn and the student did not say it. |
| `blind-pos-budget-03` | "15 lakh rupees" | 1500000 | same |
| `blind-pos-budget-05` | "25 lakhs" | 2500000 | same |
| `blind-pos-budget-07` | "12 lakh" | 1200000 | same |
| `blind-pos-budget-09` | "18 lakh rupees" | 1800000 | same |

This reading is itself put to the checker as Q4, with the note that if the checker disagrees, these five
corrections must be reverted.

### (b) Genuine contract ambiguity — **24 rows, QUARANTINED (reported, never asserted)**

Moved to `packages/engine/tests/fixtures/auto-verify-oracle-blind-unsettled.jsonl`, each carrying
`"unsettled": true` and the `open_question` it waits on. The test prints them with the engine's actual
answer and asserts nothing about them, because asserting either way would freeze an answer B2/D-026 have
not given.

| rows | count | why the contract does not settle it | question |
|---|---|---|---|
| `blind-pos-country-01..07`, `-09`, `-10`; `blind-pos-score-01..04`, `-06`, `-08`, `-10` | 16 | Clean single-clause student assertions with the value present as a whole word, rejected as `unrecognised-form` because the sentence is outside the engine's closed template grammar. B2/D-026 nowhere require a template grammar; they give necessary conditions on the VALUE, not a sentence form. Whether B2's list is necessary-only or also sufficient is unwritten. | Q1 |
| `blind-pos-budget-02`, `-04`, `-06`, `-08`, `-10` | 5 | Same Q1 surface issue, plus `unit-multiplier`: the digits are typed and match the value exactly ("30000 pounds" → 30000), but a currency word forces review. B2/D-026 say nothing about currency; the guard is a D-020 fail-safe. | Q3 (+Q1) |
| `blind-pos-country-08` | 1 | "Netherlands" is not in the engine's fixed vocabulary (Australia, Canada, France, Germany, India, Ireland, New Zealand, Singapore, UK, USA). B2 says "a fixed country/alias vocabulary" without enumerating it, so the row is neither right nor wrong against the contract. | Q2 |
| `blind-pos-score-07` (JEE), `blind-pos-score-09` (NEET) | 2 | The engine has no key or template family for JEE/NEET/CAT/CUET, so they can never auto-verify. B2 says nothing about exam scope. | Q5 |

Two of the disagreements listed under Q1 carry a second engine reason worth recording: `blind-pos-country-07`
("...aur kahin **nahi** jaana") and `blind-pos-country-10` ("**no** backup country for me") trip the
negation fail-safe on affirmative sentences. Also unsettled, folded into Q7.

### Rows that AGREE but on unstated grounds — reported, not silently banked

All 36 rows the blind author flagged `AMBIGUOUS:` agreed with the engine, so they remain asserted. That is
corroboration, not contract backing: hedges, in-turn negation, third-party attribution inside a student
turn, within-turn conditionals, same-turn compound values, and the Devanagari-alias / spelled-out-number
rows all turn on readings B2/D-026 do not state. Raised as Q6 and Q7 so the checker either writes them
into B2 or declares them out of scope.

### Open contract questions appended to `qa/feedback-inbox.md`

Appended verbatim, timestamped `2026-09-27`, source line "T-036 blind oracle, fix cycle 1": **Q1**
accepted-sentence surface (necessary vs sufficient); **Q2** which countries are in the fixed vocabulary;
**Q3** stated currency on an exactly-typed number; **Q4** is a unit-converted value "said by the student"
(confirm the correction above); **Q5** exam scope (JEE/NEET/CAT/CUET); **Q6** Devanagari aliases and
spelled-out numbers; **Q7** the 36 agreeing-but-unstated rows; **Q8** the key vocabulary and budget-period
binding are not in the contract. The maker never edits `qa/contracts/**`.

---

## What changed

- `packages/engine/tests/fixtures/auto-verify-oracle-blind.jsonl` — **the independent oracle**, inherited
  from the blind author's commit `7823f91` (102 rows). This cycle: 24 rows moved out to the quarantine
  file, 5 rows corrected `verify` → `review` with the contract sentence in `why`. Now **78 rows: 1 verify,
  77 review**.
- `packages/engine/tests/fixtures/auto-verify-oracle-blind-unsettled.jsonl` — **new**, 24 quarantined rows
  carrying `"unsettled": true` and `open_question`.
- `packages/engine/tests/fixtures/auto-verify-oracle.jsonl` — **unchanged.** Kept as regression coverage.
  Not re-authored, not deleted: deleting it would destroy 102 pinned input/output pairs, and re-authoring
  it would only produce a second fixture with the same provenance problem.
- `packages/engine/tests/scribe-auto-verify-property.test.ts`:
  - **File header rewritten** to state that `auto-verify-oracle.jsonl` is NOT independent, that the earlier
    "written before reading the templates" claim was false, why (23/102 byte-identical rows; the six
    `neg-speaker` rows are pre-existing controls with `speaker` flipped), and to describe the blind fixture
    plus the mechanism its independence rests on.
  - Old T-036 block **renamed and its header rewritten**: `T-036 regression oracle (NOT independent -- …)`.
    Its assertions and rows are unchanged, so the 102 pairs stay pinned.
  - **New test block appended:** `T-036-blind independent oracle: …`. Uses the same `run()` helper the
    existing block uses (which calls the real `verifyCandidateFact`). Shape guard asserts 78 asserted rows,
    24 quarantined rows, 78+24 = 102 total (so a disagreeing row can never be deleted), 102 unique ids,
    a 1/77 verify/review split, and that every quarantined row carries `unsettled:true` + a non-empty
    `open_question`. Quarantined rows are printed with the engine's answer and asserted on in no way.
  - Two harness normalisations, documented in the block header, chosen before the rows were run and applied
    uniformly (neither changes any row's `expect`): a concept-preserving `BLIND_KEY_ALIASES` map from the
    blind author's key names to this engine's keys (the blind author could not know this repo's key
    spellings; the map is concept-injective, so the hostile `blind-neg-wrongkey-*` rows stay hostile, and
    keys with no engine concept pass through unmapped — that gap is Q5), and coercion of the JSON fixture's
    string values to numbers where fully numeric, with the cited quote taken as the turn text because the
    fixture's `quote` field is the author's note of the matched SPAN, not a citation quote.
- `qa/manifests/t-030-template-gap.md`: "Correction 2" paragraph and an acceptance-table amendment, both
  saying the first replacement oracle was itself code-derived and naming the blind fixture as the
  independent one.
- `qa/feedback-inbox.md`: the eight open contract questions appended verbatim.
- **No change to `packages/engine/src/scribe/nodes.ts`** — zero diff on this branch; no leak was found and
  the unit may only narrow auto-verify, never widen it.

**Not touched:** `qa/contracts/**`, `docs/DECISIONS.md`, `ARCHITECTURE.md`, `TASKS.md`, `.claude/**`,
`qa/issues.jsonl`, any other package.

## How to verify (commands + expected)

- `pnpm -C packages/engine exec tsx --test tests/scribe-auto-verify-property.test.ts` → exit 0, 9/9 pass,
  including `T-036-blind independent oracle: …`, with the 24-row quarantine report printed.
- `pnpm -C packages/engine test` → exit 0, full suite green.
- `pnpm -r typecheck` → exit 0, no diagnostics.

## Actual outputs (from maker's own run)

Targeted file (`pnpm -C packages/engine exec tsx --test tests/scribe-auto-verify-property.test.ts`):
```
[t036-regression] regression (NOT independent) oracle rows=102 positive=30 negative=72 failures=0
[t036-blind] independent oracle asserted=78 (verify=1 review=77) failures=0; QUARANTINED (reported, not asserted) = 24 open contract questions:
    blind-pos-country-01: blind author said "verify", engine says "review" [unrecognised-form] -- Q1 accepted-sentence surface
    blind-pos-country-02: blind author said "verify", engine says "review" [unrecognised-form] -- Q1 accepted-sentence surface
    blind-pos-country-03: blind author said "verify", engine says "review" [unrecognised-form] -- Q1 accepted-sentence surface
    blind-pos-country-04: blind author said "verify", engine says "review" [unrecognised-form] -- Q1 accepted-sentence surface
    blind-pos-country-05: blind author said "verify", engine says "review" [unrecognised-form] -- Q1 accepted-sentence surface
    blind-pos-country-06: blind author said "verify", engine says "review" [unrecognised-form] -- Q1 accepted-sentence surface
    blind-pos-country-07: blind author said "verify", engine says "review" [negation,unrecognised-form] -- Q1 accepted-sentence surface (also an in-turn 'nahi' token on an affirmative clause)
    blind-pos-country-08: blind author said "verify", engine says "review" [string value is not on the fixed country/alias vocabulary (B2 auto-verify surface)] -- Q2 which countries are in the fixed vocabulary (Netherlands is absent)
    blind-pos-country-09: blind author said "verify", engine says "review" [unrecognised-form] -- Q1 accepted-sentence surface
    blind-pos-country-10: blind author said "verify", engine says "review" [negation,unrecognised-form] -- Q1 accepted-sentence surface (also an in-turn 'no' token on an affirmative clause)
    blind-pos-budget-02: blind author said "verify", engine says "review" [negation,unrecognised-form,unit-multiplier] -- Q3 stated currency + Q1 surface
    blind-pos-budget-04: blind author said "verify", engine says "review" [unrecognised-form,unit-multiplier] -- Q3 stated currency + Q1 surface
    blind-pos-budget-06: blind author said "verify", engine says "review" [unrecognised-form,unit-multiplier] -- Q3 stated currency + Q1 surface
    blind-pos-budget-08: blind author said "verify", engine says "review" [unrecognised-form,unit-multiplier] -- Q3 stated currency + Q1 surface
    blind-pos-budget-10: blind author said "verify", engine says "review" [negation,unrecognised-form,unit-multiplier] -- Q3 stated currency + Q1 surface
    blind-pos-score-01: blind author said "verify", engine says "review" [unrecognised-form] -- Q1 accepted-sentence surface
    blind-pos-score-02: blind author said "verify", engine says "review" [unrecognised-form] -- Q1 accepted-sentence surface
    blind-pos-score-03: blind author said "verify", engine says "review" [unrecognised-form] -- Q1 accepted-sentence surface
    blind-pos-score-04: blind author said "verify", engine says "review" [unrecognised-form] -- Q1 accepted-sentence surface
    blind-pos-score-06: blind author said "verify", engine says "review" [unrecognised-form] -- Q1 accepted-sentence surface
    blind-pos-score-07: blind author said "verify", engine says "review" [unrecognised-form] -- Q5 exam scope (JEE has no key or template)
    blind-pos-score-08: blind author said "verify", engine says "review" [unrecognised-form] -- Q1 accepted-sentence surface
    blind-pos-score-09: blind author said "verify", engine says "review" [unrecognised-form] -- Q5 exam scope (NEET has no key or template)
    blind-pos-score-10: blind author said "verify", engine says "review" [unrecognised-form] -- Q1 accepted-sentence surface
✔ T-030 property oracle: the spec parses in the closed subset, is finite, and rejects an open gap (10.2159ms)
...
ℹ tests 9
ℹ suites 0
ℹ pass 9
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 53847.3704
```

Full engine suite (`pnpm -C packages/engine test`), tail:
```
ℹ tests 596
ℹ suites 0
ℹ pass 596
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 99350.3789
```

Typecheck (`pnpm -r typecheck`):
```
Scope: 9 of 10 workspace projects
packages/schemas typecheck: Done
packages/observability typecheck: Done
packages/db typecheck: Done
packages/providers typecheck: Done
mcp/student-profile typecheck: Done
mcp/university-kb typecheck: Done
packages/engine typecheck: Done
apps/api typecheck: Done
apps/web typecheck: Done
```

## Capability coverage (each new claim -> its isolating falsification)

Both falsifications use a **BLIND** row. `neg-speaker-01..06` are deliberately no longer used as evidence
for anything: the cycle-0 verdict established they are pre-existing controls with one field flipped.

| capability (one line) | the check that covers it | the falsifying edit | observed (pasted runner output, green BEFORE and red AFTER) |
|---|---|---|---|
| the blind oracle is a REAL check wired to the engine — an auto-verify leak against D-026's "for this key" clause turns it red, naming the blind row `blind-neg-wrongkey-04` | `T-036-blind independent oracle: …` (scribe-auto-verify-property.test.ts) | in `packages/engine/src/scribe/nodes.ts:930`, replaced `if (allowVerdicts.includes("key-not-declared")) guards.push(REVIEW_REASONS.keyNotDeclared);` with a no-op comment, then restored the file (`git diff --stat packages/engine/src/scribe/nodes.ts` empty) | GREEN BEFORE: `✔ T-036-blind independent oracle: rows authored by an agent forbidden from reading nodes.ts agree with the engine` / `[t036-blind] independent oracle asserted=78 (verify=1 review=77) failures=0` / `ℹ tests 9 · pass 9 · fail 0`. RED AFTER: `✖ T-036-blind independent oracle: rows authored by an agent forbidden from reading nodes.ts agree with the engine (35.8842ms)` / `AssertionError [ERR_ASSERTION]: 1 of 78 blind-oracle rows disagree with the engine` / `+ 'blind-neg-wrongkey-04 (negative): expected "review", engine said "verify" [-] -- "Mera GMAT score 650 hai."'` / `ℹ tests 9 · pass 3 · fail 6`. Restored; suite re-confirmed green. |
| the blind fixture cannot be emptied, trimmed, or have a disagreeing row deleted, into a vacuous pass | the same test's shape guard (78 asserted / 24 quarantined / 102 accounted for / 102 unique ids / 1-77 split / every quarantined row carries `unsettled` + `open_question`) | truncated `packages/engine/tests/fixtures/auto-verify-oracle-blind.jsonl` to zero bytes, then restored it (`wc -l` back to 78) | GREEN BEFORE: `[t036-blind] independent oracle asserted=78 (verify=1 review=77) failures=0` / `ℹ tests 9 · pass 9 · fail 0`. RED AFTER: `✖ T-036-blind independent oracle: rows authored by an agent forbidden from reading nodes.ts agree with the engine (45.3638ms)` / `AssertionError [ERR_ASSERTION]: expected 78 asserted rows in auto-verify-oracle-blind.jsonl` / `ℹ tests 9 · pass 8 · fail 1` — the guard fires before any row is run. |

**No leak found, and that claim is now worth more than it was in cycle 0** — because the rows that produced
it were authored by an agent that could not read the implementation. It is still not a clean bill of
health: 29 of 30 expected-auto-verify rows disagreed, 24 of them on questions B2/D-026 do not answer.

## Live browser evidence

Not UI-touching — no surface changed. Changed paths:
`packages/engine/tests/scribe-auto-verify-property.test.ts`,
`packages/engine/tests/fixtures/auto-verify-oracle-blind.jsonl`,
`packages/engine/tests/fixtures/auto-verify-oracle-blind-unsettled.jsonl`,
`qa/manifests/t-030-template-gap.md`, `qa/manifests/t-036-independent-oracle.md`, `qa/feedback-inbox.md`.

**Persona walk:** skip (test-only, no UI surface).

## Status: ready-for-check
