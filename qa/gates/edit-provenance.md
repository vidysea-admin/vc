# Gate: when a counsellor edits a fact, what is its source? (T-008 residual 2)
**Asked:** 2026-09-25 · **Answered:** 2026-09-26 (see below) · **Blocks:** follow-up to T-008 (the edit provenance fix)

**Why you're being asked:** On the approval screen a counsellor can edit a fact, for example intake
"September 2027" → "January 2028". Today the edited fact is saved with the ORIGINAL transcript quote as
its source, so the quote contradicts the saved value, and nothing records that it was an edit. B2 says
every fact must be cited.

**Question:** How should an edited fact be cited?
- **(a) Recommended:** the edited fact gets source = `counsellor-edit` (counsellor, time, and the original
  quote kept as "edited from"). The quote stays visible as history, and the value is attributed to the counsellor.
- (b) An edit is not allowed. The counsellor must reject the fact and add a new fact by hand, with its
  own source.
- (c) Keep it as it is today (the original quote), plus an "edited" flag only.

Answered: 2026-09-26 — Umesh in chat, checker session 64d95bcd.
- (a) Verbatim: "hnn mai apne system me bhi store karna hai plus ye sab properly store hoga wahan bhi like developers apne end pe to rakhte hi hain aur hum apne end pe bhi rakhenge".
- Reading: an edited fact gets source `counsellor-edit` (counsellor, time, original quote kept as "edited from"). It is stored in VC's KG, and the same provenance goes out to the Pathlynks side (API response + fact-approved webhook, B21). Contract: B2/B3 amendment.
