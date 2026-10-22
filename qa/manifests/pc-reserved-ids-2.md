# Manifest — pc-reserved-ids-2
**Contract:** ISS-pc-reserved-ids-1..5 (qa/issues.jsonl); brief qa/evidence/p1-briefs/pc-reserved-ids-2.md, criteria S1-S5 (verbatim below). Not an edit to qa/contracts.
**Goal task:** none
**Date:** 2026-10-22
**Fix cycle:** 0
**Dual check:** yes
**Dual-trigger:** tenancy apps/api/src/partners.ts isReservedPartnerId (the partner id becomes the tenant id of every record a vck_srv_ key reaches; chat.ts:855 and voice.ts:1712 set `tenantId: partner.partnerId`)
**Persona walk:** skip (api)
**Live browser:** Not UI-touching
**Issues addressed:** ISS-pc-reserved-ids-1, ISS-pc-reserved-ids-2, ISS-pc-reserved-ids-3, ISS-pc-reserved-ids-4, ISS-pc-reserved-ids-5 (ISS-pc-reserved-ids-6 is info, not addressed)
**Executor:** claude-sonnet-subagent
**Executor rationale:** one build unit in one worktree (D:/vc/.worktrees/pc-reserved-ids-2, branch wave/pc-reserved-ids-2, base eb2c132).

## Scope mapping found in the code (the basis of the S2 design)
- A `vck_srv_` request's partner id IS the student tenant scope; there is no separate tenant field or config. chat.ts:842-855: `partner = await deps.partners.authenticate(token, "srv")` then `ctx = { tenantId: partner.partnerId, studentId, ... }`; voice.ts:1698-1712 the same (`tenantId: partner.partnerId`). Then `deps.dbForTenant(ctx.tenantId)` (chat.ts:870 -> index.ts tenantScopedDb) reads and writes exactly the documents of tenant == partner id. The page key (`vck_pub_`) reaches no tenant (anonymous route; `tenant: partnerId` only on the minted anonymous voice token, voice.ts:432).
- Consequence: a partner can only ever reach the tenant named by its OWN id. The only collision that exists is "partner id == a real JWT tenant id", and the only meaningful exemption is "this exact partner may be that tenant". No `<partner>:<other-tenant>` binding can exist, because a partner cannot reach any tenant but its own.
- Design chosen (smallest that fits): ONE new env list `VC_PARTNER_OWN_TENANTS=<partner>:<tenant>[,...]`, parsed by `partnerOwnTenantsFromEnv`, requiring both halves to be the same id (a mismatched pair is a config error naming the variable), and refusing a built-in reserved name or repo tenant. It is passed to `addPartner` (`PartnerOpContext.ownTenants`), `rotatePartner`, and `createPartnerRegistry({ ownTenants })`, where `isReservedPartnerId(id, extra, ownTenants)` exempts a configured (VC_RESERVED_TENANT_IDS or sandbox) tenant id only for a partner whose id is EXACTLY a bound id. Rejected alternatives: a per-partner `--own-tenant` flag stored on the partner document (needs a schema change and cannot cover partners added before the list, e.g. an existing `pathlynks`; also puts an authorisation decision in mutable data instead of the operator config, so a store write could self-exempt a partner); a binding to a tenant different from the partner id (cannot exist, see above).

## What changed
- apps/api/src/partners.ts: `isReservedPartnerId` (in place) now checks built-in names and repo tenants first with no exemption, then configured entries trimmed and folded (S4, blank entries reserve nothing), and exempts only an exact bound id (S2); new `PARTNER_OWN_TENANTS_ENV`, `partnerOwnTenantsFromEnv`, `reservedTenantIdsWarning`; `PartnerOpContext` gains `ownTenants` and `warn`; `addPartner`, `rotatePartner` (new reserved refusal after the revoked check, before any key is generated: S5), `runPartnerCli` (warns on stderr for add/list when `reservedIds` is empty: S1), `PartnerRegistryOptions.ownTenants` used in `authenticate` and `originAllowedByAnyPartner`. No new module.
- apps/api/src/index.ts `startApi`: the two lists are parsed only when the pepper is set (S3); with the pepper unset and either variable set it logs one `reserved_tenant_ids_ignored` note and does not throw; with partners on and the list empty it logs one `reserved_tenant_ids_empty` warning (S1) and still starts; binding the configured `chat.sandboxTenantId` is a PartnerConfigError (never exemptable); `logPartnerNote` helper added next to the other stderr loggers.
- apps/api/scripts/partner.ts: reads `partnerOwnTenantsFromEnv(process.env)` before connecting and passes `ownTenants` and `warn: console.error` (prefix "warning: ") into `runPartnerCli`.
- Docs in place: docs/go-live-checklist.md env table (VC_RESERVED_TENANT_IDS, VC_PARTNER_OWN_TENANTS), docs/runbook-golive.md new section "Before deploy: partner ids against tenants", docs/partner-integration.md section 4, .env.example.
- apps/api/tests/partners.test.ts: 8 new tests (S1 x2, S2 x3, S3, S4, S5).
- Line endings: the working-tree copies of the touched files were CRLF (core.autocrlf=true, index LF); I normalised them to LF in this worktree to edit them; git stores LF either way (diffstat shows only real changes).

