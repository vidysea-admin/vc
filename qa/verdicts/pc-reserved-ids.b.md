# pc-reserved-ids — coordinator B (blind dual check), Tier L

Cycle checked: 0
Policy-Version: proportional-verification/2026-10-19.17
VERDICT: PASS
CHECKED-STATE: wave/pc-reserved-ids head e2469e7 (code 11234e1), merge-base main bffd1b7. Dual trigger tenancy partners.ts:282. The other coordinator's output was not read.

## Criteria
- R1 PASS: addPartner and the CLI path refuse sandbox, SANDBOX, sandbox-1, Sandbox_x, admin.2, configured env ids (spaces, case, empty entries parsed by reservedTenantIdsFromEnv), vc-synthetic-demo, scribe-evaluation and a configured sandbox id; pathlynks, vidysea-web, vidysea-website still add (builder tests 7/7 plus my isReservedPartnerId/env variants, executed).
- R2 PASS: a record inserted directly (sandbox-1, scribe-evaluation) and a partner whose id is listed AFTER it exists are refused for vck_srv_ and vck_pub_ with status, headers and body byte-equal to an unknown-key 401 on chat (builder test, 7/7 re-run), student voice mint, anonymous voice mint and the anonymous voice preflight (my copy test); no tenant Db opened for refused keys; a blocked partner's origin gets no preflight grant. All key-auth call sites run through the two edited registry functions.
- R3 PASS: partners 55/55, partner-voice 32/32, partner-openapi 15/15, auth 15/15, server 34/34, index 8/8, anonymous-route "H2|H6|G5|K2|K4" 9/9, chat 34/35 with only the known A20 baseline red, tsc --noEmit exit 0.
- Falsification, one per criterion, in a copy outside the tree: R1 clause removed -> 4/7 red; R2 authenticate check removed -> 3/7 red plus my voice test red; CORS check removed -> 1/7 plus my voice test red; restored, diff -q identical, green again.
- Tenant-id source map: complete (no further source found). Empty VC_RESERVED_TENANT_IDS fails safe to built-ins, repo tenants and the sandbox id.

## Proposed issues (root owns the ledger; none written)
- PROPOSED-ISSUE medium (ops/docs): VC_RESERVED_TENANT_IDS is stated in .env.example and docs/partner-integration.md but NOT in docs/go-live-checklist.md or docs/runbook-golive.md (neither has any partner step). The real Vidysea/Pathlynks JWT tenants are unknowable to the server, so until ops fills the list only the built-ins, the two repo tenants and the sandbox id are protected. Add a go-live checklist line: list every tenant claim your student JWTs carry in VC_RESERVED_TENANT_IDS before creating partners. Tension to note: if the Pathlynks JWT tenant is literally "pathlynks" (partner-voice tests sign tenant "pathlynks"), listing it would block the partner id the docs use; ops must then pick a distinct partner id.
- PROPOSED-ISSUE low: a voice WS token minted before a tenant is listed stays usable up to VOICE_WS_TOKEN_TTL_SEC (60 s) and an already open stream is not cut; acceptable window, document it.
- PROPOSED-ISSUE low: isReservedPartnerId does not trim the reservedIds array entries (the env parser does); a programmatic sandboxTenantId with stray spaces would not match. Trim in foldId or at startApi.

LIVE-BROWSER: Not UI-touching. Persona walk: skip (api).
SERIAL: all runs through vc-testlock, one at a time; no full suite, no live LLM/Mongo, no process killed, no product code changed; the only writes are this verdict, my checkpoint and files under my scratchpad.
Evidence: qa/checkpoints/pc-reserved-ids.b.md
Metrics: start=2026-10-22T13:26:31+05:30 end=2026-10-22T13:33:19+05:30 wall_min=unavailable agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=11 mutations=3 cycle=0 policy=proportional-verification/2026-10-19.17 tokens=unavailable
