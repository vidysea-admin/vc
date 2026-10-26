# Manifest: vca-pathlynks (feature vc-admin-control, unit pathlynks)

Status: built-unit
Fix cycle: 0
Branch: wave/vca-pathlynks (base 9cc4c73); code commit 5b9a64f
Policy: proportional-verification/2026-10-19.17. Tier L. Criteria owned: VA12 (criticality C).
Built: 2026-10-26 (times read from `date -Iseconds`, 21:36-21:45 +05:30)

## What changed
New workspace package `mcp/pathlynks` (already globbed by `mcp/*` in pnpm-workspace.yaml, so no workspace edit). Added deps `pg`, `@types/pg` (plus the SDK and zod, as in sibling mcp packages); `pnpm-lock.yaml` change is additions only (+143 lines, 0 removed).
- `mcp/pathlynks/src/port.ts:93` `createPathlynksPort(config)`: four methods only (+ `getStatus`). `:105` static SQL `SELECT * FROM "<allow-listed table>" WHERE student_id = $1 LIMIT 51`; the id is bound as `$1` only. Table names are validated at construction against `allowedTables` (the postgres source `tables` list of `config/sources.json`) and a plain-identifier regexp; `:125` `verifyReadOnly` runs `has_table_privilege(current_user, $1, 'INSERT'|'UPDATE'|'DELETE')` for every configured table, any true / error / malformed-or-empty row fails closed and is recorded (`getStatus()`, `onEvent`); `:161` `read` = id check -> connect -> `SET statement_timeout = 3000` (`:173`) -> `SET default_transaction_read_only = on` -> privilege probe -> SELECT; `:180` row cap 50 + `truncated`; every failure is a typed `{ok:false, reason:"unavailable", cause}` with a fixed cause constant, connection always closed, per-step deadline (5 s default) so a hung query cannot hang the turn.
- `mcp/pathlynks/src/connect.ts:30` `buildPgConfig`: password read from the env NAME `passwordRef`; no connection string; `statement_timeout: 3000` also set on the driver; both `sslmode` values verify the certificate (`require` is not allowed to downgrade to unverified TLS). Only file importing `pg`.
- `mcp/pathlynks/src/server.ts:16` `createPathlynksServer(port, resolveStudentId)`: MCP tools `pathlynks_profile|saved_careers|compare|assessment` with an EMPTY input schema; extra model arguments are ignored; the id comes only from `resolveStudentId()` (the host wires the verified auth context); no verified id -> refused, no connection.
- `src/index.ts` barrel; `package.json`, `tsconfig.json`; tests `tests/port.test.ts`, `tests/server.test.ts`, `tests/fakes.ts` (fake `pg` client recording `text`/`values`).
- No live connection and no GitHub call anywhere (G1/G2 unanswered). No edit to engine index, api index/main, contracts, DECISIONS, .claude.

## Tests
Tests[VA12]: 5b9a64f `cd D:/vc/mcp/pathlynks && bash scripts/vc-testlock.sh pnpm exec tsx --test tests/*.test.ts` (run in the worktree copy) -> tests 33, pass 33, fail 0 t=2 (first run incl. lock wait: t=11, duration_ms 7141)
Tests[VA12-scenarios, names in the test files]: parameterisation + `student_id = $1` binding + timeout SET for each of 4 methods; per-method table; hostile ids refused with 0 connections; row cap 500/51/50; INSERT/UPDATE/DELETE true on each of 4 tables (12 tests) fail closed with no data SELECT; privilege-check error and empty privilege row fail closed; connect/query/SET errors typed with no secret/host/user in result, events or status; hung query -> `timeout`; SQL allow-list regexp over all captured statements (SELECT / the two SET forms; forbidden DML/DDL words absent); allow-list + identifier rejection at construction; `buildPgConfig` env-name password and no connection string; MCP: injected `studentId`/`student_id`/message text still queries the verified id, no verified id refused, unavailable is a normal typed result, truncated flag in payload.
Pre-check[VA12]: 5b9a64f `bash scripts/vc-testlock.sh pnpm -C D:/vc/.worktrees/vca-pathlynks/mcp/pathlynks typecheck` -> exit 0 (tsc --noEmit clean) t=3
Pre-check[I7]: 5b9a64f `pnpm -C D:/vc/.worktrees/vca-pathlynks install --frozen-lockfile` -> Done in 10.8s, exit 0, lockfile accepted t=11
Not run by this unit (brief forbids): whole-suite `pnpm test`, `pnpm -r typecheck` (integration head owns them).

## Capability coverage (falsification in a throwaway copy outside the worktree: $SCRATCHPAD/fals/m, src+tests copied, node_modules junction)
Green-before: unmodified copy of 5b9a64f -> `ℹ tests 33 / pass 33 / fail 0`.
Red-after (each mutation applied alone to the copy, tests re-run):
- M1 fail-open privilege check (`if (row.ins || row.upd || row.del)` -> `if (false)`): `✖ VA12 fail closed when INSERT is true on students` and the other 11 privilege tests -> RED.
- M2 row cap removed (`rows.slice(0, ROW_CAP)` -> `rows`): `ℹ pass 31 / fail 2` (`VA12 row cap: ...`, `VA12 truncated results are flagged in the tool payload`) -> RED.
- M3 student id concatenated into SQL (`student_id = '${studentId}'`): `ℹ pass 29 / fail 4` (the 4 `binds the verified student id as $1` tests) -> RED.
- M4 MCP tool takes the id from tool args (`args.studentId ?? resolveStudentId()`): `✖ VA12 tool arguments and injected text never change the queried student id` (`pass 32 / fail 1`) -> RED.
- M5 `SET statement_timeout` dropped: `ℹ pass 29 / fail 4` -> RED.
Not mutation-tested individually: the empty-privilege-row and hung-query-timeout branches (covered by their own tests; no red line captured).

## Live browser evidence
Not applicable: backend package with no UI. Live Postgres evidence is VA20, HELD on G1/G2.

## Decisions and notes for the checker / integrator
- `config/sources.json` does not exist yet (unit B1 owns it). The port takes `allowedTables` and a logical->table `tables` map as config; the integrator passes the postgres source's `tables` and `host/port/database/user/sslmode/passwordRef`. Which real Pathlynks table backs each read is an open input (not in the spec); `SELECT *` is used because the column set is unknown until the schema map exists. Narrowing columns is a follow-up once VA20 is unblocked.
- `student_id` is the column name fixed by the criterion; the real column name is unverified until G1/G2.
- Student id shape accepted: `^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$` (UUID, numeric, `syn-` ids); anything else is `refused` before a connection.
- Per-call connection (connect, probe, query, close) rather than a pool: simple and re-checks privileges on every use; revisit if latency matters.
CORE-REQUEST: apps/api/src/index.ts wire `createPathlynksPort` (postgres source config + env) into ChatApiDeps/StudentGraphDeps as the new pathlynks_* tool executor (spec S6).
CORE-REQUEST: packages/engine/src/index.ts export nothing new from this unit; engine consumes `PathlynksPort` structurally (engine must define its own port type or import `@vc/mcp-pathlynks`, integrator decides).
CORE-REQUEST: .env.example add the postgres `passwordRef` env NAME (e.g. PATHLYNKS_DB_PASSWORD) with an empty value (unit B1 owns .env.example).

Metrics: files 8 new + lockfile; src ~290 lines, tests ~330 lines; 33 tests; wall ~10 min; 0 whole-suite runs.
