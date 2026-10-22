# Checkpoint: pc-hardening-4 cycle 0, single checker

Worktree D:/vc/.worktrees/pc-hardening-4, branch wave/pc-hardening-4, head 6af94cc (code 4915760), base bf48a51. Policy-Version: proportional-verification/2026-10-19.17. Tier L. Cycle checked: 0. Written 2026-10-22T19:02:47+05:30 (read from date -Iseconds).

## Executed
- Regression list in the worktree (apps/api, vc-testlock, one background script): see Metrics in qa/verdicts/pc-hardening-4.md. All green except chat.test.ts "A20 flag on but gate closed" (also red on base).
- Own P1 probe (scratchpad check-pch4/zz-probe.ts, run in git-archive copies of 4915760 and bf48a51 with node_modules linked to the worktree): assertChatGoLive allow/refuse over 6 gate sets (real repo qa/gates, good temp, signer other, B13 pending, no g-prod, no records) x 7 passed-env shapes x 5 process.env values: 210 rows each side. Equivalent-config rows 78, differing 0; divergent-config rows 132, differing 42 (the intended change).
- Falsification copy scratchpad check-pch4/head (git archive of 4915760): 10 mutants, 10 red, restored and cmp-equal to the worktree files.

## Not run
No full suite, no live LLM, no real Mongo, no nginx, no python.
