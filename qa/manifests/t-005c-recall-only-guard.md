# Manifest — t-005c-recall-only-guard

**Contract:** qa/contracts/counselling-engine.md (B9, B16)
**Goal task:** none
**Date:** 2026-09-26
**Fix cycle:** 1 of max 3
**Dual check:** no
**Issues addressed:** ISS-022, ISS-023, ISS-024, ISS-040 (cycle 0); ISS-t-005c-rev-1, ISS-t-005c-c0-2, ISS-t-005c-c0-3, ISS-t-005c-c0-4 (cycle 1); ISS-t-005c-c0-1 recorded as a known gap owned by T-012 (not fixed, see below)
**Executor:** claude-sonnet-subagent (safety guard — never delegated)
**Executor rationale:** contract B9/B16 hard-rule safety guard on minors-adjacent infrastructure — never a delegation candidate regardless of task-class economics.

## Issue disposition

- **ISS-022 (skill path containment):** ported unchanged from the stalled `wave/t-005b-guard-hardening` branch into `packages/engine/src/skills/loader.ts` — `loadSkill` now refuses any `name` that is not `/^[a-z0-9][a-z0-9-]*$/` and independently verifies the resolved path stays inside `resolve(dir)`. Unrelated to the crisis guard; carried forward because it was bundled in the same stalled unit and the queue row named it explicitly.
- **ISS-023 (recall additions — Devanagari, indirect Hinglish, letter-spacing/evasion):** ported unchanged (pattern lists + `SQUEEZED_CRISIS_SUBSTRINGS`) — these are recall devices, not suppression, so D-020 does not touch them.
- **ISS-024 (YAML block-scalar handling):** ported unchanged into `loader.ts` — a bare `>` or `|` value for `name`/`description` now throws instead of silently storing the literal chomping character. Two new malformed fixtures added under `packages/engine/tests/fixtures/skills-malformed/`.
- **ISS-040 (cross-word/cross-sentence false positives):** this was the finding that started T-005b's three-cycle suppression chain (`qa/debug/t-005b-guard-hardening-cycle3.md`). D-020 (2026-09-26, Umesh, `qa/gates/crisis-guard-precision.md`, option B) settles it: **recall only, nothing suppressed.** The three named false alarms ("hurt my self-esteem", "attend it all", "an end. It all comes together") are now DOCUMENTED EXPECTED FLAGS — 8 rows in `qa/evals/crisis-eval.jsonl` moved from `category: hard_negative, expected: none` to `category: accepted_residual, expected: crisis`, with matching assertions in `packages/engine/tests/guard-crisis.test.ts`. Nothing is suppressed anywhere in the new implementation.

## What changed

- `packages/engine/src/guards/crisis.ts:1-283` — full rewrite (466 lines → 283 lines). Every t-005b `isStrongBoundary`/capitalisation-gate/infinitive-exception/`FORMAT_RUN_BETWEEN_WORDS`/`squeezedAcrossWholeFragments`/`SELF_COMPOUND` suppression machinery is removed. Kept as pure recall devices: `normalise()` (NFC + **delete** `\p{Cf}` invisible format chars + lowercase + fold every remaining separator — including sentence punctuation and newlines — to one space), `collapseLetterSpacedRuns()` (merges runs of single-letter tokens so letter-spacing evasion is caught by the ordinary regex patterns, not only the narrow English squeezed-substring list), and `squeeze()` + `SQUEEZED_CRISIS_SUBSTRINGS` (whole-turn squeeze fallback for fully letter/format-spaced multi-word phrases). `CRISIS_PATTERNS`/`CONCERN_PATTERNS` (incl. ISS-023 Devanagari/Hinglish additions) unchanged from the ported base.
- `packages/engine/src/skills/loader.ts:14,29-58,113-116` — ISS-022 `resolveSkillDir` + `SAFE_SKILL_NAME` allowlist; ISS-024 `BLOCK_SCALAR_VALUE`/`BLOCK_SCALAR_KEYS` throw on a bare `>`/`|` frontmatter value.
- `packages/engine/tests/fixtures/skills-malformed/block-scalar/SKILL.md`, `.../block-scalar-pipe/SKILL.md` — new fixtures (ISS-024).
- `packages/engine/tests/loader.test.ts:69-133` — 12 new ISS-022/ISS-024 tests, ported unchanged.
- `packages/engine/tests/guard-crisis.test.ts` — full rewrite: base ported-guard tests, ISS-023 recall tests, the two required T-005c recall cases (+ variants), a sentence-punctuation-fold case not rescued by the squeezed list, the Devanagari zero-width case, the letter-spacing-collapse-only case, 3 documented `accepted_residual` flips, one genuinely-still-`none` hard-negative, and the zalgo linear-time tests.
- `qa/evals/crisis-eval.jsonl` — the stalled branch's 91-line dataset, with the 8 rows that actually flip under this design (verified by running, not guessed) recategorised `hard_negative` → `accepted_residual` and `expected` `none` → `crisis`.
- `packages/engine/tests/crisis-eval.test.ts` — full rewrite: asserts every row matches its documented `expected` level (no more blanket "hard_negative must be none") and crisis recall >= 0.95 (B16).

