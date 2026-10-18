# Senior review result: U8r cycle 2 (c3d3069..585f6dc), 2026-10-19

VERDICT: Approve. No critical, high or medium findings. Escalation fails toward more escalation, never toward losing one.

- The ALS scope is correct: two concurrent students with different names do not cross, and a missing scope falls back without confirming the slot. The 10-min window is correct: takeCrisisSlot is synchronous, release settles done(false), a failed prev is never restored, eviction is bounded. The 5 s wait has no deadlock (Promise.race, timer cleared in finally and unref'd, done never rejects). redact.ts has no ReDoS (14 inputs of 100-280k chars, worst 42 ms), the sentence-swallow fix holds, and the Dr. A. P. J. Abdul Kalam case is fixed. The 503 comes before any write.
- Checks: apps/api 204/204 (chat-privacy 36/36), schemas 98/98. Tests are additions only. Probes are in scratchpad/rev-u8r-c2/.

## Low (ledger rows)
- Thundering herd: when a holder fails, all waiters go loose (1 failing holder + 6 waiters gave 6 escalations). It fails safe. Fix: wait once more on the new holder.
- The helpline reply is delayed up to 5 s while a holder is slow or hung.
- Over-redaction from "sri"/"kumari" and initials ("My name is Kumari. I want to die" becomes "[NAME] want to die"). Precision only; escalation is protected.
- A quiet-turn replay branch calls listChatTurns on every quiet turn, and a crisis flood is not rate limited. This predates cycle 2.

## Open questions (for Umesh)
- The window is per process: does the deployment run more than one API instance?
- During a profile outage a crisis escalation lacks the Pathlynks name redaction. Is that accepted, given the escalation reaches a human?
- D-093 4A: do unconsented minors get no escalation at all? Should a same-id retry of a failed escalation ever re-escalate?

## Test gaps
- Cross-request ALS with two names, several waiters on one failing holder, and an assertion that the wait timer is cleaned up.
