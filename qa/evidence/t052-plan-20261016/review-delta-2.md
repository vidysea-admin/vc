# T-052 cycle 2 plan review 2: line-number pins and the G5 op-wrapper deviation

Reviewer: fresh plan reviewer (D-030 route). I wrote neither plan-v2, hunks-v2, delta-c2 nor any earlier review. Date: 2026-10-25T11:39+05:30 (read from `date -Iseconds`).
Subject: brief qa/evidence/p2-briefs/t052-delta-review-2.md (sha ff0ae253...), branch wave/t052-c2 at ad60624 (partial P1, not checker-reviewed).
I edited no source or test file, ran no test in D:/vc or in the worktree, used no python, no live call, no Mongo. Nothing here claims a PASS.

What I executed (read-only):
- `sha256sum` of the four maker logs: pins-frozen-1 674dc82e, pins-p1a-1 b9074a89, pins-now-1 92581fdb, p1c-128c-1 d3b07dc5. All four prefixes MATCH the brief.
- `grep` of the TAP bodies for every `not ok`, error text and stack (pins-frozen/p1a/now, p1c-128/128b/128c, p0.log, p0-fails.txt).
- `git show 28bb3bc:<path>` reads of the six pinned source lines and the test files; `git diff 28bb3bc ad60624 --stat` and the facts.ts diff.
- Line and column comparison of graph.ts:255 (frozen) against graph.ts:344 (ad60624).
- A full scan of the 11 test files at 28bb3bc for hard-coded source line numbers (grep on `*.ts:NNN`, line arrays).
- Reads of the worktree graph.ts adapter (lines 498-585) and the H-043 receipt (graph.ts:875-885), scribe-checkpointer.test.ts:120-160, plan-v2 3.1/3.4/6, hunks-v2 H-043/H-117/H-118, review-approve-2 and review-delta-1, and D-082.

## Verdict
PLAN-APPROVE with binding conditions E1-E9 (section D). No HUMAN_GATE is needed (section E).
- Q1: option (a), a measured stack-captured repin, is the only workable policy. Option (b) is not feasible and not desirable.
- Q2: the maker's revert of the G5 "remember" step in the 8 adapter op-wrappers is accepted. D2 and the 3.2/G5 intent are met through the H-043 receipt, with a falsifier added (E6).
- The brief's pin inventory is incomplete. It under-counts what must be re-measured (section A3).

## A. Question 1: hard line-number pins

### A1. What the logs show (counts re-derived by me)
| run | file | tests | pass | fail | cancelled | which fail |
|---|---|---|---|---|---|---|
| frozen | pins-frozen-1.log | 12 | 10 | 2 | 0 | T046 private (5), D055 prompt rollback-rejects (12) |
| P1a only | pins-p1a-1.log | 12 | 7 | 5 | 0 | T046 private (5), D055 prompt rows 9-12 |
| current | pins-now-1.log | 12 | 4 | 6 | 2 | T046 private (5), T046 serialized (6), D055 ordinary (7,8: 8 s timeouts), D055 prompt (9-12) |

The brief says "6 fail and 2 cancelled". The TAP counts are fail 6 and cancelled 2, but the `not ok` list has 8 entries (5-12). The two "cancelled" are the two 8 s timeouts (7 and 8), which node reports as both. Treat it as 8 not-passing tests.

### A2. Classification of each extra failure (line shift, or real behaviour change)
- **T046 serialized (row 6): a pure line shift. PROVEN.**
  - Error message and class match the assertion (`ProviderAuthorizationRefusedError`, exact message). Only the `match(/graph\.ts:255:/)` line fails.
  - The stack top is `graph.ts:344:126`. I compared the text: frozen line 255 and current line 344 are the identical source line, with `new ProviderAuthorizationRefusedError` at column 126 in both. The shift is +89, which is the +87 base module plus 2 lines.
- **D055 prompt rows 9-11 (and 12 in P1a/current): selector gates that no longer match. Consistent with a line shift, NOT proven as only that.**
  - P1a only: the failure is `exactly one direct actual postcheck must inject confirmation ... 0 !== 1` (persistence:2695). The gate `directPostcheck` (persistence:2615-2618) requires `erasure.ts:676`, `erasure.ts:711` and `facts.ts:915`. P1a rewrote erasure.ts (312 lines), so 676/711 moved. Facts.ts is untouched at those lines in P1a.
  - Current: the failure is `actual node-catch guard not issued before original terminal` (persistence:2684), with every recorded event `stack:""`, `stackSampled:false`. That is the nodes.ts:1592 gate (persistence:2522/2619) never matching, because the P1b nodes.ts rewrite moved `isStudentFenced(` away from line 1592 (it is now at nodes.ts:1691).
  - The tests never reach their real assertions about behaviour. A gate that never opens proves nothing about product behaviour in either direction. These rows are therefore UNPROVEN, not exonerated.
