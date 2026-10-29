# kg-fix-1: T8 knowledge-graph fix round 1 (maker evidence, not a checker verdict)

Brief: `qa/.delivery/briefs/kg-fix-1.md`. Scope: `packages/engine/src/ingest/**` and `packages/engine/tests/ingest-*.test.ts`. No commit, no push, no Mongo write, no browser. Counts and names only; no secret value or student row appears here.

## 1. ReDoS (senior finding 1)

| Item | Where | Change |
|---|---|---|
| COLUMN_STMT (cubic on whitespace) | `migrations.ts` `matchColumnStmt` (replaces the regex), used in `parseSqlalchemyModels` | Linear matcher: anchored head regex, annotation = text between the first `:` and the first `=` (indexOf), anchored tail regex. Lines over 2000 chars are skipped with a `line_too_long` diagnostic (never silent). |
| ROUTER_PREFIX (quadratic on repeated `APIRouter(`) | `migrations.ts` `routerPrefix` | indexOf per `APIRouter(` start (max 50), each read through a 600-char window with bounded quantifiers. |
| Call scan on hostile long lines | `parseRouterWrites` | lines over 2000 chars ignored in the handler scan. |

Red then green (hostile tests `ingest-migrations.test.ts`, "kg-fix-1: a 6000-space annotation line..." and "...hostile ROUTER_PREFIX inputs..."):
- Before: COLUMN_STMT test did not finish (killed by `timeout 60`); ROUTER_PREFIX test failed with `took 1911.9 ms` (limit 50 ms).
- After: both pass, 0.4 ms and 0.9 ms (limit 50 ms). A multi-line `APIRouter(\n tags=..., prefix="/p")` still yields `/p/x`; odd spacing (`a   :   Mapped[int]   =   mapped_column(...)`, `b:Mapped[str]=sa.Column(...)`) still parses; `c == Column(` and `d: = Column(` stay non-columns.

## 2. Edge verification (data finding 3)

`ToolTableEdge` (types.ts) gains `verifiedBy: "router" | "model" | "service" | "none"`, `reason?`, `via?`. `writerFound` is kept (true iff verifiedBy is not "none") so the stored shape and `admin-sync.test.ts` stay compatible; `joinProductKg` reads `verifiedBy` and falls back to `writerFound` for artifacts stored before this fix, and now returns `verifiedBy` on each `writes` entry.

`buildBackendKg(modelFiles, routerFiles, { ..., serviceFiles? })` (`migrations.ts` `verifyEdge`, `writesTable`, `serviceImports`):
1. router: a handler in the cited router file writes the model (or, new, writes it through an import alias such as `StudentGoal as _Goal`; or a non-handler helper in the same router file writes it);
2. model: the cited file is the parsed model file that defines the table;
3. service: a bounded line scan of the cited service file, or of an `app.services.*` module the cited router/file imports (`via` names it), finds `Model(`, `insert|update|delete(Model`, `query(Model)...update|delete(`, or raw `INSERT INTO|UPDATE|DELETE FROM <table>` (alias-aware);
4. else `none` with a reason: `table_not_in_models`, `table_defined_elsewhere`, `seed_file_not_read`, `service_not_read` (an imported service was not supplied), `no_write_in_seed_file`.

False negative `shortlist_router.py:50 -> student_shortlisted_courses`: root cause was that the handler `add_to_shortlist` delegates to `StudentShortlistService.add_to_shortlist(...)` (imported from `app/services/student_shortlist_service.py`), so the router file itself never constructs the model. Now verified `service` via that file. A second, bigger cause surfaced in the live recount: `app/api/v1/student/router.py` imports models under aliases (`StudentGoal as _Goal`), so 12 edges looked unwritten; alias handling fixed them.

Needed from the sync lane (not touched here, `admin-routes.ts` is theirs): fetch `app/services/*.py` (257 files, 0 skipped in the recount) and pass it as `serviceFiles`. Without it service edges stay `none` with `service_not_read` / `seed_file_not_read`.

### Before and after, verified counts (59 seeded edges, all 59 `tableFound`)

Recount ran the real `fetchRepoFiles` + `buildBackendKg` on the live `vidysea-main-service-backend@prod` (read-only GitHub GETs; 146 model files, 28 router files, 257 service files, 0 skipped). The stored `schema_map` in Mongo `virtual_counsellor.source_artifacts` (read-only) was read first: `writers` held no entry for `shortlist_router.py`, and `edgesWriterFound` was 17.

| Logic | verified | by router | by model | by service | none |
|---|---|---|---|---|---|
| Before (stored artifact, T8) | 17 | 17 | n/a | n/a | 42 |
| After, no service files supplied | 49 | 33 | 16 | 0 | 10 |
| After, service files supplied | 56 | 33 | 16 | 7 | 3 |

How to read it: `router` + `service` (40 edges) are verified by a write found in code. `model` (16 edges) only confirms the cited file is the model that defines the table (the seed cites the model, not a writer), so a consumer that needs "a code path writes this" should count `router` and `service` only. Remaining 3 `none`, each with a reason:
- `section:shortlisted -> audit_logs` `no_write_in_seed_file` (written through the `record_change` helper, no model call in the scanned files)
- `section:applications -> student_shortlisted_courses` `no_write_in_seed_file` (`applications/router.py:142` flips a column on an existing row, no construct/insert)
- `section:schpipeline -> saved_scholarships` `service_not_read` (imports a module outside the supplied `app/services/*.py` set)

Shortlist edge after: `verifiedBy: "service"`, `via: "app/services/student_shortlist_service.py"`.

## 3. Keep-last-good helper

`routes.ts`: exported pure `shouldKeepLastGood(prev, next, { skipped?, maxShrink? }) -> { keep, reasons[] }` plus `KG_MAX_SHRINK = 0.3`, types `KgShape`, `KeepLastGood`; re-exported from `ingest/index.ts` (and so from `@vc/engine`). `prev`/`next` are any object with `tools` (array) and/or `tables` (record or array) and optional `skipped`, so a stored `FrontendKg` / `BackendKg` can be passed directly. Reasons: `no_graph`, `empty_graph`, `tools_shrank`, `tables_shrank` (strictly more than 30%), `skipped_files`. With no `prev`, only a missing/empty graph is kept out (nothing exists to keep for skipped files).

## Commands and results

```
cd packages/engine && npx tsx --test tests/ingest-routes.test.ts tests/ingest-migrations.test.ts
  ℹ tests 62 / ℹ pass 62 / ℹ fail 0
cd packages/engine && npx tsc --noEmit -p .        -> exit 0
```
(Before this round the two files were 48/48; 14 tests were added: 4 ReDoS/limits, 5 edge-verification, 2 alias, 2 keep-last-good, 1 join/legacy fallback.)

Recount script: scratchpad `recount.mts` (run from the repo root with `node --env-file=.env --import tsx`, copied temporarily to the repo root and deleted after); output `recount.json` in the session scratchpad.

## Not done / follow-ups
- `apps/api` was not re-typechecked or re-tested (not touched; engine tsc is clean and the `writerFound` field is unchanged in meaning for callers).
- Review is still owed by `senior-software-engineer` and `data-engineer` (helper agents were not allowed for this lane).
- The per-tool (not per-file) granularity of verification noted in the data review is unchanged.
