# p1-u12-go — You are a /maker build subagent: U12 acceptance + trace (build now)
Worktree: D:/vc/.worktrees/p1-u12 (branch p1/u12, based on 1c9fafb = origin/main + U10w head; U10w is in its final check — treat its code as fixed). Work ONLY inside this worktree.
Follow D:/vc/qa/evidence/p1-briefs/p1-u12-build.md exactly (scope, owned files, criteria), with these overrides:
- Start condition is satisfied by this base; build now, do not wait for U10 on main.
- A2a closes as "NOT PROVEN (U3 golden set pending)" per D-097 item 2. REAL criteria (A2b, A4, A8, A10, A14) are out of scope (U13b).
- Speed (Umesh 2026-10-19: "stop over engineering, make it live"): reuse existing tests as evidence in the trace matrix wherever they already prove a criterion; write a new acceptance test ONLY for a MOCK criterion with no existing proof. No duplicate tests.
- Tests only via `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh ...` (long lock waits are normal, keep waiting), TMP/TEMP under D:/vc/.worktrees/. Run only the new acceptance-*.test.ts files plus each criterion's cited test once; no full suite.
- Owned files only (acceptance-*.test.ts, qa/evidence/p1-u12/**, qa/manifests/p1-u12-acceptance.md). Never edit product code; a criterion that fails on product code → record it as FAIL-FOUND in trace.md with file:line and stop that row (do not fix).
- Manifest: Policy-Version proportional-verification/2026-10-18.15, Tier M, Dual check: no, Pre-check[<id>] lines, Tests[<id>] lines, Round line, Metrics line, Status: ready-for-check.
- Commit with narrow pathspecs, trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. No push/merge. Do not edit .claude/**, qa/contracts, qa/verdicts.
Return ONE line: `p1-u12-acceptance <sha> ready` (or `blocked <reason>`), detail on disk.
