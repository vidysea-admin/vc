# Manifest — t-002b-schema-hardening
**Contract:** qa/contracts/counselling-engine.md (section B)
**Goal task:** T-002b
**Date:** 2026-09-25
**Fix cycle:** 1
**Dual check:** no
**Issues addressed:** ISS-007, ISS-008, ISS-009, ISS-010, ISS-011
**Executor:** claude-sonnet-subagent
**Executor rationale:** mechanical schema hardening from an explicit, fully-specified brief (exact
rules and reviewer test strings given); no need for a larger model

Note on source of the issue text: `qa/issues.jsonl` in this worktree (and on `main` at this
branch's base commit `4290c6d`) does **not** actually contain ISS-007..011 rows — only TASKS.md and
docs/DECISIONS.md D-007 reference them by id. The full rule text was supplied verbatim in this
unit's dispatch brief, which is what this manifest implements against. Flagging this as a ledger
gap for the checker/maker to reconcile, not something this unit can fix (qa/issues.jsonl is off
limits to this unit).

## What changed
- `packages/schemas/package.json`, `packages/engine/package.json`, `packages/providers/package.json`,
  `apps/api/package.json`, `apps/web/package.json`, `mcp/student-profile/package.json`,
  `mcp/university-kb/package.json` — ISS-007: added `"exports": {".": "./src/index.ts"}` and
  `"types": "./src/index.ts"` to every existing workspace package.json, per D-007 (source exports,
  tsx, no build step)
- `packages/engine/package.json` — added `"@vc/schemas": "workspace:*"` to `dependencies` (a
  workspace link, not an npm dependency)
- `packages/engine/tests/index.test.ts` — ISS-007 proof: imports `CardSchema` from `@vc/schemas` and
  parses a valid Card (new test `ISS-007: @vc/schemas is importable cross-package and parses a valid
  Card`)
- `packages/schemas/src/guards.ts:1-79` — ISS-008: `isScriptLike` is now `(prompt: string, type?:
  CardType) => boolean`. Recital cues widened to `["Tell the student", "Tell them", "Say:", "Say to",
  "You should tell", "Ask them to agree", "Convince", "Reassure them that"]`, plus a
  `DEFINITIVE_TAG_QUESTION` regex (`/\b(definitely|certainly|clearly|obviously|surely)\b.*,\s*(right|
  isn't it|don't you think|correct)\?$/i`) that always flags regardless of type. When `type` is
  `widen`/`clarify` the prompt must end in `"?"`. When `type` is `compare`/`challenge`/`evidence` a
  statement is allowed (only a recital cue flags it). No `type` given falls back to the original v1
  heuristic (legacy callers, and the pre-existing untyped guards.test.ts cases).
- `packages/schemas/src/schemas.ts:21-46` — ISS-009: `FactSourceSchema` is now
  `z.discriminatedUnion("type", [...])`: `transcript` requires `quote` + `turnId`; `kb` requires `id`
  + `fetchedAt` (`z.string().datetime()`); `profile` requires `id`; `student-direct` requires `id`
  (the answer record).
- `packages/schemas/src/schemas.ts:58-61` — ISS-010: `Fact.validFrom` → `z.string().datetime()`,
  `Fact.validTo` → `z.string().datetime().optional()`.
- `packages/schemas/src/schemas.ts:85-99` — ISS-011: added `id: z.string().min(1)` to `CardSchema`;
  the refine call now passes `card.type` into `isScriptLike` (`!isScriptLike(card.prompt,
  card.type)`).
- `packages/schemas/tests/card.test.ts` — `validCard()` fixture gained `id`; added 9 new tests: id
  required/non-empty (ISS-011), the reviewer's 3 exact strings (evidence/challenge → NOT script,
  definitive-tag-question → IS script for every type) (ISS-008), widen/clarify-must-be-question,
  compare-may-be-statement.
- `packages/schemas/tests/fact.test.ts` — `validFact()` fixture's `source` dropped the now-invalid
  `id` field on a `transcript` source; added 3 new tests for `validFrom`/`validTo` datetime rejection
  (ISS-010), including the exact `"banana"` case from the brief.
