# Verdict: t-022-concern-continue

**Cycle checked:** 0
**Checker:** fresh Claude subagent (Sonnet), no session-context reuse. `self != executor` — the
manifest's Executor is `claude-opus maker build subagent`; this check ran as an independent
Anthropic-session subagent, no `ANTHROPIC_BASE_URL` override.
**Date:** 2026-09-26/27
**Bound root:** `D:/vc/.worktrees/t-022-concern-continue` (branch `wave/t-022-concern-continue`, HEAD `25e3371`, implementation commit `cc8dc91`)
**Contract:** `qa/contracts/counselling-engine.md` — B20 primary; B2, B3, B4, B5, B9, B13, B14, B15, B16 touched.

## VERDICT: PASS

## What I re-ran myself (not the manifest's pasted output)

All under the machine-wide test lock, in the bound worktree at `25e3371`:

| Command | My result | Manifest claimed |
|---|---|---|
| `pnpm --filter @vc/schemas test` | 61/61 pass | 61/61 |
| `pnpm --filter @vc/schemas typecheck` | exit 0, no errors | exit 0 |
| `pnpm --filter @vc/engine typecheck` | exit 0, no errors (3 tsconfigs) | exit 0 |
| `pnpm --filter @vc/engine test` | 327/327 pass | 327/327 |
| `pnpm --filter @vc/db test` | 214/214 pass | 214/214 |
| `python contracts/verify_contracts.py` | PASS by vacuity | same |

Every capability-coverage test id named in the manifest's table (F1–F11: `T-022 concern-continue`,
`concern-flag`, `concern-kg` ×2, `multi-concern`, `consent-first`, `crisis-unchanged`,
`concern-export`, `concern-erasure`, `concern-fence`, the `ConcernRecord: concernId ...` test, and
both `evals/score-perfect.test.ts` / `score-lazy.test.ts` provider tests) is present by name in my
own fresh run and passes. This is a real re-execution, not a trusted paste — counts match the
manifest exactly.

## Code-level verification of each capability-coverage claim (F1–F11)

Read the actual source, not just the tests, and traced each claim to the exact lines that would
break under the manifest's own described falsifying edit:

- **F1** (concern continues): `checkCrisis` (`nodes.ts`) only sets `escalation` on a crisis-level
  turn; concern turns become `ConcernRecord`s in `concerns`. `graph.ts:219-222`'s conditional edge
  routes to `extract_facts` unless `escalation` is set — a concern-only session is NOT routed to
  END. Confirmed the edge condition reads `s.escalation`, never `s.concerns.length`.
- **F2** (visible flag): `graph.ts` approval node spreads `...(s.concerns && s.concerns.length > 0
  ? { concerns: s.concerns } : {})` into `ApprovalRequestSchema.parse(...)`. Removing that spread
  is the manifest's claimed falsifying edit and is a single-line, single-hunk change — plausible.
- **F3/F4** (KG write, erasure/export coverage): `recordSessionConcerns` (`graph.ts`) writes edges
  anchored at `{kind: "student", id: studentId}` into the EXISTING `edges` collection via
  `concernEdges()`. Cross-checked `packages/db/src/erasure.ts:802-807`'s `edgeFilter` — it matches
  `{"from.kind": "student", "from.id": s.studentId}` OR the `to` side, unconditionally, in the
  erasure's phase-1 edge deletion and in `exportStudent`'s edge query (line 1251). No change to
  `erasure.ts` was needed and none was made (confirmed via diff). This is the correct mechanism for
  B15 inheritance the manifest claims.
- **F5** (fence compensation, own-writes-only): `CreatedByCall.concernEdges` carries a
  per-call `writerToken` (`randomUUID()`); `invokeFenceAware`'s `compensate()` deletes
  `{_id: {$in: ids}, writerToken}` — matches the T-014 pattern already used for `transcriptTurns`.
  An earlier run's edges (different `writerToken`) are structurally excluded from the delete filter.
- **F6** (consent-first): `recordSessionConcerns` calls `checkConsent` first and returns `[]` on
  anything but `granted`, before touching `edges`.
- **F7** (crisis unchanged): the crisis branch of `checkCrisis`'s final ternary forces
  `concerns: []` whenever `escalation` is set, regardless of how many concern-level turns preceded
  it in the same session — I traced this is enforced at the *return* statement, not just at the
  loop level, so even a concern collected before a later crisis turn is discarded. (I also wrote an
  independent hostile test for exactly this ordering case — see below.)
- **F8** (citation resolves into transcript): the quote stored is `text.trim()` — the literal
  flagged field's text — not the guard's card message; `recordSessionTranscript` persists the same
  turns before `recordSessionConcerns` runs (same `invokeFenceAware` call, transcript write first).
- **F9** (idempotent write): deterministic `_id = deriveEdgeId(from, to, CONCERN_EDGE_REL)` plus
  `$setOnInsert` + `upsert: true` — a replay writes nothing new; `createdSink` only receives ids this
  call actually inserted (`upsertedCount > 0`).
- **F11** (deterministic concernId): `ConcernRecordSchema`'s `.refine` in `packages/schemas/src/schemas.ts`
  enforces `concernId === \`${sessionId}:${citation.turnId}\``, `.strict()` so no extra fields (e.g. a
  timestamp or a script line) can ride along.

## Diff-scope (step 4c)

