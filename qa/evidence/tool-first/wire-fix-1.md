# wire-fix-1 evidence (D-134)

Brief: qa/.delivery/briefs/wire-fix-1.md. Worktree D:\vc\.worktrees\vc-completion. No commits, no restarts, no secret values read or printed, no browser.

## 1. Career Quest live wiring
| Item | Where |
|---|---|
| Source kind `mongo` (strict; database, collections list, `urlRef` only `MONGODB_URL`; no host/URL/secret field) | packages/schemas/src/sources.ts:85 (`MongoSourceConfig`), :98 (union), :121 (`mongoSourceForTenant`) |
| `pathlynks-journey` source (database `pathlynks_journey`, the 4 quest collections) | config/sources.json:127 |
| Exact source set pinned (kind:id, 9 entries) in both count tests | packages/schemas/tests/sources.test.ts:60; apps/api/tests/admin-routes.test.ts:620 |
| Read-only opener: find / aggregate / countDocuments only, `readPreference: secondaryPreferred` forced, `$out`/`$merge` refused, toArray-only cursor, allow-list `["pathlynks_journey"]`, optional collection allow-list | packages/db/src/client.ts:137 (`openReadOnlyDb`), :171 (`openPathlynksJourney`); tests packages/db/tests/client.test.ts:193-256 |
| Composition: `questDbOpenerFor(client, sourcesFile, siteId)` returns undefined unless one enabled pathlynks mongo source whose database is on the allow-list; passed as `questDb` to `createLivePathlynksPort` | apps/api/src/index.ts:122, :893; test apps/api/tests/chat-pathlynks.test.ts:402 |
| Quest types re-exported | mcp/pathlynks/src/index.ts (`createQuestReader`, `QUEST_*`, `QuestDbLike`, `QuestCollectionLike`, `QuestCursorLike`, `QuestReader`, `QuestCollectionName`) |
| Mongo is config-only in the console: seeding skips it, `sources.create` returns 400 | apps/api/src/admin-routes.ts (seedSourcesFromConfig, sources.create); test admin-routes.test.ts:630 |

B12 holds: `.db(` appears only in packages/db/src/client.ts (db-scope.test.ts green; a comment in index.ts that contained the text was reworded). The owner filter `{studentId}`, maxTimeMS 3000, limit and stage screening stay in `createQuestReader` (mcp/pathlynks/src/port.ts:262), untouched.

## 2. Voice tools
`createQuestVoiceTools` (apps/api/src/index.ts:130) declares and runs vidysea_journey_maps, vidysea_applications, vidysea_visa, vidysea_favourites, vidysea_saved_scholarships, vidysea_progress, pathlynks_quest_progress, pathlynks_goals, pathlynks_year_plan. No arguments (no identity argument); each runs the same `runStudentTurn` graph with a fixed prompt that the classifier routes to exactly that tool. Test: apps/api/tests/voice-wiring.test.ts:629 (identity arg or foreign tenant reads nothing; Vidysea tenant calling a quest tool gets the plain outage line; shareToken never in output).

## 3. GitHub sync
- `shouldKeepLastGood` (from @vc/engine) applied in the frontend sync (hub/nav missing, >30% tools shrink, skipped hub file) and the Vidysea backend sync (>30% tables shrink, skipped model/router file): apps/api/src/admin-routes.ts:816, :870. A kept sync reports an error and writes nothing.
- `listTree` returns commit sha and tree sha (a branch that moved between the two calls is re-read); every artifact stores `data.source` (owner, repo, branch, commit, treeSha); `kg.source` carries them too: admin-routes.ts:725-737; tests admin-sync.test.ts:767, :786, :837, :846, :856, :881.
- Coordinator addition: backend sync fetches `app/services/*.py` (`BACKEND_SERVICE_GLOBS`) and passes `serviceFiles` to `buildBackendKg` (admin-routes.ts:847), 2 MiB cap and the time limits kept; counts `services` and `skippedServices`. Test admin-sync.test.ts:891 (service-written seeded edge verified).

## 4. .env.example
No new key names: the quest source reuses `MONGODB_URL`, already present (.env.example:4). Nothing added.

## Commands and results (from D:\vc\.worktrees\vc-completion; `node --import tsx --test`)
| Command | Result |
|---|---|
| packages/schemas: `tests/*.test.ts` | 129 pass / 0 fail |
| packages/db: `tests/client.test.ts tests/db-scope.test.ts tests/db-init.test.ts` | 88 tests; after the comment fix db-scope 11/11; the other 77 passed |
| mcp/pathlynks: `tests/*.test.ts` | 82 tests, 81 pass, 0 fail, 1 skipped |
| apps/api: `admin-sync admin-routes admin-secrets-leak chat-pathlynks voice*.test.ts main index` | 314 tests, 313 pass, 1 fail (voice.test.ts C16, see below) |
| `tsc --noEmit` in schemas, db, mcp/pathlynks, apps/api | clean (no output) |

Known flake: apps/api/tests/voice.test.ts "C16: the supersede loop's second pass..." (line ~1505) fails intermittently. Run alone twice back to back: 67/67 pass, then 66 pass / 1 fail. It is a timing race in the voice session slot logic, in code this task did not touch (only `createQuestVoiceTools` prompts in index.ts changed); not caused by the wiring, but a checker should rerun it.

## Notes
- TDD: the schemas, db, sync, voice and admin-routes tests were written red first. The `questDbOpenerFor` test was written after its helper (index.ts edit batched with the mcp re-export); it was then verified green and mutation-sensitive by its foreign-database, disabled and wrong-tenant cases.
- Review still owed: senior-software-engineer (all of it), data-engineer (sync keep-last-good and provenance), per lifecycle.md. The writer does not review itself.
- Outside my edit list and untouched: packages/engine/src/**, mcp/pathlynks/src/port.ts, admin store `SOURCE_KINDS`.
