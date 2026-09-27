# Manifest: t-025-api-jwt-tenant

**Contract:** qa/contracts/counselling-engine.md (B21 primary, incl. the 9f13acc placeholder-issuer amendment; B2, B4, B8, B11, B12, B13, B14, B15, B20)
**Goal task:** T-025 (TASKS.md line 36)
**Fix cycle:** 0 of max 3
**Design:** D-021 (API-first headless engine). No new decision written by this unit.
**Merge:** branch `wave/t-025-api-jwt-tenant` was built on the T-013 head `6bc395f` (implementation commit `67c3cfa`,
from the previous attempt, which died on the account session limit, not on code). This attempt merged current `main`
(`8a783bb`: T-013 line incl. `7b14a55`, T-022 concern_flagged edges, B21 amendment `9f13acc`) as merge commit
`c764569`: automatic, no conflicts.
**Diff range:** `6bc395f..HEAD` (implementation `67c3cfa`, merge `c764569`, tests `9260af8`, `881edf8`, this manifest).

## Scope (files)

Implementation (`67c3cfa`, reviewed and kept, not rewritten):
- `apps/api/src/auth.ts` (new: apps/api had no auth) - JWT verification, strict alg allow-list, config from env.
- `apps/api/src/server.ts` (new: no HTTP layer existed) - `/v1` route table, auth-before-anything handler, `createTenantWiring`, node:http adapter.
- `apps/api/src/openapi.ts` (new) - OpenAPI document, drift-tested against the route table.
- `apps/api/src/index.ts` (extended in place: `startApi` gains opt-in `http`).
- `packages/db/src/tenant.ts` (new: no module owned "which tenant does this Db act for") - `tenantScopedDb`, fail-closed wrapper.
- `packages/db/src/client.ts` (`tenantScopedClient`), `erasure.ts` (tenant-aware fence sweep), `facts.ts` (`readActiveProfile`), `index.ts`, `scripts/db-init.ts` (unique indexes lead with tenantId) - extended in place.
- Tests: `apps/api/tests/{auth,server,index}.test.ts`, `packages/db/tests/{tenant,db-init,db-scope}.test.ts`.
- `.env.example` (names only), `apps/api/package.json` (`jose` 6.2.12), `pnpm-lock.yaml`.

This attempt (after the merge):
- `apps/api/tests/server.test.ts` - new test: concern_flagged edges (T-022) are tenant-stamped, coexist across tenants, erased per tenant.
- `apps/api/tests/auth.test.ts` - two new B21-amendment contract tests; the config-refusal test gains two JWKS-path cases.
- `.env.example` - comment naming the placeholder issuer `umesh` and the config-only switch (no values).

**Not touched:** `apps/web`, the T-030 template region of `nodes.ts`, `mcp/university-kb`, `packages/providers`,
`qa/contracts/`, `docs/DECISIONS.md`, `ARCHITECTURE.md`, `TASKS.md`, `.claude/**`.

## What changed

1. **Merge + T-022 gap.** The concern edges (`student --concern_flagged--> transcript_turn`) are written by
   `recordSessionConcerns` (`packages/engine/src/scribe/graph.ts:575`) with `edges.updateOne({_id}, {$setOnInsert: doc}, {upsert})`.
   In the API they run over `tenantScopedDb`, so the filter gets `tenantId` (the upsert is stamped from it) and
   `$setOnInsert._id` is tenant-qualified. No code change was needed; a new outcome test now proves it on the raw
   collection, including that tenant B running the same student/session id gets its own edge (no cross-tenant 11000)
   and that A's erasure deletes A's edge and leaves B's byte-for-byte unchanged.
2. **B21 amendment (9f13acc).** `auth.ts` already reads the issuer and key only from env (`jwtConfigFromEnv`); there is no
   default issuer. Added contract tests: (a) a verifier built from `VC_JWT_ISSUER=umesh` + a locally generated RSA public key
   and one built from another issuer + a JWKS URL (offline fetch) each accept their own token and refuse the other's; the same
   key with a wrong issuer is refused; no issuer set -> config error. (b) a scan: no literal issuer, no `umesh`, no embedded key
   in `apps/api/src`; `.env.example` lists the JWT names with empty values; no tracked file contains a private key.
   Keys in tests are generated in memory; no private key is written to disk or committed.
3. **Allow-list test hardening.** Falsification showed that removing the unknown-algorithm check survived, because the PEM
   path narrows the allow-list to the key's own algorithm. Added JWKS-path cases (`PS256`, `ES256,none`) so the allow-list
   itself is what refuses them.

## How to verify (exact commands)

```
L=C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/6c22744a-b397-4515-a226-3516f0a93a31/scratchpad/vc-testlock.sh
W=D:/vc/.worktrees/t-025-api-jwt-tenant
bash $L pnpm -C $W --filter @vc/api test
bash $L pnpm -C $W --filter @vc/api typecheck
bash $L pnpm -C $W --filter @vc/db test
bash $L pnpm -C $W --filter @vc/db typecheck
bash $L pnpm -C $W --filter @vc/engine test
bash $L pnpm -C $W --filter @vc/engine typecheck
python $W/contracts/verify_contracts.py
```

