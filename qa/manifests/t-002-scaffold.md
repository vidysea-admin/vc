# Manifest — t-002-scaffold
**Contract:** qa/contracts/counselling-engine.md (section B)
**Goal task:** T-002
**Date:** 2026-09-25
**Fix cycle:** 0
**Dual check:** no
**Issues addressed:** none
**Executor:** claude-sonnet-subagent
**Executor rationale:** mechanical scaffold + schema authoring from an explicit brief; no need for a larger model

## What changed
- `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.npmrc` — root pnpm TS monorepo config
  (private, `type: module`, node>=20, `typecheck`/`test` fan out via `pnpm -r`)
- `packages/schemas/src/schemas.ts` (265 lines) — the Zod source of truth: `Fact`, `Card`,
  `PreBriefCard`, `TranscriptTurn`, `AudioChunkMeta`, `FeedbackEvent`, `FactChange`, `ProfileDiff`,
  `CounsellorDecision`, `Consent`, `Decision`, `RequirementSpec` (+`FieldSpec`/`DocSpec`), `GapList`,
  `ApplicationPacket`, `FillResult`, `DraftReport`, `AuditEvent` — every schema exports an inferred TS
  type
- `packages/schemas/src/guards.ts` — pure `isScriptLike(prompt)` function (B1 heuristic: recital cues
  always flag; otherwise script-like unless it ends in "?" or starts with a comparison marker)
- `packages/schemas/tests/{guards,fact,card,consent}.test.ts` (14 tests) — node:test + tsx, covering
  B1/B2/B4/minor-consent as enforced schema refinements
- `packages/engine`, `packages/providers`, `apps/api`, `apps/web`, `mcp/student-profile`,
  `mcp/university-kb` — 6 stub packages, each `package.json` (typecheck+test scripts) + `src/index.ts`
  (named placeholder export, e.g. `engineStatus()`) + one trivial test
- `skills/README.md` — planned skill names per D-005

## How to verify (commands + expected)
- `pnpm install` (in the worktree) → expected: exit 0
- `pnpm -r typecheck` → expected: exit 0, all 7 packages report "Done"
- `pnpm -r test` → expected: exit 0, 20 tests total (14 schemas + 6×1 stub) all pass
- `python contracts/verify_contracts.py` → expected: exit 0 ("PASS by vacuity", contracts.json has no
  frozen stages yet — research phase)
- `git diff --stat --cached 7c84eb6` → expected: only `A` (added) files, no modifications/deletions

## Actual outputs (from maker's own run)

**`pnpm install`** — exit 0:
```
Scope: all 8 workspace projects
Packages: +7
Progress: resolved 33, reused 2, downloaded 5, added 7, done
devDependencies:
+ @types/node 22.20.4 (26.6.2 is available)
+ tsx 4.23.15
+ typescript 5.8.3 (7.0.2 is available)
Done in 3.6s using pnpm v10.33.0
```

**`pnpm -r typecheck`** — exit 0 (EXIT_CODE=0 printed by the runner):
```
Scope: 7 of 8 workspace projects
apps/api typecheck: Done
mcp/student-profile typecheck: Done
apps/web typecheck: Done
mcp/university-kb typecheck: Done
packages/providers typecheck: Done
packages/engine typecheck: Done
packages/schemas typecheck: Done
EXIT_CODE=0
```

**`pnpm -r test`** — exit 0 (EXIT_CODE=0 printed by the runner):
```
packages/schemas test: ✔ a well-formed card parses (3.7498ms)
packages/schemas test: ✔ B2: a card with empty sources is rejected (1.2984ms)
packages/schemas test: ✔ B1: a card whose prompt is a script (recital) is rejected (0.552ms)
packages/schemas test: ✔ an adult's consent without guardianConsent parses (5.139ms)
packages/schemas test: ✔ a minor's consent WITH guardianConsent parses (0.9995ms)
packages/schemas test: ✔ a minor's consent without guardianConsent is rejected (1.7391ms)
packages/schemas test: ✔ a well-formed fact parses (3.4206ms)
packages/schemas test: ✔ B4: a fact with empty purposeTags is rejected (1.2327ms)
packages/schemas test: ✔ B2: a fact with no source is rejected (0.4814ms)
packages/schemas test: ✔ a genuine question is not script-like (1.2746ms)
packages/schemas test: ✔ a comparison-marker prompt is not script-like (0.2142ms)
packages/schemas test: ✔ a recital cue is flagged as script-like even when phrased as a question (0.1474ms)
packages/schemas test: ✔ recital cues 'Say:' and 'You should tell' are flagged (0.1462ms)
packages/schemas test: ✔ a plain statement with no question mark or comparison marker is script-like (0.1584ms)
packages/schemas test: ℹ tests 14  pass 14  fail 0
apps/web test: ✔ webStatus reports the scaffold placeholder and defers Next.js to T-008 (1.1465ms)
mcp/student-profile test: ✔ studentProfileMcpStatus reports the scaffold placeholder (1.1075ms)
mcp/university-kb test: ✔ universityKbMcpStatus reports the scaffold placeholder (1.102ms)
apps/api test: ✔ apiStatus reports the scaffold placeholder (1.3543ms)
packages/engine test: ✔ engineStatus reports the scaffold placeholder (1.1149ms)
packages/providers test: ✔ providersStatus reports the scaffold placeholder (1.2396ms)
EXIT_CODE=0
```
Total: 20 tests, 20 pass, 0 fail across 7 packages.

