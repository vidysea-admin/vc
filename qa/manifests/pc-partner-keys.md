# Manifest — pc-partner-keys
**Contract:** docs/features/partner-chatbot/spec.md section pc-partner-keys, criteria K1 K2 K3 K4 K5 (verbatim); brief qa/evidence/p1-briefs/pc-partner-keys-c0.md; plan docs/features/partner-chatbot/plan.md. Not an edit to qa/contracts.
**Goal task:** none
**Date:** 2026-10-22
**Fix cycle:** 0
**Dual check:** yes (authentication: per-partner API keys, tenant derivation from a key, CORS allowlist). Two independent checkers, one of them hostile on the key/CORS paths.
**Persona walk:** not required (no UI; the widget is pc-widget). Personas by API: Vidysea website widget (key, anonymous route), Pathlynks backend (key + student headers), a hostile site/partner.
**Issues addressed:** none
**Executor:** claude-sonnet-subagent
**Executor rationale:** one build unit in one worktree (D:/vc/.worktrees/pc-partner-keys, branch wave/pc-partner-keys, base 3a70309).

## What changed
Code commit c93deee. Files (all in the brief's owned list; voice.ts, go-live-gate.ts and apps/widget untouched; main.ts needed no edit because launch() calls startApi, which validates the pepper and flag before connecting):
- apps/api/src/partners.ts (new): key format vck_<partnerId>_<43 b64url> (addPartner :235, rotatePartner :266, revokePartner :279), normalizeOrigin :195, createPartnerRegistry :381 (one cached list read, TTL <= 60 s, in-flight coalescing, timingSafeEqual on HMACs with a dummy hash for unknown ids, fail closed), partnerKeyFromRequest :449, partnerStudentFromHeaders :466, withPartnerRoutes :517 (CORS per key + GET /v1/partner/openapi.json), runPartnerCli, createMongoPartnerStore (collection("partners") only).
- apps/api/src/anonymous.ts: X-VC-Key check before the body is read (:459-470), per-partner-AND-client limit and grounding budget (:473), partner id on the usage count and log only (:529-533). Zero persistence unchanged.
- apps/api/src/chat.ts: `vck_` bearer branch (:843-855): key checked first, then student headers; tenant = partnerId; missing/invalid age = minor; consent only if exactly "true". JWT path unchanged.
- apps/api/src/index.ts: imports/exports; StartApiHttpOptions.partners (:316); pepper/flag read before connecting and PartnerConfigError if required without pepper (:517-529); store bound after connect (:666); anonymous and chat deps; withPartnerRoutes wrapping (:762).
- apps/api/src/openapi.ts: `PARTNER_OPENAPI` export only (:624).
- apps/api/scripts/partner.ts (new) + apps/api/package.json "partner" script: add / rotate / revoke / list.
- infra/ubuntu/nginx-vc.conf: /v1/partner/openapi.json, voice stream (before the chat regex), student chat regex (now open), widget static locations and /widget/ 404; no Access-Control header, no method restriction, X-VC-Key and Authorization passed through. Every other /v1/ path still 404.
- .env.example: VC_PARTNER_KEY_PEPPER=, VC_PARTNER_KEY_REQUIRED= (names only).
- apps/api/tests/partners.test.ts (new, 38 tests).
Also: `pnpm install --offline --frozen-lockfile` in the worktree (node_modules only, no lockfile change).

## Gate answers
- D-111 (verbatim from the brief): "simple per-partner API key (hashed in a partners collection, add/rotate/revoke CLI, per-key origin allowlist and CORS); Pathlynks uses the key server-to-server through its backend proxy with student headers".
- pc-clarify-1 defaults applied (qa/feedback-inbox.md line 305, 2026-10-22T07:31:46+05:30):
  (1) rotate and revoke take effect within 60 s: the stored hash/status changes at once; a running server honours it within the 60 s registry cache (tests: rotate/revoke at +61 s).
  (2) partnerId matches ^[a-z0-9-]{2,32}$ (no underscore), so a key splits on its first two underscores.
  (3) K4 preflight: 204; Allow-Origin = the origin only if it is in some active partner's allowedOrigins; Allow-Methods POST,GET,OPTIONS; Allow-Headers Content-Type,X-VC-Key,Authorization; Max-Age 600; otherwise 204 with no CORS headers.
  (4) a bearer starting `vck_` is a partner key and never goes to the JWT verifier; anything else goes to JWT.
  (5) applied only as nginx static locations in infra/ubuntu/nginx-vc.conf: /widget/vc-widget.v1.js immutable max-age=31536000, /widget/vc-widget.js max-age=300 (same alias path as apps/widget/nginx-widget.conf.snippet). The widget file itself is pc-widget's.
- Chosen by me, not in the brief: the actual (non-preflight) request gets Allow-Origin only if its own key is active and the Origin is in THAT key's list; CORS-eligible routes are the public chat route, the voice session route and /v1/partner/openapi.json only; keys are HMAC-SHA256(key, VC_PARTNER_KEY_PEPPER), the pepper is >= 32 chars; the Mongo adapter lives in partners.ts because packages/db is not an owned file.

## Acceptance criteria and evidence
Policy-Version: proportional-verification/2026-10-19.17
dual-trigger: auth apps/api/src/partners.ts:381
Tier: L (authentication and a new tenant-derivation path); dual check. Base 3a70309, code commit c93deee.
Round: 10 files, 5 criteria (K1-K5), est 40 min — one tightly coupled module; one round.

Tests[K1]: apps/api/tests/partners.test.ts K1 tests — covers (9: add stores only hash+prefix and shows the key once; id pattern; origin validation; duplicate id; rotate; revoke; list; CLI; env strictness).
Tests[K2]: apps/api/tests/partners.test.ts K2 tests — covers (10: widget with key answered; uniform 401 for malformed/unknown/revoked/repeated; helpline in the 401; keyless unchanged vs REQUIRED; no-registry fail closed; per-partner-and-client limit; crisis never limited; revoke within 60 s; store outage 503; one list read per 60 s) plus the existing anonymous-route H2|H6|G5.
Tests[K3]: apps/api/tests/partners.test.ts K3 tests — covers (8: tenant = partner id; cross-partner 404; header 400s; age/consent matrix incl. minor no model call; minor crisis; uniform 401; JWT unchanged; invalid tenant id unmintable) plus chat-profile H2|LK7 C1-fix and chat-privacy.
Tests[K4]: apps/api/tests/partners.test.ts K4 tests — covers (6: preflight allowed, preflight denied matrix, ineligible routes, actual-request matrix, inner 401/429 CORS only for an allowed origin, store outage) and the launch() wiring test over real HTTP.
Tests[K5]: apps/api/tests/partners.test.ts K5 tests — covers (3: openapi route, nginx text assertions, widget cache) and the two wiring tests (launch over real HTTP; refusing to start without/with a short pepper or a bad flag).

Pre-check[K1]: c93deee `npx tsx --test tests/partners.test.ts` -> exit 0, 38 passed, 0 failed (K1 tests all green)
Pre-check[K2]: c93deee `npx tsx --test tests/partners.test.ts` -> exit 0, 38 passed, 0 failed; `tests/anonymous-route.test.ts --test-name-pattern="H2|H6|G5"` -> 9 passed, 0 failed
Pre-check[K3]: c93deee `npx tsx --test tests/partners.test.ts` -> exit 0, 38 passed, 0 failed; `tests/chat-profile.test.ts --test-name-pattern="H2|LK7 C1-fix"` -> 6 passed, 0 failed; `tests/chat-privacy.test.ts` -> 39 passed, 0 failed
Pre-check[K4]: c93deee `npx tsx --test tests/partners.test.ts` -> exit 0, 38 passed, 0 failed
Pre-check[K5]: c93deee `npx tsx --test tests/partners.test.ts` -> exit 0, 38 passed, 0 failed
Pre-check[all]: c93deee `npx tsc --noEmit` (apps/api) -> exit 0, no output
Also green: main.test 10/0, index.test 8/0, packages/db db-scope.test 11/0 and client.test 33/0 (B12/D-016 scanners with the new files).
Note: every run went through VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 600. TDD note: the tests were written before the implementation but no failing-first run was captured; the mutants below are the proof the tests bite. One test of mine had a wrong expectation (state "escalated", not "crisis"; existing behaviour) and was corrected.

Falsify[K1]: store the raw key as keyHash instead of the HMAC -> red (4 failing K1 tests, incl. "only its HMAC and a short prefix are stored" and rotate/revoke); mutated in a copy outside the tree (scratchpad/fals-pk), restored.
Falsify[K2]: drop the secret comparison (accept any well-formed key of an active partner) -> red (1 failing: "a malformed, unknown, revoked or repeated key all get the same 401").
Falsify[K3]: a missing age is an adult (fail open) -> red (1 failing: the age/consent matrix test).
Falsify[K4]: grant Allow-Origin to any origin for an active key (skip the per-key origin list) -> red (1 failing: "the actual request gets Allow-Origin only when ... THAT key's list").
Falsify[K5]: rename the openapi nginx location (route disabled) -> red (1 failing: the nginx locations test).

## Live browser evidence
Not UI-touching. No browser was used; the real-HTTP evidence is the two launch() tests (real socket, fake Mongo), listed above.

## Metrics
Metrics: start=2026-10-22T07:30:00+05:30 end=2026-10-22T07:53:00+05:30 builder_min=23 wall_min=23 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=3 mutations=5 cycle=0 policy=proportional-verification/2026-10-19.17 tokens=unavailable
Sessions: 2b04f90e-6b56-4682-a76c-d8515b93405c

## Not verified here (for the checker)
- Real Mongo (only the fake Db): the unique-id duplicate code 11000 path and the whole-list read are exercised against the fake only.
- nginx loaded into a real nginx (only text-checked; no nginx on this host); the voice stream upgrade headers through a real proxy.
- OPEN RISK (design, D-111): the widget's page key is the same key that works server-to-server, so anyone holding a page key can call the student chat routes and claim any student id/age/consent of that tenant. Mitigation is out of scope here; recommend key scopes (anon-only widget key vs server key) in a later unit.
- Preflight is granted when ANY active partner lists the origin (no key on a preflight); the real request is still gated by its own key.
- A bad key sent with crisis text gets only the static helpline 401 (no crisis turn).
- Partner usage counters are in memory per process.
- Full suite not run (brief: only the named tests); OOM/C: fullness not hit.

Status: ready-for-check
