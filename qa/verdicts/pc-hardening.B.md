# pc-hardening - checker coordinator B (blind dual check)

Cycle checked: 0
Policy-Version: proportional-verification/2026-10-19.17
VERDICT: PASS
CHECKED-STATE: worktree D:/vc/.worktrees/pc-hardening, branch wave/pc-hardening, code ca1d0a2, head e62395b, base 350b4eb (merge-base verified = 350b4eb). Product code unchanged by this check. Tier L, dual-trigger tenancy (index.ts:551).

## Scope claim (checked first)
PASS. A vck_srv_ key still reaches only the tenant named by its partner id: chat.ts:854-855 and voice.ts:1711-1712 take `tenantId: partner.partnerId`, and the student headers carry only the student id. The diff touches none of that: partners.ts turns `isReservedPartnerId` into a wrapper over `reservedPartnerIdReason` with the same decision table (builtin/repo/configured -> reserved; exact explicit binding -> exempt), index.ts only widens a refusal, voice.ts only adds refusals and fallbacks. Nothing widens reach.

## Criteria (executed, not read)
- H1 PASS. Through the running voice API, per-client maxActivePerClient in {NaN, Infinity, -Infinity, "abc", -1, 2.5, null, a function, true, "2", {}}: the third mint is 429 voice_busy and the third upgrade of a pre-minted token is 429 (cap stays 2). Per-partner (static value AND function result) in {NaN, Infinity, -Infinity, "abc", -1, 2.5, null}: 50 visitors open, the 51st mint is 429 voice_busy and a pre-minted 51st upgrade is 429 (cap stays 50). Fallback-to-default matches how voice.ts treats drainTimeoutMs / connectOverlapWaitMs (non-finite or <= 0 -> default); 0 stays 0. The builder's choice is consistent.
- H2 PASS. Five consecutive capped (429) upgrades of one token leave usedTokens unchanged; after a slot frees the same token connects and is spent once; replay is 401; a token aged 120 s on the fake clock is 401 (the unspent state does not revive it).
- H3 PASS. Mint at visitor cap and at partner cap: 429, body keys exactly {error:"voice_busy", helpline}, Retry-After 30, no token; below the cap it mints 201; another visitor still mints; a wrong Origin or no page key stays 401 (no cap oracle for unauthenticated callers). Widget (executed in a copy): mint 429 voice_busy -> fallback {busy, wait}; Retry-After 9999 -> 300, "abc" -> 30, "0" -> 1; any other 429 body (rate_limited, empty, null, array, string "voice_busy", "Voice_Busy") stays rate (wait as told or 60). The busy note is English for en / "" / undefined / fr / hindi / his and Hindi for hi / hi-IN / hi_IN / HI; the voice_busy error frame gives the same note. Every pre-existing string literal of base vc-widget.js (>= 20 chars) is still present verbatim; HELP, FOOTER, UNAVAILABLE_TEXT, VOICE_RENDERED, VERSION equal base; permission / no_mic / unsupported / unavailable / network / error / rate / unknown texts are as before; the crisis-path test is green.
  Adapted tests: the three sites in the two "V2 active cap (review 2)" tests only move the over-cap mint BEFORE the cap fills; their assertions (upgrade 429, Retry-After, `perClient.raw === fourth.raw` uniformity) are unchanged, and the new mint-side behaviour is covered by the H3 server test and my probe. Not weakened.
  OpenAPI: the public document describes no voice route at all (x-voice "coming with pc-voice"; test D1 asserts no voice path), so there is no mint response to add the 429 to; see PROPOSED-ISSUE 1.