**`python contracts/verify_contracts.py`** — exit 0:
```
verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity
EXIT_CODE=0
```

**`git diff --stat --cached 7c84eb6`** (after `git add -A` in the worktree):
```
 39 files changed, 1153 insertions(+)
```
No deletions, no modifications to any existing file (ARCHITECTURE.md, docs/, qa/, .claude/,
scripts/, contracts/, goal.md, the compass report all untouched — confirmed by the diff listing
containing only new paths under apps/, mcp/, packages/, skills/, plus the 4 new root config files).

## Capability coverage (each new claim -> its isolating falsification)

All four falsifications below were run in an isolated **temp copy** of `packages/schemas` at
`C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/4028b141-b4f9-4793-84a0-f900414a84fb/scratchpad/t002-falsify/schemas-copy`
(outside `D:\vc` entirely — a plain `cp -r` of `packages/schemas`, with `npm install` run fresh
there since pnpm's symlinked `node_modules` doesn't survive a flat copy). Each edit was applied,
the single affected test file was run to observe the FAIL, then the file was restored from a
`.bak` copy and the PASS re-confirmed before moving to the next row. The worktree's own
`packages/schemas/src/{guards,schemas}.ts` were diffed byte-identical against the pre-falsification
originals afterward (see "Actual outputs" above) — nothing in the working tree was touched by this
process.

| capability (one line) | the check that covers it | the falsifying edit | observed (pasted runner output) |
|---|---|---|---|
| B1 `isScriptLike` — Card.prompt refine rejects script-like (recital) prompts | `packages/schemas/tests/card.test.ts` — "B1: a card whose prompt is a script (recital) is rejected" | `src/guards.ts`: inserted `return false;` as the first line of `isScriptLike()`, disabling the guard | PASS before: `✔ B1: a card whose prompt is a script (recital) is rejected (0.6553ms)`. FAIL after: `✖ B1: a card whose prompt is a script (recital) is rejected (1.9083ms)` — `AssertionError [ERR_ASSERTION]: Missing expected exception. ... operator: 'throws'` |
| B2 `Card.sources` — empty-array sources rejected | `packages/schemas/tests/card.test.ts` — "B2: a card with empty sources is rejected" | `src/schemas.ts`: `sources: z.array(CardSourceSchema).min(1),` → `sources: z.array(CardSourceSchema),` (dropped `.min(1)`) | PASS before: `✔ B2: a card with empty sources is rejected (1.5375ms)`. FAIL after: `✖ B2: a card with empty sources is rejected (3.0779ms)` — `AssertionError [ERR_ASSERTION]: Missing expected exception. ... operator: 'throws'` |
| B4 `Fact.purposeTags` — empty-array purposeTags rejected | `packages/schemas/tests/fact.test.ts` — "B4: a fact with empty purposeTags is rejected" | `src/schemas.ts`: `purposeTags: z.array(z.string().min(1)).min(1),` → `purposeTags: z.array(z.string().min(1)),` (dropped outer `.min(1)`) | PASS before: `✔ B4: a fact with empty purposeTags is rejected (1.3437ms)`. FAIL after: `✖ B4: a fact with empty purposeTags is rejected (1.7229ms)` — `AssertionError [ERR_ASSERTION]: Missing expected exception. ... operator: 'throws'` |
| Consent — a minor's consent row without `guardianConsent: true` is rejected | `packages/schemas/tests/consent.test.ts` — "a minor's consent without guardianConsent is rejected" | `src/schemas.ts`: `.refine((consent) => !consent.minor \|\| consent.guardianConsent, {` → `.refine((consent) => true, {` (refine body replaced with a no-op) | PASS before (part of the 3/3 fact.test.ts... consent.test.ts re-run): `✔ a minor's consent without guardianConsent is rejected` (re-confirmed clean at 14/14 full-suite PASS, see "Actual outputs" above). FAIL after: `✖ a minor's consent without guardianConsent is rejected (1.7728ms)` — `AssertionError [ERR_ASSERTION]: Missing expected exception. ... operator: 'throws'` |

Each falsification broke exactly the named assertion (`operator: 'throws'` / "Missing expected
exception" — the schema stopped rejecting the bad input it's supposed to reject) and no other test
in the same file went red alongside it, so each row isolates the rule it claims to cover.

Note on B5 (typed boundaries) and B6 (portable core): these are structural claims about this unit
(every schema module has typed Zod input/output with no free-text passing, and `skills/README.md` +
the guard-in-code split for hard rules exist) rather than single runtime behaviours with one
falsifying edit each — `pnpm -r typecheck` (pasted above, exit 0) is the check that would fail if a
schema's inferred type didn't compile, and `skills/README.md` / `packages/schemas/src/guards.ts`'s
existence is verifiable by listing, not by perturbation. Not claimed as isolated capability rows
here; B7 (Langfuse tracing), B3 (interrupt-gated writes), B8 (Mongo/offline), B9 (crisis routing)
and B10 (draft-only P2) are explicitly out of scope for this unit (no graph, no Mongo, no network —
see UNIT brief) and are not claimed by this manifest.

## Live browser evidence
Not UI-touching — apps/web is a plain TS stub, no rendered surface (Next.js is deliberately not
installed in this unit; see `apps/web/src/index.ts` and D-note "Next.js in T-008").

## Status: ready-for-check
