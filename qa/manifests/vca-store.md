# Manifest - vca-store
Policy-Version: proportional-verification/2026-10-19.17
**Feature:** vc-admin-control, unit store (tier L: secrets/crypto, data store). Worktree D:/vc/.worktrees/vca-store, branch wave/vca-store, base 9cc4c73.
**Code commit tested:** 9597fa6 (this manifest is committed on top of it; no code changed after the pre-checks).
**Date:** 2026-10-26
**Fix cycle:** 0
**Status:** built-unit

## What changed (file:lines)
- `packages/schemas/src/sources.ts` (new): strict `SourceConfig` (github | postgres) / `SourcesFile` per spec S1 (lines 24-60), `findSecretLikeFields` (key-name and credential-literal scan, returns paths only, 83-102), `parseSourcesFile` / `loadSourcesFile` (105-141), `SourcesConfigError`. No static node import (apps/web imports the barrel); the file read uses `process.getBuiltinModule`. Barrel: `packages/schemas/src/index.ts:5` exports it.
- `config/sources.json` (new): four Pathlynks GitHub sources (frontend, auth, school, career) + `pathlynks-db` Postgres, `*Ref` env names only.
- `.env.example` (appended): `VC_ADMIN_MASTER_KEY=`, `VC_ADMIN_JWT_SECRET=`, `VC_USD_INR_RATE=`, `PATHLYNKS_DB_PASSWORD=`, `GITHUB_TOKEN=` (names, empty values).
- `packages/db/src/secrets.ts` (new): AES-256-GCM `encryptSecret` / `decryptSecret` ({iv,tag,ct} base64, 12-byte random iv, 16-byte tag pinned both in `authTagLength` and an explicit length check, canonical-base64 check, exact field set), `parseMasterKey` (base64 of exactly 32 bytes), `isEncryptedSecret`.
- `packages/db/src/admin-store.ts` (new): `createAdminStore(db, {masterKey?})` with `users`, `sources` (`setSecret` is the only secret write; `get`/`list` return `hasSecret` only; `readSecret` is server-side only), `artifacts`, `audit` (surface = `append`, `list`; no update/delete), `usage.record` (allow-list, throws on any extra field; `studentKey` must be 64-hex HMAC); `studentKeyOf`; `nearestRank`; `aggregateMetrics(db, {from,to,siteId?,usdInrRate?})`; `DEFAULT_USD_INR_RATE = 85`. Collections reached by literal names only.
- `packages/db/src/collections.ts:88-95`: `admin_users`, `sources`, `source_artifacts`, `audit_log`, `turn_usage` in `COLLECTION_NAMES`.
- `packages/db/src/erasure.ts` (ERASURE_EXEMPT_COLLECTIONS): five entries, each with a reason well over 10 characters.
- `packages/db/scripts/db-init.ts` (end of INDEX_PLAN): seven plain indexes for the five collections; none unique, none with an expiry option.
- Tests (new): `packages/db/tests/admin-store.test.ts` (28 tests), `packages/schemas/tests/sources.test.ts` (13 tests).

## CORE-REQUEST (files I do not own)
- CORE-REQUEST: packages/db/src/index.ts add `export * from "./admin-store.js";` (and nothing else; admin-store re-exports the secrets API) so apps/api can `import { createAdminStore, aggregateMetrics, studentKeyOf } from "@vc/db"`.
- CORE-REQUEST: apps/api/src/index.ts (wiring) build the store with `createAdminStore(db)` (reads `VC_ADMIN_MASTER_KEY`, refused at construction if not base64 of 32 bytes); pass `usdInrRate` from `VC_USD_INR_RATE` to `aggregateMetrics`; map `AdminStoreError` code `range` to HTTP 400, `exists` to 409, `invalid` to 400.
- CORE-REQUEST: apps/api/src/chat.ts and voice (VA16 writer) call `usage.record(...)` once per chat or voice turn with `studentKey = studentKeyOf(<hmac key, >= 32 chars>, siteId, studentId)`; the anonymous route omits `studentKey` (the record then has no identifier at all).
- CORE-REQUEST: apps/api/src/admin-routes.ts `GET sources` returns `store.sources.list()` as is (`hasSecret`, no `secretEnc`); the connection test and sync use `store.sources.readSecret(id)` server-side only and never log or return it.

