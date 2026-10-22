# Contract: partner-chatbot (embeddable VC widget + partner API keys + voice)
**Status:** ACTIVE, initialised 2026-10-22 by /checker (contract maintenance only, no verdict)
**Basis:** D-111 (partner-chatbot plan; voice proceeds on Umesh's owner override of A10). Source of truth for the text below: `docs/features/partner-chatbot/spec.md` (2026-10-22). Outcome numbers in `(serves: ...)` refer to "Proposed outcome" in `docs/features/partner-chatbot/intent.md`: 1 = one-script-tag chatbot bubble, 2 = teams call the same API from their backend, 3 = many partners with their own add/rotate/revoke API key, 4 = voice chat in the widget.
**Owner of this file:** /checker. The maker reads it and never edits it; feedback goes to qa/feedback-inbox.md.
**Criteria are copied verbatim from the spec.** Ids [K1]..[D2] are the spec ids; [I1].. are the spec's "Unchanged" list. Work units: pc-partner-keys (K1-K5), pc-widget (W1-W4), pc-voice (V1-V3, after pc-partner-keys and pc-widget), pc-docs-openapi (D1-D2, after pc-partner-keys).

## pc-partner-keys (apps/api, scripts, infra/ubuntu/nginx-vc.conf)
- **[K1]. Partner registry.** (serves: intent#3)
  - A `partners` collection in the virtual_counsellor DB, with these fields: `partnerId`, `name`, `keyHash`, `keyPrefix`, `allowedOrigins[]`, `status` (active or revoked), `createdAt`, `rotatedAt`.
  - `keyHash` = HMAC-SHA256(key, `VC_PARTNER_KEY_PEPPER`).
  - Key format: `vck_<partnerId>_<43-char base64url random>`.
  - The CLI `pnpm -C apps/api partner add|rotate|revoke|list`:
    - prints the raw key only on add and rotate;
    - stores only the hash and prefix;
    - `rotate` invalidates the old key immediately.
- **[K2]. Partner key on the anonymous chat route.** (serves: intent#3)
  - `POST /v1/public/chat/turns` with header `X-VC-Key` and a valid active key: the turn is limited per partner and client, and the partner's id is carried in usage and logs.
  - A malformed, unknown or revoked key gets a uniform 401.
  - No key: the current behaviour is unchanged, unless `VC_PARTNER_KEY_REQUIRED=true`, in which case it gets 401.
  - Key lookup is constant-time on the hash and cached for at most 60 s. A revoke takes effect within 60 s.
- **[K3]. Server-to-server student chat.** (serves: intent#2)
  - The student chat routes (`/v1/students/{sid}/chat/...`) accept `Authorization: Bearer vck_...` together with the headers `X-VC-Student-Id`, `X-VC-Student-Age` and `X-VC-Guardian-Consent`. The tenant is the partner's id.
  - A key from one partner can never read or write another partner's student: the answer is 404.
  - A missing or invalid age means the student is treated as a minor (fail closed).
  - The existing JWT auth is unchanged.
- **[K4]. CORS.** (serves: intent#1)
  - A request whose `Origin` is in the key's `allowedOrigins` gets `Access-Control-Allow-Origin: <that origin>`, `Vary: Origin`, and an answered `OPTIONS` preflight. This applies to the public chat route, the voice session route and the partner OpenAPI route.
  - Any other origin gets no CORS headers. The response is never `*`.
- **[K5]. nginx and the OpenAPI route.** (serves: intent#1, intent#2)
  - nginx proxies the public chat route, the student chat routes, `/v1/partner/openapi.json`, and the voice stream WebSocket (with Upgrade headers), including OPTIONS.
  - Everything else under /v1/ still returns 404.
  - `GET /v1/partner/openapi.json` serves `PARTNER_OPENAPI`, which is exported from openapi.ts. The first version re-exports `STUDENT_API_DRAFT`; pc-docs-openapi fills it in.

## pc-widget (apps/widget/**)
- **[W1]. The widget.** (serves: intent#1)
  - One script, `vc-widget.js`, with no build step at runtime and no external dependency.
  - It renders a floating bubble inside a shadow DOM, so no CSS leaks in either direction.
  - It works at phone width (360 px) and on desktop, and supports the keyboard and screen readers (aria roles).
  - It is configured with `data-vc-key`, `data-vc-api`, `data-vc-proxy`, `data-vc-title`, `data-vc-color` and `data-vc-voice`.
- **[W2]. Text chat.** (serves: intent#1)
  - In key mode, the widget sends `X-VC-Key` and posts to `/v1/public/chat/turns`. In proxy mode, it posts the same body to the host's `data-vc-proxy` URL.
  - It renders the message, the claims and the source links.
  - The footer always shows 14416 / 112.
  - It shows the 401 and 429 states (Retry-After) and a typing indicator.
  - The conversation is kept in memory only. Nothing goes into `localStorage`.
- **[W3]. Demo and tests.** (serves: intent#1)
  - `apps/widget/demo.html` embeds the widget against a local API.
  - Unit tests cover config parsing, request headers per mode, and the 401/429 handling.
- **[W4]. Hosting.** VC serves the script at `/widget/vc-widget.js` (static via nginx), with a long cache and a version in the file name. (serves: intent#1)

## pc-voice (after pc-partner-keys and pc-widget)
- **[V1]. Owner override of A10.** (serves: intent#4)
  - go-live-gate accepts `Owner-override: <iso> — Umesh — D-111` in a10-voice-gate.md in place of `Result: PASS`.
  - The gate output says "A10 OVERRIDDEN by owner (D-111)". Without that line, the gate behaves as today.
- **[V2]. Key-authenticated voice sessions.** (serves: intent#4)
  - Partner keys (server-to-server with student headers, as in K3) can mint voice sessions.
  - Anonymous key callers get voice sessions with the same zero-persistence and crisis rules as the anonymous text route.
  - The voice WebSocket origin check uses the key's `allowedOrigins`.
- **[V3]. Widget mic.** (serves: intent#4)
  - With `data-vc-voice="on"`, a mic button starts and stops a session and shows the live transcript and the reply.
  - A crisis turn shows the fixed crisis message and the helpline.
  - If mic permission is denied, the widget falls back to text.

## pc-docs-openapi (after pc-partner-keys)
- **[D1].** `PARTNER_OPENAPI` in openapi.ts describes the partner routes, their headers, errors and rate limits, and passes an OpenAPI 3.1 validation test. (serves: intent#2)
- **[D2].** `docs/partner-integration.md` is a one-page guide covering: (serves: intent#2, intent#3)
  - the widget snippet for key mode and for proxy mode;
  - a Node proxy example;
  - curl examples;
  - rotating and revoking keys;
  - limits and crisis behaviour.

## Unchanged invariants (spec "Unchanged"; must hold after every unit)
- **[I1].** crisisGuard and the LK10 wording.
- **[I2].** D-110: Tele-MANAS appears only on distress, and the footer always.
- **[I3].** The anonymous zero-persistence rule.
- **[I4].** Grounding redaction.

## PROPOSED-ISSUE (testability flags; proposals only, not edits to the criteria above)
- PROPOSED-ISSUE K1/K2 conflict: K1 says `rotate` invalidates the old key "immediately", K2 allows the key lookup to be cached up to 60 s and says a revoke takes effect "within 60 s". As written, a rotated old key may still authenticate for up to 60 s, so "immediately" is not testable without choosing one reading. Ask the spec owner: does rotate evict the cache entry (immediate), or is 60 s the bound for rotate too? Revoke and rotate should share one stated bound.
- PROPOSED-ISSUE K1 key format ambiguity: `vck_<partnerId>_<43-char base64url>`. base64url contains `_` and `-`, and `partnerId` is not constrained, so the key cannot be split unambiguously if `partnerId` contains `_`. Needs a `partnerId` charset rule (for example `[a-z0-9-]+`) or parsing from the right (fixed 43-char tail) to make "malformed gets 401" testable.
- PROPOSED-ISSUE K2 "constant-time on the hash": timing behaviour is not testable from a black-box test. Testable proxy: lookup compares with `crypto.timingSafeEqual` (or equivalent) on equal-length digests, asserted by code read plus a test that an unknown key and a wrong-hash key return the identical 401 body and status.
- PROPOSED-ISSUE K2 "carried in usage and logs": the log/usage record shape and field name are not stated. Needs a named field (for example `partnerId` in the usage record) so a test can assert it.
- PROPOSED-ISSUE K2 "a revoke takes effect within 60 s" is testable only with an injectable clock or cache TTL; the criterion should require the TTL to be a config value with a test override.
- PROPOSED-ISSUE K2 "limited per partner and client": the limit values and the client identity (IP? header?) are not stated; the 429 + Retry-After contract that W2 depends on is not defined on the server side. Needs the limit numbers and the client key.
- PROPOSED-ISSUE K3 "Authorization: Bearer vck_..." shares the header with the JWT path: the criterion should state the discrimination rule (the `vck_` prefix) and that a malformed `vck_` bearer gets 401, not a fall-through to JWT verification. Also `X-VC-Guardian-Consent` value format and "invalid age" definition are unspecified.
- PROPOSED-ISSUE K4 preflight: an `OPTIONS` preflight does not carry `X-VC-Key` or the Authorization value, so "the key's `allowedOrigins`" cannot be resolved for it. The criterion must state how the preflight origin is decided (for example the union of active partners' `allowedOrigins`) and the preflight status code (200 or 204) and the `Access-Control-Allow-Headers` / `-Methods` values. Also not stated: CORS for the no-key anonymous mode (is the Vidysea website's origin on the list?).
- PROPOSED-ISSUE K5 "Everything else under /v1/ still returns 404" and "including OPTIONS": nginx behaviour is not testable in the node:test suite. Testable form: a static assertion on `infra/ubuntu/nginx-vc.conf` (location blocks, Upgrade headers) plus `nginx -t` if available; otherwise it needs a live check on the Ubuntu host and should say so.
- PROPOSED-ISSUE W1 "no CSS leaks in either direction", "works at 360 px", "keyboard and screen readers (aria roles)": these need a real browser; W3 only requires unit tests for config parsing, headers and 401/429. Add a browser or DOM-level check (shadow-root mode, aria role/label attributes, viewport 360 px screenshot) or state that the check is manual.
- PROPOSED-ISSUE W3 "embeds the widget against a local API": no pass/fail condition for demo.html; needs a runnable command and an expected observable.
- PROPOSED-ISSUE W4 "long cache" is unquantified (needs a `Cache-Control` value, for example `max-age=31536000, immutable`), and "version in the file name" conflicts with the stated path `/widget/vc-widget.js`, which has no version. Needs the exact versioned URL form (and what the unversioned path does).
- PROPOSED-ISSUE V2 "same zero-persistence and crisis rules as the anonymous text route": testable only by reference to the existing anonymous-route tests; the criterion should name them or require an equivalent voice-route test that asserts no write to Mongo.
- PROPOSED-ISSUE V3 "live transcript", "mic button", permission-denied fallback: need a browser or a stubbed `getUserMedia`/WebSocket in DOM tests; the verification method is not stated. Crisis wording must match LK10 (see [I1]).
- PROPOSED-ISSUE D1 "OpenAPI 3.1 validation test": the validator is unnamed. Needs a named validator (for example a pinned package) so the check is reproducible offline, and an assertion that every partner route in K2-K5 appears in the document.
- PROPOSED-ISSUE D2 "one-page guide": "one page" is unmeasured (needs a line or word cap); the curl and Node examples should be executable against the local API so they can be verified rather than only read.
- PROPOSED-ISSUE I1-I4 are invariants with no named test: each should cite the existing test file(s) that must stay green (crisisGuard/LK10, D-110 footer/Tele-MANAS rule, anonymous zero-persistence, grounding redaction) so "Unchanged" is checkable.
