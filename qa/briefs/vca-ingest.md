You are a /maker build subagent for D:\vc feature vc-admin-control, unit ingest.
Worktree: D:/vc/.worktrees/vca-ingest (branch wave/vca-ingest, base 9cc4c73). Work ONLY inside it; run git only as git -C <worktree>.
Policy: proportional-verification/2026-10-19.17. Tier: M (new module). Budget: wall 45 min.
Read first: D:/vc/docs/features/vc-admin-control/spec.md sections S4, and D:/vc/qa/evidence/vc-admin-20261026/fact-F1.md, fact-F2.md, fact-F3.md.
Files you own: packages/engine/src/ingest/**, packages/engine/tests/ingest-*.test.ts, packages/engine/tests/fixtures/ingest/**
Do NOT edit packages/engine/src/index.ts, apps/api/src/index.ts, apps/api/src/main.ts, qa/contracts/**, docs/DECISIONS.md, .claude/**: write a line "CORE-REQUEST: <file> <what>" in your manifest instead.
TDD: write the failing test first. Each test names the real scenario that reaches it. ADD only; never delete or rename existing code, tests or config the criterion does not name.
Tests: run only your touched/affected test files with "pnpm exec tsx --test FILE" (widget: "node --test FILE") from the package dir; never a whole tests directory; never a full suite. Wait on a busy shared test lock (scripts/vc-testlock.sh); long waits are normal.
Gate answers (qa/gates/vc-admin-control.md): G0 Answered: plan approved 2026-10-26. G1/G2 UNANSWERED: never connect to the live Pathlynks Postgres or call the GitHub API; use fakes only.
Secrets: env NAMES only, never values. Never kill a process by image name.
Pre-scope: list the files you will touch; if one conflicts with the rules above, stop and return.
Finish: write D:/vc/.worktrees/vca-ingest/qa/manifests/vca-ingest.md (What changed with file:lines; Tests[<VA id>] and Pre-check[<VA id>]: <sha> <command> -> <result> t=<sec> per criterion you own; Capability coverage: one falsification per criterion, done in a throwaway copy outside the worktree, with the green-before and red-after lines pasted; Live browser evidence section; Metrics line; Status: built-unit). COMMIT code+tests+manifest on wave/vca-ingest with a message ending "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>". Do NOT dispatch a checker.
Return ONE line: vca-ingest <sha> ready   (or vca-ingest BLOCKED <reason>).

## Acceptance criteria you own (verbatim from qa/contracts/vc-admin-control.md @1283b23)
## Ingest
- **[VA8]. Source CRUD, test and sync routes (fake-backed).** (serves: intent#3, intent#4) criticality H
  - `GET|POST sources`, `PUT sources/:id/secret` (stores only the encrypted triple, super-admin), `POST sources/:id/test`, `POST sources/:id/sync` behave per spec S3. `POST sources` validates the body with the S1 `SourceConfig` (a body carrying a secret value in a config field is 400 and is not stored). Sources are seeded from `config/sources.json` idempotently (a second seed changes nothing, and never overwrites a stored `secretEnc`).
  - `test` and `sync` use a `GithubPort` / Postgres port injected into the deps, so the route test uses fakes; `sync` = fetch -> parse -> `artifacts.put` -> `sources.recordSync({at,status,counts})`. A failing fetch records `status:"error"` with a message that contains no secret and leaves the previous artifact in place.
  - **verify:** `apps/api/tests/admin-routes.test.ts` (sources cases) and `apps/api/tests/admin-sync.test.ts` (fake GithubPort + fixture repos; asserts artifacts written, lastSync recorded, previous artifact kept on failure, idempotent seed).
- **[VA9]. Chat never reads GitHub or Postgres schema live; ingest stores schema and routes, not student rows.** (serves: intent#4) criticality H
  - **[VA9a]** The collections `admin_users`, `sources`, `source_artifacts`, `audit_log`, `turn_usage` are in `COLLECTION_NAMES`, have an `INDEX_PLAN` entry, are in `ERASURE_EXEMPT_COLLECTIONS` with a reason longer than 10 characters, have no TTL and no `ttl` identifier, and are never accessed through `db.collection(<variable>)`; the db-init and erasure tests stay green. `source_artifacts.data` holds only schema map / navigation catalogue, never row data.
  - **[VA9b]** No import of a GitHub client or `fetchRepoFiles` exists in the chat / graph / tool path (`apps/api/src/chat.ts`, `anonymous.ts`, `packages/engine/src/student/**`, `packages/engine/src/tools/**`); chat reads the stored catalogue / schema only.
  - **verify:** `cd D:/vc/packages/db && pnpm exec tsx --test tests/db-init.test.ts tests/erasure.test.ts tests/admin-store.test.ts`; static: `git -C D:/vc grep -nE "fetchRepoFiles|GithubPort|octokit|api\.github\.com" -- apps/api/src/chat.ts apps/api/src/anonymous.ts packages/engine/src/student packages/engine/src/tools` returns nothing.
- **[VA10]. Sequelize migrations parser.** (serves: intent#4) criticality H
  - `parseSequelizeMigrations(files)` applies `createTable`, `addColumn`, `removeColumn`, `renameColumn`, `dropTable` in filename order (not input order) and returns `{tables:{[name]:{columns:{[col]:{type,allowNull?}},sourceFiles}}}`; a dropped table is absent, a renamed column keeps its type, `sourceFiles` lists every migration that touched the table.
  - Hostile inputs do not throw uncaught or hang: an unparseable file is skipped and reported in the result's diagnostics (not silently), a migration with an unknown method is ignored with a diagnostic, an empty list returns `{tables:{}}`, and a 1 MB file completes within 2 s. The parser never executes migration code (no `eval`, `new Function`, `require`, `import()` of repo content).
  - **verify:** `cd D:/vc/packages/engine && pnpm exec tsx --test tests/ingest-migrations.test.ts` over `tests/fixtures/ingest/` (out-of-order filenames, create+add+rename+drop sequence, malformed file, unknown method, oversized file); static: `git -C D:/vc grep -nE "\beval\(|new Function|require\(|import\(" -- packages/engine/src/ingest` returns nothing.
- **[VA11]. Next.js routes parser.** (serves: intent#4) criticality H
  - `parseNextAppRoutes(paths)` turns `src/app/**/page.{js,jsx,ts,tsx}` paths into `{routes:[{path, group?, file}]}`; route groups `(admin)` are stripped from the URL and kept as `group` metadata; dynamic segments stay as `[id]`, catch-all `[...slug]` and optional `[[...slug]]` are kept; `api/` trees, `_private` folders, `layout`/`loading`/`route` files and parallel/intercepting slots (`@slot`, `(.)x`) produce no route; duplicate URLs from two groups are both listed with their groups; output order is deterministic (sorted).
  - **verify:** `cd D:/vc/packages/engine && pnpm exec tsx --test tests/ingest-routes.test.ts` over a fixture path list modelled on the Pathlynks `src/app` tree; and `tests/ingest-github.test.ts` for `fetchRepoFiles` with a fake `GithubPort` (glob filtering, binary/oversize blob skipped, `listTree` failure surfaces as an error, no token value in the thrown message).

You own only the parser/fetch side of VA8/VA9 (fetchRepoFiles with a fake GithubPort); routes are unit store/api.

## Invariants that must stay green
## Unchanged invariants (spec "Constraints"; must hold after every unit)
- **[I1].** crisisGuard and the LK10 wording; crisis runs before any tool. Existing tests: `packages/engine/tests/guard-crisis.test.ts`, `crisis-defaults.test.ts`, `crisis-escalation.test.ts`, `crisis-eval.test.ts`, `apps/api/tests/voice-crisis-turn.test.ts`. (see also [VA15])
- **[I2].** D-110: Tele-MANAS appears only on distress, and the footer 14416 / 112 always.
- **[I3].** The anonymous zero-persistence rule: `apps/api/tests/anonymous-zero-persistence.test.ts`, `anonymous-route.test.ts`.
- **[I4].** Grounding redaction and student privacy: `apps/api/tests/chat-privacy.test.ts`, `packages/engine/tests/claims-guard.test.ts`, `guard-citation.test.ts`.
- **[I5].** Partner chatbot contract `qa/contracts/partner-chatbot.md` (K1-K5, W1-W4, V1-V3, D1-D2): `apps/api/tests/partners.test.ts`, `partner-openapi.test.ts`, `partner-voice.test.ts`, `apps/widget/tests/*.test.js` stay green; the partner OpenAPI route and CORS rules are unchanged.
- **[I6].** Only the `virtual_counsellor` Mongo database is written; production Mongo and the Pathlynks Postgres are never written (VA12, VA20). The B12 guard (no `.db(` outside `packages/db/src/client.ts`) stays green.
- **[I7].** Dependency bump: the new `pg` dependency (and any GitHub client) is added with a lockfile change only in the packages that need it; `pnpm -r typecheck` and `pnpm install --frozen-lockfile` succeed. The pre-push check is the full suite (`.13-2` a and b: auth unit and dependency change): `pnpm test` at the integrated head.
