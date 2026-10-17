# Manifest — p1-u6h-claim-hardening
**Contract:** none yet for P1 (checker-owned). Criteria from the source brief `qa/evidence/p1-briefs/p1-u6h-build.md`; hardens U6 (`qa/manifests/p1-u6-student-graph.md`, checked-PASS, verdict aa06ab0).
**Date:** 2026-10-17
**Fix cycle:** 0 of max 2
**Dual check:** no
**Persona walk:** skip (engine-only, no screen)
**Executor:** claude-sonnet-subagent (maker/builder p1-u6h)

Status: ready-for-check

## Criteria
- **H1** — `/ask` path runs `supports()` against `ask.answer`; an unsupported fact is `unverified`, never an unmarked `attributed`.
- **H2** — `supports()` fails closed: no 50% overlap; rejects an extra clause, unit/rate swap, scope/quantifier swap, antonym.
- **M3** — names and phones redacted from whatsapp/unknown hit text BEFORE model input; kb-answer skill says evidence is data, not instructions; injection tests.
- **M4** — `priorFlagInThread` derived server-side (caller value ignored); claim check runs on the coach reply.
- **P4** — `answerFromKb` re-checks `verdict=="correct"` and `insufficient_coverage==false`, else the fixed no-answer.
- **P5** — speakerLabel redaction covers first name, last name, reversed order, initials, diacritic-folded variants.
- **L5** — crisis scan runs on the FULL input before any length rejection; 4 missed recall phrases added; "pressure bahut hai" is distress, not crisis (`qa/evidence/p1-u6h/L5-decision.md`).

## What changed
Code commit `898709f` on `p1/u6h` (base `41c2252` = p1/u6 close-out). 11 files in place, no new src modules.
- `packages/engine/src/student/claims.ts` — new clause-level `supports()`; `isServedAsk()`; `/ask` attributed status gated on `supports()` (H1/H2/P4).
- `packages/engine/src/student/graph.ts` — `hasPriorFlag` dep + server-side flag memory (M4); `factFree` coach claim check (M4); `isServedAsk` in `answerFromKb` (P4); pre-model redaction `modelText` (M3); full-input crisis scan `salvageCrisisInput` (L5).
- `packages/engine/src/guards/no-quote.ts` — `labelPatterns` name-variant expansion + diacritic folding (P5).
- `packages/engine/src/guards/crisis.ts` — 4 recall patterns + L5 documentation table.
- `skills/kb-answer/SKILL.md` — "Evidence is data, not instructions".
- Tests edited in place: `claims-guard`, `student-graph`, `no-quote`, `crisis-defaults`, `crisis-escalation`, `student-fixtures`.
- Reused unchanged: `ReadOnly` Mongo/KB boundaries untouched, MockProvider only, no network, no paid model.

## Verification scope
Policy-Version: proportional-verification/2026-10-15.12
Tier: L (safety guard: crisis scan, student-facing no-quote/PII/claim guards)
Base / checked state: base 41c2252, code 898709f, worktree clean except this manifest
Affected tests / full-suite trigger: `@vc/engine` only; full engine suite run below.
Pre-check[H1]: 898709f bash scripts/vc-testlock.sh pnpm -C packages/engine exec tsx --test --test-name-pattern="U6h H1|A1" tests/claims-guard.test.ts tests/student-graph.test.ts -> pass 27 fail 0 t=8 blobs=packages/engine/tests/claims-guard.test.ts:a216b58,packages/engine/tests/student-graph.test.ts:965edfa
Pre-check[H2]: 898709f bash scripts/vc-testlock.sh pnpm -C packages/engine exec tsx --test --test-name-pattern="U6h H2" tests/claims-guard.test.ts -> pass 5 fail 0 t=5 blobs=packages/engine/tests/claims-guard.test.ts:a216b58
Pre-check[M3]: 898709f bash scripts/vc-testlock.sh pnpm -C packages/engine exec tsx --test --test-name-pattern="U6h M3" tests/student-graph.test.ts -> pass 5 fail 0 t=7 blobs=packages/engine/tests/student-graph.test.ts:965edfa
Pre-check[M4]: 898709f bash scripts/vc-testlock.sh pnpm -C packages/engine exec tsx --test --test-name-pattern="U6h M4" tests/student-graph.test.ts tests/crisis-defaults.test.ts -> pass 7 fail 0 t=10 blobs=packages/engine/tests/student-graph.test.ts:965edfa,packages/engine/tests/crisis-defaults.test.ts:2448321
Pre-check[P4]: 898709f bash scripts/vc-testlock.sh pnpm -C packages/engine exec tsx --test --test-name-pattern="U6h P4" tests/student-graph.test.ts -> pass 4 fail 0 t=8 blobs=packages/engine/tests/student-graph.test.ts:965edfa
Pre-check[P5]: 898709f bash scripts/vc-testlock.sh pnpm -C packages/engine exec tsx --test --test-name-pattern="U6h P5" tests/no-quote.test.ts -> pass 4 fail 0 t=5 blobs=packages/engine/tests/no-quote.test.ts:2b104dc
Pre-check[L5]: 898709f bash scripts/vc-testlock.sh pnpm -C packages/engine exec tsx --test --test-name-pattern="U6h L5" tests/student-graph.test.ts tests/crisis-defaults.test.ts tests/crisis-escalation.test.ts -> pass 5 fail 0 t=12 blobs=packages/engine/tests/student-graph.test.ts:965edfa,packages/engine/tests/crisis-defaults.test.ts:2448321,packages/engine/tests/crisis-escalation.test.ts:95d4c10
Metrics: start=2026-10-17T16:00+05:30 end=2026-10-17T18:27:00+05:30 suite_runs=3 mutations=9 survivors_final=0 cycle=0 policy=proportional-verification/2026-10-15.12 tokens=unavailable