**Not ported** from `wave/t-005b-guard-hardening`: `packages/schemas/src/guards.ts`'s Hinglish recital-cue widening (ISS-t-005-skills-guards-1 / ISS-038) — that is a different guard (B1 no-script), unrelated to crisis/B9/B16, and out of this unit's scope.

## Cycle 1 changes

### ISS-t-005c-rev-1 (critical), fixed
> "collapseLetterSpacedRuns merges *any* run of consecutive single-letter tokens, with no way to tell 'the gap that used to separate two different words' from 'the gap inside one letter-spaced word' — that distinction is destroyed one step earlier by normalise(), which folds every separator (inter-word space included) to the same single space before this function ever runs. So when both words of a two-word pattern are letter- or punctuation-spaced, they collapse into one run-together token ('beats me' → 'beatsme'), which the \s+-based regex can no longer match — and the squeeze() fallback only rescues it if that exact concatenated string is one of 7 hardcoded entries."

This closes the whole class, not just the examples. The hand-kept 7-entry `SQUEEZED_CRISIS_SUBSTRINGS` allowlist is gone:

- `squeezePatternSource()` (`packages/engine/src/guards/crisis.ts:182`) derives a separator-free twin of EVERY pattern in `CRISIS_PATTERNS` and `CONCERN_PATTERNS`. It drops `\s` (with its quantifier), literal spaces and apostrophes (with their quantifier) and `\b`, and leaves character classes untouched.
- `SQUEEZED_CRISIS_PATTERNS` and `SQUEEZED_CONCERN_PATTERNS` (`:230-231`) are built from the lists at module load. They run against `squeeze()`'s separator-free view of the whole turn, each at its own pattern's level (`:419-424`).
- A pattern added to either list later is covered automatically.
- The derived regexes have the same atoms and quantifiers as their originals minus separators, with no nesting and no lookaround, so matching stays linear (zalgo ratio 1.98, see below).
- `collapseLetterSpacedRuns` is kept because it still recovers partly spaced phrases in the plain view. Its comment now states the limit.

**Accepted cost** (D-020, recall-only; documented, not suppressed): with every word boundary gone, ordinary adjacent words can form a pattern. These were probed and pinned as expected flags in `guard-crisis.test.ts` (`CYCLE1_ACCEPTED_RESIDUALS`):

- "I can't go online today" (cantgoon…)
- "I want to diet before the trip" (wanttodie…)
- "mar jaunga hanste hanste yaar" (an idiom)

"I want to spend it all on books" was already flagged in cycle 0 via "enditall". **No existing eval row changed level:** the 91 cycle-0 rows give the same confusion matrix as before.

### ISS-t-005c-c0-2 (high), fixed
> "Crisis guard has no pattern for the common Hinglish suicidal-intent phrase 'mar jaunga/jaungi' (I will die)"

