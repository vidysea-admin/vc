# Manifest — pc-partner-keys
**Contract:** docs/features/partner-chatbot/spec.md section pc-partner-keys, criteria K1 K2 K3 K4 K5 (verbatim); brief qa/evidence/p1-briefs/pc-partner-keys-c0.md; plan docs/features/partner-chatbot/plan.md. Not an edit to qa/contracts.
**Goal task:** none
**Date:** 2026-10-22
**Fix cycle:** 1
**Repair base:** 56069f6
**Dual check:** yes (authentication: per-partner API keys, tenant derivation from a key, CORS allowlist). Two independent checkers, one of them hostile on the key/CORS paths.
**Persona walk:** not required (no UI; the widget is pc-widget). Personas by API: Vidysea website widget (key, anonymous route), Pathlynks backend (key + student headers), a hostile site/partner.
**Issues addressed:** none
**Executor:** claude-sonnet-subagent
**Executor rationale:** one build unit in one worktree (D:/vc/.worktrees/pc-partner-keys, branch wave/pc-partner-keys, base 3a70309).

## What changed
Code commits c93deee (cycle-0 build) and 711291c (c0b: two scoped keys, before the first check). Files (all in the brief's owned list; voice.ts, go-live-gate.ts and apps/widget untouched; main.ts needed no edit because launch() calls startApi, which validates the pepper and flag before connecting):
- apps/api/src/partners.ts (new): TWO keys per partner (c0b). Page key `vck_pub_<partnerId>_<43 b64url>`, server key `vck_srv_<partnerId>_<43 b64url>`; the doc stores `keys: {pub, srv}` each `{hash, prefix, rotatedAt}`. addPartner :256 (returns both keys), rotatePartner :286 (`scope` argument rotates one), revokePartner (status flip ends both), normalizeOrigin, createPartnerRegistry :418 `authenticate(key, scope)` with the scope compared AFTER the HMAC compare (:457, same work and same undefined for a wrong-scope key), one cached list read (TTL <= 60 s, coalesced), timingSafeEqual with a dummy hash, fail closed; partnerKeyFromRequest, partnerStudentFromHeaders, isCorsEligiblePath :527 (public chat route + partner openapi only), withPartnerRoutes :554 (CORS from a PAGE key in X-VC-Key only; a server key, in X-VC-Key or as Bearer, never gets CORS; GET /v1/partner/openapi.json), runPartnerCli (`add` prints both keys once; `rotate <id> --scope pub|srv`; `revoke`; `list`), createMongoPartnerStore (collection("partners") only).
- apps/api/src/anonymous.ts: X-VC-Key checked as a PAGE key (`authenticate(key, "pub")`, :464) before the body is read; when an Origin header is present it must be in that partner's allowedOrigins (a repeated or unlisted Origin = the same 401, :472); no Origin header (a script) is allowed. Per-partner-AND-client limit and grounding budget; partner id on the usage count and log only. Zero persistence unchanged.
- apps/api/src/chat.ts: `vck_` bearer branch (:843-855): `authenticate(token, "srv")` (:846), so a page key is the uniform 401; key checked first, then student headers; tenant = partnerId; missing/invalid age = minor; consent only if exactly "true". JWT path unchanged.
- apps/api/src/index.ts: imports/exports; StartApiHttpOptions.partners (:316); pepper/flag read before connecting and PartnerConfigError if required without pepper (:517-529); store bound after connect (:666); anonymous and chat deps; withPartnerRoutes wrapping (:762).
- apps/api/src/openapi.ts: `PARTNER_OPENAPI` export only (:624).
- apps/api/scripts/partner.ts (new) + apps/api/package.json "partner" script: add / rotate / revoke / list.
- infra/ubuntu/nginx-vc.conf (unchanged in c0b): /v1/partner/openapi.json, voice stream (before the chat regex), student chat regex (now open), widget static locations and /widget/ 404; no Access-Control header, no method restriction, X-VC-Key and Authorization passed through. Every other /v1/ path still 404.
- .env.example: VC_PARTNER_KEY_PEPPER=, VC_PARTNER_KEY_REQUIRED= (names only).
- apps/api/tests/partners.test.ts (new, 42 tests: the 38 of cycle 0 re-based on scoped keys, plus 4 `scope:` tests).
Also: `pnpm install --offline --frozen-lockfile` in the worktree (node_modules only, no lockfile change).

## Gate answers
- D-111 (verbatim from the brief): "simple per-partner API key (hashed in a partners collection, add/rotate/revoke CLI, per-key origin allowlist and CORS); Pathlynks uses the key server-to-server through its backend proxy with student headers".
- pc-clarify-1 defaults applied (qa/feedback-inbox.md line 305, 2026-10-22T07:31:46+05:30):
  (1) rotate and revoke take effect within 60 s: the stored hash/status changes at once; a running server honours it within the 60 s registry cache (tests: rotate/revoke at +61 s).
  (2) partnerId matches ^[a-z0-9-]{2,32}$ (no underscore), so a key splits on its first two underscores.
  (3) K4 preflight: 204; Allow-Origin = the origin only if it is in some active partner's allowedOrigins; Allow-Methods POST,GET,OPTIONS; Allow-Headers Content-Type,X-VC-Key,Authorization; Max-Age 600; otherwise 204 with no CORS headers.
  (4) a bearer starting `vck_` is a partner key and never goes to the JWT verifier; anything else goes to JWT.
  (5) applied only as nginx static locations in infra/ubuntu/nginx-vc.conf: /widget/vc-widget.v1.js immutable max-age=31536000, /widget/vc-widget.js max-age=300 (same alias path as apps/widget/nginx-widget.conf.snippet). The widget file itself is pc-widget's.
- c0b scope rule (coordinator brief qa/evidence/p1-briefs/pc-partner-keys-c0b.md, 2026-10-22, because a page key in public HTML must not open server-to-server student routes; D-111 "simple api key" kept, no JWT): every partner has two keys. Page key vck_pub_<id>_<43>: accepted ONLY on POST /v1/public/chat/turns; when an Origin header is present it must be in allowedOrigins; CORS applies. Server key vck_srv_<id>_<43>: accepted ONLY on the student chat routes (K3) (the partner OpenAPI is public and needs no key); never on the public route; never gets CORS headers. A key used outside its scope gets the same uniform 401 as any bad key. The registry stores a hash per scope; `partner add` prints both once; `rotate <id> --scope pub|srv` rotates one; `revoke` revokes both. The old unscoped vck_<id>_ format no longer exists (nothing was deployed) and is refused as malformed.
- c0b consequence flagged for the checker/coordinator (spec K4 text): spec K4 lists the voice SESSION route among the CORS routes. That route is a student route (server key only), and a server key never gets CORS, so no browser caller could use it; I therefore removed it from the CORS-eligible set (isCorsEligiblePath: public chat route + partner openapi only). pc-voice adds its anonymous voice route there when it exists. Tests assert student routes (including voice session/stream) never get CORS.
- Chosen by me, not in the brief: the actual (non-preflight) request gets Allow-Origin only if its own key is active and the Origin is in THAT key's list; CORS-eligible routes are the public chat route, the voice session route and /v1/partner/openapi.json only; keys are HMAC-SHA256(key, VC_PARTNER_KEY_PEPPER), the pepper is >= 32 chars; the Mongo adapter lives in partners.ts because packages/db is not an owned file.

## Acceptance criteria and evidence
Policy-Version: proportional-verification/2026-10-19.17
dual-trigger: auth apps/api/src/partners.ts:472
Tier: L (authentication and a new tenant-derivation path); dual check. Base 3a70309, code commits c93deee + 711291c (c0b).
Round: 10 files, 5 criteria (K1-K5), est 40 min — one tightly coupled module; one round (c0b folded in before the first check, same cycle 0).

Tests[K1]: apps/api/tests/partners.test.ts K1 tests and `scope:` independence/rotation — covers (two keys stored as HMAC+prefix only, id pattern and 3-underscore split, duplicate id, origin validation, rotate one scope leaves the other working, revoke ends both, list, CLI add/rotate --scope/revoke, env strictness).
Tests[K2]: apps/api/tests/partners.test.ts K2 tests and `scope: a server key pasted into a web page` / `scope: a page key sent with an Origin` — covers (page key answered; uniform 401 for malformed/unknown/revoked/repeated/wrong-scope keys; Origin must match; keyless unchanged vs REQUIRED; no-registry fail closed; per-partner-and-client limit; crisis never limited; revoke within 60 s; store outage 503; one list read per 60 s) plus the existing anonymous-route H2|H6|G5.
Tests[K3]: apps/api/tests/partners.test.ts K3 tests and `scope: a page key copied from the Vidysea website cannot read a Pathlynks student` — covers (tenant = partner id; cross-partner 404; header 400s; age/consent matrix; minor crisis; uniform 401; JWT unchanged; a page key on every student route is the uniform 401) plus chat-profile H2|LK7 C1-fix and chat-privacy.
Tests[K4]: apps/api/tests/partners.test.ts K4 tests — covers (preflight on public chat + openapi, preflight denied matrix, student/voice routes never granted, actual-request matrix with page keys, a server key never gets CORS, inner 401/429 CORS only for an allowed origin, store outage) and the launch() wiring test over real HTTP.
Tests[K5]: apps/api/tests/partners.test.ts K5 tests — covers (openapi route, nginx text assertions, widget cache) and the two wiring tests (launch over real HTTP; refusing to start without/with a short pepper or a bad flag).

Pre-check[K1]: 4ac5b36 `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 600 pnpm exec tsx --test tests/partners.test.ts` -> exit 0, 48 passed, 0 failed (42 prior + 6 c1 tests); also on 4ac5b36: `--test-name-pattern="H2|H6|G5" tests/anonymous-route.test.ts` 9/0, `--test-name-pattern="H2|LK7 C1-fix" tests/chat-profile.test.ts` 6/0, `tests/chat-privacy.test.ts` 39/0, `pnpm exec tsc --noEmit` (apps/api) exit 0, packages/db facts+db-scope+chat-threads+tenant 104/0 (fakes.ts touched)
Pre-check[K2]: 711291c `npx tsx --test tests/partners.test.ts` -> exit 0, 42 passed, 0 failed; `tests/anonymous-route.test.ts --test-name-pattern="H2|H6|G5"` -> 9 passed, 0 failed
Pre-check[K3]: 711291c `npx tsx --test tests/partners.test.ts` -> exit 0, 42 passed, 0 failed; `tests/chat-profile.test.ts --test-name-pattern="H2|LK7 C1-fix"` -> 6 passed, 0 failed; `tests/chat-privacy.test.ts` -> 39 passed, 0 failed
Pre-check[K4]: 711291c `npx tsx --test tests/partners.test.ts` -> exit 0, 42 passed, 0 failed
Pre-check[K5]: 711291c `npx tsx --test tests/partners.test.ts` -> exit 0, 42 passed, 0 failed
Pre-check[all]: 711291c `npx tsc --noEmit` (apps/api) -> exit 0, no output
Also green on 711291c: main.test 10/0, index.test 8/0, packages/db db-scope.test 11/0 (B12/D-016 scanners with the new files). (client.test 33/0 was green on c93deee and is not touched by c0b.)
Note: every run went through VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 600. TDD note: for c0b the four new `scope:` tests were run first against the unscoped code and all 4 failed (red) before the scoped keys were implemented; cycle-0's original tests had no captured red run. One test of mine had a wrong expectation (state "escalated", not "crisis"; existing behaviour) and was corrected.

Falsification[K1] (c1, on 4ac5b36): in a copy outside the tree (scratchpad/fals-pk, node_modules symlinked) rotatePartner's write was reverted to the whole-object `{ keys: { ...existing.keys, [scope]: record } }` -> red, 2 failing (`K1 (c1): two operators rotate the page key and the server key ... at the same moment` and `rotate sends the store only the one scope's dotted path`), 46 passing; partners.ts restored byte-identical (cmp) and the in-tree run is 48/0.
Falsify[K1]: (on 711291c) store the raw key as the hash instead of the HMAC -> red (5 failing K1 tests); mutated in a copy outside the tree (scratchpad/fals-pk), restored.
Falsify[K2]: (on 711291c) remove the scope comparison from authenticate (`|| parsed.scope !== scope`) -> red (3 failing: page key on student routes, server key on the public route, key independence). Remove the Origin check in anonymous.ts -> red (1 failing: `a page key sent with an Origin the partner did not list`). These are the c0b scope-check falsifications.
Falsify[K3]: (on 711291c) a missing age is an adult (fail open) -> red (1 failing: the age/consent matrix test).
Falsify[K4]: (on 711291c) grant Allow-Origin to any origin for an active page key -> red (1 failing); also let a server key earn CORS (`?? authenticate(key, "srv")`) -> red (1 failing: `a server key pasted into a web page ... gets no CORS`).
Falsify[K5]: (on 711291c) rename the openapi nginx location (route disabled) -> red (1 failing: the nginx locations test).

## Repair (fix cycle 1, base 56069f6, code commit 4ac5b36)
1. K1 lost update. apps/api/src/partners.ts:316 `rotatePartner` now sends `{ "keys.pub": record }` or `{ "keys.srv": record }` (dotted path) instead of the whole `keys` object; the `PartnerStore.update` patch type is `PartnerPatch` (:142), which no longer accepts a whole `keys`. The Mongo store (:154 `$set: patch`) therefore issues a per-scope `$set`. The in-memory store is the fake Db used by every test: packages/db/tests/fakes.ts `applyUpdate` (the `if (update.$set)` block) did a top-level Object.assign, so a dotted key would have become a literal field; it now sets nested paths (a key with no dot is unchanged). That file is outside the c0 owned list (test infrastructure; additive; 104 packages/db tests green on it). Tests (apps/api/tests/partners.test.ts:951 readBarrierStore, :966, :982, :996): pub+srv overlapping rotates with a read barrier as in the checkers' repro -> both new keys work, both old keys 401, `keys` holds exactly pub and srv; two same-scope overlapping rotates -> exactly one printed key works, old key 401, other scope untouched; the store sees only `["keys.pub"]` / `["keys.srv"]`.
2. Review medium, registry load. apps/api/src/partners.ts:463 `inflight ??= Promise.resolve().then(load).finally(() => { inflight = undefined; })`: the clear can only run after the assignment, so a synchronous throw from `store.list()` is a rejection that is cleared, not a rejected promise pinned forever. Test :1007 (list throws synchronously once, then succeeds): first call rejects PartnerRegistryUnavailableError, the next call authenticates, 2 reads.
3. Review medium, reserved ids. apps/api/src/partners.ts:50 `RESERVED_PARTNER_IDS` (sandbox, admin, system, root, default, internal), checked in `addPartner` at :282 (also via `PartnerOpContext.reservedIds` :262 for a caller that knows more), error code invalid_partner_id naming only the id, before anything is written. The real JWT tenant ids are NOT knowable from server config (the tenant is a claim inside a signed token, auth.ts:253/409) and the sandbox tenant id is a `sandboxTenantId` dep the caller supplies (index.ts:402), so per the brief the sandbox id plus a reserved list is used; a deployment that knows its tenants can pass them as `reservedIds` (no CLI/env wiring added, nothing invented). Test :1025 (ids, slug of a name, CLI path, caller-supplied id, ordinary id unaffected).
4. Checker A P2. Test apps/api/tests/partners.test.ts:1042: real anonymous handler wrapped by `withPartnerRoutes`; Origins https://vidysea.com.evil.io, https://evil-vidysea.com (plus trailing-dot and a subdomain) with a valid page key -> 401, no Access-Control-* header at all, route never reached; the listed origin still gets 200 and its own Allow-Origin. Passes against existing behaviour (no source change needed for it).
5. Low. Header comment in apps/api/src/partners.ts:22-23 no longer claims the voice session route is CORS-eligible (public chat route and partner openapi only; pc-voice joins later).
Not changed: K2-K5 / I1-I4 behaviour. Process note: an earlier verification attempt put the file before `--test-name-pattern` and ran whole files (anonymous-route hung to the 600 s timeout, exit 124); the numbers above are from the correct form (pattern first, as in the checkers' logs).

## Live browser evidence
Not UI-touching. No browser was used; the real-HTTP evidence is the two launch() tests (real socket, fake Mongo), listed above.

## Metrics
Metrics: start=2026-10-22T07:30:00+05:30 end=2026-10-22T07:58:30+05:30 builder_min=29 wall_min=29 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=3 mutations=9 cycle=0 policy=proportional-verification/2026-10-19.17 tokens=unavailable
Sessions: 2b04f90e-6b56-4682-a76c-d8515b93405c

## Not verified here (for the checker)
- Real Mongo (only the fake Db): the unique-id duplicate code 11000 path and the whole-list read are exercised against the fake only.
- nginx loaded into a real nginx (only text-checked; no nginx on this host); the voice stream upgrade headers through a real proxy.
- RESOLVED in c0b: the earlier open risk (one key both in the page and on student routes) is closed by the two-scope design. Remaining by design: a page key is public, so anyone can call the public chat route with it from a script (no Origin); the Origin rule is a browser-side control, and the per-partner-and-client rate limit is the abuse bound.
- Preflight is granted when ANY active partner lists the origin (no key on a preflight); the real request is still gated by its own key.
- A bad key sent with crisis text gets only the static helpline 401 (no crisis turn).
- Partner usage counters are in memory per process.
- Full suite not run (brief: only the named tests); OOM/C: fullness not hit.

Status: checked-PASS (A qa/verdicts/pc-partner-keys.md ae39b9f, B qa/verdicts/pc-partner-keys.b.md e9860e8, cycle 1)