- `packages/schemas/tests/fact-source.test.ts` (new) — 12 tests, one pair (accept/reject each missing
  field) per `FactSource` variant (ISS-009).
- `packages/schemas/tests/guards.test.ts` — added 13 new tests directly against `isScriptLike`:
  widened recital cues, the definitive-tag-question regex, and type-aware widen/clarify/
  compare/challenge/evidence behaviour. All 5 pre-existing tests are unchanged and still pass — none
  of their input strings needed the new `type` parameter (see "Adjusted tests" below).
- `pnpm-lock.yaml` — gained the `packages/engine` importer's `@vc/schemas: workspace:*` →
  `link:../schemas` dependency entry (see lockfile diff below). No npm dependency was added; no other
  content changed.

## Adjusted tests (premise was the old heuristic)
None of the 5 pre-existing `guards.test.ts` tests needed changing — every one of their input strings
resolves identically under the v1 fallback branch (no `type` argument) as it did before, since
`isScriptLike(prompt)` with no second argument is byte-for-byte the old v1 heuristic. `card.test.ts`'s
`validCard()` fixture was extended (not narrowed) with `id`, and its 3 pre-existing tests are
unmodified in intent. `fact.test.ts`'s `validFact()` fixture's `source.id` field was dropped because
ISS-009's `transcript` variant no longer accepts an `id` field (extra keys are stripped by `z.object`,
so this was not load-bearing, but removed for accuracy) — the 3 pre-existing fact tests are otherwise
unmodified.

## How to verify (commands + expected)
- `pnpm install --offline` (in the worktree) → expected: exit 0, lockfile change limited to the
  `packages/engine` → `@vc/schemas` workspace-link importer entry
- `pnpm -r typecheck` → expected: exit 0, all 7 packages report "Done"
- `pnpm -r test` → expected: exit 0, 49 tests total (42 schemas + 2 engine + 5×1 stub) all pass
- `python contracts/verify_contracts.py` → expected: exit 0 ("PASS by vacuity")
- `git diff --stat main -- pnpm-lock.yaml` → expected: `1 file changed, 4 insertions(+)` (only the
  workspace-link entry)
- `git diff --stat main` → expected: additions/edits only, no deletions of existing files

## Actual outputs (from maker's own run)

**`pnpm install --offline`** — exit 0:
```
Scope: all 8 workspace projects
Progress: resolved 0, reused 1, downloaded 0, added 0
Packages: +7
Progress: resolved 33, reused 7, downloaded 0, added 7, done
devDependencies:
+ @types/node 22.20.4
+ tsx 4.23.15
+ typescript 5.8.3
Done in 3.1s using pnpm v10.33.0
```

**`pnpm -r typecheck`** — exit 0:
```
Scope: 7 of 8 workspace projects
apps/api typecheck: Done
apps/web typecheck: Done
mcp/student-profile typecheck: Done
mcp/university-kb typecheck: Done
packages/providers typecheck: Done
packages/schemas typecheck: Done
packages/engine typecheck: Done
```
(shell `$?` captured immediately after: `0`)

**`pnpm -r test`** — exit 0, 49/49 pass:
```
apps/web test: ✔ webStatus reports the scaffold placeholder and defers Next.js to T-008
mcp/student-profile test: ✔ studentProfileMcpStatus reports the scaffold placeholder
mcp/university-kb test: ✔ universityKbMcpStatus reports the scaffold placeholder
apps/api test: ✔ apiStatus reports the scaffold placeholder
packages/providers test: ✔ providersStatus reports the scaffold placeholder
packages/schemas test: ✔ 42 tests, 0 fail (card/fact/fact-source/consent/guards)
packages/engine test: ✔ engineStatus reports the scaffold placeholder
packages/engine test: ✔ ISS-007: @vc/schemas is importable cross-package and parses a valid Card
packages/engine test: ℹ tests 2 / pass 2 / fail 0
```
(shell `$?` captured immediately after: `0`)

