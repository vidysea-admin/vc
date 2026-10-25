# Verdict A: w1-counsellor-tenant-guard (dual check, coordinator A)
**Cycle checked:** 0
**Checked at:** 2026-10-25T07:26:50+05:30
**Unit:** worktree D:/vc/.worktrees/w1-counsellor-tenant-guard, branch wave/w1-counsellor-tenant-guard, head 141f324 (code 9af98ff). Tier L, dual-trigger tenancy apps/api/src/index.ts:522.
**Policy-Version:** proportional-verification/2026-10-19.17

VERDICT: PASS 141f324

## Method
Read the diff (auth.ts, index.ts, chat-profile.test.ts), enumerated routes from server.ts myself, wrote my own hostile test in a COPY (scratchpad chk-tg-A/apps/api/tests/chk-hostile.test.ts; worktree untouched, still clean), ran it, falsified it with two mutants, and re-ran the regression files in the worktree through vc-testlock.

## Findings by brief item
1. Route enumeration: API_ROUTES has 14 routes; 1 public (getOpenApi) and 13 non-public (startScribe, resumeScribe, getApproval, decideApproval, getTranscript, getProfile, requestErasure, confirmErasure, reconfirmErasure [counsellor|admin]; approveErasure, rejectErasure [approver]; executeErasure, exportStudent [admin]). Matches the builder's 13. Only server.ts's `deps.verifier.verify` (line 680) consumes the counsellor verifier, and index.ts:798 wraps it for both the default and an injected `http.verifier`. withPartnerRoutes/Chat/Voice/Anonymous do not use it.
2. Equal / case-fold / NFKC-fold on every one of the 13 routes: real RS256 JWT, tenant pathlynks, PathLynks, PATHLYNKS: 401 uniform body {"error":"unauthorized"} on all 13, for each of the three roles on every route (39 combinations; 401 not 403, so the guard runs before the role check and gives no role oracle). Injected non-pattern-checking verifier (guard in isolation): full-width, full-width upper, Title case, Kelvin sign (U+212A) for "kelvin-co", ligature U+FB01 for "fine-arts": 401 on all 13 routes. So the guard itself folds NFKC + lower-case correctly, not only the earlier TENANT_ID_PATTERN.
3. Bound pair / unrelated: VC_PARTNER_OWN_TENANTS=pathlynks:pathlynks with tenant pathlynks: no route answers 401 and the seeded partner marker is returned by the export route (positive control, so the seed is observable). A case variant of the bound tenant is 401. Unrelated tenant-a: no 401 and never sees the partner marker.
4. Bypasses with the real verifier (all 401 on all 13 routes, marker never present): trailing dot, leading and trailing space, trailing newline, ZWSP mid and end, Cyrillic a, Turkish dotless i, Kelvin sign, NUL, array, number, null, object, missing tenant. With the injected verifier (guard only, no pattern gate): trailing dot, leading space, ZWSP, Cyrillic, dotless i, pathlynks-2, trailing newline are distinct tenant strings, not folded by NFKC+lower, and die in tenantScopedDb as TenantScopeError (500) or reach only their own empty tenant (pathlynks-2); none returns the partner marker. No variant reaches partner data.
5. Partner store throws: list() rejects, tenant-a token, all 13 routes: 401 uniform. Mutant (catch sets refused=false) turns this test red.
6. Pepper unset: counsellor token with tenant pathlynks on all 13 routes: none 401; clientFactory called once (connection startApi always opens); exactly one partner_tenant_guard_off note, wording names student-JWT and counsellor-JWT guards. No partner store is created in that branch (guardCounsellorVerifier returns v unchanged when partnerRegistry is undefined).
7. Student path: refuseTenantClaims is generic over C extends {tenantId}, body unchanged (inner.verify, refuse true or throw -> AuthError("claims")). StudentJwtVerifier and JwtVerifier are both a single `verify(token): Promise<ctx>` interface, so no loosening of the student type; tsc --noEmit clean. K1 and P2 pc-hardening tests inside chat-profile.test.ts pass (52/52 in the worktree), student-auth 11/11.
8. Width variant note (builder risk): full-width tenant in a real token is rejected by TENANT_ID_PATTERN before the guard; I judged the guard separately with the injected verifier (item 2) and it folds correctly.

## Commands and counts
- My hostile test in the copy: tsx --test tests/chk-hostile.test.ts -> 6 tests, 6 pass, 0 fail.
- Mutant M1 (index.ts:798 wrap removed): 3 pass, 3 fail (real-verifier sweep, injected sweep, store-throws). Mutant M2 (auth.ts catch -> refused=false): 5 pass, 1 fail (store-throws). Copy restored by diff against the worktree.
- Worktree regression via vc-testlock (apps/api): chat-profile 52/52, auth 15/15, partners 74/74, partner-voice 40/40, main 10/10, chat 36/36, go-live-gate 25/25. In the copy (same sources): student-auth 11/11, server 34/34, index 9/9. Worktree-level tsc --noEmit (run in the copy, same src): exit 0.
- Copy-only failures (2 chat-profile gate tests, 1 auth repo-contract test, partners file) are artifacts of the copy lacking qa/gates, .env.example and git; the same files pass in the worktree (counts above). Not code defects.

## Proposed issues (none blocking, none filed; dual check, so no ledger edit)
- PROPOSED-ISSUE (low, parity): the guard refuses a tenant claim equal to an EXISTING partner id only, not a reserved name (sandbox, admin) or a VC_RESERVED_TENANT_IDS entry. Same as the student path by design (manifest deviation 1). No action needed unless the gate owner wants reserved ids refused at the claim.
- PROPOSED-ISSUE (low, observability): an injected verifier returning a non-pattern tenant produces 500 TenantScopeError after auth rather than 401. Production verifiers pattern-check first, so this is test-only reachable.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