- **D055 ordinary (rows 7, 8, 8 s timeouts): the same gate mechanism, shown as a hang.**
  - persistence:2522 uses the pin as the `target` selector. When it never matches, `heldGuard`/`hitGuard` never open and the test runs into its own `{ timeout: 8_000 }` (persistence:2503). The fail mode is `testTimeoutFailure`, and the assertion at :2529 is never evaluated.
  - So a stale gate pin shows up as a TIMEOUT. A timeout in these rows is not evidence of a behaviour change, and a green after repin is the only real evidence.
- **T046 private (row 5): FAILS ON FROZEN BYTES TOO, with an identical stack (per-fact:758, `error instanceof ProviderAuthorizationRefusedError` false).**
  - It is therefore not caused by any approved hunk, and the pin at :761 was never reached in any of the three runs. This test gives zero pin evidence so far.
  - D059 rows 1-4 pass in all three runs, which is consistent with H-D03 being line-neutral on facts.ts (pins facts.ts:2317/2082 untouched so far).
  - Row 12 also fails on "frozen" with a sentinel (`D055 actual rollback cleanup rejection sentinel`, persistence:2597). Same situation: a frozen-state failure cannot be attributed to a hunk.
  - **Caveat on the "frozen" run itself.** The copy `fz` currently holds the P1a erasure.ts (sha e1efe6f1...), and the maker's notes show a `fz-erasure-p1a.bak` swap at 11:31 before the 11:33 frozen run. I could not verify from the log which erasure.ts was loaded. The other seven files I hashed in `fz` equal 28bb3bc exactly. This must be re-established (E1).
- **No evidence that any of the extra fails is a product behaviour change, and no evidence that none is.** For the 3 of the 8 rows that reach a real assertion with a decisive message (row 6), the cause is a shift. For the other 5 (rows 7-11/12), the gate hides the behaviour. The plan cannot assert "no behaviour change" until those rows run green with their assertions unmodified.

### A3. The pin inventory is larger than the brief states (my scan of 28bb3bc)
Each pin has a different failure mode, which decides how a stale pin shows up and how it must be proven.

| pin site | pins | kind | stale-pin symptom |
|---|---|---|---|
| per-fact:761, :891 | graph.ts:255 | assertion (`assert.match(stack)`) | AssertionError |
| per-fact:1289 | facts.ts:2317 | GATE (`if (!match) return savedSessionFind`) | injection silently skipped, then a later assertion or hang |
| per-fact:1298 | facts.ts:2317 | assertion | AssertionError |
| per-fact:1376 | facts.ts:2082 | assertion | AssertionError |
| facts.test:1882 | facts.ts:2082 / 2091 | assertion | AssertionError |
| facts.test:3068, decisions.test:578 | facts.ts:1255 | assertion | AssertionError |
| persistence:2522, :2616-2618, :2619 | nodes.ts:1592; erasure.ts:676, 711; facts.ts:915 | GATES (selectors) | 8 s timeout or `0 !== 1` |
| persistence:2529, :2627 | nodes.ts:1592 | assertion | AssertionError |
| persistence:652 | tenant frame chain | already covered by plan-v2 3.4 | n/a |
| persistence:870, :877-878, :896, :905-906 | facts.ts line arrays (9 and 23 entries); erasure.ts:601/615 | **DIAGNOSTIC ONLY.** `caller` and `origin` feed `producerEvents` and `context.diagnostic` (:958, :976) and are asserted nowhere | none. Repinning them is optional |

Findings from the scan:
- The brief lists "persistence:906 pins erasure.ts:601/615". That is diagnostic output only. It must NOT be counted as a protected-assertion repin and need not be edited.
- The facts.ts pins (915, 1255, 2082, 2091, 2317) have NOT moved yet in the measured runs. The pin runs contain only H-D03 on facts.ts. P1b has not applied H-025..041 (17 multi-line hunks) or F1-F6, so the facts.ts pins WILL shift when it does. The measured counts (2/5/6) therefore under-state the final repin set. The db-side pins (facts.test:1882/3068, decisions.test:578) were not in the 12-test selection at all, so they are unmeasured.
- The 128 controls contain none of the T046/D055 pin-bearing tests (grep of p0.log and p1c-128c-1.log for T046/D055 returns nothing). The pin tests are only exercised in the expanded P3 modules. A green 128 therefore says nothing about pin state.

