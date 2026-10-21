You are /checker running a Mode A feature check. Read your full protocol first: C:/Users/Lenovo/.claude/skills/checker/SKILL.md
Contract: spec A20 go-live gate (D:/vc/.worktrees/golive-b13guard/qa/contracts/, criterion text is in the manifest Acceptance section)
Manifest: D:/vc/.worktrees/golive-b13guard/qa/manifests/golive-b13guard.md
Project: D:/vc/.worktrees/golive-b13guard (bound; read/write only inside it)
Verdict path: D:/vc/.worktrees/golive-b13guard/qa/verdicts/golive-b13guard.md
Checkpoint: D:/vc/.worktrees/golive-b13guard/qa/checkpoints/golive-b13guard.md
Tier: L (protected test change: an assertion made conditional). Single checker, no dual trigger.
Policy: proportional-verification/2026-10-19.17
Budget: wall 45 min, agent-minutes 135. Base: 28dc4ff. Integration branch: main. Cycle: 0.
Task: verify C1. (1) Run `node --import tsx --test tests/go-live-gate.test.ts` in apps/api on HEAD -> green. (2) In a THROWAWAY copy outside the tree (copy the worktree excluding .git; node_modules may be junctioned/reused), change `B13-signed: PENDING` in qa/gates/p1-u0-amendment-signatures.md to `B13-signed: SIGNED 2026-10-21T17:00:00+05:30 by Umesh` and rerun the same test file -> green (the real-repo A20 test skips; the CLI test passes and still asserts exit 1 + REFUSED). (3) Falsification in that same signed copy: remove the `if (REAL_B13_PENDING) ` guard on the CLI test's b13 assertion -> that test goes red on that assertion. (4) Confirm the diff 28dc4ff..HEAD only touches the test line and qa files; the unguarded refusal assertions are unchanged (no weakening beyond the B13 line). Never edit the real qa/gates file. Write the verdict (with Cycle checked: 0 and one Metrics line), commit it with a narrow pathspec inside the worktree. Kill only PIDs you started. Return one line: golive-b13guard <PASS|FAIL> <verdict sha>.
