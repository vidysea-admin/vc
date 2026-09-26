# Manifest — t-013-citation-rescope
**Contract:** qa/contracts/counselling-engine.md (B2, B3, B15, B20; B2 as amended 2026-09-26 by D-020)
**Goal task:** none (this project has no `.goal/`; qa/issues.jsonl is the canonical tracker)
**Date:** 2026-09-26
**Fix cycle:** 1 of max 3
**Dual check:** no
**Issues addressed:** none open against T-013 in qa/issues.jsonl. ISS-t-007-rev-2 (case-sensitive `.includes()` false-dropping real citations) is fixed as a side effect of this unit — see "Kept facts" numbers below. ISS-t-007-rev-3 is **out of scope**: it is not referenced by the T-013 rescope gate or by qa/debug/t-013-citation-robustness-cycle3.md, and no matching row exists in qa/issues.jsonl for this repo state; not addressed here.
**Executor:** claude-sonnet-subagent (schema change — never delegated)
**Executor rationale:** touches `packages/schemas` (the shared Zod source of truth) and `packages/db`'s write path (`applyApprovedDiff`) — both named "never delegate" surfaces (schema/db-write units stay on a Claude subagent per maker/SKILL.md 4b).

## Background (why this unit is "rescope", not "robustness")

The prior attempt (`wave/t-013-citation-robustness`) tried to have a deterministic/regex guard decide
whether a fact's **value** is truly supported by its cited quote (entity-boundary + amount-expression
judgment). It stalled at 3/3 fix cycles: each cycle closed the exact hostile case the checker found,
and the checker found a structurally new one every time (case c0→c3 in
`qa/debug/t-013-citation-robustness-cycle3.md`). Root cause recorded there: "is this glued word part
of a longer name" is undecidable from token shape alone — an unbounded NL-judgment problem, not a bug
in the implementation.

Umesh's gate answer (`qa/gates/citation-guarantee-scope.md`, 2026-09-26) rescoped B2 instead of asking
for a cycle-4 patch: only **typed numbers** and a **fixed country/alias vocabulary** (whole-word
matched) auto-verify; every other text fact, plus a new `reasoning` fact kind, is **kept** (never
dropped) and marked `needsReview` for the counsellor. This unit implements exactly that — and
deliberately does **not** attempt entity-boundary/aboutness judgment at all, closing off the
mechanism that stalled the prior attempt rather than adding a 4th heuristic to it.

## What changed

- `packages/schemas/src/schemas.ts:52-105` — `CitationMatchSchema` ("verbatim"|"normalised"),
  `FactKindSchema` ("value"|"reasoning"), and five new **optional** fields on `FactSchema`: `kind`,
  `explains`, `citationMatch`, `needsReview`, `reviewReasons`. `kind`/`citationMatch` etc. are
  `.optional()`, **not** `.default()`, on purpose — a `.default()` makes the field required on
  `z.infer`'s *output* type, which would have broken every pre-existing `Fact` object literal across
  the tree (apps/web tests, mcp/student-profile) for no functional gain. Confirmed by trial: switching
  to `.default("value")` broke `apps/web`'s and `mcp/student-profile`'s typecheck; reverted to
  `.optional()` and both pass clean.
- `packages/engine/src/scribe/schemas.ts:1-90` — `CandidateFactSchema` gains optional `kind`/`explains`
  so the fact-extraction skill's raw output isn't silently stripped of these fields before
  `verifyCandidateFact` ever sees them.
