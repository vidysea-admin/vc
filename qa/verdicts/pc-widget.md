# Verdict: pc-widget (cycle 0)
Cycle checked: 0
Date: 2026-10-22 · Policy-Version: proportional-verification/2026-10-19.17 · Bound to D:/vc/.worktrees/pc-widget, branch wave/pc-widget, head dc64cdd0084a, base 3a70309 (= merge-base with main, verified).
Dual check: no (manifest; no auth logic, the key is an opaque header).

## Check plan
UI surface (new app) -> Mode D, own browser script. Logic -> tests re-run plus 1 falsification per criterion (W1-W4). Persona walk required: anonymous Vidysea-website visitor (key mode, 360 px phone) and Pathlynks student (proxy mode, desktop). Security read of the changed lines (textContent only, http/https links only, no storage, key not logged). Diff-scope read (4c). No data, prompt or portal checks. SERIAL: tests ran through the shared test lock; the browser stub used its own port 5191.

## Evidence
- Tests (own run): `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 600 node --test "apps/widget/tests/*.test.js"` -> exit 0, 26 pass, 0 fail.
- Browser (own script, real Chromium 153 via playwright-core 1.63.0, stub-server.js on port 5191, PID 28020 started and killed by this checker): 41/41 checks. Script and report: qa/evidence/browser-pc-widget-checker-c0/ (checker-browser.js, checker-report.json, chk-360.png). The maker's smoke.js was not used.
- Persona walks: qa/evidence/persona-pc-widget-visitor/persona-walk.md and qa/evidence/persona-pc-widget-student/persona-walk.md. No high finding.
- Falsification (copies outside the tree; named test green before, red after): W1 colour validation off -> red; W2 unverified flag forced false -> red; W3 401 branch removed -> red; W4 nosniff dropped from the alias block -> red. A first W2 attempt (httpUrl accepting any protocol) survived because sanitizeUrl also rejects an empty hostname (equivalent mutant), so it was replaced. Details: qa/checkpoints/pc-widget.md.
- Real API shape re-checked against packages/schemas/src/student-api.ts:20-52 and :157-168 (state enum, claim status, source url) and the Retry-After header at apps/api/src/anonymous.ts:478: the widget reads exactly those fields.

## Criteria
- [W1] MET. Shadow DOM host with an open root and no light-DOM children. Hostile page CSS (display none, 3 px font, lime buttons, borders) did not reach in, and the widget did not restyle the host h1 or button. At 360 px the panel sits inside the viewport with no horizontal scroll, 44 px targets and a 16 px textarea; desktop panel 380 px. role=dialog, aria-label, aria-expanded and role=log present; Enter, Shift+Enter, Esc and focus return work. data-vc-key/api/proxy/title/color applied, hostile title and colour values inert; data-vc-voice parsed, no mic (pc-voice owns it); one script, no external dependency (a test scans the source for http(s) URLs).
- [W2] MET. Key mode: POST .../v1/public/chat/turns with X-VC-Key and a body of exactly {text}, no cookie even with a browser cookie present (stub log). Proxy mode: same body to /api/vc, no key, host session cookie sent (stub log: cookie present, key null). Message, 2 claims ("(unverified)" flag) and source links render; footer 14416 / 112 always; crisis block; 401 -> "Chat unavailable" and input disabled; 429 -> "Please wait N s", Send disabled, text returned to the box, re-enabled after Retry-After 3 (about 3 s), Enter during the wait sends nothing; typing indicator; 500 and network errors. localStorage, sessionStorage, cookies, IndexedDB and Cache API untouched, and the conversation is gone after reload. A hostile reply (img onerror, script, b, i in message, claim and title) rendered as literal text with no element and no execution. javascript:, data:, tab-split java<TAB>script:, upper-case JAVASCRIPT: and //host links were dropped; http/https kept with rel=noopener noreferrer. A 3000-char unbroken string does not overflow at 360 px. The key is never in the shadow DOM, host element or any console message, and a bad data-vc-proxy logs an error that does not echo the key.
- [W3] MET. demo.html loads against the local stub (key mode and ?mode=proxy); 26 unit tests green, covering config parsing, headers per mode, and 401 and 429.
- [W4] MET at snippet level. nginx-widget.conf.snippet serves /widget/vc-widget.v1.js (immutable, max-age 31536000) and the alias /widget/vc-widget.js (max-age 300), same file, nosniff, everything else under /widget/ returns 404; it matches gate default (5) on the last line of qa/feedback-inbox.md. nginx is not installed here, so the snippet was string-checked (hosting.test.js) and the stub served the same file under both names; a real nginx load is not proven (see P1).
- Invariants: [I1] and [I4] untouched (no API change). [I2] holds: the footer always shows 14416 / 112 and the crisis block carries it. [I3] holds: nothing is stored.