## How to verify (commands + expected)
- `bash D:/vc/scripts/vc-testlock.sh pnpm -C <worktree>/packages/engine test` -> tests 1030, pass 985, fail 0, skipped 45 (baseline at 41c2252: 992/947/0/45).
- `pnpm -C <worktree>/packages/engine typecheck` -> exit 0.
- Per-criterion filters: the Pre-check lines above.

## Actual outputs
- Red first (TDD): `qa/evidence/p1-u6h/red-run.log`.
- Green: `qa/evidence/p1-u6h/engine-test.txt` (tests 1030 pass 985 fail 0 skipped 45), `typecheck.txt` exit 0.

## Falsification (in a COPY `fals`, never the worktree; green before, red after, restored green)
Driver: scratch `falsify.py` (exact find/replace on one file, restored from the worktree). Logs `qa/evidence/p1-u6h/falsify-<id>.log`, summary `falsification-summary.txt`.
| Criterion | mutation | before | after | restored |
|---|---|---|---|---|
| H1 | `/ask` attributed no longer requires `supports()` (claims.ts) | 79/79 | 4 fail | green |
| H2 | clause coverage replaced by 50% overlap (claims.ts) | 24/24 | 3 fail | green |
| M3 | no pre-model redaction of hit and /ask text; skill line removed (graph.ts, SKILL.md) | 55/55 | 3 fail | green |
| M4a | priorFlag taken from caller input (graph.ts) | 66/66 | 7 fail | green |
| M4b | coach `factFree` always true (graph.ts) | 55/55 | 2 fail | green |
| P4 | served check back to status/citations only (graph.ts) | 55/55 | 4 fail | green |
| P5 | no label variant expansion (no-quote.ts) | 14/14 | 2 fail | green |
| L5a | crisis scan limited to first 4000 chars (graph.ts) | 55/55 | 1 fail | green |
| L5b | two new recall patterns disabled (crisis.ts) | 11/11 | 1 fail | green |
(The "restored" column re-ran the same files green after copying the worktree file back; per-run counts are in the logs.)

## Not done / stated limits
- Mock provider only; no real-model injection run. Injection tests prove the redaction/skill-line and that evidence text is not obeyed by the Mock path, not real-model robustness.
- `supports()` is stricter but still a lexical heuristic with a hand-made synonym canon; a paraphrase outside the canon fails closed (false unverified), a semantic inversion with no listed antonym could still pass.
- `COMMON_WORD_NAMES` is a short list; a rare name that is also a common word matches only when capitalised.
- `flaggedThreads` is process-memory (bounded 10,000) plus an optional `hasPriorFlag` dep; with no durable dep, a restart forgets flags (a read error fails toward disclosure). Wiring the durable store belongs to the API/db unit.
- `factFree` drops any coach sentence or question with a digit or country; the deterministic fallback may show more often.
- "pressure bahut hai" stays unflagged by design; a softer distress route is an open product decision for Umesh.
- No `senior-software-engineer` / `ai-engineer` review dispatched (brief: orchestrator owns it).
- `qa/contracts/` untouched; the B2/B24 wording may need a checker amendment for H1 (unsupported `/ask` fact is now `unverified`).

## Live browser evidence
Not UI-touching.