- `packages/engine/src/scribe/nodes.ts:120-300` (net +233 lines) — the core of this unit:
  - `normaliseVerbatim`/`normaliseLoose`/`locateCitation`: the two-tier citation-location check
    (**requirement 1**) — NFC → whitespace collapse (tier "verbatim"), then casefold → strip a fixed
    punctuation set (`.,!?;:"'()-–—।“”‘’`) → strict substring (tier "normalised"). Never fuzzy. A quote
    that matches NEITHER tier is dropped as fabricated (unchanged principle from before this unit);
    one that matches either tier is a genuine citation and is **kept**, with its tier recorded on the
    `Fact` (`citationMatch`). This is what recovers the T-009 case-drift facts a case-sensitive
    `.includes()` used to drop outright (ISS-t-007-rev-2).
  - `containsWholeWord`: a small Unicode-boundary regex helper (`(?:^|[^\p{L}\p{Nd}])WORD(?:$|...)`) —
    NOT the stalled branch's `Intl.Segmenter`/token-alignment machinery. Deliberately simpler: it only
    needs to answer "is this exact digit-string/alias a whole word here", not "what named entity does
    this belong to" (the question that was unbounded).
  - `COUNTRY_ALIASES`: the fixed vocabulary (**requirement 2**) — a small, hand-curated map
    (uk/u.k/united kingdom/great britain → UK; usa/u.s.a/u.s/united states/united states of america →
    USA; india, canada, australia, new zealand/nz, germany, ireland, singapore, france). Deliberately
    **excludes** ambiguous single-word aliases that double as common nouns or other proper nouns (bare
    "britain", "america", "georgia", "turkey", "jordan", "chad") — this is what makes "new britain"
    and "bank of america" fail to auto-verify (see Capability coverage below), without any
    capitalisation/glue heuristic. `[ASSUMPTION 2026-09-26]`: today's illustrative list, not a vetted
    ISO-3166 set — the gate's follow-up question (fixed list vs. full enumeration) was not separately
    answered. Documented in-code at the const's definition.
  - `THIRD_PARTY_MARKERS` + `hasThirdPartyMarker`: a small fixed lexicon of relational NOUNS
    (cousin/friend/brother/sister/uncle/aunt/colleague/neighbour/someone/acquaintance) — deliberately
    **not** bare pronouns (him/her/them/his/their), which are far too common in ordinary speech about
    anything to serve as a signal. Forces `needsReview` even for an otherwise-verifiable value,
    satisfying D-020's named case ("my cousin is in the UK" must not verify as the student's own).
  - `assessFactForReview` (exported): decides `needsReview`/`reviewReasons` — reasoning kind → always
    `true`; typed number whole-word matched (and no third-party marker) → `false`; vocabulary value
    whole-word matched (and no third-party marker) → `false`; everything else → `true`, **never
    dropped** (requirement 3).
  - `verifyCandidateFact` rewired to: shape → citation guard → transcript source → turn lookup →
    reasoning-fact `explains`-required check → `locateCitation` (drop only here, on true fabrication)
    → `assessFactForReview` → `FactSchema.parse` with `kind`/`explains`/`citationMatch`/`needsReview`/
    `reviewReasons` all set explicitly (never left ambiguous for a scribe-produced fact).
- `packages/db/src/facts.ts:24-25,371(doc),401-451` — **requirement 4**, the KG edge:
  `applyApprovedDiff`'s write loop now tracks `writtenIdByKey` and, for a written fact with
  `kind: "reasoning"` and `explains` set, links a third edge `fact --explains--> fact` (the value fact
  it accounts for), resolved first against facts written in the SAME call, else against the student's
  currently active fact for that key. No match (nothing to link to) still writes the reasoning fact —
  it is never dropped for lacking a target.
- `mcp/student-profile/src/index.ts:61-77` — `toFact` (a plain `FactDoc`→`Fact` mapper, not a
  `.parse()` call) updated to carry the five new fields through; required once `kind` etc. exist on
  the `Fact` type (TS caught this at typecheck, not silently).
- `skills/fact-extraction/SKILL.md` — documents the `reasoning` kind + `explains` for the model prompt
  (B6: prompts live in SKILL.md), with a worked example, and notes the new auto-verify/needsReview
  split so the model doesn't try to self-judge confidence for that purpose.
