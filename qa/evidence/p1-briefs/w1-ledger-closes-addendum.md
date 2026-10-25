# Addendum: w1-ledger-closes (same rules as your brief)

Add four more rows to the same run and the same verdict file:
- ISS-054
- ISS-056
- ISS-095
- ISS-084

## Why they look fixed

Commit 38e751d (2026-10-17, "fix(hooks): resolver-based counters (D-081, ISS-054/056/095/084)") installed one shared handshake-resolver block in:
- `.claude/hooks/mc-sessionstart.ps1`
- `.claude/hooks/mc-precommit.ps1`
- `D:/ai_os/.claude/hooks/delivery-gate-stop.ps1`, if it is present there

The block is marked Approved-by: Umesh 2026-10-16. Per its header, it implements this contract:
- Status: the last line in a tier wins.
- Cycle: the max cycle wins.
- Trees: the root and every worktree are scanned.
- Ties: the root copy wins.
- Issues: the ledger is merged per field.

## What to verify

Verify the outcome, not the code text. Run the hook read-only against D:/vc. A good way is `powershell -NoProfile -File .claude/hooks/mc-sessionstart.ps1` with empty stdin.

Then show each of these with evidence:
- **(a) Worktree manifests (ISS-054):** a ready-for-check manifest that exists only in a worktree is counted. Live case: the wave-1 worktrees under `D:/vc/.worktrees/w1-*`, once a builder sets ready-for-check. If none exists yet, build a fixture in a temp copy of the hook's input tree, never in D:/vc.
- **(b) Duplicate Status lines (ISS-056):** a manifest with a stale earlier ready-for-check line and a later checked-PASS line is not counted.
- **(c) Max cycle (ISS-095):** a newest-first verdict file such as `t-017-residuals.md` resolves to its max cycle.
- **(d) Ledger counting (ISS-084):** the open count equals the merged per-id count.

## Recording

Append a fixed/verified row for each issue only on outcome evidence. Otherwise record STILL-OPEN with the reason.

Never edit any hook.