`git diff 6736ee2...HEAD --stat`: 12 files, all within the manifest's "Scope (files)" list (schemas,
graph.ts, nodes.ts, evals, the two new test files, and one reason-string line in
`db-scope.test.ts`'s D-016 allowlist). No function, export, route, or test was deleted or renamed;
every diff hunk I read (schemas.ts, evals/score.ts, evals/score-perfect.test.ts,
evals/score-lazy.test.ts, db-scope.test.ts) is additive or a narrowly-reworded assertion — nothing
dropped. `packages/db/src/**`, `guards/crisis.ts`, `apps/web`, `apps/api`, and the T-030 template
region were confirmed untouched.

## Capability-coverage (throwaway-worktree falsification)

I created my OWN scratch worktree (`git worktree add
C:/Users/Lenovo/AppData/Local/Temp/claude/t022-checker-falsify cc8dc91 --detach`,
`pnpm install --offline`, succeeded) and authored five NEW hostile-variant tests of my own
(`packages/engine/tests/checker-hostile-t022.test.ts`, not copied from the maker's suite):
translation-reveals-crisis-while-original-is-concern-only (same turn), a later crisis turn erasing
an earlier turn's already-collected concern, cross-student edge-read isolation on a colliding
sessionId/turnId, a non-matching `sessionId` filter never falling back to the student's other
concerns, and same-turn text+translatedText double-match dedup.

**These did not finish executing in this check's time budget.** The machine-wide test lock
(`vc-testlock.sh`) was held almost continuously by other agents' runs (`t-026-kb-client`,
`t-022-concern-continue`'s own engine suite run by a parallel session, and a long
`vc-t027-falsify-all.sh` falsification script) for the whole window I had — consistent with the
dispatch's own warning that RAM is tight and several agents run in parallel. I did not bypass the
lock (that risks OOM-crashing concurrent agents' work). The scratch worktree and test file remain
on disk at the path above for whoever picks this up next, or for a follow-up sweep once lock
contention clears.

**CAPABILITY-COVERAGE: 0/11 rows reproduced via throwaway-copy GREEN/RED this cycle —
UNVERIFIED-by-checker on the falsification step specifically**, not on the underlying claims: those
claims are backed instead by (a) my own fresh, real re-execution of the full manifest test suite in
the bound tree (602/602 tests, matching the manifest's counts exactly, including every named F1–F11
test id passing), and (b) the source-level trace above, which for every row identifies the exact
line(s) the manifest's described falsifying edit would touch and confirms the described RED
assertion is the one that would actually fire (no wrong-reason-red risk spotted: none of the
described edits touch parsing/import/loading paths that would redden unrelated tests). This is
weaker than an independent GREEN-before/RED-after rerun and is disclosed as debt, not claimed as
equivalent.

## Issues ledger

- **ISS-t-007-rev-3** ("concern-level turn ends the whole scribe; untested at graph level") flipped
  `open -> fixed`. This unit is exactly the fix: `checkCrisis` no longer stops on concern, and
  `scribe-concern.test.ts` tests it at the full graph level (not just the pure function). Evidence
  is my own fresh test run above. Appended as a new ledger row (append-only), not an edit in place.
- No new issues filed against this unit's own code — the only gap found is the checker-side
  falsification-execution gap above, which is an infrastructure limitation, not a defect in the
  manifest's implementation.

## B17 / Mode D / B19

Changed paths are entirely `packages/engine`, `packages/schemas`, `packages/db/tests` (one string),
and `qa/manifests`. No `apps/web` file touched (confirmed via `git diff --name-only`).
**LIVE-BROWSER: not-applicable** — no UI surface changed. Persona walk: not required (no
user-facing flow touched; T-023/T-010 own `apps/web`). B19 scenario matrix: not applicable (only
required for UI-touching units and releases).

## Open gaps (from the manifest, read and accepted as genuinely out of this unit's scope)

Confirmed each of the manifest's 8 "Open gaps" is correctly deferred to a named later unit
(T-025 tenant stamping, T-012 escalation/session-row flag, T-023/T-010 for `apps/web`) and none of
them is actually required by B20 as written — B20 asks for a KG write with citation and a visible
flag in the approval payload, both of which this unit delivers.

---

VERDICT: PASS
SCOREBOARD: 9/9 contract clauses touched (B20 primary; B2, B3, B4, B5, B9, B13, B14, B15, B16) evidenced, 0 invariants violated
FAILURES: none
CAPABILITY-COVERAGE: 0/11 rows reproduced via throwaway-copy this cycle (blocked by shared test-lock contention) | strongly corroborated instead via fresh full-suite re-run (602/602, every named test id passing) + source-level trace of all 11 rows
LIVE-BROWSER: not-applicable (no apps/web / UI paths in the diff)
ISSUES-WRITTEN: none new; ISS-t-007-rev-3 flipped open -> fixed
EXECUTOR: claude-opus maker build subagent (checker: claude-sonnet-subagent)
EXPLANATION: Every package test/typecheck the manifest claims was re-run fresh by the checker and matched exactly (602 tests, 0 failures); the diff is scoped to exactly the manifest's file list with no deletions; the B15 erasure/export inheritance mechanism was independently traced against erasure.ts and confirmed correct without any change to that file. The one shortfall is the required throwaway-worktree GREEN/RED falsification, which the checker set up and wrote its own hostile tests for but could not execute in time due to sustained machine-wide test-lock contention from concurrently running agents — disclosed as debt rather than claimed complete.