- **Requirement 5 (transcript persistence + erasure/export) — confirmed already satisfied, no code
  changed.** The scribe's full session state (including every `ScribeInput.turns`) is persisted via
  LangGraph's `MongoDBSaver` into `scribe_checkpoints`/`scribe_checkpoint_writes`
  (`packages/engine/src/scribe/checkpointer.ts:9-14`), which are already erasure-covered
  (`packages/db/src/erasure.ts:834-835`, phase 1, `byThread` filter keyed off the student's session
  threads) and already export-covered (`packages/db/src/erasure.ts:1221-1249`, `exportStudent`'s
  `checkpoints` field — counted, not dumped raw, since the readable facts/summary are exported
  separately). This is exactly T-011/T-016's existing work, already tested end-to-end
  (`packages/db/tests/erasure.test.ts:310` "the full purge leaves ZERO documents... including
  checkpoints", `:558` a drift guard that checkpoint collection names match the engine's own file).
  No `[ASSUMPTION]` needed here — the pre-existing test suite already proves read-back zero.

## Tests added/changed
- **New:** `packages/engine/tests/scribe-citation-rescope.test.ts` (16 tests) — direct unit coverage
  of `verifyCandidateFact`/`assessFactForReview`: verbatim tier, normalised tier (case-drift, NFD
  Devanagari nukta composition-exclusion, smart quotes), a negative inserted-word fabrication test,
  typed-number auto-verify + its two negatives (digit-run substring, word-form amount), vocabulary
  auto-verify + its two named hostile negatives ("new britain", "bank of america"), the D-020
  third-party-referent negative, "every other text fact is kept as needsReview" (not dropped), and the
  `reasoning` kind (kept + always-review, and dropped when `explains` is missing).
- **New:** `packages/schemas/tests/fact.test.ts` (+6 tests) — `kind`/`explains`/`citationMatch`/
  `needsReview`/`reviewReasons` all optional and backward-compatible; enum validation for both new
  enums; empty-string `reviewReasons` entry refused.
- **New:** `packages/db/tests/facts.test.ts` (+4 tests) — the `explains` KG edge: linked when the
  value fact is written in the same call, linked when it's already active from an earlier session,
  left unlinked (not dropped) when there's nothing to link to, and never created for an ordinary
  `"value"` fact.
- **Updated (pre-existing, both explicitly anticipated T-013 — see their own comments/docstrings):**
  - `packages/engine/evals/score-case-drift.test.ts` — previously asserted the BUG as expected
    behaviour ("real false drops from the guard's case-sensitivity", `caseMismatch > 0`). Rewritten to
    assert the fix: zero false drops, full recall, citation precision unchanged at 1.
  - `packages/engine/tests/scribe-per-fact.test.ts:246` — previously asserted `needsReview` stays
    `undefined` ("T-013 fills it" — literally the marker left for this unit). Updated to assert the
    new explicit value (`false` — `targetCountry: "Canada"` auto-verifies) for a scribe-produced fact,
    plus a new assertion that `ApprovalFactSchema` itself still parses a Fact object that omits the
    field entirely (the schema-level backward-compatibility claim, kept separate from what the live
    graph now produces).
- **New (eval aggregate, additive):** `packages/engine/evals/types.ts`, `score.ts`, `report.ts` —
  `reviewCounts: {kept, verified, needsReview, reasoning, fabricatedVerified}` on both per-session and
  aggregate `EvalReport`, and one new markdown report line. `fabricatedVerified` is a live, checkable
  assertion (not just documentation) that a fact only reaches `verified`/`needsReview` after clearing
  the citation-location check.

## How to verify (commands + expected)
- `pnpm install --frozen-lockfile` (worktree had no `node_modules`) → exit 0
- `pnpm -r typecheck` → exit 0
- `pnpm -r test` → exit 0
- `python contracts/verify_contracts.py` → exit 0 (vacuous PASS, no frozen contracts yet)
- `pnpm --filter @vc/engine eval:scribe --provider=case-drift` (and `perfect`/`fabricator`/`lazy`) →
  numbers below

## Actual outputs (from maker's own run)

```
$ pnpm install --frozen-lockfile
Scope: all 10 workspace projects
... Packages: +177 ... Done in 14.5s

$ pnpm -r typecheck
packages/providers typecheck: Done
packages/schemas typecheck: Done
packages/observability typecheck: Done
packages/db typecheck: Done
apps/api typecheck: Done
mcp/university-kb typecheck: Done
mcp/student-profile typecheck: Done
packages/engine typecheck: Done
apps/web typecheck: Done

$ pnpm -r test
packages/schemas test: tests 56, pass 56, fail 0
packages/providers test: tests 31, pass 31, fail 0
packages/observability test: tests 57, pass 57, fail 0
packages/db test: tests 200, pass 200, fail 0
apps/api test: tests 8, pass 8, fail 0
mcp/student-profile test: tests 12, pass 12, fail 0
mcp/university-kb test: tests 9, pass 9, fail 0
packages/engine test: tests 174, pass 174, fail 0
apps/web test: tests 18, pass 18, fail 0
TOTAL: 565 tests, 565 pass, 0 fail

$ python contracts/verify_contracts.py
verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity
EXIT 0
```

### T-009 golden-set eval — before vs. after (case-drift provider)

**BEFORE** this unit (measured at the start of this session, unmodified tree):
```
| Extraction recall (gold facts found) | 1/24 (4.2%) |
| False drops (true quote, wrongly dropped) | case: 23 · punctuation: 0 · both: 0 |
```

**AFTER:**
```
$ pnpm --filter @vc/engine eval:scribe --provider=case-drift
| Crisis/concern routing accuracy | 22/22 (100.0%) |
| Citation precision (non-fabricated / claimed) | 100.0% |
| Extraction recall (gold facts found) | 24/24 (100.0%) |
| False drops (true quote, wrongly dropped) | case: 0 · punctuation: 0 · both: 0 |
| Multi-turn-span recall | 3/3 (100.0%) |
| Kept facts: verified / needsReview / reasoning (T-013, D-020) | 24 kept — 10 verified, 14 needsReview, 0 reasoning · fabricated-verified: 0 |

$ pnpm --filter @vc/engine eval:scribe --provider=perfect
| Extraction recall (gold facts found) | 24/24 (100.0%) |
| Kept facts: verified / needsReview / reasoning (T-013, D-020) | 24 kept — 10 verified, 14 needsReview, 0 reasoning · fabricated-verified: 0 |

$ pnpm --filter @vc/engine eval:scribe --provider=fabricator
| Citation precision (non-fabricated / claimed) | 0.0% |
| Kept facts: verified / needsReview / reasoning (T-013, D-020) | 0 kept — 0 verified, 0 needsReview, 0 reasoning · fabricated-verified: 0 |

$ pnpm --filter @vc/engine eval:scribe --provider=lazy
| Kept facts: verified / needsReview / reasoning (T-013, D-020) | 0 kept — 0 verified, 0 needsReview, 0 reasoning · fabricated-verified: 0 |
```

**True facts kept:** 24/24 in both `perfect` and `case-drift` modes (was 1/24 in `case-drift` before
this unit — the exact T-009 regression named in the brief). **Verified vs. needs-review:** 10
auto-verified (typed numbers + closed vocabulary), 14 kept as `needsReview` — none dropped.
**Zero fabricated-verified** in every mode, including `fabricator` (0 kept at all — every candidate's
citation is a genuine paraphrase/invention there, so none even reaches the review check).

## Capability coverage (each new claim -> its isolating falsification)

All four falsifications below were run in the live worktree source (not a copy) because the code under
test is pure, DB-free (`nodes.ts`) or already isolated behind an in-memory fake (`facts.ts` via
`packages/db/tests/fakes.ts`) — there is no "real root/target" this could accidentally point at (the
NEVER-falsify-against-the-live-tree warning is about code that resolves a filesystem/repo root or
writes to production; none of these four does). Each edit was applied, the test run, the output
pasted, then reverted and diffed byte-identical against a backup before continuing.

| capability (one line) | the check that covers it | the falsifying edit | observed (pasted runner output) |
|---|---|---|---|
| Citation location's "normalised" tier recovers a genuine re-cased/differently-punctuated quote instead of dropping it as fabricated | `scribe-citation-rescope.test.ts` (case-drift, smart-quotes) + `evals/score-case-drift.test.ts` | `nodes.ts` `locateCitation`: `if (looseQuote.length > 0 && ...)` → `if (false && looseQuote.length > 0 && ...)` | BEFORE (clean): `tests 17 / pass 17 / fail 0`. AFTER (patched): `tests 17 / pass 13 / fail 4` — the 4 that redden are exactly: case-drift eval test, the direct "case drift... KEPT" test, the smart-quotes test, and (as a side effect, since it also needed the loose-tier fallback to clear the third-party check safely) the D-020 third-party test. Reverted, `diff` against backup: identical, then `tests 17 / pass 17 / fail 0`. |
| The fixed vocabulary's curation (excluding bare "britain") is what stops "new britain" auto-verifying as UK — not a glue/capitalisation heuristic | `scribe-citation-rescope.test.ts` "'new britain'... never verifies as UK" | `nodes.ts` `COUNTRY_ALIASES`: added `["britain", "UK"]` | BEFORE: `tests 16 / pass 16 / fail 0`. AFTER (patched): `tests 16 / pass 15 / fail 1` — exactly `✖ auto-verify NEGATIVE (hostile, sibling of ISS-t-013-c3-1): 'new britain'...` reddens; every other test (including the sibling "bank of america" case) stays green, isolating the claim to this one alias. Reverted, `diff` identical, then `tests 16 / pass 16 / fail 0`. |
| A `reasoning` fact is ALWAYS `needsReview`, regardless of its value (even a value that would otherwise auto-verify) | `scribe-citation-rescope.test.ts` "assessFactForReview: ... a reasoning fact never does [auto-verify], even with a vocabulary-shaped value" | `nodes.ts` `assessFactForReview`: `if (candidate.kind === "reasoning")` → `if (false && candidate.kind === "reasoning")` | BEFORE: `tests 16 / pass 16 / fail 0`. AFTER (patched): `tests 16 / pass 15 / fail 1` — exactly the standalone `assessFactForReview` test reddens (the one using a vocabulary-shaped value "Canada", the only fixture that isolates the reasoning-bypass from the ordinary "outside auto-verify surface" fallback). Reverted, `diff` identical, then `tests 16 / pass 16 / fail 0`. |
| A written `reasoning` fact gets a KG `explains` edge to the value fact it accounts for (same-call and already-active cases) | `facts.test.ts` "gets an 'explains' edge to it" + "...ALREADY active in the DB..." | `facts.ts`: `if (fact.kind === "reasoning" && fact.explains) {` → `if (false && fact.kind === "reasoning" && fact.explains) {` | BEFORE: `tests 50 / pass 50 / fail 0`. AFTER (patched): `tests 50 / pass 48 / fail 2` — exactly the two "gets an 'explains' edge" tests redden; the "no active fact anywhere -> unlinked, never dropped" and "an ordinary value fact never gets one" tests stay green (correctly — they don't exercise the edge-creation branch this edit disabled). Reverted, `diff` identical, then `tests 50 / pass 50 / fail 0`. |

**Requirement 5 (transcript persistence/erasure/export):** `NO ISOLATING FALSIFICATION NEEDED —
pre-existing, already-tested infrastructure (T-011/T-016), not code this unit wrote.` The relevant
proof already exists and was re-run this session: `packages/db/tests/erasure.test.ts` "B15: the full
purge leaves ZERO documents for the student in every collection (retired facts, edges, claims,
checkpoints)" and the "drift guard: checkpoint collection names... match packages/engine" test, both
green in the `pnpm -r test` run above (`packages/db test: tests 200, pass 200, fail 0` includes them).

## Live browser evidence
**Not UI-touching.** No file under `apps/web` was modified by this unit (only `mcp/student-profile`,
outside any UI surface). The counsellor approval UI's `needsReview` badge already exists —
`apps/web/src/components/ApprovalScreen.tsx:288-299` (`fact.needsReview === true` renders a
`chip-warn` labelled "Needs review", `labels.ts:31`) — built in an earlier unit (T-008/T-018) in
anticipation of this one, and already covered by `apps/web/tests/ui.test.tsx:81` ("pending: a
needsReview fact is flagged with its reasons; an unflagged fact is not"), which passed unchanged in
this session's `pnpm -r test` run (`apps/web test: tests 18, pass 18, fail 0`). Since `nodes.ts` now
actually populates `needsReview`/`reviewReasons` on real facts (previously always absent), that
existing, tested UI path is exercised for real by this unit without needing a code change of its own.

## Status: fix-cycle-1 building (checker c0 FAIL 7dda413 + data-engineer Warning + ai-engineer Warning)
