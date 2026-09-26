# Verdict — t-028-personas-scenarios

**Date:** 2026-09-26
**Cycle checked: 1**
**Checker:** claude-sonnet-subagent (fresh context, no builder reasoning)
**Bound root:** D:/vc/.worktrees/t-028-personas-scenarios
**Cycle-1 diff base:** a1534e1 · **Head:** 81304ce (verified: `git log -1` in the worktree)
**Prior verdict:** `qa/verdicts/t-028-personas-scenarios.md`, cycle 0, commit `9ff8aed`, FAIL on `ISS-t-028-c0-1`

## Diff scope (step 4c)

`git diff a1534e1...HEAD --stat` → exactly 2 files: `qa/scenarios/counselling-engine.csv` (+15/-9) and
`qa/manifests/t-028-personas-scenarios.md` (+75/-0... net +81/-9 total across both). No other file touched;
`qa/adapter.json` confirmed untouched (matches the manifest's own "not touched in cycle 1" claim — I did not
take that on trust, the diff stat proves it). Nothing deleted or renamed. Matches D-022's authorization
(only `qa/adapter.json` and `qa/scenarios/counselling-engine.csv` are in scope, and only the CSV was
touched this cycle). No diff-scope violation.

## Structural re-checks (re-derived independently, same discipline as cycle 0)

