# Gate: erasure-fencing
**Opened:** 2026-09-25 (T-011 reviews)
**Questions:**
1. **Write fence.** Once an erasure is confirmed, should the engine REFUSE new writes for that studentId (requireConsent/applyApprovedDiff/startScribe check an erasure tombstone)?
   - This is the only way to close the last race: a write landing between the final clean read-back and the "completed" update survives while the receipt says verified (reproduced by the data-engineer review).
   - It also decides re-enrolment. Options: (a) a permanent fence per studentId, so a returning person gets a new id; (b) a fence only while the erasure runs plus a short grace period, after which re-enrolment is allowed; (c) no fence, accepting the documented residual.
   - **Recommended: (b)**, fence from confirm until completion plus 24h. It closes the race and allows a later legitimate re-enrolment.
2. **Audit pseudonym.** The audit row keeps a salted sha256 of studentId. The checker recovered it from a 50k-candidate list in 18 ms. Switch to an HMAC keyed by a new `.env` secret (e.g. `VC_AUDIT_HMAC_KEY`, name only in .env.example)? **Recommended: yes.**
**Blocks:** nothing now. T-011 can merge with these documented as residuals; the answers become a follow-up unit.

Answered: 2026-09-26 — Umesh in chat + AskUserQuestion, checker session 64d95bcd.
- Workflow verbatim: "sabse pehle hamein do baar confirmation lena padega uske baad delete ki request jayegi admin ya ek concerned usko wo delete kar dega … auto delete abhi nahi banate … lekin isko configurable bana denge ki auto delete agar on kar denge baad me to auto delete ho jaye … kisi ek concerned person ki email id wagairah par wo aa jaye request".
- Q1: "Delete+24h lock" = (b), a fence from confirm until the purge completes plus 24 h; re-enrolment is allowed after that.
- Q2: HMAC yes (`VC_AUDIT_HMAC_KEY`, name only in .env.example).
- Contract: B15 amendment (2-step student confirm → approver request by email via an outbox → approver approves → purge + read-back; `autoDelete` config default false).
