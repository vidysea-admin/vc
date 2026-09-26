# Gate — failover-scope (T-021)
**Opened:** 2026-09-26 (from the T-021 ai-engineer review; issue ISS-t-021-rev-2)
**Blocks:** nothing now (T-021 fix cycle proceeds on the current reading); would reopen T-021 if the answer differs.

Q1. "about 10 retry" — is that 10 attempts TOTAL across the 3 models (built: ~3-4 per model), or ~10 PER model (~30 total, much longer wait)?
  - A. 10 total (current build, keeps the wait short) — recommended
  - B. 10 per model

Q2. If model 1 answers but in the wrong shape (bad JSON structure, not an outage), should that also count as "failed": try models 2/3, then alert engineering + apology/Retry?
  - A. Yes — treat wrong-shape like an outage (fail over, then alert + apology) — recommended
  - B. No — keep the current behaviour (one re-ask on model 1, then the session continues with no facts and a note)

Answer format: "Q1 A, Q2 A" in chat; recorded here as `Answered: <ISO> — <choice> — <where>`.

Answered: 2026-09-26T20:07:30+05:30 — Q1 A (10 attempts TOTAL across the 3 models, as built), Q2 A (wrong-shape output counts as failed: fail over to models 2/3, then alert engineering + apology/Retry) — Umesh in chat to the checker session ("Am, A", read as "A, A")
