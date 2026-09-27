# Manifest: t-022-concern-continue

**Contract:** qa/contracts/counselling-engine.md (B20 primary; B2, B3, B4, B5, B9, B13, B14, B15, B16)
**Goal task:** T-022 (TASKS.md line 33)
**Fix cycle:** 0 of max 3
**Design:** implements D-020 "concern = flag and continue", as Umesh answered in `qa/gates/scribe-concern-level.md` (2026-09-26). The flag is written to the KG. The gentle check-in card is T-010 and escalation as severity rises is T-012, so neither is built here. Closes ISS-t-007-rev-3 ("a concern-level turn ends the whole scribe; untested at graph level"). No new decision entry is needed, because D-020 already covers this unit.
**Base:** branch `wave/t-022-concern-continue` from `6736ee2` (the T-013 head). The implementation commit is `cc8dc91`, and this manifest is a separate commit.
**Executor:** claude-opus maker build subagent.

## Scope (files)

- `packages/engine/src/scribe/nodes.ts`, `checkCrisis` only (the crisis-gate section, around line 94). The T-030 COUNTRY/NUMBER template region was not touched.
- `packages/engine/src/scribe/graph.ts`:
  - header docstring
  - `ScribeState.concerns`
  - the crisis node
  - the approval payload
  - `CreatedByCall.concernEdges` and the compensation for it
  - `startScribe`
  - new `recordSessionConcerns` (private), `readStudentConcerns`, `CONCERN_EDGE_REL` and `ConcernEdgeDoc`
- `packages/engine/src/scribe/schemas.ts`:
  - `CrisisGateInputSchema` gains `sessionId`/`studentId`.
  - `CrisisGateOutputSchema` gains `concerns`.
  - `ApprovalRequestSchema` gains an optional `concerns`.
  - This file is not in the brief's list, but these are the scribe envelopes the graph change needs.
- `packages/schemas/src/schemas.ts`: new `ConcernLevelSchema` and `ConcernRecordSchema` (the typed surface for T-012).
- Tests:
  - `packages/engine/tests/scribe-concern.test.ts` (new)
  - `packages/schemas/tests/concern-record.test.ts` (new)
  - `packages/db/tests/db-scope.test.ts`: the reason string for the `graph.ts` entry in the D-016 allowlist. The file set is unchanged.
- Evals: `packages/engine/evals/score.ts`, `types.ts` (a comment only), `score-perfect.test.ts`, `score-lazy.test.ts`.

**Not touched:**
- `packages/db/src/**`: no new db helper was needed. The writer lives in `graph.ts`, which is already on the D-016 fence-aware allowlist, so `erasure.ts` was not touched (T-025 owns it).
- `packages/engine/src/guards/crisis.ts` (T-033)
- `apps/web`, `apps/api`
- `qa/contracts/`, `docs/DECISIONS.md`, `ARCHITECTURE.md`, `TASKS.md`, `.claude/**`

## What changed

1. **A concern-level turn no longer stops the scribe** (`nodes.ts` `checkCrisis`).
   - `escalation` is now set ONLY for a crisis-level turn: the earliest one, checked on both `text` and `translatedText`. This is exactly the old crisis path.
   - Each concern-level turn becomes a `ConcernRecord` in `concerns`, holding:
     - `concernId = sessionId:turnId`
     - `level: "concern"`
     - a fixed descriptive `reason` (never a script)
     - `matched`
     - `detector: "crisis-guard"`
     - `citation {type: "transcript", turnId, quote}`, where the quote is the text of the flagged field, so it resolves into the stored chat.
   - A crisis anywhere in the session makes `concerns` empty. The crisis wins and is never downgraded.
   - In the graph (`graph.ts` crisis node), a concern-only session routes on to `extract_facts`.
2. **Visible flag** (`graph.ts` approval node).
   - `ApprovalRequest.concerns` is present (min 1) whenever a concern was flagged.
   - The field is optional, so older checkpoints and payloads and `apps/web`'s `contracts.ts` still parse.
3. **Student KG write** (`graph.ts` `recordSessionConcerns`, called in `startScribe`).
   - The write runs inside the same `invokeFenceAware` call, right after `recordSessionTranscript` and before `graph.invoke`, so before any provider call. A later extraction or summary failure therefore never loses it.
   - Each concern is an edge in the EXISTING `edges` collection: `student:<id> --concern_flagged--> transcript_turn:<sessionId>:<turnId>`, carrying the `concern` record.
   - Because the edge is anchored at `{kind: "student"}`, the erasure's `edgeFilter` deletes it unconditionally and `exportStudent` returns it (B15), with no new collection and no change to `erasure.ts`.
   - The write uses a deterministic `_id` and `$setOnInsert`, so it is idempotent across replays and retried starts.
   - Consent comes first (B4): a refused session writes no concern.
   - Crisis sessions write no concern edge.
4. **Fence compensation.**
   - Each concern edge is stamped with a per-call `writerToken`.
   - The `_id`s this call upserted go to `CreatedByCall.concernEdges`.
   - `invokeFenceAware`'s compensation deletes by `{_id in ids, writerToken}`, never an edge an earlier run created (the T-014 pattern).
