# Manifest — pc-widget
**Contract:** docs/features/partner-chatbot/spec.md section pc-widget, criteria W1 W2 W3 W4 (verbatim); brief qa/evidence/p1-briefs/pc-widget-c0.md; plan docs/features/partner-chatbot/plan.md. Not an edit to qa/contracts.
**Goal task:** none
**Date:** 2026-10-22
**Fix cycle:** 0
**Dual check:** no (no auth logic; the key is an opaque header value)
**Persona walk:** required (visitor on the Vidysea site in key mode; Pathlynks student in proxy mode). Both driven in a real browser, see Live browser evidence.
**Issues addressed:** none
**Executor:** claude-sonnet-subagent
**Executor rationale:** one build unit in one worktree (D:/vc/.worktrees/pc-widget, branch wave/pc-widget, base 3a70309 = 9aee572 plus briefs only).

## What changed
New app apps/widget (all new files; no apps/api, no nginx-vc.conf edit):
- src/vc-widget.js — the widget. parseConfig (data-vc-key/api/proxy/title/color/voice), buildRequest (X-VC-Key in key mode only; proxy posts the same `{text}` body with no key), send (401/403 -> unavailable, 429 -> Retry-After wait 1..300 s, 413/5xx -> error with helpline, network -> network), normalizeReply, sanitizeUrl (http/https only), mount (shadow DOM bubble + dialog panel, typing indicator, claims list with "(unverified)" flag, source links, crisis block, 14416 / 112 footer, Enter sends, Esc closes, aria roles), init (reads document.currentScript). In-memory only.
- src/voice.js — empty stub, exports nothing (pc-voice owns it).
- demo.html (key mode, `?mode=proxy` for proxy mode), tests/stub-server.js (fixture API used by the demo and the smoke), tests/config.test.js, tests/request.test.js, tests/hosting.test.js, nginx-widget.conf.snippet, README.md, package.json (`node --test "tests/*.test.js"`; Node 24 does not accept a bare directory argument to --test).
Noted deviation from the brief text: the brief's test command `node --test apps/widget/tests` fails on Node 24 (it treats the directory as a module); the glob form `node --test "apps/widget/tests/*.test.js"` was used.

## Gate answers
- D-111 (verbatim): "VC ships an embeddable chat widget (one script tag, chatbot bubble) plus the same API for teams with their own UI".
- Pathlynks "through its backend proxy" = data-vc-proxy mode (implemented as proxy mode: no key from the page, same body to the host URL).
- pc-clarify-1 default (5), applied (qa/feedback-inbox.md line 305, 2026-10-22T07:31:46+05:30): W4 file vc-widget.v1.js plus alias vc-widget.js; Cache-Control max-age=31536000 immutable for the versioned file, 300 for the alias. Implemented in apps/widget/nginx-widget.conf.snippet. This is the reading of W4 "a long cache and a version in the file name": the stable alias path is deliberately short-cached (300 s) per the default. Defaults (1)-(4) concern pc-partner-keys (rotate/revoke window, partnerId charset, CORS preflight, Bearer routing) and do not touch apps/widget; not applied here.

## Acceptance criteria and evidence
Policy-Version: proportional-verification/2026-10-19.17
Tier: M (new UI surface, new app); one checker plus live browser. Base 3a70309, code commit 54d3cf7.
Round: 14 files, 4 criteria (W1-W4), est 15 min — new self-contained app, no shared files; one round.

Tests[W1]: apps/widget/tests/config.test.js (all 10: key/proxy/open mode, api and proxy validation, title/colour defaults, voice reserved, contrastText, version) — config parsing and the no-mic rule are the W1 surface that runs without a DOM; shadow DOM, 360 px and aria are covered by the live browser run.
Tests[W2]: apps/widget/tests/request.test.js (headers per mode, body exactly {text}, credentials, reply normalising, sanitizeUrl, the no-storage/no-innerHTML/no-eval source scan) — W2 request and rendering-data contract.
Tests[W3]: apps/widget/tests/request.test.js ("401 -> unavailable", "429 -> rate", "Retry-After parsing", network/non-JSON/other errors) plus the stub-driven demo smoke — W3 is the demo and the 401/429 unit tests.
Tests[W4]: apps/widget/tests/hosting.test.js (versioned name derived from VERSION, immutable year cache, alias 300 s, /widget/ publishes nothing else, nosniff) and config.test.js "the file version matches package.json".

