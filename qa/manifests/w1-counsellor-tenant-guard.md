# Manifest — w1-counsellor-tenant-guard
**Contract:** ISS-pc-hardening-3-3 (qa/issues.jsonl); brief qa/evidence/p1-briefs/w1-counsellor-tenant-guard.md, criteria T1-T2 (verbatim below); gate qa/gates/counsellor-jwt-partner-tenant.md answered (a) 2026-10-25. Not an edit to qa/contracts.
**Goal task:** none
**Date:** 2026-10-25
**Fix cycle:** 0
**Status:** ready-for-check
**Dual check:** required
dual-trigger: tenancy apps/api/src/index.ts:522
**Persona walk:** skip (no new screen or flow)
**Live browser:** Not run (API wiring and tests only)
**Issues addressed:** ISS-pc-hardening-3-3
**Executor:** claude-sonnet-subagent
**Executor rationale:** one build unit in one worktree (D:/vc/.worktrees/w1-counsellor-tenant-guard, branch wave/w1-counsellor-tenant-guard, base da2faad).

## What changed (all in place, no new module)
- apps/api/src/auth.ts `refuseTenantClaims` (was StudentJwtVerifier-only): now generic, `<C extends { tenantId: string }>(inner: { verify(token): Promise<C> }, refuse) => { verify(token): Promise<C> }`. Body unchanged (refuse true or throw -> AuthError("claims")). The student call sites keep their types.
- apps/api/src/index.ts, in `startApi`, next to `guardStudentVerifier`: new `guardCounsellorVerifier(v: JwtVerifier)` (same registry check `partnerRegistry.isPartnerTenantClaim`, which folds with NFKC + lower-case, lets an exact bound `VC_PARTNER_OWN_TENANTS` pair through, and reads the partner store the registry already holds: no new connection). `createApiHandler({ verifier: guardCounsellorVerifier(httpSetup.verifier) })` (was `httpSetup.verifier`). The wrap covers the default (`createJwtVerifier(jwtConfigFromEnv(env))`) and an injected `http.verifier`. server.ts is untouched: its auth step (server.ts:680) already maps any verifier throw to the uniform 401.
- apps/api/src/index.ts partner_tenant_guard_off note (the existing one line, pepper unset): wording now says the student-JWT and counsellor-JWT guards are not installed. Still one line, event name and level unchanged; the existing P2 test still passes.
- apps/api/tests/chat-profile.test.ts: three new tests (names start "w1-counsellor-tenant-guard"). Imports `API_ROUTES` (server.js) and `SignJWT` (jose) added.
- No test or code deleted or renamed. pnpm-lock.yaml restored after the offline install, not committed. No python run, no real Mongo, no live provider calls; qa/gates, qa/contracts and .claude untouched.

## Deviations and findings the checker should know
1. Parity with the student guard, not more: the guard refuses a tenant claim that folds to an EXISTING partner id. Reserved ids are refused when a partner is created or loaded (partners.ts), not at the claim, same as for students.
2. The "width variant" case: the tenant claim shape (TENANT_ID_PATTERN, ASCII only) already refuses a full-width tenant in contextFrom before the guard, so that variant gets the same 401 with or without the guard. The test includes it as a refusal case; the discriminating cases are the equal id and the case variants (the T1 falsification turns them red).
3. A case variant of a bound tenant is refused (the binding is for the exact partner id), as in the student path.
4. Files are CRLF in the working copy and LF in the index (autocrlf); no line-ending noise.

## Acceptance criteria and evidence
Policy-Version: proportional-verification/2026-10-19.17
Tier: L, Dual check: required. Base da2faad, code commit 9af98ff.

T1 (ISS-pc-hardening-3-3): Make the counsellor/admin JWT verifier behave exactly as the student verifier does: it refuses a token whose tenant claim folds to an existing partner id or a reserved id (same NFKC normalization and case fold; uniform 401 with no detail); exception: a tenant listed in VC_PARTNER_OWN_TENANTS as the partner's own bound tenant is allowed; an unrelated tenant is allowed. Tests use a fake partner store and cover every counsellor/admin route family, each with four cases: an equal tenant id, a case or width variant, a bound pair (allowed), an unrelated tenant (allowed).
T2: No new Mongo connection. With the partner registry off (VC_PARTNER_KEY_PEPPER unset), behaviour matches the student path's existing off-mode: a log line and no block.
Regression: test files auth, student-auth, server, index, main, partners, partner-voice, chat, go-live-gate (plus chat-profile, which holds the new tests); typecheck tsc for apps/api.

