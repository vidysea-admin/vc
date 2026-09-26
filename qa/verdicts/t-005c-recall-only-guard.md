# Verdict — t-005c-recall-only-guard

**Date:** 2026-09-26
**Cycle checked:** 1
**Contract:** qa/contracts/counselling-engine.md (B9, B16)
**Bound root:** D:/vc/.worktrees/t-005c-recall-only-guard
**Base commit (diff scope):** d0a7f2d; unit commits 886692d (cycle 0), 8019945 (cycle 1, HEAD)
**Prior cycle:** cycle-0 checker PASS at commit 274b440 was overridden by a senior-software-engineer
review Block (ISS-t-005c-rev-1, critical). That cycle-0 verdict content is superseded below; see
git history at 274b440 for its full text.
**Checker mode:** Mode A unit check, fresh subagent, no builder context. Host RAM was constrained
(~0.6–1.8 GB free during this check) — every suite below was run per-package / per-file, never
`pnpm -r test` in one process, per the dispatch's instruction.

## What I re-ran myself (never trusted the pasted manifest output)

- `tsx --test tests/guard-crisis.test.ts tests/crisis-eval.test.ts tests/loader.test.ts` (the three
  changed test files, `--test-concurrency=1`, capped heap): **131/131 pass**, matches the manifest's
  claim for these files exactly.
