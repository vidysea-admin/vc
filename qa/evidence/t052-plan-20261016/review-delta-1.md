# T-052 cycle 2 delta-c2: fresh plan review (condition C4 of review-approve-2.md)

Reviewer: t052-delta-reviewer (fresh; wrote neither plan-v2, hunks-v2, delta-c2 nor the earlier reviews). Date: 2026-10-25T10:49+05:30 (read from `date -Iseconds`).
Subject: qa/evidence/t052-plan-20261016/delta-c2.md (commit a67b109).
Edited no source or test file, ran no test in D:/vc or the worktree, no python, no live call, no Mongo.
What I executed (read-only): `sha256sum -c` on qa/evidence/t052-c2-p0/SHA256SUMS (all OK); `git show 28bb3bc:<path>` reads; LangGraph 1.4.17 source reads; grep/parse of the maker's probe logs; sha256 and line-ending comparisons for the pins.

## Verdict
PLAN-APPROVE with binding conditions D1-D10 (section C). No HUMAN_GATE is needed (section B2). Nothing here claims a PASS.

## A. Findings per check

### 1. H-D01 (`durability: "sync"`, graph.ts:656): real fix for the symptom; correctness of the mechanism VERIFIED
- Mechanism, verified in node_modules/.pnpm/@langchain+langgraph@1.4.17_cc76aed6.../dist/pregel:
  - index.js:892 `config.durability ?? ... ?? "async"`.
  - loop.js:392 only tracks `checkpointer.putWrites(...)`.
  - loop.js:477-478 `_putCheckpoint` then `if (this.durability === "sync") await this._awaitCheckpointerPromises()`. The wait exists only for sync.
  - So under the default, the held `adapter.put` (graph.ts:409) / `adapter.putWrites` (graph.ts:460) does not block the next superstep.
  - Correction accepted: the wrapper is in graph.ts, not checkpointer.ts. I read graph.ts:395-508 at 28bb3bc; checkpointer.ts is only the MongoDBSaver factory.
- Numbers, verified against the committed P0 evidence and the maker's probe logs:
  - P0 fails are exactly 29 (`grep "^not ok" p0.log`): 34-49, 64, 65, 104-109, 116, 119, 120, 127, 128. The 8 start rows fail at scribe-checkpointer:308.
  - Capture (p0cap.log): 8 `fact-extraction n=2` and 8 `session-summary n=3` calls, `deadlineAborted:false`, `msPastExpiry` -130..-156 (before expiry). This confirms the late calls were dispatched BEFORE any expiry, so 3.9 could not close them. C4 is correctly triggered.
  - X1 (m40fix.log, sha 4163869a matches): the copy differs from 28bb3bc by exactly the one line (diff checked). 128 tests / 99 pass / 29 fail. All 32 DIAG-PROV records have n in {0,1}, so 0 post-hold calls. Start rows now fail later (:311 and :328 in the +2 copy = :309 and :326).
  - Do not misread: in X1 the `deadlineAborted:true msPastExpiry 29..33` DIAG-PROV lines belong to the NEXT row's pre-hold calls (stale `selectedDeadline`). They are not late calls.
- Does M40 falsify it? M40 shows necessity within the hunk set. It does not show sufficiency, because the rows stay RED after H-D01 until 3.1/G-hunks land. See D2.
- Why this is not oracle gaming: the protected oracle takes `providerAtHold` at the hold (100-160 ms before expiry) and requires no further provider call. Under async durability the graph legitimately kept running between hold and expiry. The oracle therefore demands "no node starts while a checkpoint write is outstanding". Sync durability provides exactly that. D-082 forbids weakening the oracle, so the product must meet it.
- Side effects, assessed from source:
  - `index.js:1118` (finally) already awaits all checkpointer promises in both modes, so final settlement is unchanged. Sync only adds an inter-superstep barrier.
  - All four invokes (graph.ts:1334, 2385, 2547, 2550) use `runnableConfig`, so every path gets the barrier. LangGraph throws only if `durability` and `checkpointDuring` are both set. `checkpointDuring` is not set anywhere (grep).
  - Types: `durability?: Durability` exists in the 1.4.17 `PregelOptions` (types.d.ts:222). X1 ran under tsx without a typecheck, so D3 requires one.
  - Latency: one extra await per superstep. Real, small, unmeasured.
  - Crisis and erasure paths: the next superstep (including a crisis/escalation node) now waits for the previous checkpoint write. Before, they overlapped. A hung checkpoint store therefore delays the next node up to the writer deadline. A failed write now stops the run before the next node's side effects, which is safer. This is a student-safety-adjacent behaviour change, flagged in W2.
