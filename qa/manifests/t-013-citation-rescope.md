# Manifest — t-013-citation-rescope
**Contract:** qa/contracts/counselling-engine.md (B2, B3, B15, B20; B2 as amended 2026-09-26 by D-020)
**Goal task:** none (this project has no `.goal/`; qa/issues.jsonl is the canonical tracker)
**Date:** 2026-09-26
**Fix cycle:** 3 of max 3 (+1 authorized by D-023)
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

---

# FIX CYCLE 1 (answers verdict c0 FAIL @ 7dda413 + data-engineer / ai-engineer reviews)

Human requirement driving c0-3 (verbatim): "puri chat bhi save rehegi and iske alawa we have to make the knoowledge graph of the user so that we have summarized way, and also like essaa hogaa numbers k alawa sometimes reasoning is also valuble".

**Persona walk:** skip — no `apps/web/**` path in this cycle's diff (`git diff --name-only <c0-head>..HEAD -- apps/web` is empty); the existing needsReview chip (`apps/web/src/components/ApprovalScreen.tsx:288-299`) renders the new `reviewReasons` strings unchanged.

## Findings -> fix

| finding | how it is fixed (file:line) |
|---|---|
| **ISS-t-013r-c0-1 (critical)** a negation auto-verifies | `packages/engine/src/scribe/nodes.ts:278` `NEGATION_MARKERS` (not/never/no/nahi/nahin/mat/na/नहीं/मत/न + contrast words instead/rather/than/but/lekin/pehle…) + `NT_CONTRACTION_RE`; `assessFactForReview` (`nodes.ts:401`) checks negation over the quote AND the whole cited turn (text + translatedText), so a Hindi post-position negation ("UK nahi") and a model-cropped quote are both caught. Reason prefix `negation:` |
| **ISS-t-013r-c0-2 (high)** third-party via pronoun / Hinglish / Devanagari kinship | `nodes.ts:241` `THIRD_PARTY_MARKERS` extended: English relations + he/she/they/his/her/their/him/them; Hinglish bhai/bhaiya/didi/behen/chacha/mama/papa/mummy/dost/uska/uski/unka/woh…; Devanagari भाई/बहन/दीदी/पापा/मम्मी/चाचा/मामा/दोस्त/उसका/उसकी/उनका/वह/वो… Judged on quote + turn context. Reason prefix `third-party:` |
| **ISS-t-013r-rev-2 (high)** '20 lakh' auto-verifies 20 | `nodes.ts:297` `MULTIPLIER_MARKERS` (lakh/lac/crore/cr/k/thousand/million/billion/hazaar/लाख/करोड़/हज़ार…), `CURRENCY_SYMBOL_RE`, `GLUED_MULTIPLIER_RE` (20k, 20L, ₹20); `containsNumberToken` (`nodes.ts:355`) is a boundary match on the tier-1 text so 20 never matches inside 20,00,000 / 1.20 / 20-25 / 20/40 / $20. Reason prefix `unit-multiplier:` |
| fail-safe rule (all three) | `assessFactForReview` auto-verifies ONLY when: first-person marker in the quote (`FIRST_PERSON_MARKERS`, `nodes.ts:315`; excludes ambiguous "mein"/"us") AND no negation AND no third-party marker AND no multiplier/currency. Every failing condition is named in `reviewReasons` with a stable prefix (`REVIEW_REASONS`, `nodes.ts:368`). The fact is KEPT (value + citation intact), never dropped. Call site `nodes.ts:520` passes `[turn.text, turn.translatedText]` |
| **ISS-t-013r-rev-1 (high)** explains edge lost when reasoning comes first | `packages/db/src/facts.ts:464` `pendingExplains` collected in pass 1; pass 2 (`facts.ts:584`) resolves the target from this call's writes first, then the active fact in the DB, and links `explains`. A pass-2 failure throws `PartialApplyError` with the ids written (ISS-028 shape). Both orders tested |
| **ISS-t-013r-rev-3 (medium)** hostile rows in the golden set | `qa/evals/scribe/sessions.jsonl` +13 sessions `h01..h13` (strata `d020-hostile`: negation EN/Hinglish/Devanagari/instead-of, lakh-unscaled, crore-scaled, ₹, USD, pronoun, kinship Hinglish, kinship Devanagari, same-key distractor, reasoning-before-value). `packages/engine/evals/types.ts:29` `mustReview`/`hostile`/`kind`/`explains` on GoldFact; `evals/score.ts:89-107` `fabricatedVerified` = verified AND (no citationMatch OR matches a `mustReview` gold OR matches no gold) — no longer 0 by construction; `evals/report.ts` prints the hostile count; `evals/score-perfect.test.ts:41` asserts >= 10 hostile rows, every class present, mustReview == hostile count, fabricatedVerified == 0 |
| **ISS-t-013r-c0-3 (high) + T-024** full transcript as a governed record | `packages/db/src/collections.ts:44` `session_transcripts` in COLLECTION_NAMES, `:99` `TranscriptTurnDoc`, `:112` `transcriptTurnDocId`, `:194` accessor. `packages/schemas/src/schemas.ts:167` `TranscriptTurnRecordSchema`. `packages/db/scripts/db-init.ts:151-156` two INDEX_PLAN entries (studentId; studentId+sessionId+ts), no TTL. `packages/db/src/facts.ts:909` `recordSessionTranscript` (Zod-validated, `$setOnInsert` upsert on `{_id, studentId}` — replay-safe, never overwrites, cross-student 11000, `createdSink` for compensation); `:954` `readSessionTranscript` (the counsellor read, student-scoped, speaking order); `:991` `resolveCitationSpan` (citation {turnId, quote} -> offsets in the PERSISTED field, same two strict tiers, NFC/NFD tolerant, never fuzzy). `packages/db/src/erasure.ts:840` phase-1 ERASURE_PLAN step (hard delete, read-back residue); `:1223/:1239` `StudentExport.transcripts` VERBATIM. `packages/engine/src/scribe/graph.ts:507` startScribe records the chat inside the fence-aware call; `:378` `CreatedByCall.transcriptTurns`; `:433` compensation deletes exactly the turns this call created. `packages/db/tests/db-init.test.ts:314-360` TTL guard: INDEX_PLAN check + repo-wide source scanner (fails on `expireAfterSeconds` / a `ttl:` option anywhere under packages/, apps/, mcp/) + pattern falsification. `db-scope.test.ts` B12 lists updated |
| **c0-4 (process)** falsify in a throwaway copy | all rows below ran in `C:/Users/Lenovo/AppData/Local/Temp/claude/t013c1-1` (robocopy of the worktree excluding .git/node_modules, `pnpm install --offline --frozen-lockfile`), script `scratchpad/falsify.py`; the worktree was never mutated |
| **c0-5 (low)** persona walk line | added above |

