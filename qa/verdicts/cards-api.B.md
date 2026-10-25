# Verdict: cards-api (coordinator B of a DUAL check)
**Cycle checked: 0**
**Checker:** /checker coordinator B (Mode A), blind to coordinator A (A's verdict, checkpoint and scratch were not read)
**Unit:** worktree D:/vc/.worktrees/cards-api, branch wave/cards-api, head f046a36 (code c569094 + 55c72b4), base 6b2f99a, Fix cycle 0
**Checked at:** 2026-10-25T09:58:26+05:30
**Policy-Version:** proportional-verification/2026-10-19.17 (Tier L, dual-trigger tenancy server.ts:824, auth server.ts:797)

VERDICT: PASS

In a dual check this verdict has no side effects: findings are PROPOSED-ISSUE lines; qa/issues.jsonl, the artifact, .claude/**, gates and contracts were not edited.

Metrics: tier=L; wall~25min; own_tests=9 hostile (CHKB-1..9, all pass) + 221 reruns (0 fail); mutations=11 (10 killed, 1 equivalent survivor); netguard blocked=0 (probe blocked 1); suite_runs=0 (named files only)

## Environment note (read first)
At 09:36 the builder's command (`pnpm exec tsx ...` in the worktree) failed for me with "tsx not found": the shared store D:/vc/node_modules/.pnpm had its package directories emptied (tsx, typescript, jose, zod, ws, @langchain/*, @opentelemetry/* ...; dir mtimes 09:34), so builder run identity could not be reused or reproduced in the worktree. Someone began re-populating it at about 09:52 (not me). I did NOT touch the store or the main tree. I built an isolated tree: `git archive f046a36` into my scratchpad, `pnpm install --offline --frozen-lockfile --ignore-scripts` (the only edit: `@google/genai` removed from that copy's lockfile and packages/engine/package.json because it is absent from the offline store and used only by packages/engine/evals/run-live.ts, not by apps/api). All source under judgment (apps/api/src, apps/api/tests/server.test.ts, packages/engine/src) is byte-identical to f046a36. Every number below is from that tree under vc-testlock.

## Executed (own runs, not reused)
- `VC_TESTLOCK_TIMEOUT_SECS=7200 bash scripts/vc-testlock.sh timeout 900 pnpm exec tsx --test apps/api/tests/server.test.ts` -> exit 0, tests 52, pass 52, fail 0.
- `... pnpm --filter @vc/api typecheck` (tsc --noEmit) -> exit 0, no output.
- `... tsx --test packages/engine/tests/cards-graph.test.ts` (non-regression control) -> 59 tests, 59 pass.
- server.test.ts + anonymous-route, chat-profile, chat, partner-openapi, student-openapi, index, main under my OWN netguard (net.Socket.connect and dns.lookup to non-loopback throw and are counted; probe of example.com was blocked, count 1) -> 221 tests, 221 pass, 0 skip; NETGUARD "0 blocked non-loopback attempts" (printed by each of 11 processes). C5 holds.
- Static: no write verb (insertOne, updateOne, deleteOne, deleteMany, replaceOne, bulkWrite, findOneAndUpdate, client.db() ) in `git diff 6b2f99a f046a36 -- apps/api/src`; the diff touches no file under packages/ (5 files: 3 api src, server.test.ts, the manifest).

## Hostile probes of my own (scratch copy of server.test.ts + appended tests; none are the builder's)
- CHKB-1 auth: 18 bad-credential variants x 3 routes (no header, empty Bearer, Basic scheme, garbage, expired, wrong issuer, foreign key, tampered payload tenant-b, alg none, HS256 signed with the public key, missing tenant, tenant array, tenant with colon, empty tenant, role "Counsellor", unknown role, missing counsellorId, student-role token): every one the identical `{"error":"unauthorized"}` 401, w.calls == {db:[],graph:[]}, zero provider calls. PASS.
- CHKB-2 tenancy / oracle: tenant-B token (a) without consent, (b) with its own consent, against tenant-A's student id versus a nonexistent id: status and body BYTE-IDENTICAL on all 3 routes in both cases (no existence oracle). B scribed and approved its own student under the same id: B's brief shows B's two facts; A's fact documents byte-unchanged. PASS.
- CHKB-3 write spy: a Proxy over every fake collection counts write methods; 2 cardIds x 3 routes plus a feedback for a session that does not exist plus a NUL-bearing note -> 0 write calls, feedback always `503 {"error":"card_feedback_unavailable"}`. Control: the scribe route through the same spy -> 20 write hits (instrument valid). PASS.
- CHKB-4 crisis: 7 windows (plain English; quiet:true; crisis only in an OLDER turn; crisis only in translatedText; Hinglish; a counsellor-spoken report; self-harm) -> every one `200 status=escalated cards=0`, provider calls 0. A crisis-bearing input never returns plain cards. PASS.
- CHKB-5 semantic verifier: verifier output empty decisions / all noScript violations / citation violation / garbage shape / decisions for unknown ids only -> 200, cards=[] each, no card text in the body; a verifier that THROWS a generic Error -> logged 500 `internal`, still no card (fail closed). PASS.
- CHKB-6 mapError scope: scribe, approval and erasure-requests with graphForTenant and dbForTenant throwing: DOMException AbortError, Error named AbortError and Error named CardFeedbackUnavailableError stay `500 {"error":"internal"}`; AiUnavailableError stays `503 ai_unavailable` on all three (condition 2). PASS.
- CHKB-7 REAL deadline: a planner that never resolves -> `503 {"error":"cards_deadline"}` after 45003 ms, log line `AbortError:20` (no ids, no text). The DOMException-is-an-Error path really maps; it is not a silent no-op. PASS.
- CHKB-8: fence only, consent revoked only, both -> the same single body `{"error":"consent_required"}` (403) on all 3 routes, zero provider calls. No erasure oracle. PASS.
- CHKB-9: cardFeedback body hostile set (trailing junk, newline suffix, prefix, uppercase hex, short id, array/number action, non-string note, empty/array/null/string body) -> all 400. PASS.

## Falsifications, one per changed criterion, in my copy, my own mutation (builder tests + my CHKB tests run for each; restored after)
Control (unmutated, 25 selected tests): 25 pass.
- C3 tenancy: `store: () => deps.dbForTenant(tenantId === "tenant-b" ? "tenant-a" : tenantId!)` -> 2 FAIL (builder tenant test, CHKB-2).
- C2/C6 auth: liveCards `roles: "public"` -> 16 FAIL.
- C7 consent: both requireConsent calls removed from buildPreBriefFor (engine copy) -> 5 FAIL.
- C7 refusal mapping: `refused` result returned as 200 -> 4 FAIL.
- C10 no-write: a decisions insertOne before the engine call in cardFeedback -> 6 FAIL (incl. CHKB-3 spy).
- Condition 2: mapError AbortError/feedback mapping unscoped (any route) -> 2 FAIL.
- C9 semantic verifier: clearIds = all cards (engine copy) -> 2 FAIL.
- B9 crisis: escalation forced null (engine copy) -> 2 FAIL.
- Deadline mapping: AbortError line removed -> 1 FAIL.
- C8 card id: anchors removed from CARD_ID_PATTERN -> 1 FAIL, and ONLY my CHKB-9; the builder's 17 new tests do not pin the anchors (see PROPOSED-ISSUE 4).
- C10/T-050: route returns `201 feedbackId` after the engine call -> SURVIVED, equivalent mutant (recordLiveCardFeedback always throws first, so the line is unreachable). The route's honesty rests on the engine throwing; the builder's own earlier note and the manifest say the same. Not a gap in this slice.

## Criteria
C1 PASS (OpenAPI drift test both directions covers the 3 routes; count 16; cardFeedback 503 and liveCards 503 cards_unavailable/cards_deadline documented and the deadline is real, CHKB-7). C2 PASS (CHKB-1). C3 PASS (CHKB-2, M1). C4 PASS as scoped (asker injected via startApi over loopback HTTP; no-KB is `knowledge: not_configured` and no kb-sourced card; see PROPOSED-ISSUE 1 for the launcher). C5 PASS (own netguard 0 blocked). C6 PASS (approver 403, student/foreign-key 401, the route-enumerating files green, M2). C7 PASS (CHKB-8, M3/M4). C8 PASS (CHKB-9, bad-bodies test). C9 PASS (CHKB-5, M8; dropped cards return ids and reasons only, never text). C10 PASS (spy, static grep, M5). C11 PASS (API body deep-equals the engine result; cards-graph 59/59 control). Touched-not-owned B9/B20/B18/B15 rows: crisis variants and verifier results above; engine owns them and is unchanged.

## Findings (PROPOSED-ISSUE lines; none is a contract line required by this slice)
1. PROPOSED-ISSUE (medium, go-live): apps/api/src/main.ts supplies no `http.kb` to startApi (it builds only the anonymous/chat KB ports, main.ts:105 and :124). In production the liveCards route answers 200 with `knowledge: "not_configured"` and no kb-sourced evidence card. Fail-safe (never uncited) but the knowledge half of C4 is not live until a launcher unit passes a KnowledgeAsker.
2. PROPOSED-ISSUE (medium, go-live): no spend or rate guard on liveCards. Any valid counsellor/admin token can drive unbounded paid counsellor-provider calls (planner + verifier, up to 45 s each) per request. JWT-gated and read-only, so not a tenancy or consent defect; the student chain has a guard, this route does not. The contract USD caps (lines 571-572) govern g-real runs, not this API, so no FAIL.
3. PROPOSED-ISSUE (low, T-050 must inherit): cardFeedback does not check that `cardId` belongs to the session or student, and any well-formed id is accepted. Harmless today (nothing is read or stored, so no oracle either way, CHKB-3); the T-050 writer must add the ownership check before persisting or one session can poison another's feedback. Judged as a finding, not a defect in this slice.
4. PROPOSED-ISSUE (low, test gap): CARD_ID_PATTERN anchoring (`^...$`) is not pinned by any builder test; removing both anchors survives all 52 tests. A test posting `card_<24hex>x` and `card_<24hex>\n` expecting 400 closes it (CHKB-9 shows the shape).
5. PROPOSED-ISSUE (low): a verifier or planner that throws a generic Error (not ModelOutputSchemaError or an AI-down class) surfaces as a logged 500 `internal`, not the engine's fail-closed 200 body. No card is ever shown (fail closed holds), so safety is intact; only the client-visible shape differs.
6. NOTE (design, unchanged by this slice): the engine runs the consent gate before the crisis gate, so a crisis-bearing window for a student with no consent is 403 consent_required, not escalated. This is B4 as built in packages/engine (graph.ts consent_gate -> crisis_gate); the human counsellor is in the session. Flagging for the orchestrator only.
7. NOTE (as the manifest states, accepted by review-1): `ProviderAuthorizationRefusedError` is now a constant `403 {"error":"authorization_refused"}` on EVERY route (global); CHKB-6 and the builder's scope test show nothing else moved.
8. NOTE (environment): the shared node_modules store emptiness described above; the builder's pre-check lines cannot be re-run from the worktree until the store is repopulated. This is environmental, not a code defect.
