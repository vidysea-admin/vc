# /checker 6c pre-push integration check — main after the vc-admin-control merge
You are /checker. Read your protocol first: C:/Users/Lenovo/.claude/skills/checker/SKILL.md (maker step 6c). Fresh context, read-only toward the code.
- Repo D:/vc, branch main, head 303e5cf (merge f2da185 of wave/vc-admin-control, dual checked-PASS cycle 2). Last pushed: vidysea/main (git log vidysea/main..HEAD lists the batch).
- Policy proportional-verification/2026-10-19.17. This batch holds a security/auth L unit (admin login, JWT typ pin, env-credential binding), so .13-2a applies: run the FULL suite on the merged head, plus the collection check. No -x/--maxfail.
- Tests only through `bash D:/vc/scripts/vc-testlock.sh <cmd>` from each package dir (long lock waits are normal; count them as blocked_min). Also `pnpm -r typecheck` (or tsc --noEmit per package) and `python contracts/verify_contracts.py`.
- A red: compare to qa/checkpoints/baseline-reds.md (same baseline sha + node id + message hash). A new red traced to the batch's changed files is a FAIL; name the test and file.
- Environmental failures (OOM, a full C: drive, a lock timeout) are BLOCKED-PROCESS, never PASS and never a code FAIL.
- Never connect to Pathlynks Postgres, GitHub or any live service. Kill only PIDs you started. Do not edit code.
- On green: run `node D:/ai_os/.claude/skills/maker/tools/tick.mjs --stamp-6c-green` and NEVER commit qa/.6c-green. Write qa/verdicts/vca-6c.md (verdict, per-package counts, commands) and commit only that verdict with a narrow pathspec.
- Return the verdict word first, then per-package counts.
