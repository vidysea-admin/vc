# /checker — U12 repair check (fix cycle 1) + on PASS: close-out, merge, 6c, stamp (do NOT push)

Policy-Version: as pinned in qa/manifests/p1-u12-acceptance.md. One checker (U12 is test/qa-only; no dual trigger).
Worktree D:/vc/.worktrees/p1-u12, branch p1/u12, head c86ad3a (repair b67423a). Cycle-0 verdict 8b3f52f FAIL (qa/verdicts/p1-u12-acceptance.md).

## Part 1 — repair check (Cycle checked: 1)
- Confirm `git -C D:/vc/.worktrees/p1-u12 diff 626214d --stat -- apps packages mcp scripts` lists only apps/api/tests/acceptance-student-journey.test.ts and apps/api/tests/acceptance-trace.test.ts.
- Independently verify the failed criterion (A11b/A23, journey test 2): 35 same-thread crisis turns → 35x 200 + 14416 text, model never called, exactly 1 flag; second thread → 2nd flag. Check that this matches product intent in apps/api/src/chat.ts (~581) — one flag per student+thread+window.
- Reuse maker evidence only if identity matches; otherwise run (tests only via `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh ...`, TMP/TEMP on D:; long lock waits are normal):
  `pnpm -C apps/api exec tsx --test tests/acceptance-*.test.ts` → 7/0.
- 1 falsification of your own in a copy (never the bound tree), e.g. drop the "model never called" or flag assertion → red. Maker record: qa/evidence/p1-u12/check/fals-repair1.txt.
- Confirm trace rows A16/A17 PASS and A11b/A23 cite the repaired test. ISS-238/239/240 stay low wording rows (not a FAIL).
- Append to qa/verdicts/p1-u12-acceptance.md a cycle-1 section with `Cycle checked: 1` and PASS/FAIL. Commit (narrow pathspec). If FAIL: stop and report.

## Part 2 — on PASS only: close-out + integrate + 6c
- Flip ISS-237 to fixed (append row per ledger convention). Flip manifest to `Status: checked-PASS` citing both verdict commits. Commit "qa: p1-u12-acceptance close-out (PASS)".
- `git -C D:/vc worktree add D:/vc/.worktrees/int-u12 -b int/u12 main` (local main, currently 91f6e40, includes U10s push f56e751). `git merge --no-ff p1/u12`. Resolve qa/issues.jsonl / QUEUE.md conflicts by keeping both sides' rows (append-only). Update qa/QUEUE.md: U12 done; ISS-238..240 as low candidates.
- In int-u12: `pnpm install --offline --frozen-lockfile`; `python contracts/verify_contracts.py`; `pnpm -r typecheck` exit 0.
- Behaviour-scoped set (.13-1; U12 is test-only, not tier-L security, so no full suite required): `pnpm -C apps/api test` (whole api package, covers the acceptance files on top of U10s) → 0 fail; plus a collection check that every package's test files load (`pnpm -r --workspace-concurrency=1 test` is acceptable if you prefer, ~2 min). Load-flake rule: a red counts as load-flake only if it passes alone, asserts a deadline/timeout, and its file was not changed by U12 → low ISS row, not a HOLD.
- `node D:/ai_os/.claude/skills/maker/tools/tick.mjs --stamp-6c-green` then `--push-gate` (from int-u12) → must print green. Do NOT commit qa/.6c-green. Do NOT push.
- Report: verdict sha, close-out sha, int-u12 HEAD sha, test counts, push-gate line. Leave any scratch copies in place and list them (do not attempt deletes).