## Deviations and findings the checker should know
1. S2 is env-list-only (no CLI flag, no document field), justified above. `partner add --own-tenant` does not exist. The binding takes effect for an existing partner as soon as the server restarts with the variable (no data migration).
2. A bound id is matched EXACTLY (no case or width fold) while the tenant list is folded, so `PATHLYNKS` or a full-width look-alike stays refused (test "S2: an operator can list ...").
3. Never exemptable, enforced in 4 places: the env parser (config error), `isReservedPartnerId` (checked before the exemption, so a programmatic `ownTenants: ["sandbox-1"]` does nothing), `addPartner`/registry (via that function), and startApi for the sandbox tenant id (PartnerConfigError before anything connects).
4. S3: when the pepper is unset neither list is parsed (so a malformed `VC_PARTNER_OWN_TENANTS` is also ignored then); the note never echoes the value.
5. S1 warning is a JSON line on stderr (`level: "warn"`, `event: "reserved_tenant_ids_empty"`), emitted once per startApi call; the existing launch-based tests now print it as noise when they set a pepper without the list.
6. S5 order: not-found, then revoked ("add a new partner instead"), then reserved; a revoked reserved partner therefore reports "revoked". `revoke` is unchanged.
7. `pnpm install --offline --frozen-lockfile` rewrote pnpm-lock.yaml (+2 lines, widget leftover, as in the previous unit); restored with git checkout, not committed.
8. chat.test.ts: the known A20 baseline red is the only failure (34 of 35), unchanged.
9. ISS-pc-reserved-ids-6 (reverse direction, KNOWN_TENANT_IDS tie, 60 s voice token) is info and left open on purpose.

## Acceptance criteria and evidence
Policy-Version: proportional-verification/2026-10-19.17
Tier: L, Dual check: yes. Base eb2c132, code commit eaeab58 (full sha eaeab581b13d0c2d0819f2cc2a2bfaf14b711130).

S1 empty list is loud, not silent: when partners are enabled (pepper set) and VC_RESERVED_TENANT_IDS is empty or unset, startApi logs one clear warning naming the variable and the consequence (real JWT tenants unprotected), and `partner add`/`partner list` in the CLI print the same warning to stderr. No warning when the list is set. The server still starts (warning, not refusal).
S2 a partner's own tenant does not self-block: an operator can list every real JWT tenant, including one equal to an existing partner's own id (e.g. pathlynks), without blocking that partner, ONLY when the partner is explicitly bound to that tenant (an explicit, operator-set binding such as a per-partner flag recorded at `partner add --own-tenant` or a VC_PARTNER_OWN_TENANTS=<partner>:<tenant> list; pick the smallest design that fits the scope mapping found above and justify it). Any other partner whose id equals or looks like that tenant stays refused at add and per request. Built-in reserved names (sandbox, admin, ...) and the repo tenants can never be exempted.
S3 malformed VC_RESERVED_TENANT_IDS is fatal only when partners are enabled; with the pepper unset, startup ignores the variable (log a note, no throw).
S4 programmatic reservedIds entries are trimmed and case-folded the same way as the env parser (createPartnerRegistry and addPartner ctx).
S5 `partner rotate` on a partner whose id is now reserved refuses with a clear message (and mints no key); `revoke` still works.

Tests[S1]: apps/api/tests/partners.test.ts "S1: partner add and partner list warn on stderr ..." (CLI: warns once on add and on list with reservedIds empty/unset, silent with a list, script wired to console.error) and "S1: startApi logs one warning ..." (launch with the list unset, "" and blank: one line naming the variable and "unprotected", server starts; silent when the list is set; silent with no pepper).
Tests[S2]: "S2: an operator can list a tenant equal to an existing partner's own id and bind it ..." (bound pathlynks adds and authenticates both keys; unbound refused at add and per request; another listed tenant refused despite the binding; exact match only), "S2: built-in names, the repo tenants and the sandbox tenant can never be exempted ..." (env parser rejects 13 malformed or forbidden pairs; programmatic exemption of sandbox/sandbox-1/admin_2/repo tenants refused at add and per request; startApi refuses to bind the sandbox tenant before connecting), "S2 wiring: through launch() ..." (env lists reach the running server: bound partner answered 200, unbound listed tenant 401).
Tests[S3]: "S3: a malformed VC_RESERVED_TENANT_IDS is fatal only when partners are enabled ..." (pepper set: rejects naming the variable; pepper unset: starts, one note, value not echoed).
Tests[S4]: "S4: programmatic reservedIds entries are trimmed and case-folded ..." (isReservedPartnerId, addPartner ctx, createPartnerRegistry array and function forms, blank entries, padded binding).
Tests[S5]: "S5: partner rotate on a partner whose id is reserved refuses ..." (built-in family and a configured id, both scopes, via runPartnerCli and rotatePartner; stored doc byte-identical, no key in the message; revoke works; a bound partner still rotates).
Tests[R3]: the existing suites named in the brief.

