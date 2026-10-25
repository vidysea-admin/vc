# Manifest - cards-api
Policy-Version: proportional-verification/2026-10-19.17
**Contract:** B21 (API), B4, B5, B2, B12/B8, B1/B18 in qa/contracts/counselling-engine.md; T-010 slice (a). Plan qa/evidence/p2-cards-api/plan.md (0c93cfe); approval qa/evidence/p2-cards-api/review-1.md (3640726), PLAN-APPROVE with 8 binding conditions; brief qa/evidence/p2-briefs/cards-api-build.md. Not an edit to qa/contracts.
**Goal task:** T-010 (slice a); T-050 (card-feedback writer) stays OPEN, nothing here is credited toward it.
**Date:** 2026-10-25T09:34:13+05:30
**Fix cycle:** 0
**Status:** ready-for-check
**Executor:** claude-sonnet-subagent (maker role)
**Base:** main 6b2f99a, branch wave/cards-api, worktree D:/vc/.worktrees/cards-api, code commits c569094 + 55c72b4 (final code sha 55c72b4). Source read only with `git show` from wave/t-010-live-cards fb5959c.
**Dual check:** required
dual-trigger: tenancy apps/api/src/server.ts:824
dual-trigger: auth apps/api/src/server.ts:797
**Dual-check reason:** the unit adds three routes behind the existing JWT, role, path-id and tenant-from-token pipeline (server.ts:797 verify, :802 role gate, :804 path ids, :824 `store: () => deps.dbForTenant(tenantId!)`) and a consent/fence-gated read path (packages/engine/src/cards/graph.ts, unchanged). No new auth code was written, but the tenancy and consent surface is exercised by every new route, so both checkers run the section "Falsifications" variants themselves.
**Tier:** L (auth, tenancy and consent surface)
**Persona walk:** skip (no screen or flow touched; apps/web untouched)
**Live browser:** Not run (no apps/web file changed)

## Criteria (verbatim from qa/contracts/counselling-engine.md; cites corrected per review-1 condition 4)
- C1 (B21 :320-321): "Every capability (scribe, approval, profile, cards, timeline, erasure, export) is reachable through a versioned HTTP API described by an OpenAPI document in the repo."
- C2 (B21 :322-326, ELIDED at "... (student routes: see **Student identity** below). VC has no login screen and no password store."): "**Auth:** every request, except the anonymous routes of the **anonymous-route exception** below, carries a JWT issued by the client backend (for Pathlynks, its backend). VC verifies signature, expiry and issuer, and reads the `tenant`, `counsellorId` and `role` claims ... A missing, expired, wrong-issuer or tampered token gets 401, and nothing is read or written."
- C3 (B21 :330-331): "**Tenancy:** the verified `tenantId` is stamped on every document and filters every query. A test proves tenant A can never read or change tenant B's student."
- C4 (B21 :332-334): "**Knowledge:** university and seminar knowledge comes from the KnowledgeBase over its API (`POST /ask`, Bearer key from `.env`, B11). Its citations are carried through (B2). A KB outage degrades to "knowledge unavailable"; it never produces an uncited answer."
- C5 (B21 :339-340): "Tests use a locally signed test JWT and a fake KB. Nothing connects to the real Pathlynks backend until an integration unit is approved."
- C6 (B21 :343-344 and :351-352): "Every other route, including every student, counsellor and admin route and the voice routes, still gets 401 without a valid JWT, and a test enumerates the registered routes to prove it." and "A counsellor or admin token on a student route is rejected, and a student token on a counsellor or admin route is rejected."
- C7 (B4 :164-165): "Every fact carries purposeTags + sensitivity. A session without a recorded consent row cannot be processed on the counsellor-session path. A test covers it."
- C8 (B5 :178): "Every graph node's input and output is a Zod schema. No free text passes between nodes." (API boundary: body and path parsed by Zod before the engine.)
- C9 (B2 :51): "Every fact shown or stored carries a source (KB record id + fetchedAt, profile fact id, or transcript quote + turn)."
- C10 (B12 :216, B8 :203): "The engine's only database there is `virtual_counsellor`" and "Production Mongo writes only inside `virtual_counsellor` (B12). Nothing else ..." (the cards routes read only; the feedback route writes nothing).
- C11 (B1 :39, B18 :295): "No card, prompt or skill output may be a full sentence for the counsellor to recite." and "An approved fact is never asked again as if it were unknown." (the engine owns both; the API adds no path around them).
Touched-not-owned rows (review-1 condition 4): B9 :205 "A distress or self-harm signal routes to an escalation card before any generative call." (test 'a crisis turn is 200 escalated', English and Devanagari, zero provider calls); B20 :313 (concern check-in is a live-card question; the engine result is returned unchanged, C11 test); B18 :294 and :297 (outcome test lives in the engine suite, cards-graph.test.ts, run as the control); B15 :254 (erasure covers "cards/feedback"; moot while nothing is stored, T-050 must inherit it).

