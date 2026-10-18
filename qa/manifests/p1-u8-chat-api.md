# Manifest — p1-u8-chat-api
**Contract:** C1, C2, C3, C4, C5, C6, C7, C8, C9, C10 (unit-local ids, below). Parent contract rows: `qa/contracts/counselling-engine.md` B21 (student routes, student JWT), A6 (tenants, sandbox), A16b (profile facts), A19 (one thread, text and voice), A23 (limits); decisions D-093 items 4A (under-18), 6A (redacted persistence), 11 (config-driven student JWT). Plan row U8 (`qa/evidence/p1-plan-draft-20261017/plan.md` line 27), brief `qa/evidence/p1-briefs/p1-w3-u8.md`.
**Criteria:** C1 flag+gate, C2 student JWT, C3 idempotent threads and turns, C4 redacted persistence, C5 under-18, C6 profile routes, C7 limits, C8 tenants, C9 logs, C10 erasure+export
**Goal task:** none
**Date:** 2026-10-18
**Status:** checked-PASS
**Close-out:** dual PASS at cycle 0. Verdict A qa/verdicts/p1-u8-chat-api.md at b1aadea, verdict B qa/verdicts/p1-u8-chat-api.b.md at 86c04db. Findings filed as ISS-147..ISS-162 in qa/issues.jsonl; the five medium ones (ISS-147, 148, 152, 156, 157) are repaired by p1-u8r.
**Fix cycle:** 0 of max 2
**Dual check:** required
dual-trigger: auth apps/api/src/auth.ts:406 (student role gate: a validly signed non-student token is refused; also `auth.ts:415` guardian consent = boolean true only, `chat.ts:519` path student must equal token student)
**Persona walk:** skip (no human screen: JSON API only; the student UI is a later unit)
**Issues addressed:** none
**Executor:** claude-sonnet-subagent (maker/builder p1-u8, resumed after a session restart)
**Executor rationale:** one coherent API surface across three packages (`apps/api`, `packages/db`, `packages/schemas`); the brief assigns all three to U8 and the pieces share one fake-DB test world.

## Criteria
- **C1 flag + gate** — everything sits behind a default-off flag (`VC_CHAT_ENABLED`); with the flag off a chat path answers exactly like an unknown path; with it on nothing starts without the A20 gate, tracing off, and the student JWT config, all checked before Mongo is opened.
- **C2 student JWT** — issuer, audience and one key source (JWKS URL, public key or HS secret) come from `VC_STUDENT_JWT_*` env; tests use synthetic tokens; student routes reject counsellor, admin and approver tokens (403), and the counsellor verifier rejects a student token.
- **C3 threads and turns, idempotent** — create/get thread, post turn; a retry of the same `clientTurnId` replays the stored answer (one model call, one stored exchange); same id with other text is 409; a concurrent duplicate is 409 `turn_in_progress`; a crashed holder's lease can be taken over.
- **C4 redacted persistence (D-093 6A)** — names, phone numbers and emails in student turns (and in stored answers) are replaced by placeholders before storage; the live turn still goes to the model.
- **C5 under-18 (D-093 4A)** — a minor, or any student whose age is unknown, without a boolean-true guardian-consent claim still gets answers, but no turn text, answer, fact or escalation record is written; the thread keeps a text-free marker.
- **C6 profile routes (A16b)** — the Pathlynks-supplied profile is shown as in use; facts heard in chat are only proposed, and become facts in use only after the student confirms or corrects them; the student can erase one; a profile outage is 503.
- **C7 limits (A23)** — 30 requests per minute per student, per-tenant override, 429 with Retry-After; a crisis message is never limited.
- **C8 tenants (A6)** — two tenants never see each other's rows; the sandbox tenant takes only `syn-` student ids; a token can act only for its own student.
- **C9 logs** — the crisis flag log (ids and time only) and the gap counts (no student, no text) live in `virtual_counsellor` collections, and the prior-flag memory is read from that log.
- **C10 erasure + export** — erasing a student removes their threads, turns, facts, usage counters and flags; exporting returns exactly those rows; gap counts are exempt with a stated reason.