## Tests and pre-checks (all at 9597fa6, run through scripts/vc-testlock.sh from the package dir)
- Tests[VA2]: 9597fa6 `cd packages/db && pnpm exec tsx --test tests/admin-store.test.ts` -> pass=28 fail=0 t=558s (the first run queued 546 s on the shared test lock; the same file ran in 4 s once the lock was free)
- Pre-check[VA2]: 9597fa6 `cd packages/db && pnpm exec tsx --test tests/db-init.test.ts tests/erasure.test.ts tests/admin-store.test.ts` -> pass=130 fail=0 t=7s
- Tests[VA3]: 9597fa6 `cd packages/schemas && pnpm exec tsx --test tests/sources.test.ts` -> pass=13 fail=0 t=6s
- Tests[VA9a]: 9597fa6 same command as Pre-check[VA2] (db-init + erasure + admin-store) -> pass=130 fail=0 t=7s
- Pre-check[VA9a]: 9597fa6 `cd packages/db && pnpm exec tsx --test tests/db-scope.test.ts` (the fence/B12 scanners that walk every `src` file, including the new ones) -> pass=11 fail=0 t=12s
- Tests[VA9b]: 9597fa6 `git grep -nE "fetchRepoFiles|GithubPort|octokit|api\.github\.com" -- apps/api/src/chat.ts apps/api/src/anonymous.ts packages/engine/src/student packages/engine/src/tools` -> no output, rc=1 (clean; nothing in my unit imports a GitHub client)
- Tests[VA16]: 9597fa6 `cd packages/db && pnpm exec tsx --test tests/admin-store.test.ts` -> pass=28 fail=0 (VA16 cases: extra-field rejection, HMAC key != raw id, canary scan). The api halves (`chat-usage.test.ts`, `anonymous-zero-persistence.test.ts`, `chat-privacy.test.ts`) belong to the api unit.
- Tests[VA17]: 9597fa6 `cd packages/db && pnpm exec tsx --test tests/admin-store.test.ts` -> pass=28 fail=0 (golden table: 14 in-range rows + 2 boundary rows, 2 sites, 3 days, both modes). The route half (`admin-routes.test.ts`) belongs to the api unit.
- Tests[VA1 static]: 9597fa6 `git grep -nIE "(password|passwd|secret|token|master_?key)[\"']?[[:space:]]*[:=][[:space:]]*[\"'][^\"'$<{][^\"']{5,}" -- config .env.example apps/api/src packages/db mcp/pathlynks packages/schemas/src` -> 2 lines, both pre-existing and not secret values: `apps/api/src/index.ts:339` (`secret: "VC_VOICE_WS_SECRET"`, an env NAME) and `packages/db/src/erasure.ts:399` (an error message string). 
- Tests[VA1 static]: 9597fa6 `git grep -nIE "postgres(ql)?://[^[:space:]\"']+:[^@[:space:]\"']+@"` over tracked non-test files -> 2 lines, both `infra/langfuse/docker-compose.yml` with `${POSTGRES_PASSWORD}` placeholders (pre-existing, no value).
- Tests[VA1 static]: 9597fa6 `git ls-files | grep -E "(^|/)\.env($|\.)" | grep -v "\.env\.example$"` -> no output, rc=1.
- Tests[VA1 config]: the `.env.example` cases in `packages/schemas/tests/sources.test.ts` (names present with empty values) -> within pass=13 fail=0.
- Typecheck: `pnpm exec tsc --noEmit` in packages/db and packages/schemas -> no output (clean); `pnpm -C apps/web typecheck` (web imports the schemas barrel) -> exit 0.
- Not mine, not run here: `apps/api/tests/admin-secrets-leak.test.ts` (VA1 route half) - api unit.

