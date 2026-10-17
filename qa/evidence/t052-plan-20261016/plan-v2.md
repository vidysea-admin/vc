# T-052 cycle2 finite repair plan v2 (planner t052-planner, 2026-10-17T07:07+05:30). PROPOSED, NOT APPROVED

Authority: D-082 (Umesh GO, frozen 28-file inventory, plan check first). This is a plan only. The planner edited no repo
file. All diagnostics ran in scratchpad copies (`iso`, `iso2`) under scripts/vc-testlock.sh. Supersedes v1 (sha
061af268...). It answers every item of review-refuse-1.md, mapped in section 9.

## 0. Inputs and pins

- 28-file inventory `qa/.wave.json currentCandidate.inputs`. Re-hashed 2026-10-17 07:0x: **drift 0/28**. Pins: erasure 33B6B594,
  facts 18F59B7B, decisions ECB9B520, nodes 5DC65C23, graph 9AC10E0C, checkpointer.ts in scope, persistence test 3DEB7382,
  per-fact test 7694E67A.
- Amendment source: `qa/evidence/t052-maker-cycle2/initial-graph-closure-proposed.md`, on-disk sha 7C5FF94B...18B3,
  lines 1521-4737.
  - **Literal hunk packet:** scratchpad `t052-hunks-v2.md` (sha 0CF8EF38...ACB0, 118 hunks: H-001..H-115 verbatim code blocks + H-116..H-118 verbatim G4/G5/G3 prose,
    each with its source range and anchor prose). It was extracted mechanically, with no edits.
- **Correction to v1:** G1-G6 do NOT apply to the frozen bytes on their own.
  - Frozen graph.ts has 0 occurrences of `rememberGraphCausal`, `GraphCausalContext`, `observerFailures` or
    `observedOriginals`.
  - It has 7 `for (const operation of unjoined)` loops, at 937/1248/1373/1642/1718/1864/2429. G1 cites 8 loops at
    930/.../2762: a constant +7 offset, plus an eighth loop that the base graph packet introduces.
  - So the finite packet = **base layer H-001..H-064** (proposed 1521-3535: erasure, then nodes/decisions/facts/graph
    consumers, then tests) **+ amendments H-065..H-115** (3556-4737). Supersession rules are in section 6.

## 1. Executed evidence (all real runs; counts as printed by node:test)

| Run | Where | Result | Log sha (scratchpad) |
|---|---|---|---|
| R1: the 128 D072 controls, 2026-10-16 19:13-19:20, 403 s | D:/vc (read-only) | 128 tests, 74 pass, 54 fail, exit 1 | run128.log f2e23e34 |
| R2: ISS in-tree controls | D:/vc | 14 tests, 14 pass, exit 0 | runiss.log 17c9acc2 |
| R3: 12 selected rows with stack capture (DIAG-PA/NC/PROV) | iso | 12 tests, 4 pass, 8 fail (2 are an iso path artefact, ENOENT tenant.ts) | diag.log b40ea65f |
| R4: 16 adapter rows with provider+hold capture, 06:59-07:02 | iso (+db junction) | 16 tests, 0 pass, 16 fail | diag2.log ad71e476 |
| R5: ISS controls, baseline then mutants M120/M121/M122, 07:04-07:05 | iso2 (local db copy) | NONE 14/14 · M120 14/14 · M121 14/14 · **M122 12/14** (2 RED) | mut-*.log f7688d88/9264fa5c/d0fb2560/41444358 |

R3-R5 are structural diagnostics under load. They are not quiet-lane classification. **P0 was NOT run**, because the
machine failed the quiet gate (Q) at every sample:

| Sample | node.exe | free RAM | C: free | CPU | lock |
|---|---|---|---|---|---|
| 06:46 | 28 | 1.8 GB | 6.5 GB | 13% | — |
| later | 35 | 4.4 GB | 15.5 GB | 97% | — |
| 06:58:52 | 41 | 3.7 GB | 17.4 GB | 76% | held |

## 2. Quiet gate, P0 protocol and decision rule (amendment 1)

