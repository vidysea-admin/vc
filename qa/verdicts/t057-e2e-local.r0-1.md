# Verdict: t057-e2e-local (Mode A, acceptance check of qa/evidence/t057-demo.md)

**Cycle checked:** 0
**Checker:** /checker (fresh context), read-only; wrote only this file
**Code HEAD tested:** 6ba74d57 (servers already running; not restarted)
**Policy-Version:** proportional-verification/2026-10-19.17
**Run at:** 2026-11-01T14:30 to 14:36 +05:30
**Overall: FAIL** (one row is false: C6 "confirm OK"; every other row verified)

## Evidence

| Check | Result |
|---|---|
| Preflight (own run, connection strings filtered) | Matches the table exactly: mongo virtual_counsellor OK; pathlynks db FAIL connect_error; vidysea db OK; kb /search FAIL "unavailable in 4022 ms" (table: 4025 ms). C1 BLOCKED 2/4 is true. |
| Isolation probe (read first; prints status codes and a thread-count only, never the key) | A create 201; A reads own 200; B via B path 404; B header on A path 404; B lists 200 threads=0; B posts into A thread 404; no key 401. C8 OK is true. |
| Headed walk `vidysea --voice` (own run, log `scratchpad/walk-vidysea-check.log`) | step01 login OK; 02 OK; 03 OK; **04 c10-voice OK reply=250ch (>100) userTranscript=31ch audioFrames=49**; 05 c3 OK reply=321ch kind=bot; **06 c5 FAIL no-citation (kind=note)**; 07 c6-propose OK; 08 c6-confirm "OK"; 09 recall OK 892ch; 10 c9 crisis OK kind=crisis 606ch; 11 reload bubbles=4. Same shape as the table (C10 250ch vs 315ch is variation, still far above 100). |
| C5 cause | Preflight kb row FAIL (unavailable, ~4 s) plus reply kind=note. The API contract (openapi.ts:674) says no servable source returns state `no_sourced_answer`, which the widget renders as a note (vc-widget.js:549). A down KB gives exactly this; the walk fails before any VC-code fault shows. BLOCKED on KB redeploy (DevOps) is a correct cause and owner. |
| Admin :3108/admin | Redirects to /admin/login; "Virtual Counsellor admin / Sign in with your admin account", Email, Password, Sign in render. Not signed in. PARTIAL is true. |

## Finding that makes the table false: C6 confirm

The table says "C6 OK: step08 confirm OK" and "recall in a new thread".

- In my run, and in the run 8b log, the Confirm click returned `net 409 POST .../vc/profile/facts/1ec09f66.../decision`. openapi.ts:699 says a 409 on this route is `memory_changed` (stale candidate/version).
- Screenshot `qa/evidence/t057/vidysea-08-c6-confirm.png` shows the banner "Memory changed. Please review the current choice and try again." and the fact still "target-country: Canada (awaiting confirmation)". The step09 screenshot (new thread) still lists it as awaiting confirmation. Older proposals (IIT Bombay, budget) also remain pending.
- The walk step (t057-walk.mjs:451-461) clicks Confirm and returns `{}` without checking the response status or that the fact left "awaiting", so it passes either way.
- The step09 reply (892ch, kind=note) is generic study-abroad text. The walk checks only length and kind, so it is not proof that a confirmed preference was recalled.

So "propose, confirm, recall" is not demonstrated end to end in this run or in 8b. C6 should read FAIL or UNPROVEN, owner maker. The walk should assert a 2xx decision and a "Confirmed" state before the recall step. The same fact id appearing in two runs suggests stale-candidate collision from earlier runs. I did not query the DB.

## Built-scope judgement
C3, C7, C8, C9, C10 work locally. C6 is unproven or broken in the UI path (409 on confirm). C5, C1, C2, C4 and C11-PL are blocked on DevOps or Umesh.

PROPOSED-ISSUE: high | C6 confirm click in the widget returns 409 memory_changed; the fact stays "awaiting confirmation" and the walk reports OK | repro: `node qa/.delivery/requests/t057-walk.mjs vidysea --voice`, step08 | owner: maker (widget/API memory decision; investigate stale candidate versus fact-id collision with earlier runs)
PROPOSED-ISSUE: medium | t057-walk.mjs c6-confirm (lines 451-461) and c6-new-thread-recall assert nothing about the decision status or recall content, so the walk false-passes C6 | owner: maker
PROPOSED-ISSUE: low | qa/evidence/t057-demo.md C6 and C11 rows overstate: change C6 to FAIL or UNPROVEN and C11 to 9/11 until the above is fixed | owner: maker

Metrics: checker_min=6 builder_min=n/a files_read=9 commands_run=14 cycle=0 reuse=none
