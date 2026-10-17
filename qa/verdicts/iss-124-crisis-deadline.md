# Verdict: ISS-124 crisis-escalation deadline tests (fix/iss-124 @ 635e03d)

**Verdict: PASS**
**Checked:** 2026-10-17T14:15:22+05:30 by iss124-checker (fresh context, read-only toward the artifact)
**Cycle checked: 0**
**Artifact:** worktree `C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/w124`, base `38e751d`. Tier: L protected-test check (timing semantics changed). Mutations ran only in a scratch copy (`C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/f124/packages/engine`, node_modules junctioned to the worktree's). The worktree was not edited.

## 1. Diff scope: PASS
`git diff --stat 38e751d 635e03d` -> 1 file, 121 insertions, 75 deletions: `packages/engine/tests/crisis-escalation.test.ts`. No `src/` change.

## 2. Oracle weakening: none found
Read the full diff. Every original assertion is kept in the 4 converted tests: `instanceof FencedWriterDeadlineError` (x4), the final `deepEqual(... [], [])` / `rawNotifications == []` states, the per-phase `equal(JSON.stringify(c.all()), before, phase)`, `alerts.some(ConcernReviewSettlementError)` and the text-free `!includes("secret transcript")` check, plus `hold.applied`, `deadline.settled` and `await result.review`. Added assertions only (public call really timed out). Polling loops became `untilTrue` (same condition, real event-loop turns) and the 20 ms wait became `drainEventLoop`. The fake clock mocks ONLY `setTimeout` and `Date`; `WriterDeadline` (@vc/db), the review budget and `fencedWrite` in `src/guards/escalation.ts` run unmodified, and the deadline is fired by `clock.advance()` through the real timer. No stubbing of production code.

## 3. Re-runs: PASS
- `bash D:/vc/scripts/vc-testlock.sh npx tsx --test tests/crisis-escalation.test.ts` (cwd packages/engine of the worktree): tests 41, pass 41, fail 0, cancelled 0, 4.4 s.
- The same file in the scratch copy before any mutation: 41/41.

## 4. Falsification (scratch copy, `src/guards/escalation.ts`)
- Mutation A: both late-settlement compensations in `fencedWrite` (`work.then(() => undo(), () => undo())` at lines 233 and 241) made no-ops. Result 35 pass / 6 fail. All four converted tests RED on their named assertions: "timeout observes late insert settlement" (deepEqual review rows == [] got 1 row), "background late annotation ... text-free alert" (alert never emitted, `assert.ok` falsy), "late notification/annotation/acknowledgement settlement compensates" (`annotation` strictEqual, state != before), "late newly inserted notifications are deleted" (notifications got 3, expected 0). Two further T047 tests also went RED.
- Mutation B: deadline never fires (`WriterDeadline` replaced by a 60 s class at both construction sites, review-budget timer set to 1e9 ms). The first converted test hangs forever awaiting the public timeout (the run was killed at 300 s: 20 tests passed, the converted test never completed), so the tests do depend on the deadline firing, and nothing in them is satisfied by real elapsed time.
- Scratch-copy diffs were confirmed after each mutation; the worktree was untouched.

## Open risks (not blocking)
Mutation B surfaces as a hang, not a fast assertion failure, because the tests await the public call without a bounded wait; a regression there would stall until the runner timeout. Pre-existing style, not introduced here.

Metrics: start=2026-10-17T14:03:23+05:30 end=2026-10-17T14:15:22+05:30 wall_min=unavailable agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=1 mutations=2 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-15.12 lane=normal mutants=2 defects_unit=0 defects_6c=0