### A4. Decision: option (a), with conditions
**Option (a), a measured repin, is approved. Option (b), line-neutral hunks, is rejected as a policy.** Reasons:
1. **It cannot be done.** The approved hunk text is large and not line-neutral by construction: graph.ts changes 1657 lines at ad60624 (+87-line base module, G1-G6 inserts), nodes.ts 325, erasure.ts 312 (already committed and hash-frozen at P1a, so (b) would mean un-freezing it), facts.ts has 17 multi-line consumer hunks plus F1-F6 still to land. Squeezing all of that onto the existing line coordinates is impossible without rewriting the approved hunks.
2. **It is a bad trade even where possible.** H-D03 shows the cost: two declarations were packed onto the `deadlineMs?: number;` line to keep numbers still. That bends product layout to the incidental coordinates of a test, and it helps nothing durable, since the P1b facts.ts hunks move those lines anyway.
3. **The pins are frame identity selectors.** Their intent is "this exact production frame", and plan-v2 3.4 already approved the same policy for persistence:652 (review-approve-2 A1, W4). (a) keeps the selector exact (a stricter selector, not a weaker one) when the repin is proven by capture, so no oracle is weakened under D-082. D-082's 28-file inventory expressly includes "their existing tests/fixtures".
4. **(a) fits "no oracle weakening" only if** each pin moves to the new line of the SAME frame, proven by a stack capture on the final bytes, and no assertion text, threshold or budget changes. Conditions E2-E4 enforce that.

**H-D03 line-neutral form: ACCEPTED as it stands, not required.**
- Semantics match review-delta-1 D5 exactly. I diffed it: two optional fields `deadlineExpiresAt?: number` (facts.ts:346 and :1715) and two reads `new WriterDeadline(options.deadlineMs, options.deadlineExpiresAt)` at the two approved sites. An absent option is byte-identical in behaviour.
- Do not extend the technique, do not reformat it later, and do not cite it as the pin policy. Once P1b lands the facts.ts lines move regardless. The final pin values are measured after P1b, so H-D03's layout is irrelevant to correctness.

## B. Question 2: the G5 op-wrapper deviation

### B1. What changed
Plan-v2 3.1/G5 and H-117 say: "Existing deadline.op catch(error) wrappers first remember using SAME existing receipt context, then original receipt callback/throw." The maker reverted that insert in the 8 adapter op-wrappers, so the catch is again `catch (error) { owner.onExpectedExpiry(error); throw error; }`. Verified at the worktree: graph.ts lines 508, 517, 525, 526 (put) and 561, 570, 578, 579 (putWrites), 8 sites, all in the original form. The other 19 sites of the form `rememberGraphCausal(owner, error); owner.onExpectedExpiry(error)` are intact.

### B2. Why the revert is forced
The protected oracle scribe-checkpointer.test.ts:155 holds `const call = "collection.findOne(logical, (() => { try { return owner.deadline.op(); } catch (error) { owner.onExpectedExpiry(error); throw error; } })())"` and asserts `indexOf(call)` finds exactly the primary and the recheck, and no third (:156-158). It also derives `primaryLine`/`selectedLine` from that text for the frame regexes (:159). Changing the wrapper text without editing that test turns the 8 D068 adapter start/resume rows red for a reason unrelated to behaviour. Editing it would be a protected-test change with no benefit. The maker's reasoning is correct on this point.

