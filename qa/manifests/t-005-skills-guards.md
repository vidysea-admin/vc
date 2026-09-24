# Manifest — t-005-skills-guards
**Contract:** qa/contracts/counselling-engine.md (section B — B1, B2, B6, B9)
**Goal task:** T-005
**Date:** 2026-09-25
**Fix cycle:** 0
**Dual check:** no
**Issues addressed:** ISS-t-002b-schema-hardening-2
**Executor:** claude-sonnet-subagent
**Executor rationale:** mechanical extension of an existing, fully-specified heuristic (guards.ts)
plus a hand-written frontmatter parser and pure guard functions from a fully-specified brief with
exact function signatures and test strings given; no need for a larger model.

Note on continuation: a previous build agent was stopped mid-unit. On resume, disk already held a
correct, complete fix for ISS-t-002b-schema-hardening-2 in `packages/schemas/src/guards.ts` (+
tests), all 10 `skills/*/SKILL.md` files, and `packages/engine/src/skills/loader.ts` (+ its tests and
malformed fixtures) — all kept as-is, verified, and built on rather than redone. Missing at resume:
the entire `packages/engine/src/guards/` directory (no-script, citation, crisis, hard-rules — only
their *tests* existed, importing modules that did not yet exist) and the `index.ts` barrel exports.
This session wrote those five files, added `guard-crisis.test.ts` and `guard-hard-rules.test.ts`
(the two guards with no pre-existing test file), and wired the exports.

## What changed
- `packages/schemas/src/guards.ts:25-64` — kept from the prior agent, verified correct: ISS-t-002b-
  schema-hardening-2 fix. `RECITAL_CUES` gained `/\b(explain|inform)( to)? (the student|them|him|her)\b/i`,
  `/\blet (the student|them|him|her) know\b/i`, and `/^(your line|script|say this)\s*:/i`; the file
  header doc comment (lines 25-30) updated to match. Confirmed via the false-positive regression
  block still holding (third-party reporting verbs, "the office will inform applicants", stay false).
- `packages/schemas/tests/guards.test.ts:102-131` — kept from the prior agent: 5 new tests for the 3
  new cues plus a false-positive-guard regression test (all named `ISS-t-002b-2: ...`).
- `skills/{widen-card,challenge-card,compare-card,evidence-card,clarify-card,fact-extraction,
  session-summary,profile-diff,verifier,safety-escalation}/SKILL.md` — kept from the prior agent
  as-is (all 10 present, 39-45 lines each, frontmatter name matches folder, purpose/input-output/soft
  rules/2 examples each). Verified loader tests pass against them unmodified.
- `packages/engine/src/skills/loader.ts` — kept from the prior agent as-is: hand-written frontmatter
  parser (no deps), `listSkills(dir)` and `loadSkill(dir, name)`, throwing on missing/unclosed
  frontmatter, missing `name`, or a `name` that doesn't match its folder.
- `packages/engine/tests/loader.test.ts` + `packages/engine/tests/fixtures/skills-malformed/{no-
  frontmatter,name-mismatch,valid-one}/SKILL.md` — kept from the prior agent as-is.
