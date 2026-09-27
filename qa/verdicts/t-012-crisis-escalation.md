# Verdict: t-012-crisis-escalation

**Cycle checked:** 0
**Checked:** 2026-09-27 (IST), fresh Claude subagent, `claude-sonnet-subagent`
**Bound root:** D:/vc/.worktrees/t-012-crisis-escalation (branch wave/t-012-crisis-escalation)
**HEAD verified:** 3641739560811efdc95843fe05738c71be12a58d (unchanged throughout the check)
**Contract:** qa/contracts/counselling-engine.md (B16 primary; B4, B6, B8, B9, B12, B13, B14, B20)
**Manifest:** qa/manifests/t-012-crisis-escalation.md

## What I re-ran myself (bound root)

```
pnpm -C D:/vc/.worktrees/t-012-crisis-escalation --filter @vc/engine test        -> 594/594 pass
pnpm -C D:/vc/.worktrees/t-012-crisis-escalation --filter @vc/engine typecheck   -> exit 0
pnpm -C D:/vc/.worktrees/t-012-crisis-escalation --filter @vc/db test           -> 233/233 pass
pnpm -C D:/vc/.worktrees/t-012-crisis-escalation --filter @vc/api test          -> 36/36 pass
python contracts/verify_contracts.py                                            -> PASS by vacuity (no frozen contracts)
```
All through the shared test lock. Numbers match the manifest's pasted output exactly, and I re-derived
the B16 recall block myself directly (`npx tsx --test tests/crisis-eval.test.ts`):
```
B16 crisis recall (golden set): counted 117/117 (1.0000); TRUE-crisis (excl. accepted_residual) 102/102 (1.0000);
false positives on benign-intent rows: 15/73 (0.2055)
B16 HELD-OUT slice: keyword-guard crisis recall 10/28 (0.3571) — below the 0.95 pilot bar; benign rows flagged 0/9
```

## Diff scope (step 4c)

`git diff 3b8609a...HEAD --stat`: 14 files, all listed in the manifest's "What changed" / scope
section. No file outside that list was touched. No existing function, export, test or config key
was deleted or renamed — this unit is additive (two new guard modules, wiring hooks in
`scribe/graph.ts`/`nodes.ts`, one new skill, golden-set/held-out rows, `.env.example` names only).
Clean.

## Capability coverage — reproduced independently (own hostile edits, own throwaway worktree)

Worktree: `git worktree add <scratch> 3641739 --detach` + `pnpm install --offline`, outside the
bound root, removed after (`git worktree remove --force` + prune; large node_modules paths needed
a manual `rm -rf` first on Windows, harmless).

