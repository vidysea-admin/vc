# Plan review 1: cards-api (independent, D-030 route)

Reviewer: fresh independent plan reviewer (not the plan author). Read-only: no code edited, no tests or live calls run.
Reviewed: qa/evidence/p2-cards-api/plan.md at 0c93cfe, against main debe3f9, branch wave/t-010-live-cards fb5959c (read via git show).
Written: 2026-10-25T09:17:24+05:30

## Verdict: PLAN-APPROVE with 8 binding conditions

The architecture is sound (hand-port of 4 files, no packages/ edit, engine path untouched, no new auth code). Condition 1 is a factual error in the plan's expected outputs that makes its test 7 red as written; conditions 2-8 are scope and evidence fixes. None needs a product decision, so there is no HUMAN_GATE.

## Findings per brief item

### 1. Criteria C1-C11
Text is verbatim except these defects (checked with sed against qa/contracts/counselling-engine.md):
- C5 cites ":343"; the text is at :339-340.
- C6 cites ":350-352, :366-367"; the real lines are :343-344 (all-routes-401 enumeration) and :351-352 (cross-role rejection). :366-367 is the B22 rubric text.
- C2 is not verbatim: it elides "(student routes: see Student identity below). VC has no login screen and no password store." with "...". Acceptable because the elision is marked, but the "verbatim" header is then loose.
- Missing in-scope lines: B9 :205 (crisis before any generative call; plan test 11 asserts it with no owning criterion), B20 :313 (concern check-in is a live-card question), B18 :294 and :297 (the contract names "from T-010 live cards" and an outcome test), B15 :254 (erasure covers cards/feedback; moot while nothing is written, but T-050 must inherit it).

### 2. Anchors (22 spot-checked)
Exact: server.ts :84, :165-171, :195-203, :266, :290, :455-456, :635, :648, :651, :710-717; index.ts :28, :102-104, :296-306, :797-818, :531, :663-664; openapi.ts :34-40, :181-186, :326. Branch: git diff --stat 3b8609a..fb5959c -- apps/api is 4 files, 328 insertions, as claimed; branch server.ts :108-122 and :312-372 match S2/S3/S7. The cardId pattern matches verifier.ts:503 (card_ plus 24 hex).
Stale: apps/api/tests/server.test.ts. The count assertion is at :205 (plan says :202), the OpenAPI banner at :884 (plan :882), the drift test starts at :887 (plan :893). Non-blocking; anchor by text.

### 3. Tenancy, JWT, consent per route
The pipeline is inherited unchanged (verify, role gate, PATH_ID_PATTERN, tenant from the token only; server.ts ~:688-717). A student-role token cannot verify (auth.ts API_ROLES has no student), so it gets 401; an approver gets 403. Correct.
Gaps in the test set: test 5 proves a tenant-B boundary with B consent only for liveCards; for getPreBrief and cardFeedback it uses the no-consent case, which proves consent, not tenancy. Test 6's "zero reads of facts via w.calls" is unverifiable (w.calls records dbForTenant/graph requests, not reads).

### 4. No bypass
Confirmed. runLiveCards (graph.ts ~:265) parses input, then runs consent, crisis (checkConcerns), profile, KB, planner, mandatory semantic verify (nodes.ts:228-280; semanticVerifier is legacy, nodes.ts:57), select. Dropped cards return a reason only (DroppedCardSchema, schemas.ts:87). The route must not rewrite the result; S3 correctly keeps semanticVerifier off LiveCardsWiring. Note: consent runs before the crisis node, so a crisis turn for an unconsented student gets 403 and no escalation (same as the scribe path); test 11 must seed consent.

### 5. New error mappings
- ProviderAuthorizationRefusedError: really thrown on main's path (graph.ts:99-107 authorize, :257 publication re-check, unscoped db at :288/:304). Exported from @vc/providers; the import in S1 is right.
- AbortError: really thrown (DOMException; graph.ts ~:245, nodes.ts:150-158, 207-210). A provider-thrown AbortError is rethrown by planCards (nodes.ts:215-221 swallows only AI_DOWN_ERRORS), so test 12 is reachable.
- CardFeedbackUnavailableError: plain Error with .name set (graph.ts:307-309); a name match is the only option. Safe on that route.
- UNSAFE as planned: mapError(err) is global (called at server.ts:853 with no route id). The three new mappings therefore also change the scribe, approval and erasure routes (scribe/nodes.ts:121 throws AbortError "Scribe execution cancelled."; today these are logged 500s) and would label them cards_deadline. See condition 2.

