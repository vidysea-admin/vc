# Manifest — p1-u6b-profile-ranking
**Contract:** C1..C8 (unit-local ids, below). Parent rows: spec v8 (sha e183ee9a) A16, A16b engine part, B24.8; gate answers D-086 Q3, D-087 Q15, `qa/gates/p1-u0-amendment-signatures.md` P-8, D-093 4A/6A, D-097 item 3. Brief `qa/evidence/p1-briefs/p1-u6b-build.md`.
**Criteria:** C1 different deterministic orders, C2 citations, C3 default weights, C4 changed weights, C5 no ranking unauthenticated, C6 fact sources, C7 numbers only from the data port, C8 weight validation
**Goal task:** none
**Date:** 2026-10-19
**Status:** ready-for-check
**Fix cycle:** 0 of max 2
**Dual check:** no (tier M)
**Persona walk:** skip (engine-only, no screen)
**Issues addressed:** none
**Executor:** claude-sonnet-subagent (maker/builder p1-u6b)

## Criteria
- **C1** two synthetic profiles (ids `syn-...`) plus the same options give different, deterministic orders (run twice, identical; reversed or duplicated option list gives the same bytes).
- **C2** every ranked option carries its KB `sourceId`s and the `profileFactsUsed` entries that moved its score; the returned `claims[]`, `sources[]`, `profileFactsUsed[]` parse with the TurnResponse schema.
- **C3** default weights give `rankingProfile: "student-success"` and the vector 0.40 / 0.25 / 0.20 / 0.15 (P-8).
- **C4** a changed weight vector changes the order deterministically and the reported profile name differs. [ASSUMPTION] the name is `custom-` plus 8 hex of sha256 over the canonical vector (15 chars, inside the 64-char schema limit); it follows the numbers, so a caller cannot label custom weights "student-success".
- **C5** no authenticated student gives no ranking: `rankOptions` refuses with `sign_in_required` before the port is asked anything (the anonymous graph path already returns `sign_in_required`).
- **C6** A16b engine side: only `pathlynks` facts and confirmed facts enter; a `proposed` chat fact never changes any score or `profileFactsUsed`; labels are exact.
- **C7** numbers come only from the option-data port: a missing, unsourced, non-finite or out-of-range number leaves that option `insufficient_data` and last (never guessed, never clamped, never from a provider); ties break by option id.
- **C8** weight validation: exactly the four keys, finite, non-negative, not all zero; a vector not summing to 1 is scaled and the response says `weightsNormalised`; unknown keys rejected.

## What changed
Code commit `8f6a1a8` on branch `p1/u6b` (base `e2b805d` = p1/u8 head). Evidence and this manifest in a second commit.
- `packages/engine/src/student/rank.ts` (NEW) — pure `rankOptions(input, port)`, the `OptionDataPort` / `OptionData` types, `DEFAULT_FACT_KEY_MAP`, `MAX_RANK_OPTIONS = 25`. A ranked option is returned as ordered `claims[]` + `sources[]` + `profileFactsUsed[]` + `rankingProfile` (all already in TurnResponse) plus a detailed `options[]` breakdown. Ranked claims are `kind: number`, `status: attributed`; unrankable ones are `kind: fact`, `status: unverified`.
- `packages/engine/src/student/rank-weights.ts` (NEW) — default vector, `validateRankWeights`, `rankingProfileFor`.
- `packages/engine/src/index.ts` — ONE added line `export * from "./student/rank.js";` (rank.ts re-exports the weights API).
- `packages/engine/tests/rank.test.ts` (NEW, 33 tests), `packages/engine/tests/fixtures/ranking-profiles.json` (NEW, synthetic only).
- Nothing deleted or renamed. `apps/api/**`, `packages/db/**`, `packages/schemas/**`, `graph.ts`, `claims.ts`, `classify.ts`, `skills/vc-capabilities/SKILL.md` untouched.
- Database / network / provider: none. The function takes only the port and plain values.

CORE-REQUEST: apps/api/src/chat.ts when result.selectedTool === "rank_options" (after runStudentTurn, ~l.436-458), load confirmed facts (pathlynks + listProfileFacts status confirmed), call rankOptions, merge claims/sources/profileFactsUsed/rankingProfile into the response; owner: the U8 repair builder or a 10-line follow-up AFTER U8 merges. Never in parallel with the U8 repair.

