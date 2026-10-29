# tf-fix-2 evidence

Brief: qa/.delivery/briefs/tf-fix-2.md. Worktree D:\vc\.worktrees\vc-completion. No commits, no restarts, no browser, no secret values read or printed. Each item was run red first, then green.

## 1. [high] openReadOnlyDb allow-lists caller options (packages/db/src/client.ts)
- find: maxTimeMS, projection, sort, limit, skip, hint. aggregate: maxTimeMS, allowDiskUse. countDocuments: maxTimeMS, limit, skip. readPreference is always forced to secondaryPreferred. Own keys of a plain object only (null, array, inherited keys are ignored). The `$out`/`$merge` stage screen is unchanged.
- Tests (packages/db/tests/client.test.ts, tf-fix-2 block): a recording fake driver proves out, merge, writeConcern, bypassDocumentValidation, session, readConcern, comment, let, explain and `$out` never reach the driver on any of the three methods; each method keeps exactly its allow-list; hostile option containers; stage screen still refuses. Red: 3 of 4 failed before the fix.

## 2. [medium] verified means a write was found (ingest/migrations.ts, routes.ts, types.ts)
- writerFound and joinProductKg `verified` are true only for verifiedBy router or service. A model-only edge keeps verifiedBy "model", gets verified=false, and a separate definedInModel=true (new field on ToolTableEdge and on the joined writes).
- Recount (from the kg-fix-1 live recount, not re-run live): router 33 + service 7 = 40 verified of 59; model 16 (definedInModel); none 3. The earlier 56 counted the 16 model edges.
- Tests: ingest-migrations (edge kinds, honest count), ingest-routes (join: model is verified=false, definedInModel=true; legacy artifact fallback unchanged). Red: 4 tests failed with the old logic.

## 3. [medium] stacked-decorator scan is linear (ingest/migrations.ts parseRouterWrites)
- The next def line is computed once, backwards (`nextDef`), and a handler's touched-table set is cached per def.
- Hostile test: 100k stacked decorators under 500 ms (was 77 s in the red run); 30k decorators over a 5k-line body also under 500 ms, and every stacked decorator still maps to its handler.

## 4. [medium] super-admin keep-last-good override (apps/api/src/admin-routes.ts)
- POST sources/:id/sync accepts `acceptShrink` (strict boolean; non-boolean gives 400). `true` from a non-super-admin gives 403 (audited by the route, nothing written). Without it, behaviour is unchanged.
- With it, only tools_shrank, tables_shrank and skipped_files are accepted; empty graph, missing hub, no model files or no tables are never overridable. An audit row `sources.sync.accept_shrink` is written BEFORE the artifact, with source id, reasons and before->after counts; if that row cannot be written the stored graph is kept.
- skippedServices now counts in the backend skipped gate (skipped: skippedPy + skippedServices); the first sync is still not blocked.
- Tests: apps/api/tests/admin-sync.test.ts, four tf-fix-2 tests. Red: all 4 failed before.

## Commands and results
| Command (cwd) | Result |
|---|---|
| `npx tsx --test tests/client.test.ts tests/db-scope.test.ts` (packages/db) | 66 pass, 0 fail |
| `npx tsx --test tests/ingest-*.test.ts` (packages/engine) | 76 pass, 0 fail |
| `npx tsx --test tests/admin-sync.test.ts tests/admin-routes.test.ts` (apps/api) | 139 pass, 0 fail |
| `npx tsc --noEmit` in packages/db, packages/engine (plus evals and scripts tsconfigs), apps/api | clean |
