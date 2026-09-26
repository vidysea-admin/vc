# Manifest — t-005c-recall-only-guard

**Contract:** qa/contracts/counselling-engine.md (B9, B16)
**Goal task:** none
**Date:** 2026-09-26
**Fix cycle:** 0 of max 3
**Dual check:** no
**Issues addressed:** ISS-022, ISS-023, ISS-024, ISS-040 (disposition below)
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

## How to verify (commands + expected)

- `pnpm install --frozen-lockfile` → exit 0 (node_modules was absent; installed once at unit start)
- `pnpm -r typecheck` → exit 0
- `pnpm -r test` → exit 0
- `python contracts/verify_contracts.py` → exit 0
- crisis-eval recall figure printed by `packages/engine/tests/crisis-eval.test.ts`

## Actual outputs (from maker's own run)

```
$ pnpm -r typecheck
Scope: 9 of 10 workspace projects
packages/schemas typecheck: Done
packages/providers typecheck: Done
packages/observability typecheck: Done
packages/db typecheck: Done
apps/api typecheck: Done
mcp/student-profile typecheck: Done
mcp/university-kb typecheck: Done
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
packages/engine test: tests 200, pass 200, fail 0
apps/web test: tests 18, pass 18, fail 0
TOTAL: 581 tests, 581 pass, 0 fail
```

```
$ python contracts/verify_contracts.py
verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity
exit 0
```

