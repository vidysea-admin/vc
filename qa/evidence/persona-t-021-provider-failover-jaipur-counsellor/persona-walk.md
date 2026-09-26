# Persona walk — T-021 provider failover, "average counsellor, tier-2 city (Jaipur), 1-2 years' experience"

Contract B17. Fix cycle 1 re-walk, live via Playwright against `next dev` (localhost:3211, demo
mode), checker's own browser session — same run as
`qa/evidence/browser-t-021-provider-failover-c1-2026-09-26-checker/report.json`.

| Screen | What they tried | What blocked/confused them | Severity |
|---|---|---|---|
| Home (`/`) | Look for a way to start a new counselling session | None — unchanged from cycle 0, still plain and obvious. | n/a |
| New session (`/sessions/new`) | Read the screen to understand what they're about to submit | **Fixed.** The table header now reads "Turn" / **"What was said"** — no longer "Proposed value". Confirmed live: the accessibility snapshot shows `columnheader "What was said"`, and the approval screen's own "Proposed value" label never appears on this page (independently grepped the rendered snapshot). The cycle-0 label-mismatch confusion is gone. | n/a (was medium, ISS-t-021-c0-1) |
| New session, all-fail submit | Understand why nothing happened after clicking Submit, and how long to wait before giving up | Banner reads the same plain apology as cycle 0. Additionally verified (code + live client-timeout test): the counsellor is now protected by BOTH a ~45s server-side deadline and a ~50s client-side safety net — worst case before the apology appears dropped from the old, unbounded ~5.4 minute tail to under a minute. A tier-2 counsellor juggling a live call with a student would have hung up or assumed the tool was broken well before the old worst case; this is a real, material improvement for this exact persona. | n/a |
| New session, Retry | Trust that clicking Retry won't make them redo the form | Confirmed again this cycle: retried POST body is byte-identical to the failed one (compared directly, not from the maker's report). | n/a |
| Approval screen (post-retry) | Confirm the session actually went through | Same as cycle 0 — "Session submitted" + working link, facts render correctly. | n/a |

**Cycle-1 outcome:** `ISS-t-021-c0-1` finding is resolved and independently confirmed live (own
browser, own snapshot, own grep of the rendered page for the old label — absent). No new
high-severity finding for this persona in fix cycle 1.
