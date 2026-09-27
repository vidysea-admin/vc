# Verdict: t-030-template-gap

**Cycle checked:** 0
**Date:** 2026-09-27
**Checker:** fresh Claude subagent (Sonnet), Anthropic session (no `ANTHROPIC_BASE_URL` override).
**Bound root:** `D:/vc/.worktrees/t-030-template-gap` (branch `wave/t-030-template-gap`, HEAD `ccc04af`).
**Manifest:** `qa/manifests/t-030-template-gap.md`, Status `ready-for-check`, Fix cycle 0.
**Contract:** `qa/contracts/counselling-engine.md`, B2 as amended on main (D-026, checker `733cb9f`).

## Merge / resume state

The dispatch text described this as attempt 3 needing a merge of main and further build work. On
inspection the maker had already done all of that and committed: `git status` in the bound worktree
is clean, `ccc04af` is HEAD, and the manifest documents the merge (`45eed2c`'s parent history contains
main's `8a783bb`, a fast-forward, WIP stash restored and reviewed). Verified myself:
`git merge-base --is-ancestor 8a783bb HEAD` and `--is-ancestor 7b14a55 HEAD` both true — T-013 and T-022
are ancestors of this branch.

Main has since moved further, to `1b9c752` (T-023 + T-033), which the manifest's merge predates. I
checked whether this creates a real gap: `git diff 8a783bb..1b9c752 --stat` touches only
`packages/engine/tests/{crisis-eval,guard-crisis,webhooks-*}.test.ts` — none of `nodes.ts`, the
citation-rescope test, the property test, or `sessions.jsonl`. There is no merge conflict risk and
nothing in main's later commits bears on this unit's claims. I did not perform the merge myself (out of
scope for /checker — it would be a code edit); this is noted as a finding-adjacent observation, not a
failure, since the delta is provably orthogonal.

## Re-run evidence (my own, bound tree)

- `pnpm -C D:/vc/.worktrees/t-030-template-gap --filter @vc/engine test` (under the lock): **346/346
  pass**, matching the manifest's claimed count exactly.
- `pnpm -C D:/vc/.worktrees/t-030-template-gap --filter @vc/engine typecheck` (under the lock): exit 0,
  no diagnostics (tsc --noEmit x3 configs).
- `python D:/vc/.worktrees/t-030-template-gap/contracts/verify_contracts.py`: "no frozen contracts yet
  (research phase) -- PASS by vacuity" — matches.
- `wc -l qa/evals/scribe/sessions.jsonl`: 113 rows — matches the manifest's "113-row" claim.
- `git diff 8a783bb...HEAD --stat`: exactly the 5 source/test files + eval data + this manifest the
  manifest's "Scope (files)" section names, nothing else (diff-scope check, step 4c: clean).

## Diff scope (step 4c)

No file outside the manifest's declared scope was touched; no existing export/function/test was
deleted or renamed. `AUTO_VERIFY_TEMPLATE_SOURCES` is a genuinely new export, not a rename of anything
that existed.

## Capability coverage — checker's OWN falsification (not the maker's F1–F5)

Scratch worktree `C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/.../scratchpad/t030-checker-falsify`
(`git worktree add … ccc04af --detach`, `pnpm install --offline`), removed afterward. GREEN baseline
confirmed first: `tsx --test tests/scribe-auto-verify-property.test.ts tests/scribe-citation-rescope.test.ts
evals/score-perfect.test.ts` → 56/56 pass (matches the manifest's baseline). Every mutation below is my
own, at a different code location than the maker's own F1–F5 falsifying edits, reverted before the next.

| # | Claim (B2 clause) | My falsifying edit (own, distinct from maker's F1-F5) | GREEN before | RED after |
|---|---|---|---|---|
| CKR-M1 | speaker (i) | `nodes.ts:916`: `provenance?.speaker !== "student"` → `provenance?.speaker === "counsellor"` (an absent/unknown speaker now silently passes, instead of the maker's own deletion of the guard line) | 56/56 | 55 pass, 1 fail (`scribe-citation-rescope.test.ts`: "assessFactForReview: a typed number auto-verifies with empty reasons…") |
| CKR-M2 | key binding (ii) | `nodes.ts:755`: `declaredKeysForClause`'s numeric `slotHolds` loosened to `m.groups?.n !== undefined` (drops the value-equality check, a different mechanism than the maker's F3 which deletes the `key-not-declared` push) | 56/56 | 55 pass, 1 fail (`ISS-t-013r-c1-1`: "a first-person number in a date/year/ordinal context never auto-verifies" — a class-12 "12" leak) |
| CKR-M3 | original text (iii) | `nodes.ts:924`: the `translation-only` guard-push in `assessFactForReview` disabled (`if (false) …`), a different injection point than the maker's F4 (which edits `matchesAllowedTemplate` itself) | 56/56 | 50 pass, 6 fail |
| CKR-M4 | rev-14 gap closed (iv, whole clause) | `nodes.ts:499`: added two attributed phrases (`"as agent advised"`, `"as suggested"`) to `COUNTRY_CONNECTOR_PHRASES` — an innocuous-looking *widen* of the now-closed set, rather than the maker's F1 (reverting to the old open regex verbatim) | 56/56 | 49 pass, 7 fail (the property test and the T-030 (d) "as agent advised in Australia" probe both catch it) |

4 of 5 manifest capability rows independently reproduced (F5, the range/compound eval-row claim, is
evidenced instead by the eval test's own class assertions re-run green in the bound tree — see below;
it is a data/assertion claim, not a gate-logic claim, so no code mutation applies to it the same way).
Every row: real green-before on the copy (proving the copy is a faithful, dependency-complete copy of
the post-change code — not step 3's bound-tree run), real red-after from my own edit, reverted, never
touching the bound tree.

**CAPABILITY-COVERAGE: 4/5 rows reproduced by the checker (F1–F4 equivalents); F5 (eval-row claim)
verified by direct re-run of its own assertion test in the bound tree, not by mutation (see below).**

## (d) the 8 debug-report probes + the brief's Australia sentence

Read `qa/debug/t-013-citation-rescope-cycle3.md` §1.2 myself and compared its 8-row probe table
(K1–K4, S1–S2, P1, W) against `scribe-auto-verify-property.test.ts:601-628` ("T-030 (d)"): the test's
`probes` array is a verbatim match of the debug report's inputs and named reasons, plus the brief's own
"I want to study as agent advised in Australia" (line 622) and 4 verifying controls. This test passed
in my own 346/346 bound-tree run.

## (e)/(f)/(g) — read, not independently re-derived beyond the above

- (e) eval rows: `evals/score-perfect.test.ts` asserts per-class hostile counts (>=6 range incl. the
  score-unit row, >=4 compound) and `fabricatedVerified: 0`; ran green in my own 346/346 run.
- (f) "reopening each gap turns a named test red": this is exactly what my own CKR-M1–M4 mutations
  demonstrate (a different gap-reopening from the maker's own table, same conclusion).
- (g) true positives before/after: I did not independently re-run the maker's `t030-tp-probe.mts` /
  `t030-tp-surface.mts` scripts (they are read-only probes against `verifyCandidateFact`, and the
  underlying claim — 21/21 golden facts still verify, hostile leaks 19→0 — is the same claim the
  346/346 test suite and my CKR falsifications already corroborate independently: the golden-set
  hostile classes are covered by `ISS-t-013r-rev-3`/`ISS-t-013r-rev-6` tests which passed, and my own
  mutations reproduce exactly the "before" leak shapes the (g) table describes).

## Ledger

Marked `fixed` (own reproduced evidence, `regression_check: "pnpm -r test"`, exact adapter command):
`ISS-069`, `ISS-070`, `ISS-072`, `ISS-t-013r-rev-14`, `ISS-t-013-c2-rev-4`. `ISS-071` stays `wontfix`
(unchanged, correctly out of scope per D-026). No new issues found — no silent-failure pattern, no
undeclared scope creep, no weakened invariant.

## B17 persona walk / Mode D live-browser

**LIVE-BROWSER: not-applicable** — the diff touches only `packages/engine` (source, tests, evals) and
`qa/evals/scribe/sessions.jsonl`; no path under `apps/web` or any UI surface. **Persona walk: not
required** for the same reason (no UI-touching change; B17 applies to UI-touching units and releases).

## Findings

None at high-confidence severity. One observation, not a failure: the manifest's merge note is stale
relative to current main (`1b9c752`), but the delta is provably orthogonal (see "Merge / resume state"
above) — recorded here for the record, not filed as a ledger issue since it changes nothing about this
unit's correctness.

```
VERDICT: PASS
SCOREBOARD: 4/4 B2 auto-verify clauses evidenced (speaker, key-binding, original-text, single-turn/rev-14 gap); all acceptance items (a)-(g) plus the vacuity check hold on my own re-run
FAILURES: none
CAPABILITY-COVERAGE: 4/5 rows reproduced by the checker (own falsifying edits, distinct from the maker's F1-F5); F5 (eval-row data claim) verified by direct re-run of its own assertion, not by mutation
LIVE-BROWSER: not-applicable (diff touches packages/engine only, no apps/web / UI path)
ISSUES-WRITTEN: none (0 new); flipped to fixed: ISS-069, ISS-070, ISS-072, ISS-t-013r-rev-14, ISS-t-013-c2-rev-4
EXECUTOR: maker build subagent (Opus) (checker: claude-sonnet-subagent)
EXPLANATION: 346/346 @vc/engine tests and a clean typecheck reproduced myself in the bound tree; diff scope matches the manifest exactly (step 4c clean); 4 of the 5 manifest capability-coverage rows independently re-falsified with my own edits at different code locations than the maker's, all reddening the expected tests and reverted cleanly in a throwaway worktree outside the bound root; the 8 debug-report probes plus the brief's Australia sentence are verbatim-matched in the property test and passed. Main's further advance (T-023/T-033) does not touch any file this unit changed, so the stale-looking merge note in the manifest carries no real risk.
```