## Verification scope
Policy-Version: proportional-verification/2026-10-17.14
Tier: M
Round: est 45 min — two new engine files, 8 criteria, 27 single-edit falsifications in a throwaway copy, plus the D-097 KB source check (lock waits dominate)
slow-plan: the round includes 8 criteria each with its own red/green evidence, a typecheck of every workspace (71 s under the shared lock) and the D-097 read-only KnowledgeBase source check; it cannot be split without a second manifest for one pure module.
mutant-cap-raise: the brief asks for one falsification per criterion; the criteria name several independent behaviours each (sign-in, fact status, fact source, label, precedence; six number-validity cases; four weight-validity cases), so 27 single-edit mutants ran in one lock hold; one extra pass was needed for the C7g survivor.
Base / checked state: base e2b805d, code 8f6a1a8, worktree clean except `qa/evidence/p1-u6b/` and this manifest
Affected tests / full-suite trigger: `packages/engine` only: `tests/rank.test.ts`, `tests/capability-manifest.test.ts` (A21(c) drift test), `tests/student-graph.test.ts`; `pnpm -r typecheck`. No whole-repo suite.
Tests[C1]: tests/rank.test.ts "C1 ..." (3) — a Germany/engineering and a Canada/business student ask about the same four options; same input twice, reversed and duplicated option list; weighted-sum arithmetic.
Tests[C2]: "C2 ..." (3) — every option cites KB source ids and facts; claims/sources/facts parse with `ClaimSchema`, `SourceSchema`, `ProfileFactSchema`, `TurnResponseSchema`; each fact listed once with its exact label.
Tests[C3]: "C3 ..." (2) — no weights set gives student-success and 0.40/0.25/0.20/0.15; the default vector or a multiple of it keeps the name.
Tests[C4]: "C4 ..." (3) — scholarship-heavy weights change the order and the name; fit weight 0 reports no facts used; with fit weight 0 two students rank alike.
Tests[C5]: "C5 ..." (2) — undefined / empty / blank student id refused; the port is not called.
Tests[C6]: "C6 ..." (7) — unconfirmed and unknown-source facts ignored and counted; only-proposed profile leaves everything insufficient; exact labels; student-confirmed beats Pathlynks on one key; erased fact stops moving the rank; corrected value re-ranks.
Tests[C7]: "C7 ..." (9) — missing cost, unknown option, unsourced / out-of-range / NaN numbers, zero-weight component, insufficient option whose id sorts first, tie by id (both input orders), a port that throws on any member but `get`, option cap and empty list.
Tests[C8]: "C8 ..." (5) — negative / NaN / Infinity / string / missing key / array / null / string config rejected; unknown key; all-zero; scaling reported; refusal carries no student data.
Pre-check[C1]: 8f6a1a8 bash scripts/vc-testlock.sh pnpm -C packages/engine exec tsx --test --test-name-pattern "^C1 " tests/rank.test.ts -> green: 3 passed, 0 failed t=12s
Pre-check[C2]: 8f6a1a8 same command with "^C2 " -> green: 3 passed, 0 failed t=10s
Pre-check[C3]: 8f6a1a8 same command with "^C3 " -> green: 2 passed, 0 failed t=8s
Pre-check[C4]: 8f6a1a8 same command with "^C4 " -> green: 3 passed, 0 failed t=8s
Pre-check[C5]: 8f6a1a8 same command with "^C5 " -> green: 2 passed, 0 failed t=7s
Pre-check[C6]: 8f6a1a8 same command with "^C6 " -> green: 7 passed, 0 failed t=8s
Pre-check[C7]: 8f6a1a8 same command with "^C7 " -> green: 9 passed, 0 failed t=6s
Pre-check[C8]: 8f6a1a8 same command with "^C8 " -> green: 5 passed, 0 failed t=7s
Pre-check[three files]: 8f6a1a8 bash scripts/vc-testlock.sh pnpm -C packages/engine exec tsx --test tests/rank.test.ts tests/capability-manifest.test.ts tests/student-graph.test.ts -> green: 98 passed, 0 failed t=14s
Pre-check[typecheck]: 8f6a1a8 bash scripts/vc-testlock.sh pnpm -r typecheck -> exit 0 (all workspaces) t=71s
Red first: `qa/evidence/p1-u6b/red-before-impl.txt` (rank.test.ts failed to import before the implementation existed).
Metrics: start=2026-10-18T23:45+05:30 end=2026-10-19T00:30+05:30 builder_min=unavailable wall_min=45 agent_min=unavailable blocked_min=unavailable suite_runs=0 repeat_runs=0 mutations=27 survivors_final=0 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-17.14 lane=normal check_s=unavailable mutants=27 defects_unit=unavailable defects_6c=0
(All runs went through the shared test lock; the first run in the session broke a stale lock. The brief asks for one falsification per criterion; the criteria name several behaviours each, so 27 single-edit mutants ran in one lock hold.)

