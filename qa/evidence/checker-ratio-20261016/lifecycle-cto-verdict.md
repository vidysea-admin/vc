# T056 CTO Brief — p0-lifecycle-cto
Verdict: APPROVE the prospective design specified below; existing isolated .13 remains BLOCKED. Same-checker closeout, no new acceptance or budget reset. Actual aggregate ratio UNKNOWN.

## Current
Verified supplied source hashes unchanged. Probe records .12 build/check success and .13 first measured binding failure at deliveryState:1929; no tests rerun. Global .12 restoration is reported, not independently reverified here.
Whole-budget immutability rejects the necessary null-to-measured transition; maker-ID-keyed accounting also risks a second ledger when original build usage arrives after preliminary plan review.
## Target
One original feature/root/cycle lineage: estimated planning review → approved original build → measured original readiness → independent final checking → quality closeout; retain all historical review costs.
## Options
Reject a measured pre-build baseline, blanket mutable budgets, or a replacement workflow: each excludes original work, permits inflation, or loses debit history. Use explicit phase transitions and one final measured binding.
## Recommended Direction
1. Register a finite, provenance-labelled planning allowance before dispatch using estimates, separately from measured 10% compliance. Admit only the declared plan-review task under it; preserve its reservations and actual usage. No measured maker baseline is required before original build exists.
2. Require independent plan approval before original build; predeclare eligible original plan/build task and attempt identities. Preliminary maker readiness may append attributable original build usage until first complete readiness, retaining prior maker contributions and all checker debits.
3. Seal original readiness exactly once after successful original-build evidence, no active contributing runs, and complete attributable timing/token telemetry. Bind its report hash, original cohort and candidate/source identities; independently reconcile report totals with retained history. Root orchestration is not maker; unknown attribution blocks binding, never becomes zero.
4. Permit only this validated null-to-measured envelope transition inside the admission lock. Preserve workflow/root/feature/cycle, task DAG, criteria, pinned policy/protocol, resource caps and other budget fields under existing recovery rules. Missing and null envelopes have the same unbound meaning.
5. Use a stable lineage accounting identity independent of report hash or maker IDs; retain all prior review/helper/integration, failed, cancelled and retry costs. Reconcile opening totals and reservations by immutable attempt/run identity exactly once, avoiding both omission and double debit.
6. Freeze denominator at original readiness: subsequent repairs, retries, orchestration, reissued reports, added maker IDs or relabelled sessions cannot enlarge it. Any readiness correction that changes the sealed denominator blocks this cycle; recovery cannot reset it.
7. Final-check admission requires both remaining time and token headroom against 10% of sealed original maker usage, conservatively retaining reservations without refunds for UNKNOWN usage. Actual usage above reservation increases debit; missing live token interception remains an explicit capability gap, not an enforced actual-token ceiling.
8. Exhausted allowance/budget or incomplete telemetry yields BLOCKED with mandatory independent quality still pending. Never waive checking, inflate the denominator or silently expand planning allowance. Preserve peer owner-closeout grant, epoch limits, single authorized check and human authorization exactly; it cannot reset accounting or stand in for quality PASS.
## Risks
Two-file persistence can orphan or duplicate reservations: require idempotent binding/debit, lock-protected reconciliation and fail-closed crash recovery. Estimated planning admission can consume more than the eventual 10%; report that overrun honestly and block further measured admission.
## Verification
Fresh independent checker must approve the concrete existing-file implementation plan before edits and independently verify the completed candidate; this design verdict is neither implementation acceptance nor measured compliance.
Require full plan-review → original build → late measured bind → final-check → acceptance coverage, proving original build inclusion and prior plan-review debit retention; retain the reached regression at tools/tests/tick-modes.test.mjs:2354.
Require stale report/source/candidate hashes, incomplete/unknown telemetry, omitted historical runs, duplicate reconciliation, failed/cancelled/retry debits, actual over-reservation spend, exhausted budget and crash/concurrent binding rejection.
Require denominator-increase/relabel/reissued-report attacks, premature/double binding, changed root/feature/cycle/DAG, repair exclusion, independent-owner rejection and peer owner-closeout invariants. Prove .12 compatibility for genuine persisted legacy workflows; reject legacy spoofing/backdating and never silently migrate/reset their costs.
## Next Actions
In existing isolated/tools/tick.mjs, change deliveryValidate:1707 for phase-specific allowance/report validation; deliveryState:1921 for explicit phases and the sole validated binding exception; deliveryClaim:1934 for phase/DAG gates and stable cumulative reservation accounting.
Change deliveryRun settlement:2088 for idempotent debit reconciliation and truthful UNKNOWN; deliveryResume:1843 to preserve phase/cohort/debits through existing authorized recovery; deliveryRecord:2113 to gate final acceptance on independent quality and phase completion. Preserve efficiencyCheck:1328 numeric/attribution rules; amend only if needed to reject incomplete final accounting.
Extend existing isolated/tools/tests/tick-modes.test.mjs in place for the independent controls above; no new source modules. Maker supplies exact diff inventory, then fresh plan-quality approval, isolated implementation and fresh final checking; no global rollout from this verdict.
Scope: owned verdict only; no implementation, tests, environment/browser/settings access, git writes, subagents, peer edits or production changes.
