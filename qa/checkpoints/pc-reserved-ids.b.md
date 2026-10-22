# Checkpoint — pc-reserved-ids, coordinator B, cycle 0 (completed PASS)

Policy-Version: proportional-verification/2026-10-19.17. Worktree D:/vc/.worktrees/pc-reserved-ids, branch wave/pc-reserved-ids, head e2469e7 (code 11234e1); merge-base with main = bffd1b7 (verified). The other coordinator's verdict/checkpoint was not read.

## Commands (all via `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 600 pnpm exec tsx --test ...`, cwd apps/api, executed by me in the worktree)
- tests/partners.test.ts: 55 tests, 55 pass, 0 fail
- tests/partner-voice.test.ts: 32/32 pass; tests/partner-openapi.test.ts: 15/15; tests/auth.test.ts: 15/15; tests/server.test.ts: 34/34; tests/index.test.ts: 8/8
- tests/chat.test.ts: 35 tests, 34 pass, 1 fail = only the known A20 baseline red ("A20 flag on but gate closed ...")
- `--test-name-pattern="H2|H6|G5|K2|K4" tests/anonymous-route.test.ts`: 9/9 pass
- `pnpm exec tsc --noEmit` (apps/api): exit 0, no output

## Hostile variants (executed in a copy under my scratchpad, copy/ with node_modules junctions; copy partners.ts byte-identical to the worktree's before mutation)
Added two tests ("B-hostile") to the COPY of tests/partner-voice.test.ts only:
1. Legacy records inserted straight into the store (sandbox-1, scribe-evaluation) plus a partner "later-tenant" added normally: student voice mint with srv and pub keys, anonymous voice mint with pub keys, and the OPTIONS preflight on the anonymous voice route all return status+headers+body byte-equal to an unknown-partner key (UNAUTHORIZED() compare); no tenantScopedDb opened for refused keys (dbCalls empty); no Allow-Origin on preflight for the blocked partners' origins; after "LATER-TENANT" is returned by the registry's reserved function the next anon mint is the same uniform 401; the unrelated "pathlynks" partner still mints 201.
2. isReservedPartnerId with extra [Tenant-A, TENANT_B]: sandbox, SANDBOX, sandbox-1, Sandbox_x, admin.2, vc-synthetic-demo, scribe-evaluation, tenant-a, TENANT_B all true; pathlynks, vidysea-web, vidysea-website, vidysea, sandbox1, sandboxed all false. reservedTenantIdsFromEnv(" Tenant-A ,, TENANT_B<tab>,<newline> tenant-c ") = [Tenant-A, TENANT_B, tenant-c]. Both pass (2/2).
Observations from the same run: (a) a reservedIds ARRAY entry with surrounding spaces ("  LATER-TENANT ") is not trimmed by isReservedPartnerId, so it did not match (mint stayed 201); the env path trims, only a programmatic caller (sandboxTenantId) could hit it (low). (b) A voice token minted before a tenant is listed stays valid up to VOICE_WS_TOKEN_TTL_SEC=60 and its stream connected (anon ws ok:true): a window of at most 60 s; anon sessions open no tenant Db.

## Key-auth entry points (grep, whole apps/api/src)
registry.authenticate is called at chat.ts:846 (srv), voice.ts:1703 (srv), voice.ts:1772 (pub mint), anonymous.ts:464 (pub), and in partners.ts withPartnerRoutes (CORS grant, pub); originAllowedByAnyPartner serves the preflight. All go through the two edited registry functions. The WS stream upgrade authenticates a 60 s single-use signed token, not a key. The OpenAPI route serves a static document with no key.

## Falsification (copy only, restored; diff -q to the worktree file identical after)
- R1: removed the name+separator+suffix clause of isReservedPartnerId -> pattern "^R[12]" red 4 of 7 (green 7/0 before and after).
- R2: deleted the reserved check line in authenticate -> red 3 of 7 (R2 x2 + wiring) and my B-hostile voice test red.
- R2 CORS: removed the reserved test from originAllowedByAnyPartner -> red 1 of 7 (public chat route test) and B-hostile voice red (preflight).

## Tenant-id source map
Builder's map checked against grep: JWT tenant claims (auth.ts) unlistable by the server -> VC_RESERVED_TENANT_IDS; sandboxTenantId only via http.chat.sandboxTenantId (index.ts:403, 532, 779; voice.ts:298 shares it); literals vc-synthetic-demo (apps/web/demo/seed.ts) and scribe-evaluation (packages/engine/evals/score.ts) = KNOWN_TENANT_IDS; no other tenant literal found in apps/packages/scripts. Anonymous partner id = the page key's partner id, refused on the pub path. Empty VC_RESERVED_TENANT_IDS: reservedTenantIdsFromEnv returns [], built-in names, the two repo tenants and the sandbox id stay protected (checked by test), server starts normally.
Ops statement: .env.example (lines 131-133) and docs/partner-integration.md section 4 state it; docs/go-live-checklist.md and docs/runbook-golive.md do NOT mention VC_RESERVED_TENANT_IDS (nor any partner step).