**Q (pre-run).** Every condition must hold on 3 samples 60 s apart:
- vc-testlock dir absent;
- node.exe count ≤ 12 (the planner's own shell excluded);
- CPU ≤ 25%;
- free RAM ≥ 6 GB;
- C: free ≥ 15 GB.

The coordinator stops other heavy lanes to make Q true. It never assumes Q.

**In-run abort.** If the 128-control run exceeds 150 s (D073 took 44 s for 121 controls), the result is NOT-QUIET and
classifies nothing.

**Post-run OOM check.** Report ENVIRONMENTAL, and PASS nothing, if any of these hold:
- C: free < 10 GB;
- the log contains `heap out of memory`, `ENOMEM`, `ERR_WORKER_OUT_OF_MEMORY` or `paging file`;
- exit code is 134 or 3221225477.

**P0 command.** The R1 command, unchanged. Then a second pass over the failing names only, in a scratchpad copy with
the R3/R4 capture patches (`diag_patch.py`, plus `msPastExpiry = Date.now() - selectedDeadline.expiresAt` added to
DIAG-PROV). This pass captures stacks for every P-a, N-a/b/c and A row.

**Byte identity, D073 rootInventory vs now:**
- SAME: facts.ts, decisions.ts, erasure.ts, nodes.ts, graph.ts, facts.test.ts, decisions.test.ts, fakes.ts,
  scribe-fixtures.ts.
- DIFF: persistence test (24B493A7→3DEB7382), checkpointer test (AC84DB51→2D458524), per-fact test (DFADB71F→7694E67A).
- So F-a/F-b (16 facts rows) failed on bytes that passed 26/26 in D073. The adapter, nodes and persistence rows did not
  run on identical bytes.

**Decision rule, for each of the 33 rows now labelled UNCLASSIFIED-PENDING-P0** (F-a 14, F-b 2, A-a 12, N-c 4, N-e 1):
- (a) PASS on a valid quiet P0 → ENVIRONMENTAL. It is re-asserted in P3, and its oracle is unchanged.
- (b) FAIL at a SETUP/REACHABILITY gate, where the captured frame shows a selector/frame mismatch → HARNESS. It gets an
  exact frame repin in the style of section 3.4, as a re-reviewed plan delta.
- (c) Any other quiet FAIL → PRODUCT. It gets a root-cause hunk, re-reviewed before the P1 freeze.
- If Q cannot be met in 2 attempts within 4 h, raise a HUMAN_GATE to the coordinator. Rows are never classified by
  assumption.

## 3. Classification (54 R1 failures)

| ID | Rows | First failure | Class |
|---|---|---|---|
| F-a | 14 facts summary receipt | facts.test.ts:1877 gate not reached (deadline 40 ms :1872) | UNCLASSIFIED-PENDING-P0 |
| F-b | 2 facts partial wrapper | facts.test.ts:3127 driver gate not reached | UNCLASSIFIED-PENDING-P0 |
| A-a | 12 adapter | checkpointer:289 read "reached and remains live" (R4: 2/16) | UNCLASSIFIED-PENDING-P0 |
| A-b | 4 adapter in R1; **13/16 in R4** | checkpointer:299 `selectedDeadline.signal.aborted` falsy after FWD result | **PRODUCT (3.9)** |
| A-c | start: late provider call; resume: R4 row 13 got graph.ts:1674 AggregateError | :308/:314 | PRODUCT (3.1, 3.3) |
| N-a | 50,52,54 | per-fact:1543 held candidate primitive not reached | HARNESS-candidate, P0 decides (rule b) |
| N-b | 64,65,66 | per-fact:1562 O-before-timer W not reached | HARNESS-candidate, P0 decides |
| N-c | 56,57,61,67 | per-fact:1596 `nodeInjection` false | UNCLASSIFIED-PENDING-P0 (R3: all 4 PASS in isolation) |
| N-d | 58 | per-fact:1643 settled outcome | PRODUCT (3.1) |
| N-e | 60 | per-fact:1576 clean direct publication | UNCLASSIFIED-PENDING-P0 |
| P-a | 104-109 | persistence:662 exact initial read not reached | **HARNESS, proven (3.4)** |
| P-b | 116,119,127 | graph.ts:1674 owned-cleanup AggregateError | PRODUCT (3.1) |
| P-c | 120 | persistence:789 wrong envelope message | PRODUCT (3.2) |

## 4. Root causes, hunks, falsifiers (each change names its RED-before evidence)

### 3.1 P-b, N-d, A-c(resume): an own FWD has no causal receipt

- **Root cause:** the underLease collector (graph.ts:1585-1678, envelope 1674) admits a failure only through
  `created.expectedFailures` receipts. op/run FWDs caught at direct catches are never remembered, so the closure calls
  them unexpected. The R1 test-127 DAG shows a causeless FWD from `WriterDeadline.op` (erasure.ts:615).
- **Change:** base graph layer H-042..H-055 (GraphCausalContext, `rememberGraphCausal`, collectors), then G1
  (H-076/077), G2 (H-078..080), G3 (H-090/091 + H-118), G4, G5 and G6 (H-110..112). G4/G5 are prose-only in
  the source, so they are inlined below.
- **G4** (graph.ts):
  - `authorizeSnapshot` (frozen :125) gains a final private `causalContext?: GraphCausalContext`.
  - `const causal = owner ?? causalContext;`, and its catch begins `if (causal) rememberGraphCausal(causal, error);`.
  - GraphDeps.authorize gets an optional fifth argument. Ownerless callsites pass `invocationCreated` (resume),
    `created` (recover) or the inspect-local `causal`.
  - `fencedForPostCheck` (:740) gains `causalContext` and `frontier`. The catch at :744 becomes
    `catch (error) { rememberGraphCausal(causalContext, error); graphApply(graphSetAdd, frontier, [error]); return true; }`.
  - `resumeScribe` mints one private context beside its deadline and passes it into `resumeUnderDeadline` as the last
    parameter. invocationCreated aliases the SAME 4 fields (`causalHistory`, `observedOriginals`, `observerFailures`,
    `detachedCausalRoots`).
- **G5** (graph.ts): every listed catch inserts `rememberGraphCausal(<ctx>, <binding>);` as its FIRST statement. The
  ctx/binding pairs, by catch, are H-117 (verbatim from proposed 4250-4260); G4 full text is H-116; G3 prose is H-118.
  Exceptions:
  - :1915 gets the capture only, never the fault gate;
  - :1342 and :2394 capture before the owner early rethrow;
  - :2744 captures before the collector IIFE.
- **All coordinates are pre-base-layer source coordinates.** The maker re-measures them on the post-base bytes before
  applying, and records the map old→new in the manifest.
- **RED-before:** persistence 116/119/127 and per-fact 58 are RED on the frozen bytes now (R1).
- **Mutant M31** (post-fix): delete the G5 insert in the underLease `err` catch → 116/119/127 RED again.
- **Guards** that must stay GREEN: persistence 128 and 115, which show the change does not mark everything expected.

### 3.2 P-c: reject-audit raw rejection reaches the wrong collector

- **Root cause:** the start-path reject-audit rejection reaches the underLease collector (:1674) before the
  invokeFenceAware compensation envelope (:1035), because there is no first-ingress capture at the owner catches
  `err`:1015/1026 and `error`:1034.
- **Change:** the G5 owner entries plus the G3 post-1026 gate (H-090). No message text changes.
- **RED-before:** persistence 120 is RED now, at :789.
- **Mutant M32:** delete the G5 insert at owner `err`:1015 → 120 RED.
- **Guard:** 119 GREEN.

### 3.3 A-c(start): the late provider call. The issuing node is now identified (amendment 2)

- **Evidence (R4):** in the start rows, after `DIAG-HOLD providerAtHold=2`, a further `fact-extraction` call (n=2) was
  issued in every captured start row, and a `session-summary` call (n=3) in 2 rows.
  - Frames: `generateWithRetry nodes.ts:1168` ← `extractFacts nodes.ts:1182` ← the extract node `graph.ts:218`
    (callback :207, `runtime: { signal }`), driven by `PregelRunner.tick runner.ts:150` → `_runWithRetry retry.ts:123`.
  - The summary call comes from the summary node at graph.ts:225 → `summarizeSession`.
  - **signalAborted=false on all 42 captured calls.**
- **Correction of v1:**
  - the provider request DOES carry `signal: deps.signal` (nodes.ts:1187/1229/1251), from `runtime.signal`
    (graph.ts:218/225);
  - the fixture MockProvider ignores the signal, which is irrelevant here, because the count increments on dispatch;
  - v1's `config.signal` guard is withdrawn.
- **Root cause:** the run signal is still live when the new superstep dispatches, even though the writer has already
  surfaced FWD to the caller (A-b, 13/16). Expiry declared through `op()` (erasure.ts:613-617: `left <= 0`) does not
  abort the controller, so LangGraph sees a live signal and schedules extract/summary. This is the 3.9 defect.
- **Change:** 3.9 alone; there is no node-level change. P0 records `msPastExpiry` for each post-hold call. If any
  post-hold call shows `msPastExpiry < 0` (dispatched before expiry), that is a separate root cause: the checkpointer.ts
  adapter wrapper returns before its native read settles. It becomes a re-reviewed delta on the existing
  checkpointer.ts read wrapper, with no node change.
- **RED-before:** start rows reaching :308 after 3.9. **Mutant M33:** revert 3.9 → :299 and :308 RED under R4
  conditions.

### 3.4 P-a: preowner selector, proven HARNESS (amendment 1, stack-captured)

- **Evidence (R3 DIAG-PA):** the frames are filtered to `packages/**/src/**` (persistence:651). That filter keeps the
  tenant facade `Proxy.findOne (packages/db/src/tenant.ts:309)` as **frames[0]** for all 6 rows:
  - session: `[Proxy.findOne tenant.ts:309, <anonymous> graph.ts:2043:100, resumeUnderDeadline graph.ts:2043:325,
    resumeScribe graph.ts:2007]`;
  - grant: the same chain at graph.ts:2046;
  - fence: `[Proxy.findOne tenant.ts:309, isStudentFenced erasure.ts:676, <anonymous> graph.ts:2045, resumeUnderDeadline
    graph.ts:2045]`.
- The predicate at :652 tests `frames[1]` (or `[1]`/`[2]` for fence), which hits the arrow or isStudentFenced, so
  `direct` is false for every call, `once` never flips, and resume ends `done/rejected`. The reviewer's
  "frames[0]=arrow" reading is contradicted by the captured stack.
- **Change** (persistence test, `target.findOne` override inside callback 645, line 652 only):
  ```ts
  const own = frames.filter(line => !/[\\/]db[\\/]src[\\/]tenant\.ts:/.test(line));
  const direct = origin === "fence"
    ? /at isStudentFenced .*erasure\.ts:/.test(own[0] ?? "") && /at <anonymous> .*graph\.ts:L:/.test(own[1] ?? "") && /at resumeUnderDeadline .*graph\.ts:L:/.test(own[2] ?? "")
    : /at <anonymous> .*graph\.ts:L:/.test(own[0] ?? "") && /at resumeUnderDeadline .*graph\.ts:L:/.test(own[1] ?? "");
  ```
  `L` is the measured final line: session 2043, grant 2046, fence 2045 on frozen bytes, re-measured after P1. The
  following are byte-identical: once, gate, sentinel, 500/2000 ms, BSON before/after, no-ACK/no-disclosure.
- **RED-before:** all 6 rows are RED now at :662.
- **Selectivity mutant M34:** L+1 → all 6 RED at the same :662 gate.

### 3.5 N-a/N-b/N-c: corrected anchor (amendment 5)

- **N-c anchor:** injection is decided in the DB hook inside `nodeOptions.authorize` (per-fact 1447-1461). `frame`
  is taken at :1448. The selector `directNode` is at **:1456-1457**. The early returns are at :1458-1459. The flag is
  set at **:1460** (`nodeInjection = true; nodeFrame = frame;`). :1596 asserts the flag and :1597 matches nodeFrame.
- **R3 DIAG-NC:** `directNode` became true and the injection fired for rows 6/7/11/17. All 4 N-c tests PASS in
  isolation. So there is **no repin in v2**: the selector is correct and the failure is order/load dependent, pending
  P0.
- If P0 reproduces N-c on a quiet lane, the change point is :1456-1457 (the selector), never :1596.
- N-a/N-b have no change until P0 (rule b/c). Budgets stay 30/200 ms and 5/8 s.

### 3.6 Refusal-B source defects B1-B7: unchanged mapping from v1 table 3.7, now with literal hunks

- B1 facts: F1-F6 (H-081..H-089) + seal (H-097/098, 4306).
- B2-B4 decisions: R1-R5 (H-066..H-075), R6/R7 (H-092..H-096), then superseded by R6 strict (H-101..H-104).
- B5 nodes: N (H-065) + base nodes H-011..H-015 + FINAL H-056.
- B6/B7 graph: G1 (H-076/077), G5, G6.
- **Tests:**
  - L: H-099;
  - D: superseded by H-113;
  - summary: H-114/115;
  - S: H-105..H-108;
  - Part5a/b: H-063/064.
- **RED-before for each:** the supplemental row is run on the frozen bytes first and must FAIL (it records the defect).
  It then turns GREEN on the fixed bytes. Any row that passes on frozen bytes is reported as non-discriminating and
  redesigned before the freeze.

### 3.7 pregelTaskId (decided)

- LangGraph 1.4.17 `pregel/retry.js:52` sets `error.pregelTaskId` on the thrown object, which is the same FWD.
- **Row** (existing persistence callback 836, clean own-expiry through the compiled graph):
  - `Object.hasOwn(cause, "pregelTaskId")`;
  - `cause === signal.reason === run rejection` (one identity);
  - the closure fulfils.
- **Mutant M37:** add `pregelTaskId` to the inspector's compared own keys → row RED. This proves the boundary admits
  the LangGraph decoration and nothing else.

### 3.8 Timer identity: a self-consistent erasure.ts API (amendment 3)

- **Exact new public surface:** this is all of it, and it lives in erasure.ts only. It is re-exported by the existing
  `packages/db/src/index.ts:7 export * from "./erasure.js"`, with no index edit.
  - `static inspectCausal(root: unknown, previous?: WriterCausalFrame): WriterCausalFrame | undefined` (H-004);
  - `static expiryConstruction(root: unknown): Readonly<{ nativeShape: readonly WriterCausalFrame[]; unchanged: boolean }> | undefined` (H-003);
  - `export interface WriterCausalFrame` (H-002), plus non-exported types `CausalDescriptor`, `CausalTuple` and
    `CausalRow`;
  - the private static field `#expiryConstructions` (WeakMap via captured intrinsics);
  - the `node:util` import (H-001).
- **Section 7 of v1 ("no new export") is withdrawn and replaced by section 7 below.**
- **Timer hunk H-005:** mint E, register birth, `controller.abort(E)`, `fire(E)`.
- **op hunk H-006:** mint a fresh E with birth and throw it. Merged with 3.9.
- run/dispose are EXACT (H-007).
- **AbortError-reason regression.** After 3.8, `signal.reason` is the FWD, not a DOMException. LangChain
  `getAbortSignalError` (core/dist/utils/signal.js:32) returns that reason. Consumers:
  - graph.ts 1592/1598, 1820, 2397 and nodes.ts:1588 test `instanceof FencedWriterDeadlineError || name === "AbortError"`.
    The first clause now matches.
  - graph.ts 143-177, 2596-2741 and nodes.ts 96-124 (loadApprovedContext) mint their own DOMException AbortError. They
    are unchanged and still match the second clause.
  - grep finds no `signal.reason` consumer in src.
- **Rows:**
  - **AR-1** (existing erasure.test.ts deadline callback, packet anchor 2202, re-measured): `signal.reason instanceof FencedWriterDeadlineError`, and
    `=== run rejection === throwIfAborted() throw`.
  - **AR-2** (persistence callback 836): loadApprovedContext abort under an aborted deadline still yields
    release=false, the expiry branch, and no lease release.
  - **AR-3:** the LangGraph-surfaced FWD reason at underLease is classified expected.
- **RED-before:** AR-1 is RED on the frozen bytes, because the reason is a DOMException.
- **Mutant M38** (`abort()` without a reason) → AR-1 RED.
- **Mutant M38b** (drop `instanceof FencedWriterDeadlineError ||` at 1598) → AR-3 RED, which proves the reason path
  is live.
- **Mutation-before-receipt falsifiers** carry over from v1, numbered 1-4: listener mutation, sticky drift, and the
  unchanged pre-abort paths.

### 3.9 NEW: op-declared expiry leaves the signal live (A-b root, closes A-c start)

- **Evidence:** in R4, 13/16 rows got an FWD result while `selectedDeadline.signal.aborted === false` (:299). In D073
  the same class hit once on a less loaded run (ORIGINAL_DEADLINE_SIGNAL_GATE_MISMATCH). `op()` throws on
  `Date.now() >= expiresAt` before the delayed timer fires.
- **Change** (erasure.ts `WriterDeadline.op`, frozen :613-617, merged into H-006). When `left <= 0` and the signal is
  not aborted:
  - `clearTimeout(this.timer)`;
  - mint E with birth;
  - `controller.abort(E)`;
  - `fire(E)`;
  - `throw E`.
  The timer body and this path share one private method-local closure, captured in the constructor as
  `this.#expire = () => {...}`. That is a private field, not an export. When already aborted, op mints a fresh E with
  birth, as in H-006. `expired()`, run and dispose are unchanged.
- **Row AR-4** (same erasure.test.ts callback, deterministic): `new WriterDeadline(5)`, a synchronous busy-wait of 10 ms, then
  `op()` throws E with `signal.aborted === true` and `signal.reason === E`, and `run(p)` rejects with E.
- **RED-before:** AR-4 is RED on the frozen bytes (aborted false).
- **Mutant M39** (remove the abort from the op path) → AR-4 and checkpointer:299 RED.

### 3.10 ISS: RED-before controls (amendment 4), measured in R5

**ISS-120.**
- **Mutant M120:** delete facts.ts:2092 (`lifecycleGeneration`/`creationAttempt` in the summary CAS selector). It
  stays **GREEN 14/14**, so the in-tree :1145 is blind.
- **Why:** :1145 recreates the winner through `recordApprovedSessionSummary(..."independent recreated summary")`, so
  the prior-field CAS (summary fields) already differs. The generation binding is never the deciding guard.
- **New row** in existing callback 1145, ported from checker `.b/acceptance.test.ts` "B23.3/5" and "purge regrant":
  - while the driver update is held, delete and reseed the session row as
    `{ ...old, lifecycleGeneration: <new uuid>, creationAttempt: "independent-winner" }`, with every summary field
    byte-equal to old;
  - regrant with a new lifecycleIncarnation;
  - release;
  - assert the winner bytes are unchanged and that there are zero old approved facts.
- Must be RED under M120 and GREEN on WIP.

**ISS-121.**
- **Mutant M121:** delete the final `await owner.authorize();` (graph.ts:698) in readOutcome. It stays **GREEN 14/14**.
- **Why:** :1190 uses `action: "approve"` (status written), so `deps.authorize` at :696 re-checks and catches the erasure.
  The final owner.authorize is the only guard for `refused` and `escalated guard_only` outcomes (:694-696).
- **New row** in existing callback 1190: the same held-final windows with a refused outcome and a guard_only outcome
  (the existing fixture inputs), with authority erased and recreated between getState and return. Must refuse.
- Must be RED under M121 and GREEN on WIP.

**ISS-122.**
- **Mutant M122:** spread raw edges at erasure.ts:2051. **RED 2/14** (erasure "B15 export" and persistence
  "B23 cycle2: public concern edges...").
- The existing controls discriminate, so :1540 is regression-only, and no new ISS-122 control is required.

All mutants are applied only in a scratchpad copy (scratchpad `mutants.py`, sha BC5BACDA), RED and then restored. iso2
was verified restored (facts sha equal).

## 5. RED-before register (the maker shows each RED then GREEN, as command + counts)

| Mutant/row | RED on | Must be GREEN on |
|---|---|---|
| M31/M32 | post-fix minus one hunk | full fix |
| 116/119/127/58/120 | frozen bytes (R1) | full fix |
| M33/M39/AR-4 | frozen | fix |
| M34 | repinned test with L+1 | — |
| M37 | — | — |
| AR-1/M38/M38b | frozen | fix |
| ISS-120 row / M120 | M120 | WIP |
| ISS-121 row / M121 | M121 | WIP |
| M122 | already proven RED (R5) | — |

## 6. Order (amendment 3: erasure.ts first and serial)

- **P0:** section 2. It must reach a verdict on all 33 rows, and any rule (b/c) delta is re-reviewed before P1.
- **P1a, serial, erasure.ts only:**
  - H-001..H-010 and 3.9;
  - `pnpm -C packages/db typecheck`;
  - erasure.test.ts in full, plus AR-1/AR-4 and M38/M39;
  - freeze the erasure sha.
- **P1b, parallel, disjoint owners**, all consuming only the frozen erasure API:
  - facts.ts: H-025..041, then F1-F6, then the seal;
  - decisions.ts: H-016..024, then R1-R5, then R6 strict;
  - nodes.ts: H-011..015, then H-056, then N.
- **P1c, graph.ts:** H-042..055, then G1, G2, G3 + part2, G4, G5, G6, and H-111/112. It runs after P1a. It may overlap
  P1b because it imports no changed nodes/facts/decisions export. Coordinates are remapped per 3.1.
- **Supersession** (latest wins for the same anchor): H-089 over H-087/088; H-101..104 over R6 H-092..096; H-113 over
  test D H-100; H-056 over the bare nodes skip; part2 4182 withdraws the inner 1336 gate.
- **P2, tests after the source freeze:**
  - persistence:652 repin (3.4);
  - rows AR-1..AR-4, pregelTaskId, ISS-120/121;
  - L, S, D(H-113), summary (H-114/115), Part5a/b.
- **P3, one runtime lane:**
  - db and engine typecheck;
  - the 128 controls, under the post-run OOM check;
  - supplemental selectors (H-064 + section 5);
  - ISS controls;
  - expanded modules: facts, decisions, erasure, consent, db-init, persistence, checkpointer, per-fact, erasure-fence,
    rules-e2e, b18, crisis, api server, web session-api, evals score.
- **P4:** both blind checkers fresh (`.b/acceptance.test.ts`, primary `run-authority.mjs`), then release 6c and the
  browser flow.

## 7. Boundaries (replaces v1 section 7)

- No new file or module.
- New public API, exactly as listed in 3.8: two statics + one exported interface. Private: `#expiryConstructions`,
  `#expire`, and graph-private GraphCausalContext fields.
- No budget, deadline, name, time or signal exemption.
- All 128 controls and the protected adapter, persistence and O/W/E/BSON/ACK oracles stay byte-identical. The only
  exception is the one reachability predicate at persistence:652.
- The following remain UNPROVEN and are not waived: opaque external Promise ancestry; same-turn foreign mutation
  before the first observation; D076 parent-op receipt ownership; abort-before-fire (static order only).

## 8. Risks

- G-coordinate remap errors: mitigated by the manifest old→new map and the per-hunk RED/GREEN.
- 3.9 changes op semantics at the boundary: AR-4 and pregelTaskId cover it.
- P0 may move rows into PRODUCT, which would need another review.
- C: is at 17 GB: OOM risk, handled by the gate.

## 9. Refusal answers

| # | Refusal item | Answer |
|---|---|---|
| R1 | P-a | Answered by the 3.4 captured frames (the facade is frames[0]) and the exact predicate. |
| R2 | 3.3 | The issuing nodes are extract graph.ts:218 and summary :225. The signal is passed and was live. The root cause is 3.9. v1's config guard is withdrawn. |
| R3 | 3.8 | The API is listed exactly, section 7 is replaced, the order is erasure-first serial, and AR-1..3 are added. |
| R4 | ENV classification | The 33 rows are UNCLASSIFIED-PENDING-P0, with Q, the abort, the OOM check, the byte table and the decision rule (section 2). |
| R5 | ISS RED-before | M120 and M121 are proven blind (R5). The new rows must be RED under them. ISS-122 is regression-only, with M122 RED 2/14. |
| R6 | per-fact anchor | :1456-1461, with no repin (R3 PASS in isolation). |
| R7 | hunk list; small items | Literal hunk packet with H-ids, supersession and coordinate remap. pregelTaskId is decided. Each change has a RED-before mutant. The OOM check is added. |