Pre-check[W1]: 54d3cf7 `node --test "apps/widget/tests/config.test.js"` -> exit 0, 10 passed, 0 failed
Pre-check[W2]: 54d3cf7 `node --test "apps/widget/tests/request.test.js"` -> exit 0, 13 passed, 0 failed
Pre-check[W3]: 54d3cf7 `node --test "apps/widget/tests/request.test.js"` -> exit 0, 13 passed, 0 failed
Pre-check[W4]: 54d3cf7 `node --test "apps/widget/tests/hosting.test.js"` -> exit 0, 3 passed, 0 failed
Pre-check[all]: 54d3cf7 `node --test "apps/widget/tests/*.test.js"` -> exit 0, 26 passed, 0 failed (run through VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 600)

Falsify[W1]: proxy mode keeps the key -> red (1 failing: "proxy mode: data-vc-proxy ... wins over a key"); mutated in a copy outside the tree (scratchpad/fals), restored green 26/0 on the committed tree.
Falsify[W2]: X-VC-Key sent in every mode -> red (2 failing: proxy mode NO X-VC-Key; open mode sends no key header).
Falsify[W3]: 429 ignoring Retry-After (fixed 60) -> red (1 failing: "429 -> rate with the Retry-After seconds").
Falsify[W4]: versioned cache changed from immutable year to 300 -> red (1 failing: "the versioned name comes from the file's major version").

## Live browser evidence
Dir: qa/evidence/browser-pc-widget-2026-10-22/ (report.json, smoke.js, 360px.png, desktop.png). Real Chromium (playwright-core 1.63.0 launched by the script itself, because the Playwright MCP browser profile was held by another session) against apps/widget/tests/stub-server.js on port 5174 (not 8080/8787/3399); stub PID 42600 killed by PID afterwards. No live LLM calls.
24 of 24 checks pass, at 360x640 then 1280x800: bubble and panel open; dialog role and aria-expanded; greeting; 14416 / 112 footer always shown; key-mode request carries X-VC-Key with body exactly {text} and no cookie; message, 2 claims (one flagged "(unverified)") and a source link rendered; typing indicator shown and Send disabled while waiting; XSS payload (img onerror, script, b, i in message, claim and source title) rendered as literal text, 0 injected elements, no flag set; no_sourced_answer keeps the https link and drops the javascript: link; escalated shows the crisis block with the helpline; 500 shows the error with the helpline; 429 shows a "please wait" countdown, disables Send, gives the message back and re-enables after Retry-After (3 s); panel inside the 360 px viewport with no horizontal scroll; Esc closes and returns focus to the bubble; no localStorage, sessionStorage or cookies; desktop panel 380 px wide; 401 shows "Chat unavailable" and disables input; proxy mode posts to /api/vc with no X-VC-Key; Shift+Enter does not send.
Console: 0 JS errors; the only console errors are Chromium's "Failed to load resource" for the deliberately injected 500, 429 and 401.
Found and fixed during the smoke: the typing indicator node was never appended to the log, so the first message threw (greeting never rendered); fixed in src/vc-widget.js before the recorded run.

## Metrics
Metrics: start=2026-10-22T07:30:28+05:30 end=2026-10-22T07:39:00+05:30 builder_min=9 wall_min=9 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=3 mutations=4 cycle=0 policy=proportional-verification/2026-10-19.17 tokens=unavailable
mutant-cap-raise: the brief asks for one falsification per criterion and there are 4 criteria (W1-W4), one above the tier M cap of 3.
Sessions: 2b04f90e-6b56-4682-a76c-d8515b93405c

## Not verified here (for the checker)
Real API, real CORS (K4 belongs to pc-partner-keys; the demo is same-origin so no preflight was exercised), nginx snippet loaded into a real nginx (only string-checked), screen-reader pass, browsers other than Chromium, iOS Safari textarea zoom (font-size 16 px is set), a very long reply on a 360 px panel. The 1-year immutable cache on the versioned name relies on bumping the major for any breaking change; same-major fixes keep the name and reach partners via the 300 s alias only.

Status: checked-PASS (cycle 0 verdict 20ee438, qa/verdicts/pc-widget.md)