### B3. Why the intent is still met (verified from source)
- The adapter wrapper's `owner` is the underLease owner built at graph.ts:884-892. Its `onExpectedExpiry` IS `created.onExpectedExpiry` (graph.ts:891), and its four causal fields (`causalHistory`, `observedOriginals`, `observerFailures`, `detachedCausalRoots`) are the SAME objects as `created`'s (graph.ts:892).
- `created.onExpectedExpiry` is the H-043 receipt (graph.ts:875-883). Its first statement in the try is `rememberGraphCausal(created, error)`. So the adapter catch still performs the first-ingress capture, one call later in the same synchronous catch, on the same context, before the `throw`.
- Between the two calls there is no await and no other statement, so the ordering "remember first, then throw" is preserved. The only owner constructor reachable by the adapter is that one (`checkpointInvocation.run` appears once, at :1239, over this `owner`). The createdCall and invocationCreated receipts (graph.ts:1387, 2659) follow the same H-043 shape.
- `observeGraphOriginal(owner, existingReading)` after each call (graph.ts:509 etc.) remains and records the native rejection of the original read.
- Outcome evidence: p1c-128c-1.log shows rows 34-41 (the 8 start adapter rows) `ok`. Rows 43, 45, 47, 49 (resume reject) are still `not ok`, as are 42/44/46/48 passing; those belong to the post-P1c queue, not to this deviation.
- Review-delta-1 D2 required: after P1c rows 34-41 go GREEN, and M40 on the full tree turns them RED at :308 (4 !== 2). Row GREEN is shown at 109/128. **The M40 run on the full tree is not in the logs I was given.** It remains owed (E6).

### B4. Residual differences (why E6 is binding)
- A fault inside the receipt (it catches and records into `observerFailures`) is now the only capture path for these 8 sites. This is the same fault channel G5 would have used, but it is no longer double-covered.
- If a future change alters the receipt body (for example drops the first `rememberGraphCausal`), the 8 adapter sites silently lose first-ingress capture while `grep` for G5 still looks complete. A mutant on the receipt, not on the wrapper, is the right falsifier.

**Ruling:** the deviation is ACCEPTED. D2 and the plan-v2 3.2/G5 intent are met for rows 34-41 by the receipt, subject to E5 and E6. It is recorded as an approved deviation from H-117's last bullet, for the 8 sites only. No other G5 site may be reverted without a new review.

## C. Other findings

1. **Rows 5, 6, 7 are a regression against P0 that nobody has attributed.** `D068 recordRejectReasons actual direct-op receipt: ... observer S preserves own primary aggregate` passed in p0.log (lines 28, 34, 40) and fails in all three P1c runs (p1c-128, 128b, 128c) with `assert.ok(primary instanceof AggregateError)` at decisions.test.ts:740. decisions.ts is untouched so far (P1b decisions H-016..024 and R1-R5 are still pending), while erasure.ts changed in P1a. So an unchanged consumer now behaves differently against the new `WriterDeadline`. It may be an expected intermediate state that R1-R5 fix, or it may be a P1a API-compat defect. It is not covered by any listed outcome. It must be attributed before the P1b freeze (E7).
2. **The "128 = 109/128" figure is a moving figure on a partial tree.** The 19 fails are: 5-7 (item 1), 43/45/47/49 (resume adapter rejects), 64-66 (N-b), 104-109 (persistence:652 repin, P2), 119, 120, 127. That is a P1c WIP state, not an acceptance figure.
3. **Evidence hygiene.** The four logs were taken in the throwaway copy `fz` and in the worktree under the testlock. Two things to keep apart: the 128 run (worktree) and the pin runs (`fz` copy, with `T046 ... pins` selected by name). The pin runs include the frozen-state caveat of section A2.