## What changed
Code commits `656267f` (the unit), `edb69c3` and the third commit (tests hardened after falsification survivors: C2d, C5d, C8d; tests only, no source change) on branch `p1/u8` (base `52d2af5` = origin/main with U7). 25 files in `apps/api`, `packages/db`, `packages/schemas`.
- `apps/api/src/chat.ts` (NEW, 575 lines) — the five student chat routes behind their own handler (like `anonymous.ts`): flag, A20 gate, tracing check, student auth, limiter, redaction, under-18 rule, profile, usage/flag/gap writes.
- `apps/api/src/auth.ts` — student verifier added (`studentJwtConfigFromEnv`, `createStudentJwtVerifier`, `studentContextFrom`); counsellor verifier unchanged in behaviour.
- `apps/api/src/index.ts` — `startApi` wiring: flag, gate and student JWT config checked before connecting; `withChatRoutes`.
- `apps/api/src/openapi.ts` — 6-line adjustment for the new student paths.
- `packages/db/src/chat-threads.ts`, `profile-facts.ts`, `student-logs.ts` (NEW) — threads, turns with lease and replay, usage counters, proposed/confirmed facts, flag log, gap counts; every write is fence-aware (D-015).
- `packages/db/src/collections.ts`, `erasure.ts`, `index.ts`, `scripts/db-init.ts` — six new collections registered, in the erasure plan and export; gap counts exempt with a reason.
- `packages/schemas/src/redact.ts` (NEW), `student-api.ts`, `index.ts` — `redactPii`, the student request/response schemas and the 30 rpm default.
- Tests (NEW): `apps/api/tests/chat.test.ts`, `chat-privacy.test.ts`, `chat-profile.test.ts`, `student-auth.test.ts`, `chat-fixtures.ts`; `packages/db/tests/chat-threads.test.ts`, `student-store.test.ts`; `packages/schemas/tests/redact.test.ts`. Edited in place: `packages/db/tests/db-init.test.ts`, `db-scope.test.ts`, `erasure.test.ts` (new collections added to the expected lists; no assertion weakened).
- Nothing deleted or renamed. `packages/engine/**` untouched (the U6 student graph is used as it is). `anonymous.ts` untouched (only its limiter class is imported). CORE-REQUEST: none.
- Database: every test uses the fake client (`createFakeMongoClient`); no test connects to Mongo; no network, no real model call.

