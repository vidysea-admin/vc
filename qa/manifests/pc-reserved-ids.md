# Manifest — pc-reserved-ids
**Contract:** ISS-pc-partner-keys-1 (qa/issues.jsonl); brief qa/evidence/p1-briefs/pc-reserved-ids.md, criteria R1-R3 (verbatim below). Not an edit to qa/contracts.
**Goal task:** none
**Date:** 2026-10-22
**Fix cycle:** 0
**Dual check:** yes
**Dual-trigger:** tenancy apps/api/src/partners.ts:282 (the partner id becomes the tenant id of every record a vck_srv_ key reaches; chat.ts:855 and voice.ts:1712 set `tenantId: partner.partnerId`)
**Persona walk:** skip (api)
**Live browser:** Not UI-touching
**Issues addressed:** ISS-pc-partner-keys-1
**Executor:** claude-sonnet-subagent
**Executor rationale:** one build unit in one worktree (D:/vc/.worktrees/pc-reserved-ids, branch wave/pc-reserved-ids, base bffd1b7).

## Where tenant ids are configured or derived (found, with file:line)
- Env / config file: NO env variable or config file lists tenant ids. `grep -rn "TENANT"` over apps/packages/scripts/.env.example finds only claim-name variables (`VC_STUDENT_JWT_CLAIM_TENANT`, apps/api/src/auth.ts:328) and none that names a tenant.
- JWT `tenant` claim: counsellor token apps/api/src/auth.ts:252-258, student token auth.ts:407-415 (`tenantId: tenant`, checked only against TENANT_ID_PATTERN, packages/db/src/tenant.ts:51). The values live inside signed tokens, so the server cannot enumerate them.
- Sandbox: `ChatApiDeps.sandboxTenantId` (apps/api/src/chat.ts:240, voice.ts:298), fed from `StartApiChatOptions.sandboxTenantId` (apps/api/src/index.ts:402, 772). It is a programmatic option only: no env variable sets it and the launcher (apps/api/src/main.ts) never does. Used as `ctx.tenantId === deps.sandboxTenantId` (chat.ts:866, voice.ts:1721).
- Tenants this repo writes under as literals: `vc-synthetic-demo` (apps/web/demo/seed.ts:181), `scribe-evaluation` (packages/engine/evals/score.ts:26).
- Anonymous partner ids: the anonymous route has no tenant (anonymous.ts, no tenantId); a page key's partner id is the `tenant` of the minted anonymous voice token (voice.ts:432, `tenant: partnerId`).
- Mapping from a srv key to the student tenant: chat.ts:842-855 and voice.ts:1698-1712 — `registry.authenticate(token, "srv")` returns the partner, then `ctx = { tenantId: partner.partnerId, ... }`; `deps.dbForTenant(ctx.tenantId)` (index.ts:699, server.ts:958) = `tenantScopedDb(db, tenantId)`. So a partner id equal to a student JWT tenant id reaches exactly that tenant's documents.
- Consequence for the design: because the JWT tenants and (in the launcher) the sandbox are not in any server config, this unit adds ONE new operator list, `VC_RESERVED_TENANT_IDS`, read by both the CLI and `startApi`; `startApi` adds `http.chat.sandboxTenantId` to it.