## Capability coverage (each criterion -> falsifying edit, run in a throwaway copy of `packages/engine` (never the bound tree); runner and logs `qa/evidence/p1-u6b/falsify/`, summary `falsify-run.txt`)
Baseline of the same test file in the copy: 33/33. "after" is the run with exactly the stated edit(s).
| id | falsifying edit | before | after | first failing test |
|---|---|---|---|---|
| C1a | profile fit is a constant 0.5, so two profiles rank alike | 33/33 | 6 fail of 33 | C1 A16: a Germany/engineering student and a Canada/business student asking about the same |
| C1b | duplicate option ids are not collapsed | 33/33 | 1 fail of 33 | C1 A16: the same student, same options and same weights ranked twice |
| C2a | no KB source id is cited | 33/33 | 2 fail of 33 | C2 A16: every ranked option names its KB source ids and the profile facts |
| C2b | facts that moved the score are not reported | 33/33 | 6 fail of 33 | C2 A16: every ranked option names its KB source ids and the profile facts |
| C3a | default fit weight 0.5 instead of 0.4 | 33/33 | 3 fail of 33 | C1 A16: scores are the weighted sum of the four components |
| C3b | default vector no longer named student-success | 33/33 | 2 fail of 33 | C3 P-8: a student who sets no weights is ranked with 0.40 / 0.25 / 0.20 / 0.15 |
| C4a | a supplied weight config is ignored | 33/33 | 5 fail of 33 | C4 D-086 Q3: a tenant that weights scholarship chance at 0.8 |
| C4b | rankingProfile is always student-success | 33/33 | 1 fail of 33 | C4 D-086 Q3: a tenant that weights scholarship chance at 0.8 |
| C4c | facts reported as used even at fit weight 0 | 33/33 | 1 fail of 33 | C4 D-086 Q3: a fit weight of zero means the profile facts moved nothing |
| C5a | the sign-in check is removed | 33/33 | 2 fail of 33 | C5 B24.8: a request with no authenticated student gets no ranking |
| C5b | a blank student id counts as authenticated | 33/33 | 1 fail of 33 | C5 B24.8: a request with no authenticated student gets no ranking |
| C5c | the data port is asked before the sign-in check | 33/33 | 1 fail of 33 | C5 B24.8: the refusal happens before the option-data port is asked anything |
| C6a | a proposed (unconfirmed) fact enters the ranking | 33/33 | 1 fail of 33 | C6 A16b: a fact the student has not confirmed |
| C6b | a fact with any source label enters the ranking | 33/33 | 1 fail of 33 | C6 A16b: a fact with an unknown source label is ignored and counted |
| C6c | a Pathlynks value beats the student's confirmed value | 33/33 | 1 fail of 33 | C6 A16b: when Pathlynks and the student give different values for one key |
| C6d | every fact is relabelled student-confirmed | 33/33 | 4 fail of 33 | C2 A16: the top-level profileFactsUsed lists each fact once, with the exact source label |
| C7a | an option with a missing number is ranked anyway | 33/33 | 6 fail of 33 | C6 A16b: a student who has only proposed facts |
| C7b | a number with no resolvable source is accepted | 33/33 | 1 fail of 33 | C7 B24.8: a number with no cited source, outside 0..1 or not finite |
| C7c | an out-of-range number is accepted | 33/33 | 1 fail of 33 | C7 B24.8: a number with no cited source, outside 0..1 or not finite |
| C7d | ties are not broken by option id | 33/33 | 2 fail of 33 | C7 B24.8: tied scores break by option id |
| C7e | a missing component with zero weight still blocks ranking | 33/33 | 1 fail of 33 | C7 B24.8: a component whose weight is zero does not block ranking |
| C7f | the option cap is not enforced | 33/33 | 1 fail of 33 | C7 B24.8: more options than the cap, or none, is refused |
| C7g | insufficient options are listed before the ranked ones | 33/33 | 4 fail of 33 | C7 B24.8: an option whose cost the data port does not have is marked insufficient_data, listed last |
| C8a | a negative weight is accepted | 33/33 | 2 fail of 33 | C8 D-086 Q3: a weight vector with a negative, NaN, Infinity |
| C8b | an unknown weight key is accepted | 33/33 | 1 fail of 33 | C8 D-086 Q3: an unknown weight key |
| C8c | an all-zero vector is accepted | 33/33 | 1 fail of 33 | C8 D-086 Q3: an all-zero vector is rejected |
| C8d | a vector not summing to 1 is not scaled | 33/33 | 2 fail of 33 | C3 P-8: explicitly passing the default vector, or a multiple of it |