## Capability coverage (claim -> test id -> falsifying edit -> expected RED)

Run in a throwaway worktree (`C:/Users/Lenovo/AppData/Local/Temp/claude/t025-falsify`, detached at `9260af8`, then `881edf8`
for F2; removed afterwards), one edit at a time, reset between cases.

| # | Claim (B21) | Test id | Falsifying edit | Result |
|---|---|---|---|---|
| F1 | issuer is checked | `T-025 auth: issuer and audience are enforced`; `T-025 B21 contract: ... differ ONLY in config ...` | `auth.ts` drop `issuer: config.issuer` from verifyOptions | RED (both) |
| F2 | strict alg allow-list at config | `T-025 auth: config refuses a missing issuer, 'none', unknown algorithms ...` | `auth.ts` allow-list check `includes(name)` -> never true | RED (after the JWKS cases were added; survived before) |
| F2b | never `none`, no alg confusion at verify time | `T-025 auth: algorithm confusion and 'none' are refused` | `auth.ts` drop `algorithms` from verifyOptions | RED |
| F3 | 401 reads/writes nothing (db spy) | `T-025 api: every auth failure on every protected route is the same 401, and no Db or graph is touched` | `server.ts` call `deps.dbForTenant("probe")` before the auth step | RED |
| F4 | every query tenant-filtered; cross-tenant refusal leaks no existence | `T-025 api: another tenant sees tenant A's student exactly as a student that never existed ...` | `tenant.ts` `scopeFilter` stops adding `tenantId` | RED |
| F4b | legacy docs refused, never adopted | `T-025 legacy rule: documents without tenantId are invisible to a tenant ...` | same edit as F4 | RED |
| F5 | concern_flagged edges stamped + isolated (T-022 merge) | `T-025 api (T-022 merge): concern_flagged edges are stamped with the token's tenant ...` | `tenant.ts` `updateOne` filter without `tenantId` (upserts unstamped) | RED |
| F6 | per-tenant unique indexes include tenantId | `T-025: every UNIQUE index in INDEX_PLAN leads with tenantId`; `T-025: the fake enforces the tenant-led facts index ...` | `db-init.ts` facts unique keys `{studentId, key}` | RED (both) |
| F7 | issuer only from config (placeholder `umesh` -> real issuer = config change) | `T-025 B21 contract: ... differ ONLY in config ...`; `T-025 B21 contract: no issuer or key is hard-coded ...` | `auth.ts` `issuer: "umesh"` literal | RED (both) |
| F8 | no private key committed | `T-025 B21 contract: no issuer or key is hard-coded ... no private key is tracked in git` | `git add leak-synthetic.pem` (generated EC private key) | RED |

## Real outputs

`@vc/api test` (final, at 881edf8):
```
✔ T-025 B21 contract: the placeholder issuer 'umesh' (local key pair) and a later real issuer differ ONLY in config; each verifier accepts its own tokens and refuses the other's (102.0371ms)
✔ T-025 B21 contract: no issuer or key is hard-coded in apps/api/src, .env.example lists the JWT names with no values, and no private key is tracked in git (328.6135ms)
✔ T-025 api: every auth failure on every protected route is the same 401, and no Db or graph is touched (212.3586ms)
✔ T-025 api: another tenant sees tenant A's student exactly as a student that never existed, and changes nothing of A's (46.2738ms)
✔ T-025 api (T-022 merge): concern_flagged edges are stamped with the token's tenant, the same student/session in two tenants coexist, and A's erasure deletes only A's (79.2129ms)
✔ T-025 api: the OpenAPI document is public and matches the route table (method, path, roles) in both directions (1.5704ms)
ℹ tests 36
ℹ pass 36
ℹ fail 0
```
`@vc/api typecheck`: `> tsc --noEmit` (no errors).
`@vc/db test`:
```
ℹ tests 233
ℹ pass 233
ℹ fail 0
```
`@vc/db typecheck`: `> tsc --noEmit` (no errors).
`@vc/engine test`:
```
ℹ tests 327
ℹ pass 327
ℹ fail 0
```
`@vc/engine typecheck`: `> tsc --noEmit && tsc --noEmit -p evals/tsconfig.json && tsc --noEmit -p scripts/tsconfig.json` (no errors).
`python contracts/verify_contracts.py`: `verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity`

