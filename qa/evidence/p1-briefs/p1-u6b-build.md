# P1 U6b profile ranking (slug p1-u6b-profile-ranking), tier M, no dual check
Follow D:/vc/qa/evidence/p1-briefs/p1-w3-common.md first (S = the scratchpad path defined there). Policy proportional-verification/2026-10-17.14. Mock only, no network, no paid call.

**Setup**
- Worktree S/p1-u6b, new branch p1/u6b, base = branch p1/u8 (head e2b805d; it holds `ProfileFact`/`PROFILE_FACT_SOURCES` in packages/schemas and `listProfileFacts` in packages/db). `git worktree add S/p1-u6b -b p1/u6b p1/u8`. Do NOT merge main (nothing here needs U4).
- Integration order: U8 (and its M1/M2 repair) merges first; this branch merges after it.

**Contract (verbatim, spec v8 sha e183ee9a, qa/evidence/p1-plan-draft-20261017/spec.md)**
- **A16** Same question + two synthetic profiles gives different deterministic rankings; each option cites a KB source and the profile fact used; with default weights the response reports `rankingProfile: student-success`; changing the weight config changes the ranking deterministically and is reported; unauthenticated = no ranking. MOCK, `pnpm --filter @vc/engine test`.
- **A16b (engine part)** a Pathlynks-supplied fact is used and labelled `source: pathlynks`; a chat-extracted fact is proposed back to the student and used only after `confirm`, labelled `student-confirmed`; an unconfirmed fact never reaches ranking or `profileFactsUsed[]`; a student can correct or erase a fact. (The api and db parts of A16b belong to U8; you prove only the ranking side.)
- **B24.8** (contract): two fact sources only; ranking uses configurable weights, default goal student success, reported as `rankingProfile`; numbers come from KB data, not the LLM; an unauthenticated request gets no ranking.
- Gate answers: D-086 Q3 (configurable weights, default = student success); D-087 Q15 (both fact sources); `qa/gates/p1-u0-amendment-signatures.md` Answered 2026-10-17T14:11:30+05:30 P-8: default vector over fit / cost / scholarship chance / visa ease = 0.40 / 0.25 / 0.20 / 0.15, a configurable placeholder, `rankingProfile: student-success`; D-093 4A/6A (nothing here persists anything).

**Criteria to split into the manifest (C1..C8)**
- C1 two synthetic profiles (ids `syn-...`) + same options give different, deterministic orders (run twice, identical).
- C2 every ranked option carries its KB `sourceId`s and the `profileFactsUsed` entries that moved its score.
- C3 default weights => `rankingProfile: "student-success"` and the vector above.
- C4 a changed weight vector changes the order deterministically and the reported profile name differs (ASSUMPTION: `custom` + short hash, within the 64-char schema limit; record it).
- C5 no authenticated student => no ranking (the function refuses; anonymous graph path already returns sign_in_required).
- C6 A16b engine side: only `pathlynks` and confirmed facts enter; a `proposed` chat fact never changes any score or `profileFactsUsed`; labels are exact.
- C7 numbers come only from the option-data port: a missing number leaves that option marked `insufficient_data` and last (never guessed, never from a provider); ties break by option id.
- C8 weight validation: non-negative, finite, sum to 1 (or normalise and say so), unknown keys rejected, a zero vector rejected.

**Files you OWN (create/edit)**
1. packages/engine/src/student/rank.ts (new): pure `rankOptions(...)` + the `OptionDataPort` type (per-option fit / cost / scholarshipChance / visaEase values, each with a KB sourceId).
2. packages/engine/src/student/rank-weights.ts (new): default vector, validation, `rankingProfile` naming.
3. packages/engine/src/index.ts: ONE added line, `export * from "./student/rank.js";` (U11 does not touch this file).
4. packages/engine/tests/rank.test.ts (new) and packages/engine/tests/fixtures/ranking-profiles.json (new, synthetic only).
5. qa/manifests/p1-u6b-profile-ranking.md, qa/evidence/p1-u6b/**.
No schema change: a ranked option is returned as ordered `claims[]` + `sources[]` + `profileFactsUsed[]` + `rankingProfile` (all already in TurnResponse). If you find that is not enough, write a CORE-REQUEST for packages/schemas (U8 owns it); do not edit it.

**Must NOT touch**
- apps/api/** entirely, above all apps/api/src/chat.ts (the U8 repair owns M1 at chat.ts:401-413 and M2 at chat.ts:390-393, 412-428; the rank hook point is the result handling right after `runStudentTurn` at chat.ts:436-458, in the same function, so do not go near it).
- packages/db/**, packages/schemas/**, packages/engine/src/student/graph.ts, claims.ts, classify.ts (U6 files), skills/vc-capabilities/SKILL.md (already lists `rank_options`; the A21(c) drift test must stay green).
- Emit exactly this line in the manifest: `CORE-REQUEST: apps/api/src/chat.ts when result.selectedTool === "rank_options" (after runStudentTurn, ~l.436-458), load confirmed facts (pathlynks + listProfileFacts status confirmed), call rankOptions, merge claims/sources/profileFactsUsed/rankingProfile into the response; owner: the U8 repair builder or a 10-line follow-up AFTER U8 merges. Never in parallel with the U8 repair.`

**Tests (TDD: failing test first; falsification floor = one per criterion, in a throwaway copy)**
- `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh pnpm -C S/p1-u6b/packages/engine exec tsx --test tests/rank.test.ts tests/capability-manifest.test.ts tests/student-graph.test.ts`
- `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh pnpm -C S/p1-u6b -r typecheck`
- No whole-repo suite. Long lock waits are normal: wait.

**HUMAN_GATE (list only, do not invent answers)**
- Q-U6b-1: where do the per-option numbers come from? B24.8 says "numbers come from KB data", but the KB `/search` and `/ask` return counselling-session turn text, and `CourseDoc` in mcp/university-kb has no cost, scholarship or visa field. No structured source exists today. Build against the typed `OptionDataPort` with fixtures and say in the manifest that a real adapter is NOT PROVEN until Umesh names the source.
- Q-U6b-2: where does the option list come from (a student-confirmed `shortlist` fact, the question text, or Pathlynks)? And which profile fact keys feed "fit"? Use a configurable key map with synthetic defaults and mark both [ASSUMPTION].

**Finish**
- Manifest per p1-w3-common.md (Pre-check line per C1..C8, Capability coverage table, Live browser section = "not applicable, no UI", Metrics, `Round: est <n> min`, the CORE-REQUEST line). Lint: `node D:/ai_os/.claude/skills/maker/tools/tick.mjs --lint-manifest qa/manifests/p1-u6b-profile-ranking.md` exit 0. Commit with narrow pathspecs (never `git add -A`). Do not push, merge or dispatch a checker. ONE-line return: `p1-u6b-profile-ranking <sha> ready` or `... blocked <reason>`.
