# T-052 cycle2 finite repair plan (planner t052-planner, 2026-10-16) — PROPOSED, NOT APPROVED

Authority: D-082 (Umesh GO, 28 frozen existing files, plan check first). This is a plan only. Planner edited no
product, test, contract or ledger file. Sequence: fresh independent PLAN review, then maker edits, then 128 controls,
expanded affected modules and types, then both blind checkers. No oracle weakening, no new files or modules, no push.

## 0. Inputs verified at plan time

- 28-file inventory `qa/.wave.json currentCandidate.inputs`: re-hashed SHA256 at 2026-10-16T19:1x+05:30. **28/28 match,
  drift 0.** All source anchors below are therefore valid against the frozen pins (erasure 33B6B594, facts 18F59B7B,
  decisions ECB9B520, nodes 5DC65C23, graph 9AC10E0C, persistence test 3DEB7382, per-fact test 7694E67A).
- Refusals read: `qa/evidence/t052-maker-cycle2/initial-persistence-plan-approval.md` 621-675 (whole SHA C634B366...):
  (A) timer one-hunk refusal, (B) complete-packet A61BB refusal (7 source defects + 4 test gaps).
- Owners' amendment drafts: `initial-graph-closure-proposed.md` 3556-4737 (Amendments N, D/R1-R7, G1-G6, F1-F6,
  tests L/D/S, mandatory seals). These are the candidate hunks. This plan binds them to failures and refusal reasons,
  and adds the items they still lack (sections 3.8 and 4).
- Verdicts: `qa/verdicts/vc-release-t052-2026-10-13.md` (primary F1/F2) and `.b.md` (secondary F1/F2). ISS-120/121/122
  in `qa/issues.jsonl` lines 623-625.

## 1. Current run (actual, executed once, read-only)

Command (cwd D:/vc, pattern = the exact D072 128-control regex):
`bash scripts/vc-testlock.sh node node_modules/tsx/dist/cli.mjs --test --test-concurrency=1 --test-timeout=120000
 --test-reporter=tap --test-name-pattern "<D072 regex>" packages/db/tests/facts.test.ts packages/db/tests/decisions.test.ts
 packages/engine/tests/scribe-persistence.test.ts packages/engine/tests/scribe-checkpointer.test.ts
 packages/engine/tests/scribe-per-fact.test.ts`
Result: **tests 128, pass 74, fail 54, cancelled 0, skipped 0, exit 1**, duration 403 s (19:13:18 to 19:20:16 +05:30).
Log: scratchpad `run128.log`; per-failure table `fails.txt`.

Per module (TAP 1-7 decisions, 8-33 facts, 34-49 adapter, 50-67 nodes, 68-128 persistence): decisions 7 (7 pass / 0
fail) · facts 26 (10/16) · adapter 16 (0/16) · nodes 18 (6/12) · persistence 61 (51/10). Sum 74/54.
Classification count: PRODUCT 5 (N-d 1, P-b 3, P-c 1) · HARNESS/TEST-SETUP 16 (N-a 3, N-b 3, N-c 4, P-a 6) ·
ENV-SUSPECT 33 (F-a 14, F-b 2, A-a 12, A-b 4 mixed, N-e 1). Total 54. The adapter rows are counted once. Their
product layer A-c (reached in D073: 8 provider-count, 3 clean-settlement, 4 message, 1 signal) is planned anyway.

ENVIRONMENT NOTE (load-bearing): same-byte D073 run took 44 s. This run took 403 s with 35-39 concurrent node
processes from other agents (the testlock serializes vc tests only), C: at 96% (20 GB free), 6.6 GB free RAM. Every
control here has 30-40 ms deadlines and 500/2000 ms reachability races. **33 of the 54 failures are on controls
whose source and test bytes are identical to D073 and passed there, or failed there at a later stage.** They are classed
ENV-SUSPECT, not product defects, until a quiet-lane rerun (step P0) says otherwise.

## 2. Failure inventory and classification (54)

