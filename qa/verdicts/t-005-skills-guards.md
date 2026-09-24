# Verdict — t-005-skills-guards

**Cycle checked:** 0
**Date:** 2026-09-25
**Checker:** fresh Claude subagent (Anthropic session, no `ANTHROPIC_BASE_URL` override)
**Bound to:** D:\vc\.worktrees\t-005-skills-guards (branch wave/t-005-skills-guards)

## VERDICT: PASS

## What I re-ran myself
- `pnpm install` — exit 0, "Lockfile is up to date, resolution step is skipped".
- `pnpm -r typecheck` — exit 0, all 7 packages "Done".
- `pnpm -r test` — exit 0, `packages/schemas` 50/50, `packages/engine` 31/31 (matches manifest).
- `python contracts/verify_contracts.py` — exit 0, "no frozen contracts yet -- PASS by vacuity".
- `git diff --stat 996f344 f63383c -- pnpm-lock.yaml` — empty (unchanged).
- `git diff --stat 996f344 f63383c` — 29 files, all additions except two existing-file edits
  (`packages/engine/src/index.ts` +9/-1 comment reword + 2 new barrel exports;
  `packages/schemas/src/guards.ts` +13/-0, three new RECITAL_CUES lines + doc comment). No
  deletions, no renames, nothing outside the manifest's "What changed" list.
- `git show --stat 6229a9a` (merge of main into this branch) — confirmed it touched only
  `qa/.last-tick`, `qa/contracts/counselling-engine.md`, `qa/gates/dpdp-erase-design.md` — no code.

## Criteria (B1, B2, B6, B9, B14; B8 offline)
- **B1 (no-script):** PASS. Read `packages/schemas/src/guards.ts`, `guard-no-script.ts`. Re-ran
  the 3 recorded ISS-t-002b-schema-hardening-2 repros verbatim: `"Let the student know LSE is
  better."`, `"Inform them the deadline passed."`, `"Explain to the student that ..."` (type
  `evidence`) — all now `true` (previously `false`). Hostile probes I ran myself: `"LET THE
  STUDENT KNOW..."` (uppercase) → true, `"Kindly inform the student ..."` → true, `"Script :
  ..."` (space before colon) → true (regex `\s*` covers it), Hinglish `"bacche ko bolo ki ..."`
  → **false** (filed as ISS-t-005-skills-guards-1, low sev, not a criterion violation — B1's
  text names no multilingual requirement and the gap predates this unit). False-positive probes
  held false: `"Alumni say ..."`, `"The office will inform applicants by May 1 (source: ...)."`.
- **B2 (cited facts):** PASS. `dropUncited` drops empty/invalid-source cards, keeps valid ones
  (verified by reading `citation.ts` + re-running tests); `applyHardRules` caps kept at 3.
- **B6 (portable core):** PASS. All 10 `skills/*/SKILL.md` read directly — frontmatter `name`
  matches folder, `description` non-empty, for all 10. `loader.ts` read: `listSkills` touches
  only `frontmatter`, never `body`; `loadSkill` returns `body` on demand; malformed (missing
  frontmatter / unclosed / missing `name` / mismatched `name`) throws, confirmed by falsification
  row 7 below and by the existing malformed-fixture tests.
