# Spec — partner-chatbot (2026-10-22, from intent.md + D-111)

## User flows
- **Visitor, Vidysea website:**
  1. The page loads `vc-widget.js` with `data-vc-key`.
  2. The visitor sees the bubble and taps it. The panel opens with a greeting, and the 14416 / 112 footer is always shown.
  3. The visitor types a question and gets an answer with sources.
  4. Optionally, the visitor taps the mic and talks.
  - Negative paths: a bad or revoked key shows "chat unavailable". When the rate limit is hit, the widget shows "please wait N s".
- **Pathlynks student:**
  - The page loads the widget with `data-vc-proxy="/api/vc"`.
  - The widget posts each turn to the Pathlynks backend. That backend adds the API key and the student headers and forwards the turn to VC.
  - The answer is personalised to the student's profile.
- **Partner developer:** reads `docs/partner-integration.md` and `GET /v1/partner/openapi.json`, then uses the snippet or a curl/Node example.
- **Ops:** runs `pnpm -C apps/api partner add <name> --origin https://site`. The key is printed once. `rotate`, `revoke` and `list` are also available.

## Acceptance criteria
### pc-partner-keys (apps/api, scripts, infra/ubuntu/nginx-vc.conf)
- **K1. Partner registry.**
  - A `partners` collection in the virtual_counsellor DB, with these fields: `partnerId`, `name`, `keyHash`, `keyPrefix`, `allowedOrigins[]`, `status` (active or revoked), `createdAt`, `rotatedAt`.
  - `keyHash` = HMAC-SHA256(key, `VC_PARTNER_KEY_PEPPER`).
  - Key format: `vck_<partnerId>_<43-char base64url random>`.
  - The CLI `pnpm -C apps/api partner add|rotate|revoke|list`:
    - prints the raw key only on add and rotate;
    - stores only the hash and prefix;
    - `rotate` invalidates the old key immediately.
- **K2. Partner key on the anonymous chat route.**
  - `POST /v1/public/chat/turns` with header `X-VC-Key` and a valid active key: the turn is limited per partner and client, and the partner's id is carried in usage and logs.
  - A malformed, unknown or revoked key gets a uniform 401.
  - No key: the current behaviour is unchanged, unless `VC_PARTNER_KEY_REQUIRED=true`, in which case it gets 401.
  - Key lookup is constant-time on the hash and cached for at most 60 s. A revoke takes effect within 60 s.
- **K3. Server-to-server student chat.**
  - The student chat routes (`/v1/students/{sid}/chat/...`) accept `Authorization: Bearer vck_...` together with the headers `X-VC-Student-Id`, `X-VC-Student-Age` and `X-VC-Guardian-Consent`. The tenant is the partner's id.
  - A key from one partner can never read or write another partner's student: the answer is 404.
  - A missing or invalid age means the student is treated as a minor (fail closed).
  - The existing JWT auth is unchanged.
- **K4. CORS.**
  - A request whose `Origin` is in the key's `allowedOrigins` gets `Access-Control-Allow-Origin: <that origin>`, `Vary: Origin`, and an answered `OPTIONS` preflight. This applies to the public chat route, the voice session route and the partner OpenAPI route.
  - Any other origin gets no CORS headers. The response is never `*`.
- **K5. nginx and the OpenAPI route.**
  - nginx proxies the public chat route, the student chat routes, `/v1/partner/openapi.json`, and the voice stream WebSocket (with Upgrade headers), including OPTIONS.
  - Everything else under /v1/ still returns 404.
  - `GET /v1/partner/openapi.json` serves `PARTNER_OPENAPI`, which is exported from openapi.ts. The first version re-exports `STUDENT_API_DRAFT`; pc-docs-openapi fills it in.

### pc-widget (apps/widget/**)
- **W1. The widget.**
  - One script, `vc-widget.js`, with no build step at runtime and no external dependency.
  - It renders a floating bubble inside a shadow DOM, so no CSS leaks in either direction.
  - It works at phone width (360 px) and on desktop, and supports the keyboard and screen readers (aria roles).
  - It is configured with `data-vc-key`, `data-vc-api`, `data-vc-proxy`, `data-vc-title`, `data-vc-color` and `data-vc-voice`.
- **W2. Text chat.**
  - In key mode, the widget sends `X-VC-Key` and posts to `/v1/public/chat/turns`. In proxy mode, it posts the same body to the host's `data-vc-proxy` URL.
  - It renders the message, the claims and the source links.
  - The footer always shows 14416 / 112.
  - It shows the 401 and 429 states (Retry-After) and a typing indicator.
  - The conversation is kept in memory only. Nothing goes into `localStorage`.
- **W3. Demo and tests.**
  - `apps/widget/demo.html` embeds the widget against a local API.
  - Unit tests cover config parsing, request headers per mode, and the 401/429 handling.
- **W4. Hosting.** VC serves the script at `/widget/vc-widget.js` (static via nginx), with a long cache and a version in the file name.

### pc-voice (after pc-partner-keys and pc-widget)
- **V1. Owner override of A10.**
  - go-live-gate accepts `Owner-override: <iso> — Umesh — D-111` in a10-voice-gate.md in place of `Result: PASS`.
  - The gate output says "A10 OVERRIDDEN by owner (D-111)". Without that line, the gate behaves as today.
- **V2. Key-authenticated voice sessions.**
  - Partner keys (server-to-server with student headers, as in K3) can mint voice sessions.
  - Anonymous key callers get voice sessions with the same zero-persistence and crisis rules as the anonymous text route.
  - The voice WebSocket origin check uses the key's `allowedOrigins`.
- **V3. Widget mic.**
  - With `data-vc-voice="on"`, a mic button starts and stops a session and shows the live transcript and the reply.
  - A crisis turn shows the fixed crisis message and the helpline.
  - If mic permission is denied, the widget falls back to text.

### pc-docs-openapi (after pc-partner-keys)
- **D1.** `PARTNER_OPENAPI` in openapi.ts describes the partner routes, their headers, errors and rate limits, and passes an OpenAPI 3.1 validation test.
- **D2.** `docs/partner-integration.md` is a one-page guide covering:
  - the widget snippet for key mode and for proxy mode;
  - a Node proxy example;
  - curl examples;
  - rotating and revoking keys;
  - limits and crisis behaviour.

## Unchanged
- crisisGuard and the LK10 wording.
- D-110: Tele-MANAS appears only on distress, and the footer always.
- The anonymous zero-persistence rule.
- Grounding redaction.