## D. Binding conditions
E1. **Baseline first.** Before any repin, re-run the 12 pin tests (and the db-side pin tests: facts.test 1882/3068, decisions.test 578, and per-fact 1289/1298/1376) on genuinely frozen bytes, with the sha256 of every file in the copy recorded in the log header. Run T046 private (row 5) and D055 rollback-rejects (row 12) each in isolation and in the 12-test selection. Classify their frozen-state failure (order/selection dependence, ENVIRONMENTAL, or pre-existing) with a cause before relying on them. A test that fails on frozen bytes for an unexplained reason cannot serve as repin proof.
E2. **Repin once, at the end, on final bytes.** Repin only after P1b and P1c are source-frozen (facts.ts, decisions.ts, nodes.ts, graph.ts all final). A repin taken now would be invalidated by the facts.ts hunks still to land. The persistence:652 L value is re-measured in the same pass (C6 of review-approve-2).
E3. **Method per pin.** Each new line is obtained by a stack capture on the final bytes, never by adding the diff offset. For each pin record: test file:line, old value, new value, the captured frame text (function name and `file:line:col`), and the source line text at old (28bb3bc) and new (final) positions. The frame must be the same function and the same statement as before. Where the same statement now appears at several lines, pick the one the capture shows. A pin whose source statement was deleted or changed in kind (not just moved) is NOT a repin: it comes back to a fresh plan review.
E4. **What may change in the tests.** Only the numeric line literal inside the regexes or arrays listed in A3 (and the 3.4 predicate already approved). Verify with a machine check: `git diff -U0` of each protected test with every `\.ts:\d+` normalised to `\.ts:N` yields an empty diff apart from the persistence:652 hunk. No assertion text, message, threshold, timeout (8 s, 30/200 ms, 5/8 s), budget or gate structure changes. Pins that did not move stay untouched. The diagnostic-only arrays (persistence:870/896, op615/timer601) are left as they are or updated in the same machine-checked way; they are not counted as protected-assertion repins.
E5. **Selectivity.** For each pin family, a mutant that shifts one source line by +1 (or repins to L+1) must turn the corresponding test RED: assertion-type pins as a failed `match`, gate-type pins as the timeout or the `0 !== 1` outcome, with that mode named in the manifest. This proves the repin kept a selective gate and did not open it. Include the five families: graph.ts:255 (per-fact 761/891), facts.ts 2082/2091/1255/2317/915, nodes.ts:1592, erasure.ts:676/711, persistence:652 (M34).
E6. **Deviation falsifier.** Add a mutant M42: delete `rememberGraphCausal(created, error);` from the H-043 receipt at graph.ts:877 (and the matching createdCall/invocationCreated receipts at 1387 and 2659, one at a time). Rows 34-41 and the resume adapter rows must go RED. Also run M40 on the full post-P1 tree (review-delta-1 D2): removing `durability: "sync"` turns rows 34-41 RED at :308 (4 !== 2). Record both. If M42 does not turn the adapter rows red, the deviation did not preserve the capture and the 8 wrapper inserts come back to review (with an edit to scribe-checkpointer.test.ts:155 as the alternative, which would need Approver sign-off as a protected-test change).
E7. **Rows 5-7.** Before the P1b freeze, attribute rows 5, 6, 7 (decisions.test.ts:702/740): run them on ab20f7e only, then on the P1b decisions tree. They must be GREEN at the P1b freeze with the oracle unchanged. If they stay red after decisions.ts H-016..024 and R1-R5, it is a product regression in the P1a erasure API and returns to a fresh plan review.
E8. **After repin, everything must be green with no assertion edits.** All of: the 12 pin tests, the db-side pin tests, per-fact 1289/1298/1376, the D055 ordinary rows 7-8 (no timeouts), D055 prompt rows 9-12. Any red that remains after an exact repin is PRODUCT and returns to review. A timeout is never reported as ENVIRONMENTAL without the Q gate and an OOM marker check.
E9. **Freeze list and register.** The repin set is a P2 item and joins the protected-oracle ledger in the manifest (old/new lines, capture text, E4 machine-check output). The mutant register gains M42 and the E5 pin-shift mutants. D9 of review-delta-1 still applies: any further outcome that adds a product hunk or leaves the listed hunk set needs a fresh review. The G5 deviation is recorded as an approved deviation from H-117 for the 8 adapter wrapper sites only.

## E. HUMAN_GATE
None. The line repin stays inside D-082 (the 28-file inventory includes the existing tests and fixtures, and the repin weakens no assertion). Carry-over from review-delta-1 D10: if the coordinator reads D-082's "no oracle weakening" as barring any protected-test edit at all, then persistence:652, H-D05 and this repin set all go to Umesh before P2. Option (b) cannot avoid that question, so it does not change the gate.

## F. Warnings (not blocking)
W1. The repin is brittle by design (review-approve-2 W4). Any later edit of graph.ts, facts.ts, nodes.ts or erasure.ts repeats this exercise. The 28-file freeze limits the exposure for this cycle only.
W2. Gate-type pins fail by timeout. A reviewer reading a timeout as "slow machine" would hide a stale gate. E5 and E8 exist for that reason.
W3. The brief's measured counts (2/5/6+2) are a lower bound for the final repin set because facts.ts and decisions.ts hunks have not landed. Do not size the P2 effort from those counts.
W4. All logs reviewed are single-copy runs and WIP evidence, not acceptance evidence.

PLAN-APPROVE

Binding conditions: E1 (frozen baseline with file hashes; explain the two frozen-state failures), E2 (repin once, on final bytes), E3 (stack-capture method, same frame and statement), E4 (numeric-only diff, machine checked), E5 (shift mutants per pin family, with the failure mode named), E6 (M42 receipt mutant plus M40 on the full tree), E7 (attribute rows 5-7 before the P1b freeze), E8 (all green with no assertion edits, else product re-review), E9 (ledger, register, recorded deviation).