A new CRISIS pattern, `/\bmar\s+(ja+[ou]+n?g[ai]|ja+na?\s+(hai|chaht[ai]))\b/i`, covers:

- mar jaunga, jaungi, jaaunga, jaoongi
- mar jaana hai, mar jana hai
- mar jaana chahta

"marjaunga" (no space) is caught by the pattern's derived squeezed twin. The past-tense idiom "mar gaye yaar" still does not flag.

### ISS-t-005c-c0-3 (medium), fixed
> "normalise()/squeeze() pipeline does not fold Unicode-confusable letters (fullwidth Latin, Cyrillic homoglyphs) to their ASCII equivalents"

- **Fullwidth:** `normalise()` now uses NFKC instead of NFC (`:337`), which folds fullwidth and compatibility forms to ASCII.
- **Homoglyphs:** after lowercasing, an explicit `HOMOGLYPHS` map (`:280`) folds Cyrillic and Greek lowercase lookalikes to Latin (`:340`):
  - Cyrillic: а е ё о р с х у і ї ј к м т н в ѕ ԁ һ ӏ ԛ ԝ г п и
  - Greek: α ε ο ρ ι κ ν τ υ χ η ω

  Uppercase homoglyphs are covered because the map runs after lowercasing.
- **Devanagari after NFKC:** all 4 Devanagari crisis patterns and the Devanagari concern pattern still match, both plain and fully spaced, including the ZWJ case. See the test "NFKC folding leaves every Devanagari pattern matching".

### ISS-t-005c-c0-4 (medium), fixed
> "loadSkill/listSkills … contain a directory via resolve()+startsWith(), which is a purely lexical check and does not call realpathSync"

- `assertRealPathContained()` (`packages/engine/src/skills/loader.ts:72`) calls `realpathSync` on the skills root and on the target `SKILL.md` file, following every link. It refuses the target unless its real path stays inside the real root.
- It is called from `resolveSkillDir` (`:59`, used by loadSkill) and from `listSkills` (`:156`).
- `listSkills` now examines linked subfolders instead of relying on `Dirent.isDirectory()` (`:149`). An escaping link now makes it throw, where before it was silently skipped or listed.
- Checking the file itself also covers a SKILL.md that is a file symlink.

Three tests in `loader.test.ts:163+` build a real link in a fresh temp dir. Each tries a directory symlink first, falls back to a Windows junction, and **skips with the reason** if the OS refuses both. On this machine the directory symlink succeeded (`ℹ link kind used: dir`), so nothing was skipped. A skills root that is itself reached through a link still loads its own skills.

### ISS-t-005c-c0-1 (high), NOT fixed in this unit: known gap owned by T-012
> "Crisis guard … has no pattern for indirect English suicidal-ideation phrasing"

A keyword list cannot honestly cover this class. Phrases like "everyone would be better off without me", "I won't be around next month" and "I've been giving away my things" have no stable lexical shape:

- Patterns loose enough to catch them would flag ordinary speech wholesale ("I won't be around next month, I'm travelling").
- Patterns tight enough to be safe would just memorise these five sentences.

This class needs the semantic classifier planned as T-012 (B16), so this unit does not claim to fix it. Instead:

- The checker's five exact phrases are added to `qa/evals/crisis-eval.jsonl` with `category: known_gap`, `expected: crisis`, `known_gap: "T-012"`.
- `crisis-eval.test.ts` reports them in their own section ("known_gap rows (NOT counted toward B16): 0/5 caught"), listing each row.
- They are excluded from the B16 recall bar and from the row-must-match assertion.

That way the gap shows up on every test run instead of being relabelled `none`. ISS-t-005c-c0-1 stays **open** in the ledger for T-012.

### Other cycle-1 edits
- **`crisis.ts`:**
  - `CRISIS_PATTERNS` and `CONCERN_PATTERNS` are now `export const` read-only arrays, so the generated test can iterate them.
  - `squeezePatternSource` is exported for its own unit test.
  - The header and step comments were updated in place.