- H4 PASS. startApi refuses with the guard's own message ("VC_PARTNER_OWN_TENANTS cannot bind the configured sandbox tenant") for sandbox "SBX-Main", full-width "ＳＢＸ-Main", "ｓbx-main", padded " SBX-Main ", "SBX-MAIN" and "sbx-main" against binding sbx-main (the refusal is the guard, not a parse error). A different valid binding and no binding both still start.
- H5 PASS. `partner list` over a seeded store flags exactly the reserved ids (sandbox, sandbox-1, admin_2, root.x, system-9, default-a, internal-1, vc-synthetic-demo, scribe-evaluation, and the configured cfg-a) with a reason, and spares the bound cfg-own and the clean one. `--check` throws PartnerError reserved_ids (scripts/partner.ts maps any non-usage PartnerError to exit 1) naming every flagged active id and none other; revoking them makes --check return the listing; a configured entry in full-width / mixed case is folded; an empty store returns "(no partners)". The error text and rows contain no key secret (regex over the 43-char secrets) and no pepper. Runbook step 2, go-live-checklist and partner-integration use `partner list --check`.
- H6 PASS. With VC_RESERVED_TENANT_IDS=pathlynks (and the pathlynks binding), partner pathlynks-2 adds and authenticates as partnerId pathlynks-2 (never pathlynks); `pathlynks` itself, unbound, is still refused.

## Regression (apps/api via vc-testlock, widget via node)
partners 66/0, partner-voice 36/0, partner-openapi 15/0, voice 67/0, voice-limits 10/0, voice-wiring 16/0, auth 15/0, server 34/0, index 8/0, main 10/0, chat 34 pass / 1 fail (only the known A20 baseline red "A20 flag on but gate closed", an assertion about the repo's real qa/gates, unrelated to this diff), anonymous-route "H2|H6|G5|K2|K4" 9/0, `pnpm exec tsc --noEmit` in apps/api exit 0, `node --test "apps/widget/tests/*.test.js"` 61/0.

## Falsification (copy under my session scratchpad, restored byte-identical by cmp, green again after: partner-voice H/PROBE 8/0, partners H/PROBE 6/0)
- H1: `Number.isSafeInteger` dropped from anonymousCapLimit -> red (builder H1 x2 + my H1a + H1b).
- H2: `usedTokens.set` moved before the cap checks -> red (builder H2 + my H2).
- H3: mint pre-check `if (false && ...)` -> red (builder H3 server + my H3); widget `busy.error === "never"` -> red (builder mint test + my hostile variants); widget error-frame `code === "never"` -> red (builder en/hi test).
- H4: guard back to `partnerOwnTenants.includes(sandbox)` -> red (builder H4 + my H4).
- H5: `--check` throw disabled -> red (builder H5 + my H5).
- H6: configured tenants given a `name-` suffix family -> red (builder H6 + my H6).

## Findings (non-blocking)
PROPOSED-ISSUE 1 (info): the public OpenAPI has no voice section (x-voice "coming with pc-voice"), so the new mint 429 voice_busy (body, Retry-After 30) is undocumented; add it, distinct from rate_limited, when the voice routes are described.
PROPOSED-ISSUE 2 (info): an operator cap of 0 ("no anonymous sessions") now makes every mint a 429 voice_busy "try again shortly" with Retry-After 30, which suggests a transient state for a permanent one; harmless, wording only.
PROPOSED-ISSUE 3 (info): the Hindi note is chosen from `document.documentElement.lang` in `pageLang(doc)`; the wording logic is unit-tested through the `lang` argument, and the live DOM read and browser rendering were not run (the manifest says so; the pc-voice V3 smoke is the place).
PROPOSED-ISSUE 4 (info): the pre-start socket cap (two unstarted sockets per visitor) is a separate upgrade-time 429 that the mint does not look at, so that race still shows the generic fallback (the manifest lists it under Not verified).

LIVE-BROWSER: Not run (widget text only, unit-tested against fakes; same as the manifest).
ISSUES-WRITTEN: none (blind dual check); PROPOSED-ISSUE lines above only.
Not done: no full suite, no real Mongo, no live LLM calls, no process killed, no product code changed, nothing deleted outside my scratchpad. The other coordinator's verdict and checkpoint were not read.
Metrics: start=2026-10-22T15:48:56+05:30 end=2026-10-22T15:56:22+05:30 wall_min=10 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=26 mutations=9 cycle=0 policy=proportional-verification/2026-10-19.17 tokens=unavailable