| # | Controls (TAP no.) | Module | First failing assertion (current bytes) | Class |
|---|---|---|---|---|
| F-a | 14 summary original receipt 8-21 | facts | facts.test.ts:1877 "summary original gate not reached before helper attempt terminated" (deadlineMs 40, :1872) | ENV-SUSPECT: identical bytes 26/26 PASS in D073 |
| F-b | 2 partial wrapper 32-33 | facts | facts.test.ts:3127 same gate shape (driver gate not reached) | ENV-SUSPECT, as F-a |
| A-a | 12 adapter 34,35,38,39,41-45,47-49 | adapter | scribe-checkpointer.test.ts:289 "native adapter read reached and remains live" | ENV-SUSPECT reachability, masks the product layer A-c |
| A-b | 4 adapter 36,37,40,46 | adapter | scribe-checkpointer.test.ts:299 `runHits===1 && signal.aborted` falsy | MIXED: D073 reached same gate class once (ORIGINAL_DEADLINE_SIGNAL_GATE_MISMATCH) |
| A-c | (D073-reached layer, now masked) | adapter | start path: :308 provider-call count rises after expiry (8); resume: graph.ts:1674 clean settlement rejects (3); :314 message boundary (4) | PRODUCT (causal closure + start-path dispatch after expiry) |
| N-a | 50,52,54 | nodes | per-fact:1543 "SETUP/REACHABILITY: held candidate primitive must be reached" | HARNESS (D071/D073 SETUP_UNREACHED) |
| N-b | 64,65,66 | nodes | per-fact:1562 "O-before-timer W then semantic postcheck must be reached" | HARNESS + timing |
| N-c | 56,57,61,67 | nodes | per-fact:1596 "fault only at actual writeApproved final authority frame" (nodeFrame regex) | HARNESS (frame selector) |
| N-d | 58 | nodes | per-fact:1643 strict equality on settled outcome of own node expiry | PRODUCT (causal closure) |
| N-e | 60 | nodes | per-fact:1576 "clean direct publication succeeds" (row 10 got error) | ENV-SUSPECT first (PASS in D073); PRODUCT if it reproduces quiet |
| P-a | 104-109 preowner session/grant/fence | persistence | persistence:662 "exact initial X read not reached", run finished `done/rejected` | HARNESS: selector stale vs source |
| P-b | 116, 119, 127 | persistence | graph.ts:1674 AggregateError "original settlement and owned cleanup failed" on clean own expiry | PRODUCT (causal closure) |
| P-c | 120 | persistence | persistence:789 expected "...owned compensation failed." got cleanup collector message | PRODUCT (routing) |

Resolved since D073 (now PASS): persistence 128 "unexpected postcheck descendant retains produced ROOT" (D076 fix) and
nodes 59 "positively receipted child expiry". Decisions 7/7 PASS fresh (no longer reused-only).

## 3. Root cause, exact change, falsifier — per cluster

All "change" items are in-place edits to the named existing function. Anchor lines are frozen-pin source positions;
the maker re-measures them from final bytes before any test repin (refusal B rule: no guessed numeric site).

### 3.1 P-b, N-d, A-c(resume): own source-issued FWD has no receipt, so closure calls it unexpected
- Evidence: test 127 diagnostic DAG (run128.log line 1598): failures include causeless FWD id5 from
  `actual-deadline-op-rejection` (WriterDeadline.op, erasure.ts:615) and its wrapping aggregates; every producer
  label is `unknown`. The underLease collector (graph.ts:1600-1678, `expected` fixed point at 1655-1670) admits an error
  only if `created.expectedFailures` holds a receipt for it. op/run FWDs caught at direct catches never call
  `rememberGraphCausal`/onExpectedExpiry before the next await, so the closure cannot prove them.
- Change (graph.ts): **G5** complete direct first-ingress map (every listed catch, including 1217/1342/2394/2744, calls
  `rememberGraphCausal(ctx, binding)` first, before guard/await/collector); **G4** private causalContext routing for
  ownerless `deps.authorize` (2240/2271/2368/2524/2684/2699) via `authorizeSnapshot` catch175; **G6** postcheck
  catch744 frontier into invokeFenceAware. Plus **timer identity, section 3.8**, so the signal reason, run rejection and
  throwIfAborted carry one receipted FWD rather than a separate DOMException.
- Falsifier: persistence 116/119/127 and per-fact 58 must turn GREEN with unchanged oracles. Persistence 128 (unexpected
  postcheck descendant) and 115 (raw cycle) must stay GREEN; they prove the change did not just mark everything expected.

