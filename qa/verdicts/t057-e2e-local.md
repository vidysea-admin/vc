# Verdict: t057-e2e-local (Mode A, acceptance check of qa/evidence/t057-demo.md)

**Cycle checked:** 1
**Checker:** /checker (fresh context), read-only; wrote only this file (and renamed the cycle-0 verdict to t057-e2e-local.r0-1.md)
**Code HEAD tested:** 66f8c93f (servers already running; not restarted)
**Policy-Version:** proportional-verification/2026-10-19.17
**Run at:** 2026-11-01T14:56:25+05:30
**Overall: FAIL** (one row is still overstated: C6 "propose, confirm, recall"; everything else verified)

## Evidence

| Check | Result |
|---|---|
| Preflight (own run, connection strings filtered) | mongo virtual_counsellor OK; pathlynks db FAIL connect_error; vidysea db OK; kb /search FAIL "unavailable in 4020 ms" (table 4025 ms). C1 BLOCKED 2/4 is true. |
| Headed walk `vidysea --voice` (own run, log scratchpad/walk-vidysea-check2.log, my node process stopped afterwards) | 01 login OK; 02 OK; 03 OK; 04 c10-voice OK reply=315ch userTranscript=31ch audioFrames=62; 05 c3 OK 321ch kind=bot; 06 c5 FAIL no-citation (kind=note); 07 c6-propose OK 853ch; 08 c6-confirm OK; 09 recall OK 917ch kind=note; 10 c9 OK kind=crisis 606ch; 11 reload bubbles=4. Same shape as the table (10/11, C5 the only FAIL). Zero "409" in the log. |
| C6 decision status | The walk throws unless /decision answers 2xx (t057-walk.mjs:451-470), and no 4xx line was logged, so the decision was 2xx. The step line does not print decision=<status> (step() prints only len/kind/bubbles). |
| Isolation probe (read first; prints codes and a count only, never the key) | A create 201; A own 200; B via B path 404; B header on A path 404; B lists threads=0; B posts into A thread 404; no key 401. C8 OK is true. |
| C5 cause | Preflight kb row FAIL (unavailable) plus reply kind=note (no_sourced_answer rendered as a note). Cause is the KB being down, not VC code; owner DevOps. True. |
| Admin :3108/admin | Redirects to /admin/login; "Virtual Counsellor admin", "Sign in with your admin account", password field render. Not signed in. PARTIAL is true. |
| Doc claims vs git | All cited shas exist with matching subjects (8eaf5b33, a8b86f8e, 65f5279d, 79cc922f, dfb0f8cc, a41bf67d, 259520ea, 5965a06b, bf5e0d4a, 67aa4577, e2f01472, 435ab9f3, 826e216b). rev-list --count vidysea/main..5965a06b = 13 (true); at HEAD 66f8c93f it is 14 (the doc commit). vidysea/main = 2e84adcf true. |

## Finding that keeps the table from being true: C6 confirm and recall are not the proposed fact

Screenshots of this run (qa/evidence/t057/vidysea-07, -08, -09):
- Step07 panel: "target-country: Canada (awaiting confirmation) - Proposed in another chat; open that chat to confirm or reject it." (the fix works: no Confirm offered for it). The bot reply ends "Should I remember target institution as IIT Bombay? Please confirm or say no." That candidate comes from the step06 KB question (IIT Bombay), not from the step07 prompt (Canada, 20 lakh budget).
- Step08: the walk's `mem.getByRole("button", {name: /^Confirm/}).first()` confirmed that IIT Bombay candidate (banner "Memory updated."). The Canada/budget preference was never confirmed.
- Step09 (new thread): target_institution IIT Bombay now shows as confirmed (Correct/Forget), Canada is not confirmed, and the visible reply to "Where do I prefer to study and what is my budget?" is generic (no Canada, no 20 lakh in the visible part). The walk checks only length and kind=note for the recall step.

So 2xx on a decision is proven, but "propose (Canada/budget) -> confirm -> recall in a new thread" is not demonstrated. The walk can still false-pass C6 by confirming any unrelated candidate in the current thread, and recall asserts nothing about content. Row C6 "OK" and the C11 "10/11" (which counts C6) overstate.

PROPOSED-ISSUE: high | qa/evidence/t057-demo.md C6 row says OK for propose, confirm, recall, but the confirmed fact was target_institution IIT Bombay (from the C5 question), not the proposed Canada/budget; recall is unproven. Change C6 to PARTIAL (decision path 2xx proven; recall unproven) or fix the walk and re-run | owner: maker
PROPOSED-ISSUE: medium | t057-walk.mjs c6-confirm clicks the first Confirm button, not the one for the fact just proposed (target-country / budget); c6-new-thread-recall checks only length and kind, so it cannot fail on a missing recall. Assert the confirmed key matches the proposal and that the recall reply names Canada or 20 lakh | owner: maker
PROPOSED-ISSUE: low | step() log line omits decision=<status>, so the log alone cannot show the C6 status; print info.decision | owner: maker
PROPOSED-ISSUE: low | the first scripted login logs net 401 POST /api/v1/counsellor-os/login before step01 OK (retry loop); harmless, but note it in the doc | owner: maker

Metrics: checker_min=9 builder_min=n/a files_read=7 commands_run=14 cycle=1 reuse=cycle-0 verdict r0-1
