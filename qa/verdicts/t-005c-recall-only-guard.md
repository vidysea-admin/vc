# Verdict — t-005c-recall-only-guard

**Date:** 2026-09-26
**Cycle checked:** 0
**Contract:** qa/contracts/counselling-engine.md (B9, B16)
**Bound root:** D:/vc/.worktrees/t-005c-recall-only-guard
**Base commit (diff scope):** d0a7f2d (git merge-base main wave/t-005c-recall-only-guard); unit commit 886692d
**Checker mode:** Mode A unit check, fresh subagent, no builder context

## What I re-ran myself (never trusted the pasted manifest output)

- `pnpm -r test` — 581/581 pass across all 9 workspaces (schemas 50, providers 31, observability 57,
  db 196, api 8, student-profile 12, university-kb 9, engine 200, web 18). Matches the manifest's
  pasted numbers exactly, reproduced independently.
- `pnpm -r typecheck` — exit 0, all 9 workspace projects `Done`.
- `python contracts/verify_contracts.py` — exit 0, "no frozen contracts yet — PASS by vacuity".
- crisis-eval confusion matrix, reproduced myself: `{"crisis":{"crisis":53},"concern":{"concern":8},"none":{"none":30}}`,
  recall 53/53 = 1.0000, 0 mismatches across all 91 rows — matches the manifest exactly.

## Capability coverage — reproduced in my own throwaway copies, outside the bound root