I wrote three of my own falsifying edits (not copied from the manifest's table), each a single-hunk
edit to a file named in "What changed", confirmed GREEN in the copy before the edit and RED after,
then reverted (diff against the bound-root file confirmed byte-identical afterward):

| # | Claim attacked | My edit | Before | After |
|---|---|---|---|---|
| R1 | guard crisis is decided before reading the classifier's annotation ("downgrade, never hide") | `escalationDecision`: added an early `if (classifier likelyBenign) return {escalate:false}` before the guard-crisis check | `tests/concern-classifier.test.ts:169` GREEN (1 pass) | RED — `escalate:false` where `{escalate:true, reason:"guard_crisis", severity:"critical"}` was expected |
| R2 | `escalateTurns`/`readEscalations`/etc. refuse an unscoped Db | `requireTenantScope`: replaced the throw with `return tenantId ?? "unscoped"` (silently permissive) | `tests/crisis-escalation.test.ts` full file GREEN (16/16) | RED on `T-012 E9: tenancy — an unscoped Db is refused…` (15/16 pass, 1 fail: "Missing expected rejection (TenantScopeError)") |
| R3 | every guard flag (any speaker) is reviewed | `selectForReview`: narrowed `if (guardLevel !== "none")` to `if (guardLevel === "crisis")`, so a guard-CONCERN flag (any speaker) stopped being auto-selected | `tests/concern-classifier.test.ts` full file GREEN (13/13) | RED on `T-012 selection: every guard flag is reviewed…` (12/13 pass, 1 fail: expected `[true, "guard_flag"]`, got `[false, null]`) |

All three: real GREEN-in-copy before, real RED after, on the named test id, in a copy I built myself
— not the manifest's harness output. CAPABILITY-COVERAGE: 3/3 rows independently reproduced (of the
manifest's 14; a sample was falsified per the checker's own-worktree budget, not the whole table —
the same discipline the maker's table already demonstrates against 14 rows, cross-checked here).

## Criteria (B16 / D-020 / B9 / B4 / B20 / B12 / B6 / B14)

- **[C1] Recall-only guard stays the only gate, downgrade never hides (B9, D-020):** confirmed by
  code reading (`reviewedFlagView` takes guard fields verbatim; `escalationDecision`'s crisis branch
  never reads the annotation) and by R1 above. MET.
- **[C2] Async classifier, provider-agnostic, fails open, never blocks the live turn (B16):**
  `classifyConcern` races a timeout and never throws (code read + `T-012 classify: a hung provider…`
  passing in my re-run); `escalateTurns` awaits only the guard-crisis writes before returning,
  starts `runReview` in the background. MET.
- **[C3] Admin + every concerned counsellor notified at the same moment (B16):** `notifyAll` is one
  `bulkWrite` with one `notifiedAt` for every target; `T-012 E1`/`E5`/`E11` reproduce this in my
  re-run. MET.
- **[C4] Tenant-scoped writes only (T-025):** `requireTenantScope` on every entry point; R2 above
  falsifies it for real. MET.
- **[C5] SLA parked, no invented number:** grep of `escalation.ts`/`concern-classifier.ts` finds no
  SLA constant; only `flaggedAt`/`notifiedAt`/`acknowledgedAt` timestamps. MET.
- **[C6] Consent first (B4), not part of fence compensation:** `escalateSessionFlags` calls
  `checkConsent` before `escalateTurns`, and the module comment states (and `E13` tests) it is
  deliberately outside `invokeFenceAware`'s compensation. Read and reasonable; not independently
  falsified this cycle (budget went to R1–R3), but the manifest's own M11 row plus the code shape
  make this low-risk. Judged MET on the evidence available.
- **[C7] B20 concern-continuation unaffected:** scribe still completes to the approval interrupt on
  a concern-level turn (`E12` in my re-run) — escalation is additive, not a new stop condition. MET.
- **[C8] ISS-t-033-rev-1 (true-crisis recall line excluding accepted_residual):** re-read
  `tests/crisis-eval.test.ts:131-171` myself — the exclusion set, the strictly-smaller-denominator
  assertion and the >=0.95 bar on the TRUE line all exist and pass. Ledger row flipped to `fixed`
  below. MET.
- **[C9] ISS-t-033-rev-2 (independent held-out slice, labelled before pattern-reading):** re-read the
  held-out file and its two tests; git history shows `6f98e5a` (the held-out commit) precedes
  `f15995a` (the implementation), so provenance is at least as strong as git-order evidence can make
  it. The slice is real, disjoint, all three scripts represented, and the honest (and unflattering)
  10/28 recall is printed and asserted never to regress below `HELDOUT_BASELINE`. Ledger row flipped
  to `fixed` below. MET.
- **[C10] No student data / secrets (B8, B11, B13):** all new eval rows are synthetic first-person
  distress statements with no names/ids; `git diff .env.example` adds three names only, no values.
  MET.

## Held-out recall (10/28 = 0.357) — not a FAIL of this unit

This is a real, disclosed finding, but it does not fail T-012: `qa/gates/crisis-safety-layers.md`
explicitly gates "any real-student pilot" (and T-010) on the golden-set bar, not this unit's scope,
and `qa/gates/crisis-guard-precision.md` already assigned pattern-precision/recall tuning to a
separate track from T-012's classifier-and-escalation build. The manifest discloses it plainly as
"Open gaps #1, pilot blocker" rather than hiding or laundering it through the golden-set number
(which is exactly what ISS-t-033-rev-2 was opened to prevent). I'm recording it here as a named,
tracked gap (not a new issue — it restates what the manifest already discloses and the gate already
anticipates) so it isn't lost before the pilot-readiness conversation happens.

## B17 persona / Mode D

Changed paths are entirely `packages/engine/**`, `qa/evals/**`, `.env.example`, `skills/**` — no
`apps/web`, no route, no screen. LIVE-BROWSER: not-applicable (no UI surface touched).
Persona walk: not required (no user-facing flow in the diff).

## Ledger

Flipping to `fixed` (this unit's own tests, re-run and read by me, are the `regression_check`):

- `ISS-t-033-rev-1` -> `fixed`, `regression_check`: command `npx tsx --test tests/crisis-eval.test.ts`
  (verbatim from the `@vc/engine test` script this unit's manifest names in "How to verify"),
  asserting `trueRecall >= 0.95` with `trueCrisisTotal < crisisTotal`.
- `ISS-t-033-rev-2` -> `fixed`, `regression_check`: same command, asserting the held-out slice is
  disjoint from the golden set and its recall line never regresses below `HELDOUT_BASELINE`.

No other ledger rows claimed by this manifest.

```
VERDICT: PASS
SCOREBOARD: 10/10 criteria met, 0/0 invariants noted separately hold (see criteria list — all B9/B16/D-020 invariants folded into C1-C9)
FAILURES (if any):
- none
CAPABILITY-COVERAGE: 3/3 rows independently reproduced (own hostile edits, own throwaway worktree; not the manifest's pasted 14)
LIVE-BROWSER: not-applicable (no apps/web or UI path in the diff — packages/engine, qa/evals, .env.example, skills only)
ISSUES-WRITTEN: none (ISS-t-033-rev-1, ISS-t-033-rev-2 flipped open -> fixed, no new issues)
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)
EXPLANATION: All four verify commands reproduced clean in the bound root (594/594, 233/233, 36/36, typecheck 0, contracts PASS-by-vacuity), matching the manifest's pasted numbers exactly. Three independently-authored falsifying edits (never-hide-on-benign, tenant-scope refusal, every-guard-flag-reviewed) each went GREEN-before/RED-after in my own throwaway worktree, confirming the capability claims are real rather than pasted. Diff scope is clean (additive only, nothing outside the declared file list). The held-out slice's 10/28 recall is a genuine, disclosed pilot-readiness gap already covered by qa/gates/crisis-safety-layers.md and out of this unit's scope, not a defect in what T-012 was asked to build.
```
