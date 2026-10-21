# golive-student-ui — minimal student chat page

Status: ready-for-check
Phase: ready-for-check
Fix cycle: 0
Policy-Version: proportional-verification/2026-10-19.17
Tier: M (new public UI surface). Branch wave/golive-student-ui, base main 5305e82.
Work source: golive-launch Q2 "a (own minimal student UI)", Q3 nginx serves `/` static and proxies `/v1/` to the API (same origin, no CORS); g-publish b: text only.

## What was built
apps/student/index.html, style.css, app.js (108 lines total). No framework, no build step, no external scripts or fonts, no analytics.
API contract used exactly (apps/api/src/anonymous.ts:54,436-441; packages/schemas/src/student-api.ts:153-165): POST /v1/public/chat/turns, body exactly {"text": string<=4000}; response {state: ok|no_sourced_answer|sign_in_required|escalated, message?, claims, sources}; every non-200 carries {error, helpline}; 429 carries retry-after.
Note: the anonymous API is stateless and returns no session/thread id, so there is none to keep or resend (the brief said "if the API supports it").
Rendering: replies via textContent only. escalated is shown as a crisis block plus the fixed Tele-MANAS/112 line; message is optional so each state has a fallback text.

## Pre-check
- Pre-check: contract read at the two cited locations before writing; body is exactly {text}.
- Pre-check: no localStorage/sessionStorage in app.js (grep count 0).
- Pre-check: no http(s):// references in index.html, style.css or app.js other than the same-origin relative API path.

## Live browser evidence
Dir: qa/evidence/browser-golive-student-ui-2026-10-21/ (report.json, 360px.png). Playwright MCP, 360x640, against a throwaway scratchpad mock (not committed) serving the folder plus the endpoint.
11 interactions, all pass: 2 normal turns, no_sourced_answer fallback, 429 with retry-after, escalated crisis block, 500 with helpline, XSS payload inert (0 img elements, no onerror fired), send disabled while waiting, body shape, 360px footer visible with no horizontal scroll, no storage use.
Console: 0 JS errors. The only console entries are Chromium's "Failed to load resource" lines for the deliberately injected 429 and 500. A favicon 404 seen on first load was fixed (inline data: icon) and the reload was clean.

## Metrics
files=3 lines=108 external_requests=0 console_js_errors=0 interactions=11/11 pass.

## Not verified here (for the checker)
Real API/nginx integration (mock only); screen reader pass; browsers other than Chromium; behaviour on the real response of a long message (maxlength 4000 enforced client side).
