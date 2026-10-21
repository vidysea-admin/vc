
# Manifest — golive-harden
**Contract:** brief qa/evidence/p1-briefs/golive-harden.md (two pre-launch fixes from the golive-launcher review). Not an edit to qa/contracts.
**Criteria:**
- C1 infra/ubuntu/nginx-vc.conf proxies ONLY `location = /v1/public/chat/turns` (same proxy headers incl. `proxy_set_header X-Real-IP $remote_addr`, `proxy_read_timeout 120s`, `limit_req zone=vcchat burst=10 nodelay`); `location /v1/ { return 404; }`; a commented student-chat block (`^/v1/students/[^/]+/chat(/|$)`, matching chat.ts CHAT_PREFIX) to open only when VC_CHAT_ENABLED=true; the http-level `limit_req_zone $binary_remote_addr zone=vcchat:10m rate=20r/m;` is documented in infra/ubuntu/README.md step 7 (conf.d/vc-limit.conf) and referenced in the conf header.
- C2 apps/api/src/main.ts: the startup-failure line is built by the new exported `describeStartupError` (error name + message; `mongodb(+srv)?://...@` userinfo redacted to `mongodb://***@`, `\b(sk|key|token)[-_A-Za-z0-9]{16,}` runs redacted to `[redacted]`; a LauncherConfigError/GoLiveRefusedError message passes through unchanged because it contains none of those). main() calls it (main.ts:~167). The Mongo regex is stricter than the brief's (`[^\s/]*@`, greedy to the last "@" before "/"), so a raw "@" in a password cannot end the match early.
**Goal task:** none
**Date:** 2026-10-21
**Status:** ready-for-check
**Fix cycle:** 0
**Policy-Version:** proportional-verification/2026-10-19.17
**Tier:** L (config + error-message redaction; no auth change)
**Dual check:** no
**Persona walk:** skip (no human screen)
**Executor:** claude-sonnet-subagent (maker/builder golive-harden)
**Executor rationale:** two small edits and one test.

## What changed
Branch wave/golive-harden from main e4ca7b0. Code commit 08b249b; this manifest is a later commit.
- infra/ubuntu/nginx-vc.conf, infra/ubuntu/README.md (step 7), apps/api/src/main.ts (describeStartupError + main() uses it), apps/api/tests/main.test.ts (+2 tests, section e), qa/evidence/golive-harden/nginxcheck.mjs (new, evidence only; the repo had no nginx static-check script).
- Not touched: .claude/**, qa/contracts, docs/DECISIONS.md, ARCHITECTURE.md, TASKS.md, qa/QUEUE.md, HANDOFF.md, the D:/vc main tree.

## Verification scope
Round: est 15 min; touched files only: apps/api/tests/main.test.ts, `pnpm -C apps/api typecheck`, the nginx static check.
Base / checked state: wave/golive-harden at 08b249b.
Tests[C1]: no unit test (text config; nginx is not installed on this Windows host, so `nginx -t` was NOT run). qa/evidence/golive-harden/nginxcheck.mjs asserts the live (non-comment) locations: exact chat route with proxy_pass/X-Real-IP/120s/limit_req, `/v1/` is a bare 404, no other proxying location, commented student block present. Run on the old conf it FAILS (9 findings); with `limit_req` deleted it FAILS.
Tests[C2]: apps/api/tests/main.test.ts e: "describeStartupError redacts Mongo URI credentials and credential-shaped runs, and leaves a config error unchanged" (sentinel `mongodb+srv://user:SENTINELPW@host`, raw "@" in password, upper-case scheme, second URI, secret runs, name field), and "the real entrypoint prints no credential when a non-config startup error echoes a Mongo URI" (spawns `node --import tsx src/main.ts` with VC_LLM_PROVIDER=`mongodb+srv://user:SENTINELPW@host`, whose loadProviderConfig error echoes the value: exit 1, output has `mongodb://***@host`, no SENTINELPW).
Pre-check[C1]: 08b249b node qa/evidence/golive-harden/nginxcheck.mjs -> exit 0, "PASS nginx static check (3 live locations)"
Pre-check[C2]: 08b249b VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test tests/main.test.ts -> exit 0, 10 passed, 0 failed, 0 skipped (8 pre-existing + 2 new)
Pre-check[typecheck]: 08b249b VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh pnpm -C apps/api typecheck -> exit 0
Before the fix (observed first): the real entrypoint printed `vc-api failed to start: Error: loadProviderConfig: VC_LLM_PROVIDER must be ... (got "mongodb+srv://user:SENTINELPW@host")`, i.e. the leak was real.
Round: est 15 min; 2 files + 1 test (+1 evidence script), 2 criteria.
Metrics: start=2026-10-21T16:10:39+05:30 end=2026-10-21T16:15:30+05:30 builder_min=unavailable wall_min=unavailable agent_min=unavailable blocked_min=unavailable suite_runs=0 repeat_runs=2 mutations=3 survivors_final=0 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 lane=normal check_s=unavailable mutants=3 defects_unit=0 defects_6c=0

## Capability coverage (one falsifying edit per criterion, applied in this worktree and reverted with git checkout; tree clean afterwards)
| id | crit | falsifying edit | result |
|---|---|---|---|
| F1 | C1 | nginx-vc.conf with `limit_req zone=vcchat ...` deleted (copy) | nginxcheck.mjs exit 1 "chat location lacks limit_req"; the pre-change conf fails with 9 findings |
| F2a | C2 | main() prints the raw `err.message` instead of describeStartupError | main.test.ts 1 fail of 10 (the real-entrypoint test) |
| F2b | C2 | describeStartupError without the MONGO_USERINFO replace | main.test.ts 2 fail of 10 (both e tests) |

## Open risks for the checker
- `nginx -t` was not run (no nginx on this host); the conf is checked statically. `limit_req_zone` lives at http level: README step 7 puts it in /etc/nginx/conf.d/vc-limit.conf (included inside `http {}` on stock Ubuntu nginx). The conf's `limit_req_status 429` is an addition to the brief (default is 503).
- SECRET_RUN is case-sensitive and `\b`-anchored as briefed, so `apikey...` without a word boundary before "key" is not redacted; the Mongo URI case, the confirmed leak path, is covered.
- Redaction is applied to every startup error, including config errors (a no-op for them, asserted).