## Verification scope
Policy-Version: proportional-verification/2026-10-17.14
Tier: L (auth: config-driven student JWT, role gate, tenant isolation, student PII persistence and erasure)
Round: 25 files, 10 criteria, est 45 min — resumed build: run the three packages, add one test hardening, per-criterion pre-checks, 42 falsifications and this manifest (lock waits dominate the wall time)
Base / checked state: base 52d2af5, code a7c0055, worktree clean except `qa/evidence/p1-u8-chat-api/` and this manifest
Affected tests / full-suite trigger: the three packages this unit touches (`packages/schemas`, `packages/db`, `apps/api`), each run whole (below). `packages/engine`, `packages/providers` and `apps/web` have no changed file. No whole-repo suite.
Tests[C1]: apps/api tests/chat.test.ts, tests/chat-profile.test.ts — the flag default, flag-off equals unknown path, gate closed/open, tracing refusal, and the three `startApi` tests (flag off over real HTTP, gate closed refuses before connect, no student config refuses before connect).
Tests[C2]: apps/api tests/student-auth.test.ts, tests/chat.test.ts — env-driven config, claim-name mapping, role refusal for counsellor/admin/approver, student token refused by the counsellor verifier, wrong key/issuer/audience/expired/none-alg, HS256 vs RS256 confusion, JWKS by kid, and the 401/403 route tests.
Tests[C3]: apps/api tests/chat.test.ts and packages/db tests/chat-threads.test.ts — replay after a dropped response, 409 on different text, 409 while running, lease takeover, abandon after model outage, voice and text in one history.
Tests[C4]: apps/api tests/chat-privacy.test.ts and packages/schemas tests/redact.test.ts — name, phone and email in a turn, profile-supplied name, model answer with an email, plus the redaction unit cases (Devanagari digits, Hinglish and Devanagari self-introductions, idempotence).
Tests[C5]: apps/api tests/chat-privacy.test.ts, tests/student-auth.test.ts, tests/chat-profile.test.ts — minor without consent stores nothing, unknown age fails closed, consent only as boolean true, later turns without consent mark the thread, crisis from an unconsented minor keeps only the flag row, no fact extracted for such a minor.
Tests[C6]: apps/api tests/chat-profile.test.ts and packages/db tests/student-store.test.ts — Pathlynks facts in use, proposed fact hidden until confirmed, correct/erase, another student's or unknown fact is 404, profile outage 503, store-level propose/confirm/correct/erase.
Tests[C7]: apps/api tests/chat.test.ts — the 31st request is 429 with Retry-After, other students unaffected, the window reopens, a tenant override applies to that tenant only, a crisis message is never limited.
Tests[C8]: apps/api tests/chat-privacy.test.ts and packages/db tests/chat-threads.test.ts, tests/db-scope.test.ts — two tenants with the same ids, sandbox tenant accepts `syn-` ids only, unscoped Db refused, token student must equal path student.
Tests[C9]: apps/api tests/chat-privacy.test.ts, tests/chat.test.ts and packages/db tests/student-store.test.ts — crisis flag row (ids and time only), helpline remembered after a restart (read from the store), gap count with no student or text.
Tests[C10]: packages/db tests/student-store.test.ts, tests/erasure.test.ts, tests/db-init.test.ts — every new collection is in the erasure plan, erase removes only that student's rows and the receipt counts them, export returns only theirs, gap counts exempt with a reason, db-init creates the new collections.
Pre-check[C1]: a7c0055 bash scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test tests/chat.test.ts tests/chat-profile.test.ts -> green: 33 passed, 0 failed t=46s
Pre-check[C2]: a7c0055 bash scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test tests/student-auth.test.ts tests/chat.test.ts -> green: 34 passed, 0 failed t=4s
Pre-check[C3]: a7c0055 bash scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test tests/chat.test.ts; bash scripts/vc-testlock.sh pnpm -C packages/db exec tsx --test tests/chat-threads.test.ts -> green: 35 passed, 0 failed t=7s
Pre-check[C4]: a7c0055 bash scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test tests/chat-privacy.test.ts; bash scripts/vc-testlock.sh pnpm -C packages/schemas exec tsx --test tests/redact.test.ts -> green: 26 passed, 0 failed t=6s
Pre-check[C5]: a7c0055 bash scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test tests/chat-privacy.test.ts tests/student-auth.test.ts tests/chat-profile.test.ts -> green: 36 passed, 0 failed t=4s
Pre-check[C6]: a7c0055 bash scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test tests/chat-profile.test.ts; bash scripts/vc-testlock.sh pnpm -C packages/db exec tsx --test tests/student-store.test.ts -> green: 23 passed, 0 failed t=6s
Pre-check[C7]: a7c0055 bash scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test tests/chat.test.ts -> green: 23 passed, 0 failed t=4s
Pre-check[C8]: a7c0055 bash scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test tests/chat-privacy.test.ts; bash scripts/vc-testlock.sh pnpm -C packages/db exec tsx --test tests/chat-threads.test.ts tests/db-scope.test.ts -> green: 38 passed, 0 failed t=6s
Pre-check[C9]: a7c0055 bash scripts/vc-testlock.sh pnpm -C apps/api exec tsx --test tests/chat-privacy.test.ts tests/chat.test.ts; bash scripts/vc-testlock.sh pnpm -C packages/db exec tsx --test tests/student-store.test.ts -> green: 51 passed, 0 failed t=19s
Pre-check[C10]: a7c0055 bash scripts/vc-testlock.sh pnpm -C packages/db exec tsx --test tests/student-store.test.ts tests/erasure.test.ts tests/db-init.test.ts -> green: 110 passed, 0 failed t=3s
Pre-check[typecheck]: a7c0055 bash scripts/vc-testlock.sh pnpm -C packages/schemas typecheck; pnpm -C packages/db typecheck; pnpm -C apps/api typecheck -> exit 0 (all three, final SHA; `qa/evidence/p1-u8-chat-api/typecheck-*-final.txt`)
Metrics: start=2026-10-17T23:31+05:30 end=2026-10-18T04:15:57+05:30 builder_min=unavailable wall_min=unavailable agent_min=unavailable blocked_min=unavailable suite_runs=0 repeat_runs=0 mutations=42 survivors_final=0 cycle=0 resumes=1 tokens=unavailable policy=proportional-verification/2026-10-17.14 lane=normal check_s=unavailable mutants=42 defects_unit=unavailable defects_6c=0
(suite_runs=0: no whole-repo suite; only per-criterion file runs and the three affected packages run whole, twice each, before and after the test hardening. start is the worktree creation time; the session restarted once mid-build and the API connection dropped once.)
mutant-cap-raise: the brief asks for one falsification per criterion; the criteria name several independent behaviours each (flag, gate, tracing; role refusal, audience, key source; three redaction kinds; four under-18 paths), so 42 single-line edits were run in a throwaway copy, one per behaviour, all executed under one test-lock hold.

