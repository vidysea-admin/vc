# Plan review brief: t-052 cycle 2 delta (fresh independent reviewer, D-030 route; condition C4 of review-approve-2.md)
You are a fresh plan reviewer. You did not write this plan or the earlier reviews.

## Judge
- **Under review:** qa/evidence/t052-plan-20261016/delta-c2.md (commit a67b109).
- **Against:**
  - plan-v2.md and hunks-v2.md in that folder.
  - review-approve-2.md (conditions C1-C6, warnings W1+) and review-refuse-1.md.
  - The P0 evidence in qa/evidence/t052-c2-p0/ (3cae385).
  - The code at wip/t052-cycle2 28bb3bc, read with `git show 28bb3bc:<path>`.
  - The contract rows B23.1-B23.7 quoted in qa/manifests/t-052-session-lifecycle.md.
  - D-082 in docs/DECISIONS.md: the 28-file GO.

## Check
1. **H-D01 (C4).** Is `durability: "sync"` at graph.ts:656 a real root-cause fix for the start rows?
   - Do the P0/X1 numbers actually support it? Check 0 post-hold calls, and rows 34-41 now failing later on 3.1-class settlement.
   - Does M40 falsify it?
   - Are there side effects on latency, on other graph paths, or on erasure and crisis paths?
2. **H-D02..H-D04.** These add a new optional constructor parameter and new option fields, which is outside plan-v2's approved API list.
   - Decide whether this is an API change you can approve within D-082's 28-file scope.
   - If it changes a public or exported contract beyond that scope, write a HUMAN_GATE line.
   - Give a smaller alternative if one exists, for example passing the absolute deadline through.
3. **H-D05 (protected fixture change).** Confirm it makes the clock deterministic and weakens no assertion. Name the exact assertion before and after.
4. **Row 128.** Is it truly covered by H-005? Check the 5/5 RED and GREEN evidence, and its addition to M38's targets.
5. **The six re-pins and LF pin policy.** Are they justified? Does any of the six differ in content from what the earlier reviews saw, and not just in line endings?
6. **The freeze list and expected outcomes.** Are they complete? Does any row stay unexplained?

## Output
- Write ONLY qa/evidence/t052-plan-20261016/review-delta-1.md.
- End it with `PLAN-APPROVE` plus numbered binding conditions, or `PLAN-REFUSE` plus blocking reasons, plus any HUMAN_GATE line.
- Commit it on main by pathspec, with a message ending `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Never
- Code edits, tests in D:/vc or the worktree, python, live calls, or Mongo.
- Editing .claude/**, qa/contracts or qa/gates.
- `git add -A`, or a push.

## Return
`PLAN-APPROVE|PLAN-REFUSE <sha>` plus at most 6 lines.