- Start-row outcome is NOT proven closed. The delta says "fail later the same way the resume rows already do". That is only partly true:
  - Start resolve rows fail with the graph.ts:1035 envelope ("original settlement and owned compensation failed").
  - Resume rows fail at graph.ts:1674.
  - Start reject rows fail at :326 (`leaves.size` 2 !== 1). Resume reject rows fail at :314 (message mismatch).
  - plan-v2 3.2 (G5 owner catches :1015/1026/1034) is the hunk set that reaches the :1035 envelope. So closure for rows 34-41 depends on 3.1 AND 3.2/G5, and it is unproven (D2).

### 2. H-D02..H-D04: within D-082 as additive optional parameters. No HUMAN_GATE.
- Scope test against D-082: the 28 existing files only, no new module, no oracle weakening, no push or deploy.
  - H-D02 (erasure.ts), H-D03 (facts.ts), H-D04 (nodes.ts) are all in the inventory.
  - All three are optional additions with unchanged defaults.
  - plan-v2 already approved new public surface of the same kind (WriterCausalFrame, expiryConstruction, inspectCausal). packages/db/src/index.ts re-exports both modules, so the surface is package-visible but purely additive. No external caller breaks: `git grep "new WriterDeadline("` shows every other caller keeps the one-argument form.
- Root cause verified: nodes.ts:1459-1462 `boundedDeadlineMs` = E - Date.now() (one read); facts.ts:412 and :1786 `new WriterDeadline(ms)` reads the clock again. Drift +1 ms is real. X2 logs (nb3-1/2/3, sha prefixes fce88f1e/6eb6764e/0fe1c9ea match) show `excessMs` 0/1 and `childMinusE` 0/1 varying by run, and rows 14-16 (= TAP 64-66) failing 3/3, 1/3, 2/3.
- Smaller alternative considered: none removes a second clock read without an absolute input.
  - Passing only the absolute E would need a constructor or factory change anyway. The cap form is the minimum.
  - Biasing the relative budget by -1 ms is not a fix.
- Gap found (D4):
  - If the cap is NaN or infinite, `Math.min(now + ms, NaN)` is NaN. Then `expired()` is never true and `op()` returns `{timeoutMS: NaN}`. That is fail-open.
  - The delta's constructor sketch has no cap validation.
- Fifth site (D5): nodes.ts:1493 also builds `new WriterDeadline(boundedDeadlineMs(E))`. Its own timer and expiresAt can sit at E+drift while `expiresAt` (nodes.ts:1494) correctly keeps E. Passing the same cap is consistent and uses the same approved surface.
- Out of scope, not blocking: packages/engine/src/guards/escalation.ts:211 uses the same relative-from-absolute pattern, outside the inventory.

### 3. H-D05 (protected fixture change): acceptable only in the bracketed form below
- Exact assertion before (scribe-per-fact.test.ts at 28bb3bc, lines 1234-1237):
  - `assert.ok(Number.isFinite(secondReadBudget) && secondReadBudget! > 0 && secondReadBudget! <= 30);`
  - `secondReadExpiresAt = Date.now() + secondReadBudget!;`
  - `assert.ok(secondReadExpiresAt <= deadlineExpiresAt, "actual child read remaining budget belongs to the one original30ms invocation");`
- Why the oracle is inherently racy: with a product child expiry exactly E, any tick between `op()` and the hook gives `t2 + timeoutMS > E`. No product change alone can satisfy it. A fixture change is therefore needed, and the intent (child ends no later than E) is preservable.
- Defect in the delta's version: `assert.equal(args[1].timeoutMS, receipt.expiresAt - receipt.at)` compares a budget computed at the clock read inside `op()` (t1) with `at: Date.now()` read in the wrapper (t1'). That is the same two-read race and it flakes. If `at` is instead derived as `expiresAt - result.timeoutMS`, the assertion is a tautology. Neither is acceptable.
- Mechanics verified: facts.ts:655 passes the exact `deadline.op()` object (`activeReadBudget`), and tenant.ts:308-309 forwards `options` by identity, so a WeakMap keyed on that object works.
- Approved form (D6): the wrapper records `before = Date.now()` prior to calling the original `op` and `after = Date.now()` after it returns, plus `receiver.expiresAt`. Then assert:
  - `receipt` exists (reachability).
  - `receipt.expiresAt - after <= timeoutMS <= receipt.expiresAt - before`. This is deterministic, since `timeoutMS = expiresAt - t1` with `before <= t1 <= after`, and non-vacuous.
  - `receipt.expiresAt <= deadlineExpiresAt`, keeping the original message text.
  - The finite/positive/<=30 assertion at :1234 stays unchanged.
- Not a weakening: the intent assertion is kept with its message. The deadline-object end is checked exactly against E. A bracketed budget check is added. What goes is only the incidental t2 == t1 requirement.

