# Independent final check — BLOCKED / incomplete
Candidate SHA256: cba313e054fce1b70171961ca1560be3eca9675f220c4b3ee191a5b2ba5414e3 (verified)
Command: node qa/evidence/checker-ratio-20261016/independent/rewrite1/oracle.mjs
Exit: 1
Reached: C1 complete valid synthetic opening baseline deliveryValidate passed.
Blocked: missing-baseline deliveryClaim expected checker budget required, but rejected earlier with delivery: active ownership overlap (tick.mjs:1945). Independent fixture ownership collided with an existing active admission. No ownership bypass or existing-ledger changes attempted.
No credit: C1 missing/tampered/unknown/scope denials, C2 exact/aggregate/helper/retry controls, C3 invocation/debit/recovery execution, three intended-assertion mutants and restored GREEN were not reached. Setup and premature refusal are not acceptance evidence.
Source lens: supplied recovery code binds checker_budget across state/current/previous packets; claim code aggregates retained reservations; run code records elapsed without refunding unknown tokens. These observations are source review only, not independent execution proof. Existing .12 ownership gate was observed refusing overlapping work. Full downstream identity/ownership preservation remains unverified.
Verdict: BLOCKED; no product defect established and no PASS issued. Aggregate actual efficiency UNKNOWN. T056 prior history/cost retained; no efficiency claim.
Scope: synthetic QA files only; existing Git HEAD read read-only; no Git writes, product edits, database/provider calls, subagents or global changes. Candidate source bytes were not written.
