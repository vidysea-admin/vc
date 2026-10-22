# pc-reserved-ids - checker coordinator A (blind dual check)

Cycle checked: 0
Policy-Version: proportional-verification/2026-10-19.17
VERDICT: PASS
CHECKED-STATE: worktree D:/vc/.worktrees/pc-reserved-ids, branch wave/pc-reserved-ids, code 11234e1, manifest e2469e7, base bffd1b7 (merge-base verified = bffd1b7). Product code unchanged by this check.

## Criteria
- R1 PASS. Executed hostile variants (own test, outside the tree): addPartner AND runPartnerCli refuse sandbox, SANDBOX, sandbox-1, Sandbox_x, admin.2, root-, system--x, internal/9, vc-synthetic-demo, VC-Synthetic-Demo, scribe-evaluation, ids from VC_RESERVED_TENANT_IDS parsed from a messy list ("  Later-Tenant ,, <tab>OTHER-tenant  ,<newline> Sbx-Main ,,") in any case, and a configured sandboxTenantId; a name-only add ("Sandbox One" -> sandbox-one) is refused; nothing written. vidysea-website, vidysea, pathlynks, vidysea-web, later-tenant-2 still add.
- R2 PASS. Records inserted directly into the store (sandbox-1, admin-2, vc-synthetic-demo, scribe-evaluation, sandbox, later-tenant, sbx-main), with later-tenant/sbx-main reserved AFTER the records existed: both vck_srv_ and vck_pub_ refused with 401 on student threads, turns and profile; byte-identical to a garbage token's response (status + sorted headers + body) per route family; 0 chat_threads rows written; healthy partner still 201. Anonymous text route: bad-key bytes equal for reserved pub and srv keys, KB not called. Voice: POST /v1/public/voice/sessions (pub) and POST .../voice/sessions (srv) body and headers equal to an unknown-key response, dbForTenant never called with a reserved tenant, healthy partner mints 201. CORS: originAllowedByAnyPartner false for every reserved partner's origin, preflight and keyed request get no Access-Control-Allow-Origin, positive control on the same path for a healthy partner grants it. OpenAPI route is static and takes no key. All key entry points route through registry.authenticate (chat.ts:846, voice.ts:1703/1772, anonymous.ts:464, withPartnerRoutes CORS) - no other reader of partner docs.
- R3 PASS. See Metrics/commands in checkpoint: partners 55/0, partner-voice 32/0, partner-openapi 15/0, auth 15/0, server 34/0, index 8/0, chat 34 pass / 1 fail = only the known A20 baseline red, anonymous-route H2|H6|G5|K2|K4 9/0, tsc --noEmit exit 0.
- Falsification (copy outside the tree, restored, diff-identical to worktree, green 7/0 before and after): R1 isReservedPartnerId family clause removed -> 4 red; R2 authenticate ignoring the configured list -> 2 red; R2 originAllowedByAnyPartner check removed -> 1 red; R3 "pathlynks" added to RESERVED_PARTNER_IDS -> partners.test 15 red (existing suites detect over-refusal).

## Tenant-id source map review
No tenant source missed in the repo: JWT tenant claims (not enumerable by the server), sandboxTenantId (programmatic option only, launcher never sets it, covered at runtime via http.chat.sandboxTenantId), two repo literals, anonymous partner id = page key's partner. With VC_RESERVED_TENANT_IDS empty the server is safe for the built-in family, the two repo tenants and the sandbox tenant; JWT tenants are unprotected until ops lists them (inherent, stated in .env.example and docs/partner-integration.md section 4).

## Findings (non-blocking, none contradicts R1-R3)
PROPOSED-ISSUE (low): docs/go-live-checklist.md and docs/runbook-golive.md say nothing about partner keys or VC_RESERVED_TENANT_IDS; the ops step "list every tenant your student JWTs carry" lives only in .env.example and docs/partner-integration.md. Add a go-live line before partner keys go live.
PROPOSED-ISSUE (low): startApi reads the list once at start (a function-valued reservedIds is only used by tests), so adding a tenant needs a restart, and an empty list gives no startup warning that JWT tenants are unprotected. Consider a one-line log.
PROPOSED-ISSUE (low): createPartnerRegistry({reservedIds}) folds case/width but does not trim; a caller passing raw " Later-Tenant " (not via reservedTenantIdsFromEnv) fails open for that entry. Not reachable from the env path (parser trims). Trim in foldId would harden it.
PROPOSED-ISSUE (info): an already-minted voice ws token (60 s TTL, VOICE_WS_TOKEN_TTL_SEC) stays valid for its life after a tenant is reserved; the stream upgrade does not re-authenticate the partner. Bounded by 60 s.
PROPOSED-ISSUE (info): the name+separator rule also refuses an existing real partner whose id happens to start with a built-in word plus hyphen (e.g. root-x, system-y); ops should list partners before deploy (partner list). Fails closed, intended.

LIVE-BROWSER: Not UI-touching.
ISSUES-WRITTEN: none (blind dual check); PROPOSED-ISSUE lines above only.
Not done: no full suite, no real Mongo, no live LLM calls, no process killed, no product code changed.
Metrics: start=2026-10-22T13:26:26+05:30 end=2026-10-22T13:34:25+05:30 wall_min=8 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=13 mutations=4 cycle=0 policy=proportional-verification/2026-10-19.17 tokens=unavailable
