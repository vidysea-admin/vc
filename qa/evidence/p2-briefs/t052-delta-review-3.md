# Plan review brief 3: t-052 cycle 2, one combined ruling on every remaining RED (fresh independent reviewer, D-030 route)
You are a fresh plan reviewer. You did not write the plan or any earlier review. Read these in qa/evidence/t052-plan-20261016/:
- plan-v2.md and hunks-v2.md;
- review-approve-2.md, review-delta-1.md and review-delta-2.md, with their binding conditions C1-C6, D1-D10 and E1-E9;
- delta-c2.md;
- attrib-c2.md, the maker's attribution of every still-RED row (commit bfcb317).

The probe logs and scripts are in qa/evidence/t052-c2-p0/attrib/. Check them against their SHA256SUMS first. The code is on branch wave/t052-c2; read it with `git show <ref>:<path>`.

## The maker's attribution (verify it; do not take it on trust)
The maker counts 27 rows:

| Class | Count | Rows |
|---|---|---|
| (i) expected later packet | 15 | 104-109 (3.4/P2 repin), pin rows 6-11 (E2 repin), and 119/120/127 (provisional on P1b) |
| (ii) 3.9 op-vs-timer identity | 6 | decisions rows 5-7 and 128-controls 64-66 |
| (iii) other plan conflict | 6 | 43/45/47/49 (RED even with the literal H-117 inserts restored), plus T046 private and D055 rollback-rejects, which fail on frozen 28bb3bc, so E8 cannot be met as written |

Row 116 was outside the brief. It is RED 5/5 with the same envelope message, and the maker did not diagnose it.

The maker measured three options:
- **Option 1b** (the timer keeps its E, the op throws a fresh one): 108 → 113/128. It fixes 5, 6, 7, 65 and 66 and moves 64 to 2/5 passing, but it turns AR-4 RED. 1b is the M39 mutant itself, so it reopens the 3.9/3.3 abort-on-op guarantee (A-c start, M33).
- **Option 1a:** fixes nothing.
- **Option 2:** change the oracle of the class (ii) rows. This is a protected test change and needs the Approver (D-082/D10).
- **Option 3:** look for the same identity assumption in the other rows (done above).

## Decide
1. For each class, say whether the attribution holds, from the logs and the code.
2. For class (ii), rule on option 1b, option 2, or a third design that keeps AR-4 and M39 (for example, the decisions.ts:262-264 dedup keyed on the source rather than on object identity). Say which assertion changes, if any, before and after. If the answer needs option 2 or any oracle change, write `HUMAN_GATE: <one-line question for Umesh, with your recommended default>`.
3. For class (iii):
   - 43/45/47/49: name the root cause, or the smallest probe that would find it.
   - T046/D055: rule how E8 must be restated, so that it requires no regression from frozen 28bb3bc rather than green.
4. Row 116: classify it, or name the probe that must classify it before P3.
5. Is the class (i) list complete and sound for continuing P1b/P2?

## Output
- Write ONLY qa/evidence/t052-plan-20261016/review-delta-3.md.
- End it with one of:
  - `PLAN-APPROVE` plus numbered binding conditions F1..;
  - `PLAN-REFUSE` plus blocking reasons.
- Add HUMAN_GATE lines where they are needed.
- Commit it on main by pathspec, with a message ending `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Never
- Code edits, or test runs in D:/vc or the worktree.
- python, live calls or Mongo.
- Editing .claude/**, qa/contracts or qa/gates.
- `git add -A`, or a push.

## Return
`PLAN-APPROVE|PLAN-REFUSE <sha>` plus at most 6 lines, quoting any HUMAN_GATE line verbatim.
