# Verdict: t-033-crisis-recall

**Cycle checked:** 0
**Date:** 2026-09-27
**Checker:** fresh Claude subagent (Sonnet), self != executor (manifest Executor: maker build subagent). No `ANTHROPIC_BASE_URL` override.
**Bound root:** `D:/vc/.worktrees/t-033-crisis-recall` (branch `wave/t-033-crisis-recall`, HEAD `25c56ef`)
**Contract:** `qa/contracts/counselling-engine.md` (B9, B16, D-020 recall-only)
**Manifest:** `qa/manifests/t-033-crisis-recall.md`

## What I re-ran myself

1. `pnpm -C D:/vc/.worktrees/t-033-crisis-recall --filter @vc/engine test` (through the test lock)
   → **454/454 pass, 0 fail** — matches the manifest's pasted output exactly.
2. `pnpm -C D:/vc/.worktrees/t-033-crisis-recall --filter @vc/engine typecheck` (through the test lock)
   → clean exit, no errors — matches.
3. `python contracts/verify_contracts.py` → `PASS by vacuity` — matches.
4. `npx tsx --test tests/crisis-eval.test.ts` run directly (bound worktree) to capture the B16 block myself
   rather than trust the pasted copy → **byte-for-byte the same block**: counted 116/116 (1.0000), known_gap
   0/0 (none outstanding), all-rows 116/116 (1.0000), false positives 14/54 (0.2593), same 14 accepted-residual
   lines, same confusion matrix `{"crisis":{"crisis":116},"concern":{"concern":8},"none":{"none":40}}`.
5. Eval-set composition check (own script): 164 rows total, 0 `known_gap`, category/lang counts match the
   manifest's claims (warning_sign 39, en/hi-Latn/hi-Deva = 90/46/28).
6. Diff scope: `git diff c4e2212...HEAD --stat` / `--name-only` → exactly the 4 files the manifest's "What
   changed" lists (crisis.ts, guard-crisis.test.ts, crisis-eval.test.ts, crisis-eval.jsonl) plus the manifest
   itself. No unclaimed file touched. `git diff ... -- crisis.ts | grep '^-'` shows only in-place refactor
   lines inside `squeezePatternSource` and a doc-comment line — no existing export, function or test deleted.

## Capability-coverage — independently reproduced (own throwaway worktree, outside the bound root)

`git worktree add <scratch> 25c56ef --detach` + `pnpm install --offline`, one mutation at a time, reverted
with `git checkout --` between each, worktree removed and pruned afterward.

| # | Row | GREEN before | RED after (mine) | Matches manifest? |
|---|---|---|---|---|
| 1 | Delete the T-033 warning-sign block from `CRISIS_PATTERNS` | 286/286 pass | **132 pass / 78 fail** | yes, exact count |
| 2 | Replace the `{n,m}` throw with `out += ch; continue;` | 286/286 pass | **285 pass / 1 fail** (the named squeeze test) | yes, exact |
| 5 | Drop `.replace(LONG_MARK_RUN, capMarkRun)` (mark-run cap) | 286/286 pass | **285 pass / 1 fail**, the named linear-time test now **19079 ms** (was ~50 ms) | yes — quadratic blowup reproduced, same isolated test id |

Rows 3, 4, 6, 7, 8 not independently re-falsified this cycle (time-boxed to 3 per the checker's own-rows
minimum); their manifest evidence is internally consistent with the code read (squeezePatternSource's lazy-`?`
handling, stripForeignMarks, the known_gap test, the hard-negative /dying/ example, and the static star-height
regex check at guard-crisis.test.ts:702-707 all inspected directly and are sound).

## My own hostile variants (not copied from the maker's tests)

Ran a standalone probe (fresh sentences, negative controls, zalgo, squeeze edge cases, a 60k-char timing
probe) directly against the bound worktree's `crisis.ts`. 20/23 as expected. Two of the three "misses" were
my own test-expectation errors (a charity-donation "giving away my old clothes" correctly returns `none`; a
literal "book is a heavy burden" Devanagari sentence correctly returns `crisis` per the accepted-false-positive,
recall-only design — D-020). One is a genuine, reportable gap:

