# Verdict - golive-launcher (checker, Mode A, cycle 0)
Cycle checked: 0
Date: 2026-10-21T16:09:39+05:30
Bound to: D:/vc/.worktrees/golive-launcher (branch wave/golive-launcher, head 942fe00, base 5305e82 = merge-base with main)
Policy-Version: proportional-verification/2026-10-19.17

## Check plan (step 0)
Diff: process entrypoint + config (apps/api/src/main.ts, .env.example, infra/ubuntu/*), shared module extraction (mcp/university-kb source-kind.ts and index.ts), lockfile. No UI, no data artifact, no prompt change, no auth change (the JWT verifiers are still built by startApi). Checks: criterion commands re-run, diff-scope read (4c), one falsification per criterion in copies outside the worktree, secret-leak probe on the real CLI, serve-rule read, nginx read plus a static check (the nginx binary is absent and the Docker daemon is down here, so no nginx -t). Persona walk: skip (no screen). No full suite (the lockfile change is a 6c .13-2(b) trigger).

VERDICT: PASS
SCOREBOARD: 4/4 criteria met (C1-C4), no contract invariants submitted
TIER: L (config/flags, process entrypoint, rate-limit identity, lockfile change; cited main.ts:52, main.ts:103, pnpm-lock.yaml)
full-suite trigger: lockfile change (.13-2 b) for the 6c step.

FAILURES: none

## Criterion evidence (I ran every command; builder output not trusted)
- C1: `pnpm -C mcp/university-kb exec tsx --test tests/student-port.test.ts tests/kb-tools.test.ts tests/source-kind.test.ts tests/kb-client.test.ts tests/index.test.ts` -> 77 pass / 0 fail. Diff read: the search_kb and get_session handlers now call mapSearchHits / mapSessionTurns; the old inline map and the local labelAllowed are gone (no duplicate, nothing else removed). Behaviour unchanged: the unmodified kb-tools, source-kind and index tests are green; the speaker-label drop for whatsapp/unknown and the source-kind tagging are intact. Serve rule judged for correctness, not only tested: applyServeRule returns status "answered" (kb-client.ts:375-382) only when `withheld` is empty, i.e. verdict correct AND insufficientCoverage false AND web_used false AND >=1 internal citation. So stamping insufficient_coverage:false on exactly that branch (source-kind.ts:207) states a fact the rule just proved, and an uncovered answer cannot look served: no_sourced_answer and unavailable never get the field, so isServedAsk rejects them, and web citations are dropped to []. The anonymous port has no askKnowledgeBase or getSession (client.ask is undefined).
- C2: `pnpm -C apps/api exec tsx --test tests/main.test.ts tests/anonymous-route.test.ts tests/index.test.ts` -> 39 pass / 0 fail. Real CLI `pnpm -C apps/api start`: speakers file set but missing -> exit 1 naming VC_SPEAKERS_FILE; short chat JWT secret -> exit 1 naming VC_STUDENT_JWT_HS256_SECRET, value not echoed; anonymous on with the A20 gate pending -> exit 1 GoLiveRefusedError (fails closed); nothing on and Mongo down -> exit 1 MongoServerSelectionError. The anonymous key never falls back to VC_KB_API_KEY (main.ts:103, test a). The SIGTERM/SIGINT handler was read (main.ts, shutdown in main()): idempotent, api.stop() then exit 0/1. NOT executed (Windows host, no node in WSL).
- C3: X-Real-IP is the only source (main.ts:50-56: a single string, isIP-valid, normalised; XFF never read; a comma-joined, repeated or malformed value gives undefined = one shared bucket). Over real HTTP through launch(): 10x200, the 11th 429 with a rotating XFF, a second X-Real-IP has its own bucket (main.test.ts, green). The nginx-vc.conf /v1/ block has `proxy_set_header X-Real-IP $remote_addr;`, which SETS the header and replaces any client value; there is no $http_x_real_ip or $proxy_add_x_forwarded_for, and underscore header variants are dropped by nginx by default. The API binds 127.0.0.1 (main.ts host, index.ts:466). A client cannot spoof the key through the shipped nginx conf.
- C4: package.json start = "tsx src/main.ts" plus the @vc/mcp-university-kb dependency (lock entry matches); the .env.example block is placeholders only (diff scanned for key, secret and credentialed-URL patterns: none); vc-api.service has EnvironmentFile, Restart=on-failure, KillSignal=SIGTERM; nginx conf read for syntax (braces balanced, every directive terminated, /v1/ -> 127.0.0.1:8080 = DEFAULT_API_PORT, / -> root /opt/vc/apps/student with try_files); every API route lives under /v1/. `pnpm -r typecheck` -> exit 0, 0 TS errors, all packages Done.
- Secret leakage: sentinel values in every key and password variable, real CLI, 5 refusal paths: 0 sentinel hits in stdout+stderr (main() prints the error class and message only; KB errors carry baseUrl, never the key).

## CAPABILITY-COVERAGE: 4/4 criteria falsified in copies (floor met) plus 2 extras
F1 C3 main.ts:52 XFF first -> 2 of 8 red (green 8/0 before). F2 C2 main.ts:103 drop the anon key from the required list -> 1 of 8 red (green 8/0 before). F3 C1 source-kind.ts:207 drop insufficient_coverage:false -> the student-port serve-rule test red (green 5/0 before). F5 C4 nginx X-Real-IP -> $http_x_real_ip -> static check qa/evidence/chk-golive-launcher/nginxcheck.mjs green->red. Extras: F4 labelAllowed always true -> 3 of 52 red; nginx proxy_pass port changed -> red. Each fired the assertion the check is named for. Detail: qa/evidence/chk-golive-launcher/falsification-and-probes.md. The bound tree was clean afterwards.
LIVE-BROWSER: not-applicable (no UI paths changed)
ISSUES-WRITTEN: none (the low observations below are for the maker to file at reconcile; a checker bound to a worktree branch does not touch qa/issues.jsonl)
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)

## Low observations (non-blocking, not FAILs)
- L1 nginx proxies ALL of /v1/ (counsellor and student routes too) to the public internet; they are JWT-gated, but the public surface is wider than the anonymous route. Consider narrowing at deploy.
- L2 The launcher passes no source-kind config, so every non-WhatsApp source is "unknown" (restricted, non-quotable): fail closed; seminar/TOC quoting needs a follow-up (the maker's own open risk).
- L3 Not proven here: a real SIGTERM, a successful CLI boot against real Mongo, nginx -t, and the systemd PATH for pnpm under /usr/bin/env. The deploy-time smoke (README step 8) covers them.
- L4 A comment in main.ts says a repeated X-Real-IP is an array; Node comma-joins unknown headers into one string. The result is identical (not an IP -> undefined). Wording only.

EXPLANATION: All four criteria are evidenced by my own runs and reads. The extracted mapping is single-sourced and the MCP behaviour is unchanged; the added insufficient_coverage:false is exactly what the serve rule proves for an answered result. The rate-limit key cannot be spoofed through the shipped nginx conf, boot refuses without config or a passed gate, and no secret reached any output.
Metrics: start=2026-10-21T16:01:46+05:30 end=2026-10-21T16:09:39+05:30 wall_min=8 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=6 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=unavailable mutants=2 defects_unit=0 defects_6c=0