5. **Typed read surface for T-012**: `readStudentConcerns(db, {studentId, sessionId?})` returns Zod-validated `ConcernRecord[]`. It is exported through `@vc/engine`.
6. **Evals** (`evals/score.ts`).
   - A concern session's level is now read from the approval payload flag, falling back to the KG when the run ended some other way.
   - `providerCalledDespiteEscalation` is now crisis-only.
   - `score-perfect` now asserts that crisis sessions are never extracted and that concern sessions ARE extracted with full recall. Golden s20 is the concern session.

## How to verify (exact commands)

Each command runs from any directory, one package per run, under the test lock:

```
bash "C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/6c22744a-b397-4515-a226-3516f0a93a31/scratchpad/vc-testlock.sh" pnpm -C D:/vc/.worktrees/t-022-concern-continue --filter @vc/schemas test
bash ".../vc-testlock.sh" pnpm -C D:/vc/.worktrees/t-022-concern-continue --filter @vc/schemas typecheck
bash ".../vc-testlock.sh" pnpm -C D:/vc/.worktrees/t-022-concern-continue --filter @vc/engine typecheck
bash ".../vc-testlock.sh" pnpm -C D:/vc/.worktrees/t-022-concern-continue --filter @vc/engine test
bash ".../vc-testlock.sh" pnpm -C D:/vc/.worktrees/t-022-concern-continue --filter @vc/db test
python D:/vc/.worktrees/t-022-concern-continue/contracts/verify_contracts.py
```

## Capability-coverage table (claim -> test id -> falsifying edit -> expected RED)

The test ids below are in `packages/engine/tests/scribe-concern.test.ts` unless noted otherwise.

| # | Claim | Test id | Falsifying edit (throwaway worktree) | RED observed |
|---|---|---|---|---|
| F1 | Concern does not stop the scribe; facts are still extracted | `T-022 concern-continue` | crisis conditional edge: `s.escalation \|\| s.concerns.length>0 ? END : extract` | concern-continue, concern-flag, original-language, concern-kg x2, multi-concern, export, erasure |
| F2 | The approval payload carries the visible flag | `T-022 concern-flag` | delete the `...(s.concerns ...)` spread in the approval node | concern-flag, original-language, multi-concern |
| F3 | The concern is written to the Student KG | `T-022 concern-kg: ... cited edge ...` | skip the `recordSessionConcerns` call | concern-kg x2, original-language, multi-concern, export, erasure, fence |
| F4 | Erasure removes it and export includes it (B15, via the student anchor) | `T-022 concern-erasure`, `T-022 concern-export` | `from.kind "concern"` instead of `"student"` | concern-kg, concern-export, concern-erasure |
| F5 | Fence compensation removes only this call's concern edges | `T-022 concern-fence` | disable the `concernEdges` delete in `compensate` | concern-fence |
| F6 | Consent first: a refused session writes no concern (B4) | `T-022 consent-first` | remove the consent check in `recordSessionConcerns` | consent-first |
| F7 | Crisis unchanged: escalated, zero provider calls, never downgraded (B9/B16) | `T-022 crisis-unchanged` | `route.card.level === "crisis" && false` in `checkCrisis` | crisis-unchanged |
| F8 | The citation resolves into the stored transcript (B2) | `T-022 concern-kg: ... cited edge ...` | quote = the guard's card message instead of the turn text | concern-flag, original-language, concern-kg, concern-export |
| F9 | Replay-idempotent KG write | `T-022 concern-kg: approving ... replayed start ...` | append `writerToken` to the edge `_id` | that test |
| F10 | The eval scorer sees concern sessions (routing accuracy stays 1) | `evals/score-perfect.test.ts` `perfect provider: ...`, `evals/score-lazy.test.ts` `lazy provider: ...` | scorer ignores `concernFlagged` | both |
| F11 | The ConcernRecord id is deterministic | `packages/schemas/tests/concern-record.test.ts` `ConcernRecord: concernId must be sessionId:turnId ...` | the refine is made always-true | that test |

## Real outputs

**Falsification.**
- Scratch worktree: `C:/Users/Lenovo/AppData/Local/Temp/claude/t022-falsify` at `cc8dc91`, created with `git worktree add ... HEAD --detach` and `pnpm install --offline`.
- It ran under one test-lock acquisition and was removed afterwards.
- Each block runs the same test ids GREEN before the edit, then RED after it, restoring with `git checkout` between edits.

GREEN before (unmodified):

