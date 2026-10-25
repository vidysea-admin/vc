# T-052 cycle 2 plan review 3: one combined ruling on every remaining RED

Reviewer: fresh plan reviewer (D-030 route). I wrote neither plan-v2, hunks-v2, delta-c2, attrib-c2 nor any earlier review.
Date: 2026-10-25T12:26+05:30 (read from `date -Iseconds`).
Subject: brief qa/evidence/p2-briefs/t052-delta-review-3.md (sha 01cec76a...), branch wave/t052-c2 at ad60624, attribution commit bfcb317.
I edited no source or test file, ran no test in D:/vc or in the worktree, used no python, no live call, no Mongo. I did not re-run any test. Every
"green" or "red" below is read from the maker's logs, and I say so where a statement is my own reading of the code and not a measurement.

What I executed (read-only):
- `sha256sum -c SHA256SUMS` in qa/evidence/t052-c2-p0/attrib/: 52 lines, 52 OK, 0 failed.
- Tallies read from the logs: o1-base-128-1 108/128 (20 fail), o1-opt1a-128-1 109/128, o1-opt1b-128-1 113/128 (15 fail), fr-pins-1 10/12, g5o-adp-1 12/16,
  o1-base-ar-1 1/1, o1-opt1a-ar-1 0/1 and o1-opt1b-ar-1 0/1. All match attrib-c2.md. The RED name lists of the three 128 logs match the table.
- `git show wave/t052-c2:` reads of erasure.ts (WriterDeadline, 850-935), decisions.ts (105-350), graph.ts (collectors at 1085-1135, 2120-2165, 3150-3200),
  decisions.test.ts (690-760, rows 5-7), erasure.test.ts (AR-1/AR-4, 2205-2275) and scribe-checkpointer.test.ts (285-312); `git show 28bb3bc:` reads of
  scribe-per-fact.test.ts (700-775) and scribe-persistence.test.ts (2575-2605); `git show 36bae79:` greps of the same two test files.
