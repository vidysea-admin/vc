# Stall diagnosis: t-052 cycle 2 (agent-debugger phases 1-2, read-only)
Written 2026-10-25T12:46+05:30. Inputs read: the briefs in qa/evidence/p2-briefs/t052-*, plan-v2, the four reviews, attrib-c2, gate t052-stall.md and the f-probes logs. Executed: `sha256sum -c` on qa/evidence/t052-c2-p0/f-probes/SHA256SUMS (62 OK, 0 failed). I re-ran no test, so every number below is read from a committed log.

## Phase 1: failure capture
- Task: close fix cycle 2 of t-052 (B23.1-B23.7) on branch wave/t052-c2 (tip ad60624), the last allowed cycle.
- Last good step: probes of review-delta-3 (19c9805). They ran cleanly, with no OOM marker and free RAM 6.5-7.2 GB in every testlock header.
- Failure: the design approved by review-delta-3 (3a "abort early, fire on the timer") fails its own F3 probe.
  - F3: 128 controls give 111/128. Rows 5-7 are green 3/3, but rows 64-66 are RED 0/3 in all 5 isolated runs (3a-r6466-1..5). The error is "clean genuinely witnessed expiry is expected-only: rejected, expected fulfilled". That is the one-macro-task gap that review-delta-3 W1 warned about (aborted signal reason not yet receipted).
  - F5: row 43 has a forced, receipted, unexpected FencedWriterDeadlineError at graph.ts:1288 in the 1281/1229 compensation aggregates (v2-f5-r43-1.log). This is a real graph.ts hunk, not class (i).
  - F7: T046 private is GREEN 3/3 on 36bae79 (f7b-36-t046-1..3) and RED on frozen 28bb3bc and on ad60624. Both show the same envelope: AggregateError "Scribe failure and owned lease cleanup failed" wraps "authority loss and owned compensation failed", which wraps a ProviderAuthorizationRefusedError (T046DUMP, graph.ts:344 on ad60624). The regression comes from the 28bb3bc WIP, which added +2075 lines to graph.ts. Cycle-2 hunks did not cause it.
  - F8: row 116 is RED 6/6 in the x runs but green in one instrumented run (flaky).
- Repeated pattern: five plan rounds (review-refuse-1, approve-2, delta-1, -2, -3). After each approval, a copy probe found new REDs.
- Trajectory of the 128 controls: 74 (R1) -> 99 (P0) -> 108/109 (P1) -> 111 (3a copy). Progress is monotone but slows, and 17 REDs remain.
- Probe hygiene loss: the first F7a run (f7a-*-t046-1.log) died on an esbuild error in the inserted dump (per-fact:758:400, "Unexpected ')' in regular expression"). It was rerun as v2-*. That cost one round and is not the cause.

## Phase 2: root cause
Table row matched: "Tests still failing after fix / wrong hypothesis", combined with "gate that rules on predictions".

Answer 1: the failure is on the loop-design side. Execution is not the cause: 62/62 probe artefacts verify, the lock and RAM held, and there are no OOM markers. The loop-design faults, in order of weight:
1. **Reviews rule on reading, not on measurement.** review-delta-3 says of 3a: "rows 5, 6, 7, 65, 66 should behave as in the 1b log. That last sentence is a prediction, not a measurement". It also says 43/45/47/49 "may be (i) provisional" and T046 "may be a regression". The probes then decided 3a (fails 64-66), 43 (graph.ts hunk) and T046 (regression) the other way. Each round approves a design, and a measurement that arrives afterwards unseats it.
2. **The scope has outgrown the failure it repairs.** The cycle-0 FAIL was one defect (ISS-119, export leak). Cycle 1 fixed it in 2 files. Cycle 2 is now 28 files and 118 hunks taken mechanically from a roughly 3,200-line proposal, on a 12.7k-line WIP that never passed a checker. plan-v2 §1 R2 shows the ISS in-tree controls already green 14/14 on the WIP. The residual REDs (5-7, 43-49, 64-66, 104-109, 116-127) are D068/D072 deadline-envelope conformance rows, not ISS-120/121/122 rows. The loop is patching a never-green baseline up to a protected oracle set that grew over D032-D082.
3. **Cross-oracle coupling.** A-b (checkpointer:299, signal aborted when the op throws) and decisions rows 5-7 / 64-66 (expiry not yet rejected, op error distinct from the timer's E) pull on the same few lines of WriterDeadline. Every candidate (1a, 1b, 3a) fixes one group and breaks another. This is the genuine design core, and it is solvable: 3a already fixed 5-7 and A-b.
4. **Rows were classed from stack shape, not leaves.** The attribution called 43/45/47/49 "class (iii) no P1b collector" from a count-only dump. The leaf dump (F5) showed the cause is in graph.ts itself.
5. **Pending protected-test edits** (persistence:652 selector, H-D05 clock fixture, the E4 repin literals) wait on the D-082 / D10 reading. They are unanswered, so P2 cannot start whatever the design.

Is the oracle unmeetable? Not proven. 3a met 5-7, A-b and AR-1..5 without any oracle change. The remaining gap (64-66) is the W1 window, which a design can close. Unmeetable would be true only if the acceptance set (128 controls) cannot be met inside the 28 files. That is a scope question for Umesh, not an execution fault.

## Ranked recovery (smallest that converges)
1. **A, with two changes** (the only option that changes the loop and not only the state):
   - plan-v3 is built in a scratchpad copy of ad60624 and arrives with executed results: full 128 plus erasure.test.ts plus the F-set green in the copy, covering 3a plus a W1 fix (record or receipt the minted E at abort time), the graph.ts 1281/1229/1288 compensation hunk and the T046 envelope. The reviewer judges a measured diff, not a design. Any "should" or "prediction" in a review means the design is not approved.
   - Separate the closure of ISS-119..122 (controls 14/14, plus the two new rows of plan-v2 §3.10) from D068 conformance, and let Umesh state which are acceptance. In the same answer settle D10 (protected-test edits under D-082).
   - Keep wave/t052-c2 as reference. Open a new fix-cycle count.
2. **B** only if re-formed as the above (copy-built, measured). As worded ("one more review round on F3/F5/F7") it repeats the loop that has failed five times. It spends the single brief-rewrite allowance. Fallback if A is declined.
3. **D** (park). Does not fix t-052 and the base drifts (12 of 28 files already moved on main), but it is safe and frees capacity. Combine with A rather than use it as a recovery.
4. **C** (change the rows 64-66 oracle). Reject: 3a showed 5-7 can be met without it, and C would hide the W1 gap in a protected test.

## Phase 4: preventive changes to encode
- Review gate: a design that touches more than one oracle group needs a copy-run of the full control set attached before the review, and "prediction" language blocks approval.
- Row attribution must use leaf-level dumps from the start (DIAGX leaf mode), not counts.
- A repair unit whose verdict FAIL is one issue must carry a scope cap. Growth from 2 files to 28 needs a fresh plan gate, not a delta.
- Probe patches get a syntax check (`node --check` or an esbuild parse) before they enter the lock queue.