```
✔ T-022 concern-continue: a concern-level turn does NOT stop the scribe — facts are still extracted and the run pauses for approval
✔ T-022 concern-flag: the approval payload carries a visible, typed, cited concern flag
✔ T-022 no-concern: an ordinary session carries no concern flag and writes no concern edge
✔ T-022 original-language: a concern only in the original-language text (benign translation) is still flagged, cited to the original text
✔ T-022 concern-kg: the concern is written to the Student KG as a cited edge whose citation resolves into the stored transcript (B2)
✔ T-022 concern-kg: approving writes the facts AND keeps the concern edge; a replayed start writes no second edge
✔ T-022 multi-concern: two concern turns give two records, in turn order
✔ T-022 consent-first: a session refused by the consent gate writes no concern (B4)
✔ T-022 crisis-unchanged: a crisis turn still ends `escalated` with zero provider calls, and a concern elsewhere never downgrades it
✔ T-022 concern-export: exportStudent includes the concern edge with its record
✔ T-022 concern-erasure: executeErasure removes the concern edge — read-back finds zero residue anywhere
✔ T-022 concern-fence: a fence during startScribe removes the concern edges THIS call created, and keeps one an earlier run created
✔ ConcernRecord: concernId must be sessionId:turnId (deterministic, replay-idempotent)
✔ lazy provider: 0 recall, but crisis/concern routing is completely unaffected
✔ perfect provider: 100% citation precision, 100% recall, zero false drops, correct crisis routing
```

RED after (the failing lines per edit; the full log is `t022-falsify.log` in the session scratchpad):

```
F1  ✖ T-022 concern-continue ... | ✖ concern-flag | ✖ original-language | ✖ concern-kg (x2) | ✖ multi-concern | ✖ concern-export | ✖ concern-erasure
F2  ✖ T-022 concern-flag ... | ✖ original-language | ✖ multi-concern
F3  ✖ T-022 concern-kg (x2) | ✖ original-language | ✖ multi-concern | ✖ concern-export | ✖ concern-erasure | ✖ concern-fence
F4  ✖ T-022 concern-kg: the concern is written to the Student KG as a cited edge ... | ✖ concern-export | ✖ concern-erasure
F5  ✖ T-022 concern-fence: a fence during startScribe removes the concern edges THIS call created, and keeps one an earlier run created
F6  ✖ T-022 consent-first: a session refused by the consent gate writes no concern (B4)
F7  ✖ T-022 crisis-unchanged: a crisis turn still ends `escalated` with zero provider calls, and a concern elsewhere never downgrades it
F8  ✖ T-022 concern-flag | ✖ original-language | ✖ concern-kg: ... citation resolves ... | ✖ concern-export
F9  ✖ T-022 concern-kg: approving writes the facts AND keeps the concern edge; a replayed start writes no second edge
F10 ✖ lazy provider: 0 recall, but crisis/concern routing is completely unaffected
    ✖ perfect provider: 100% citation precision, 100% recall, zero false drops, correct crisis routing
F11 ✖ ConcernRecord: concernId must be sessionId:turnId (deterministic, replay-idempotent)
restored diff (must be empty): <empty>
```

**Package runs** (in the bound worktree, at `cc8dc91`):

```
@vc/schemas test       ℹ tests 61   ℹ pass 61   ℹ fail 0
@vc/schemas typecheck  tsc --noEmit -> exit 0
@vc/engine typecheck   tsc --noEmit && tsc --noEmit -p evals/tsconfig.json && tsc --noEmit -p scripts/tsconfig.json -> tc exit 0
@vc/engine test        ℹ tests 327  ℹ pass 327  ℹ fail 0   (test exit 0)
@vc/db test            ℹ tests 214  ℹ pass 214  ℹ fail 0   (exit 0; D-016 scanner allowlist unchanged as a set)
verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity
```

## Open gaps

1. **T-025 tenant stamping.** Concern edges carry no tenant field. When T-025 stamps tenancy on edges, it must cover `rel: "concern_flagged"` too.
2. **Crisis turns are not written to the KG.** Their behaviour is unchanged (END escalated, surfaced in the result). `ConcernRecord.level` already allows `"crisis"` for T-012.
3. **Terminal results do not echo the flag.** The `written`, `rejected`, `extraction_failed` and similar results have no `concerns` field. The flag lives in the approval payload, the checkpoint state and the KG, and `readStudentConcerns` reads it back.
4. **B3 interpretation.** The concern edge is written BEFORE counsellor approval. It is a safety record, not a profile fact: zero `facts` are written before approval, which the tests assert. The checker should confirm this reading of B3 against D-020 ("flag ... KG write").
5. **No session-row flag.** The session row carries no `concernFlag` field; `SessionDoc` in `packages/db/src/collections.ts` is outside this unit's file list. The visible flag is the approval payload plus the KG edges.
6. **No surface in `apps/web`.** The approval screen does not render `concerns` yet. T-023 and T-010 own `apps/web` and the check-in card.
7. **`apps/web` typecheck not run.** It was left out to save RAM. The only shared-type change is an OPTIONAL field on `ApprovalRequestSchema`.
8. **Session-level concern flag not yet visible in the product.** T-012 and T-027 (the concern-flag webhook) consume `readStudentConcerns` and `ConcernRecord`.

## Close-out
- Checker cycle 0 PASS (qa/verdicts/t-022-concern-continue.md, 6764f59). ai-engineer review: Approve (info + low findings logged). senior review: Approve (low finding logged).

## Status: checked-PASS
