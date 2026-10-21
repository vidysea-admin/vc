# Brief: senior-software-engineer read-only review of golive-launcher (do not edit, do not commit)
Worktree D:/vc/.worktrees/golive-launcher, branch wave/golive-launcher. Diff: `git -C D:/vc/.worktrees/golive-launcher diff 5305e82..HEAD -- . ':!qa'`.
It adds a production launcher apps/api/src/main.ts, extracts the KB mapping into mcp/university-kb/src/source-kind.ts, and adds infra/ubuntu (systemd + nginx) for a text-only go-live of a student counselling chat behind nginx on Ubuntu.
Review for correctness and production risk: rate-limit identity (X-Real-IP set by nginx from $remote_addr; can a client spoof it?), secret leakage in logs/errors, fail-closed boot, graceful shutdown, the added `insufficient_coverage: false` on KB answers (does it falsely mark an uncovered answer as served? read packages/engine isServedAsk and the KB serve rule), nginx/systemd config mistakes.
Return Approve / Warning / Block with file:line evidence, <= 20 lines.