## Diff scope (4c)
`git diff 3a70309...HEAD`: 15 files, 1253 insertions, 0 deletions, 0 renames; all under apps/widget/**, qa/manifests, qa/evidence/browser-pc-widget-2026-10-22, qa/evidence/p1-briefs; each listed in What changed. No existing code removed.

## Findings (none blocking). Ledger rows are not written from this worktree, to avoid a conflict on qa/issues.jsonl at merge; the orchestrator mints them.
PROPOSED-ISSUE P1: {"sev":"medium","type":"integration","summary":"Nothing wires nginx-widget.conf.snippet into infra/ubuntu/nginx-vc.conf. K5 (pc-partner-keys) does not list /widget, the manifest has no CORE-REQUEST line, and nginx-vc.conf routes unknown paths to root /opt/vc/apps/student, so after both units merge /widget/vc-widget.js is still not served.","fix":"Add a CORE-REQUEST or a small follow-up unit that includes the snippet in nginx-vc.conf, then curl both /widget URLs on a real nginx."}
PROPOSED-ISSUE P2: {"sev":"low","type":"hygiene","summary":"pnpm-lock.yaml has no importer for the new workspace package apps/widget; pnpm install --frozen-lockfile still exits 0 on a copy, but a plain install adds 'apps/widget: {}'.","fix":"Commit the one-line lockfile change with the merge."}
PROPOSED-ISSUE P3: {"sev":"low","type":"gap","summary":"Proxy mode talks to the student chat API whose TURN_STATES include 'concern' (packages/schemas/src/student-api.ts:99); the widget maps any unknown state to ok, so a concern reply shows as a normal bubble.","fix":"Decide in the Pathlynks proxy or pc-docs whether concern needs distinct rendering."}
Not verified (out of scope for this unit): real API and CORS (K4 belongs to pc-partner-keys), real nginx, screen-reader pass, browsers other than Chromium, iOS Safari.

VERDICT: PASS
SCOREBOARD: 4/4 criteria met, 4/4 invariants hold
TIER: M (new UI app, multi-file behaviour; no L trigger in the changed non-test files)
FAILURES: none
CAPABILITY-COVERAGE: 4/4 rows reproduced (one falsification per criterion W1-W4)
LIVE-BROWSER: qa/evidence/browser-pc-widget-checker-c0/
ISSUES-WRITTEN: none (PROPOSED-ISSUE P1-P3 above)
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)
EXPLANATION: Every criterion was evidenced by the checker's own run: 26/26 unit tests, 41/41 checks in a real browser (hostile page CSS, hostile model text and links, 429 and 401 states, both persona walks) and one red-after falsification per criterion. W4 is proven at the snippet and file-serving level only, and the snippet is not yet included in nginx-vc.conf, which is the main follow-up.
Metrics: start=2026-10-22T07:39:57+05:30 end=2026-10-22T07:47:10+05:30 wall_min=8 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=1 mutations=5 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=433 mutants=0 defects_unit=0 defects_6c=0
slow: own browser script (41 checks, 2 test-script selector fixes) 4 min
