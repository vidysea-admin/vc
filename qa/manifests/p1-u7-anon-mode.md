# Manifest — p1-u7-anon-mode
**Contract:** none yet for P1 units (checker-owned). Criteria come from the source brief `qa/evidence/p1-briefs/p1-u7-build.md`, plan row U7, and contract `qa/contracts/counselling-engine.md` B24.6 / B24.7 / B21 anonymous-route exception / B2 + D-092. Spec proof ids A15a-c, A20. Resume brief `qa/evidence/p1-briefs/p1-resume-u7.md`.
**Date:** 2026-10-18
**Fix cycle:** 0
**Dual check:** required
dual-trigger: security apps/api/src/anonymous.ts:54 (public unauthenticated route `POST /v1/public/chat/turns`; its in-memory rate limiter is in the same file)
**Persona walk:** skip (API-only, no screen)
**Executor:** claude-sonnet-subagent (maker/builder p1-u7, resumed after a session restart)

Status: checked-PASS
Checked: cycle 0 dual PASS. Checker A qa/verdicts/p1-u7-anon-mode.md (975ccac); checker B qa/verdicts/p1-u7-anon-mode.b.md (ede16bb). Proposed issues minted as ISS-135..ISS-145 in qa/issues.jsonl.

## Criteria
Tags are the ids used on the Pre-check, Tests and Falsify lines below.
- **A15a** — anonymous mode writes nothing but a text-free aggregate counter (date, kind, count); the handler is built with throwing proxies for gap log, flag log, escalation; no Db, checkpointer, outbox or tracer.
- **A15b** — personal or ambiguous question -> `sign_in_required` (rule-based, fails closed; EN, Hinglish, Hindi); in-memory text-free TTL limiter at 10 requests per minute per client; key hashed, never logged or persisted.
- **A15c** — the KB is reached by `search_kb` only (one call, `q` only); never `/ask`, never `get_session`; an outage is the fixed no-answer.
- **A20** — route OFF by default (`VC_ANONYMOUS_ENABLED` exactly `true`) and enabled only when the go-live gate passes; both states tested; `startApi` refuses a bad config before connecting to Mongo.
- **TRACE** — no student text is traced: a LangChain/LangSmith tracing env refuses to build the route.
- **B21** — the closed anonymous-route list is one text route; every other route still 401; no voice route; identity is ignored.
- **VAL / B24.6** — bare 400/413/500 with no input echoed; provider failure is the apology text.
- **B24.7** — crisis gets the fixed message plus Tele-MANAS, before the length check and before the limiter.
- **D092** — an unverified claim is dropped in anonymous mode (B2 / D-092).
- **R1B, R2, R3, R4, R5, RA, RCDEF.api, RCDE.eng, RF.eng** — pre-ready review repairs (senior review 1-5, AI review A-F): counter deadline 750 ms; clientKey or trustSocketAddress required; address normalisation (IPv6 /64, IPv4-mapped); rate-limited sweep; OpenAPI 405/413/500 + helpline; crisis before limiter + helpline on every non-200; no model follow-up, opaque source ids, helpline on anonymous non-answers; email is personal.

## What changed
Code commits `d42335a`, `52d2af5`, test fix `38f32a4` on `p1/u7` (base `p1/u6h` 0e62084). 15 files, all edited in place except one new module.
- `apps/api/src/anonymous.ts` — NEW (461 lines): the anonymous handler, flag, A20 gate wiring, limiter, counter writer. New file because `server.ts`'s handler is JWT+tenant bound by construction and cannot be reused without weakening B21; `server.ts` only gets a small hook (18 lines).
- `apps/api/src/index.ts` — `startApi` flag/gate/clientKey wiring; builds the route before connecting. `apps/api/src/server.ts`, `apps/api/src/openapi.ts` — route-list hook, draft OpenAPI operation.
- `packages/db/src/collections.ts`, `erasure.ts`, `tests/fakes.ts` — the one text-free counter collection.
- `packages/engine/src/student/graph.ts`, `classify.ts`, `guards/index.ts` — anonymous mode: D-092 drop, no follow-up, opaque ids, helpline lines, email is personal. `hasPriorFlag` (REQUIRED dep since U6h): anonymous mode has no store, so the API supplies a stateless reader that always returns false (there is nothing stored to read); documented in `anonymous.ts`.
- Tests edited in place: `apps/api/tests/anonymous-route.test.ts`, `anonymous-zero-persistence.test.ts`, `anonymous-fixtures.ts`; `packages/engine/tests/student-graph.test.ts`, `student-classify.test.ts`.
- No `.claude`, `qa/contracts`, DECISIONS or ARCHITECTURE edit. No network, no real or paid model, no production DB (fake Mongo client and Mock provider only).