- **B9 (crisis):** PASS. `routeBeforeGeneration` short-circuits to `escalate` before any
  generative call for any non-`"none"` level (falsification row 5 below). `CRISIS_PATTERNS`
  diffed line-for-line against `D:/vidysea/ikigai-counsellor/src/services/crisis-guard.ts` —
  byte-identical, confirming the "ported verbatim (H6)" claim. Hostile probes: `"I'm dying to go
  to LSE"` → none (doc'd false-positive, held), `"this deadline is killing me"` → none, `"I want
  to end my life."` → crisis, case-insensitivity holds on matching patterns
  (`"I WANT TO KILL MYSELF."`, `"SUICIDAL"` → crisis). Gap found: `"mujhe jeena nahi hai"` (without
  a following "ka mann/dil/fayda nahi") and `"I feel so overwhelmed I could just disappear"` are
  not caught — filed as ISS-t-005-skills-guards-2 (medium sev, safety-relevant but **not a
  regression**: patterns are verbatim-identical to the ikigai source, so the contract's "check
  crisis patterns are the ikigai ones" is satisfied; does not block this PASS).
- **B14 (outcome, not construction):** PASS. Guard tests assert actual outcomes, not
  construction: `dropUncited` asserts the real `kept`/`dropped` id arrays; `routeBeforeGeneration`
  asserts `route === "escalate"` plus the actual `EscalationCard` fields; `applyHardRules` asserts
  actual `kept.length`/cap-reason text; loader asserts actual `throws`/body content. Allow/deny-list
  guards carry hostile-variant tests: `no-script` has the ISS-t-002b-1/2 blocks (case, mid-sentence,
  leading imperative, false-positive regression); `crisis` has Hinglish, abuse, benign
  false-positive (`"I'm dying to go to LSE"`), and crisis-over-concern priority tests.
- **B8 (offline):** satisfied trivially — this unit adds no Mongo/provider/network code; all new
  modules are pure functions over in-memory data or local filesystem reads (`loader.ts`).

## Capability coverage: 7/7 rows reproduced
Independently reproduced in my OWN throwaway copy (`<scratch>/t005-checker-copy`, worktree minus
`.git`/`node_modules`, `CI=true pnpm install`, confirmed GREEN baseline: schemas 50/50, engine
31/31 before any edit). Every row: single-hunk edit → named test RED for the named reason →
reverted → `diff` confirmed byte-identical to the worktree file again. The bound worktree itself
was never touched (`git status` in it stayed clean throughout).

| # | capability | result |
|---|---|---|
| 1 | `isScriptLike` flags "explain/inform (to) the student/them" | GREEN before, RED after (`false !== true`) — matches manifest |
| 2 | `isScriptLike` flags "let the student/them know" | GREEN before, RED after (`false !== true`) — matches manifest |
| 3 | `isScriptLike` flags leading script-label cue | GREEN before, RED after (`false !== true`) — matches manifest |
| 4 | `dropUncited` actually drops uncited cards | GREEN before, RED after (`['card-cited','card-uncited']` vs expected `['card-cited']`) — matches manifest |
| 5 | crisis-level signal actually routes to escalate | GREEN before, RED after (`'continue'` vs expected `'escalate'`) — matches manifest |
| 6 | `applyHardRules` caps kept cards at 3 | GREEN before, RED after (`5 !== 3`) — matches manifest |
| 7 | `loadSkill`/`listSkills` throw on name mismatch | GREEN before, RED after (`Missing expected exception`) — matches manifest |

## Diff scope (4c)
No deletions or renames of any existing function/class/export/test/config key. Nothing touched
outside the manifest's "What changed" list. `pnpm-lock.yaml` unchanged.

## Issues addressed
ISS-t-002b-schema-hardening-2 → **fixed**, verified by re-running the 3 recorded repro strings
verbatim (all now `true`) plus independent falsification of rows 1-3 above. Ledger updated.

## Not UI-touching — confirmed
All changed paths are `packages/schemas/src`, `packages/engine/src|tests`, `skills/*/SKILL.md` —
no `apps/web` or any rendered surface. Mode D not applicable.

CAPABILITY-COVERAGE: 7/7 rows reproduced
LIVE-BROWSER: not-applicable (backend/library + markdown only, no apps/web touched)
ISSUES-WRITTEN: ISS-t-002b-schema-hardening-2 (flipped to fixed), ISS-t-005-skills-guards-1, ISS-t-005-skills-guards-2
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)

## EXPLANATION
All 5 judged criteria (B1, B2, B6, B9, B14) hold on evidence I reproduced myself, B8 is trivially
satisfied (no network/DB code added), all 7 capability-coverage rows independently falsified in a
fresh throwaway copy, diff scope is clean, and the claimed issue fix is verified against its exact
recorded repro strings. Two new low/medium findings filed (Hinglish gap in the no-script guard,
inherited crisis-phrase gaps) — both are pre-existing scope limits rather than regressions
introduced by this unit, so neither blocks the PASS.