## Capability coverage (each criterion -> falsifying edits, run in a throwaway copy `p1-u8-fals`, never the bound tree; logs `qa/evidence/p1-u8-chat-api/falsify/falsify-<id>.log`)
Column "before" is the green baseline of the same test files in the copy; "after" is the run with exactly one edit.
| id | falsifying edit | before (pass/tests) | after | first failing test |
|---|---|---|---|---|
| C1a | flag default on: unset reads as enabled | 58/58 | 2 fail of 58 | startApi: flag off -> a chat path answers exactly like an unknown /v1 path over real HTTP, |
| C1b | createChatApi builds even when disabled | 58/58 | 1 fail of 58 | A20 flag off: nothing is built and every chat path answers exactly like an unknown path |
| C1c | A20 gate not asked when building the routes | 58/58 | 3 fail of 58 | A20 flag on but gate closed: the real repo qa/gates |
| C1d | tracing switch not checked | 58/58 | 1 fail of 58 | no student text is traced: an environment that switches LangChain/LangSmith tracing on ref |
| C1e | startApi no longer checks the gate before connecting | 58/58 | 1 fail of 58 | startApi: flag on with the real repo gates refuses to start, BEFORE connecting to Mongo |
| C2a | a non-student role is not refused by the student verifier | 58/58 | 3 fail of 58 | startApi: flag on and gate open -> a student creates a thread and asks a question over rea |
| C2b | a role refusal is answered 401 instead of 403 | 58/58 | 2 fail of 58 | startApi: flag on and gate open -> a student creates a thread and asks a question over rea |
| C2c | student audience no longer mandatory | 58/58 | 1 fail of 58 | student config comes from its own env names: issuer, audience and ONE key source, with the |
| C2d | student verifier falls back to the counsellor key config | 59/59 | 1 fail of 59 | startApi: flag on with the gate open but no student JWT configuration is a config error be |
| C3a | same turn id with different text is replayed, not refused | 107/107 | 1 fail of 107 | the same turn id sent again with different text is a conflict, not a silent replay of the  |
| C3b | an expired lease can never be taken over | 107/107 | 1 fail of 107 | a retry after the first attempt crashed past its lease takes the claim over |
| C3c | a finished turn is not replayed (route) | 58/58 | 2 fail of 58 | D-093 6A: a model answer that carries an email address is stored and replayed redacted, wh |
| C3d | a model outage keeps the apology turn (abandon removed) | 58/58 | 1 fail of 58 | a model outage gives the apology answer, keeps nothing, and the student's retry with the s |
| C3e | a running first attempt is taken over by a concurrent retry | 107/107 | 1 fail of 107 | a retry that arrives while the first attempt is still running is told it is in progress, n |
| C4a | the student turn is stored unredacted | 58/58 | 2 fail of 58 | D-093 6A: a student who types their name, phone and email in a question gets an answer, an |
| C4b | the stored answer is not redacted | 58/58 | 1 fail of 58 | D-093 6A: a model answer that carries an email address is stored and replayed redacted, wh |
| C4c | email addresses are not redacted | 11/11 | 2 fail of 11 | a student who types an email address into a chat turn has it replaced by [EMAIL] |
| C4d | profile-supplied names are not redacted | 11/11 | 1 fail of 11 | known names |
| C4e | phone numbers are not redacted | 11/11 | 5 fail of 11 | a student who gives an Indian mobile number in any common format has it replaced by [PHONE |
| C5a | a minor without consent has the turn stored | 58/58 | 6 fail of 58 | D-093 4A: an under-18 student with no guardian-consent claim still gets the answer, and no |
| C5b | an unknown age is treated as an adult (fail open) | 58/58 | 2 fail of 58 | D-093 4A: a token with no age and no minor claim is treated as under 18 |
| C5c | any truthy guardian-consent value counts as consent | 58/58 | 2 fail of 58 | D-093 4A: an under-18 student WITH the guardian-consent claim is stored like an adult |
| C5d | a minor's thread is created as text-stored | 59/59 | 1 fail of 59 | D-093 4A: an under-18 student without consent who opens the chat and leaves before asking  |
| C5e | an unconsented minor turn still reaches escalation | 58/58 | 1 fail of 58 | D-093 4A: a crisis message from an under-18 student without consent gets the fixed message |
| C6a | a proposed fact is shown as in use | 58/58 | 2 fail of 58 | A16b: a fact heard in chat is proposed back, is NOT in the facts in use, and only becomes  |
| C6b | confirm does not confirm | 107/107 | 3 fail of 107 | a fact proposed from chat starts as proposed, is hidden from 'confirmed', and confirming i |
| C6c | a failing Pathlynks profile reads as empty (not 503) | 58/58 | 1 fail of 58 | a Pathlynks profile outage is a 503 profile_unavailable |
| C7a | a tenant override of the limit is ignored | 58/58 | 1 fail of 58 | A23: a tenant override of requestsPerMinute applies to that tenant only |
| C7b | a crisis message is rate limited too | 58/58 | 1 fail of 58 | A23: a crisis message is never rate limited, even from a student already over the limit |
| C7c | default limit 31 instead of 30 per minute | 59/59 | 1 fail of 59 | A23: the 31st request in a minute from one student is 429 with Retry-After, another studen |
| C7d | limiter key is the tenant, not the student | 58/58 | 1 fail of 58 | A23: the 31st request in a minute from one student is 429 with Retry-After, another studen |
| C8a | the sandbox tenant accepts a real-looking student id | 58/58 | 1 fail of 58 | A6: the sandbox tenant accepts only syn- student ids |
| C8b | a path student other than the token student is served | 58/58 | 1 fail of 58 | a student whose token names a different student than the path gets 404 |
| C8c | thread read ignores the owning student | 107/107 | 1 fail of 107 | a student opening the chat gets a thread owned by them |
| C8d | chat store accepts an unscoped Db | 107/107 | 1 fail of 107 | a chat-store call on an unscoped Db is refused |
| C9a | crisis flags are not logged | 58/58 | 3 fail of 58 | D-093 4A: a crisis message from an under-18 student without consent gets the fixed message |
| C9b | unanswerable turns are not counted | 58/58 | 1 fail of 58 | a question the knowledge base cannot answer says so, and adds one text-free count to the d |
| C9c | the prior crisis flag is not read back from the store | 58/58 | 1 fail of 58 | a student who raised a crisis flag earlier in the thread still sees the helpline on a late |
| C10a | erasure plan omits the usage counters | 107/107 | 4 fail of 107 | B15: the receipt counts match what was actually there |
| C10b | erasure plan omits the chat turns | 107/107 | 4 fail of 107 | B15: the receipt counts match what was actually there |
| C10c | erasure plan omits the profile facts | 107/107 | 4 fail of 107 | B15: the receipt counts match what was actually there |
| C10d | export of usage returns every student's counters | 107/107 | 1 fail of 107 | exporting a student returns their chat threads, turns, facts, usage and flags, and nobody  |

Survivors: 0. First pass (at 656267f) left 4 survivors or non-clean reds, each handled before ready: C2d hung (the wrongly started server kept the process alive; the test now stops it and fails cleanly), C5d and C8d survived (tests added: a minor's thread is text-free before any turn; every chat-store call refuses an unscoped Db), C7c was run against the wrong test set (re-run on the api tests). Those four rows above are the re-runs against the hardened tests (59 api tests, same 107 db tests with more assertions); all other rows come from the first pass, whose test files are unchanged by the hardening except for the added tests.

## Live browser evidence
Not UI-touching — changed paths are `apps/api/src/**`, `packages/db/**`, `packages/schemas/**` and `qa/`; the API has no screen in this unit (the student UI and the voice route are later units).

## Not done / stated limits (for the checker)
- **No real integration.** The Pathlynks profile arrives through a port (`PathlynksProfilePort`) and the knowledge base through `StudentKbPort`; both are injected, neither is implemented here. The student JWT format is config-driven (issuer, audience, one key source, claim names); Pathlynks has not given the real format, so only synthetic tokens are tested.
- **Name redaction is a heuristic.** Email and phone are matched by shape. A name is caught only when the student introduces themselves ("my name is", "I am", "mera naam", Devanagari), or when it is a name the Pathlynks profile supplies. "My sister Anita" is not redacted; "this is Germany" is over-redacted. The live turn still goes to the model unredacted, as D-093 6A allows.
- **Under-18 turns have no idempotent replay** (nothing is stored to replay); a retry runs the model again. An unknown age is treated as under 18.
- **The rate limiter is per process, in memory** (the same class U7 uses). A multi-instance deployment would multiply the limit; a shared counter is a later unit.
- **No voice route and no 60-minute monthly voice quota here** (U10 owns voice; the usage collection already carries `voiceMs` for it).
- **Fact extraction is an injected function** (`extractFacts`); the real extractor is not built. With none injected no fact is ever proposed.
- **Startup ports are required.** `VC_CHAT_ENABLED=true` also needs a KB port and a speakers file from the deployment; without them `startApi` refuses to start.
- **A20 stays closed in the repo.** With the real `qa/gates` the chat routes refuse to build (B13 pending); the open-gate tests use a temporary gates fixture.
- No `senior-software-engineer` / `ai-engineer` review dispatched (brief: dispatch no checker; the orchestrator owns it).

## How to verify (commands + expected)
- `bash D:/vc/scripts/vc-testlock.sh pnpm -C <worktree>/packages/schemas test` -> tests 90, pass 90, fail 0.
- `bash D:/vc/scripts/vc-testlock.sh pnpm -C <worktree>/packages/db test` -> tests 278, pass 278, fail 0.
- `bash D:/vc/scripts/vc-testlock.sh pnpm -C <worktree>/apps/api test` -> tests 183, pass 183, fail 0.
- `pnpm -C <worktree> -r typecheck` -> exit 0.
- Per-criterion: the Pre-check lines above (each runs the files named in its Tests line).
- Evidence: `qa/evidence/p1-u8-chat-api/` (`test-*.txt`, `typecheck-*.txt`, `precheck-*.txt`, `falsify/`).