### 4. Row 128: covered by H-005 / 3.8; evidence VERIFIED, with one caveat
- Mechanism: erasure.ts:599-602 aborts with no reason; LangGraph surfaces `signal.reason` (a DOMException) decorated with `pregelTaskId`. H-005 (`controller.abort(expired); fire(expired)`) supplies the FWD reason.
- Evidence: r128fix-1..5 each show test 1 (= TAP 127) `not ok` and test 2 (= TAP 128) `ok`. r128base-1..5 show both `not ok`. This is 128 GREEN 5/5 with the fix and RED 5/5 on frozen bytes. The `produced instanceof FencedWriterDeadlineError` assertion (:933) lives in 128's `rejectPostcheck` branch.
- Caveat: X3 used a "minimal reason-carrying abort", not the literal H-005 plus 3.9 text. D7 requires re-proof on the real hunk. The earlier "guard GREEN" label is correctly retracted; the old R1 GREEN was a load artefact.

### 5. The six re-pins and the LF pin policy: approved, with a content-equivalence caveat
- All six new pins equal `git show 28bb3bc:<path> | sha256sum` byte for byte (checked all 64 hex digits for each). The repo blobs are LF, so "LF-normalised" equals the blob.
- The old D072/D073 pins cannot be tied to any commit or file:
  - Their `gitBlobRawNoFilters` ids are absent from the object store.
  - They match no simple CRLF/LF/one-line-mix variant of the 28bb3bc blob.
  - The planner copies iso/iso2 do not contain these six.
  - A hash scan of the Codex worktrees (read-only; 24 candidate files at the six paths, raw, LF and CRLF forms) found no hit.
  - So whether the six differ in CONTENT, and not only in line endings, from what the Oct-16 reviews saw is not provable.
- Mitigations I did verify:
  - None of the six is named in plan-v2 or hunks-v2 (zero hunks; plan-v2 mentions checkpointer.ts only as context).
  - The WIP snapshot's total change to the six against its parent is small: 344 insertions / 12 deletions, of which apps/api/tests/server.test.ts is +289.
  - The 22 other inventory files are LF-content-equal to the planner copies (iso/iso2) at 28bb3bc. That includes the three test files the earlier review flagged as differing pins (scribe-checkpointer, scribe-per-fact, scribe-persistence): line endings only.
- review-approve-2 listed checkpointer.ts as "SAME" against the live file at that time. I cannot reconcile that with the current blob. This is a documentation gap, not a plan defect, since checkpointer.ts stays unedited (D8).
- Recording all 28 future pins in LF form is sound: it removes the autocrlf dependence that caused this.

### 6. Freeze list and expected outcomes: complete, with additions
- Every one of the 29 P0 fails is accounted for in delta §6: adapter start 8, resume 8, N-b 2, P-a 6, and 116/119/120/127/128. No row stays unexplained. The 99 passing controls stay guards.
- Row 58 correctly drops to "regression guard" (it passes in P0, so the plan-v2 RED-before claim is withdrawn).
- Additions required: D9.

## B. Judgements asked for
1. H-D01 is a real root-cause fix for the late-provider-call symptom (mechanism verified in source, 0 post-hold calls in X1). It is not shown to close rows 34-41 end to end.
2. H-D02..H-D04: approved under D-082 as additive optional surface. No HUMAN_GATE line. H-D05: approved in bracketed form (D6) as a non-weakening protected fixture change.
3. Binding C1-C6 of review-approve-2 stay in force. This approval discharges C4 for H-D01 only.

## C. Binding conditions
D1. Evidence preservation. The X1-X4 logs (m40fix, nb3-1/2/3, r128fix-1..5, r128base-1..5) currently live only in a session temp scratchpad. Copy them under qa/evidence/t052-c2-p0/ with SHA256SUMS before P1a starts. Cite the committed path in the manifest.
D2. Start rows 34-41. After P1c, they must go GREEN. If they stay RED after G1-G6 including 3.2/G5 (:1015/1026/1034 owner catches), stop and return to a fresh plan review; do not edit the oracle. M40 must be run on the full post-P1 tree and must turn the 8 start rows RED at :308 (4 !== 2). If it does not, H-D01 is not load-bearing and comes back to review.
D3. H-D01 lands as the literal one-line text in graph.ts:656 (same line, no coordinate shift, C6 re-measure still applies). Run the db and engine typechecks at the P1c freeze. P3 runs the full affected modules, with erasure-fence, rules-e2e, persistence, crisis-escalation, b18-suppression and the api server tests named. Record wall time against the P0 run. A regression is a PRODUCT re-review, never an oracle edit.
D4. H-D02 constructor:
  - Keep the existing `(0, FENCED_WRITER_DEADLINE_MS]` guard first and unchanged.
  - Reject a non-finite cap with RangeError. A cap that is `undefined` behaves exactly as today.
  - The cap can only shorten: `expiresAt = min(now + ms, cap)` from ONE `Date.now()` read. The timer is armed with `Math.max(0, expiresAt - now)`.
  - AR-5 adds: NaN and Infinity throw; a cap at or below now yields an immediately expired deadline (`op()` throws, `expired()` true); a cap above now + ms changes nothing; the cap row fails on frozen bytes (Reflect.construct, cap ignored).
