# Manifest — golive-launcher
**Contract:** gate answers in qa/gates/golive-launch.md (Q1 yes create apps/api/src/main.ts, Q2 own student UI, Q3 nginx proxy with clientKey from the proxy header, Q4 KB keys in server .env, Q5 speakers from the KnowledgeBase team empty until then, Q7 Ubuntu), g-prod option c (voice off), D-108 (DeepSeek first, chain cap 50). Source brief qa/evidence/p1-briefs/golive-launcher.md. Not an edit to qa/contracts.
**Criteria:**
- C1 The KnowledgeBase -> student-graph mapping lives in ONE place (mcp/university-kb/src/source-kind.ts: mapSearchHits, mapSessionTurns, createStudentKbPort). The MCP search_kb / get_session handlers (index.ts) call it, and createStudentKbPort(client) returns a StudentKbPort: searchKb always, askKnowledgeBase only when the client can ask (serve rule applied; a served answer carries insufficient_coverage:false so the engine's isServedAsk accepts it), getSession only when the client can read a session. The anonymous client therefore yields a structurally search-only port.
- C2 apps/api/src/main.ts (approved new file) builds startApi's http options from the environment (buildLauncherConfig, pure): loopback host, VC_API_PORT through startApi; anonymous only when VC_ANONYMOUS_ENABLED=true, with the search-only key VC_KB_ANON_API_KEY (never falling back to VC_KB_API_KEY); chat only when VC_CHAT_ENABLED=true AND VC_KB_BASE_URL, VC_KB_API_KEY and the VC_STUDENT_JWT_* config exist; otherwise LauncherConfigError naming the missing variable (never a value). Speakers from VC_SPEAKERS_FILE (SpeakersFileSchema) else an empty list; a set but unreadable/invalid file refuses.
- C3 The per-client rate-limit key is the X-Real-IP header only (well-formed IP, IPv4-mapped normalised); X-Forwarded-For is never read; a repeated or malformed X-Real-IP gives no key (one shared bucket, stricter). Over real HTTP through launch(), 11 requests from one X-Real-IP with a rotating X-Forwarded-For hit 429 on the 11th and a second X-Real-IP has its own bucket.
- C4 Deployment files: apps/api package.json "start": "tsx src/main.ts" (+ workspace deps), SIGTERM/SIGINT run api.stop(), .env.example launch block (placeholders only), infra/ubuntu/{vc-api.service,nginx-vc.conf,README.md} (8 install steps). Boot smoke: launch() on a free port with a fake Mongo client, mock provider and a gates fixture answers POST /v1/public/chat/turns with 200 and stops cleanly.
**Goal task:** none
**Date:** 2026-10-21
**Status:** ready-for-check
**Fix cycle:** 0
**Policy-Version:** proportional-verification/2026-10-19.17
**Tier:** L (config/flags and the process entrypoint; no auth change: the JWT verifiers are still built by startApi)
**Dual check:** no (no new auth, tenancy or production-write path; the process binds 127.0.0.1 and writes nothing new)
**Persona walk:** skip (no human screen)
**Executor:** claude-sonnet-subagent (maker/builder golive-launcher)
**Executor rationale:** one coherent launcher unit plus its shared mapping extraction; small.

## What changed
Branch wave/golive-launcher from main 5305e82. Code commit f291475; this manifest is a later commit.
- mcp/university-kb/src/source-kind.ts (in place): + labelAllowed, mapSearchHits, mapSessionTurns, StudentKbPortClient, createStudentKbPort. mcp/university-kb/src/index.ts (in place): the search_kb and get_session handlers call mapSearchHits / mapSessionTurns (the inline mapping at old index.ts:250-320 is removed, no duplicate); re-exports createStudentKbPort and the KB client factories for the launcher. mcp/university-kb/package.json: + @vc/engine (type and isServedAsk import); pnpm-lock.yaml updated offline.
- apps/api/src/main.ts (new, approved Q1), apps/api/package.json (+ start script, + @vc/mcp-university-kb), apps/api/src/index.ts (two stale doc comments only: "does not depend on mcp/university-kb").
- .env.example (launch block appended), infra/ubuntu/ (3 files, new).
- Tests (new): apps/api/tests/main.test.ts (8), mcp/university-kb/tests/student-port.test.ts (5).
- Not touched: .claude/**, qa/contracts, docs/DECISIONS.md, ARCHITECTURE.md, TASKS.md, qa/QUEUE.md, HANDOFF.md, the D:/vc main tree.

## Verification scope
Round: est 30 min; touched files only (no full suite): apps/api main + anonymous-route + index tests, mcp/university-kb tests, `pnpm -r typecheck`.
Affected tests / full-suite trigger: none (no shared engine/db source changed).
Base / checked state: wave/golive-launcher at f291475.
Tests[C1]: mcp/university-kb/tests/student-port.test.ts "port.searchKb returns exactly the hits the MCP search_kb tool returns", "an anonymous port is structurally search-only", "port.askKnowledgeBase applies the serve rule ... isServedAsk", "port.getSession gates labels", "an unreachable KB is status unavailable"; the existing kb-tools/source-kind/kb-client/index tests (search_kb, get_session, label gating) pass unchanged. — the same fixtures drive the MCP tool and the port and the results are deepEqual
Tests[C2]: apps/api/tests/main.test.ts a: "VC_ANONYMOUS_ENABLED=true without the KB URL or the search-only key refuses ...", "with both flags off ..."; c: "speakers default to an empty list ...", "a speakers file that is set but unreadable or invalid refuses"; d: "VC_CHAT_ENABLED=true refuses to start when its config is missing ...", "chat config present but the flag unset serves no chat". — each missing variable is asserted by name
Tests[C3]: apps/api/tests/main.test.ts b: "the client key is X-Real-IP; X-Forwarded-For (any entry) is ignored", "over real HTTP through launch(), the limiter keys on X-Real-IP ...". — the HTTP test fails if the key source is XFF (falsifier F1)
Tests[C4]: none as a unit test for the infra files (text); the boot smoke and the CLI refusals below are the evidence; pnpm -r typecheck covers the start script's import graph.
Pre-check[C1]: f291475 VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh pnpm -C mcp/university-kb exec tsx --test tests/student-port.test.ts tests/kb-tools.test.ts tests/source-kind.test.ts tests/kb-client.test.ts tests/index.test.ts -> exit 0, 77 passed, 0 failed, 0 skipped
Pre-check[C2]: f291475 VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test tests/main.test.ts tests/anonymous-route.test.ts tests/index.test.ts -> exit 0, 39 passed, 0 failed, 0 skipped
Pre-check[C3]: f291475 same command as Pre-check[C2] -> exit 0, 39 passed, 0 failed, 0 skipped
Pre-check[C4]: f291475 VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh pnpm -r typecheck -> exit 0 (all packages Done)
Boot smoke (C4): a throwaway script (apps/api/smoke.tmp.mts, deleted afterwards) calling launch(env, {clientFactory: fake Mongo, http: {port: 0, mock provider, anonymous.gatesDir: gates fixture}}) with VC_ANONYMOUS_ENABLED=true, VC_KB_BASE_URL=http://127.0.0.1:1 (unreachable), X-Real-IP 203.0.113.9: "listening port 58264"; POST /v1/public/chat/turns -> 200 {"state":"no_sourced_answer","message":"I don't have a sourced answer for this yet. If things feel heavy, Tele-MANAS on 14416 ...","claims":[],"sources":[]}; api.stop() -> "stopped". CLI refusals (`pnpm -C apps/api start`, exit 1): VC_ANONYMOUS_ENABLED=true alone -> "LauncherConfigError: VC_ANONYMOUS_ENABLED is enabled but VC_KB_BASE_URL is not set"; with the URL -> "... VC_KB_ANON_API_KEY is not set"; VC_CHAT_ENABLED=true with KB keys -> "... VC_STUDENT_JWT_ISSUER is not set". NOT proven: the real CLI boot against a real Mongo and a real SIGTERM (no Mongo reachable, no network by rule).
mutant-cap-raise: 6 falsifiers, one per independent rule, 0 survivors
Metrics: start=2026-10-21T15:44:28+05:30 end=2026-10-21T16:00:30+05:30 builder_min=unavailable wall_min=unavailable agent_min=unavailable blocked_min=unavailable suite_runs=0 repeat_runs=1 mutations=6 survivors_final=0 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 lane=normal check_s=unavailable mutants=6 defects_unit=0 defects_6c=0

## Capability coverage (one falsifying edit per rule, applied in this worktree and reverted with git checkout; tree clean afterwards)
| id | crit | falsifying edit | result |
|---|---|---|---|
| F1 | C3 | clientKeyFromRequest reads x-forwarded-for first | main.test.ts 2 fail of 8 |
| F2 | C2 | drop VC_KB_ANON_API_KEY from the anonymous required list | 1 fail of 8 |
| F3 | C1 | drop insufficient_coverage:false on a served ask | student-port + kb-tools 1 fail of 38 |
| F4 | C2 | invalid speakers file returns an empty list instead of refusing | 1 fail of 8 |
| F5 | C1 | labelAllowed always true (WhatsApp/unknown labels pass) | 3 fail of 38 |
| F6 | C2 | drop VC_KB_API_KEY from the chat required list | 1 fail of 8 |

## Open risks for the checker
- The launcher loads no source-kinds file: with the empty SourceKindConfig only WhatsApp is distinguished, so every non-WhatsApp source is "unknown" (restricted, non-quotable, fail closed). Seminar/TOC quoting needs a config path (follow-up, not in this brief).
- The anonymous route still needs the A20 go-live gate to pass in qa/gates, and startApi still requires the counsellor VC_JWT_* config and MONGODB_URL; the README lists them.
- X-Real-IP is trustworthy only because the API binds 127.0.0.1 behind nginx, which overwrites it (nginx-vc.conf).
- Voice stays off: VC_VOICE_ENABLED=true makes startApi refuse (no Live provider supplied), unchanged.