## Capability coverage (one falsification per criterion, in a throwaway copy at D:/vca-store-fals made with `git checkout-index` from the staged tree; the worktree was never mutated)
- VA2 (tamper rejection): green-before `tests/admin-store.test.ts` pass=28 fail=0; mutation = drop the pinned GCM tag length (`authTagLength` and the `tag.length !== TAG_BYTES` check in `secrets.ts`, so a truncated tag verifies); red-after pass=27 fail=1 `VA2: a truncated or padded tag, a wrong-length iv, a missing/extra field and non-canonical base64 all throw`; restored pass=28 fail=0.
- VA3 (config rejects secrets): green-before sources.test.ts pass=13 fail=0; mutation = disable the secret-like pre-scan in `parseSourcesFile`; red-after pass=12 fail=1 `VA3 rejection: a field named password / secret / token (any case) holding a value`; second mutation = add `"disable"` to the sslmode enum -> pass=12 fail=1 `VA3 rejection: a Postgres source with sslmode outside the enum`; restored pass=13 fail=0.
- VA9a (collections wired): green-before erasure + admin-store pass=104 fail=0; mutation = delete the `turn_usage` entry from ERASURE_EXEMPT_COLLECTIONS; red-after pass=102 fail=2 (`VA9a: the five admin collections ...` and `B15: every COLLECTION_NAMES entry is in ERASURE_PLAN or explicitly exempt ...`); restored pass=104 fail=0.
- VA9b (no GitHub client in the chat path): green-before the grep returns nothing (rc=1); mutation = append `import { fetchRepoFiles } from "@vc/engine";` to `apps/api/src/chat.ts`; red-after the grep returns `apps/api/src/chat.ts:965:import { fetchRepoFiles } from "@vc/engine";` (rc=0).
- VA16 (no text in turn_usage): green-before admin-store pass=28 fail=0; mutation = remove the `onlyKeys` allow-list call in `usage.record`; red-after pass=26 fail=2 (`VA16: usage.record stores exactly the schema fields ...` and `VA16: a canary sentence handed alongside a turn never reaches any stored document`); restored pass=28 fail=0.
- VA17 (metrics): green-before admin-store pass=28 fail=0; mutation = make the upper bound inclusive (`$lte: to`); red-after pass=25 fail=3 (golden table, from-inclusive/to-exclusive, default-rate case); restored pass=28 fail=0.
- VA1 (no secret in committed files): green-before the static grep above returns only the 2 pre-existing non-secret lines; mutation = append `const master_key = "AbCdEf0123456789abcdef";` to `packages/db/src/secrets.ts` -> the grep adds `packages/db/src/secrets.ts:97:const master_key = "AbCdEf0123456789abcdef";` (red); second mutation = put a value on `VC_ADMIN_MASTER_KEY=` in `.env.example` -> `sources.test.ts` pass=12 fail=1 `VA1 (config side): .env.example holds empty values for the admin secrets it names` (red). Finding for the checker: the contract's grep is case-sensitive, so the same literal under the camelCase name `masterKey` is NOT matched (only `grep -i` finds it); the config-side test above and the leak route test cover that gap, the static line alone does not.

## Live browser evidence
Not applicable: this unit has no UI and no route (store, crypto, config schema only). The api and ui units own the browser evidence.

## Open risks and notes
- `config/sources.json` repo names (`vidysea-admin/pathlynks-*`), branch `main`, host `pathlynks-db.invalid` (reserved TLD, cannot resolve) and table names are [ASSUMPTION] placeholders: the real values were not in the repo and the handover doc holds the live password, which I did not open. They are data, fixed by editing the file or from the console; no sync can run before G1/G2 are answered.
- `aggregateMetrics` reads the rows in range and aggregates in JS (the in-process fake has no `aggregate`). Fine for the pilot volume; a Mongo `$group` pipeline is the follow-up if `turn_usage` grows large. `perSiteDay.conversations` counts turn rows (the row carries no thread id by design); `tokens` = input + output.
- `admin_users._id` is the lower-cased email, so uniqueness uses the built-in `_id` index (every other unique index must lead with `tenantId`, db-init.test.ts, and an admin user has no tenant).
- `DEFAULT_USD_INR_RATE = 85` is only the fallback; the configured value is `VC_USD_INR_RATE`, passed by the caller.
- The throwaway copy `D:/vca-store-fals` could not be deleted (the sandbox refused `rm -rf`); it is outside the repo and safe to remove.
- The commit carries two `Co-Authored-By` lines: the one the brief requires (Opus 5.5, last) and the one for the model that actually wrote it (Sonnet 5.5).
Metrics: 11 files changed in the code commit (+1467 lines), 41 new tests (28 db, 13 schemas), 7 falsifications (all red then restored), wall about 30 min plus 9 min waiting on the test lock.