## Verification scope
Policy-Version: proportional-verification/2026-10-17.14
Tier: L (public unauthenticated endpoint, rate limit, privacy and crisis safety)
Round: 15 files, 19 criteria, est 25 min — resume close-out only: 6 missing pre-checks, typecheck, narrow reruns of two hung mutants, this manifest
Base / checked state: base 0e62084 (p1/u6h), code 38f32a4, a manifest-and-evidence-only commit on top
Affected tests / full-suite trigger: `apps/api` (the 2 anonymous test files) and `packages/engine` (student-graph, student-classify). Full-suite trigger for the checker: `packages/engine` graph and classify and `packages/db` collections/erasure changed, so run the `@vc/engine`, `@vc/db` and `@vc/api` suites once.
Tests[A15a]: apps/api/tests/anonymous-zero-persistence.test.ts (A15a x5) — 50 real-route turns write only counter increments; throwing proxies for gap/flag/escalation; no checkpointer; counter outage never fails the turn
Tests[A15b]: apps/api/tests/anonymous-zero-persistence.test.ts (A15b x4) — 40+ borderline EN/Hinglish/Hindi cases -> sign_in_required, 10/min limiter with Retry-After, hashed in-memory key, full table fails closed
Tests[A15c]: apps/api/tests/anonymous-zero-persistence.test.ts (A15c x3) — KB sees exactly one search call carrying only q; never /ask or get_session; outage is the fixed no-answer
Tests[A20]: apps/api/tests/anonymous-route.test.ts (A20, startApi, node:http adapter x11) — flag default off, 404 when off, closed real gates refuse, each gate record required, open gate serves, startApi refuses before Mongo connect
Tests[TRACE]: apps/api/tests/anonymous-route.test.ts (no student text is traced) — LangChain/LangSmith tracing env refuses to build the route
Tests[B21]: apps/api/tests/anonymous-route.test.ts (B21 x3) — closed list is one text route equal to the OpenAPI security:[] operations; every other route still 401; identity headers ignored
Tests[VAL]: apps/api/tests/anonymous-zero-persistence.test.ts (validation, errors, provider failure x4) — bare 400/413/500 with no echo; near-limit body scanned in bounded time; provider failure is the apology text
Tests[B24.7]: apps/api/tests/anonymous-zero-persistence.test.ts (crisis x9) — English and Hinglish crisis gets the fixed message plus Tele-MANAS, no model, no KB; crisis beyond 4000 chars; crisis answered at request 11
Tests[D092]: apps/api/tests/anonymous-zero-persistence.test.ts (D-092) — unverified claim dropped in anonymous mode through the real route; only-unverified is the fixed no-answer
Tests[D092.eng]: packages/engine/tests/student-graph.test.ts (R4 (D-092)) — anonymous drops unverified, authenticated flags it, at the graph level
Tests[R1B]: apps/api/tests/anonymous-zero-persistence.test.ts (U7 repair 1 x2) — a counter that never answers delays no reply; default deadline under one second
Tests[R2]: apps/api/tests/anonymous-route.test.ts (U7 repair 2) — flag on without clientKey or trustSocketAddress refuses to start, before connecting
Tests[R3]: apps/api/tests/anonymous-zero-persistence.test.ts (U7 repair 3) — IPv4-mapped IPv6 shares the IPv4 bucket; one IPv6 /64 shares one bucket
Tests[R4]: apps/api/tests/anonymous-zero-persistence.test.ts (U7 repair 4) — O(n) limiter sweep runs at most once a second with a full table
Tests[R5]: apps/api/tests/anonymous-route.test.ts (U7 repair 5) — OpenAPI documents 405, 413, 500 and the helpline field
Tests[RA]: apps/api/tests/anonymous-zero-persistence.test.ts (U7 repair A x2) — crisis before the limiter, static Tele-MANAS helpline on every non-200
Tests[RCDEF.api]: apps/api/tests/anonymous-zero-persistence.test.ts (U7 repair D (API), C/E/F over the route) — no follow-up, opaque source ids, helpline on sign-in/no-answer, email is sign_in_required over the real route
Tests[RCDE.eng]: packages/engine/tests/student-graph.test.ts (U7 repair C, D, E) — no anonymous follow-up, helpline line on anonymous non-answers, opaque ids and no restricted-kind title
Tests[RF.eng]: packages/engine/tests/student-classify.test.ts (U7 repair F) — an email address is personal -> sign_in_required
Pre-check[A15a]: 38f32a4 bash scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test --test-name-pattern="A15a" tests/anonymous-zero-persistence.test.ts -> pass 5 (0 failed) t=14 blobs=apps/api/tests/anonymous-zero-persistence.test.ts:9ffdbeb
Pre-check[A15b]: 38f32a4 bash scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test --test-name-pattern="A15b" tests/anonymous-zero-persistence.test.ts -> pass 4 (0 failed) t=14 blobs=apps/api/tests/anonymous-zero-persistence.test.ts:9ffdbeb
Pre-check[A15c]: 38f32a4 bash scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test --test-name-pattern="A15c" tests/anonymous-zero-persistence.test.ts -> pass 3 (0 failed) t=10 blobs=apps/api/tests/anonymous-zero-persistence.test.ts:9ffdbeb
Pre-check[A20]: 38f32a4 bash scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test --test-name-pattern="A20|startApi|node:http adapter" tests/anonymous-route.test.ts -> pass 11 (0 failed) t=8 blobs=apps/api/tests/anonymous-route.test.ts:31c942e
Pre-check[TRACE]: 38f32a4 bash scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test --test-name-pattern="no student text is traced" tests/anonymous-route.test.ts -> pass 1 (0 failed) t=21 blobs=apps/api/tests/anonymous-route.test.ts:31c942e
Pre-check[B21]: 38f32a4 bash scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test --test-name-pattern="B21" tests/anonymous-route.test.ts -> pass 3 (0 failed) t=33 blobs=apps/api/tests/anonymous-route.test.ts:31c942e
Pre-check[VAL]: 38f32a4 bash scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test --test-name-pattern="validation|errors:|provider failure" tests/anonymous-zero-persistence.test.ts -> pass 4 (0 failed) t=20 blobs=apps/api/tests/anonymous-zero-persistence.test.ts:9ffdbeb
Pre-check[B24.7]: 38f32a4 bash scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test --test-name-pattern="crisis" tests/anonymous-zero-persistence.test.ts -> pass 9 (0 failed) t=8 blobs=apps/api/tests/anonymous-zero-persistence.test.ts:9ffdbeb
Pre-check[D092]: 38f32a4 bash scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test --test-name-pattern="D-092" tests/anonymous-zero-persistence.test.ts -> pass 1 (0 failed) t=6 blobs=apps/api/tests/anonymous-zero-persistence.test.ts:9ffdbeb
Pre-check[D092.eng]: 38f32a4 bash scripts/vc-testlock.sh pnpm -C packages/engine exec tsx --test --test-name-pattern="R4 \(D-092\)" tests/student-graph.test.ts -> pass 1 (0 failed) t=5 blobs=packages/engine/tests/student-graph.test.ts:499c591
Pre-check[R1B]: 38f32a4 bash scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test --test-name-pattern="U7 repair 1" tests/anonymous-zero-persistence.test.ts -> pass 2 (0 failed) t=7 blobs=apps/api/tests/anonymous-zero-persistence.test.ts:9ffdbeb
Pre-check[R2]: 38f32a4 bash scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test --test-name-pattern="U7 repair 2" tests/anonymous-route.test.ts -> pass 1 (0 failed) t=5 blobs=apps/api/tests/anonymous-route.test.ts:31c942e
Pre-check[R3]: 38f32a4 bash scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test --test-name-pattern="U7 repair 3" tests/anonymous-zero-persistence.test.ts -> pass 1 (0 failed) t=7 blobs=apps/api/tests/anonymous-zero-persistence.test.ts:9ffdbeb
Pre-check[R4]: 38f32a4 bash scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test --test-name-pattern="U7 repair 4" tests/anonymous-zero-persistence.test.ts -> pass 1 (0 failed) t=5 blobs=apps/api/tests/anonymous-zero-persistence.test.ts:9ffdbeb
Pre-check[R5]: 38f32a4 bash scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test --test-name-pattern="U7 repair 5" tests/anonymous-route.test.ts -> pass 1 (0 failed) t=17 blobs=apps/api/tests/anonymous-route.test.ts:31c942e
Pre-check[RA]: 38f32a4 bash scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test --test-name-pattern="U7 repair A" tests/anonymous-zero-persistence.test.ts -> pass 2 (0 failed) t=15 blobs=apps/api/tests/anonymous-zero-persistence.test.ts:9ffdbeb
Pre-check[RCDEF.api]: 38f32a4 bash scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test --test-name-pattern="U7 repair D \(API\)|U7 repair C/E/F" tests/anonymous-zero-persistence.test.ts -> pass 2 (0 failed) t=11 blobs=apps/api/tests/anonymous-zero-persistence.test.ts:9ffdbeb
Pre-check[RCDE.eng]: 38f32a4 bash scripts/vc-testlock.sh pnpm -C packages/engine exec tsx --test --test-name-pattern="U7 repair C|U7 repair D|U7 repair E" tests/student-graph.test.ts -> pass 3 (0 failed) t=6 blobs=packages/engine/tests/student-graph.test.ts:499c591
Pre-check[RF.eng]: 38f32a4 bash scripts/vc-testlock.sh pnpm -C packages/engine exec tsx --test --test-name-pattern="U7 repair F" tests/student-classify.test.ts -> pass 1 (0 failed) t=0 blobs=packages/engine/tests/student-classify.test.ts:624cebf
mutant-cap-raise: 19 criteria in one unit (public route, limiter, counter, crisis, claims), 31 single-line mutations = one to two per criterion; each mutation has a named test that kills it, the one survivor is equivalent
Metrics: start=2026-10-17T19:58+05:30 end=2026-10-18T02:15+05:30 suite_runs=0 mutations=31 survivors_final=1 defects_unit=0 cycle=0 policy=proportional-verification/2026-10-17.14 tokens=unavailable

