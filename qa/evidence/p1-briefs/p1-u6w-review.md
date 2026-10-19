# Senior review (read-only): U6w, wiring U6b profile ranking into apps/api/src/chat.ts
Worktree D:/vc/.worktrees/p1-u6w, diff `git -C D:/vc/.worktrees/p1-u6w diff 7d2840e..fe47e01`. Manifest qa/manifests/p1-u6w-rank-wiring.md, brief D:/vc/qa/evidence/p1-briefs/p1-u6w-build.md. Students are often minors. Tenancy fails closed, no raw PII in logs, and a number the system cannot prove is never shown as fact (D-097 item 3).
Judge:
- rankFactFromStored (l.189): is the mapping the ONLY place, and does profileView keep its exact old output?
- withRanking (l.508/683): tenant scoping of both the fact reads, the Pathlynks reads; error isolation; log content; the trigger on selectedTool === "rank_options".
- NOT PROVEN labelling: is any path left where a number escapes without the label (sources, rankingProfile, streamed text)?
- Ranked claims bypass the claims.ts guard: is that a real gap?
- optionIds is required with no default: is that safe?
- Is any existing test weakened?
Run tests only via `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh`. Never edit the worktree. Probes go in your own dir under D:/vc/.worktrees/ (C: is full). Return Approve / Warning / Block with file:line evidence.
