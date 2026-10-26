# vca-ingest - Sequelize migrations parser, Next app routes parser, fake-port repo fetch

Feature: vc-admin-control, unit ingest. Policy-Version: proportional-verification/2026-10-19.17. Tier: M (new module).
Worktree D:/vc/.worktrees/vca-ingest, branch wave/vca-ingest, base 9cc4c73. Code commit: b8d92b5.
Criteria owned (qa/contracts/vc-admin-control.md @1283b23): VA10, VA11, and the parser/fetch side of VA8/VA9 (fetchRepoFiles with a fake GithubPort; routes, store and collections belong to other units).

Status: built-unit

## Pre-scope
Files touched (all inside the ownership list): packages/engine/src/ingest/{types,migrations,routes,github,index}.ts, packages/engine/tests/ingest-{migrations,routes,github}.test.ts, packages/engine/tests/fixtures/ingest/**. No conflict with the brief's rules. Untracked `node_modules` symlinks (to D:/vc's) exist in the worktree only to run tests; they are not committed.

CORE-REQUEST: packages/engine/src/index.ts re-export `parseSequelizeMigrations`, `parseNextAppRoutes`, `fetchRepoFiles`, `GithubFetchError` and the types from "./ingest/index.js" (barrel already written at packages/engine/src/ingest/index.ts). The api unit needs this to import them as `@vc/engine`.

## What changed
- packages/engine/src/ingest/types.ts (new, 1-50): RepoFile, IngestDiagnostic, SchemaMap/SchemaTable/SchemaColumn, MigrationParseResult (= SchemaMap + diagnostics), NavRoute/NavCatalogue.
- packages/engine/src/ingest/migrations.ts: `parseSequelizeMigrations` (:579). Static scanner, never executes repo code: `tokenize` (:168, strings/templates/comments/regex aware, linear), `matchBrackets` (:253, iterative bracket pairing; unbalanced = parse_error), `findUp` (:429, locates only up(); down() is never applied), `parseOne` (:477, extracts the five calls, diagnoses unknown methods and non-literal args), `byFilename` (:568, basename order, code-unit compare). No recursion on repo-controlled depth; 5,000,000-char hard cap per file.
- packages/engine/src/ingest/routes.ts: `parseNextAppRoutes` (:61), `toRoute` (:29).
- packages/engine/src/ingest/github.ts: `fetchRepoFiles` (:163), `GithubPort`, `GithubFetchError`, glob compiler `globToRegExp` (:89), `decode` (:146).
- packages/engine/src/ingest/index.ts (new): barrel.
- Tests: packages/engine/tests/ingest-migrations.test.ts (20), ingest-routes.test.ts (10), ingest-github.test.ts (12). Fixtures: tests/fixtures/ingest/migrations/{ok,bad}/*.js, tests/fixtures/ingest/pathlynks-app-paths.txt.

Interpretations (not stated verbatim in the contract; checker may overrule):
- Result of the migrations parser is `{tables, diagnostics}`; `diagnostics` is always an array (empty list gives `{tables:{}, diagnostics:[]}`). The contract says "returns `{tables:{}}`" for an empty list; `.tables` deep-equals `{}`.
- `fetchRepoFiles(port, src, globs, opts?)`: optional 4th arg (maxBytes 1 MB, maxFiles 2000, concurrency, redact[], onSkip). `listTree` may return an array or `{tree, truncated}`; `getBlob` may return a string or `{content, encoding, size}`. A truncated tree, a getBlob failure, or more than maxFiles matches fails closed (GithubFetchError) so a sync never stores a partial catalogue/schema. The thrown message is built from fixed text + repo coordinates + HTTP status only; the port's own error text is never copied (it can echo an Authorization header), and `cause` is not set.
- Routes: only paths under `src/app/` (also under a monorepo prefix like apps/web/src/app/) count; `api` drops a route only when it is the first URL segment after groups. Nested groups are joined as "(a)/(b)" in `group`. `.` / `..` / node_modules paths are dropped.
- Migrations: `changeColumn`, `bulkInsert`, `addIndex`, `renameTable` etc. are "unknown" (diagnostic, ignored) because the contract lists exactly five methods. A table dropped then recreated keeps the history of all migrations that touched that name in `sourceFiles`.

## Tests / Pre-check (per criterion)
Tests[VA10]: packages/engine/tests/ingest-migrations.test.ts, 20 tests: out-of-order input (reversed + shuffled give the identical map), create+add+rename+drop sequence, rename keeps type, sourceFiles, malformed/no-up/unknown-method/missing-table/unresolved-args diagnostics, `__proto__` column, TS signature, regex/comment/template traps, 1 MB valid file (79 ms) and six 1 MB hostile files (deep nesting, unterminated string/comment/template, binary; 351 ms), >5 MB cap, no-execution check.
Pre-check[VA10]: b8d92b5 `cd D:/vc/.worktrees/vca-ingest/packages/engine && pnpm exec tsx --test tests/ingest-migrations.test.ts` -> tests 20, pass 20, fail 0 t=6
Pre-check[VA10-static]: b8d92b5 `git grep -nE "\beval\(|new Function|require\(|import\(" -- packages/engine/src/ingest` -> no output, rc=1 t=1

Tests[VA11]: packages/engine/tests/ingest-routes.test.ts, 10 tests: full fixture tree modelled on the Pathlynks src/app (exact sorted expected list), group strip + metadata, [id]/[...slug]/[[...slug]], same URL from two groups, api/_private/layout/loading/route/@slot/(.)/(..)/(...) dropped, only page.{js,jsx,ts,tsx}, determinism (reverse + duplicates, byte-identical JSON), Windows separators, hostile input (traversal, empty, non-strings, 50,000 paths < 2 s).
Pre-check[VA11]: b8d92b5 `pnpm exec tsx --test tests/ingest-routes.test.ts` -> tests 10, pass 10, fail 0 t=3

Tests[VA8]: packages/engine/tests/ingest-github.test.ts (fetch side only, fake GithubPort): glob filtering and sorted output, only matched blobs fetched, glob semantics (`*`, `**`, `?`, literal parentheses for Next route groups, `!` exclude), binary/invalid-UTF-8 skipped, oversize skipped without download, non-blob and unsafe tree entries ignored, getBlob failure fails the whole fetch, truncated tree and maxFiles fail closed, string/utf-8 blob variants, hostile globs.
Tests[VA9]: same file: `listTree` failure surfaces as GithubFetchError (stage listTree, HTTP status kept) and neither message, String(err), stack, JSON nor own property names contain the token (port echoes `Bearer <token>`); non-Error throws; `redact` option; getBlob failure leaks nothing. The collections/index half of VA9a belongs to vca-store; not run here.
Pre-check[VA8]: b8d92b5 `pnpm exec tsx --test tests/ingest-github.test.ts` -> tests 12, pass 12, fail 0 t=4
Pre-check[VA9b]: b8d92b5 `git grep -nE "fetchRepoFiles|GithubPort|octokit|api\.github\.com" -- apps/api/src/chat.ts apps/api/src/anonymous.ts packages/engine/src/student packages/engine/src/tools` -> no output, rc=1 t=1
Combined: b8d92b5 `pnpm exec tsx --test tests/ingest-migrations.test.ts tests/ingest-routes.test.ts tests/ingest-github.test.ts` (under scripts/vc-testlock.sh) -> tests 42, pass 42, fail 0, ~0.8 s of test time (41 s wall including lock wait).
Typecheck: b8d92b5 `pnpm exec tsc --noEmit` in packages/engine -> no output (clean); the same compile with src/ingest + my three test files included (temp tsconfig, removed) -> no output (clean).

## Capability coverage (one falsification per criterion, throwaway copy under the session scratchpad, outside the worktree)
Copy: C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/fe5889a6-130f-4952-9226-886a6cea9053/scratchpad/fals/packages/engine
Green before (2026-10-26T21:45:16+05:30): ingest-migrations tests 20 pass 20 fail 0; ingest-routes tests 10 pass 10 fail 0; ingest-github tests 12 pass 12 fail 0.
- VA10: mutant removes `valid.sort(byFilename)` -> red after: ingest-migrations tests 20 pass 19 fail 1, failing "filename order, not input order: reversed and shuffled input give the identical map".
- VA11: mutant disables route-group stripping (`if (false && GROUP.test(seg))`) -> red after: ingest-routes tests 10 pass 6 fail 4 (fixture catalogue, group strip, two-group URL, slot/intercept drop).
- VA8/VA9 (fetch): mutant copies the port's error text into the listTree GithubFetchError message -> red after: ingest-github tests 12 pass 10 fail 2 ("listTree failure ... carries no token value", "non-Error throw ... leaves no value in the message").

## Live browser evidence
Not applicable: this unit is pure parser/fetch library code with no UI and no server route (the api unit wires it).

## Open risks
- Not exported from packages/engine/src/index.ts until the CORE-REQUEST above is applied; the api unit's import path depends on it.
- The parser reads the common Sequelize forms (literal table/column names and object literals). Migrations built with variables, loops over column lists or helper functions produce `unresolved_args` diagnostics and those calls are not applied, so the schema map can lag the real DB for such repos; diagnostics make that visible rather than silent. The Pathlynks migrations themselves have not been read (G1/G2 unanswered; no GitHub API call was made).
- `diagnostics` shape (code/file/message) is mine; the api unit should surface `diagnostics.length` in the sync counts and keep it out of any secret-bearing field (messages contain only repo-derived table/column names, truncated to 200 chars).
- No new dependency was added (zero-dependency modules); no lockfile change.

Metrics: 5 src files (+~1,000 lines incl. types/barrel), 3 test files (42 tests) + 9 fixture files, 0 existing files edited, 3 falsification mutants, 0 external calls, wall ~12 min.
