# Senior review (read-only): U6w repair cycle 1, p1-u6w-rank-wiring
- Repo D:/vc/.worktrees/p1-u6w. Review `git -C D:/vc/.worktrees/p1-u6w diff 1dd12d1..cb1ad5b -- apps packages` (apps/api/src/chat.ts withRanking: unverified status on ranked number claims, persistText gate before ranking, redact on stored profileFactsUsed; apps/api/tests/chat-rank.test.ts).
- Context: the cycle-0 review medium was ranked number claims keeping status "attributed" (now "unverified"). D-097 item 3: real per-option numbers are NOT PROVEN; no number presented as fact. U8r privacy redaction must not regress.
- Do not read qa/verdicts or qa/checkpoints. Use `git -C`, never `cd X && cmd`. You may run tests only via `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh ...`; probes in a scratch dir under D:/vc/.worktrees/ only (C: is full).
- Return Approve / Warning / Block with file:line evidence, findings by severity, test gaps, open questions (max 25 lines).