### 3.2 P-c: reject-audit failure routed to the wrong collector
- Root cause: the actual reject-audit raw rejection on the start path reaches the underLease cleanup collector
  (graph.ts:1674 message) instead of the invokeFenceAware compensation envelope (graph.ts:1035, "original settlement
  and owned compensation failed."). The causal frame is lost before compensation sees it, which is the same ingress gap
  as 3.1.
- Change: G5 ingress at the reject-audit catch inside invokeFenceAware, plus G1 observation of the discovered P, so
  compensation owns the rejection first. No message text change.
- Falsifier: persistence 120 GREEN on the existing message assertion at :789; 119 (clean sibling) GREEN.

### 3.3 A-c(start): provider dispatched after original checkpoint-read expiry
- Root cause [ASSUMPTION, to be confirmed by the P0 quiet run reaching :308]: on the start path the held native
  adapter read outlives the deadline, then the extract node still calls the provider. Source fact: nodes.ts
  `generateWithRetry` (1160-1176) and `extractFacts` (1180-1186) call `provider.generate` with no signal or deadline
  check. Only the LangGraph run config carries `signal: deadline.signal` (graph.ts runnableConfig 647-657).
- Change: in the existing graph.ts extract-node wrapper that calls `extractFacts`, call `config.signal?.throwIfAborted()`
  immediately before the call. With 3.8 the reason is the single receipted FWD. No change to the nodes.ts signature,
  no new error class, no budget change. If the plan reviewer prefers it, pass the same signal into `generateWithRetry`
  and check it before each attempt; that is equivalent and also stays in an existing function.
- Falsifier: adapter start rows 34-41 reach :308 and keep `provider.calls.length === providerAtHold`. A mutant that
  removes the guard must turn :308 RED (maker shows RED then GREEN).

### 3.4 P-a: preowner selector no longer matches the source
- Root cause: the test hook at persistence:651-652 holds `findOne` only when `frames[1]` matches `resumeUnderDeadline`.
  The frozen source performs these reads inside arrow IIFEs `deadline.run((() => {...})())` at graph.ts:2043 (session),
  2045 (isStudentFenced), 2046 (grant). frames[1] is the anonymous arrow, so the hold never arms and resume runs to
  `done/rejected`. This is a test-setup defect, not product.
- Change (scribe-persistence.test.ts, existing callback 645 only): replace the `direct` predicate with an exact
  file:line frame match on the final measured graph.ts callsites (same method/selector/phase, D076 1376 style). Keep the
  `once` guard, 500 ms deadline, 2000 ms safety, no-ACK/no-disclosure and BSON-before assertions byte-identical.
- Falsifier: all six reach the hold (gate passes), then the original late-read oracles decide. A deliberately wrong
  line must fail at the same reachability gate, which proves the predicate is selective.

### 3.5 N-a, N-b, N-c: per-fact reachability gates
- Root cause: N-c gates on `nodeFrame` matching `scribe/nodes.(ts|js):` at the writeApproved final-authority frame.
  After the frozen nodes.ts restructure, the injected fault surfaces from an arrow/IIFE frame first; same class as 3.4.
  N-a/N-b race a held candidate insert and an "O-before-timer W" ordering against a 30 ms deadline, so they are timing
  sensitive under load (D071 classed 9 such SETUP_UNREACHED).
- Change: (i) per-fact N-c: exact final-measured nodes.ts file:line frame match in the existing assertion at :1596 only.
  (ii) N-a/N-b: no test change until P0. If they reproduce on a quiet lane, the root cause is the facts candidate-insert
  callsite (facts.ts:2082 insert inside async work 1977-2105, per D076) and the fix is the D076-style exact frame repin.
  Budgets stay 30/200 ms and 5/8 s.
- Falsifier: gates pass, and the behavioural oracles that follow decide 50-67. Nodes 51/53/55/59/62/63 must stay GREEN.

### 3.6 F-a, F-b, A-a, N-e: ENV-SUSPECT
- Root cause hypothesis: the 40 ms summary deadline and the adapter `ready` vs `attempt` race lose to scheduler delay
  under 9x slowdown. Same bytes passed in D073 (facts 26/26).
- Change: none to product or test bytes. Budgets are protected oracles and must not be widened.
- Falsifier: P0 quiet rerun. If facts reach 26/26 and adapter reaches past :289, the class is confirmed ENVIRONMENTAL.
  If any still fails quiet, it is reclassified and planned as a product item before the source freeze.

### 3.7 Refusal-B source defects (no current failing control yet; each gets a new supplemental control)
| Refusal item | Defect (frozen source) | Amendment (proposed.md lines) | Falsifier control (existing callback, supplemental rows) |
|---|---|---|---|
| B1 facts | observation faults dropped on success exits facts.ts:1015/1594/2138, deferred commit 1975, ordinary failure 441 | F1 3829 (precheck 439/441), F2 3880 (main 931-1015 `expiredAtEntry || provenanceFailures.length`), F3 3906 (ensure 1132/readonly 1598 `closedSettlements`), F4/F5 4116 + seal 4306 (summary 2138, deferred 1975), F6 3948/3981 (early callbacks, ledger checked before reflection) | test D 4261 superseded by 4539 + summary branch 4610/4735: genuine native Promise with one-shot throwing constructor getter faults only the subscription; success must NOT publish; primary + fault identities retained; owned rows cleaned |
| B2 decisions | coexisting terminal hides observer faults (352-355) | R2 (in Amendment D 3599): combined AggregateError before priority throws, original order, no change without a fault | 4539/4606: S+F and S+C rows in healthy callback41; every collection compared after filtering exact own residue |
| B3 decisions | no rejected-drained-P parent forcing (2416) | R3-R5 (3599-3753): `completedOutcomes`, `forcedSettlementParents`, `forcedOutcomeEdges` before first await 271 | supplemental row: late-discovered parent pointing to an already drained rejecting original must be forced unexpected |
| B4 decisions | ingress misses insert catch 183; 209 binds `authorityErr` | R1: `observeCausal(err)` before `isDuplicateKey` at 183; 209 maps `authorityErr`; direct drivers 182/202 observed | duplicate-key row: capture before classification; replay/duplicate ownership unchanged (idempotent79 protected) |
| B5 nodes | getter `err.cause` read at nodes.ts:1546 | N 3560: own-DATA descriptor only, birth + history + taint gate; refusal rethrows SAME err | getter-throws and getter-returns-FactConflictError rows both rethrow original err; legitimate data-cause conflict still converts |
| B6 graph | discovered native P not observed while batch peer held | G1 3754: `observeGraphOriginal(CTX, op)` in 8 `unjoined` loops (930/1241/1366/1635/1711/1857/2422/2762) | test S 4389: P rejects R carrying C; C removed while Q held; R's C still reported |
| B7 graph | no-consent crisis 1156 and direct catches 1217/1342/2394/2744 unobserved | G1 second half (escalateTurns budget.run observe), G5 4249, G6 4475 | crisis row: escalation rejects ordinary error under a live deadline; cause shape preserved across the cleanup yield at 1359 |

### 3.8 Refusal A (timer identity) — construction-before-exposure guard, replaces the refused one-hunk
- Defect: erasure.ts:599-602 aborts with a default DOMException, then fires a separately minted FWD. LangChain
  `getAbortSignalError` surfaces the DOMException, which has no receipt (feeds 3.1). The refused fix exposed a mutable FWD
  to sync abort listeners before its first receipt (falsifier: listener sets prototype to AggregateError, errors=[],
  swaps `settled`).
- Change (erasure.ts WriterDeadline constructor timer and the existing shared birth/inspector API from packet 1521-2086,
  which reviewer found no ownership or privacy flaw in): `const expired = new FencedWriterDeadlineError(); register
  birth snapshot (prototype, own cause/errors descriptors, the ORIGINAL settled P held privately) ; controller.abort(expired);
  fire(expired)`. Same ms, abort-before-fire order and disposal. Consumers (graph rememberGraphCausal, facts/decisions
  ownExpiryFailures, nodes 1503-1519) call `WriterDeadline.expiryConstruction(err)`. Any shape change since birth means
  tainted, forced unexpected. Discovery drains the birth-held settled P, never the mutable property.
- Falsifiers (existing persistence helper callback 835-891 and erasure callback 2202): (1) `signal.reason === own run
  rejection === throwIfAborted reason` identity with two run observers; (2) sync listener mutates prototype, errors,
  cause or settled: result is rejection and the real nested rejection is still reported; (3) restore-after-drift
  (sticky, G2 3786 + test S) still rejects; (4) pre-abort success, error and timeout paths unchanged. Abort-before-fire
  is claimed by static source order only, with no runtime claim (refusal B test gap 4 accepted as disclosed).

## 4. Refusal-B test gaps — answers

1. Sticky drift after restoration: G2 `detachedCausalRoots` (never cleared) + test S 4389 restores descriptors after
   genuine observation, before Q join; must still reject and keep captured refs.
2. Flag-only / explicit undefined / inherited DATA / non-native settled: test L 4188, appended in existing erasure
   callback 2202 after PART2; each has a negative row plus the unchanged positive companion.
3. pregelTaskId: NEW in this plan. In existing persistence callback 836 (own helper FWD clean) the clean row is run
   through the real compiled graph with the existing retry policy, so `retry.js:52` adds `pregelTaskId` to the SAME FWD.
   Assert the own key is present (not test-decorated) and the closure still fulfills. If the installed path does not
   add it, record UNPROVEN and do not claim the boundary.
4. Abort-before-fire: static only, disclosed. No private-expiry inspection.

## 5. ISS mapping

| ISS | Root cause (verdict) | Current WIP state | Remaining change | Falsifier |
|---|---|---|---|---|
| ISS-120 | summary driver selector bound only `_id/studentId` (old facts.ts:931); graph compensation did not remove leaked approved facts | facts.ts:2091-2092 CAS now binds `lifecycleGeneration`+`creationAttempt`; 1807-1829 capture original grant id+incarnation; graph.ts:259 passes originalGrant | none expected beyond 3.1 closure; confirm leaked approved facts are compensated under grant loss | in-tree persistence:1145 "B23 cycle2: actual approved summary driver cannot overwrite erased recreated winner" + checker `.b/acceptance.test.ts:111,120` |
| ISS-121 | final `getState` publication outside captured authority | graph.ts readOutcome 660-700 now `owner.authorize()` after getState and before both returns; grant identity compared at 853/2063/2730 | none expected | in-tree persistence:1190 "held final ${window} refuses erased original publication" + persistence:77 |
| ISS-122 | exportStudent returned raw edges incl. writerToken | erasure.ts:2051 explicit allowlist projection (`_id, from{kind,id}, to{kind,id}, rel, createdAt, concern`); erasure.test.ts:713 seeded check | NEW: real-path control. In existing persistence:1540 (approve then export) assert every exported edge has no `writerToken` key and deep-equals the allowlist | persistence:1540 + erasure:713/2328 + checker `.b/acceptance.test.ts:117` |

ISS controls current status: see section 8 (run in flight or completed at handback).

## 6. Execution order for the maker (after PLAN APPROVE only)

- P0 (no edits): quiet-lane rerun of the same 128 command with no other node workload (root coordinator stops other
  heavy lanes). Output classifies the section 3.6 rows. Abort the plan freeze if C: free < 15 GB.
- P1 source, disjoint owners, parallel: erasure.ts (3.8) · facts.ts (F1-F6, seal) · decisions.ts (R1-R7) · nodes.ts
  (N, 3.3) · graph.ts (G1-G6). Each owner gives an exact inverse diff and pins.
- P2 tests, after source freeze measured: per-fact :1596 repin, persistence :651 repin, test L/S/D/summary branches,
  pregelTaskId row, ISS-122 real-path assertion.
- P3 one runtime lane: db+engine typecheck, then 128 controls, then the supplemental selectors, then the ISS controls,
  then expanded affected modules (facts, decisions, erasure, consent, db-init, persistence, checkpointer, per-fact,
  erasure-fence, rules-e2e, b18, crisis, api server, web session-api, evals score).
- P4: both blind checkers fresh, then release 6c and the local browser flow.

## 7. Boundaries kept

No new file, helper module or export. No budget, deadline, class, name, time or signal exemption. All 128 controls,
the 16 adapter and 33 persistence protected assertions, D069 O/W/E chronology, foreign BSON and presence, and
ACK/lease/generation predicates stay byte-identical except the two named selector repins (3.4, 3.5-i), which change only
reachability predicates. Opaque external Promise ancestry, same-turn foreign mutation before first observation, and
D076 parent-op receipt ownership remain UNPROVEN. They are not waived.
Risk: 3.3 is an [ASSUMPTION] until P0 reaches :308. N-e and N-a/N-b may turn out to be product defects on a quiet lane.

## 8. ISS in-tree control run (actual)

Command: `bash scripts/vc-testlock.sh node node_modules/tsx/dist/cli.mjs --test --test-concurrency=1
--test-timeout=120000 --test-reporter=tap --test-name-pattern '^(B23 cycle2.*|B15 export: the bundle.*|B23 capture: held
materialized.*|ISS-t-007-rev-7.*)$' packages/engine/tests/scribe-persistence.test.ts packages/db/tests/erasure.test.ts`
Result: **tests 14, pass 14, fail 0, exit 0** (log scratchpad `runiss.log`, completed about 19:45 +05:30 after a lock wait).
Covers persistence:1145 (ISS-120), :1190 x4 windows + :77 (ISS-121), erasure:713/2328 (ISS-122 seeded), persistence:1540.
Meaning: the WIP source already closes the three ISS on the in-tree controls. **This is maker-side evidence, not
closure.** Closure still needs the 3.1 causal fix (the ISS paths share the deadline closure), the new ISS-122 real-path
assertion, and both blind checkers re-running `.b/acceptance.test.ts:111/117/120` and the primary
`run-authority.mjs` probes, which the maker must not run as acceptance.
