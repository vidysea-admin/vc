# Verdict: t057-c6-late-proposal (Mode A feature check, plus re-run of the T-057 local E2E)

**Cycle checked:** 0
**Checker:** /checker (fresh context), read-only toward product code; wrote only this file. Mutations and probes ran in scratch copies made with `git archive HEAD apps/widget`, never in the bound tree.
**Code tested:** candidate 8ea575d7 (apps/widget unchanged by the HEAD 6aa27186 manifest commit; `diff` of scratch copy vs working tree = SAME)
**Policy-Version:** proportional-verification/2026-10-19.17
**Run at:** 2026-11-01T18:06:34+05:30 to 18:24+05:30
**Overall: PASS** (unit L1, L2, L3 verified; E2E C6 verified in a real browser; C5 BLOCKED by DevOps, not this unit; three low PROPOSED-ISSUEs)

## Evidence

| Check | Command | Result |
|---|---|---|
| Scope | `git diff --name-only bf5e0d4a HEAD -- apps` | only `apps/widget/src/vc-widget.js` and `apps/widget/tests/floater.test.js`. Whole-range list adds `qa/.delivery/requests/t057-walk.mjs` and qa docs/verdicts, all as the manifest lists. No other product file. |
| Suite | `cd apps/widget && npm test` | tests 134, pass 134, fail 0 |
| L1 outcome (my probe, not the maker's test) | scratch test: fake profile returns `[]` at reply time, then a `proposed` target_country with candidate cand-9/v-9; `profilePollMs:[20,60]`; send; flip published; wait; click Confirm | OK: memory panel shows target_country with the Confirm button; the click POSTs `.../fact-late/decision` with body action=confirm, candidateId=cand-9, expectedVersion=v-9, value=Canada, threadId owned-1. Before the flip the panel did not show it. |
| Maker's test is falsifiable | remove `pollProfileAfterTurn()` call in a copy; run floater.test.js | pass 55 fail 1 (the new "publishes after the reply" test), so it goes red |
| Guard: busy | drop `busy` from the timer guard; probe: New chat POST hangs (busy, same thread), timer fires | red ("poll fired while busy"); green with the guard |
| Guard: thread switch | drop `thread !== selectedThread`; probe: New chat completes, later timer fires | red ("poll fired for a stale thread"); green with the guard |
| Guard: focus in memory panel | delete the `activeElement`/`contains` line; probe sets `shadowRoot.activeElement` to a control inside `.memory` | red ("poll rebuilt the panel under focus"); green with the guard; control case (focus on the input) still refreshes |
| Guard: destroyed | drop `destroyed` alone | stays green: equivalent mutant. Three layers cover it: destroy clears the timers, the timer guard, and `resource()` refuses after destroy. Dropping both the clear and the guard also stayed green on the mid-wait probe (resource() layer), so this guard is defence in depth, not a gap. |
| Timers | probe wraps `setTimeout`/`clearTimeout` and counts live poll timers | after turn 1 = 2, after turn 2 = 2 (replaced, not doubled), after destroy = 0. Removing the clears makes this red (the `timers` probe fails). |
| Key and unauthenticated proxy modes | probe: KEY_CFG and `{mode:'proxy',turnUrl}` with `profilePollMs:[4321,30]`, send, wait | zero live poll timers and no URL containing `profile`. `pollProfileAfterTurn` is called only from `submitAuthenticated`, which `submit()` reaches only `if (auth)`. Pathlynks proxy/key modes (auth null) never poll. |
| Destroy during the post-turn refresh | probe: hold the `/profile` fetch, destroy, release | no further fetch (good) but 1 live timer set remains up to 60 s (`LIVE-TIMERS-AFTER-DESTROY-MIDREFRESH 1`). See PROPOSED-ISSUE 1. |
| E2E walk (own run) | `node qa/.delivery/requests/t057-walk.mjs vidysea` against widget :8790 (served bytes md5 e66f9f47... equals the worktree source), FE :3001, API :8787, started 18:08 | log `scratchpad/walk-vidysea.log`; my node process (pid 44956) stopped afterwards; the servers were left running. |

Walk lines (one per step; no reply text printed):

```
step01 login OK 8475ms | step02 student-central OK | step03 open-widget OK
step04 c3-careers OK reply=321ch kind=bot
step05 c5-kb-university FAIL "no-citation (reply kind=note, not a sourced answer)"
step06 c6-clean OK 46444ms | step07 c6-propose OK reply=877ch kind=note
step08 c6-confirm OK 13414ms | step09 c6-new-thread-recall OK reply=856ch kind=note
step10 c9-crisis OK kind=crisis 606ch | step11 reload-history OK bubbles=4
```

## Judgement

- **L1 PASS.** A proposal published after the reply shows with Confirm without a reload, and the decision POST carries the right candidate, version and fact id.
- **L2 PASS with a gap in the shipped tests.** All four guards behave correctly; busy, thread and focus each go red under mutation, destroyed is redundant by design. The shipped test file covers none of them (the manifest says so). My probes live only in scratch; see PROPOSED-ISSUE 2.
- **L3 PASS.** Walk 8m: c6-propose OK, c6-confirm OK, c6-new-thread-recall OK. The walk throws unless `/decision` answers 2xx, and for recall it throws unless the reply matches /canada/. I looked at the step08 and step09 screenshots (qa/evidence/t057/vidysea-08, -09, ignored by git): after the confirm the panel reads "target-country: Canada" with Correct/Forget (confirmed, this walk's own fact), budget_inr still "awaiting confirmation", banner "Memory updated."; in the new thread the confirmed target-country remains and the reply discusses Canada. The other candidate shown ("Proposed in another chat") was not touched.
- **C5: BLOCKED, not this unit.** Same symptom as the earlier verdict (reply kind=note, no sourced answer; the KB `/search` was down in that verdict's preflight). I did not run my own KB preflight this time, so "KB down" is inherited, not re-measured. Owner DevOps.
- **C10 voice** was not exercised (walk run without `--voice`); not re-judged here.
- **qa/evidence/t057-demo.md vs what I saw:** C6 row "OK" matches (propose, confirm 2xx on own fact, recall names Canada). C11 "PARTIAL: 10/11 steps OK, C5 FAILs" matches (10 OK, C5 FAIL). But both rows still cite "Run 8c" and step numbers from the older walk (step06 c5, step07 propose, step08 confirm, step09 recall). The walk now has c6-clean, so C5 is step05, and the late-proposal fix (8ea575d7) is not cited. Update the rows to this run.

## PROPOSED-ISSUEs

PROPOSED-ISSUE: low | apps/widget/src/vc-widget.js `pollProfileAfterTurn` (called after `await refreshProfile()` in `submitAuthenticated`): if the widget is destroyed while that refresh is in flight, the timers are scheduled after destroy has already cleared the list, so up to four timers (max 60 s) stay live. The guard stops any action, so the effect is only a delayed closure release. Add `if (destroyed) return;` at the top of the function | owner: maker
PROPOSED-ISSUE: low | apps/widget/tests/floater.test.js: no test for the busy, thread-switch, focus-in-memory-panel or destroyed guards, no check that a second turn replaces the timers, and none that key/proxy modes never poll; the fake DOM has no `contains` or `shadowRoot.activeElement`, so the focus guard cannot run there without the shim my probe used. My scratch probes (scratchpad/probe.part.js) cover each and were red under mutation; port them | owner: maker
PROPOSED-ISSUE: low | qa/.delivery/requests/t057-walk.mjs c6-confirm: the loop closes and reopens the widget every few seconds when no Confirm is visible (that reopen runs `refreshProfile` itself), so a walk PASS cannot tell the 6/15/30/60 s poll from the reopen. L1 rests on the unit test and probes, not on the walk. Add a first phase of about 70 s that only waits, without reopening, before falling back to the reopen loop | owner: maker
PROPOSED-ISSUE: low | qa/evidence/t057-demo.md C6/C11 rows: refresh run label, step numbers and cite 8ea575d7 plus this verdict (see Judgement) | owner: maker

Metrics: checker_min=18 builder_min=n/a files_read=8 commands_run=24 cycle=0 mutations=6 probes=8 walk_run=1
