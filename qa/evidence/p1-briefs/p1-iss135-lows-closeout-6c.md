# /checker — close-out ISS-135 (dual PASS) + integrate with p1/lows-api (test-lane) + 6c full suite + stamp (do NOT push)

## 1. Close-out on p1/iss135 (D:/vc/.worktrees/p1-iss135)
- `git diff 6f025b6 -- apps packages` must be empty, else STOP.
- Verdicts: A PASS 5f8595e (qa/verdicts/p1-iss135-anon-crisis-budget.A.md), B PASS 0dd09f4 (.B.md). Review Approve: D:/vc/qa/evidence/p1-briefs/p1-iss135-review-result.md (on main).
- qa/issues.jsonl: flip ISS-135 to fixed citing both verdicts (append row per convention). Mint low rows from both verdicts' PROPOSED-ISSUEs and the review lows (64 KiB boundary test through createApiServer; req.resume drain after 413; chat.ts 256 KiB authenticated route crisis-before-limiter question; residual crisis-scan CPU per client is B24.7-by-design — Umesh's call). Ids start at ISS-300 (dedupe). 
- Manifest qa/manifests/p1-iss135-anon-crisis-budget.md → `Status: checked-PASS` citing both verdict shas. Commit "qa: p1-iss135 close-out (dual PASS)". Narrow pathspecs.

## 2. Integrate
- `git -C D:/vc worktree add D:/vc/.worktrees/int-iss135 -b int/iss135 main` (local main, currently 649273f or later).
- `git merge --no-ff p1/iss135` then `git merge --no-ff p1/lows-api` (lows-api head 2d9cd19, test-lane: tests+docs only; manifest already merged-no-check (test-lane)). qa ledger/QUEUE conflicts: keep both sides (append-only). For lows-api also flip ISS-260, 261, 262 (investigated, no bug, test pins ordering) and 263 (docs/go-live-checklist.md) to fixed in qa/issues.jsonl. QUEUE: ISS-135 done, lows-api done, ISS-229 owner-accepted (D-101).
- `pnpm install --offline --frozen-lockfile` (TMP/TEMP on D:), `python contracts/verify_contracts.py`, `pnpm -r typecheck` exit 0.
- Full suite (tier L security): `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh pnpm -r --workspace-concurrency=1 test` → 0 fail per package (if one package stops the run, run the rest separately). Load-flake rule: passes alone + timing/ordering assertion + file untouched by these units → low row (ISS-278 voice.test.ts:1504 is a known one).
- From int worktree: `node D:/ai_os/.claude/skills/maker/tools/tick.mjs --stamp-6c-green` then `--push-gate` → green. Do NOT commit qa/.6c-green. Do NOT push.
Report close-out sha, int HEAD sha, per-package counts, push-gate line, scratch left.
