# Verdict: golive-student-ui
Verdict: PASS
Cycle checked: 0
Checker: chk-golive-student-ui (fresh, no builder reasoning). Bound to D:/vc/.worktrees/golive-student-ui. Base 5305e82, head 522b8b7. Tier M. Policy: proportional-verification/2026-10-19.17.

## Check plan
Criteria = Build bullets of qa/evidence/p1-briefs/golive-student-ui.md; API contract = apps/api/src/anonymous.ts + packages/schemas/src/student-api.ts. Types: contract compare, static audit, Mode D browser (one anonymous-student persona), falsification.

## Contract match (read in this check)
- Request: AnonymousTurnRequestSchema is strict {text: 1..4000}; anonymous.ts:438-445 refuses any other key unless crisis. app.js:33 sends exactly {text} with JSON content-type. MATCH.
- Response: AnonymousTurnResponseSchema (student-api.ts:158-165) {state: ok|no_sourced_answer|sign_in_required|escalated, message?, claims, sources[{id,kind,title?}]}. app.js reads state, message (typeof-guarded), sources[].title. MATCH. The API is stateless with no thread id, so none is kept: correct.
- Non-200: fail() gives {error, helpline} (anonymous.ts:408); 429 sets retry-after (:451); 413 (:425), 400, 405, 500 (:471). app.js handles 429 (retry-after), non-ok with or without JSON, 413, network failure.

## Criteria
| Criterion | Evidence | Result |
|---|---|---|
| textContent only, no innerHTML with server text | grep of apps/student: no innerHTML/insertAdjacentHTML/eval/document.write (one comment only). Browser: message and source title containing img onerror / script / b render as literal text, window.__pwned undefined, 0 such nodes | PASS |
| Every API state | ok, no_sourced_answer (no message), sign_in_required, escalated (with and without message), 429 retry-after 7, 500 JSON+helpline, 502 HTML, 413, dropped connection, ok-without-message: all readable, send re-enabled | PASS |
| Send disabled while waiting | disabled + status "Waiting for a reply..."; Enter and forced click during wait give 0 extra requests; typed text kept | PASS |
| Helpline footer always visible | exact text present; inside viewport at 360x640, also with a 7000-char unbroken reply; scrollWidth 360 | PASS |
| No message storage, no analytics/external | storage API grep = 0; sessionStorage, cookie, IDB empty; no message text in localStorage; log empty after reload; 0 external requests; no http(s):// in the 3 files; icon is data: | PASS |
| Mobile 360px, a11y, English | 360px.png; label for=msg, role=log, role=status, lang=en | PASS |

## Falsification (floor 1 per criterion; copies in scratchpad outside the worktree; bound tree untouched, git status clean)
Baseline green on the same 6-probe suite; each mutant red on its target:
- F1 textContent -> innerHTML: xss probe red.
- F2 escalated branch disabled: crisis class missing, red.
- F3 remove send.disabled=true: in-flight probe red.
- F4 footer hidden: footer probe red.
- F5 extra body key {text, thread}: mock 400, normal turn red.
- F6 429 branch broken: 429 probe red.

## Findings (non-blocking, ledger rows proposed)
- low/process: manifest lint fails: ERROR no-pre-check (Pre-check lines untagged, no sha/command per criterion), ERROR no-test-selection, WARN no-round-line. Product behaviour was independently executed here, so no mandatory evidence is missing; the maker should fix the manifest format on its next touch.
- low/UX: the typed text is cleared on send; after a 429 or network error the student must retype (app.js:55 clears before the turn).
- low/UX: sign_in_required shows a sign-in text but the page has no sign-in path (message comes from the API; fallback text app.js:26).
- low: Enter during IME composition would submit (no isComposing guard; English-only scope).
- Not verified: real API/nginx integration (mock written from the schema only), screen reader, non-Chromium browsers.

Evidence: qa/evidence/browser-golive-student-ui-2026-10-21-checker/ (report.json, 360px.png, mock-from-real-schema.mjs).
slow: browser-mock-and-mutants 4
Metrics: start=2026-10-21T15:48:03+05:30 end=2026-10-21T15:56:00+05:30 wall_min=8 agent_min=8 blocked_min=0 suite_runs=0 repeat_runs=0 mutations=6 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=480 mutants=0 defects_unit=0 defects_6c=0
