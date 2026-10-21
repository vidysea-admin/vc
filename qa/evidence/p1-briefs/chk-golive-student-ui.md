# Brief: You are /checker running a Mode A feature check. Read your full protocol first: C:/Users/Lenovo/.claude/skills/checker/SKILL.md
Check with NO other context (no builder reasoning):
  Contract: none dedicated — criteria = the brief qa/evidence/p1-briefs/golive-student-ui.md (read it; its Build bullets are the acceptance criteria) + D:/vc/apps/api/src/anonymous.ts and packages/schemas/src/student-api.ts as the API contract.
  Manifest: D:/vc/.worktrees/golive-student-ui/qa/manifests/golive-student-ui.md
  Project: D:/vc/.worktrees/golive-student-ui (bound; read/write only inside it)
  Verdict path: D:/vc/.worktrees/golive-student-ui/qa/verdicts/golive-student-ui.md
  Checkpoint: D:/vc/.worktrees/golive-student-ui/qa/checkpoints/golive-student-ui.md
  Tier: M (new public UI surface). Policy: proportional-verification/2026-10-19.17. Budget: wall 10 min, agent-minutes 30.
  Base: 5305e82. Integration branch: main. Cycle: 0.
Focus: request/response field match with the real API schema (not the builder's mock); XSS (textContent only, no innerHTML with server text); every API state handled (ok, no_sourced_answer, sign_in_required, escalated, 429 retry-after, 5xx); helpline footer always visible; no storage of messages; no external resources.
Mode D: drive your OWN browser (Playwright MCP) against your OWN mock written from the real schema (scratchpad, not committed); interact, assert state changes, count console errors, write qa/evidence/browser-golive-student-ui-2026-10-21-checker/report.json. With no browser tool return BLOCKED-CAPABILITY.
One falsification per criterion in a copy outside the worktree. Kill only PIDs you start; never by image name; never PID 36944. No pushes.
Write the verdict file (Cycle checked: 0, Metrics line), commit it on wave/golive-student-ui with a narrow pathspec. Return the verdict word + <=10 lines.