Pre-check[S1]: eaeab58 `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 600 pnpm exec tsx --test --test-name-pattern="^S1" tests/partners.test.ts` (apps/api) -> exit 0, 2 passed, 0 failed
Pre-check[S2]: eaeab58 same command with pattern "^S2" -> exit 0, 3 passed, 0 failed
Pre-check[S3]: eaeab58 same command with pattern "^S3" -> exit 0, 1 passed, 0 failed
Pre-check[S4]: eaeab58 same command with pattern "^S4" -> exit 0, 1 passed, 0 failed
Pre-check[S5]: eaeab58 same command with pattern "^S5" -> exit 0, 1 passed, 0 failed
Pre-check[R3a]: eaeab58 `... tsx --test tests/partners.test.ts` -> exit 0, 63 passed, 0 failed (55 existing + 8 new)
Pre-check[R3b]: eaeab58 `... tests/partner-voice.test.ts` -> exit 0, 32 passed, 0 failed
Pre-check[R3c]: eaeab58 `... tests/partner-openapi.test.ts` -> exit 0, 15 passed, 0 failed
Pre-check[R3d]: eaeab58 `... tests/auth.test.ts` -> exit 0, 15 passed, 0 failed (B21 included)
Pre-check[R3e]: eaeab58 `... tests/chat.test.ts` -> exit 1, 34 passed, 1 failed (the known A20 baseline red "A20 flag on but gate closed: the real repo qa/gates (B13 pending) ...", nothing else)
Pre-check[R3f]: eaeab58 `... tsx --test --test-name-pattern="H2|H6|G5|K2|K4" tests/anonymous-route.test.ts` -> exit 0, 9 passed, 0 failed
Pre-check[R3g]: eaeab58 `... tests/server.test.ts` -> exit 0, 34 passed, 0 failed; `... tests/index.test.ts` -> exit 0, 8 passed, 0 failed; `... tests/main.test.ts` -> exit 0, 10 passed, 0 failed
Pre-check[R3h]: eaeab58 `pnpm exec tsc --noEmit` (apps/api) -> exit 0, no output

Falsify[S1]: in a copy outside the repo (session scratchpad `fals/`, git archive of eaeab58, install --offline with the D: store) removing the `deps.warn?.(reservedTenantIdsWarning())` line in runPartnerCli -> red (1 failing: "S1: partner add and partner list warn ..."); removing the `logPartnerNote("reserved_tenant_ids_empty", ...)` line in startApi -> red (1 failing: "S1: startApi logs one warning ...").
Falsify[S2]: `})) return !ownTenants.some(...)` -> `})) return true` (binding ignored) -> red (4 failing: both S2 behaviour tests, S4 and S5 which also use a binding); the binding check moved ahead of the built-in checks (built-ins exemptable) -> red (1 failing: "S2: built-in names ..."); the sandbox-binding refusal in startApi disabled -> red (1 failing: same test; the un-refused launch then leaves a server open, so that run ended at the 600 s timeout with 7 pass 1 fail).
Falsify[S3]: lists parsed regardless of the pepper -> red (1 failing: "S3: ...").
Falsify[S4]: `foldId(e.trim())` -> `foldId(e)` -> red (1 failing: "S4: ...").
Falsify[S5]: the reserved refusal in rotatePartner disabled -> red (1 failing: "S5: ...").
Unmutated copy: 8 passed, 0 failed after every restore, and the restored partners.ts and index.ts are identical to the worktree's (line endings ignored).

## Metrics
Metrics: start=2026-10-22T14:27:53+05:30 end=2026-10-22T14:51:00+05:30 builder_min=23 wall_min=23 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=26 mutations=8 cycle=0 policy=proportional-verification/2026-10-19.17 tokens=unavailable
Sessions: 2b04f90e-6b56-4682-a76c-d8515b93405c

## Not verified here (for the checker)
- The real student-JWT tenants of Vidysea/Pathlynks: still unknowable from the repo; ops must list them (now documented, and loud when empty).
- Real Mongo and the real CLI binary against a database (no live connection; the script wiring is checked by source and the forwarding path by test). The CLI stderr text is checked through the `warn` dep and the script's source, not by spawning the script.
- The full suite and the go-live gate were not run (brief: no full suite).
- The tests were written before the code but I did not run them red before implementing (they cannot run without the new exports); the mutation runs above are the red evidence.
- No fresh-context senior-software-engineer review by the maker (a subagent cannot dispatch one); the dual checker covers review.
- One process slip: a one-off `python -` heredoc was used once to rewrite the scratch edit script (it only touched files under the session scratchpad, no repo file); all later Python ran from .py files.

Status: ready-for-check