Per row, I copied only `src/guards/crisis.ts` + `tests/guard-crisis.test.ts` into a fresh scratch dir
(one per row, `cap-row-{A,B,C,D}`), ran the named test to confirm GREEN **from the copy** (never
reusing the bound-tree's step-3 green), applied the single-hunk edit named in the manifest's
"What changed" file (`crisis.ts`), and re-ran to confirm RED for the assertion the check is named
for (not a parse/import crash).

| row | before (copy, green) | after falsifying edit | result |
|---|---|---|---|
| A — sentence punctuation folds like whitespace | ✔ pass, 4.15ms | `NON_WORD_RUN` widened to keep `.!?` literal | RED: `AssertionError: 'none' !== 'crisis'` — exactly the named assertion |
| B — zero-width chars deleted, not space-folded | ✔ pass, 9.16ms | removed `.replace(INVISIBLE_FORMAT_CHARS, "")` | RED: `AssertionError: 'none' !== 'crisis'` |
| C — letter-spacing collapse extends recall beyond squeeze list | ✔ pass, 4.17ms | `views` forced to `[normalised]` only | RED: `AssertionError: 'none' !== 'crisis'` |
| D — zalgo/combining-mark input stays linear | ✔ pass, 47.59ms | reintroduced the quadratic `FORMAT_RUN_BETWEEN_WORDS`-style lookbehind into `normalise()` | RED: confirmed independently with my own timing script on the falsified copy — n=5000: 1.59s, n=10000: 4.82s, n=25000: 27.29s (matches the manifest's own ~31.9s at n=25000 to the right order of magnitude); the in-suite 50k test with 5 reps didn't even finish inside a 60s wall-clock kill, consistent with severe super-linear blowup |
| ISS-040 policy row (no suppression re-added) | n/a — verified by direct evidence, not an edit | — | Verified: the 3 named phrases ("hurt my self-esteem", "attend it all", "an end. It all comes together") return `crisis` under the current code (confirmed via the passing test suite I re-ran), and `crisis.ts` contains none of `isStrongBoundary`/capitalisation-gate/`FORMAT_RUN_BETWEEN_WORDS`/`SELF_COMPOUND` (grep + full read). Reintroducing that whole suppression mechanism to falsify is out of scope for a single-hunk edit; accepted as the manifest states. |
| ISS-022 (loader path containment) | ported, not independently re-falsified by the maker | — | See "Additional findings" below — checker's own traversal testing found a gap outside this row's claim |
| ISS-024 (loader block-scalar) | ported, not independently re-falsified by the maker | — | Checker re-ran both loader.test.ts assertions directly (throw with the documented message); held |

**CAPABILITY-COVERAGE: 5/7 fully reproduced by the checker (A–D falsified; ISS-040 policy verified by
direct evidence); 2/7 (ISS-022, ISS-024) were inherited claims the maker did not independently
re-falsify in this unit — the checker's own traversal testing confirmed the existing tests hold, but
also surfaced one uncovered vector (symlink escape, filed as ISS-t-005c-c0-4) that neither row's
claim covers.**

## My own hostile inputs (beyond the manifest's tests)

Ran via a scratch script importing `crisisGuard` directly. Full results in-session; summary:

**Held (correctly flagged crisis):** punctuation/newline/hyphen/underscore/comma letter-spacing
("k-i-l-l myself", "k_i_l_l myself", "kill.\nmyself", "kil l myself" via the squeeze fallback),
zero-width chars embedded mid-word with no surrounding space ("kill\u200bmyself"), bidi control
characters (LRM, RLO/PDF, isolates) embedded mid-word, Devanagari in NFD form (recomposes via
`.normalize("NFC")` before matching), and emoji-separated letters/words ("k😊i😊l😊l myself",
"end😭it😭all").

**Missed (filed as new issues, see below):**
1. **Indirect English suicidal-ideation phrasing** — "everyone would be better off without me",
   "I won't be around next month", "I won't be here much longer", "I've been giving away all my
   things lately", "I just wanted to say goodbye to you now" — all return `none`. These are
   canonical indirect warning signs with no pattern coverage at all. → **ISS-t-005c-c0-1 (high)**.
2. **Hinglish "mar jaunga/jaungi"** (I will die) — returns `none`, distinct from the already-covered
   "marna/maut chahta" and "khud ko khatam" patterns. → **ISS-t-005c-c0-2 (high)**.
3. **Unicode-confusable evasion** — fullwidth Latin ("ｋｉｌｌ myself") and Cyrillic homoglyphs
   ("кill myself", "suiсidal") are `\p{L}` so they pass `normalise()` as ordinary letters but never
   reform into the ASCII string any pattern or squeezed-substring expects. → **ISS-t-005c-c0-3 (medium)**.
4. **Loader.ts symlink escape** — `resolveSkillDir`'s containment check (`resolve()` +
   `startsWith(base+sep)`) is purely lexical and never calls `realpathSync`. I created a scratch
   skills dir with a symlinked subfolder (`escape-hatch -> ../outside-secret`, name matching
   `SAFE_SKILL_NAME`) and `loadSkill`/`listSkills` both followed it and returned the outside file's
   body. Threat model caveat: requires local write access to the skills directory already, so this
   is a defense-in-depth gap, not a remote-input escalation via the untrusted `name` parameter
   ISS-022 was opened for. → **ISS-t-005c-c0-4 (medium)**.

**Worst-case runtime, measured myself (not the manifest's numbers):** zalgo 50k/100k/200k = 5.0/10.7/20.5ms
(≈linear); 200k zero-width chars in a word = 3.2ms; 200k single-letter tokens (letter-spacing worst
case) = 36.4ms; 100k→200k letter-spaced run = 11.5→26.7ms (≈linear); mixed zalgo+ZW = 7.3ms. No
super-linear growth found on any adversarial input I constructed. Confirms B16/D-020's linear-time
requirement independently of the manifest's own timing evidence.

**Suppression-path grep (crisis.ts):** the only three `"none"` returns are (1) empty/whitespace input,
(2) normalised text empty after stripping (unreachable for any input containing an actual crisis
pattern's letters), and (3) the natural end-of-function fallthrough when nothing matched. No
boundary/capitalisation/infinitive-exception logic exists anywhere in the file (confirmed by full
read + diff against the removed t-005b mechanisms). **No suppression path found.**

**Eval-set recategorisation honesty:** diffed `qa/evals/crisis-eval.jsonl` against the stalled
t-005b branch's final version (commit 073a96d) — exactly 8 rows flipped `hard_negative`/`none` →
`accepted_residual`/`crisis`, all named in the manifest, none of the other ~25 `hard_negative` rows
touched. `crisis-eval.test.ts`'s own re-run (0 mismatches across all 91 rows, independently
reproduced above) proves every row — flipped or not — matches what `crisisGuard` actually returns
today, which is definitionally impossible for a flip that "hides" a miss.

## Diff scope (base d0a7f2d)

`git diff d0a7f2d...HEAD --stat` touches exactly the 9 files the manifest's "What changed" lists,
nothing else. The only removed non-comment lines in `crisis.ts` are the OLD `crisisGuard` function
body (the un-normalised direct-match implementation), fully superseded by the new
normalise/collapse/squeeze pipeline with the same exported signature — not a capability deletion.
The only removed line in `guard-crisis.test.ts` is a test *title* rename (`"a benign use of 'dying'
is NOT flagged (documented false-positive guard)"` → `"...NOT flagged"`); the test body and
assertions are byte-identical. No existing test, export, or function was deleted without
replacement.

## Ledger updates

- `ISS-022`, `ISS-023`, `ISS-024` → moved `open → fixed` with `regression_check` set (the adapter's
  `pnpm -r test` plus the relevant test file) and a note detailing my independent re-verification.
- New: `ISS-t-005c-c0-1` (high, indirect English ideation gap), `ISS-t-005c-c0-2` (high, "mar
  jaunga/jaungi" gap), `ISS-t-005c-c0-3` (medium, Unicode-confusable evasion gap), `ISS-t-005c-c0-4`
  (medium, loader.ts symlink containment gap).
- `ISS-040` is referenced by the manifest but was never a `qa/issues.jsonl` row (only tracked via
  `qa/debug/t-005b-guard-hardening-cycle3.md` and `qa/gates/crisis-guard-precision.md`) — nothing to
  update in the ledger for it; its resolution is fully traceable via D-020.

## Judgment

Contract scope for this unit is B9 + B16. Both are met on their literal, measured text: B9's
escalation routing works for every currently-covered pattern (confirmed via the passing
`packages/engine` B9 tests I re-ran, including the hostile-variant test); B16's stated bar — recall
≥0.95 on the offline golden set — is met at 1.0 (53/53), independently re-measured. The unit's own
declared scope (supersede T-005b's suppression regressions; fix punctuation/newline/zero-width/
letter-spacing evasion of *existing* patterns; the D-020 policy reversion) is fully delivered and
independently falsified where falsification was the right instrument.

The four new issues I filed are real, defensible recall gaps (>80% confidence — reproduced directly,
pasted above) but sit **outside this unit's declared scope**: they are gaps in the pattern list
itself (new phrasing, new script/encoding classes), not regressions this unit introduced, and no
contract criterion requires this unit to expand the pattern list to arbitrary adversarial phrasing.
Per D-020's own recall-only philosophy, the correct remedy is to grow the golden set and pattern
list in a future unit, not to block this one. Given B16 explicitly gates "before any real-student
pilot" on the golden-set recall bar, I recommend ISS-t-005c-c0-1 and -c0-2 (both high) be prioritized
before that pilot gate, since they represent exactly the kind of golden-set blind spot that gate
exists to catch.

Not UI-touching (confirmed via diff scope — no `.tsx/.jsx`, no `apps/web/**`, no routes/pages/
components changed, and `apps/web`'s existing 18 UI tests are unaffected). Mode D not applicable.

```
VERDICT: PASS
SCOREBOARD: 2/2 criteria met (B9, B16), 0/0 invariants (contract has no invariants distinct from its B-numbered criteria)
FAILURES (if any):
- none at >80% confidence against the in-scope criteria (B9, B16)
CAPABILITY-COVERAGE: 5/7 rows reproduced by checker (A-D falsified, ISS-040 verified by evidence); 2/7 (ISS-022, ISS-024) inherited/not independently re-falsified by the maker, checker's own testing held but found one additional uncovered vector (ISS-t-005c-c0-4)
LIVE-BROWSER: not-applicable (engine/guards only; no UI paths changed, diff-scope confirmed)
ISSUES-WRITTEN: ISS-022 (fixed), ISS-023 (fixed), ISS-024 (fixed), ISS-t-005c-c0-1, ISS-t-005c-c0-2, ISS-t-005c-c0-3, ISS-t-005c-c0-4
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)
EXPLANATION: All manifest-claimed verify commands and capability falsifications reproduced independently, including 4/4 named crisis-guard falsifications (A-D) and the ISS-040 no-suppression policy claim. My own hostile inputs (indirect English ideation, Hinglish "mar jaunga", Unicode confusables, a loader.ts symlink escape) found real but out-of-scope recall/containment gaps, filed as 4 new issues (2 high, 2 medium) rather than failing this unit, since B9/B16's literal, measured bars are met and these gaps predate or fall outside this unit's declared work. Recommend prioritizing the two high-severity recall gaps before B16's real-student-pilot gate.
```