- `"Everyone in my family would be SO much happier without me around."` → `none`, expected `crisis`. The two
  nearest patterns require the copula and adjective adjacent (`be happier without me` / `happier off without
  me`); an intensifier in between breaks both. Filed as **ISS-t-033-c0-1** (low, non-blocking) — same class as
  the already-open, non-blocking `ISS-t-005-skills-guards-2` (a keyword-list guard cannot have unbounded
  paraphrase recall; the manifest's own Open gaps #2 already discloses the golden set is same-author).

## Findings written to the ledger

- `ISS-t-033-c0-1` (low): natural-paraphrase miss in the "better off without me" family — non-blocking,
  documented residual-coverage class.
- `ISS-t-033-c0-2` (low): manifest dated 2026-09-27 has no `Persona walk:` line (checker SKILL.md step 5bb).
  Non-blocking: diff scope touches only engine/src, its tests and the eval jsonl — not a UI-touching unit
  (same precedent as `ISS-t-005c-c1-1`), so no walk was owed regardless.

Neither finding is a criterion failure; both are recorded as debt, per the "prove the outcome" brief's own
carve-out for residual, disclosed, non-regression gaps.

## Issues addressed (manifest's claim, checked against the ledger)

- `ISS-t-005c-c0-1` (high): the T-033 warning-sign block exists, is independently confirmed to isolate 78
  tests when deleted (row 1 above). **Fixed**, verifiably.
- `ISS-t-005c-rev-2` (medium): the `{n,m}` throw is independently confirmed (row 2). **Fixed**, verifiably.
- `ISS-t-005c-c1-2` (medium): the single B16 block with counted/known_gap/all-rows/false-positive lines
  together is present and reproduced verbatim in my own re-run of the test file. **Fixed**.

I flip no unrelated ledger rows; these three had no prior `status` entries specific to this unit to update
beyond what the manifest already names, and this verdict is their close-out evidence.

## Live browser

Not applicable. Changed paths are `packages/engine/src/**`, `packages/engine/tests/**`, `qa/evals/**` — no
`apps/web`, routes, pages or components touched.

## Scenario matrix / B19

Not applicable to this unit's diff scope (not UI-touching; B19 requires every row on UI-touching units and
releases).

## Verdict block

```
VERDICT: PASS
SCOREBOARD: 3/3 criteria met (ISS-t-005c-c0-1, ISS-t-005c-rev-2, ISS-t-005c-c1-2), 454/454 invariants (tests) hold
FAILURES: none
CAPABILITY-COVERAGE: 3/8 rows independently reproduced by checker (1, 2, 5 — GREEN-before/RED-after confirmed, exact match to manifest); remaining 5 rows verified by code inspection only, not independently falsified this cycle
LIVE-BROWSER: not-applicable (no apps/web / UI paths in diff)
ISSUES-WRITTEN: ISS-t-033-c0-1 (low, non-blocking), ISS-t-033-c0-2 (low, non-blocking)
EXECUTOR: maker build subagent (manifest) — checker: claude-sonnet-subagent (self != executor, no ANTHROPIC_BASE_URL override)
EXPLANATION: All re-run evidence (454/454 engine tests, clean typecheck, vacuous-pass contracts validator, the
B16 block reproduced byte-for-byte) matches the manifest exactly. Three of eight capability-coverage rows were
independently falsified in a throwaway worktree (delete pattern block, drop {n,m} throw, drop the mark-run
cap) and all three reproduced the manifest's claimed RED, including the quadratic timing blowup on row 5. My
own hostile-variant probe surfaced one genuine but non-blocking paraphrase-recall gap and confirmed the
guard's intentional accepted-false-positive behavior on two others I had mis-predicted. Diff scope is clean:
exactly the files the manifest names, no deleted exports/tests. PASS.
```