Survivors: 0 of 27. An earlier pass left one survivor (C7g, when "insufficient last" was decided by a sort comparator): it was an equivalent mutant under V8 insertion sort for arrays under 64 items, so the code was restructured into two separately sorted groups that are concatenated (so "insufficient last" is structural), a test with an insufficient option whose id sorts first was added, and the whole table was re-run at the committed code.

## Live browser evidence
Not applicable, no UI. The changed paths are `packages/engine/src/student/*.ts`, `packages/engine/src/index.ts`, `packages/engine/tests/**` and `qa/`.

## KnowledgeBase source check (D-097 item 3) — NOT PROVEN
Evidence: `qa/evidence/p1-u6b/kb-source-check.md`. Read-only check of https://github.com/vidysea-admin/KnowledgeBase (local clone `D:/KnowledgeBase`, remote `origin/master` tree and all 47 `schema/*.json`, `apps/api/src/knowledge/catalog-router.ts`, `packages/core/src/generated/programs.ts`) and `mcp/university-kb/src/index.ts:54-63`:
- No structured cost, scholarship or visa field exists. `schema/programs.schema.json` is webinar cohorts (`name, orgRef, sessionRefs`); the only cost fields are LLM and job spend (`schema/answer_runs.schema.json` `costUsd`, `schema/jobs.schema.json` `maxCost`/`costUsd`); `schema/claims.schema.json` claims are free text (e.g. `data/toc-migrated/2026-05-22-uniaccess-xavier-university/claims.json`); `CourseDocSchema` has `courseId, universityId, name, country, level, sourceUrl, fetchedAt`.
- So no adapter was written. `OptionDataPort` stays typed and fixture-backed; the real source for cost / scholarshipChance / visaEase and for option attributes is NOT PROVEN until Umesh names a structured source (a new typed KB collection, or another system). Pulling numbers out of transcript prose would be an LLM route, which B24.8 rules out.
- Not read: unmerged `codex/*`, `lane/*`, `wave/*` branches of the KB remote.

## Not done / stated limits (for the checker)
- **Fixture data only.** Every number in `ranking-profiles.json` is invented. The adapter that fills `OptionDataPort` from a real source does not exist (see above).
- **[ASSUMPTION, Q-U6b-2]** the option list comes from the caller (not decided: a confirmed `shortlist` fact, the question text, or Pathlynks) and the fact keys that feed "fit" are the synthetic `DEFAULT_FACT_KEY_MAP` (`target-country`, `field-of-study`, `study-level` against option attributes `country`, `field`, `level`), configurable per call. Fit is the share of matching facts among those the option has an attribute for; no usable fact means fit is missing and every option is `insufficient_data` (not ranked on a guess).
- **[ASSUMPTION]** a confirmed student value beats a Pathlynks value for the same key. A weight of 0 on a component means missing data in that component does not block ranking. Values compare as trimmed, case-folded text, so "Germany" equals "germany" but "DE" does not.
- **Not wired.** Nothing calls `rankOptions` yet; the API hook is the CORE-REQUEST line above. The `claims` it returns have not passed the claims guard (`claims.ts`), which is the API layer's call.
- Weight config source (tenant config, request) is not decided; `rankOptions` takes it as an argument.
- The default vector is a placeholder (P-8), not a validated product claim.
- No `senior-software-engineer` / `ai-engineer` review dispatched (brief: dispatch no checker; the orchestrator owns it).

## How to verify (commands + expected)
- `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh pnpm -C <worktree>/packages/engine exec tsx --test tests/rank.test.ts tests/capability-manifest.test.ts tests/student-graph.test.ts` -> tests 98, pass 98, fail 0.
- `bash D:/vc/scripts/vc-testlock.sh pnpm -C <worktree> -r typecheck` -> exit 0.
- Per criterion: the Pre-check lines (`--test-name-pattern "^C<n> "`).
- Evidence: `qa/evidence/p1-u6b/` (`precheck-*.txt`, `final-*.txt`, `red-before-impl.txt`, `falsify/`, `kb-source-check.md`).
