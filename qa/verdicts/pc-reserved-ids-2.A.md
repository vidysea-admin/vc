# pc-reserved-ids-2 - checker coordinator A (blind dual check)

Cycle checked: 0
Policy-Version: proportional-verification/2026-10-19.17
VERDICT: PASS
CHECKED-STATE: worktree D:/vc/.worktrees/pc-reserved-ids-2, branch wave/pc-reserved-ids-2, code eaeab58, manifest 360ff8c, base eb2c132 (merge-base verified = eb2c132). Product code unchanged by this check.

## Scope claim (checked first)
PASS. Every route that accepts a vck_srv_ key derives the tenant from the partner id and nothing else: chat.ts:846-855 (`tenantId: partner.partnerId`) and voice.ts:1703-1712 (same); voice stream tenant comes from the token minted from that ctx (voice.ts:453-457). The page key (vck_pub_) reaches the anonymous routes only (anonymous.ts:464, voice.ts:1772) and carries no Db (voice.ts:1517 NO_DB for anon claims). server.ts has no partner handling. Executed: with a bound pathlynks srv key and hostile headers (x-vc-tenant, x-tenant-id, x-vc-tenant-id = acme) the only tenant in chat_threads is "pathlynks". No route reaches another tenant than the key's own partner id.

## Criteria
- S1 PASS. CLI: add and list each warn exactly once with reservedIds unset, [] and the parse of "  ,, "; rotate/revoke do not warn; a set list is silent; scripts/partner.ts wires `warn` to console.error (source). startApi via launch(): exactly one JSON stderr line (level warn, event reserved_tenant_ids_empty, names VC_RESERVED_TENANT_IDS and "unprotected") for unset, "", "   ", " , ,"; none when set; none with the pepper unset; one when only the sandbox tenant is configured; server starts in every case.
- S2 PASS. Env parser throws naming VC_PARTNER_OWN_TENANTS for 18 hostile entries (sandbox/SANDBOX/admin-9/system/root.x/default/internal_1, both repo tenants, pathlynks:pathlynks-2, PATHLYNKS:PATHLYNKS, full-width, 33-char, spaces around colon, three-part, underscore). With reserved [pathlynks, pathlynks-2, PATHLYNKS_x, acme] and own [pathlynks]: pathlynks adds and authenticates (srv and pub); pathlynks-2, acme, PATHLYNKS, pathlynks_x, sandbox, admin, vc-synthetic-demo, scribe-evaluation refused at add; legacy records for pathlynks-2, acme, sandbox-1, vc-synthetic-demo, scribe-evaluation, admin get a 401 byte-identical (status + sorted headers + body) to a garbage-key 401 on the real chat route. Restart through launch(): binding present admits (200), same store relaunched without the binding returns 401. startApi refuses VC_PARTNER_OWN_TENANTS=sbx-main:sbx-main with chat.sandboxTenantId sbx-main before anything connects (connect count 0).
- S3 PASS. Pepper set + malformed VC_RESERVED_TENANT_IDS (ok,bad:id), malformed or forbidden VC_PARTNER_OWN_TENANTS (x:y, sandbox:sandbox): launch rejects naming the variable, connect count 0. Pepper unset, same values: starts, exactly one "ignored" note, value not echoed; blank values with the pepper unset: no note.
- S4 PASS. isReservedPartnerId matches entries "  ACME ", full-width ACME, NBSP-padded, ideographic-space-padded, tab/newline-padded; "acm e" does not match; addPartner ctx and createPartnerRegistry (array and function forms, full-width) refuse/401 the same.
- S5 PASS. rotate on sandbox-1, admin, vc-synthetic-demo (built-ins/repo) and a configured later-tenant, both scopes, refuses with "reserved" and "no key was minted", no vck_ string in the message, zero store.update calls, stored partner list byte-identical; revoke works; the bound pathlynks still rotates (one update); a revoked reserved partner reports "revoked"; unknown reports "no partner"; the same pathlynks without the binding refuses.
- Docs PASS. go-live-checklist (both vars), runbook-golive section "Before deploy" (empty = built-ins only, binding, partner list first, rotate/revoke, pepper-unset note), partner-integration section 4 and .env.example all match the code read (empty list semantics, exact binding, never-exempt set, warnings on startApi and CLI stderr, parse only with the pepper).
- Regression PASS (apps/api, via the shared testlock): partners 63/0, partner-voice 32/0, partner-openapi 15/0, auth 15/0, server 34/0, index 8/0, main 10/0, chat 34 pass / 1 fail (only the known A20 baseline red "A20 flag on but gate closed"), anonymous-route H2|H6|G5|K2|K4 9/0, tsc --noEmit exit 0.

## Falsification (copy under my session scratchpad, git archive of 360ff8c, installed offline; restored, content-identical apart from CRLF checkout; my 8 hostile tests green 8/0 before and after)
- S1: CLI warn call removed -> HS1 CLI red; startApi warn line removed -> HS1 startApi red.
- S2: binding check replaced by `return true` -> 3 red (registry/route, restart, rotate); sandbox-binding refusal in startApi disabled -> restart test red (un-refused launch leaves a server up, run ended at the 300 s timeout, same as the builder saw).
- S3: lists parsed whenever http is set (not only with the pepper) -> HS3 red.
- S4: `foldId(e.trim())` -> `foldId(e)` -> HS4 red.
- S5: reserved refusal in rotatePartner disabled -> HS5 red.

## Findings (non-blocking)
PROPOSED-ISSUE (info): startApi's exact-match sandbox guard (`partnerOwnTenants.includes(sandbox)`) does not fold case: chat.sandboxTenantId "Sbx-Main" with VC_PARTNER_OWN_TENANTS=sbx-main:sbx-main starts, and partner "sbx-main" is exempt from the sandbox entry. Tenant ids are case-sensitive in @vc/db (TENANT_ID_PATTERN, no folding), so "sbx-main" is a different tenant from "Sbx-Main" and nothing is reachable; hardening only (fold the comparison).
PROPOSED-ISSUE (info): the S1 CLI warning text is verified through the `warn` dep and the script source, not by spawning scripts/partner.ts (needs a live Mongo connect before runPartnerCli); same limit the builder stated.
PROPOSED-ISSUE (info): the empty-list warning is emitted only when the pepper is set, by design (S1/S3); a deploy that sets the pepper later gets it then.
Process note: my first regression launch was started twice by mistake and the two runs interleaved their logs; I discarded them and re-ran the whole set once, cleanly (the numbers above are from that clean run).

LIVE-BROWSER: Not UI-touching.
ISSUES-WRITTEN: none (blind dual check); PROPOSED-ISSUE lines above only.
Not done: no full suite, no real Mongo, no live LLM calls, no process killed, no product code changed. The other coordinator's verdict and checkpoint were not read.
Metrics: start=2026-10-22T14:53:15+05:30 end=2026-10-22T15:13:45+05:30 wall_min=20 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=14 mutations=7 cycle=0 policy=proportional-verification/2026-10-19.17 tokens=unavailable
