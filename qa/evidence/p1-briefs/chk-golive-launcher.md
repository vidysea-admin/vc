# Brief: You are /checker running a Mode A feature check. Read your full protocol first: C:/Users/Lenovo/.claude/skills/checker/SKILL.md
Check with NO other context (no builder reasoning):
  Criteria: the "Build" and "Tests" bullets of qa/evidence/p1-briefs/golive-launcher.md (C1 KB mapping extracted once and reused by the MCP handler, no duplicate logic; C2 main.ts launcher: anonymous needs KB URL+anon key, clientKey from X-Real-IP only, speakers default empty, chat refused when config missing, SIGTERM stop; C3 start script + .env.example placeholders, no secrets; C4 infra/ubuntu systemd + nginx conf correct: /v1/ proxied to 127.0.0.1:8080 with X-Real-IP $remote_addr, / static apps/student).
  Manifest: D:/vc/.worktrees/golive-launcher/qa/manifests/golive-launcher.md
  Project: D:/vc/.worktrees/golive-launcher (bound)
  Verdict path: D:/vc/.worktrees/golive-launcher/qa/verdicts/golive-launcher.md
  Checkpoint: D:/vc/.worktrees/golive-launcher/qa/checkpoints/golive-launcher.md
  Tier: L (process entrypoint, config/flags, rate-limit identity, lockfile change). Policy: proportional-verification/2026-10-19.17. Budget: wall 45 min, agent-minutes 135.
  Base: 5305e82. Integration branch: main. Cycle: 0.
Focus: rate-limit bypass (can a client spoof X-Real-IP through nginx? the nginx conf must set it from $remote_addr, overwriting the client value); secret leakage (no key logged/echoed in errors); the MCP search_kb/get_session behaviour unchanged after extraction (speaker-label drop for whatsapp/unknown, source-kind gating); the added insufficient_coverage=false field — is it correct per the serve rule or does it make an uncovered answer look served? (read packages/engine isServedAsk and the KB serve rule, judge correctness, not just the test); fail-closed boot when config missing; nginx conf syntax sanity (nginx -t if nginx is available, else careful read).
Run the manifest's test commands yourself (touched test files + `pnpm -r typecheck`); no full suite (6c covers the lockfile change). One falsification per criterion in a copy outside the worktree. Uses the shared test lock (vc-testlock.sh); long waits are normal. Kill only PIDs you start; never by image name; never PID 36944. No pushes, no network deploys.
Write the verdict (Cycle checked: 0, Metrics line), commit it on wave/golive-launcher with a narrow pathspec. Return the verdict word + <=12 lines.