Falsification (excerpt; full log in the maker's scratchpad `t025-falsify.out`):
```
=== F1-issuer GREEN-before
✔ T-025 auth: issuer and audience are enforced (21.8497ms)
✔ T-025 B21 contract: the placeholder issuer 'umesh' (local key pair) and a later real issuer differ ONLY in config; each verifier accepts its own tokens and refuses the other's (85.2193ms)
=== F1-issuer RED-after (apps/api/src/auth.ts)
✖ T-025 auth: issuer and audience are enforced (7.9174ms)
✖ T-025 B21 contract: the placeholder issuer 'umesh' (local key pair) and a later real issuer differ ONLY in config; each verifier accepts its own tokens and refuses the other's (34.0592ms)
=== F2-alg-allowlist GREEN-before
✔ T-025 auth: config refuses a missing issuer, 'none', unknown algorithms and unsafe HS256 setups (10.2363ms)
=== F2-alg-allowlist RED-after
✖ T-025 auth: config refuses a missing issuer, 'none', unknown algorithms and unsafe HS256 setups (12.8036ms)
=== F2b-none GREEN-before
✔ T-025 auth: algorithm confusion and 'none' are refused (12.9987ms)
=== F2b-none RED-after (apps/api/src/auth.ts)
✖ T-025 auth: algorithm confusion and 'none' are refused (8.3448ms)
=== F3-401-no-db GREEN-before
✔ T-025 api: every auth failure on every protected route is the same 401, and no Db or graph is touched (111.1002ms)
=== F3-401-no-db RED-after (apps/api/src/server.ts)
✖ T-025 api: every auth failure on every protected route is the same 401, and no Db or graph is touched (105.9994ms)
=== F4-query-filter GREEN-before
✔ T-025 api: another tenant sees tenant A's student exactly as a student that never existed, and changes nothing of A's (103.7966ms)
=== F4-query-filter RED-after (packages/db/src/tenant.ts)
✖ T-025 api: another tenant sees tenant A's student exactly as a student that never existed, and changes nothing of A's (94.9829ms)
=== F4b-legacy GREEN-before
✔ T-025 legacy rule: documents without tenantId are invisible to a tenant, and are never adopted, changed or deleted through a scope (6.2217ms)
=== F4b-legacy RED-after (packages/db/src/tenant.ts)
✖ T-025 legacy rule: documents without tenantId are invisible to a tenant, and are never adopted, changed or deleted through a scope (3.8901ms)
=== F5-concern-edge-stamp GREEN-before
✔ T-025 api (T-022 merge): concern_flagged edges are stamped with the token's tenant, the same student/session in two tenants coexist, and A's erasure deletes only A's (102.3533ms)
=== F5-concern-edge-stamp RED-after (packages/db/src/tenant.ts)
✖ T-025 api (T-022 merge): concern_flagged edges are stamped with the token's tenant, the same student/session in two tenants coexist, and A's erasure deletes only A's (94.7047ms)
=== F6-unique-index GREEN-before
✔ T-025: every UNIQUE index in INDEX_PLAN leads with tenantId (per-tenant uniqueness, INDEX_PLAN) (0.8947ms)
✔ T-025: the fake enforces the tenant-led facts index: the same open (studentId, key) in two tenants coexists, a duplicate within one tenant is 11000 (0.8403ms)
=== F6-unique-index RED-after (packages/db/scripts/db-init.ts)
✖ T-025: every UNIQUE index in INDEX_PLAN leads with tenantId (per-tenant uniqueness, INDEX_PLAN) (2.0012ms)
✖ T-025: the fake enforces the tenant-led facts index: the same open (studentId, key) in two tenants coexists, a duplicate within one tenant is 11000 (0.7505ms)
=== F7-hardcoded-issuer GREEN-before
✔ T-025 B21 contract: ... differ ONLY in config ... (53.2291ms)
✔ T-025 B21 contract: no issuer or key is hard-coded in apps/api/src, ... (215.4645ms)
=== F7-hardcoded-issuer RED-after (apps/api/src/auth.ts)
✖ T-025 B21 contract: ... differ ONLY in config ... (50.5504ms)
✖ T-025 B21 contract: no issuer or key is hard-coded in apps/api/src, ... (3.5515ms)
=== F8-private-key-tracked GREEN-before
✔ T-025 B21 contract: no issuer or key is hard-coded ... no private key is tracked in git (149.9492ms)
=== F8-private-key-tracked RED-after (git add leak-synthetic.pem)
✖ T-025 B21 contract: no issuer or key is hard-coded ... no private key is tracked in git (124.1959ms)
```
The first F2 run (before the JWKS cases) stayed GREEN after the edit (a surviving mutant); that is why the test was hardened.
A second probe, removing only the `none` check, stays GREEN by design: the allow-list refuses `none` independently (two layers).

## Open gaps

- **Cards and timeline** (B21's capability list) have no routes: no engine read function exists for them yet on main.
  Routes now: scribe start/resume, approval get/decide, transcript, profile, erasure request/confirm/execute, export, OpenAPI.
  Concerns (T-022) are reachable through export only; a dedicated concerns route is not added.
- **KB client (T-026) and signed webhooks (T-027)** are separate units; nothing here calls the KB or sends events.
- **Live index migration:** `INDEX_PLAN` now declares tenant-led unique indexes. On a `virtual_counsellor` that already
  holds the pre-T-025 unique indexes, running db-init needs a gated step to drop the old ones (same collections,
  different keys). Not run: nothing touches the real Mongo in this unit.
- **Legacy documents** without `tenantId` are refused (invisible to every tenant). Any backfill is a separate, human-gated step.
- **Real issuer:** the placeholder `umesh` stays until the Pathlynks backend supplies its issuer and key/JWKS; the switch is
  `.env` only, covered by the contract test above.
- No senior-engineer review dispatched by this build (the orchestrator's brief forbids dispatching reviewers here).

## Status: ready-for-check