- The DIAGX and rep/opt1/repin/fr scripts and outputs, and the scratchpad `fr`/`fz` link layout (node_modules and @vc/* links resolve inside the copy).
- plan-v2 sections 3, 3.1, 3.8, 3.9, review-delta-1 D1-D10 and review-delta-2 E1-E9.

## Verdict
PLAN-APPROVE with binding conditions F1-F12 (section F). No HUMAN_GATE is needed now (section G).
- Class (ii): refuse option 1a, option 1b and option 2. Approve a third design, "abort early, fire on the timer" (3a, section B). It keeps AR-4's
  aborted assertion and M39, and it needs no protected-oracle edit. It changes two assertions of AR-4, which is a row this cycle's plan added (it is RED on
  frozen because it did not exist), not an oracle. It is approved only on a copy-only probe (F3). If that probe fails, the plan returns to review.
- Class (iii): the attribution is right that these rows are not caused by 3.9 or by the G5 deviation, but it names a mechanism, not a root cause. 43/45/47/49
  are not yet proven to be class (iii) at all (the probe in F5 can move them to class (i)). E8 is restated (F6), and the two frozen-RED rows are not excused (F7).
- Row 116 belongs with 119/120/127 (section D). Class (i) is sound for continuing P1b and P2 with the caveats in section E.

## A. The attribution, class by class

Counting. 20 RED in the 128 run = the 19 rows in the table + 116. 8 pin rows (5-12) are separate. 19 + 8 = 27, and 6 + 6 + 15 = 27. The arithmetic holds.
All 52 probe artefacts match SHA256SUMS. Free RAM was 6.5-7.2 GB in every testlock header and the logs carry no OOM marker. Class (iv) = 0 stands on that evidence.

| Class | Holds? | Basis |
|---|---|---|
| (i) 104-109 | Yes | RED with the identical "exact initial session read not reached" message in base, 1a and 1b. The cause is the stale selector at persistence:648-652, the already-approved 3.4/C6 repin. |
| (i) pins 6-11 | Yes, as an attribution probe only | Copy repin 255->344, 1592->1691, 676->976, 711->1011 gives 10/12 in 2/2 runs, identical to frozen's 10/12. It is substitution, not stack capture (E3), and the values will move again (W1). |
| (i) 119/120/127 | Provisional | DIAGX lists un-receipted P1b-collector members (decisions.ts:337, facts.ts:501/1000, nodes.ts:1880). P1b is not applied, so "turns green after P1b" is a prediction. See F9. |
| (ii) 5-7 | Yes (mechanism, section B) | |
| (ii) 64-66 | 65 and 66 yes. 64 is (ii) plus the (i) race H-D05 | 1b log: 65 and 66 GREEN, 64 still 2/5 in isolation. The residual is the N-b 1 ms race that H-D05 (approved in bracketed form, review-delta-1 D6) is for. |
| (iii) 43/45/47/49 | Partly. Not a root cause | Section C. |
| (iii) pin 5 and pin 12 | Fail on frozen bytes: confirmed. "Pre-existing, so excusable": not established | Section C. |

## B. Class (ii): the op-versus-timer identity

### B1. Why the rows fail, and why option 1a fixes nothing (my reading of the code, consistent with the logs)
Rows 5-7 (decisions.test.ts:702) require, after a busy-wait that outlives a 30 ms deadline, that the exposed cause is an AggregateError whose two members are
`[actualOp, timerExpiry]` with `entries[1] !== actualOp` (decisions.test.ts, "assert.notEqual(entries[1], actualOp)"), and the title says the op refused
"before timer processing". Two distinct FWD objects are therefore part of the oracle.

In decisions.ts the first error comes from `await deadline.run(work)` (a `Promise.race([work, this.expiry])`, erasure.ts `run`), and the second from
`originalExpiry = deadline.run(never)` (decisions.ts:119, read at :260). The primary is `[failure.err !== expiryError ? failure.err : -, expiryError]` (decisions.ts:262-264).
- Frozen: the timer has not run when `op()` throws a fresh E_op, so `work` rejects first and `failure.err = E_op`. The timer later rejects `expiry` with E_t.
  Result `[E_op, E_t]`, an AggregateError. Rows pass.
- Current 3.9: `op()` calls `#expire()`, which synchronously runs `fire(E)`. `expiry` is already rejected before `work` rejects, so the race settles with E,
  `failure.err = E` and `expiryError = E`. The dedup leaves `[E]`, which is not an AggregateError. This is exactly the assertion that fails (decisions.test.ts:740).
- Option 1a (abort+fire with E_t, then throw a fresh E_op): `fire` is still synchronous, so the race still settles with E_t. Same failure at decisions.test.ts:740
  in the 1a log. That is why it fixes nothing. The maker measured it; this is the code explanation.
- Option 1b removes the abort, so `fire` stays on the timer: rows pass, but the signal stays live. It is the M39 mutant, and the AR-4 `aborted` assertion
  fails (o1-opt1b-ar-1.log). It reopens A-c(start) (3.3/M33). Refused.

So the property the oracle needs is "the `expiry` promise must not already be rejected when the op error is thrown". The property 3.9 needs is "the signal must
already be aborted when the op error is thrown". These are different events. Only the second one has to be synchronous in `op()`.

The alternative named in the brief, a dedup at decisions.ts:262-264 keyed on source instead of object identity, cannot work. The oracle asserts two distinct
objects (`entries[1] !== actualOp`), so a dedup change cannot produce the pair, and it would be a product change in the file the oracle is guarding. Refused.

### B2. Ruling: design 3a, "abort early, fire on the timer"
In erasure.ts `WriterDeadline` only, in place (no new file, no new export, no change to run/dispose/expired):
- A private lazily-minted expiry: `#mint()` returns the pending FWD, creating it (with its birth registration, as `#expire` does today) on first use.
- The timer body keeps its place and calls `#expire()`. `#expire()` now does `const e = this.#mint(); this.controller.abort(e) /* no-op if aborted */; fire(e); return e;`.
  Timer path behaviour is therefore unchanged (abort and fire together, one E, AR-1 intact).
- `op()`, branch `left <= 0 && !signal.aborted`: `this.controller.abort(this.#mint());` and nothing else. No `clearTimeout`, no `fire`, no throw here. Control falls
  through to the existing "already aborted" branch, which mints a fresh E_op with birth and throws it. The overdue timer fires on the next macro-task, rejecting
  `expiry` with the same E_t that is already the abort reason.

Resulting contract: after an op-declared expiry the signal is aborted synchronously (M33/M39, checkpointer:299 `signal.aborted` and :308 both hold), the thrown E_op
is a fresh FWD distinct from the signal reason, and `signal.reason === the E that run() later rejects with === originalExpiry`. In decisions.ts the race now
settles with E_op, then `originalExpiry` settles with E_t, so `[E_op, E_t]` reappears exactly as on frozen bytes. The identity relations seen by decisions.ts
and writeApproved are the frozen ones (the same as 1b), so rows 5, 6, 7, 65 and 66 should behave as in the 1b log. That last sentence is a prediction, not a
measurement; F3 is the measurement.

Risks the probe must retire (I cannot retire them by reading):
- There is now a window of one macro-task in which `signal.reason` is E_t but `expiry` has not rejected, so E_t has not yet reached `originalExpiry`'s
  `ownExpiryFailures.add` or the graph receipts. In the frozen timer path abort and fire are in the same block; here they are not. AR-3 (the LangGraph-surfaced FWD at underLease is classified expected)
  and rows 34-41 are the rows that would show it.
- The early abort wakes any abort listener one tick earlier than frozen, in the writeApproved flows of rows 64-66.
- `dispose()` before the timer leaves the signal aborted and `expiry` never rejected. That equals frozen behaviour for `expiry`, and nobody awaits `run` after dispose.

### B3. Which assertion changes (AR-4 only)
AR-4 is erasure.test.ts:2246-2262. It is a row added by plan-v2 3.9, RED on frozen because it did not exist. It is not one of the 28 inventory files' pre-existing
assertions, so D-082 and D10 are not engaged. Nothing in decisions.test.ts, per-fact, persistence or checkpointer changes.

| Line | Before | After |
|---|---|---|
| 2255 | `opError instanceof FencedWriterDeadlineError` | unchanged |
| 2256 | `signal.aborted === true` | unchanged (this is what M39 and M33 are checked against) |
| 2257 | `strictEqual(signal.reason, opError)`, "signal.reason is the E op() threw" | `signal.reason instanceof FencedWriterDeadlineError` with its birth registered, and `notStrictEqual(signal.reason, opError)` ("op throws a fresh E, the abort reason is the E the timer will reject with"). The `notStrictEqual` is what rows 5-7 need from the product, so it is deliberately pinned here too. |
| 2258 | `strictEqual(await run(never).catch(e=>e), opError)` | `strictEqual(await run(never).catch(e=>e), signal.reason)` (waits for the overdue timer) |
| new | none | `signal.throwIfAborted()` throws `signal.reason` (the AR-1 relation, now also on the op path) |
| 2259 | `expired() === true` | unchanged |

M39 (remove the abort from the op path) still turns AR-4 RED at 2256 and checkpointer:299. New M43 (make the op path call `fire`, i.e. option 1a) turns rows 5-7 RED
and is recorded as the falsifier of the ordering requirement. New M44 (abort with a minted E that is not the one the timer later fires) turns AR-4 line 2258 RED.

Hunk set: the change is inside the already-listed H-005/H-006/3.9 erasure.ts hunks and adds no file, export or product site. review-delta-1 D9 asks for a fresh review
when the listed set is left; this review is that review for this edit only.

## C. Class (iii)

### C1. 43/45/47/49: the attribution is a mechanism, and the dump does not close it
What holds: the four rows are RED with the same underLease envelope in base, 1a, 1b and with the literal H-117 adapter inserts restored (g5o-adp-1: 12/16, the four resume-reject
rows fail). So neither 3.9 nor the accepted G5 deviation (review-delta-2 E6) is the cause.

What is not shown: DIAGX1 (diag1-1.log line 3) lists four failures. Two are graph.ts compensation envelopes, "Scribe original settlement and owned compensation failed."
(graph.ts:1281) and "Scribe owned compensation failed." (graph.ts:1229), both forced, receipted, with `children:1, childExpected:[false]`. The dump prints those
children as a count and a boolean and never names them. The third is the test's own `PRIVATE_D068_ADAPTER_resume_checkpoint primary_MARKER`, with `receipt:false`, `forced:false`,
`expected:false`. So "no P1b collector among the members" is true only of the top level. The unnamed unexpected children of the two compensation aggregates are exactly where an
un-receipted facts.ts or decisions.ts P1b collector (the 119/127 pattern) would sit. All the "owned compensation" strings are in graph.ts, but the compensation runs the db writers.

Therefore I do not accept (iii) for these four yet. They may be (i) provisional on P1b, or a real graph.ts gap. The smallest probe that decides it (F5): in the scratchpad copy `fz`,
extend `diagpatch.js` so that `rec()` recurses through `cause` and `AggregateError.errors` of every non-expected failure and prints for each leaf: constructor, message prefix,
receipt, born, whether the leaf's creating file is facts.ts/decisions.ts (stack top frame). One run of row 43 is enough; 45/47/49 differ only by phase.
- If every unexpected leaf is a facts.ts/decisions.ts collector or a P1b-hunk-owned error: reclassify (i) provisional on P1b, with the P1b freeze as the closure.
- If the unexpected leaf is the PRIVATE marker or another graph.ts-owned error: this is the real class (iii). It needs a named graph.ts hunk, and under D9 a fresh review
  before it is applied. The plan's 3.1 claim ("closes A-c(resume)") is then false for a primary reject on resume, and the text must say so.

### C2. Pin 5 (T046 private) and pin 12 (D055 rollback-rejects): they fail on frozen bytes, but nothing yet says why
Confirmed from the logs: fr-t046p-1..3 are 1/2 each with `assert.ok(error instanceof ProviderAuthorizationRefusedError)` false at per-fact:758; fr-d055rr-1..3 are 3/4 each
with the sentinel "D055 actual rollback cleanup rejection sentinel" escaping as the test's own failure (persistence:2597 frame); fr-pins-1 is 10/12. Three of three isolated runs, deterministic.
The links in `fr` resolve inside the copy (`node_modules` -> /d/vc/node_modules, `@vc/*` -> fr/packages/*), so a duplicate-module `instanceof` artefact is not indicated by the layout.

Why "pre-existing, so excusable" is not accepted:
- 28bb3bc is `wip: T-052 cycle2 working tree (not checker-PASS; never merge to main)`. Matching it is not matching a passing state.
- `git diff --stat 36bae79 28bb3bc` on the source dirs is 4241 insertions, 557 deletions across 7 files (graph.ts +2075). T046 private exists at 36bae79 (`git show` grep count 1), the last independent
  PASS commit before the WIP. The D055 prompt tests do not exist at 36bae79 (count 0). So T046 private may be a regression introduced inside the T-052 WIP, and that is a product question, not a baseline.
- E1 required a cause ("order/selection dependence, ENVIRONMENTAL, or pre-existing") before relying on either row. The maker has an assertion line and a repeat count, not a cause. The error that arrives at
  per-fact:758 has never been printed. It may well be an envelope AggregateError from the same resume collector as 43-49 (the test is a resume with a refused nested graph, and graph.ts now has a
  special case at about graph.ts:3192 that rethrows a sole ProviderAuthorizationRefusedError). That is a hypothesis; the probe settles it.
- The graph.ts:255 pin at per-fact:761 sits after the failing :758, so it is unreachable on frozen bytes and on the current tree. The repin of that one literal cannot be proven selective (E5). The
  255 family is still covered by pin 6 (per-fact:891, inside the test at :840). Record 761 as UNPROVEN.

### C3. E8, restated
review-delta-2 E8 ("everything must be green after repin") cannot be met on pins 5 and 12 as written, because they are RED before any repin. Replacement (F6):
E8' (a) No-regression rule: for the 12 pin tests, the db-side pin tests, per-fact 1289/1298/1376, D055 ordinary rows 7-8 and prompt rows 9-11, the set of GREEN tests on the final tree
must contain every test GREEN on frozen 28bb3bc, measured by the same command and recorded with file hashes in each log header. A test GREEN on frozen and RED at the end is a regression and is PRODUCT.
(b) The two frozen-RED rows are carved out of repin proof, and not excused: each carries status OPEN-FROZEN-RED, a probe-based cause (F7), and a stated end state. "Same signature as frozen" (same assert line,
same error constructor and message) is accepted for P2 and P3 only. Closure of T-052 needs each of them GREEN, or a checker disposition recorded with the Approver's name if the cause is a protected-test or harness defect.
(c) Everything else in E8 stands: no assertion edits beyond the E4 numeric literals, and any other red after an exact repin is PRODUCT and returns to review.

## D. Row 116
Classification: provisional class (i), the same family as 119/120/127. Evidence:
- plan-v2 section 3 table row P-b lists "116, 119, 127: graph.ts:1674 owned-cleanup AggregateError, PRODUCT (3.1)". The mutant for that family is M31, which re-reds "116/119/127".
- The 128 log shows 116 failing with the same "Scribe original settlement and owned cleanup failed." (graph.ts:2155) error, thrown from the collector, while the sibling variants 117 (rejected read) and 118 (two-error)
  are `ok` in the same run. The clean-outcome variant is RED and the error-outcome variants are GREEN, which is the 119/127 polarity (a clean own expiry is turned into an envelope by an un-receipted drained member).
- 116 is flaky under option 1a (RED in the base run, absent from the 1a RED list), which is consistent with a timing-sensitive drained-settlement member and not with a deterministic assertion.

It is not proven. DIAGX has never been run on 116, so the un-receipted member is not named. Probe (F8): the same patched `fz` copy as F5, row 116 only, one run, same leaf-level dump. Pass
condition for class (i): at least one unexpected leaf is a facts.ts/decisions.ts collector error that a named P1b hunk (H-082.., H-025..041, H-095, H-101..104) types or receipts. Otherwise reclassify as (iii) with the other graph.ts rows.

## E. Is class (i) complete and sound for continuing P1b and P2?
Yes for continuing, with these corrections:
1. The list is 15 rows, and 116 joins the provisional group, so 16 rows with 4 provisional (116, 119, 120, 127).
2. The provisional group is a prediction until the P1b freeze. Its closure is an executed result (F9), not a table entry. 120 additionally includes a test receipt marker, so it may need a second hunk.
3. Row 64 is (ii) and (i): GREEN only after 3a and H-D05 together. Acceptance is 10/10 isolated runs at P2 with M41/M41b (review-delta-1 D6), not "improves to 2/5".
4. The pin count is a lower bound (review-delta-2 W3). Lines in erasure.ts (pins 976/1011) will move again because F1 edits erasure.ts, and graph.ts will move if F5 produces a hunk. The repin stays at the very end (E2).
   The copy-repin is not evidence for E3.
5. P1b is allowed to continue now. P2's repin must wait for F1 and for the F5 decision, because both can change pinned files.
6. The 128-control selection is a filter by test name. Its green count says nothing about D068-unrelated tests; P3 still runs the full affected modules (D3).

## F. Binding conditions
F1. Replace plan-v2 3.9 and the corresponding H-006 text by design 3a (B2), edited in place in erasure.ts. Options 1a, 1b and 2, and the decisions.ts dedup change, are refused. The 3.9 section of the plan
    and the hunk text must be amended in the manifest before P1a is re-frozen.
F2. Amend AR-4 exactly as in the B3 table and nothing else in erasure.test.ts. Record the before/after lines in the manifest, with the statement that AR-4 is a plan-added row, not a pre-existing oracle.
    Add M43 and M44. M39 stays. The mutant register is updated.
F3. Before any commit of 3a, run it copy-only in a scratchpad copy of the ad60624 tree under vc-testlock (erasure.ts changed, AR-4 amended in the copy). Acceptance, all required:
    a) rows 5, 6, 7, 65, 66 GREEN in the 128 run and in 3 consecutive runs; row 64 no worse than 1b (2/5 or better in isolation);
    b) rows 34-41 and A-b (checkpointer:299/308) GREEN; AR-1, AR-2, AR-3, AR-4', AR-5 and `erasure.test.ts` in full GREEN;
    c) no new RED against the 20-row base set, and 116 and 43/45/47/49 are not worse than base;
    d) M39 RED at AR-4 and checkpointer:299, M43 turns rows 5-7 RED, M44 turns AR-4 line 2258 RED;
    e) logs with erasure.ts LF sha in the header, committed under qa/evidence/t052-c2-p0/ with SHA256SUMS.
    If any of a) or b) fails, stop and return to review. Only if the sole remaining way forward is an edit to a row of decisions.test.ts, per-fact or persistence is the question for Umesh (section G).
F4. P1a is re-frozen on the amended text with the review-delta-1 D9 list (db typecheck, erasure.test.ts in full, AR-1, AR-4', AR-5, M38 incl. row 128, M39, 128 GREEN) and D7 (row 128 on 5 consecutive isolated runs).
F5. Before any graph.ts hunk is proposed for 43/45/47/49: run the leaf-level DIAGX on row 43 in the copy (C1) and attach the output. Decide (i) or (iii) from it as stated in C1. If (iii), the hunk and its RED-before come back to a fresh
    plan review (D9); no graph.ts edit meanwhile. The same dump on the T046 private test (F7) is run in the same pass.
F6. E8 is replaced by E8' (C3). E1, E2, E3, E4, E5, E6, E7, E9 stand. E7 is discharged by F3 a).
F7. Classify pin 5 and pin 12 by probe, in copies, in this order: (a) on frozen `fr` and on ad60624, print `constructor.name`, `message`, `cause` and `errors` of the value seen at per-fact:758, and for pin 12 the origin of the
    escaped sentinel (unhandledRejection or a returned rejection), by a diagnostic predicate or `process.on("unhandledRejection")` hook in the copy only; (b) run T046 private in isolation on a copy of 36bae79
    (the last independent PASS) and record the Node version. Outcomes: GREEN at 36bae79 means a regression introduced by the T-052 WIP, i.e. PRODUCT and in scope for a hunk; RED at 36bae79 means pre-existing, with the
    cause from (a) stated; an envelope AggregateError in (a) means the same family as F5. Until then both rows are OPEN-FROZEN-RED, and per-fact:761 is recorded UNPROVEN.
F8. Probe row 116 as in D, in the same pass as F5.
F9. Provisional rows 116, 119, 120, 127: they must be GREEN at the P1b freeze with every oracle byte unchanged. If any is still RED after the named P1b hunks, it is PRODUCT and returns to a fresh review. No oracle edit.
F10. Record in the manifest a classification ledger with a "closure packet" and "closure command" column for each of the 27 + 1 rows, and a status column (CLOSED / PROVISIONAL / OPEN). Rows are never counted as closed on a prediction.
F11. D9 of review-delta-1 still applies: any outcome that adds a product hunk or leaves the listed set returns to review. 3a is the only change approved by this review.
F12. The standing D10 question is unchanged and is not discharged here: if the coordinator reads D-082 as barring any protected-test edit, then persistence:652, H-D05 and the E4 repin literals go to Umesh before P2.
    This review adds no new protected-test edit.

## G. HUMAN_GATE
None now. 3a needs no edit to a pre-existing assertion, so option 2 is not taken. The question for Umesh arises only if F3 fails and every remaining path edits a decisions/per-fact/persistence row. In that case it would read:
"Rows 5-7/64-66 cannot be made green with the product design alone. Approve a protected-oracle edit to decisions.test.ts:702? Recommended default: no, return to design." I am not raising it today.
The carry-over D10 / F12 question is unchanged.

## H. Warnings (not blocking)
W1. 3a puts a one-macro-task gap between "signal aborted" and "expiry rejected" on the op path. This is the single behavioural novelty; F3 b) exists for it. If a consumer treats the aborted signal as the receipt, there may be a window where E_t is not yet in ownExpiryFailures.
W2. The 1 ms race in row 64 is a test-timing property. It must not be reported as ENVIRONMENTAL (review-delta-2 W2).
W3. attrib-c2.md says "the pins give 10/12, identical to frozen". That identity also reproduces frozen's two unexplained REDs, so it is a statement about line values only.
W4. All logs reviewed are copy-only WIP evidence. None is acceptance evidence.

PLAN-APPROVE

Binding conditions: F1 (3a replaces 3.9; 1a/1b/2/dedup refused), F2 (AR-4 amended, M43/M44), F3 (copy-only probe with 5 acceptance items), F4 (P1a re-freeze), F5 (leaf-level DIAGX for 43/45/47/49, graph.ts hunk only after review),
F6 (E8 restated), F7 (cause probes for pin 5 and 12, incl. 36bae79), F8 (row 116 probe), F9 (provisional rows close only on P1b GREEN), F10 (ledger), F11 (D9 stands), F12 (D10 unchanged).