## How to verify (commands + expected)
- Per criterion: the Pre-check lines above (cwd = worktree root, through `scripts/vc-testlock.sh`); each line's `pass N fail 0` is the expected result. Logs `qa/evidence/p1-u7/precheck-<id>.txt`.
- `bash scripts/vc-testlock.sh pnpm -r typecheck` -> exit 0 (`qa/evidence/p1-u7/typecheck-resume.txt`, run on 38f32a4).
- Both affected API test files whole: tests 43 pass 43 fail 0; engine student-graph + student-classify whole: tests 67 pass 67 fail 0 (the baseline of every falsification driver run, e.g. `falsify-baseline-api-green.txt`, `falsify-baseline-eng-green.txt`).
- Disclosure: before the session restart the first builder session recorded package-level runs of the touched packages (`suite-apps-api.txt` tests 124 pass 124; `suite-packages-engine-final.txt` tests 1047 pass 1002 fail 0 skipped 45; `suite-packages-db.txt`; `suites-summary.txt`). They are evidence for the checker's full-suite trigger, not repo-wide suites; this resumed session ran none, and `suite_runs=0` counts repo-wide suites.

## Actual outputs
- Red first (TDD): `qa/evidence/p1-u7/red-run.log` (both anonymous test files fail to load, module absent: pass 0 fail 2); for the repairs `red-repair-api.txt` and `red-repair-engine.txt` (engine: tests 6 pass 4 fail 2).
- Green: `first-run.log`, `second-run.log`, `green-repair-api.txt`, `green-repair-engine.txt`, then the Pre-check logs.

