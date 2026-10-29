# pl-mongo-reader (D-134): Career Quest read-only reader, evidence

Date: 2026-10-29. Lane: `pl-mongo-reader`. Counts and key names only; no secret value and no student row appears below.

## Step 0: credentials and counts (probe, key names only)

- VC's `MONGODB_URL` (host hash 9f1a09f7, not SRV) can `listDatabases`: `pathlynks_journey` is present (148 collections on the server).
- Collection estimates in `pathlynks_journey`: `pathlynks_quest_profiles` 5341, `pathlynks_goals` 106, `pathlynks_activities` 1055, `pathlynks_skill_activities` 0.
- The test student has 1 quest profile, 0 goals, 0 activities (so zero-row guidance is the live case for them).
- Profile top-level keys exist as the inventory said (`studentId`, `gradeLabel`, `board`, `avatarState`, `islandStates`, ...). Owner field is `studentId` (string = Postgres `users.id`).
- Note: `MONGODB_NAME_ROADMAP` is `pathlynks_demo` (empty); the reader uses the literal `pathlynks_journey`.

## Step 1: G2 (`save_type`) red then green

- `mcp/pathlynks/src/port.ts` saved-careers join now `... ON sc.id = co.id AND sc.save_type = 'CAREER'` (live values: CAREER, CATEGORY, SUBCATEGORY).
- Red: the two new G2 tests failed before the SQL edit (a CATEGORY row for stu-A was returned as a saved career). Green after.
- Fixtures corrected, not the filter: `mcp/pathlynks/tests/fakes.ts` (rows carry `save_type`), `apps/api/tests/chat-pathlynks.test.ts:220` (`save_type: "CAREER"`), and the "exposes exactly the named read methods" list in `mcp/pathlynks/tests/port.test.ts`.

## Step 2: reader (`mcp/pathlynks/src/port.ts`)

- `createQuestReader` (frozen; find / aggregate / count only), `QUEST_COLLECTIONS` closed list, `maxTimeMS` 3000, `readPreference` secondaryPreferred, limit 51, owner filter `{studentId}` spread last, aggregation stages screened.
- `getQuestProfile`, `getQuestGoals`, `getQuestPlan` on the port. A Mongo failure is `{ok:false, reason:"unavailable", cause}`, never zero rows. No opener configured is `not_configured`.
- Projections are allow-lists; reflection, description, proof_*, shareToken, factualAnswers, persona graph and AI session content are never requested or mapped. Mutation check: adding `shareToken` to the projection and mapping failed 2 tests; restored.
- Live smoke through the real port (shapes only):
  - test student: `getQuestProfile` ok, 1 row, keys gradeLabel/board/level/xp/island*(4)/picksCount; goals 0 rows; plan 0 rows.
  - a student with data (id not printed): profile keys incl. selectedCareer, picksCount, targetUniversity; goals 2 rows keys title/status; plan 1 row keys planTitle...skillActivities.

## Step 3: engine wiring

- `packages/engine/src/student/classify.ts`: three intents, English + Hinglish + Devanagari (goals), each needs "my"; KB asks ("what is career quest", "how do I set a goal", "what is a year plan") stay with the KB; none of `NEAR_MISS_KB_QUESTIONS` is stolen; linear on hostile input.
- `packages/engine/src/student/graph.ts`: optional engine port methods, `PATHLYNKS_ALLOWED_COLUMNS` entries, `STUDENT_TOOLS` entries, deterministic messages (`questProgressMessage`, `questGoalsMessage`, `questPlanMessage`), zero rows = "nothing yet" plus the `navigate.ts` recipe guidance (relative path, only when the page is in the catalogue), an outage / throw / hang / absent method = the single "can't see your Pathlynks data right now" line, Vidysea tenant = "Career Quest is part of Pathlynks".
- `packages/engine/src/tools/navigate.ts`: `TASK_RECIPES` gains the Career Quest profile-building and hub recipes (not in `INTENT_RULES`). `NAV_TASK_RECIPE_VERSION` is NOT bumped: `apps/api/tests/chat-profile.test.ts`, `packages/db/tests/erasure.test.ts` and `packages/schemas/tests/student-api.test.ts` pin it and `skills/vc-navigation/SKILL.md` quotes it (outside this lane).
- `skills/vc-capabilities/SKILL.md`: 3 tool rows + 3 executedBy rows (drift test green).
- `apps/api/src/admin-routes.ts`: `adaptPathlynksPort(p, withQuest)`, `mcpPortFor(... questDb)`, `createLivePathlynksPort(... questDb)`; the quest methods exist on the live engine port only when an opener is supplied.
- Coordinator item 3 (senior review): with no `deps.vidysea`, the six `vidysea_*` tools fall back to `answerFromKb`; `vidysea_progress` ("what next", "how am I doing") goes to `pathlynks_quest_progress` when the port has `getQuestProfile`. Test: "senior review: with no Vidysea port ...".

## Commands and results (run from the worktree)

| Command | Result |
|---|---|
| `cd mcp/pathlynks && npx tsx --test tests/*.test.ts` | tests 81, pass 80, fail 0, skipped 1 |
| `cd packages/engine && npx tsx --test tests/pathlynks-tools.test.ts tests/capability-manifest.test.ts tests/navigate.test.ts tests/student-classify.test.ts tests/student-graph.test.ts` | tests 222, pass 222, fail 0 (red run before the edit: 8 of the new tests failed) |
| `cd apps/api && npx tsx --test tests/chat-pathlynks.test.ts tests/admin-sync.test.ts tests/admin-routes.test.ts` | 141 tests: 1 fail, pre-existing (`admin-routes.test.ts:620` expects 5 seeded sources, `config/sources.json` now has 6 incl. `vidysea-frontend`); the new D-134 admin-sync test passes (admin-sync alone: 41/41) |
| `cd packages/schemas && npx tsx --test tests/sources.test.ts` | 18 pass, 1 fail, pre-existing (`sources.test.ts:57`, same 6 !== 5 cause) |
| `npx tsc --noEmit` in `mcp/pathlynks`, `packages/engine` (+ `-p evals/tsconfig.json`), `packages/schemas`, `apps/api` | clean, no output |

## Blockers and asks outside this lane (not done, by rule)

1. `config/sources.json` `pathlynks-journey` source: `packages/schemas/src/sources.ts` has only `github` and `postgres` kinds (strict zod). Proposed target: add `kind: "mongo"` there (existing file), then the source entry. Not added.
2. The live opener: B12 allows `client.db(` only in `packages/db/src/client.ts`. Proposed: export a read-only `openPathlynksJourney()` (db `pathlynks_journey`, collection facade) there and pass it as `questDb` where `createLivePathlynksPort` is built in `apps/api/src/index.ts`. Until then live quest reads are `not_configured`, the engine port has no quest methods, and generic asks fall back to the KB.
3. `mcp/pathlynks/src/index.ts` does not re-export the quest types (not editable here).
4. Not applied: a Mongo-side deleted/disabled-user check (the owner predicate in Postgres joins `users`; the Mongo reader trusts the verified `studentId`).
5. Pre-existing red tests unrelated to this change: the two `6 !== 5` source-count assertions above.