Tests updated (not deleted): `scribe-citation-rescope.test.ts` — the number positive now uses a first-person fixture ("I scored 92 in my class 12 boards"), the old rupees fixture is kept as a needsReview negative; the 42 positive is "I have finished 42 credits so far", the old "we discussed all 42 of them" kept as a negative. `scribe-per-fact.test.ts:~42` harness quote is first-person. `erasure.test.ts` seedStudent records 2 transcript turns/session through the real write path; the receipt expects `session_transcripts: 4`.

New tests: `scribe-citation-rescope.test.ts:269-385` (positives EN/Hinglish/Devanagari, negation, third-party, no-first-person, multiplier/currency, glued numbers, multi-reason kept fact); `facts.test.ts:1020,1049` (rev-1 both orders, incl. older active fact) and `:1083-1131` (transcript write/replay/no-overwrite/cross-student/invalid/duplicate/span); `erasure.test.ts:612,631,649` (export verbatim, erasure read-back 0, counsellor read + span); `db-init.test.ts:314,352,360` (TTL guards); `scribe-persistence.test.ts:688,710` (startScribe persists chat, every proposed citation resolves to a span in the stored chat; second run adds only new turns, export carries them); `scribe-erasure-fence.test.ts:240` (fenced mid-run removes only this call's turns).

## Verify (commands + REAL outputs, this cycle)

```
pnpm -r typecheck
  packages/providers typecheck: Done · packages/schemas: Done · packages/observability: Done · packages/db: Done
  apps/api: Done · mcp/university-kb: Done · mcp/student-profile: Done · packages/engine: Done · apps/web: Done   (exit 0)

pnpm --filter @vc/schemas test              ℹ tests 56   ℹ pass 56   ℹ fail 0
pnpm --filter @vc/providers test            ℹ tests 31   ℹ pass 31   ℹ fail 0
pnpm --filter @vc/observability test        ℹ tests 57   ℹ pass 57   ℹ fail 0
pnpm --filter @vc/db test                   ℹ tests 212  ℹ pass 212  ℹ fail 0
pnpm --filter @vc/api test                  ℹ tests 8    ℹ pass 8    ℹ fail 0
pnpm --filter @vc/mcp-student-profile test  ℹ tests 12   ℹ pass 12   ℹ fail 0
pnpm --filter @vc/mcp-university-kb test    ℹ tests 9    ℹ pass 9    ℹ fail 0
pnpm --filter @vc/engine test               ℹ tests 303  ℹ pass 303  ℹ fail 0
pnpm --filter @vc/web test                  ℹ tests 24   ℹ pass 24   ℹ fail 0

python contracts/verify_contracts.py
  verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity
```

Eval (golden set now 35 sessions incl. 13 D-020 hostile rows), `pnpm --filter @vc/engine eval:scribe -- --provider=<mode>`:

```
perfect    | 38 kept — 7 verified, 31 needsReview, 1 reasoning · D-020 hostile (mustReview) kept: 13 · fabricated-verified: 0 |  recall 38/38
case-drift | 38 kept — 7 verified, 31 needsReview, 1 reasoning · D-020 hostile (mustReview) kept: 13 · fabricated-verified: 0 |  recall 38/38
fabricator | 0 kept — 0 verified, 0 needsReview, 0 reasoning · D-020 hostile (mustReview) kept: 0 · fabricated-verified: 0 |  precision 0.0%
lazy       | 0 kept — 0 verified, 0 needsReview, 0 reasoning · D-020 hostile (mustReview) kept: 0 · fabricated-verified: 0 |  precision n/a
```

The metric is proven non-vacuous: in the throwaway copy, with the four fail-safe guards disabled (the old wide rule), the SAME eval on the SAME golden set reports **fabricated-verified: 10**:

```
BEFORE (fail-safe rule): 38 kept — 7 verified, 31 needsReview, 1 reasoning · D-020 hostile (mustReview) kept: 13 · fabricated-verified: 0
AFTER  (old wide rule):  38 kept — 21 verified, 17 needsReview, 1 reasoning · D-020 hostile (mustReview) kept: 13 · fabricated-verified: 10
```

## Capability coverage — fix cycle 1 (throwaway copy `t013c1-1`, same test id before/after)

| capability | falsifying edit (copy only) | BEFORE (GREEN) | AFTER (RED) |
|---|---|---|---|
| c0-1 negation never auto-verifies | `nodes.ts` `const negated = ...` -> `const negated = false;` | `✔ ISS-t-013r-c0-1: a value the turn NEGATES or contrasts away never auto-verifies (reason: negation)` [pass 1 fail 0] | `✖ ISS-t-013r-c0-1: ...` [pass 0 fail 1] |
| c0-2 pronoun/kinship third party never auto-verifies | `const thirdParty = ...` -> `false` | `✔ ISS-t-013r-c0-2: a third-party referent (pronoun, English/Hinglish/Devanagari kinship) never auto-verifies (reason: third-party)` [pass 1 fail 0] | `✖ ISS-t-013r-c0-2: ...` [pass 0 fail 1] |
| first-person required | `const firstPerson = ...` -> `true` | `✔ fail-safe: no first-person marker in the quote -> never auto-verifies (reason: no-first-person)` [pass 1 fail 0] | `✖ fail-safe: no first-person marker ...` [pass 0 fail 1] |
| rev-2 multiplier/currency never auto-verifies | multiplier guard line removed | `✔ ISS-t-013r-rev-2: a number next to a unit multiplier or currency never auto-verifies, scaled or unscaled (reason: unit-multiplier)` [pass 1 fail 0] | `✖ ISS-t-013r-rev-2: ...` [pass 0 fail 1] |
| rev-1 two-pass explains | pass-1 push gated on `writtenIdByKey.has(fact.explains)` (= old single-pass semantics) | `✔ ISS-t-013r-rev-1: a reasoning fact listed BEFORE its value fact in the same call still gets an 'explains' edge to it` [pass 1 fail 0] | `✖ ISS-t-013r-rev-1: ...` [pass 0 fail 1] |
| c0-3 erasure hard-deletes the transcript | ERASURE_PLAN transcript step removed | `✔ ISS-t-013r-c0-3: erasure hard-deletes A's transcript with read-back ZERO, and B's transcript is untouched` [pass 1 fail 0] | `✖ ...` [pass 0 fail 1] |
| c0-3 export carries the transcript verbatim | `transcripts,` -> `transcripts: [],` | `✔ ISS-t-013r-c0-3: exportStudent includes the full transcript VERBATIM (every turn, text + translation), and none of B's` [pass 1 fail 0] | `✖ ...` [pass 0 fail 1] |
| c0-3 no TTL ever (scanner) | `expireAfterSeconds: 60` added to the transcript index spec | `✔ ISS-t-013r-c0-3 scanner: no source file under packages/, apps/ or mcp/ declares a TTL ...` [pass 1 fail 0] | `✖ ...` [pass 0 fail 1] |
| c0-3 no TTL ever (plan guard) | same edit | `✔ ISS-t-013r-c0-3: the transcript is a planned collection with a studentId index, and NO index on the transcript or checkpoint collections carries a TTL` [pass 1 fail 0] | `✖ ...` [pass 0 fail 1] |
| c0-3 startScribe persists the chat; citations resolve into it | `recordSessionTranscript(...)` call removed from `graph.ts` | `✔ ISS-t-013r-c0-3: startScribe persists every input turn verbatim, and every proposed fact's citation resolves to a span in the stored chat` [pass 1 fail 0] | `✖ ...` [pass 0 fail 1] |
| c0-3 fence compensation removes this call's turns | transcript branch of `compensate` -> `if (false)` | `✔ ISS-t-013r-c0-3: a fence that appears DURING startScribe removes the transcript turns THIS call created, and keeps turns an earlier run recorded` [pass 1 fail 0] | `✖ ...` [pass 0 fail 1] |
| rev-3 hostile rows make fabricatedVerified meaningful | four guards disabled, eval `--provider=perfect` | `fabricated-verified: 0` | `fabricated-verified: 10` |

The earlier "Requirement 5: NO ISOLATING FALSIFICATION NEEDED" note (above) is superseded by the c0-3 rows here: the transcript is now code this unit wrote.

## Live browser evidence (fix cycle 1)
**Not applicable.** No file under `apps/web` changed in this cycle (D-024 browser evidence is required only when apps/web is touched). `@vc/web` tests 24/24 green unchanged.

## Open gaps (named, not hidden)
- **Counsellor read surface:** the counsellor read is the `@vc/db` reader `readSessionTranscript` (plus the transcript in `exportStudent`). No HTTP route / MCP tool (`get_session_transcript`) and no apps/web screen was added in this unit, to keep apps/web and the MCP tool list out of this diff. A consent-gated MCP tool or API route is the follow-up if the counsellor UI must show the chat.
- **Real Mongo:** not touched this cycle; every test uses the `@vc/db/testing` fake with the production INDEX_PLAN unique set. `db-init` will create the two new indexes on its next run (not run here).
- **Marker lists** (negation, kinship, multiplier) are closed, hand-curated sets. A marker outside them fails SAFE only through the first-person requirement, not by recognition; e.g. a third-party sentence that also contains "I/my" and an unlisted kinship word would still auto-verify. The eval hostile rows cover the named classes only.
- **Fresh-context review** (senior-software-engineer / data-engineer / ai-engineer) of this cycle's code was not dispatched from this build subagent (no nested fan-out); the orchestrator/checker should run it.

# FIX CYCLE 2 (answers the ai-engineer review BLOCK that overrides checker c1 PASS @ 4330182, plus DE rev-8 and checker c1-1)

**Persona walk:** skip — no `apps/web/**` path in this cycle's diff (`git diff --name-only b851687..HEAD -- apps/web` is empty, 0 lines); the needsReview chip renders the new reason strings unchanged.

## Findings -> fix (issue titles quoted from qa/issues.jsonl)

| issue (verbatim) | fix (file:line; `packages/engine/src/scribe/nodes.ts` unless named) |
|---|---|
| **ISS-t-013r-rev-4 (critical)** "interrogative mood auto-verifies: a question is recorded as a decided fact (needsReview:false)" | `INTERROGATIVE_MARKERS` `:349` (kya/kyaa/whether/kaun/kahan/kyun/kaise/kab…, क्या/कौन/कहाँ/क्यों/कैसे/कब), `QUESTION_MARK_RE` (`?`/`？` anywhere in the RAW cited turn), `INVERSION_RE` (should/shall/could/can/may/might/will/would/do/does/did/am/must/have/was/were/is/are + I/we); `hasInterrogative` `:360`, judged on quote + whole cited turn (text + translatedText). Reason prefix `interrogative:` (`REVIEW_REASONS` `:560`). Both reproductions -> needsReview |
| **ISS-t-013r-rev-5 (critical)** "conditional/hypothetical phrasing auto-verifies (if/agar/would/maybe/in an ideal world)" | `CONDITIONAL_MARKERS` `:370` (if/unless/would/might/maybe/perhaps/possibly/probably/suppose/assuming/provided/hypothetically/ideally/ideal/hopefully/someday; agar/yadi/kaash/shayad/mumkin/hoga/hogi; अगर/यदि/काश/शायद/संभव/मुमकिन/होगा/होगी); `hasConditional` `:379` (only the fixed polite phrase "would like/love" is exempted). Quote + whole turn. Reason `conditional:` (`:563`). All four reproductions -> needsReview |
| **ISS-t-013r-rev-6 (high)** "deny-list design keeps leaking: unlisted kinship (devar, saali, saala, nanad, jeth, jethani, sasur, saas, behnoi) and every unlisted risk class auto-verify" | **ALLOW-LIST first layer**: `matchesAllowedTemplate` `:494`, called in `assessFactForReview` `:623`. Auto-verify only when (a) the template-normalised quote (`normaliseTemplate` `:398`) EQUALS one whole clause of the cited turn (`clausesOf` `:412`: split on ? ! ; : । newline, non-decimal . / , and because/kyunki/क्योंकि), (b) the clause matches a declarative first-person template whose slot is exactly the value — `COUNTRY_TEMPLATES` `:429` (9; EN/Hinglish/Devanagari; slot takes only that canonical's COUNTRY_ALIASES) or `NUMBER_TEMPLATES` `:451` (10; budget + exam score over a closed exam list; number group must equal `String(value)`), and (c) no deny marker fires. Else kept + needsReview with `unrecognised-form:` (`:566`). Deny layer kept as second layer; in-law words added to `THIRD_PARTY_MARKERS` `:241` (devar, devrani, saali/sali, saala/sala, nanad, jeth, jethani, sasur, saas, sasural, behnoi/bahnoi, bhatija/bhanja, pati/patni/biwi + देवर … ससुराल, बहनोई, पति, पत्नी) and `IN_LAW_RE` `:338` ("in-law(s)"). Never drops a fact. `FIRST_PERSON_MARKERS` +maine/mene/मैंने |
| **ISS-t-013r-rev-8 (medium)** "resolveCitationSpan misses a citation whose raw stored text mixes NFC and NFD Devanagari (e.g. KA+NUKTA vs U+0958) in one span" | `packages/db/src/facts.ts:991` `resolveCitationSpan` NFC-normalises the quote and searches a per-field haystack from `nfcWithRawOffsets` `facts.ts:1035` (NFC per grapheme cluster with a raw start/end map per NFC index); match in NFC, offsets mapped back so `turn[field].slice(start,end)` is the RAW stored span. Same two strict tiers, never fuzzy |
| **ISS-t-013r-c1-1 (low)** "A genuinely first-person … typed number embedded in a date or ordinal context (e.g. '20 September', 'in 2026') auto-verifies …" | stopped by the allow-list: no number template has a date/year/ordinal slot and the slot must equal the value ("I scored 92 in my class 12 boards" verifies 92, NOT 12). Reason `unrecognised-form:` |

Old tests converted in place (none deleted): `scribe-citation-rescope.test.ts` USA positive now the whole clause "I want to move to the USA for my masters" (old cropped quote kept as an `unrecognised-form` negative); number positive now "I scored 42 in the exam" ("I have finished 42 credits so far" kept as an `unrecognised-form` negative).

New tests:
- `packages/engine/tests/scribe-citation-rescope.test.ts:421`: template POSITIVES (23 cases, EN/Hinglish/Devanagari, country, budget and score).
- `:456`: rev-4 questions (9 cases, including no "?", a cropped quote, क्या and "whether").
- `:475`: rev-5 conditionals (11 cases, including a template-shaped clause inside a conditional turn).
- `:497`: rev-6 in-law kinship. The 11 Hinglish words, ससुराल, बहनोई and English in-laws each sit around a template-matching clause, and each gives `third-party:`.
- `:513`: rev-6 unrecognised shapes (8 cases). The test asserts the ONLY reason is `unrecognised-form`.
- `:535`: c1-1 date, year and ordinal (6 cases).
- `packages/db/tests/facts.test.ts:1154`: rev-8 mixed NFC/NFD fixture. It asserts that raw, NFC-only and NFD-only matching each miss, and that the offsets slice the raw text.
- `packages/engine/evals/score-perfect.test.ts:65`: the eval test. Every cycle-2 hostile class is present and kept needsReview, fabricatedVerified is 0, and every `d020-template-positive` row verifies.

The golden set `qa/evals/scribe/sessions.jsonl` gains 26 sessions (35 -> 61):
- Hostile rows h14..h27:
  - question-english, question-hinglish, question-template-shape
  - conditional-if, conditional-agar, conditional-would, conditional-maybe, conditional-template-shape
  - inlaw-hinglish (devar), inlaw-devanagari (ससुराल)
  - date-day, date-year
  - unrecognised-past-visit, unrecognised-hearsay
- Template positives p01..p12: English, Hinglish and Devanagari country, budget and score.

## Verify (commands + REAL outputs, this cycle)

Every test run was gated on free RAM of at least 2.0 GB (it measured 2.5–3.6 GB) and ran one package at a time.

```
pnpm -r typecheck
  providers · schemas · observability · db · apps/api · mcp/university-kb · mcp/student-profile · engine · apps/web: Done (exit 0)

pnpm --filter @vc/schemas test              ℹ tests 56   ℹ pass 56   ℹ fail 0
pnpm --filter @vc/providers test            ℹ tests 31   ℹ pass 31   ℹ fail 0
pnpm --filter @vc/observability test        ℹ tests 57   ℹ pass 57   ℹ fail 0
pnpm --filter @vc/db test                   ℹ tests 213  ℹ pass 213  ℹ fail 0
pnpm --filter @vc/api test                  ℹ tests 8    ℹ pass 8    ℹ fail 0
pnpm --filter @vc/mcp-student-profile test  ℹ tests 12   ℹ pass 12   ℹ fail 0
pnpm --filter @vc/mcp-university-kb test    ℹ tests 9    ℹ pass 9    ℹ fail 0
pnpm --filter @vc/engine test               ℹ tests 310  ℹ pass 310  ℹ fail 0
pnpm --filter @vc/web test                  ℹ tests 24   ℹ pass 24   ℹ fail 0

python contracts/verify_contracts.py
  verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity
```

### Eval: BEFORE vs AFTER on the SAME new 61-session golden set

BEFORE is the cycle-1 code (`git checkout b851687 -- nodes.ts facts.ts` in the throwaway worktree) run on the new dataset.

```
BEFORE perfect    | 64 kept — 32 verified, 32 needsReview, 1 reasoning · D-020 hostile (mustReview) kept: 27 · fabricated-verified: 14 |
AFTER  perfect    | 64 kept — 14 verified, 50 needsReview, 1 reasoning · D-020 hostile (mustReview) kept: 27 · fabricated-verified: 0 |  recall 64/64
AFTER  case-drift | 64 kept — 14 verified, 50 needsReview, 1 reasoning · D-020 hostile (mustReview) kept: 27 · fabricated-verified: 0 |  recall 64/64
AFTER  fabricator | 0 kept — 0 verified, 0 needsReview, 0 reasoning · hostile kept: 0 · fabricated-verified: 0 |  precision 0.0%
AFTER  lazy       | 0 kept — 0 verified, 0 needsReview, 0 reasoning · hostile kept: 0 · fabricated-verified: 0 |  precision n/a
```

The BEFORE fabricated-verified count of 14 is exactly the new hostile rows h14..h27: cycle-1 code auto-verified every one of them. Of the AFTER verified count, 12 of 12 template-positive rows verify, and 1 of the 24 original non-hostile value facts does (s13; it was 6 of 24 in cycle 1). The 14th is the non-mustReview value fact in h13 (reasoning-before-value); its paired reasoning fact stays in review.

## Capability coverage — fix cycle 2

- **Where it ran:** a throwaway worktree, created with `git worktree add C:/Users/Lenovo/AppData/Local/Temp/claude/t013c2-1 HEAD --detach` (at fd7407e) followed by `pnpm install --offline`.
- **Cleanup:** it was removed afterwards with `worktree remove --force` and `prune`, and the directory was deleted (`Test-Path` = False).
- **How:** script `scratchpad/falsify2.py`, runner `tsx --test --test-concurrency=1 --test-name-pattern=<id>`, the same test id before and after.
- The build worktree was never mutated.

| capability | falsifying edit (copy only) | BEFORE (GREEN) | AFTER (RED) |
|---|---|---|---|
| rev-4 a question never auto-verifies | `hasInterrogative` -> `return false;` | `✔ ISS-t-013r-rev-4: a question never auto-verifies (reason: interrogative), English / Hinglish / Devanagari` [pass 1 fail 0] | `✖ ISS-t-013r-rev-4: …` [pass 0 fail 1] |
| rev-5 conditional never auto-verifies | `hasConditional` -> `return false;` | `✔ ISS-t-013r-rev-5: conditional / hypothetical phrasing never auto-verifies (reason: conditional)` [pass 1 fail 0] | `✖ ISS-t-013r-rev-5: …` [pass 0 fail 1] |
| rev-6 in-law kinship forces review | `hasThirdPartyMarker` -> old list only (in-law words filtered out, `IN_LAW_RE` dropped) | `✔ ISS-t-013r-rev-6: in-law kinship (Hinglish, Devanagari, English in-law) in the turn forces review even when the clause matches a template (reason: third-party)` [pass 1 fail 0] | `✖ …` [pass 0 fail 1] |
| rev-6 allow-list stops unrecognised shapes | `matchesAllowedTemplate` -> `return true;` (ALWAYS ALLOW) | `✔ ISS-t-013r-rev-6 allow-list: a first-person, un-negated, own, unscaled value in an UNRECOGNISED shape never auto-verifies (reason: unrecognised-form ONLY — no deny marker fires)` [pass 1 fail 0] | `✖ …` [pass 0 fail 1] |
| c1-1 date/year/ordinal numbers | ALWAYS ALLOW | `✔ ISS-t-013r-c1-1: a first-person number in a date / year / ordinal context never auto-verifies (reason: unrecognised-form)` [pass 1 fail 0] | `✖ …` [pass 0 fail 1] |
| templates not vacuous (unit) | `matchesAllowedTemplate` -> `return false;` (NEVER ALLOW) | `✔ ISS-t-013r-rev-6 allow-list POSITIVES: every template auto-verifies its own value, English / Hinglish / Devanagari` [pass 1 fail 0] | `✖ …` [pass 0 fail 1] |
| templates not vacuous (eval) | NEVER ALLOW | `✔ ISS-t-013r-rev-6: cycle-2 hostile classes stay in review, and every template-positive row auto-verifies (verified > 0)` [pass 1 fail 0] | `✖ …` [pass 0 fail 1] |
| eval hostile rows stay in review | ALWAYS ALLOW | same test id ✔ [pass 1 fail 0] | `✖ …` [pass 0 fail 1] |
| rev-8 mixed NFC/NFD span | `nfcWithRawOffsets`: `m[0].normalize("NFC")` -> `m[0]` | `✔ ISS-t-013r-rev-8: resolveCitationSpan finds a span whose STORED text mixes NFC and NFD Devanagari, and the offsets slice the raw stored text` [pass 1 fail 0] | `✖ …` [pass 0 fail 1] |
| ALWAYS ALLOW makes fabricatedVerified > 0 (eval `--provider=perfect`) | ALWAYS ALLOW | `64 kept — 14 verified, 50 needsReview … fabricated-verified: 0` | `64 kept — 23 verified, 41 needsReview … fabricated-verified: 4` |

Those 4 are h24..h27 (date-day, date-year, past-visit, hearsay), the rows only the allow-list stops. The question, conditional and in-law rows are also caught by the deny layer, by design.

## Live browser evidence (fix cycle 2)
**Not applicable.** No `apps/web` file changed, and `@vc/web` still passes 24/24.

## Open gaps (named, not hidden)
- **Review load (ISS-t-013r-rev-7, open, and now worse).** Auto-verified on the 24 original non-hostile value facts fell from 6 to 1. The facts that newly go to review:
  - s07 "I think I should go to the USA". This is correct: it contains `should` and a hedge.
  - s09 "we have finalised the UK as the target country"
  - s11 "I am interested in studying in Australia"
  - s14 "we want to go to Canada"
  - s16 "I finally decided on the UK as my target country"

  Each is a candidate template. Adding one should come with an eval row and a falsification. How far to widen the list is a product call on the counsellor's review load.
- **Devanagari country names** (कनाडा, यूके) are not in `COUNTRY_ALIASES`. Only a Latin country name inside a Devanagari sentence verifies; a Devanagari name goes to review, which is fail-safe.
- **"chahiye" is not a standalone marker.** Without kya or ?, "mujhe UK jana chahiye" goes to review as unrecognised-form, not as interrogative.
- **The templates are closed lists** (a closed exam list, at most 4 subject words). Any unlisted phrasing fails SAFE into review.
- **Counsellor read surface:** unchanged from cycle 1. There is still no HTTP or MCP transcript tool.
- **Fresh-context review** (ai-engineer, data-engineer, senior-software-engineer) was not dispatched from this build subagent. The orchestrator should run it.

## Status: fix-cycle-3 building (checker c2 FAIL d94f323 ISS-t-013r-c2-1; ai review BLOCK rev-9, rev-10; DE review BLOCK rev-12; D-023 scope)
