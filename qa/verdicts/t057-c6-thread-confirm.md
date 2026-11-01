# Verdict: t057-c6-thread-confirm

Cycle checked: 0
VERDICT: PASS
Checked at: 2026-11-01T14:46:57+05:30
Checker: Mode A, fresh context. Bound tree HEAD 0cfc70b9; candidate a8b86f8e (apps/ and packages/ unchanged between a8b86f8e and HEAD, `git diff --stat` empty).

## Run myself
- `cd apps/widget && npm test` on the bound tree: tests 132, pass 132, fail 0.

## Server rule vs predicate
- packages/db/src/profile-facts.ts:256-257: for confirm/reject with a candidate ref and `requireCandidateThread`, `!input.threadId || !candidate || candidate.threadId !== input.threadId` throws ProfileFactChanged.
- apps/api/src/chat.ts:1264 always passes `requireCandidateThread: true`; a thread the student does not own is also 409 memory_changed (chat.ts:1262).
- Widget `foreignCandidate` (vc-widget.js:628-631) is true when a pendingChange exists and its threadId is not a non-empty string equal to selectedThread. That is the exact complement of the server's accept condition (missing, empty, non-string and different all map to foreign). `candidateFor` returns null for foreign, so no Confirm/Reject is built; a message is shown instead (vc-widget.js:665-666); Forget is outside that branch (vc-widget.js:671 onward) and stays.

## Criteria
- T1 PASS. The shipped C6 test covers other-thread confirmed, other-thread proposed, and threadless confirmed: no Confirm/Reject, "another chat" text, Forget present.
  Hostile variants I added in a scratch copy (not the bound tree): threadId '' (confirmed and proposed), null, number 42, 'owned-1 ' (trailing space), 'OWNED-1' (case). All show zero Confirm/Reject, the message, and Forget. Green on the real code.
- T2 PASS. Same hostile test: matching thread 'owned-1' with status confirmed shows "Confirm change to" and "Reject change to"; the click POSTs /decision with exactly {action:'confirm',threadId:'owned-1',value:'Canada',candidateId:'cand-9',expectedVersion:'v-9'}. The shipped test asserts the same body for status proposed.
- T3 PASS. qa/.delivery/requests/t057-walk.mjs:451-465 (Vidysea widget c6-confirm): arms `waitForResponse` for POST .../decision (20 s timeout) before the click, throws on non-2xx, and `step()` (line 86-93) turns any throw into FAIL. I ran the extracted logic against a stub: 409 -> throws "decision returned 409"; 200 -> {decision:200}; no response -> throws Timeout. `node --check` ok.

## Falsification (scratch copy, bound tree untouched)
- Replaced the `foreignCandidate` body with `return false`. The shipped C6 test went red and so did my hostile test (pass 81, fail 4). The remaining two failures (S13, voice.test.js) are scratch artifacts: ENOENT on ../../infra/ubuntu/nginx-vc.conf, not copied; both pass on the bound tree. With the real predicate the scratch run showed only those same two artifact failures and the hostile test passed.

## Observations (non-blocking)
- Low: in the walk, if `confirm.click()` itself throws, the already-armed `decided` promise can reject 20 s later unhandled (Node may exit). Harmless to the verdict, since the step already failed; a `decided.catch(()=>{})` would tidy it.
- Low: the Pathlynks walk's c6-confirm (t057-walk.mjs:253-262) is a different widget and still only clicks without asserting a decision status. It is outside T3 as written (the Vidysea widget path), and the C6 failure came from the Vidysea widget.
- The builder noted no thread-switch flip test; not required by T1-T3.

## Result
All of T1-T3 evidenced by runs and a red-on-revert falsification. PASS.