- `tsx --test tests/*.test.ts evals/*.test.ts` (the full `@vc/engine` package, `--test-concurrency=1`):
  **273/273 pass**, 60.2s wall time, no OOM this run — matches the manifest's pasted `packages/engine
  test: tests 273, pass 273, fail 0` exactly. (I did not additionally run the other 8 workspaces —
  the diff touches only `packages/engine` + `qa/`, confirmed by `git diff d0a7f2d...HEAD --stat`, so
  they carry no capability claim for this unit; cycle 0's checker already independently reproduced
  581/581 repo-wide at that point, and nothing outside `packages/engine`/`qa/` changed since.)
- `packages/engine`: `tsc --noEmit` — **exit 0**.
- `crisis-eval.test.ts`'s own printed output, reproduced independently: confusion matrix
  `{"crisis":{"crisis":71},"concern":{"concern":8},"none":{"none":30}}`, counted-row recall
  **71/71 (1.0000)**, known_gap **0/5 caught** (the 5 rows listed by name) — matches the manifest
  exactly.
- Zalgo timing from the in-suite test, reproduced: `100k=10.68ms, 200k=22.75ms, ratio=2.13` (matches
  the manifest's own `ratio=1.98` to the same order of magnitude; both comfortably under the 3.5
  quadratic-detection ceiling).

## Capability coverage — reproduced in MY OWN throwaway copies, outside the bound root

Per the checker SKILL.md's 2026-09-17 rule, each row below was copied fresh into its own scratch
directory, confirmed **green from the copy** first (never reusing the bound tree's step-3 green),
then a single-hunk edit to the one file named in "What changed" was applied and re-verified **red**,
isolating the exact mechanism. The bound working tree was never edited.

| capability | my own repro (beyond/independent of the manifest's own falsification) | before (copy, green) | after falsifying edit | result |
|---|---|---|---|---|
| **ISS-t-005c-rev-1 (critical):** derived separator-free twin of every pattern closes the multi-word squeeze gap | Extended with MY OWN hostile separator set beyond the 6 senior-review repros: underscore (`k_i_l_l my_self`), hyphen, slash, tab, NBSP (U+00A0), ideographic space (U+3000), emoji-between-letters (`k😊i😊l😊l my😊self`), emoji-between-words (`b😀e😀a😀t😀s m😀e`) | 16/16 pass (6 senior-review repros + 10 of my own) | Single-hunk: replaced the `SQUEEZED_CRISIS_PATTERNS`/`SQUEEZED_CONCERN_PATTERNS` derived-twin loops in `crisisGuard` with cycle 0's hand-kept 7-substring list | 9/16 — the 6 senior-review repros AND my own multi-word emoji case (`b😀e😀a😀t😀s m😀e`) went `none`; single-word letter-spacing cases (rescued by the separate `collapseLetterSpacedRuns` step, untouched by this edit) correctly stayed `crisis` — isolates the derived-squeeze mechanism precisely, not a blanket break |
| **ISS-t-005c-c0-2:** Hinglish "mar jaunga/jaungi" family | Own copy, own 3-phrase set | 3/3 pass | Single-hunk: deleted the `/\bmar\s+(ja+[ou]+n?g[ai]\|...)\b/i` line from `CRISIS_PATTERNS` | 0/3 — all three go `none` |
| **ISS-t-005c-c0-3a:** NFKC folds fullwidth/compatibility forms | Added MY OWN confusable beyond the manifest's set: mathematical bold "𝐤𝐢𝐥𝐥 myself" (also NFKC-foldable, per Unicode's own compatibility-decomposition design for that block) — new coverage confirmed, not in the maker's test suite at all | 4/4 pass (fullwidth, 2 Cyrillic, math-bold) | Single-hunk: `.normalize("NFKC")` → `.normalize("NFC")` | 2/4 — fullwidth AND math-bold go `none`; Cyrillic stays `crisis` (separate `HOMOGLYPHS` map, correctly unaffected) — isolates NFKC as exactly the fullwidth/compatibility-form mechanism |
| **ISS-t-005c-c0-4:** realpath containment (symlink/junction escape) | Own scenario NOT covered by the maker's own `loader.test.ts`: a FILE symlink at the `SKILL.md` path itself inside an otherwise-ordinary folder (their fixtures only symlink the folder) | loadSkill + listSkills both throw `resolves (via a link) outside the skills directory` | Single-hunk: neutered `assertRealPathContained`'s body to a no-op | Both leak: `loadSkill` returns `"SECRET FILE BODY"`, `listSkills` lists the escaping entry — isolates `realpathSync` as the mechanism, on a vector the ported test suite doesn't even exercise |
| **ISS-t-005c-c0-1 (known_gap split, not a falsification target):** known_gap rows are reported separately and excluded from the B16 bar, not relabelled | Read `crisis-eval.test.ts` directly: `knownGap`/`counted` are two disjoint filters on `line.known_gap !== undefined`; the counted-only `mismatches`/`recall` assertions cannot see known_gap rows at all, and the known_gap block only ever *reports*, never asserts | — | — | Confirmed by code inspection: the split is real and matches the manifest's description; see the honesty judgement below |
| ISS-040 (A–D falsifications), ISS-022, ISS-024 | Not independently re-falsified by me this cycle — unchanged from cycle 0 | — | — | Already independently falsified by the cycle-0 checker (see 274b440's verdict); re-confirmed still green via my own full 273/273 `packages/engine` run above, and `git diff fa08a8c..HEAD` shows neither `crisis.ts`'s pre-cycle-1 sections nor `loader.ts`'s ISS-022/024 code paths were touched by cycle 1 |

**CAPABILITY-COVERAGE: 11/13 manifest rows independently confirmed** (5 fresh falsifications by me
this cycle: rev-1, c0-2, c0-3-fullwidth/math-bold, c0-4, plus the c0-1 code-inspection check; 4
carried from the cycle-0 checker's own independent falsifications — A, B, C, D — re-confirmed still
green); **2/13 (ISS-022, ISS-024) inherited, not independently re-falsified in either cycle for this
specific unit, held via passing self-isolating assertions** (same status cycle-0's checker recorded).

## My own hostile inputs, beyond the manifest's tests and beyond the capability-coverage table

- **Mixed/uncommon separators** (underscore, hyphen, slash, tab, NBSP U+00A0, ideographic space
  U+3000, emoji between letters, emoji between words) — all correctly flagged `crisis` on the real
  guard (table above).
- **Mathematical-alphanumeric bold confusable** (`𝐤𝐢𝐥𝐥 myself`) — correctly flagged `crisis` via
  NFKC, a class the manifest never tested.
- **Adversarial runtime, measured independently** (own script, not the in-suite test): zalgo,
  zero-width-heavy, single-letter-spaced, and mixed zalgo+ZW+space inputs at 100k→200k chars:
  `zalgo ratio=2.00`, `zero-width ratio=1.14`, `spaced-letters ratio=1.73`, `mixed ratio=1.98` — all
  comfortably linear (a quadratic implementation would show ~4x on a doubling). No super-linear
  growth found on any input I constructed.
- **Suppression-path grep**, full-file read of `crisis.ts`: the only `"none"` returns are (1)
  empty/whitespace input, (2) normalised-empty (unreachable for real crisis text), (3) the natural
  fallthrough when nothing matched. `isStrongBoundary`, `FORMAT_RUN_BETWEEN_WORDS`, `SELF_COMPOUND`,
  `squeezedAcrossWholeFragments` appear only in comments describing what was removed — **confirmed
  absent from the executable code**, matching D-020.
- **Realpath containment, my own file-symlink scenario** (table above) — held, and found stronger
  than the ported test coverage.

## Diff scope

`git diff d0a7f2d...HEAD --stat` (both cycles combined) touches exactly 11 files: `crisis.ts`,
`loader.ts`, the 3 changed test files, 2 new malformed-skill fixtures, `crisis-eval.jsonl`,
`qa/issues.jsonl`, the manifest, and the (now-superseded) verdict — nothing outside the manifest's
declared "What changed". `git diff fa08a8c..HEAD` (cycle 1 only) touches exactly the 7 files the
cycle-1 section names. Reviewed every removed line in both diffs: `crisis.ts`'s removals are the old
7-substring squeeze machinery and its comments plus `.normalize("NFC")` (replaced by NFKC) — no
capability deletion; `loader.ts`'s only removal is the narrowed `if (!entry.isDirectory()) continue`
guard, replaced by one that also inspects symlinked entries (tested, no regression: "listSkills finds
all 10 real skills" still passes); the three test files' removals are an import-line widening and a
type-union/log-line replacement — no test assertion was deleted. `grep -rn` for the removed
identifiers (`isStrongBoundary`, `FORMAT_RUN_BETWEEN_WORDS`, `SELF_COMPOUND`,
`SQUEEZED_CRISIS_SUBSTRINGS`) across `packages/`, `apps/`, `mcp/` outside `crisis.ts` found only
stale comment references in `guard-crisis.test.ts`, no live code dependency broken.

## Ledger updates

Flipped to `fixed` (independently verified in my own throwaway copies, table above), each carrying
a `regression_check` and a `cycle1_note` describing my own reproduction:
- `ISS-t-005c-rev-1` (critical) → fixed
- `ISS-t-005c-c0-2` (high) → fixed
- `ISS-t-005c-c0-3` (medium) → fixed
- `ISS-t-005c-c0-4` (medium) → fixed

Left `open` by design (T-012, not this unit's scope): `ISS-t-005c-c0-1`.

New findings filed (neither blocks this unit's PASS):
- `ISS-t-005c-c1-1` (low, process) — the manifest (dated 2026-09-26) carries no `Persona walk:` line
  required by checker SKILL.md step 5bb for manifests on/after that date. Not blocking: this unit is
  not UI-touching, so no walk was owed regardless — a documentation-completeness gap, not a coverage
  gap.
- `ISS-t-005c-c1-2` (medium, contract-B16) — see the honesty judgement below.

## Judgement: is the ISS-t-005c-c0-1 (T-012) deferral honest and correctly excluded from B16?

**Yes, with one caveat filed as ISS-t-005c-c1-2.** Reasoning:

- B16's own text names the required golden-set categories: "indirect Hinglish, Devanagari, abuse,
  benign idioms." Indirect **English** ideation is not named. All four named categories are covered
  at 1.0 recall (independently re-measured). The excluded class is a documented, genuinely distinct
  failure mode (no keyword shape can honestly separate "everyone would be better off without me"
  from ordinary speech) that the contract text itself anticipates needing a different mechanism
  (B16's own "async Flash-Lite concern classifier" / T-012).
- The exclusion is not hidden: `crisis-eval.test.ts` prints the known_gap section on **every** run,
  the manifest documents it in its own section, and `ISS-t-005c-c0-1` stays `open` (not closed, not
  relabelled) at severity `high`, explicitly recommending it be prioritized before the B16
  real-student-pilot gate.
- Checked whether the exclusion is a Goodhart move: counting the 5 known_gap rows toward the bar
  drops recall to 71/76 = 0.9342, **below** 0.95 — so the exclusion is load-bearing for the reported
  PASS number. That is exactly why I filed `ISS-t-005c-c1-2` (medium): nothing in the printed recall
  line or this verdict itself carries the caveat inline, so a reader who forwards only "recall >=
  0.95 (B16): PASS" without the adjacent known_gap line could reasonably believe indirect-ideation
  risk is covered when it is 0/5. This is a **gate-process** recommendation (read both lines together
  before authorising a pilot), not a code defect, and `ISS-t-005c-c0-1` already carries the technical
  recommendation — so it does not block this unit's PASS.

## Live browser / persona / scenario matrix

Not UI-touching — confirmed independently via `git diff --stat` (both cycles): no `.tsx/.jsx`, no
`apps/web/**`, no `routes/pages/components` paths in either diff. Mode D not applicable.
`SCENARIOS: n/a` (not UI-touching; `qa/scenarios/counselling-engine.csv` is not yet required for a
non-UI unit per B19's own text). Persona walk not owed (not UI-touching); its absence from the
manifest is filed as `ISS-t-005c-c1-1` (low, non-blocking).

## Scoreboard against contract scope (B9, B16)

- **B9** (escalation before any generative call): met — `routeBeforeGeneration`/`crisisGuard` tests
  in the full `packages/engine` run include the B9 hard-rule tests ("B9: a crisis transcript never
  calls the provider and returns an escalation", plus the hostile-variant test), all passing, and no
  suppression path exists (confirmed by grep + full read).
- **B16** (keyword-guard recall portion — the classifier/notification portions are out of this unit's
  declared scope, consistent with cycle 0's own scoping): met — 71/71 (1.0000) on the golden-set
  categories B16 names, independently re-measured; the known_gap deferral is honest per the judgement
  above.

```
VERDICT: PASS
SCOREBOARD: 2/2 criteria met (B9, B16 keyword-guard-recall scope), 0/0 invariants (none distinct from the B-numbered criteria)
FAILURES (if any):
- none at >80% confidence against the in-scope criteria (B9, B16)
CAPABILITY-COVERAGE: 11/13 rows independently confirmed (5 fresh falsifications this cycle: rev-1, c0-2, c0-3-fullwidth/math-bold, c0-4, plus c0-1 code-inspection; 4 carried from cycle 0's own falsifications, re-confirmed green); 2/13 (ISS-022, ISS-024) inherited/not independently re-falsified in either cycle, held via passing self-isolating assertions
LIVE-BROWSER: not-applicable (packages/engine + qa/ only; no UI paths changed in either cycle's diff)
ISSUES-WRITTEN: ISS-t-005c-rev-1 (fixed), ISS-t-005c-c0-2 (fixed), ISS-t-005c-c0-3 (fixed), ISS-t-005c-c0-4 (fixed), ISS-t-005c-c0-1 (stays open, T-012), ISS-t-005c-c1-1 (low, new), ISS-t-005c-c1-2 (medium, new)
EXECUTOR: claude-sonnet-subagent (manifest's Executor: claude-sonnet-subagent — never delegated, per contract B9/B16 hard-rule scope) (checker: claude-sonnet-subagent)
EXPLANATION: Independently reproduced every verify command (131/131 on the 3 changed test files, 273/273 on the full engine package, typecheck exit 0, recall 71/71 matching exactly) and re-falsified the 4 substantive cycle-1 fixes myself in fresh throwaway copies outside the bound root, extending each with my own hostile inputs beyond the manifest's own set (uncommon separators, a mathematical-alphanumeric confusable, an unported file-symlink escape vector) — all held, and all isolated the exact named mechanism, not a blanket break. Diff scope for both cycles is clean against "What changed", with no unlisted deletions. Confirmed no suppression path exists and runtime stays linear on my own adversarial inputs up to 200k chars. The ISS-t-005c-c0-1 (T-012) deferral is honest and correctly excluded from B16 per the contract's own named categories, though I filed a medium-severity process finding (ISS-t-005c-c1-2) recommending the known_gap caveat travel alongside the recall number before any real-student-pilot decision is made off it.
```