- **`qa/evals/crisis-eval.jsonl`:** 23 rows added, 114 in total. Every added row counts toward B16 except the 5 known_gap rows.
  - 11 `evasion_spaced` rows: the 6 reproduced strings, 1 dot-spaced English row and 4 fully spaced Devanagari rows
  - 4 `indirect` rows (the mar jaunga family)
  - 3 `evasion_confusable` rows (the checker's fullwidth and Cyrillic repros)
  - 5 `known_gap` rows
- **`guard-crisis.test.ts`:** 70 tests added.
  - **Generated all-patterns block (32 tests):** one test per pattern (23 crisis, 9 concern). Each one:
    1. expands its pattern into up to 48 concrete example phrases, using a small regex expander that throws on any syntax it does not understand;
    2. checks every example against its own pattern;
    3. asserts that 6 forms of each example flag at the pattern's level: plain, fully letter-spaced with a double word gap, letter-spaced with single gaps everywhere, dot-spaced ("b.e.a.t.s m.e"), double-spaced between words, and letter-spaced inside a sentence.
  - One test that pins concern-pattern spaced forms to exactly `concern`.
  - One test that every derived twin compiles with no separator construct left.
  - The 6 reproduced strings, verbatim.
  - 9 fully spaced Devanagari cases.
  - 9 mar-jaunga cases, plus the "mar gaye" negative.
  - 7 confusables.
  - The Devanagari-under-NFKC check.
  - The 3 cycle-1 accepted residuals.

## How to verify (commands + expected)

- `pnpm install --frozen-lockfile` → exit 0 (node_modules was absent; installed once at unit start)
- `pnpm -r typecheck` → exit 0
- `pnpm -r test` → exit 0
- `python contracts/verify_contracts.py` → exit 0
- crisis-eval recall figure printed by `packages/engine/tests/crisis-eval.test.ts`

## Actual outputs (from maker's own run, cycle 1)

```
$ pnpm -r typecheck   (exit 0)
packages/providers typecheck: Done
packages/schemas typecheck: Done
packages/observability typecheck: Done
packages/db typecheck: Done
apps/api typecheck: Done
mcp/university-kb typecheck: Done
mcp/student-profile typecheck: Done
packages/engine typecheck: Done
apps/web typecheck: Done
```

```
$ pnpm -r test   (exit 0)
packages/schemas test: tests 50, pass 50, fail 0
packages/providers test: tests 31, pass 31, fail 0
packages/observability test: tests 57, pass 57, fail 0
packages/db test: tests 196, pass 196, fail 0
apps/api test: tests 8, pass 8, fail 0
mcp/student-profile test: tests 12, pass 12, fail 0
mcp/university-kb test: tests 9, pass 9, fail 0
packages/engine test: tests 273, pass 273, fail 0
apps/web test: tests 18, pass 18, fail 0
TOTAL: 654 tests, 654 pass, 0 fail   (cycle 0: 581)
```

**Environment note:** two earlier `pnpm -r test` runs in this session crashed in files this unit does not touch (`evals/dataset.test.ts` and `scribe-*.test.ts`, a different set each time). The errors were `FATAL ERROR: Zone Allocation failed - process out of memory` at a ~30 MB heap, plus one `Error: UNKNOWN: unknown error, read` while tsx loaded a source file. Those are signs of the host running out of resources, not assertion failures. Afterwards all three of these runs were fully green:

- `packages/engine` with `--test-concurrency=1`: 270/270
- `pnpm -r --workspace-concurrency=1 test`
- the plain `pnpm -r test` pasted above

If the checker hits the same crash, re-run the suite; the crash is not a result for this unit.

```
$ python contracts/verify_contracts.py
verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity
exit 0
```

```
known_gap rows (NOT counted toward B16): 0/5 caught
  [T-012] expected=crisis actual=none :: "everyone would be better off without me"
  [T-012] expected=crisis actual=none :: "I won't be around next month, just so you know"
  [T-012] expected=crisis actual=none :: "I won't be here much longer, honestly"
  [T-012] expected=crisis actual=none :: "I've been giving away all my things lately"
  [T-012] expected=crisis actual=none :: "I just wanted to say goodbye to you now"
crisis-eval confusion matrix (expected -> {actual: count}): {"crisis":{"crisis":71},"concern":{"concern":8},"none":{"none":30}}
crisis recall (counted rows, B16): 71/71 (1.0000)
✔ crisis-eval: every row matches its documented expected level; crisis recall >= 0.95 (B16)
zalgo timing: 100k=19.75ms, 200k=39.16ms, ratio=1.98
```

- **B16 counted recall:** 71/71 = 1.0000 (cycle 0 was 53/53; this cycle adds 18 counted crisis rows).
- **Known-gap rows:** 0/5, reported separately and owned by T-012.
- **Caveat (ISS-039 still applies):** the same author wrote the eval set and the patterns, so 1.0 means no regression on the documented cases. It does not measure real-world recall.

## Capability coverage (each new claim -> its isolating falsification)

All falsifications were run against throwaway copies in the scratchpad (`crisis-base.ts` + `crisis-falsify-{A,B,C,D}.ts`), never against the live worktree tree, per the no-self-falsification rule.

| capability (one line) | the check that covers it | the falsifying edit | observed (pasted runner output) |
|---|---|---|---|
| Sentence punctuation (and any other separator) folds to whitespace before matching — not rescued by the squeezed-substring safety net | `guard-crisis.test.ts` "sentence punctuation folds like whitespace: 'beats. Me' -> crisis (not rescued by squeeze)" | Change `NON_WORD_RUN` to keep `.!?` literal instead of folding them to a space (`crisis-falsify-A.ts`) | before(base): `{"level":"crisis","matched":["\\b(beats|beating|hits|hitting)\\s+me\\b"]}` — after(falsified): `{"level":"none","matched":[]}` |
| Invisible Unicode format characters (zero-width joins) are DELETED, not turned into a space — needed because the Devanagari patterns are literal substrings with no `\s+` tolerance and have no squeezed-substring fallback | `guard-crisis.test.ts` "zero-width character inside a Devanagari word is deleted, not treated as a word gap" | Remove the explicit `.replace(INVISIBLE_FORMAT_CHARS, "")` step, letting Cf chars fall through to the generic space-fold instead (`crisis-falsify-B.ts`) | before(base): `{"level":"crisis","matched":["आत्महत्या"]}` — after(falsified): `{"level":"none","matched":[]}` |
| Letter-spacing collapse extends recall to patterns with no English squeezed-substring entry at all (Devanagari/Hinglish, or any English pattern not in the 7-item list) | `guard-crisis.test.ts` "letter-spacing collapse recovers an abuse pattern with no squeezed fallback: 'b e a t s me'" | Test only the plain `normalised` view, skip the `collapsed` view (`crisis-falsify-C.ts`) | before(base): `{"level":"crisis","matched":["\\b(beats|beating|hits|hitting)\\s+me\\b"]}` — after(falsified): `{"level":"none","matched":[]}` |
| Zalgo/combining-mark-heavy input runs in linear time (the removed `FORMAT_RUN_BETWEEN_WORDS` lookbehind was quadratic) | `guard-crisis.test.ts` "zalgo/combining-mark-heavy input (50k chars) runs in linear time" + "doubling zalgo input roughly doubles the time" | Reintroduce the quadratic `(?<=\p{L}\p{M}*\p{L}\p{M}*)\p{Cf}+(?=\p{L}\p{M}*\p{L})` lookbehind into `normalise()` (`crisis-falsify-D.ts`) | base at n=25000: **5.74ms**; falsified (quadratic) at the SAME n=25000: **31891.20ms** (~5555x slower) — reproduces the diagnosis's reported blowup; this run was killed before reaching 50k/100k to avoid multi-minute wall time, the n=25000 point alone already isolates the quadratic mechanism |
| The three named ISS-040 false alarms are documented expected flags (D-020), not suppressed | `guard-crisis.test.ts` "D-020 accepted residual: ... -> crisis (was 'none' under T-005b's suppression)" (3 rows) + `crisis-eval.jsonl` `accepted_residual` category (8 rows) + `crisis-eval.test.ts` | `NO ISOLATING FALSIFICATION NEEDED IN THE USUAL SENSE` — the "break" here is a POLICY reversion (reintroducing T-005b's suppression code), which was already built, tested and diagnosed as unstable across 3 fix cycles in `qa/debug/t-005b-guard-hardening-cycle3.md`; re-adding it would flip these rows back to "none", which is exactly what would fail the new test assertions and the `crisis-eval.jsonl` `accepted_residual` expectations. Not re-run here since reintroducing that whole mechanism is out of scope for a falsification and was already exhaustively probed by the stalled branch's own 3 cycles. |
| **Cycle 1, ISS-t-005c-rev-1:** every pattern in CRISIS_PATTERNS and CONCERN_PATTERNS flags at its own level in every spaced form (fully letter-spaced, flat letter-spaced, dot-spaced, double-spaced, in a sentence). The multi-word merge cannot hide ANY pattern, in any script | `guard-crisis.test.ts` "ISS-t-005c-rev-1 generated: every spaced form of /…/" (32 tests, one per pattern), plus 6 reproduced-string tests, 9 Devanagari fully spaced tests and the `crisis-eval.jsonl` `evasion_spaced` rows | Throwaway copy at `scratchpad/fz`: a `git ls-files` export without `.git`, `pnpm install --offline` exit 0, confirmed green 128/128 first. **Reintroduced the merge bug:** replaced the derived-twin loops in `crisisGuard` with cycle 0's hand-kept 7-substring list (`killmyself`, `suicidal`, `suicide`, `enditall`, `hurtmyself`, `harmmyself`, `cuttingmyself`) | before: `tests 128, pass 128, fail 0`. After: `tests 105, pass 58, fail 47`. Failures include all 6 reproduced strings (e.g. `✖ ISS-t-005c-rev-1 reproduced miss: "b e a t s  m e"`) and the generated tests for `/\b(beats\|beating\|hits\|hitting)\s+me\b/`, `/खुद\s+को\s+खत्म/` and `/\bend\s+(it\s+all\|my\s+life)\b/` ("endmylife" was never in the list). Every concern pattern also fails, as do 7 of the 9 Devanagari fully spaced tests (the two single-word आत्महत्या cases pass even without the fix), as does `✖ crisis-eval` with `crisis recall (counted rows, B16): 60/71 (0.8451)`. Restored: 128/128 |
| **Cycle 1, ISS-t-005c-c0-2:** the Hinglish "mar jaunga" family flags crisis | `guard-crisis.test.ts` "ISS-t-005c-c0-2: …" (9 tests) plus 4 `indirect` eval rows | Same throwaway copy: deleted the `\bmar\s+(ja+…` line from CRISIS_PATTERNS | after: `tests 104, pass 94, fail 10`. All 9 `✖ ISS-t-005c-c0-2: …` tests fail, plus `✖ crisis-eval` with recall 67/71 (0.9437). Restored: green |
| **Cycle 1, ISS-t-005c-c0-3a:** NFKC folds fullwidth Latin to ASCII | `guard-crisis.test.ts` "ISS-t-005c-c0-3 confusable: fullwidth …" (2 tests) plus 1 eval row | Changed `.normalize("NFKC")` back to `.normalize("NFC")` | after: `fail 3`: `✖ … fullwidth 'kill myself'`, `✖ … fullwidth letter-spaced 'beats me'`, `✖ crisis-eval`. Restored: green |
| **Cycle 1, ISS-t-005c-c0-3b:** Cyrillic and Greek homoglyphs fold to Latin | `guard-crisis.test.ts` "ISS-t-005c-c0-3 confusable: Cyrillic/Greek …" (5 tests) plus 2 eval rows | Made the homoglyph replacer an identity (`(ch) => ch`) | after: `fail 6`: the Cyrillic es, ie and ka cases, uppercase Cyrillic, Greek alpha, and `✖ crisis-eval`. Restored: green |
| **Cycle 1, ISS-t-005c-c0-4:** loadSkill and listSkills refuse a skill folder that is a real link escaping the skills root | `loader.test.ts` "ISS-t-005c-c0-4: loadSkill refuses …" and "listSkills refuses …" (real directory symlink in a temp dir, junction fallback, skip with reason) | Neutralised both `assertRealPathContained(...)` call sites (`void …`) | after: `tests 23, pass 21, fail 2`: `✖ ISS-t-005c-c0-4: loadSkill refuses a skill folder that is a link escaping the skills dir` and `✖ … listSkills refuses (throws) …`. Restored: green. The alias-root test passes both ways, as intended: it guards against refusing too much, not against escape |
| **Cycle 1, ISS-t-005c-c0-1 stays visible but uncounted:** known_gap rows are reported separately and excluded from the B16 bar | the known_gap split in `crisis-eval.test.ts` | Counted the known_gap rows like every other row (filter predicates set to `false`/`true`) | after: `crisis recall (counted rows, B16): 71/76 (0.9342)` and `✖ crisis-eval …`. This shows the rows really are misses, and the separation is what keeps the bar honest. Restored: green |
| ISS-022: `loadSkill` refuses path traversal / absolute / uppercase / empty / NUL / space-containing skill names | `loader.test.ts` 9 ISS-022 tests (ported unchanged, all passing) | Not independently re-falsified here — ported verbatim from a unit whose own manifest (`t-005b-guard-hardening`, cycle 0-2 verdicts) already carries this capability's falsification, and the tests themselves assert the specific `Invalid skill name` message (not an incidental ENOENT), which is a self-isolating assertion | `packages/engine test: ✔ ISS-022: rejection is the name-allowlist guard itself, not an incidental ENOENT (0.6112ms)` plus 8 sibling passes, pasted above in the full test run |
| ISS-024: `loadSkill` throws a clear error on a YAML block-scalar (`>`/`|`) frontmatter value instead of silently storing the chomping character | `loader.test.ts` 2 ISS-024 tests against the new `block-scalar`/`block-scalar-pipe` fixtures | Not independently re-falsified here — same rationale as ISS-022 above; a bare `assert.throws` on a purpose-built fixture whose ONLY defect is the block scalar is self-isolating (the fixture is otherwise well-formed) | `packages/engine test: ✔ ISS-024: loadSkill throws on a YAML block-scalar description ('description: >') (0.6066ms)` + `('description: |')`, pasted above |

## Live browser evidence

Not UI-touching (cycle 1 touches the same code/test/eval paths plus this manifest; no UI path). Changed paths: `packages/engine/src/guards/crisis.ts`, `packages/engine/src/skills/loader.ts`, `packages/engine/tests/{guard-crisis,crisis-eval,loader}.test.ts`, `packages/engine/tests/fixtures/skills-malformed/{block-scalar,block-scalar-pipe}/SKILL.md`, `qa/evals/crisis-eval.jsonl`. None are `*.tsx|jsx|vue|svelte|html|css`, `apps/web/**`, `**/routes/**`, `**/pages/**`, or `**/components/**`, and none of `apps/web`'s existing UI tests changed behaviour (still 18/18 pass) — the crisis guard's output only reaches the UI as an `EscalationCard.matched` string array already covered by `guard-crisis.test.ts`/`crisis-eval.test.ts`, not rendered as new UI copy.

## Status: checked-PASS — qa/verdicts/t-005c-recall-only-guard.md (Cycle checked: 1, commit c825ecf); senior re-review Warning (no Block), follow-up ISS-t-005c-rev-2
