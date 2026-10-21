# Verdict - golive-harden (checker, Mode A, cycle 0)
Cycle checked: 0
Date: 2026-10-21T16:21:36+05:30
Bound to: D:/vc/.worktrees/golive-harden (branch wave/golive-harden, checked state b589c11 = code 08b249b + manifest; base e4ca7b0)
Policy-Version: proportional-verification/2026-10-19.17

## Check plan (step 0)
Diff: nginx-vc.conf, README step 7, apps/api/src/main.ts (describeStartupError), tests/main.test.ts (+2), evidence script. Checks: conf read line by line (nginx binary absent, Docker daemon down, no root nginx in WSL Ubuntu: no `nginx -t`), nginx location-precedence reasoning, manifest test commands re-run, hostile redaction probe, one falsification per criterion in a copy outside the worktree. No full suite (6c covers it).

VERDICT: PASS
SCOREBOARD: 2/2 criteria met (C1, C2)
TIER: L (config; error-message redaction)
FAILURES: none

## Criterion evidence (I ran every command; builder output not trusted)
- C1 (read of infra/ubuntu/nginx-vc.conf, not the builder script): the only live proxy location is `location = /v1/public/chat/turns` with `limit_req zone=vcchat burst=10 nodelay`, `limit_req_status 429`, `proxy_pass http://127.0.0.1:8080`, `proxy_set_header X-Real-IP $remote_addr` (SET, overwrites any client value), `proxy_read_timeout 120s`. `location /v1/ { return 404; }` follows; `location /` keeps `try_files $uri $uri/ /index.html`, `root`, `index` untouched. The student regex block is fully commented and equals chat.ts:296 CHAT_PREFIX. Precedence: exact `=` wins only on the normalised path without query; `/v1/public/chat/turns/` (trailing slash), `//..`, dot-segments and `%2F` forms normalise to a non-exact path, so they fall to `/v1/` 404; `/V1/...` is case-sensitive, so it falls to the static `/` (SPA fallback, never the API). A path that normalises to the exact route reaches only the chat route (proxy_pass without URI forwards the raw URI, and no other route string can normalise to it). If the commented regex block is later opened, a regex location beats the plain `/v1/` prefix, so it works as documented. Spoof check: no `$http_x_real_ip` or `$proxy_add_x_forwarded_for` anywhere. 429 matches apps/student/app.js:39 (`res.status === 429`, non-JSON body tolerated by the try/catch; nginx sends no Retry-After, so the UI falls back to "a minute"). README step 7: `limit_req_zone $binary_remote_addr zone=vcchat:10m rate=20r/m;` is written to /etc/nginx/conf.d/vc-limit.conf (http context; single-quoted echo so the shell does not expand it), and the conf header references it. Re-ran `node qa/evidence/golive-harden/nginxcheck.mjs` -> exit 0, "PASS nginx static check (3 live locations)". NOT run: `nginx -t`, live nginx requests.
- C2: `bash D:/vc/scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test tests/main.test.ts` -> exit 0, 10 pass / 0 fail / 0 skipped (incl. both "e:" tests). `pnpm -C apps/api typecheck` -> exit 0. The spawn test runs `node --import tsx src/main.ts` (process.argv[1] === main.ts, so the real main() runs via the entrypoint guard at main.ts:186, not a copy) with VC_LLM_PROVIDER=`mongodb+srv://user:SENTINELPW@host`; main.ts:167 prints `describeStartupError(err)`. Hostile probe of the exported function (copy): password with `@` and `:` -> `mongodb://***@host:27017/db?a=1`; mongodb+srv; two URIs in one message -> both redacted, text between kept; comma-joined URIs without a slash; percent-encoded password; `sk-...`, `token_...`, `key...` runs -> `[redacted]`; URI without credentials plus a later e-mail address -> unchanged (no over-redaction). A LauncherConfigError message passes through unchanged. No source string in apps/api/src matches SECRET_RUN, so no real startup message is over-redacted.

## CAPABILITY-COVERAGE: 2/2 criteria falsified in a copy outside the worktree (floor met)
F-C2: main() printing the raw `err.message` -> main.test.ts 1 red of 10 (the real-entrypoint test; actual output shows `...(got "mongodb+srv://user:SENTINELPW@host")`), green 10/0 before. F-C1: `location =` changed to a prefix location -> nginxcheck exit 1 (5 findings); deleting `limit_req` -> exit 1. The worktree stayed clean (git status empty). Copy and probe files: scratchpad, not committed.
LIVE-BROWSER: not-applicable (no UI paths changed)
ISSUES-WRITTEN: none (a worktree-bound checker does not touch qa/issues.jsonl; the maker files the low rows below)
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)

## Low observations (non-blocking, not FAILs)
- L1 MONGO_USERINFO stops at the first "/" or whitespace before the "@", so a URI whose password holds a raw "/" or whitespace (invalid per the Mongo URI spec, which requires percent-encoding) is NOT redacted: `mongodb://u:pa/ss-SENTINELPW@host/db` is printed in full. No startup path found that echoes such a value (the driver rejects it before echoing); it is not the confirmed leak path. Cheap hardening: also redact `//[^@\s]*@` after the scheme, or redact to the last "@" before whitespace.
- L2 SECRET_RUN is `\b`-anchored and case-sensitive, so `apikeyAAAA...` and `KEY...` are not redacted (disclosed by the builder).
- L3 `nginx -t` and a live request test were not possible on this host; the conf is verified by reading. Run `sudo nginx -t` and `curl -i -X POST https://<host>/v1/students/x/chat` (expect 404) at deploy, per README step 8.
- L4 Wording: the manifest says the Mongo regex is "stricter than the brief's"; it is looser about "@" (greedy) but narrower on "/" and whitespace, see L1.

EXPLANATION: C1 is met by the conf as written (one exact-match proxy location, header overwritten, timeout and limit_req present, everything else under /v1/ answers 404, static root intact, zone documented at http level). C2 is met: the real entrypoint no longer prints a Mongo URI credential, proven by a spawn test that goes red when main() bypasses the redaction. Both falsifications fired the assertions they are named for.
Metrics: start=2026-10-21T16:16:08+05:30 end=2026-10-21T16:21:36+05:30 wall_min=5 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=3 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=328 mutants=0 defects_unit=0 defects_6c=0