D5. Apply the same cap at nodes.ts:1493 (`new WriterDeadline(boundedDeadlineMs(E), E)`), or record a one-line reason in the manifest for not doing so. Either choice stays inside this approval. H-D03 reads `options.deadlineExpiresAt` at facts.ts:412 and :1786 only. H-D04 passes `expiresAt` (nodes.ts:1494) at :1525 and :1537 only. Absent option, behaviour is byte-identical to today.
D6. H-D05 in the bracketed form of section A3, verbatim:
  - `before`/`after` clock reads around the original `op`.
  - Restore the prototype wrap in `finally`.
  - No tolerance constant anywhere.
  - Budgets 30/200 ms and 5/8 s unchanged.
  - Record the exact before/after lines in the manifest's protected-oracle ledger.
  - M41 (drop the cap and add 1 ms in facts.ts:412) must be RED 10/10 at the receipt assertion.
  - M41b (revert to the original two-clock form) must show a non-zero fail count over 10 runs.
  - Rows 64/65/66 must be GREEN 10/10 on the final bytes.
D7. Row 128: re-prove on the literal H-005 plus 3.9 text at the P1a freeze: 128 GREEN on 5 consecutive isolated runs, and M38 turns 128 RED. 127 is recorded as RED until P1c.
D8. Re-pins: approve the six new LF pins. The manifest records them as a re-baseline at 28bb3bc with the statement "content equivalence to the 2026-10-14 bytes is unrecoverable". The checker reads the 58-line checkpointer.ts once in P4. checkpointer.ts stays unedited (the delta's correction is accepted). All 28 pins are recorded as the LF hash plus the git blob id.
D9. Freeze list additions: H-D02 under P1a freeze evidence (db typecheck, erasure.test.ts in full, AR-1, AR-4, AR-5, M38 incl. 128, M39, 128 GREEN); H-D01 in P1c with the typecheck; H-D03/H-D04 in P1b; H-D05 in P2. The mutant register gains M40, M41, M41b. Q must hold again for P3 (two attempts today: attempt 1 failed, attempt 2 held). Any further P0 or P1 outcome that adds a product hunk or leaves the listed hunk set needs another fresh review.
D10. HUMAN_GATE: none required by this approval. If the coordinator reads D-082's "no oracle weakening" as barring any protected-fixture edit at all, H-D05 (and persistence:652 before it) must go to Umesh before P2. I judge the bracketed H-D05 does not weaken any assertion.

## D. Warnings (not blocking)
W1. The unchanged oracle (`provider.calls.length === providerAtHold` measured 100-160 ms before expiry) is stricter than the literal B23.3 text. It is protected and D-082 bars weakening it, so sync durability is the way to satisfy it. Raise it with Umesh only if sync costs real latency in P3.
W2. Sync durability adds a barrier before crisis or escalation nodes. A slow or hung checkpoint store delays them up to the writer deadline. Check the P3 crisis-escalation timing.
W3. The LangGraph semantics (index.js:892, loop.js:478, index.js:1118) are specific to 1.4.17. A version bump needs this check repeated.
W4. X1-X4 are single-copy tsx runs, not typechecked and not under the final tree. They support the plan; they are not acceptance evidence.
W5. N-b rows are time-sensitive. Under a heavy machine the 10x stability gate may still flake for reasons unrelated to the product. Use the Q gate before judging a failure.

PLAN-APPROVE

Binding conditions: D1 (preserve X1-X4 logs in qa/evidence), D2 (rows 34-41 must reach GREEN after P1c or return to review; M40 on the full tree), D3 (H-D01 literal one-liner, typecheck, full affected modules, latency record), D4 (H-D02 finite-cap guard and AR-5 rows), D5 (cap at nodes.ts:1493 or recorded reason; exact H-D03/H-D04 sites), D6 (H-D05 bracketed form, M41/M41b, 10/10), D7 (row 128 re-proof on literal H-005), D8 (six LF re-pins, content-equivalence recorded as unrecoverable), D9 (freeze list and mutant register additions, Q gate again), D10 (no HUMAN_GATE; escalate H-D05 only if D-082 is read as barring all fixture edits).