## Capability coverage (one falsification per criterion, in a COPY, never the worktree; green before, red after, restored green)
Copy `p1-u7-fals`; drivers `falsify_u7.py` (main) and `falsify_u7_narrow.py` / `falsify_u7_narrow2.py` (two re-runs). Logs `qa/evidence/p1-u7/falsify-<id>-red.txt`; summaries `falsification-summary-{main,extra1,extra2,extra3,narrow}.txt`. "before" = both test files green (api 43/43, engine 67/67); "restored" = the same files green again (`falsify-restored-api-green.txt`, `falsify-restored-eng-green.txt`).
| Criterion | mutation (file) | after (red) |
|---|---|---|
| A20 default | flag default returns true (`anonymous.ts`) | 2 fail |
| A20 off | route built even when disabled | 1 fail |
| A20 gate | `assertGoLive` removed | narrow rerun on the two gate tests: 2 pass -> 0 pass 2 fail (the full-file run hung 200 s and was killed, so the narrow rerun is the evidence) |
| TRACE | tracing check removed | 1 fail |
| A15a shape | counter upsert carries an extra `client` field | 1 fail |
| A15a proxy | `escalate` proxy replaced by a working function | 1 fail |
| A15b limit | `>=` limit becomes `>` (11 allowed) | 5 fail |
| A15b key | limiter key stored raw, not hashed | 1 fail |
| A15c | `searchKb` also sent a tenant argument | 1 fail |
| B21 list | any `/v1/` path goes to the anonymous handler | 2 fail |
| B21 method | non-POST accepted | 2 fail |
| B21 body | extra body keys accepted | 2 fail |
| B21 413 | oversize body answers 400 | 3 fail |
| VAL | 500 body echoes `err.message` | 1 fail |
| B24.7 | length rejection placed before the crisis scan | 1 fail |
| D092 | unverified claims shown (`graph.ts`) | 1 fail |
| R1B | counter awaited without a deadline | 2 tests cancelled by the 30 s timeout (fail 0, cancelled 2) |
| R2 | clientKey requirement disabled (`index.ts`) | narrow rerun with `--test-force-exit`: 1 pass -> 0 pass 1 fail (the original run hung 200 s: the un-stopped server kept the process alive) |
| R3 | address not normalised | 1 fail |
| R4 | sweep not rate limited | 1 fail |
| R5 | OpenAPI 405 key corrupted (`openapi.ts`) | 1 fail |
| RA | crisis check skipped before the limiter | 1 fail |
| RA helpline | helpline dropped from error bodies | 4 fail |
| RC | follow-up shown in anonymous mode | 1 fail |
| RD | sign-in / no-answer lose the helpline line | 1 fail each |
| RE | opaque ids disabled; restricted title shown | 1 fail each (the title mutant first survived; `38f32a4` made that test non-vacuous and `falsification-summary-extra2.txt` shows it red) |
| RF | email not personal (`classify.ts`) | 1 fail |

