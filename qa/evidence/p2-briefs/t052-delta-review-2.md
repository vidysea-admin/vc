# Plan review brief 2: t-052 cycle 2, line-number pins and a maker deviation (fresh independent reviewer, D-030 route)
You are a fresh plan reviewer. You did not write the plan or any earlier review. Read these:
- qa/evidence/t052-plan-20261016/{plan-v2.md, hunks-v2.md, review-approve-2.md, delta-c2.md, review-delta-1.md}. Plan-v2 section 3.4 is the existing measured repin policy for persistence:652.
- Branch wave/t052-c2 at ad60624. It is a partial P1 and not checker-reviewed. P1a is ab20f7e.
- The maker's logs in C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/t052c2/. Check each sha256 prefix first:
  - pins-frozen-1.log 674dc82e
  - pins-p1a-1.log b9074a89
  - pins-now-1.log 92581fdb
  - p1c-128c-1.log d3b07dc5

## Question 1: hard line-number pins
Existing tests pin source lines by hard line number, and the approved hunks move those lines:
- facts.test.ts:1882 pins facts.ts:2082/2091, and facts.test.ts:3068 pins facts.ts:1255.
- decisions.test.ts:578 pins facts.ts:1255.
- per-fact:761/891 pins graph.ts:255; per-fact:1289/1298 pins facts.ts:2317; per-fact:1376 pins facts.ts:2082.
- persistence:906 pins erasure.ts:601/615.
- persistence:2522-2627 pins nodes.ts:1592, erasure.ts:676/711 and facts.ts:915.

The measured fail counts on these 12 pin-bearing tests were:
- frozen code: 2 fail;
- P1a only: 5 fail;
- current tree: 6 fail and 2 cancelled.

Decide between two options, and say why:
- **(a)** A measured repin policy like 3.4. It is a protected test change: each pin is updated only to the new line of the same frame, proved by a stack capture, and no assertion is weakened.
- **(b)** Line-neutral hunks.

Also judge the following, from the logs and the code:
- Whether any of the extra fails (D055 prompt rows 9-11, T046 serialized at graph.ts:255, the D055 ordinary x2 timeouts) is a real behaviour change rather than a line shift.
- Whether the line-neutral H-D03 is acceptable.

## Question 2: the maker's deviation
The maker reverted the G5 "remember" step in the 8 adapter op-wrappers. The reasons given: checkpointer:155 asserts the wrapper text exactly, which is a protected test, and the H-043 receipt remembers first anyway.

Rule on whether D2 and the plan-v2 3.2/G5 intent are still met. Rows 34-41 are reported GREEN at 109/128.

## Output
- Write ONLY qa/evidence/t052-plan-20261016/review-delta-2.md.
- End it with `PLAN-APPROVE` plus numbered binding conditions E1.., or `PLAN-REFUSE` plus blocking reasons, plus a HUMAN_GATE line if product intent is needed.
- Commit it on main by pathspec, with a message ending `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Never
- Code edits, or test runs in D:/vc or the worktree.
- python, live calls or Mongo.
- Editing .claude/**, qa/contracts or qa/gates.
- `git add -A`, or a push.

## Return
`PLAN-APPROVE|PLAN-REFUSE <sha>` plus at most 6 lines.
