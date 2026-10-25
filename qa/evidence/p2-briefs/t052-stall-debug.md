# Stall diagnosis: t-052 cycle 2 (agent-debugger, phases 1-2 only, read-only toward code)
Use the /agent-debugger protocol (C:/Users/Lenovo/.claude/skills/agent-debugger/SKILL.md) for phases 1 and 2 only: failure capture and root cause.

## Inputs
- qa/manifests/t-052-session-lifecycle.md.
- qa/evidence/p2-briefs/t052-c2*.md and t052-delta-review*.md, the briefs in order.
- qa/evidence/t052-plan-20261016/, the plan and reviews: delta-c2, review-delta-1, -2, -3 and attrib-c2.
- qa/evidence/t052-c2-p0/, including attrib/ and f-probes/.
- The gate qa/gates/t052-stall.md.

## Question
Cycle 2 went through four plan-review rounds. Each approved a design, and a copy probe then found new REDs. Answer:
1. Is the failure on the loop-design side or the execution side? Loop-design here means a plan scoped too wide, reviews ruling without executed probes, or an oracle that cannot be met. Execution means the builder, the tools or the environment.
2. What is the smallest recovery that would converge? Rank options A-D of the gate file by the evidence.

## Output
- Write ONLY qa/debug/t-052-cycle2.md, at most about 80 lines.
- Commit it on main by pathspec, with a message ending `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Never
- Code or test edits, test runs, python, live calls or Mongo.
- Editing .claude/**, qa/contracts, qa/gates or qa/issues.jsonl.
- `git add -A`, or a push.

## Return
`DEBUG t-052 <sha>` plus at most 5 lines: the side, the root cause and the ranked recovery.
