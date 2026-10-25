# Verdict: w1-counsellor-tenant-guard (Mode A, DUAL check, coordinator B)

**Cycle checked:** 0
**Checker:** /checker coordinator B (fresh context), read-only toward the artifact; wrote only this file. Blind to coordinator A.
**Code tested:** worktree D:/vc/.worktrees/w1-counsellor-tenant-guard, branch wave/w1-counsellor-tenant-guard, head 141f324 (code 9af98ff); worktree clean (`git status --short` empty) before and after.
**Policy-Version:** proportional-verification/2026-10-19.17
**Overall:** VERDICT: PASS. T1 and T2 proven by 39 checker-built hostile tests (not the maker's), two checker mutants turn them red, regression files green, tsc clean. No criterion failure; no PROPOSED-ISSUE rows required (one LOW note below).

## Method
Falsification copy: C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/chk-tg-B/ (apps/api src+tests copied from the worktree, `diff -rq` src identical; node_modules/skills/qa/packages as junctions). My test file: chk-tg-B/apps/api/tests/chkB-hostile.test.ts. Every run via `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 900 pnpm exec tsx --test <file>`.

## Routes (enumerated myself from server.ts ROUTES / API_ROUTES, not from the builder's list)
14 routes, 1 public (GET /v1/openapi.json), 13 non-public: scribe, scribe/resume, approval GET, approval POST, transcript, profile, erasure-requests, confirm, reconfirm [counsellor|admin]; approve, reject [approver]; execute, export [admin]. Matches 13. The counsellor verifier is consumed in exactly one place (createApiHandler, index.ts:798, now wrapped); chat.ts and voice.ts use the student verifier (also guarded); no other `.verify(` consumer or second counsellor verifier exists in apps/api/src. Partner routes, anonymous routes and the public route are not counsellor-JWT surfaces.

## Criteria
| Criterion | Verdict | Evidence |
|---|---|---|
| (1) tenant equal / case-fold / NFKC-fold to a partner id -> uniform 401 on every non-public route | PASS | Two partners (Pathlynks, Acme Edu). Tenants pathlynks, PathLynks, PATHLYNKS, pAtHlYnKs, acme-edu, ACME-EDU, Acme-Edu, each with a signed token of every role the route admits, on all 13 routes: every response 401 body exactly `{"error":"unauthorized"}`. The guard runs before the role check, so even an admin-only route gives 401, never 403. |
| (2) bound pair + unrelated tenant pass | PASS | `VC_PARTNER_OWN_TENANTS=pathlynks:pathlynks` + tenant pathlynks: no 401 on any route/role. Case variant of the bound tenant -> 401 everywhere. Bound pair for OTHER partner (acme-edu:acme-edu) does not open pathlynks (401) and pathlynks:pathlynks does not open acme-edu (401). Unrelated tenant-a, pathlynks2, pathlynk, xpathlynks, pathlynks_x, acme: not 401 on all routes. |
| (3) bypass attempts | PASS | All 401 uniform on all routes, none reaches data: trailing dot, leading/trailing space, trailing newline/tab, ZWSP mid and trailing, ZWJ+upper, BOM lead, soft hyphen, full-width, Cyrillic р and а homoglyphs, Kelvin sign K, long s, dotless i / dotted I suffixes, NUL suffix, percent-encoded, tenant as array, number, object, null, boolean, empty string, missing. These are refused by the existing TENANT_ID_PATTERN (ASCII-only `^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$`) or the typeof check in contextFrom before the guard; the guard sees only ASCII, where NFKC is identity and the lower-case fold is exact, so its fold is correct on everything that reaches it. |
| (4) partner store throws -> fail closed | PASS | `list` throwing: unrelated tenant-a gets 401 uniform on all 13 routes (refuseTenantClaims turns a throw into AuthError("claims")). |
| (5) pepper unset | PASS | Tenant pathlynks on all 13 routes: none 401. Exactly one log line (`partner_tenant_guard_off`, warn, names student-JWT and counsellor-JWT guards); `clientFactory` called once. With pepper set and guarded requests (pathlynks, tenant-a) it is still 1 connection: the guard opens no connection. (The other warn line seen, `reserved_tenant_ids_empty`, is pre-existing and not part of this unit.) |
| (6) student path unchanged | PASS | chat-profile whole file 52 tests, 52 pass, 0 fail (includes "K1 (pc-hardening-3) startApi" student-guard test and the P2 off-mode test); student-auth 11/11. |
| (7) refuseTenantClaims generalisation | PASS | auth.ts:436 body byte-identical in logic (refuse true or throw -> AuthError("claims")); only the signature is generic `<C extends {tenantId:string}>`. Student call sites keep their types (guardStudentVerifier declares StudentJwtVerifier in and out; tsc clean). Behaviour of the student verifier is exercised by K1 above. |

## Commands and actual counts
- `... tsx --test tests/chkB-hostile.test.ts` (copy): exit 0, tests 39, pass 39, fail 0.
- Mutant M1 (copy, index.ts `verifier: httpSetup.verifier`, wrap removed): tests 39, pass 30, fail 9 (all 7 fold-equal tenants, the bound-case variant, store-throws). RED as required.
- Mutant M2 (copy, partners.ts `isPartnerTenantClaim` fold removed, exact compare): tests 39, pass 33, fail 6 (the case variants). RED. Both mutants restored; `diff -rq` worktree src vs copy src identical afterwards.
- `... tsx --test tests/chat-profile.test.ts` (copy): tests 52, pass 52, fail 0.
- `... tsx --test tests/student-auth.test.ts` (copy): tests 11, pass 11, fail 0.
- `... tsx --test tests/auth.test.ts` in the worktree: tests 15, pass 15, fail 0. (In the copy it failed 1 of 15, the T-025 B21 contract test, ENOENT .env.example then `git ls-files` not a git repo: a copy artifact, not a code defect; green in the real worktree.)
- `... pnpm exec tsc --noEmit -p tsconfig.json` (copy of apps/api): exit 0, no output.
- Not re-run by me (maker's pre-checks only, per manifest): server, index, main, partners, partner-voice, chat, go-live-gate whole files. The changed surface (index.ts startApi wiring, auth.ts refuseTenantClaims) is covered by my chat-profile/auth/student-auth runs and 39 hostile tests; judged proportionate for a 9-line wiring diff. Coordinator A or the closing step may re-run them.

## Notes (not criterion failures)
1. LOW: the builder's note holds. Full-width is rejected by TENANT_ID_PATTERN before the guard, so the width variant never tests the guard's own NFKC fold; the guard's fold is only observable on ASCII case. If the tenant pattern is ever widened to Unicode, the guard's NFKC fold (partners.ts foldId) is the backstop, and isPartnerTenantClaim already returns true for non-strings. No action required; no ledger row proposed.
2. Behavioural parity with the student path (refuse at claim only for existing partner ids; reserved ids are refused at partner create/load) is as documented in the manifest, deviation 1; consistent with the gate answer (a).

## Files changed by this check
Only this file: qa/verdicts/w1-counsellor-tenant-guard.B.md. Nothing in qa/issues.jsonl, code, gates or .claude.
