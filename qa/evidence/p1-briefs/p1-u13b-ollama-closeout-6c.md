# /checker — p1-u13b-ollama-adapter close-out + integrate + 6c + stamp (do NOT push)

Worktree D:/vc/.worktrees/p1-u13b-ollama, branch p1/u13b-ollama. Verdict PASS ae46c34 (qa/verdicts/p1-u13b-ollama-adapter.md). Review Approve: D:/vc/qa/evidence/p1-briefs/p1-u13b-ollama-review-result.md (on main).

## 1. Close-out (on p1/u13b-ollama)
- `git diff 9bc857b -- packages apps` must be empty (only qa/ changed since the code commit). Otherwise STOP and report.
- Mint qa/issues.jsonl rows (follow the last row's field names; ids start at ISS-270 to avoid collisions; dedupe) from the verdict's PROPOSED-ISSUE lines and the 5 review lows, all low. Mark review lows 1 (res.json no timeout) and 3 (2048 max output tokens) with note "fix before first paid run (D-100)". Add one low row: Ollama model ids + prices are [ASSUMPTION-UNVERIFIED] placeholders; set real values before the first paid run.
- Flip qa/manifests/p1-u13b-ollama-adapter.md to `Status: checked-PASS` citing ae46c34 + review. Commit "qa: p1-u13b-ollama-adapter close-out (PASS)" (narrow pathspecs, never git add -A).

## 2. Integrate
- `git -C D:/vc worktree add D:/vc/.worktrees/int-u13b-ollama -b int/u13b-ollama main` (local main). `git merge --no-ff p1/u13b-ollama`. qa/issues.jsonl / QUEUE.md conflicts: keep both sides (append-only). Update qa/QUEUE.md: Ollama adapter done; new rows as low candidates; note U13b still needs REAL bodies wired + per-run go from Umesh.
- In int worktree: `pnpm install --offline --frozen-lockfile` (TMP/TEMP on D:), `python contracts/verify_contracts.py`, `pnpm -r typecheck` exit 0.
- Full suite (cheap, ~2 min): `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh pnpm -r --workspace-concurrency=1 test` → 0 fail per package. Load-flake rule: a red is load-flake only if it passes alone, asserts a deadline/timeout/timing ratio, and its file was not changed by this unit → low ISS row, not a HOLD.
- From the int worktree: `node D:/ai_os/.claude/skills/maker/tools/tick.mjs --stamp-6c-green` then `--push-gate` → must print green. Do NOT commit qa/.6c-green. Do NOT push.
Report: close-out sha, int HEAD sha, per-package counts, push-gate line. Leave scratch in place and list it.
