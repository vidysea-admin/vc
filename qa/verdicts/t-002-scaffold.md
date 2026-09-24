# Verdict — t-002-scaffold

**Date:** 2026-09-25
**Cycle checked:** 0
**Contract:** qa/contracts/counselling-engine.md (section B — B1, B2, B4, B5 judged; B3/B6/B7/B9/B10 not in scope for a scaffold unit)
**Checker:** fresh Claude Sonnet subagent, read-only toward the artifact

## What I re-ran myself (all reproduced, all green)
- `pnpm install` in the worktree — exit 0 (node_modules already present and valid).
- `pnpm -r typecheck` — exit 0, all 7 packages "Done".
- `pnpm -r test` — exit 0, 20/20 tests pass (14 in packages/schemas + 6×1 stub), output matches the manifest's pasted transcript verbatim.
- `python contracts/verify_contracts.py` — exit 0, "PASS by vacuity" (no frozen contracts yet).
- `git diff --stat 7c84eb6..HEAD` and `git diff --diff-filter=DRM --name-status 7c84eb6..HEAD` — 40 files changed, 1294 insertions(+), **zero** deletions/renames/modifications. Every changed path is inside the manifest's "What changed" list (root config, packages/schemas, the 6 stub packages, skills/README.md) plus the expected side effects `pnpm-lock.yaml` and `qa/manifests/t-002-scaffold.md`.

## Capability coverage — re-verified in 4 independent throwaway copies (outside D:\vc, node_modules removed and reinstalled fresh, worktree untouched)
All 4 rows reproduced exactly as the manifest claims — GREEN before, single-hunk edit, RED after, the **named** assertion is the one that fires (`operator: 'throws'` / `Missing expected exception`, or `strictEqual` for the guards-level check), and no unrelated test in the same file broke alongside it:

| row | GREEN before | edit applied | RED after |
|---|---|---|---|
| B1 `isScriptLike` (card.test.ts) | ✔ 3/3 card.test.ts | `guards.ts`: `return false;` inserted as first line | ✖ only "B1: a card whose prompt is a script (recital) is rejected"; B2 in same file stayed green |
| B2 `Card.sources` empty rejected | ✔ 3/3 card.test.ts | `schemas.ts`: dropped `.min(1)` on `sources` | ✖ only "B2: a card with empty sources is rejected"; B1 in same file stayed green |
| B4 `Fact.purposeTags` empty rejected | ✔ 3/3 fact.test.ts | `schemas.ts`: dropped outer `.min(1)` on `purposeTags` | ✖ only "B4: a fact with empty purposeTags is rejected"; the source-check test stayed green |
| Consent minor-guardianConsent | ✔ 3/3 consent.test.ts | `schemas.ts`: `.refine(...)` body replaced with `(consent) => true` | ✖ only "a minor's consent without guardianConsent is rejected"; the other 2 consent tests stayed green |

CAPABILITY-COVERAGE: 4/4 rows reproduced.

## Judgement against B section (scaffold-appropriate scope)
- **B1** — met. `isScriptLike` heuristic in `guards.ts` wired into `CardSchema.refine`; falsification proves isolation.
- **B2** — met. `Card.sources` and `Fact.source` both required/non-empty; falsification proves it for sources, and `fact.test.ts`'s "no source" test (re-run clean in step 3) covers the Fact side.
- **B4** — met. `Fact.purposeTags` non-empty enforced + falsified; `Consent` schema's minor→guardianConsent refine enforced + falsified.
- **B5** — met, structurally. Every exported schema in `schemas.ts` has an inferred TS type (`z.infer`), `pnpm -r typecheck` is the check that would fail on a non-compiling inferred type, and no node yet exists to pass untyped free text between (this is the pre-graph scaffold T-002 scope calls for per TASKS.md). Compared schemas against `docs/plan.md` §3/§4 Module I/O lines directly: `PreBriefCard`, `TranscriptTurn`, `FeedbackEvent`, `Decision`, `GapList`, `ApplicationPacket`, `AuditEvent` match the plan's shapes field-for-field (with sensible type generalizations, e.g. `who: string` instead of literal `"student"`). `ProfileDiff`/`FactChange`, `RequirementSpec`/`FieldSpec`/`DocSpec`, `FillResult`, `DraftReport` are reasonable, non-contradicting elaborations of shapes the plan names but doesn't fully spell out. The one flagged deviation — **`AudioChunkMeta` omits `pcm16k`** — is judged acceptable: a Zod object schema is the wrong tool to validate a raw binary PCM stream, the comment discloses the omission and its reasoning, and no test or contract criterion claims audio bytes flow through this typed boundary in this unit.
- **B8** — met, structurally. Grepped all new `apps/`, `mcp/`, `packages/` source for Mongo/network calls: every hit is a doc-comment stating the opposite ("No MCP transport or Mongo reads/writes live here yet"). No production writes, no real data, tests are offline `node:test`.
- **B3, B6 (partial), B7, B9, B10** — correctly out of scope per the unit brief (no graph, no Mongo, no network, no crisis routing, no portal filler exist yet). B6's structural half (skills/README.md naming planned SKILL.md files, guards.ts as the first code-guard) is present and consistent with D-005.

## Diff scope (step 4c)
Additions only — confirmed above. Nothing pre-existing was deleted, renamed or modified.

## Issues ledger
`qa/issues.jsonl` open issues (ISS-001, ISS-003, ISS-004, ISS-005) are all config/security/doc-gap items from other units (config-audit, t-001-plan-doc) — none are in this unit's scope and the manifest's "Issues addressed: none" is accurate. No new issues found; nothing written to the ledger.

## Live browser
Not UI-touching — confirmed from the diff (`apps/web` is `package.json` + `src/index.ts` returning a status string + one test; no Next.js, no React, no HTML/rendered surface). Mode D not applicable.

---

VERDICT: PASS
SCOREBOARD: 4/4 in-scope criteria met (B1, B2, B4, B5), 0/0 invariants (none declared for this section)
FAILURES (if any):
- none
CAPABILITY-COVERAGE: 4/4 rows reproduced
LIVE-BROWSER: not-applicable (apps/web is a plain TS stub, no rendered surface, no UI-shaped paths in the diff)
ISSUES-WRITTEN: none
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)
EXPLANATION: All 4 verify commands reproduced clean (typecheck, test, contracts, diff-scope). All 4 claimed capability rows falsified and confirmed red-for-the-named-reason in isolated throwaway copies, worktree untouched. Diff is additions-only and scoped exactly to the manifest's "What changed". Schemas track docs/plan.md §3/§4 Module I/O shapes closely; the one disclosed deviation (AudioChunk metadata-only, no pcm16k field) is a reasonable scaffold-stage choice, not a contract violation.