Tests[T1]: chat-profile.test.ts "w1-counsellor-tenant-guard T1 startApi ..." — over real HTTP through startApi with the fake Mongo client and a registered partner "pathlynks": every non-public route in API_ROUTES (13 routes, the three role families counsellor|admin, admin, approver) with a signed JWT of its role: equal / case variants / full-width variant -> uniform 401 body {"error":"unauthorized"}; bound pair pathlynks:pathlynks -> not 401; case variant of the bound tenant -> 401; unrelated tenant-a -> not 401. And "w1-counsellor-tenant-guard T1: a partner-store failure ..." — an unreadable partner store fails closed to the uniform 401.
Tests[T2]: chat-profile.test.ts "w1-counsellor-tenant-guard T2 startApi ..." — pepper unset: a counsellor JWT with tenant "pathlynks" is not blocked; the clientFactory is called exactly once (the connection startApi always opens); exactly one partner_tenant_guard_off note, naming student and counsellor guards.

Red run before the change (tests first, `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 900 pnpm exec tsx --test --test-name-pattern="w1-counsellor-tenant-guard" tests/chat-profile.test.ts`, apps/api of the worktree): 3 tests, 0 pass, 3 fail (T1 route table: "pathlynks: POST .../scribe refuses, 400 !== 401"; store failure: "403 !== 401"; T2: note did not match /counsellor/). After the change: 3 tests, 3 pass.

Falsifications (in a COPY under scratchpad build-w1-counsellor-tenant-guard/copy, never in the worktree; the copy has junctions to the worktree node_modules; mutants applied to copy/apps/api/src/index.ts and restored from index.orig.ts between runs):
- T1 mutant, `verifier: httpSetup.verifier` (the wrap removed): `--test-name-pattern="w1-counsellor-tenant-guard T1"` -> 2 tests, 0 pass, 2 fail ("pathlynks: POST .../scribe refuses"; "store unreadable: refused, not waved through"). RED.
- T2 mutant a, the guard installed even with the registry off (`refuseTenantClaims(v, () => true)` when no registry): T2 test -> 1 test, 0 pass, 1 fail ("no registry, no block"). RED.
- T2 mutant b, the note wording reverted to student-only: T2 test -> 1 test, 0 pass, 1 fail (note did not match /counsellor/). RED.

Round: 1 round, 3 files (auth.ts, index.ts, chat-profile.test.ts), 2 criteria, est 40 min — diff of 9af98ff vs da2faad
Tests[R1]: auth, student-auth, server, index, main, partners, partner-voice, chat, go-live-gate, chat-profile whole files
Tests[R2]: tsc --noEmit (apps/api)
Pre-check[T1]: 9af98ff `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 900 pnpm exec tsx --test --test-name-pattern="w1-counsellor-tenant-guard T1" tests/chat-profile.test.ts` (apps/api of the worktree) -> exit 0, 2 tests, 2 passed, 0 failed (full pattern "w1-counsellor-tenant-guard": 3 tests, 3 passed)
Pre-check[T2]: 9af98ff `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 900 pnpm exec tsx --test --test-name-pattern="w1-counsellor-tenant-guard T2" tests/chat-profile.test.ts` (apps/api of the worktree) -> exit 0, 1 test, 1 passed, 0 failed (the existing K1 pc-hardening-3 and P2 pc-hardening-4 tests also pass: 3 tests, 3 passed)
Pre-check[R1]: 9af98ff `... timeout 900 pnpm exec tsx --test tests/<file>.test.ts` per file (apps/api) -> exit 0 on all: auth 15 passed; student-auth 11; server 34; index 9; main 10; partners 74; partner-voice 40; chat 36; go-live-gate 25; chat-profile 52 (49 before + 3 new); 0 failed, 0 skipped on every file
Pre-check[R2]: 9af98ff `... timeout 900 pnpm exec tsc --noEmit` (apps/api) -> exit 0, no output

Metrics: 3 files changed (+102/-5 lines incl. 93 test lines), 3 tests added, 0 removed, 3 falsifications red, 10 regression files green, tsc clean.