- `python -c "json.load(open('qa/adapter.json'))"` → no exception. Unchanged, still valid.
- CSV structural check (my own script, not the maker's pasted one): row count **58** (57→58, +SC-058),
  no duplicate ids, types = {happy, negative}, full persona↔adapter membership both ways. Matches.
- `grep -c "@"` on both files under test → `qa/scenarios/counselling-engine.csv:0`, `qa/adapter.json:0`.
  No new email-shaped data.
- `data_boundary.py` re-run against the worktree → 7 VIOLATION lines, not 6. The 7th is
  `qa/verdicts/t-028-personas-scenarios.md` — **my own cycle-0 verdict file**, which quotes
  `umeshsugara@vidysea.com` and `pass@eu.cloud.langfuse.com` verbatim while explaining `ISS-060`'s
  documented false-positive pattern. This is the same accepted pattern as `ISS-060` (staff address +
  langfuse credential-URL fragment matched by the email regex), on a file the cycle-1 diff does not
  touch and that I created in the prior cycle, not a violation introduced by this fix. Not counted
  against this unit. (Worth a follow-up: `ISS-060` should list this file too — not filed here since
  it changes nothing about this unit's verdict and would just be re-documenting the same accepted
  pattern.)

## Re-verified: not-yet-built markers vs TASKS.md (independent re-derivation)

Wrote my own parser (not the maker's `verify_c1.py`, though the logic checked out identical) against
`TASKS.md` and the CSV. Every `not-yet-built:<T-id>` row and its task's live status:

```
SC-022 -> T-012 (open)   SC-023 -> T-012 (open)   SC-024 -> T-022 (open)
SC-025 -> T-010 (open)   SC-026 -> T-012 (open)   SC-028 -> T-029 (open)
SC-029 -> T-029 (open)   SC-030 -> T-029 (open)   SC-031 -> T-029 (open)
SC-033 -> T-029 (open)   SC-053 -> T-010 (open)   SC-054 -> T-025 (open)
SC-055 -> T-025 (open)   SC-056 -> T-027 (open)   SC-057 -> T-027 (open)
```
All 15 cite genuinely `open` tasks. **T-029 itself re-read from `TASKS.md`:1 "B15 erasure approver
workflow ... T-028 scenario rows SC-028..034 exercise it" — status `open`.** Zero bad entries.

A keyword scan (webhook→T-027, live-card→T-010, concern-classifier/flag→T-012/T-022, JWT/OpenAPI/tenant→T-025)
across every row's steps+expected text found no row referencing an unbuilt surface without a matching,
correct `not-yet-built:<T-id>` marker. **No other row over-claims.**

## SC-032 / SC-034 / SC-058 checked against the shipped `packages/db/src/erasure.ts` (read in full, 1249 lines)

- **SC-032** ("a confirmed erasure request (`confirmErasure`) is executed" → "`executeErasure` runs and
  one collection's `deleteMany` fails" → "the step is recorded failed/deferred on the receipt and the
  request is marked failed (`ErasureIncompleteError`)..."): confirmed against code — `executeErasure`'s
  purge loop catches a `deleteMany` failure into `failed.set(step.collection, errorLabel(err))` (line
  ~1073), the collection line's `outcome` becomes `"failed"` (line ~1090), and when not `verified` the
  function throws `new ErasureIncompleteError(receipt)` (line ~1138). Matches exactly, including that the
  read-back reflects what remains (the receipt's `collections[].remaining`).
- **SC-034** ("a confirmed erasure request's fence is active (`setErasureFence`/`isStudentFenced`)" → "a
  write... lands inside the fence window and `executeErasure`'s read-back runs after it" → "...treated as
  a B15 violation, never an accepted residual"): both named functions exist and behave as described
  (`setErasureFence` line ~479, `isStudentFenced` line ~427); the invariant matches the contract's own B15
  text and the module's read-back logic (a non-zero `totalRemaining` never resolves to `verified`).
- **SC-058** (new; walks `requestErasure` → `confirmErasure` by a different actor, which calls
  `setErasureFence` and marks confirmed → a mid-session write refused/undone by `assertStudentNotFenced`/
  `compensateIfFenced` throwing `StudentFencedError` → `executeErasure` purges and reads back zero): every
  named function and error class exists with exactly the described behavior — `confirmErasure` calls
  `setErasureFence(db, row.studentId, input.requestId)` **before** its confirm CAS (line 757), requires a
  different actor (`ErasureSelfConfirmError` else, line 752), `assertStudentNotFenced`/`compensateIfFenced`
  both throw `StudentFencedError` when fenced (lines 441, 473), and `executeErasure`'s completion path
  writes a counts-only receipt. This row is genuinely runnable against today's code and gives B19's
  "erasure request mid-session" must-include case an honest, currently-executable row — closing the gap
  ISS-t-028-c0-1 identified.

## Capability coverage (step 4b) — cycle-1 addition

**Note on the manifest's own proposed falsifying edit:** the cycle-1 capability-coverage cell instructs
editing `TASKS.md`'s T-029 row from `open` to `done`. `TASKS.md` is **not** a file named in this unit's
"What changed" (`qa/scenarios/counselling-engine.csv`, `qa/manifests/t-028-personas-scenarios.md` only) —
it was authorized and touched by a different commit (`e9777d5`) on `main`. Per protocol this specific cell
is not admissible as an instruction to execute as-is (analogous to "an edit to a conftest/fixture/CI
file" — a file outside the unit's own scope). **I did not take it on trust.** I instead devised and ran
my own admissible reproduction: a single-hunk edit **inside `counselling-engine.csv` itself** (the file
this unit does own) — repointing `SC-028`'s marker from `not-yet-built:T-029` to `not-yet-built:T-011`
(`T-011` is `done` in `TASKS.md`) — which exercises the identical assertion the manifest's cell claims to
cover.

Run in a **fresh throwaway copy** outside the bound root
(`C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/<session>/scratchpad/falsify/t028c1/`, containing only
`adapter.json` + `counselling-engine.csv` + `TASKS.md`, copied from the worktree, plus my own
`verify_c1.py`, never edited in place):

- **Before** (clean copy): `not-yet-built rows citing a non-open (or unknown) task (should be empty): []` /
  `CHECKS PASSED`, exit 0 — green, proving the copy is real.
- **Falsifying edit** (single-hunk, inside `counselling-engine.csv`): `SC-028`'s `not-yet-built:T-029` →
  `not-yet-built:T-011`.
- **After**: `not-yet-built rows citing a non-open (or unknown) task (should be empty): [('SC-028', 'T-011', 'done')]` /
  `CHECKS FAILED`, exit 1 — red, and for the right reason (the exact row and task I retargeted, not a
  parse/import crash; every other assertion in the same script still ran).

I also separately reproduced the manifest's own literal TASKS.md-status-flip scenario out of curiosity
(same tool, same throwaway pattern) and it behaves identically (green→red on the same assertion) — so the
underlying capability is real either way; the point above is procedural (which edit is *admissible* to
cite as the check), not a doubt about the capability itself.

**CAPABILITY-COVERAGE: 1/1 reproduced** (via an admissible in-scope edit).

## ISS-t-028-c0-1 — flipped to `fixed`

On my own reproduced evidence above (diff scope, the 15 not-yet-built markers re-verified against live
`TASKS.md` status including `T-029` itself, SC-032/034/058 checked function-by-function against the
1249-line `erasure.ts`, and the coverage row re-falsified admissibly), the original finding is resolved:
SC-028/029/030/031/033 now correctly cite the real `T-029` task (created between cycles, confirmed `open`);
SC-032/034 are reworded to cite shipped functions/errors and no longer over-claim; SC-058 gives B19's
"erasure request mid-session" case a row that is honestly runnable today. Ledger updated:
`qa/issues.jsonl` `ISS-t-028-c0-1` → `status: fixed`, `fixed_date: 2026-09-26`,
`regression_check: scenario:counselling-engine#SC-058` (a `fixed → verified` move still requires a later
checker run confirming this regression check would fail with the fix reverted, per the ledger's own rule
— not done in this cycle).

---

VERDICT: PASS
SCOREBOARD: 7/7 criteria met, 2/2 invariants hold
FAILURES (if any): none
CAPABILITY-COVERAGE: 1/1 rows reproduced
LIVE-BROWSER: not-applicable (diff touches only qa/scenarios/counselling-engine.csv and qa/manifests/t-028-personas-scenarios.md — no apps/web or apps/api path)
ISSUES-WRITTEN: none (ISS-t-028-c0-1 flipped open→fixed, no new issue)
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)
EXPLANATION: All cycle-0 structural checks still hold (JSON validity, adapter untouched, CSV membership, data-boundary clean on the unit's own files, diff-scope clean). The cycle-1 fix is verified on my own evidence, not the maker's: SC-028/029/030/031/033 correctly cite the newly created, genuinely open T-029; SC-032/034/058 were checked line-by-line against the full erasure.ts and every named function/error class exists and behaves exactly as each row describes; the coverage row was re-falsified with an admissible in-scope edit (the manifest's own proposed edit touched TASKS.md, outside this unit's "What changed", so I substituted an equivalent edit inside the CSV itself). ISS-t-028-c0-1 is fixed.