```
crisis-eval confusion matrix (expected -> {actual: count}): {"crisis":{"crisis":53},"concern":{"concern":8},"none":{"none":30}}
crisis recall: 53/53 (1.0000)
✔ crisis-eval: every row matches its documented expected level; crisis recall >= 0.95 (B16)
```
B16 requires recall >= 0.95 on the offline golden set; this unit measures **53/53 = 1.0000** (up from the base's crisis-labelled subset — every crisis/concern/benign_idiom/indirect/abuse row from the original 91-line set is unchanged, plus the 8 `accepted_residual` rows now correctly predicted "crisis" too, since they are documented as such).

Repeated timing runs of the zalgo doubling test (100k vs 200k chars, best-of-5 each), 3 consecutive `pnpm --filter @vc/engine test` invocations, to confirm no flake: ratios **2.04, 1.98, 2.90** — all well under the 3.5 ceiling, consistent with linear scaling.

## Capability coverage (each new claim -> its isolating falsification)

All falsifications were run against throwaway copies in the scratchpad (`crisis-base.ts` + `crisis-falsify-{A,B,C,D}.ts`), never against the live worktree tree, per the no-self-falsification rule.

| capability (one line) | the check that covers it | the falsifying edit | observed (pasted runner output) |
|---|---|---|---|
| Sentence punctuation (and any other separator) folds to whitespace before matching — not rescued by the squeezed-substring safety net | `guard-crisis.test.ts` "sentence punctuation folds like whitespace: 'beats. Me' -> crisis (not rescued by squeeze)" | Change `NON_WORD_RUN` to keep `.!?` literal instead of folding them to a space (`crisis-falsify-A.ts`) | before(base): `{"level":"crisis","matched":["\\b(beats|beating|hits|hitting)\\s+me\\b"]}` — after(falsified): `{"level":"none","matched":[]}` |
| Invisible Unicode format characters (zero-width joins) are DELETED, not turned into a space — needed because the Devanagari patterns are literal substrings with no `\s+` tolerance and have no squeezed-substring fallback | `guard-crisis.test.ts` "zero-width character inside a Devanagari word is deleted, not treated as a word gap" | Remove the explicit `.replace(INVISIBLE_FORMAT_CHARS, "")` step, letting Cf chars fall through to the generic space-fold instead (`crisis-falsify-B.ts`) | before(base): `{"level":"crisis","matched":["आत्महत्या"]}` — after(falsified): `{"level":"none","matched":[]}` |
| Letter-spacing collapse extends recall to patterns with no English squeezed-substring entry at all (Devanagari/Hinglish, or any English pattern not in the 7-item list) | `guard-crisis.test.ts` "letter-spacing collapse recovers an abuse pattern with no squeezed fallback: 'b e a t s me'" | Test only the plain `normalised` view, skip the `collapsed` view (`crisis-falsify-C.ts`) | before(base): `{"level":"crisis","matched":["\\b(beats|beating|hits|hitting)\\s+me\\b"]}` — after(falsified): `{"level":"none","matched":[]}` |
| Zalgo/combining-mark-heavy input runs in linear time (the removed `FORMAT_RUN_BETWEEN_WORDS` lookbehind was quadratic) | `guard-crisis.test.ts` "zalgo/combining-mark-heavy input (50k chars) runs in linear time" + "doubling zalgo input roughly doubles the time" | Reintroduce the quadratic `(?<=\p{L}\p{M}*\p{L}\p{M}*)\p{Cf}+(?=\p{L}\p{M}*\p{L})` lookbehind into `normalise()` (`crisis-falsify-D.ts`) | base at n=25000: **5.74ms**; falsified (quadratic) at the SAME n=25000: **31891.20ms** (~5555x slower) — reproduces the diagnosis's reported blowup; this run was killed before reaching 50k/100k to avoid multi-minute wall time, the n=25000 point alone already isolates the quadratic mechanism |
| The three named ISS-040 false alarms are documented expected flags (D-020), not suppressed | `guard-crisis.test.ts` "D-020 accepted residual: ... -> crisis (was 'none' under T-005b's suppression)" (3 rows) + `crisis-eval.jsonl` `accepted_residual` category (8 rows) + `crisis-eval.test.ts` | `NO ISOLATING FALSIFICATION NEEDED IN THE USUAL SENSE` — the "break" here is a POLICY reversion (reintroducing T-005b's suppression code), which was already built, tested and diagnosed as unstable across 3 fix cycles in `qa/debug/t-005b-guard-hardening-cycle3.md`; re-adding it would flip these rows back to "none", which is exactly what would fail the new test assertions and the `crisis-eval.jsonl` `accepted_residual` expectations. Not re-run here since reintroducing that whole mechanism is out of scope for a falsification and was already exhaustively probed by the stalled branch's own 3 cycles. |
| ISS-022: `loadSkill` refuses path traversal / absolute / uppercase / empty / NUL / space-containing skill names | `loader.test.ts` 9 ISS-022 tests (ported unchanged, all passing) | Not independently re-falsified here — ported verbatim from a unit whose own manifest (`t-005b-guard-hardening`, cycle 0-2 verdicts) already carries this capability's falsification, and the tests themselves assert the specific `Invalid skill name` message (not an incidental ENOENT), which is a self-isolating assertion | `packages/engine test: ✔ ISS-022: rejection is the name-allowlist guard itself, not an incidental ENOENT (0.6112ms)` plus 8 sibling passes, pasted above in the full test run |
| ISS-024: `loadSkill` throws a clear error on a YAML block-scalar (`>`/`|`) frontmatter value instead of silently storing the chomping character | `loader.test.ts` 2 ISS-024 tests against the new `block-scalar`/`block-scalar-pipe` fixtures | Not independently re-falsified here — same rationale as ISS-022 above; a bare `assert.throws` on a purpose-built fixture whose ONLY defect is the block scalar is self-isolating (the fixture is otherwise well-formed) | `packages/engine test: ✔ ISS-024: loadSkill throws on a YAML block-scalar description ('description: >') (0.6066ms)` + `('description: |')`, pasted above |

## Live browser evidence

Not UI-touching. Changed paths: `packages/engine/src/guards/crisis.ts`, `packages/engine/src/skills/loader.ts`, `packages/engine/tests/{guard-crisis,crisis-eval,loader}.test.ts`, `packages/engine/tests/fixtures/skills-malformed/{block-scalar,block-scalar-pipe}/SKILL.md`, `qa/evals/crisis-eval.jsonl`. None are `*.tsx|jsx|vue|svelte|html|css`, `apps/web/**`, `**/routes/**`, `**/pages/**`, or `**/components/**`, and none of `apps/web`'s existing UI tests changed behaviour (still 18/18 pass) — the crisis guard's output only reaches the UI as an `EscalationCard.matched` string array already covered by `guard-crisis.test.ts`/`crisis-eval.test.ts`, not rendered as new UI copy.

## Status: ready-for-check