### 6. liveCards without requireSession
Safe. The Db is tenant-scoped from the verified token, so a tenant-B token cannot reach tenant-A rows; a student id with no B consent returns the same 403 consent_required as a non-existent id (no existence oracle). requireSession would add a 404-vs-403 oracle. Within a tenant it matches getProfile (no per-counsellor ownership model). Q2 default accepted.

### 7. Open-question rulings
- Q1 (liveCards fence/consent-loss status): see condition 1. Ruling: do NOT add an extra assertStudentNotFenced in the route. requireConsent (packages/db/src/consent.ts, via isStudentFenced) deliberately throws the generic ConsentRequiredError for a fenced student (ISS-043 / D-015: do not reveal that an erasure is running). A distinguishing 409 would be an erasure-in-progress oracle.
- Q2 default NO: accepted.
- Q3 default NO: accepted.
- Q4 ship cardFeedback as a typed 503: accepted with condition 6.
- Q5 503 cards_deadline (not 504): accepted (the API is the origin; consistent with writer_deadline 503).

## Binding conditions

1. FENCE BEHAVIOUR (plan section 3 table, test 7 and Q1 are wrong). In buildPreBriefFor (graph.ts:290), recordLiveCardFeedback (graph.ts:305) and liveCards' consent node (scribe/nodes.ts:130 checkConsent), requireConsent runs first and throws ConsentRequiredError for a fenced student. A fenced student therefore gets 403 {"error":"consent_required"} on ALL THREE routes, not 409 student_fenced (pre-brief, feedback) or 403 authorization_refused (liveCards). Rewrite test 7: fenced student => 403 consent_required on all three, response body byte-identical to the no-consent body, provider/planner never called, no write. The 409 student_fenced and 403 authorization_refused mappings stay (race and mid-run revocation) but must be proven with a different fixture (consent row deleted or fence inserted from inside a mock provider call, as the existing fence-race tests near server.test.ts ~:475 do), not with a pre-seeded fence.
2. S8 SCOPE. Do not let mapError change other routes silently. Either pass route.id into mapError and apply AbortError and CardFeedbackUnavailableError only for the three cards route ids, or keep them global with neutral codes and add a test that pins the new behaviour on a non-cards route. Match with exact name equality on an Error/DOMException instance (err instanceof Error && err.name === "AbortError"). State in the manifest that ProviderAuthorizationRefusedError becomes a constant 403 body everywhere.
3. TENANCY TESTS. Add: tenant-B token WITH B consent seeded against tenant-A's student id for getPreBrief (body contains no tenant-A fact value, id or doNotAsk entry) and for cardFeedback (503, tenant-A rows unchanged). Replace the "zero reads of facts via w.calls" claim in test 6 with an assertion the harness can make (planner call count 0, plus a fake-collection read counter if one exists, otherwise drop the claim).
4. CRITERIA TABLE. Correct the C5 and C6 line cites (above); mark C2 as elided; add B9 :205, B20 :313, B18 :294/:297 as touched-not-owned rows tied to tests 11 and 8; note B15 :254 for T-050.
5. OPENAPI HONESTY. Document only reachable responses. The 503 ai_unavailable on liveCards is not reachable from runLiveCards (planCards and semanticVerify convert AiUnavailableError into a 200 body with status ai_unavailable, nodes.ts:189-221, 270-273); drop it unless test 12 demonstrates it. Add droppedCount and escalation to the optional 200 properties.
6. cardFeedback (Q4). The OpenAPI description and the manifest must say the route does not persist feedback and returns 503 by design; T-050 stays open and nothing is credited toward it.
7. TEST ANCHORS. Use the corrected server.test.ts anchors (:205, :884, :887) or text anchors.
8. KB WIRING GAP. apps/api/src/main.ts wires only the anonymous KB client (main.ts:104); nothing supplies http.kb in the real launcher, and the plan does not touch main.ts. C4 is therefore proven only with an injected asker (test 14). Record this in the manifest as a go-live gap; do not claim production knowledge cards work.

## Non-blocking notes
- Cards call the real counsellor provider per request with no spend or rate guard (the student chain has one). JWT-gated and read-only, so acceptable here; worth a go-live row.
- cardFeedback does not check that cardId belongs to the session; irrelevant while nothing is written, T-050 should add it.

## Not done by this review
No tests, builds or live calls were run (brief: read-only plan review). Runtime-behaviour claims above come from reading the code at main debe3f9.

PLAN-APPROVE