- **New this session:**
  - `packages/engine/src/guards/types.ts` — shared `GuardResult` (`{ok:true}|{ok:false,reason}`) and
    `DropResult<C>` (`{kept, dropped:[{card,reason}]}`) so every guard returns one of two shapes.
  - `packages/engine/src/guards/no-script.ts` — `noScriptGuard(card: {type, prompt})` (B1), thin
    adapter over `isScriptLike` from `@vc/schemas` returning `GuardResult` with a reason string.
  - `packages/engine/src/guards/citation.ts` — `citationGuard(card: {sources})` (B2): rejects empty
    `sources` or any source failing `CardSourceSchema.safeParse` (e.g. empty `id`); `dropUncited(cards)`
    → `{kept, dropped}`.
  - `packages/engine/src/guards/crisis.ts` — `crisisGuard(text)` → `{level:"none"|"concern"|"crisis",
    matched}` (B9). `CRISIS_PATTERNS` + the crisis redirect message ported verbatim (H6) from
    `D:/vidysea/ikigai-counsellor/src/services/crisis-guard.ts` (English self-harm/suicide, Hinglish,
    abuse signals — read-only reference, not modified). `CONCERN_PATTERNS` is new in this engine
    (ikigai's guard had only a crisis/no-crisis boolean, no softer tier) — academic-stress/hopelessness
    language, deliberately narrower so it does not catch benign phrasing. `routeBeforeGeneration(text)`
    → `{route:"escalate", card: EscalationCard}` on any non-`"none"` level, else `{route:"continue"}`;
    `EscalationCard` (`{type:"escalation", level:"concern"|"crisis", message, matched}`) defined
    locally here, matching the shape `skills/safety-escalation/SKILL.md` already documented.
  - `packages/engine/src/guards/hard-rules.ts` — `applyHardRules(cards)`: runs `noScriptGuard` then
    `citationGuard` per card, caps survivors at 3 (docs/plan.md §3 step 7, "counsellor sees at most 3
    cards"), returns `{kept, dropped:[{card,reason}]}` with the cap's own reason distinct from a B1/B2
    failure.
  - `packages/engine/src/guards/index.ts` — barrel re-exporting all of the above.
  - `packages/engine/src/index.ts` — added `export * from "./skills/loader.js"` and
    `export * from "./guards/index.js"` (requirement 5).
  - `packages/engine/tests/guard-crisis.test.ts` — new: 8 tests covering crisis-level (English,
    Hinglish, abuse), concern-level, crisis-takes-priority-over-concern, empty text, and the documented
    false positive `"I'm dying to go to LSE, it's my dream school."` staying `"none"`.
  - `packages/engine/tests/guard-hard-rules.test.ts` — new: 5 tests covering clean-pass, B1 drop, B2
    drop, the max-3 cap (5 clean cards → 3 kept, 2 dropped with the cap reason), and that a script-like
    card dropped for B1 does not consume a cap slot.
  - `packages/engine/tests/guard-citation.test.ts`, `packages/engine/tests/guard-no-script.test.ts` —
    kept from the prior agent as-is (pre-written against the module paths this session created).

## How to verify (commands + expected)
- `pnpm install` → exit 0, lockfile unchanged
- `pnpm -r typecheck` → exit 0, all 7 packages "Done"
- `pnpm -r test` → exit 0, all suites pass (schemas 50/50, engine 31/31)
- `python contracts/verify_contracts.py` → exit 0 ("no frozen contracts yet -- PASS by vacuity")
- `git diff --stat main -- pnpm-lock.yaml` → empty
- `git diff --stat main` → additions/edits only (schemas guards.ts/test, engine index.ts; new files
  untracked, none deleted)

## Actual outputs (from maker's own run)

```
$ pnpm install
Scope: all 8 workspace projects
Lockfile is up to date, resolution step is skipped
Already up to date
Done in 745ms using pnpm v10.33.0

$ pnpm -r typecheck
Scope: 7 of 8 workspace projects
apps/api typecheck: Done
mcp/university-kb typecheck: Done
mcp/student-profile typecheck: Done
apps/web typecheck: Done
packages/providers typecheck: Done
packages/schemas typecheck: Done
packages/engine typecheck: Done

$ pnpm -r test
...
packages/schemas test: ℹ tests 50 / pass 50 / fail 0
packages/engine test: ℹ tests 31 / pass 31 / fail 0

$ python contracts/verify_contracts.py
verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity
EXIT:0

$ git diff --stat main -- pnpm-lock.yaml
(no output — empty)

$ git diff --stat main
 packages/engine/src/index.ts          |  9 ++++++++-
 packages/schemas/src/guards.ts        | 13 +++++++++++++
 packages/schemas/tests/guards.test.ts | 31 +++++++++++++++++++++++++++++++
 qa/.last-tick                         |  1 -
 qa/contracts/counselling-engine.md    | 14 +-------------
 5 files changed, 53 insertions(+), 15 deletions(-)
```

**Note on `qa/.last-tick` and `qa/contracts/counselling-engine.md` in that last diff:** this unit did
not touch either file (both are off-limits to this unit and untouched — `git status --short` shows
no modification to them). They appear only because `HEAD` (996f344) is 2 commits behind `main`
(485b6ca): main gained a `qa/.last-tick` line and a B7/B14 contract tightening after this worktree's
branch point. `git diff --stat main` is comparing across that gap, not reporting an edit made here.
Flagging for the checker/maker to reconcile on merge (rebase or merge-forward), not something this
unit should fix by touching contract/qa files it is barred from.

## Capability coverage (each new claim -> its isolating falsification)

All 7 falsifications run in a temp copy at
`C:\Users\Lenovo\AppData\Local\Temp\claude\t005-falsify` (full copy of the worktree minus `.git`,
`node_modules` recreated via `CI=true pnpm install`, confirmed GREEN baseline: schemas 50/50, engine
31/31 before any edit). Every edit was a single hunk, reverted immediately after capturing the RED
line, and the temp copy's `guards.ts`, `packages/engine/src/guards/`, and `loader.ts` are confirmed
byte-identical (`diff`) to the worktree's originals afterward — no falsification touched the worktree
itself.

| capability (one line) | the check that covers it | the falsifying edit | observed (pasted runner output) |
|---|---|---|---|
| `isScriptLike` flags bare "explain/inform (to) the student/them" (ISS-t-002b-2) | `packages/schemas/tests/guards.test.ts:107` `ISS-t-002b-2: 'explain (to) the student/them' is flagged as script-like` | removed the `/\b(explain\|inform)( to)? (the student\|them\|him\|her)\b/i` line from `RECITAL_CUES` | PASS before: `✔ ISS-t-002b-2: 'explain (to) the student/them' is flagged as script-like (1.3643ms)`. FAIL after: `✖ ISS-t-002b-2: 'explain (to) the student/them' is flagged as script-like` — `AssertionError ... false !== true` |
| `isScriptLike` flags "let the student/them/him/her know" (ISS-t-002b-2) | `packages/schemas/tests/guards.test.ts:115` `ISS-t-002b-2: 'let the student know' is flagged as script-like` | removed the `/\blet (the student\|them\|him\|her) know\b/i` line from `RECITAL_CUES` | PASS before: `✔ ISS-t-002b-2: 'let the student know' is flagged as script-like (1.6081ms)`. FAIL after: `✖ ISS-t-002b-2: 'let the student know' is flagged as script-like` — `AssertionError ... false !== true` |
| `isScriptLike` flags a leading script-label cue ("Your line:"/"Script:"/"Say this:") (ISS-t-002b-2) | `packages/schemas/tests/guards.test.ts:119` `ISS-t-002b-2: a leading script-label cue ('Your line:') is flagged as script-like` | removed the `/^(your line\|script\|say this)\s*:/i` line from `RECITAL_CUES` | PASS before: `✔ a leading script-label cue ('Your line:') is flagged as script-like (1.4874ms)`. FAIL after: `✖ a leading script-label cue ('Your line:') is flagged as script-like` — `AssertionError ... false !== true` |
| `dropUncited` actually drops an uncited card, not just labels it (B2) | `packages/engine/tests/guard-citation.test.ts:32` `dropUncited keeps cited cards and drops uncited ones` | in `citation.ts`, changed the empty-sources check to `if (false && (!card.sources ...))` | PASS before: `✔ dropUncited keeps cited cards and drops uncited ones (3.9366ms)`. FAIL after: `✖ dropUncited keeps cited cards and drops uncited ones` — `deepStrictEqual` expected `['card-cited']`, actual `['card-cited','card-uncited']` |
| a crisis-level signal actually routes to `{route:"escalate"}`, not just gets classified (B9, "before any generative call") | `packages/engine/tests/guard-crisis.test.ts:22` `an explicit self-harm signal is level 'crisis' and escalates` | in `crisis.ts` `routeBeforeGeneration`, changed the short-circuit to `if (result.level === "none" \|\| result.level === "crisis") return {route:"continue"}` | PASS before: `✔ an explicit self-harm signal is level 'crisis' and escalates (2.0942ms)`. FAIL after: `✖ ...` — `AssertionError ... actual: 'continue', expected: 'escalate'` |
| `applyHardRules` caps kept cards at 3 (docs/plan.md §3 step 7) | `packages/engine/tests/guard-hard-rules.test.ts:35` `only the first 3 clean cards are kept — the rest are dropped for the cap` | changed `const MAX_CARDS = 3` to `const MAX_CARDS = Infinity` in `hard-rules.ts` | PASS before: `✔ only the first 3 clean cards are kept — the rest are dropped for the cap (5.5937ms)`. FAIL after: `✖ ...` — `AssertionError ... 5 !== 3` |
| `loadSkill`/`listSkills` throw when a SKILL.md's frontmatter `name` doesn't match its folder | `packages/engine/tests/loader.test.ts:57` `loadSkill throws when the frontmatter name does not match the folder name` | in `loader.ts` `readAndValidate`, changed the mismatch check to `if (false && parsed.frontmatter.name !== expectedName)` | PASS before: `✔ loadSkill throws when the frontmatter name does not match the folder name (2.8826ms)`. FAIL after: `✖ ...` — `AssertionError [ERR_ASSERTION]: Missing expected exception.` |

## Live browser evidence
Not UI-touching — no surface changed. This unit added `packages/schemas/src/guards.ts` (regex-only
change), `packages/engine/src/skills/loader.ts`, `packages/engine/src/guards/*.ts`, and
`skills/*/SKILL.md` — all backend/library code and markdown prompt files, no `apps/web` or any
rendered surface touched.

## Status: ready-for-check
