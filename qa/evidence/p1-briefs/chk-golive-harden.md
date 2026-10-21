# Brief: You are /checker running a Mode A feature check. Read your full protocol first: C:/Users/Lenovo/.claude/skills/checker/SKILL.md
Check with NO other context (no builder reasoning):
  Criteria: C1 and C2 of qa/evidence/p1-briefs/golive-harden.md (C1 nginx: only `location = /v1/public/chat/turns` is proxied, with X-Real-IP $remote_addr, proxy_read_timeout 120s and `limit_req zone=vcchat burst=10 nodelay`; every other /v1/ path returns 404; the README documents the `limit_req_zone`. C2 main.ts startup errors redact `mongodb(+srv)?://...@` credentials and token runs, proven by a test that spawns the real entrypoint with a SENTINELPW URI).
  Manifest: D:/vc/.worktrees/golive-harden/qa/manifests/golive-harden.md
  Project: D:/vc/.worktrees/golive-harden (bound)
  Verdict path: D:/vc/.worktrees/golive-harden/qa/verdicts/golive-harden.md
  Checkpoint: D:/vc/.worktrees/golive-harden/qa/checkpoints/golive-harden.md
  Tier: L (public exposure config, secret leakage). Policy: proportional-verification/2026-10-19.17. Budget: wall 45 min, agent-minutes 135. Dual check: no (small hardening of an already-checked launcher; 1 checker).
  Base: e4ca7b0. Integration branch: main. Cycle: 0.
Focus:
- Can any public request other than POST /v1/public/chat/turns reach the API? Look for nginx location precedence traps (prefix vs exact vs regex; a trailing slash; a query string; an encoded path such as /v1/public/chat/turns%2F..).
- Is X-Real-IP still overwritten from $remote_addr?
- Is the static `/` location intact?
- Does limit_req_status 429 match what apps/student/app.js expects for a retry?
- Is the redaction regex correct on hostile variants: a password containing '@' or ':', mongodb+srv, several URIs in one message? Can it over-redact into an unreadable error?
- Does the spawn test really exercise main() and not a copy?
- Is the README's limit_req_zone placed in the http context?
- The builder's nginxcheck.mjs is the builder's own evidence: read the conf yourself; do not trust the script.
Run the manifest's test commands yourself: apps/api tests/main.test.ts and `pnpm -C apps/api typecheck`. If node_modules are missing, run `pnpm install --offline --frozen-lockfile` in the worktree first. Do not run a full suite; the 6c check covers it. Do one falsification per criterion, in a copy outside the worktree. Use the shared test lock (vc-testlock.sh); long waits are normal. Kill only PIDs you start, never by image name, and never PID 36944. No pushes.
Write the verdict (Cycle checked: 0, Metrics line) and commit it on wave/golive-harden with a narrow pathspec. Return the verdict word plus at most 12 lines.