## What changed
- apps/api/src/partners.ts: new `KNOWN_TENANT_IDS`, `RESERVED_TENANT_IDS_ENV`, `isReservedPartnerId(id, extra)` (NFKC + lower-case fold; exact match on built-in names, known tenants and `extra`; built-in name + non-alphanumeric separator + any suffix), `reservedTenantIdsFromEnv(env)` (malformed list -> PartnerConfigError naming the variable). Edited in place: `addPartner` (reserved check first, on the folded id, then the ASCII pattern), `PartnerRegistryOptions.reservedIds` (array or function, asked on every request), `createPartnerRegistry.authenticate` (reserved partner id -> `undefined`, the same uniform 401 as any bad key, after the usual HMAC work) and `originAllowedByAnyPartner` (a blocked partner's origins get no preflight grant). No new module.
- apps/api/scripts/partner.ts: reads `reservedTenantIdsFromEnv(process.env)` and passes `reservedIds` into `runPartnerCli` (no flag needed; a malformed list exits 1 before connecting).
- apps/api/src/index.ts: `startApi` builds the registry with `reservedIds = VC_RESERVED_TENANT_IDS + http.chat.sandboxTenantId`, computed before anything connects.
- apps/api/tests/partners.test.ts: 7 new tests (R1 x4, R2 x3). .env.example: `VC_RESERVED_TENANT_IDS`. docs/partner-integration.md section 4: the id rule.

## Deviations and findings the checker should know
1. New config surface: `VC_RESERVED_TENANT_IDS` did not exist. Until the operator lists the student-JWT tenants in it, only the built-in names, the two repo tenants and the sandbox tenant are protected; the CLI cannot learn JWT tenants by itself (they are in signed claims). Runbook item for ops, not enforceable in code.
2. `sandboxTenantId` is only protected at runtime when startApi receives it via `http.chat.sandboxTenantId`; the CLI cannot see a programmatic option (the launcher sets none), so for the CLI the sandbox tenant is covered by the built-in `sandbox` family or by listing it in the env.
3. A name that merely starts with a reserved word (`sandboxed`, `administrator`) is NOT refused (no separator), as the brief's "name followed by a separator and suffix" says. `sandbox1` (no separator) is therefore allowed.
4. Ids are ASCII-validated: PARTNER_ID_PATTERN `^[a-z0-9-]{2,32}$` (partners.ts) and the key pattern (partners.ts PARTNER_KEY_PATTERN) both exclude non-ASCII, so a Cyrillic/full-width look-alike cannot be added or parsed from a key; verified by test, and `isReservedPartnerId` folds NFKC anyway.
5. The reserved check in `addPartner` now runs BEFORE the pattern check, so `SANDBOX` is refused as reserved (message says "reserved"), where before it was "must match ...". The error text still quotes the id and never a key.
6. `pnpm install --offline --frozen-lockfile` in the worktree rewrote pnpm-lock.yaml (+2 lines, widget leftover); restored with git checkout, not committed.
7. chat.test.ts: the known A20 baseline red ("A20 flag on but gate closed ...") is the only failure, 34 of 35 pass; unchanged by this unit.

## Acceptance criteria and evidence
Policy-Version: proportional-verification/2026-10-19.17
Tier: L, Dual check: yes. Base bffd1b7, code commit 11234e1.

R1 add refuses collisions: addPartner refuses an id that equals any configured tenant id (all sources found above), any built-in reserved name, or a reserved name followed by a separator and suffix (e.g. sandbox-1, admin_2, root.x), case-insensitively. The CLI passes the configured tenant ids automatically (no manual flag needed). Existing valid ids (the Vidysea website and Pathlynks partner ids used in tests/docs) still add.
R2 runtime defence: a vck_srv_ (and vck_pub_) key whose partner id collides with a configured tenant id or reserved pattern is refused at request time (401/403, uniform body, no tenant data read), so a partner record created before this fix, or a tenant configured later, cannot be used to reach that tenant's students.
R3 no regression: partners, partner-voice, partner-openapi, auth, chat (A20 is a known baseline red), anonymous-route "H2|H6|G5|K2|K4", server, index tests green; tsc --noEmit for apps/api.

Tests[R1]: apps/api/tests/partners.test.ts "R1: add refuses sandbox-1, SANDBOX, Sandbox-x, admin_2, root.x ..." (13 refused ids incl. through runPartnerCli and the name slug, 8 near-miss ids still add incl. pathlynks, vidysea-web), "R1: add refuses an id equal to any configured tenant id ...", "R1: isReservedPartnerId normalises case and width ..." (Cyrillic, zero-width, dotless-i look-alikes), "R1: the CLI takes the configured tenant ids from the environment ..." (env parse, malformed list, scripts/partner.ts wiring, runPartnerCli forwarding).
Tests[R2]: "R2: a partner record made before the fix (sandbox-1, or an id later configured ...)" (real chat handler, refusal bytes equal a bad token's, an id configured AFTER the partner was added is refused on the next request, no document written under the reserved tenant, unrelated partner unaffected), "R2: the same refusal on the public chat route (vck_pub_) ..." (knowledge base not called, no Allow-Origin, no preflight grant), "R2 wiring: through launch() ..." (env list and sandboxTenantId reach the running registry; bad list refuses before connect).
Tests[R3]: the existing suites named in R3.

Pre-check[R1]: 11234e1 `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 600 pnpm exec tsx --test --test-name-pattern="^R[12]" tests/partners.test.ts` (apps/api) -> exit 0, 7 passed, 0 failed
Pre-check[R2]: 11234e1 same command (R1 and R2 are the same 7 tests) -> exit 0, 7 passed, 0 failed
Pre-check[R3a]: 11234e1 `... tsx --test tests/partners.test.ts` -> exit 0, 55 passed, 0 failed (48 existing + 7 new)
Pre-check[R3b]: 11234e1 `... tsx --test tests/partner-voice.test.ts` -> exit 0, 32 passed, 0 failed
Pre-check[R3c]: 11234e1 `... tsx --test tests/partner-openapi.test.ts` -> exit 0, 15 passed, 0 failed
Pre-check[R3d]: 11234e1 `... tsx --test tests/auth.test.ts` -> exit 0, 15 passed, 0 failed
Pre-check[R3e]: 11234e1 `... tsx --test tests/chat.test.ts` -> exit 1, 34 passed, 1 failed (the known A20 baseline red "A20 flag on but gate closed: the real repo qa/gates (B13 pending) ...", nothing else)
Pre-check[R3f]: 11234e1 `... tsx --test --test-name-pattern="H2|H6|G5|K2|K4" tests/anonymous-route.test.ts` -> exit 0, 9 passed, 0 failed
Pre-check[R3g]: 11234e1 `... tsx --test tests/server.test.ts` -> exit 0, 34 passed, 0 failed; `... tests/index.test.ts` -> exit 0, 8 passed, 0 failed
Pre-check[R3h]: 11234e1 `... pnpm exec tsc --noEmit` (apps/api) -> exit 0, no output

Falsify[R1]: in a copy outside the tree (D:/vc_fals_pcri, install --offline) `addPartner` put back to the old `RESERVED_PARTNER_IDS.includes(partnerId) || ctx.reservedIds.includes(partnerId)` -> red (2 failing: the two R1 add tests); script mutation: `pepper, reservedIds }` -> `pepper }` in scripts/partner.ts -> red (1 failing: "the CLI takes the configured tenant ids from the environment ...").
Falsify[R2]: `authenticate` without the `isReservedPartnerId(doc.partnerId, reservedNow())` line -> red (3 failing: both R2 request-path tests and the launch wiring test); `startApi` registry built without `reservedIds: partnerReservedIds` -> red (1 failing: "R2 wiring"). Unmutated copy 7/0 before and after, restored file identical to the worktree's (diff -q).

## Metrics
Metrics: start=2026-10-22T13:05:30+05:30 end=2026-10-22T13:25:00+05:30 builder_min=20 wall_min=20 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=16 mutations=4 cycle=0 policy=proportional-verification/2026-10-19.17 tokens=unavailable
Sessions: 2b04f90e-6b56-4682-a76c-d8515b93405c

## Not verified here (for the checker)
- The real JWT tenants of the Vidysea/Pathlynks students: unknowable from the repo; ops must list them in VC_RESERVED_TENANT_IDS.
- Real Mongo and the real CLI binary against a database (no live connection; the script wiring is checked by source + the forwarding path by test).
- The full suite and the go-live gate were not run (brief: no full suite).
- No fresh-context senior-software-engineer review was run by the maker (a subagent cannot dispatch one); the dual checker covers review.

Status: ready-for-check