## What changed (all in place, no new source file, no packages/ edit)
- apps/api/src/server.ts: imports (`LiveCardsInputSchema`, `buildPreBriefFor`, `recordLiveCardFeedback`, `runLiveCards`, `KnowledgeAsker`, `ProviderAuthorizationRefusedError`); `ApiDeps.cards` + `LiveCardsWiring` (:187, no `semanticVerifier` field: the engine's verification is mandatory); `RouteContext.cards`; `LiveCardsBodySchema` (:291), `CARD_ID_PATTERN`, `CardFeedbackBodySchema`; results `CONSENT_REQUIRED`, `CARDS_UNAVAILABLE`, `CARD_FEEDBACK_UNAVAILABLE`; routes `getPreBrief` (:492), `liveCards` (:501), `cardFeedback` (:529); `mapError(err, routeId)` (:736) with `CARDS_ROUTE_IDS` (:733); `cards` in the handler ctx.
- apps/api/src/openapi.ts: three path objects (`getPreBrief` :187, `liveCards` :203, `cardFeedback` :243).
- apps/api/src/index.ts: `KnowledgeAsker` import, `apiStatus()` text, `StartApiHttpOptions.kb` (:311), `cards: { provider: httpSetup.provider, skillsDir, kb? }` in `createApiHandler` (:808).
- apps/api/tests/server.test.ts: count assertion 13 -> 16 (text-anchored), imports, 17 new `T-010 api:` tests inserted before the `// OpenAPI` banner.

## Binding conditions of review-1 (how each is met)
1. FENCE BEHAVIOUR: met. A pre-seeded fence is the SAME 403 `{"error":"consent_required"}` on all three routes, byte-identical to the no-consent body, zero provider calls, nothing written (test 'a fenced student ... SAME 403'). 409 `student_fenced` (pre-brief, feedback) is proven with a different fixture: the fence is planted on the LAST fence read of a counted clean run, i.e. after `requireConsent` passed (test 'a fence or a consent revocation that lands MID-run'). Live cards: the fence, or a consent revocation, lands inside the planner call -> 403 `authorization_refused`, no card text or fact value in the body. No extra `assertStudentNotFenced` added to the route (no erasure oracle).
2. S8 SCOPE: met. `mapError` takes the route id; `AbortError` -> 503 `cards_deadline` and `CardFeedbackUnavailableError` -> 503 `card_feedback_unavailable` apply only when `CARDS_ROUTE_IDS` has the route, with `err instanceof Error` and exact `err.name` equality. A test pins that an AbortError and a CardFeedbackUnavailableError-named error on the scribe route stay a logged 500 `internal`. STATED: `ProviderAuthorizationRefusedError` becomes a constant 403 `{"error":"authorization_refused"}` on EVERY route (global, as the review allows); the same test pins it on the scribe route.
3. TENANCY TESTS: met. Tenant B WITH B's consent against tenant A's student: pre-brief 200 with empty `knownFacts` and `doNotAsk`, no tenant-A fact value or id in any response; feedback 503 and all raw collections unchanged; live cards `cards: []`, planner `knownFacts: []`, planted foreign fact id dropped `unresolved_source`. The unverifiable "zero reads of facts via w.calls" claim was dropped; replaced by provider call counts and a before/after comparison of every raw collection (`rawAll`).
4. CRITERIA TABLE: met (above): C5/C6 cites corrected, C2 marked elided, B9/B20/B18/B15 rows added.
5. OPENAPI HONESTY: met. No 503 `ai_unavailable` on liveCards (the engine turns an AI outage into a 200 body, pinned by a test); 503 documents `cards_unavailable` and `cards_deadline`; `droppedCount`, `escalation`, `held`, `suppressedByQuiet`, `dropped`, `knowledge`, `quiet`, `preBrief` are optional 200 properties; `required: ["status","cards"]`.
6. cardFeedback: met. The OpenAPI summary and 503 description, the route comment and this manifest say the route does NOT persist feedback and returns 503 by design. T-050 stays open; nothing is credited toward it.
7. TEST ANCHORS: met. The count assertion was changed by text; new tests are inserted by the `// OpenAPI` banner text, not by line number.
8. KB WIRING GAP: OPEN NOTE. `apps/api/src/main.ts` supplies no `http.kb` to `startApi` (it builds only the anonymous/chat KB ports, main.ts:105 and :124). C4 is proven only with an injected asker (startApi test over real HTTP, loopback). Production knowledge cards do NOT work until the launcher passes a `KnowledgeAsker`; without it the route is 200 with `knowledge: "not_configured"` and no `kb`-sourced card. Go-live row for the orchestrator.
Other notes: the cards call the real counsellor provider per request with no spend or rate guard (the student chain has one); JWT-gated and read-only, go-live row. `cardFeedback` does not check that `cardId` belongs to the session; irrelevant until T-050.

## Acceptance evidence
Round: 1 round, 4 files, 11 criteria, est 90 min - diff of 55c72b4 vs 6b2f99a
Tests[C1]: apps/api/tests/server.test.ts "T-025 api: the OpenAPI document is public and matches the route table (method, path, roles) in both directions" and "T-010 api: the cards routes are counsellor/admin only ..." - the drift test now covers the three new routes in both directions; the count assertion is 16
Pre-check[C1]: 55c72b4 `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 900 pnpm exec tsx --test apps/api/tests/server.test.ts` -> exit 0, 52 tests, 52 passed, 0 failed (35 pre-existing + 17 new)
Tests[C2]: apps/api/tests/server.test.ts "T-025 api: every auth failure on every protected route is the same 401 ..." (now 16 routes x 9 bad-credential variants, identical body and headers, no Db or graph requested, no document changed)
Pre-check[C2]: 55c72b4 `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 900 pnpm exec tsx --test apps/api/tests/server.test.ts` -> exit 0, 52 tests, 52 passed, 0 failed
Tests[C3]: apps/api/tests/server.test.ts "T-010 api: tenant B, with or without its own consent, can neither read nor change tenant A's student on any cards route"
Pre-check[C3]: 55c72b4 `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 900 pnpm exec tsx --test apps/api/tests/server.test.ts` -> exit 0, 52 tests, 52 passed, 0 failed
Tests[C4]: apps/api/tests/server.test.ts "T-010 api: knowledge outages degrade to 'unavailable' ..." and "T-010 api: startApi wires the cards routes to the counsellor provider and the injected KB ..."
Pre-check[C4]: 55c72b4 `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 900 pnpm exec tsx --test apps/api/tests/server.test.ts` -> exit 0, 52 tests, 52 passed, 0 failed
Tests[C5]: apps/api/tests/server.test.ts whole file under a net guard (every socket connect or DNS lookup to a non-loopback host throws and is counted) - a guard probe to example.com is blocked and counted
Pre-check[C5]: 55c72b4 `NODE_OPTIONS="--require <scratchpad>/netguard.cjs" VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 900 pnpm exec tsx --test apps/api/tests/server.test.ts` -> exit 0, 52 passed, 0 failed, NETGUARD "0 blocked non-loopback attempts" (probe: 1 blocked)
Static[C5]: `git diff 6b2f99a 55c72b4 -- apps/api/tests | grep '^+.*https\?://'` minus loopback, example.edu/fees (a string in a fake KB reply) and synthetic hosts gives no hit
Tests[C6]: apps/api/tests/server.test.ts "T-010 api: the cards routes are counsellor/admin only (approver 403, student-role or foreign-key token 401) ..." plus the pre-existing route-enumerating files anonymous-route.test.ts, chat-profile.test.ts (partner-tenant counsellor guard loop), chat.test.ts, partner-openapi.test.ts, student-openapi.test.ts, index.test.ts, main.test.ts
Pre-check[C6]: 55c72b4 `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 900 pnpm exec tsx --test apps/api/tests/anonymous-route.test.ts apps/api/tests/chat-profile.test.ts apps/api/tests/chat.test.ts apps/api/tests/partner-openapi.test.ts apps/api/tests/student-openapi.test.ts apps/api/tests/index.test.ts apps/api/tests/main.test.ts` -> exit 0, 169 tests, 169 passed, 0 failed, 0 skipped (server.test.ts: see Pre-check[C1])
Tests[C7]: apps/api/tests/server.test.ts "T-010 api: without consent (none, revoked, or not covering profile_synthesis) all three routes are the same 403 ..." and "T-010 api: a fenced student ... SAME 403" and "... MID-run ..."
Pre-check[C7]: 55c72b4 `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 900 pnpm exec tsx --test apps/api/tests/server.test.ts` -> exit 0, 52 tests, 52 passed, 0 failed
Tests[C8]: apps/api/tests/server.test.ts "T-010 api: bad bodies and path ids are 400 with issue paths only ..." and the 400 half of "T-010 api: card feedback is honest ..."
Pre-check[C8]: 55c72b4 `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 900 pnpm exec tsx --test apps/api/tests/server.test.ts` -> exit 0, 52 tests, 52 passed, 0 failed
Tests[C9]: apps/api/tests/server.test.ts "T-010 api: live cards show only verified, cited cards (<=3) ..." and "T-010 api: the semantic verifier is mandatory through the API ..."
Pre-check[C9]: 55c72b4 `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 900 pnpm exec tsx --test apps/api/tests/server.test.ts` -> exit 0, 52 tests, 52 passed, 0 failed
Tests[C10]: apps/api/tests/server.test.ts "T-010 api: card feedback is honest: it never persists ..." and the read-only assertions in the live-cards, crisis and tenant tests (`rawAll` before == after)
Pre-check[C10]: 55c72b4 `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 900 pnpm exec tsx --test apps/api/tests/server.test.ts` -> exit 0, 52 tests, 52 passed, 0 failed
Static[C10]: `git diff 6b2f99a 55c72b4 -- apps/api/src | grep -E '^\+.*(insertOne|updateOne|deleteOne|deleteMany|replaceOne|bulkWrite|client\.db\(|findOneAndUpdate)'` gives no hit
Tests[C11]: apps/api/tests/server.test.ts "T-010 api: the API body IS the engine result ..." (deep-equals `runLiveCards` on the same fixture) plus packages/engine/tests/cards-graph.test.ts as the non-regression control; `git diff --stat 6b2f99a 55c72b4` touches no file under packages/
Pre-check[C11]: 55c72b4 `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 900 pnpm exec tsx --test packages/engine/tests/cards-graph.test.ts` -> exit 0, 59 tests, 59 passed, 0 failed; diff stat: 4 files, all under apps/api
Tests[R1]: tsc --noEmit for apps/api
Pre-check[R1]: 55c72b4 `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 900 pnpm --filter @vc/api typecheck` -> exit 0, no output, 0 errors

TDD red: before any production hunk the new test file ran `pnpm exec tsx --test apps/api/tests/server.test.ts` -> 52 tests, 34 passed, 18 failed (the count assertion 16 != 13 in a pre-existing test, and 17 new cards tests: 404 on the missing routes; one setup defect in the startApi test and one wrong AiUnavailableError constructor call were fixed in the tests only, afterwards). After the hunks: 52 passed (one test-side fix between). An earlier full-package run (all 40-odd files, `apps/api/tests/*.test.ts`, run once as a regression probe, not as a builder suite) was 640 tests, 640 passed.

Falsifications (a throwaway detached worktree D:/vc/.worktrees/cards-api-fcopy at the code sha, node_modules junctions, each mutation applied, `tsx --test apps/api/tests/server.test.ts` run under the lock, then restored by rewriting the original file; baseline of the unmodified copy 52/52):
- C1: rename the liveCards path in OPENAPI_DOCUMENT -> 1 failure (OpenAPI drift test); rename it in ROUTES -> 15 failures (drift test plus every cards test).
- C2: getPreBrief made `roles: "public"` -> 10 failures (T-025 401 enumeration, role gate, tenant, consent, fence, pre-brief tests, drift).
- C3: `store: () => deps.dbForTenant("tenant-a")` -> 4 failures (new tenant-B test and 3 pre-existing tenant tests).
- C4: KB client dropped from the engine call -> 2 failures; `startApi` not passing `http.kb` -> 1 failure; `startApi` passing `httpSetup.studentProvider` instead of the counsellor provider -> first SURVIVED (test gap: studentProvider equals provider unless VC_TEXT_CHAIN is set), fixed by a third startApi variant with `CHAIN_ENV` (55c72b4), re-run -> 1 failure.
- C6: approver added to liveCards roles -> 2 failures (role-gate test, drift).
- C7: a `refused` engine result returned as 200 instead of 403 -> 3 failures.
- C8: LiveCardsBodySchema not strict -> 1 failure (bad-bodies test); CardFeedbackBodySchema not strict -> 1 failure (feedback test).
- C9: engine `unresolved_source` drop disabled (copy only) -> 5 failures.
- C10: a `decisions` insert before the engine call in cardFeedback -> 4 failures; the typed unavailable error mapped to 201 `feedbackId` -> 3 failures. (First attempts that placed the insert/201 AFTER the throwing engine call survived because that code is unreachable: equivalent mutants, replaced by the two above.)
- C11: an extra field added to the 200 body -> 1 failure (API body == engine result).
- Conditions 1/2: ProviderAuthorizationRefusedError mapping removed -> 2 failures; cards-only scope dropped from mapError -> 1 failure (scoping test); AbortError mapping removed -> 1 failure; liveCards unconfigured check removed -> 1 failure.
- C5: not a code lever: the netguard run above (0 blocked attempts) and its probe (1 blocked).

Metrics: 4 files changed (+784 lines, 8 removed), 17 new tests, 0 tests deleted or weakened (one assertion message and count changed 13 -> 16 as the plan requires), 1 manifest, suite_runs 0 (named files only; the one package-wide probe run is disclosed above).

Deviations and residuals for the checker:
1. Files are CRLF in the working copy and LF in the index (autocrlf).
2. The liveCards route spreads no field of `ctx.cards` into the engine call except `provider`, `skillsDir` and `kb`, so a future `LiveCardsWiring` field cannot leak in silently.
3. Q1/Q2/Q3/Q5 defaults as reviewed: no `requireSession` on liveCards, 503 `cards_deadline` (not 504), no `semanticVerifier` on the API. Q4: cardFeedback shipped as the typed 503.
4. `senior-software-engineer` review is not run here (a build subagent does not self-review); the dual checkers are the review.

**Fix cycle:** 0