## Not done / stated limits
- One surviving mutant, `RE-restricted-source-listed` (graph.ts `sources` filter relaxed to also list uncited unknown-kind sources): equivalent. `claims.ts:670` already filters `sources` to the cited ids before that line, so the graph.ts filter is defence in depth and no input reaches the difference. A test strengthening was tried and reverted for that reason (`falsification-summary-extra3.txt`).
- R1B is red by timeout cancellation, not by an assertion. A20-gate and R2 were red by process hang in the main driver and were re-run narrow to get assertion failures.
- Mock provider and fake Mongo/KB only: no real KB search key, no real model, no network. The B13 disclosure of provider and KB handling and a search-only KB key stay open assumptions for the go-live gate; this unit ships OFF by default with no live enablement.
- The A20 gate refuses on the real repo gates today (B13 PENDING), so nothing is publicly reachable.
- The limiter is per process in memory: with several API instances the effective limit is 10 per minute per instance. `clientKey` / `trustSocketAddress` must be set by the deployment (behind a proxy the socket address is the proxy's).
- The rule-based personal-vs-generic classifier fails closed, so a generic question containing a personal-list word becomes `sign_in_required` (false positives by design; the Hindi/Hinglish lexicon is finite).
- No `senior-software-engineer` / `ai-engineer` review dispatched by this resume (the orchestrator owns it); the earlier review items (senior 1-5, AI A-F) are the repairs in `52d2af5`.
- `qa/contracts/` untouched.

## Live browser evidence
Not UI-touching: no `apps/web` file changed.