**`python contracts/verify_contracts.py`** — exit 0:
```
verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity
```
(shell `$?` captured immediately after: `0`)

**`git diff --stat main -- pnpm-lock.yaml`**:
```
 pnpm-lock.yaml | 4 ++++
 1 file changed, 4 insertions(+)
```
Line-level confirmation (`diff --strip-trailing-cr` against the pre-install lockfile, to rule out the
CRLF noise a raw `diff` shows):
```
69a70,73
>     dependencies:
>       '@vc/schemas':
>         specifier: workspace:*
>         version: link:../schemas
```
Exactly the workspace-link entry. No npm dependency was added; `zod`/`tsx`/`typescript`/`@types/node`
versions and the `packages:`/`snapshots:` sections are byte-identical.

**`git diff --stat main`**:
```
 apps/api/package.json                 |  4 ++
 apps/web/package.json                 |  4 ++
 mcp/student-profile/package.json      |  4 ++
 mcp/university-kb/package.json        |  4 ++
 packages/engine/package.json          |  7 ++++
 packages/engine/tests/index.test.ts   | 14 +++++++
 packages/providers/package.json       |  4 ++
 packages/schemas/package.json         |  4 ++
 packages/schemas/src/guards.ts        | 78 ++++++++++++++++++++++++++------
 packages/schemas/src/schemas.ts       | 44 +++++++++++++++-----
 packages/schemas/tests/card.test.ts   | 66 +++++++++++++++++++++++++++++
 packages/schemas/tests/fact.test.ts   | 19 ++++++++-
 packages/schemas/tests/guards.test.ts | 55 ++++++++++++++++++++++++
 pnpm-lock.yaml                        |  4 ++
 qa/.last-tick                         |  1 -
 15 files changed, 288 insertions(+), 24 deletions(-)
```
`qa/.last-tick` shows as `1 -` only because `main` has one commit (`d12502c`, "qa: tick wave 3") this
branch has not merged in yet — `git diff HEAD -- qa/.last-tick` (this branch's own tip, before any of
this unit's edits) is empty, so it is pre-existing branch divergence, not something this unit
touched, deleted, or wrote to. `packages/schemas/tests/fact-source.test.ts` (new file, +80 lines) is
untracked and does not show in this diff — confirmed separately via `git status --short`
(`?? packages/schemas/tests/fact-source.test.ts`). Every other line is an addition or an in-place
edit to an existing file; no existing file was deleted or renamed.

## Capability coverage (each new claim -> its isolating falsification)

All falsifications were run in a throwaway copy at
`%TEMP%\claude\d--vc\4028b141-b4f9-4793-84a0-f900414a84fb\scratchpad\falsify-copy` (created via `tar`
from the worktree, excluding `.git` and `node_modules`, then `pnpm install`), never in the worktree
itself. Each row's edit was applied, observed, then reverted before moving to the next row; the copy
was byte-identical to the fixed worktree state (`diff` clean) before this table's rows began and
after the last one finished.

| capability (one line) | the check that covers it | the falsifying edit | observed (pasted runner output) |
|---|---|---|---|
| ISS-007: `@vc/schemas` is importable from another workspace package via source `exports`, no build step | `packages/engine/tests/index.test.ts` — `ISS-007: @vc/schemas is importable cross-package and parses a valid Card` | removed `exports`+`types` from `packages/schemas/package.json` (single JSON edit) | PASS-before: `✔ ISS-007: @vc/schemas is importable cross-package and parses a valid Card (2.845ms)` (worktree run). FAIL-after: `✖ tests\index.test.ts (510.5382ms)` with `ERR_MODULE_NOT_FOUND` at `tsx`'s resolver, `ℹ pass 0 / ℹ fail 1`, `ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL @vc/engine@0.1.0 test` — the import itself fails to resolve, which is the exports-map claim, not an unrelated crash |
| ISS-008: evidence/challenge/compare cards may be cited statements (no longer forced to end in "?") | `packages/schemas/tests/card.test.ts` — `ISS-008: an evidence card citing a ranking is NOT script-like`, `ISS-008: a challenge card about a budget gap is NOT script-like`, `ISS-008: a compare card that is a statement (no '?') parses` | single-line edit to `schemas.ts`'s refine call: `!isScriptLike(card.prompt, card.type)` → `!isScriptLike(card.prompt)` (drops type-awareness, same as the pre-ISS-008 call site) | PASS-before (worktree, all 3): `✔ ISS-008: an evidence card citing a ranking is NOT script-like`, `✔ ISS-008: a challenge card about a budget gap is NOT script-like`, `✔ ISS-008: a compare card that is a statement (no '?') parses`. FAIL-after (falsify-copy): `✖ ISS-008: an evidence card citing a ranking is NOT script-like (1.6898ms)`, `✖ ISS-008: a challenge card about a budget gap is NOT script-like (0.5088ms)`, `✖ ISS-008: a compare card that is a statement (no '?') parses (0.4369ms)`, `ℹ fail 3` — exactly the type-dependent rows redden; the type-independent ISS-008 rows (definitive-tag-question, widen/clarify-must-be-question) stay green in the same run, proving the edit isolates type-awareness specifically |
| ISS-009: a `kb` FactSource is rejected unless it carries `fetchedAt` | `packages/schemas/tests/fact-source.test.ts` — `kb: missing fetchedAt is rejected` | single-line edit: `fetchedAt: z.string().datetime(),` → `fetchedAt: z.string().datetime().optional(),` | PASS-before (worktree): `✔ kb: missing fetchedAt is rejected (0.3859ms)`. FAIL-after (falsify-copy): `✖ kb: missing fetchedAt is rejected (1.4208ms)`, `ℹ fail 1` — the other 3 `kb:` rows (`id + fetchedAt parses`, `missing id rejected`, `non-datetime fetchedAt rejected`) stay green in the same run |
| ISS-010: `Fact.validFrom` must be an ISO-8601 datetime, not any non-empty string | `packages/schemas/tests/fact.test.ts` — `ISS-010: a fact with validFrom: 'banana' is rejected` | single-line edit: `validFrom: z.string().datetime(),` → `validFrom: z.string().min(1),` | PASS-before (worktree): `✔ ISS-010: a fact with validFrom: 'banana' is rejected (0.6191ms)`. FAIL-after (falsify-copy): `✖ ISS-010: a fact with validFrom: 'banana' is rejected (2.0327ms)`, `ℹ fail 1` — the sibling `validTo` datetime tests stay green in the same run, isolating the `validFrom` claim specifically |
| ISS-011: every `Card` requires a non-empty `id` | `packages/schemas/tests/card.test.ts` — `ISS-011: a card with no id is rejected`, `ISS-011: a card with an empty id is rejected` | removed the `id: z.string().min(1),` line from `CardSchema`'s object (single-hunk deletion, 3 lines incl. its comment) | PASS-before (worktree, both): `✔ ISS-011: a card with no id is rejected (0.4916ms)`, `✔ ISS-011: a card with an empty id is rejected (0.3896ms)`. FAIL-after (falsify-copy): `✖ ISS-011: a card with no id is rejected (17.601ms)`, `✖ ISS-011: a card with an empty id is rejected (0.7922ms)`, `ℹ fail 2` — all other card tests in the same run (including the ISS-007 cross-package one, which supplies an `id` that is simply stripped as an extra key when absent from the schema) stay green |

After the last row, the falsify-copy's `packages/schemas/src/schemas.ts` was diffed against the
pre-falsification backup and confirmed byte-identical (`diff` exit 0), and `pnpm -r test` in the
falsify-copy re-confirmed 49/49 pass, 0 fail — the copy was left in the same state it started in.

## Live browser evidence
Not UI-touching — no surface changed. This unit only touched `package.json` metadata, Zod schema
source (`packages/schemas/src/{schemas,guards}.ts`), and `.test.ts` files under `packages/schemas/`
and `packages/engine/`. No `apps/web` or any browser-reachable surface changed.


## Fix cycle 1 (2026-09-25), answering qa/verdicts/t-002b-schema-hardening.md (Cycle checked: 0, VERDICT: FAIL)
Quoted failure:
- "[B1] sev: high · isScriptLike false-negatives on obvious recitals for compare/challenge/evidence card types (case-sensitive cue match misses lowercase mid-sentence recitals like "You must tell the student..."; fixed cue list misses plain imperative "Say the X is Y." forms) ... · issue: ISS-t-002b-schema-hardening-1"

### What changed (cycle 1, maker-built in the orchestrator session)
- packages/schemas/src/guards.ts: RECITAL_CUES changed from a case-sensitive string list (`includes`) to case-insensitive RegExps (`.test`). Added a leading-imperative `^say`, `say(:| to| that)`, and `you (should|must|need to|have to|ought to) (tell|say|inform|explain)`. Third-party reporting verbs ("Alumni say ...", "Recruiters tell us ...") are deliberately not matched.
- packages/schemas/tests/guards.test.ts: 3 new tests, written first and seen RED (12 pass / 2 fail) before the change:
  - test 12: lowercase and mid-sentence recital cues on statement types, including the checker's "You must tell the student their application is rejected." (evidence) and "Tell them LSE is the right choice." (evidence)
  - test 13: leading "Say ..." imperative, including the checker's "Say the international office deadline is March 1." (evidence)
  - test 14: false-positive guard. Cited third-party evidence is NOT flagged.

### Actual outputs (cycle 1, worktree)
- `npx tsx --test --test-reporter=tap tests/guards.test.ts` (packages/schemas) → `# pass 14` `# fail 0`
- `pnpm -r typecheck` → exit 0 (all packages "Done")
- `pnpm -r test` → exit=0; every package `ℹ fail 0` (apps/api, mcp/student-profile, mcp/university-kb, apps/web, packages/providers, packages/schemas, packages/engine)
- `python contracts/verify_contracts.py` → "no frozen contracts yet (research phase) -- PASS by vacuity", exit 0
- Stated anomaly: one earlier chained run printed `test exit=1` right after typecheck. Two immediate re-runs gave exit 0 with 0 failures in every package, and I could not reproduce it. It is disclosed here, not hidden.

### Capability coverage (cycle 1 rows; temp copy outside D:c: scratchpad/falsify-002b-c1, `pnpm install --offline`, GREEN first: `# pass 14 # fail 0`)
| capability | check | falsifying edit (single hunk, guards.ts) | observed |
|---|---|---|---|
| recital cues match case-insensitively (lowercase/mid-sentence) | guards.test.ts test 12 | drop the `i` flag on the `tell (the student|them...)` and `you (should|must...)` regexes (lines 45, 48) | before: `ok 12 - ISS-t-002b-1: lowercase / mid-sentence recital cues flag statement-type cards` · after: `not ok 12 - ISS-t-002b-1: lowercase / mid-sentence ...` (also `not ok 3`, `not ok 11`: capitalised "Tell" no longer matches a now case-sensitive lowercase pattern, same cause) · `# pass 11 # fail 3` |
| leading imperative "Say ..." flagged | guards.test.ts test 13 | delete line 46 `/^say/i` | before: `ok 13 - ISS-t-002b-1: a leading imperative 'Say ...' flags as script` · after: `not ok 13 - ...` · `# pass 13 # fail 1` (only the named test) |
| third-party reporting verbs not flagged | guards.test.ts test 14 | UNVERIFIED -- no single-hunk edit isolates it without also breaking tests 12/13; the green `ok 14` on both edits above shows no false positive was introduced | enumerated, see ISS-t-002b-schema-hardening-1 |

Live browser evidence (cycle 1): Not UI-touching. Only packages/schemas/src/guards.ts and packages/schemas/tests/guards.test.ts changed.

## Status: ready-for-check
