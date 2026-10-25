# Plan: t-010 slice (a) cards-api, port the /v1 cards API onto main

Planner: /maker (read-only toward code). Written 2026-10-25T09:10+05:30. Base: main 852e0e8 (engine at fe0937e / D-079 plus T049/T050 hardening, never replaced). Source branch: `wave/t-010-live-cards` tip fb5959c, read only with `git show`. Tier L, dual check REQUIRED (auth, tenancy and a consent gate change; dual trigger lines in section 3).

Scope: `getPreBrief`, `liveCards`, `cardFeedback` routes, their OpenAPI paths, `LiveCardsWiring` / `ApiDeps.cards`, and the `startApi` passthrough. Out of scope: the card-feedback WRITER (T-050; the route returns the engine's typed unavailable error, section 2.5), the web panel (`apps/web`, B17), the B19 runner, B1/B18 leak units. The one `packages/db/src/decisions.ts` change on the branch (a252ce1, +133 lines, `recordCardFeedback`) is NOT ported: TASKS.md T-050 says "Do not port retained db/decisions rejection-writer refactor wholesale across T045/T046".

Plan-level fact that changes the port (found by reading main, not by the K1 table): the branch API diff is only 4 files, 328 inserted lines (`git diff --stat 3b8609a wave/t-010-live-cards -- apps/api`: index.ts +12, openapi.ts +68, server.ts +82, server.test.ts +169), all already confirmed free of later cycles (cycles 1-3 touched only engine/schemas files). So the API half is a hand-port of ~160 source lines onto a server.ts that has since grown from 11 to 14 routes (10 -> 13 protected) and to 1002 lines. The conflicts w1-cards-b1 hit (K1 re-scope note in `qa/manifests/w1-cards-b1.md:12`) are positional (the same hunks anchored in files that moved), not semantic. Semantic differences are in section 2.

## 1. Criteria in scope (verbatim, `qa/contracts/counselling-engine.md`)

| id | contract | verbatim text |
|---|---|---|
| C1 | B21 :320 | "Every capability (scribe, approval, profile, cards, timeline, erasure, export) is reachable through a versioned HTTP API described by an OpenAPI document in the repo." |
| C2 | B21 :322-327 | "**Auth:** every request, except the anonymous routes of the **anonymous-route exception** below, carries a JWT issued by the client backend (for Pathlynks, its backend). VC verifies signature, expiry and issuer, and reads the `tenant`, `counsellorId` and `role` claims ... A missing, expired, wrong-issuer or tampered token gets 401, and nothing is read or written." |
| C3 | B21 :330-331 | "**Tenancy:** the verified `tenantId` is stamped on every document and filters every query. A test proves tenant A can never read or change tenant B's student." |
| C4 | B21 :332-334 | "**Knowledge:** university and seminar knowledge comes from the KnowledgeBase over its API (`POST /ask`, Bearer key from `.env`, B11). Its citations are carried through (B2). A KB outage degrades to "knowledge unavailable"; it never produces an uncited answer." |
| C5 | B21 :343 | "Tests use a locally signed test JWT and a fake KB. Nothing connects to the real Pathlynks backend until an integration unit is approved." |
| C6 | B21 :350-352, :366-367 | "Every other route, including every student, counsellor and admin route and the voice routes, still gets 401 without a valid JWT, and a test enumerates the registered routes to prove it." and "A counsellor or admin token on a student route is rejected, and a student token on a counsellor or admin route is rejected." |
| C7 | B4 :164-165 | "Every fact carries purposeTags + sensitivity. A session without a recorded consent row cannot be processed on the counsellor-session path. A test covers it." |
| C8 | B5 :178 | "Every graph node's input and output is a Zod schema. No free text passes between nodes." (API boundary: body and path parsed by Zod before the engine; result parsed on the way out by `runLiveCards`.) |
| C9 | B2 :51 | "Every fact shown or stored carries a source (KB record id + fetchedAt, profile fact id, or transcript quote + turn)." (Route returns only `VerifiedCard`s; a dropped card's text never leaves the server.) |
| C10 | B12 :216-222, B8 :203 | "The engine's only database there is `virtual_counsellor`" and "Nothing else on the production server is ever written." (cards routes read only; the feedback route writes nothing, see 2.5.) |
| C11 | B1 :39, B18 :293-296 | "No card, prompt or skill output may be a full sentence for the counsellor to recite." and "An approved fact is never asked again as if it were unknown." (Engine owns both on main; the API must not add a path around them: no field of the engine result is rewritten, filtered or re-derived in `server.ts`.) |

C1-C6 and C10 are the unit's own criteria (B21 PARTIAL in `qa/evidence/w1-cards-b1-t010-vs-main.md:27`). C7-C9, C11 are touched-not-owned: the unit proves the API surface preserves them end to end, and does not re-prove the engine.

## 2. Per-file hunk list (edit in place; NO new source file)

Branch hunks are cited as `wave/t-010-live-cards:<path>` diff against merge-base 3b8609a (`git diff 3b8609a wave/t-010-live-cards -- <path>`); main anchors are current lines at 852e0e8.

### 2.1 `apps/api/src/server.ts` (1002 lines, +~95)
| # | main anchor | what | source |
|---|---|---|---|
| S1 | import block `server.ts:58-83` (`@vc/engine`) | add `LiveCardsInputSchema, buildPreBriefFor, recordLiveCardFeedback, runLiveCards, type KnowledgeAsker`, keeping the alphabetical order of the existing block; add `ProviderAuthorizationRefusedError` to the `@vc/providers` import (`server.ts:84`, next to `AiUnavailableError`) | branch server.ts import hunk (@@ -46,13), plus the providers name which the branch never needed |
| S2 | `ApiDeps` after `webhooks?` (`server.ts:165-170`, before the closing `}` at :170) | `cards?: LiveCardsWiring;` with the doc comment | branch hunk @@ -106,6 (:111-119 of the branch) |
| S3 | after `ApiDeps` (`server.ts:171`) | `export interface LiveCardsWiring { provider; skillsDir; kb?; semanticVerifier? }` | same branch hunk. Keep `semanticVerifier?` out: main's `LiveCardsDeps.semanticVerifier` (nodes.ts:57) is "legacy ... mandatory regardless", so exposing it on the API would advertise a knob that does nothing. Open question Q3. |
| S4 | `RouteContext` (`server.ts:195-203`) | `cards?: LiveCardsWiring;` after `writerDeadlineMs` (:203) | branch hunk @@ -140,6 |
| S5 | body schemas after `ReconfirmBodySchema` (`server.ts:266`) | `LiveCardsBodySchema = z.object({ turns: z.unknown(), quiet: z.boolean().optional() }).strict()`; `export const CARD_ID_PATTERN = /^card_[0-9a-f]{24}$/` (verified against `verifier.ts:503` `card_${digest.slice(0, 24)}`); `CardFeedbackBodySchema` | branch hunk @@ -162,6 |
| S6 | after `NOT_FOUND` (`server.ts:290`) | `const CONSENT_REQUIRED: Result = { status: 403, body: { error: "consent_required" } }` | branch hunk @@ -194,6. Main already has `ConsentRequiredError` -> the same body in `mapError` (:648); reuse the literal, one source of the string. |
| S7 | `ROUTES` after `getProfile` (route ends `server.ts:455`, before `requestErasure` :456) | three route entries `getPreBrief`, `liveCards`, `cardFeedback` | branch hunk @@ -286,6 (:315-369 of the branch); **changed from the branch, see 2.4/2.5** |
| S8 | `mapError` (`server.ts:635`), directly after the `AiUnavailableError` line (:651) | add 3 mappings: `ProviderAuthorizationRefusedError` -> 403 `{error:"authorization_refused"}`; an `AbortError` (`err.name === "AbortError"`) -> 503 `{error:"cards_deadline"}`; `err.name === "CardFeedbackUnavailableError"` -> 503 `{error:"card_feedback_unavailable"}` | NEW (not on the branch). Needed because main's graph differs: see 2.3. `CardFeedbackUnavailableError` is a plain `Error` with `.name` set (`graph.ts:307-308`), not a class, so it is matched by name; do NOT add a class to the engine in this unit. |
| S9 | `createApiHandler` ctx (`server.ts:710-717`) | `...(deps.cards ? { cards: deps.cards } : {})` after the `writerDeadlineMs` spread (:717) | branch hunk @@ -462,6 |

### 2.2 `apps/api/src/openapi.ts` (819 lines, +~68)
Insert three path objects between `"/v1/students/{studentId}/profile"` (ends :183) and `"/v1/students/{studentId}/erasure-requests"` (:185), exactly the branch hunk @@ -149,6 (`pre-brief`, `.../cards`, `.../cards/feedback`) with `x-roles: ["counsellor","admin"]`, plus these changes from the branch text:
- `cardFeedback` response: replace `"201": ok("The stored feedback id", ...)` with `"503": { description: "Card feedback persistence is unavailable (T-050)", ...json({ $ref: "#/components/schemas/Error" }) }` and keep `...errors`. Documenting a 201 that main cannot return would be a lie in the contract document (C1, B14).
- `liveCards` 200 schema: main's result is a union (`LiveCardsResultSchema`, `schemas.ts:120-147`): `status` is `ok | ai_unavailable | planner_failed | escalated` (+ `refused` never reaches 200, it is 403). Keep the branch's loose shape but add `held`, `suppressedByQuiet`, `dropped`, `knowledge`, `quiet`, `preBrief` as optional properties and `required: ["status","cards"]` (the branch listed only `status` required). `...errors` (openapi.ts:34-40) already supplies 400/401/403/404/409; add `"503"` for `cards_unavailable`, `cards_deadline` and `ai_unavailable`.
- Do NOT touch `STUDENT_API_DRAFT` (:326) or the partner document: `student-openapi.test.ts:27-31` and `partner-openapi.test.ts:126` assert these paths are not in them. Verified by grep: no hit for `pre-brief`/`/cards` anywhere in `apps/api` on main.

### 2.3 `apps/api/src/index.ts` (885 lines, +~8)
| # | main anchor | what | source |
|---|---|---|---|
| I1 | `@vc/engine` import `index.ts:28` (the line that imports `initScribeCheckpointer`) | add `type KnowledgeAsker` | branch hunk @@ -14 |
| I2 | `apiStatus()` `index.ts:102-104` | string must still match `/HTTP API .*opt-in/` (`tests/index.test.ts:9`); append "live cards (T-010)" | branch hunk @@ -24 (it dropped nothing the test needs) |
| I3 | `StartApiHttpOptions` `index.ts:296-327`, after `skillsDir?` (:305) | `kb?: KnowledgeAsker` with the branch's doc comment | branch hunk @@ -45 |
| I4 | `createApiHandler({...})` `index.ts:797-818` (verifier at :798, `...wiring` NOT spread on main: dbForTenant/graphForTenant are explicit at :799-800), after `graphForTenant` | `cards: { provider: httpSetup.provider, skillsDir: httpSetup.skillsDir, ...(http?.kb ? { kb: http.kb } : {}) }` | branch hunk @@ -146 (it used `...wiring`; main does not, so the branch line cannot be pasted). Which provider: `httpSetup.provider` (the counsellor/scribe provider, `index.ts:531`), NOT `httpSetup.studentProvider` (student surface, text chain): cards are counsellor-facing. |

Conflict notes (what w1-cards-b1 saw): index.ts conflicts were the `StartApiHttpOptions` neighbours (anonymous/chat/voice/partners options added between :305 and :327) and the `createApiHandler` call (webhooks/erasureConfig added); server.ts conflicts were the `ApiDeps`/`RouteContext` neighbours (`erasureConfig`, `webhooks`, `emitWebhookEvents`, `checkFactReadbackGap` all new since the base) and the `ROUTES` tail; server.test.ts conflicts were the `as()` signature, `world()` (erasureConfig) and the 10 -> 13 count assertion (:202). All resolve by anchor placement above; none by taking either side wholesale.

### 2.4 Route bodies (S7), main-specific decisions
- `getPreBrief` (GET `/v1/students/{studentId}/pre-brief`, `ANY_ROLE`): `run: async (ctx) => ({ status: 200, body: await buildPreBriefFor({ db: ctx.store() }, { studentId: ctx.params.studentId! }) })`. Same as the branch. `buildPreBriefFor` (`graph.ts:287-297`) does consent, then `loadKnownFacts`, consent again, `assertStudentNotFenced`; a no-consent call throws `ConsentRequiredError` -> existing 403 mapping. No provider, no write.
- `liveCards` (POST `.../sessions/{sessionId}/cards`, body `LiveCardsBodySchema`): keep the branch order, with the 503-when-unconfigured check moved BEFORE the engine call but AFTER body parse:
  1. `parseWith(LiveCardsInputSchema, { sessionId: ctx.params.sessionId, studentId: ctx.params.studentId, turns: body.turns, ...quiet })` -> 400 `invalid_request` with issue paths only (the ids come from the path, a body `studentId` is refused by `.strict()` on `LiveCardsBodySchema`; `runLiveCards` would otherwise throw a bare `ZodError` that `mapError` does not know = a logged 500).
  2. `if (!ctx.cards) return 503 { error: "cards_unavailable" }` (branch behaviour; the pre-brief route needs no provider).
  3. `runLiveCards({ db: ctx.store(), ...ctx.cards }, input)`; `result.status === "refused"` -> 403 `consent_required`; else 200 with the result unchanged.
  - NO `requireSession` (`server.ts:287`) on this route, unlike `getTranscript`/`getApproval`: a live window is read DURING a counselling session, before the scribe has written the `sessions` row (`hasStudentSession`, `packages/db/src/facts.ts:973`). Adding it would 404 every real live use. Cross-tenant and cross-student reads are blocked by the tenant-scoped Db and the consent gate instead (C3, C7). Open question Q2 records the alternative.
- `cardFeedback`: see 2.5.

### 2.5 `cardFeedback` on main (the one deliberate divergence from the branch)
Branch behaviour (201 + a stored `decisions` row) is not portable: main's `recordLiveCardFeedback` (`graph.ts:299-310`) consent-checks, fence-checks, then throws `CardFeedbackUnavailableError` and writes nothing (T050, D-079; TASKS.md T-050 open). Route behaviour on main:
1. body `CardFeedbackBodySchema` strict: `cardId` matches `CARD_ID_PATTERN`, `action` in `up|down`, `note` <= 500; `ts` is NOT accepted from the client (server clock, as the branch), so a body `ts` is 400.
2. `recordLiveCardFeedback(ctx.store(), { studentId, sessionId, counsellorId: ctx.auth.counsellorId, event: { cardId, action, ts: Date.now(), note? } }, { deadlineMs? })` exactly as the branch call.
3. Outcomes: no consent -> `ConsentRequiredError` -> 403 `consent_required`; fenced student -> `StudentFencedError` -> 409 `student_fenced` (existing mapping, :648); consent + not fenced -> `CardFeedbackUnavailableError` -> 503 `card_feedback_unavailable` (S8). Never 201, never a fabricated `feedbackId`, no document written (C10). When T-050 delivers the durable writer, only the `try` outcome and the OpenAPI 201 change.
4. Why a route at all: C1 lists "cards" as a capability and the branch/B21 name `cardFeedback`; shipping the typed 503 keeps the contract surface honest and gives T-050 its HTTP seam. Q1 asks Umesh whether to ship it now or hold the route until T-050 (default in this plan: ship, as 503).

### 2.6 Tests (existing files only)
`apps/api/tests/server.test.ts` (1219 lines): append a `// T-010 ...` section before the `// OpenAPI` banner (:882) and change :202. No other test file is edited in this unit (the route-enumerating tests pick the new routes up automatically; see the affected set in section 6). Branch test hunk: `git diff 3b8609a wave/t-010-live-cards -- apps/api/tests/server.test.ts` (+169 lines; its helper `cardsProvider`, `approvedWorld`, five tests). The rewrite for main (listed in TDD order in section 4):
- `cardsProvider()` must ALSO answer the `verifier` skill: main's semantic verification is mandatory (`nodes.ts:228-276`; `semanticVerify` drops every card with `verifier_rejected` when the provider supplies nothing). Reuse the shape from `packages/engine/tests/cards-fixtures.ts:92`: `verifier: (input) => ({ decisions: input.cards.map(c => ({ cardId: c.id, noScript: "clear", citation: "clear", confidence: 1, offendingSpans: [] })) })`. The branch helper only had `exploration-planner`.
- The branch's expectations of dropped reasons (`["script_like","uncited","unresolved_source"]`, `droppedCount 3`) and kept types (`["widen","clarify"]`) were produced by T-010's cycle-0 verifier; main's verifier (cycle 3 rules plus K2 of w1-cards-b1) must be re-measured, not copied: write the test to assert OUTCOME properties (no card without a resolvable source; the script-like text absent from the body; <= 3 cards; every source id belongs to the token tenant) and take exact counts from the first green run.
- Consent seeding: `seedConsent` (:147) already grants `profile_synthesis` (= `SCRIBE_PURPOSE` = `LIVE_CARDS_PURPOSE`, `scribe/schemas.ts:23`, `nodes.ts:34`).
- The feedback test (branch: 201 + rows) is replaced by the 503/403/409/400/no-write tests.

## 3. Tenancy and JWT checks per route (dual-check trigger)

Dual trigger lines (auth/tenancy/consent surfaces the checker pair must both examine): `apps/api/src/server.ts:688` (verify), `:693` (role gate), `:695` (path-id gate), `:709`+`:715` (`tenantId` from the verified token only, `store: () => deps.dbForTenant(tenantId!)`), `apps/api/src/index.ts:798` (`guardCounsellorVerifier(httpSetup.verifier)`, the partner-tenant refusal), `packages/engine/src/cards/graph.ts:99-107,119-123` (consent+fence authorize), `:287-297` and `:299-310` (pre-brief and feedback consent/fence). No new auth code is written: the three routes inherit the unchanged pipeline below, and the plan's tests prove it.

| route | roles (`server.ts`) | unauth | wrong role | path ids | tenant | consent / fence | write |
|---|---|---|---|---|---|---|---|
| `getPreBrief` GET | `ANY_ROLE` (counsellor, admin) | identical 401 (`unauthorized()` :676-678) before any Db | student/approver token -> 403 `forbidden` :693 | `PATH_ID_PATTERN` :615 -> 400 | `tenantId` from token (:709); Db is `dbForTenant` | `requireConsent` x2 + `assertStudentNotFenced` in `buildPreBriefFor`; refuse = 403 / 409 | none |
| `liveCards` POST | `ANY_ROLE` | same | same | same | same; the provider sees only the token tenant's approved facts | consent node `graph.ts:113-120` -> `refused` -> 403; fence/consent loss mid-run -> `ProviderAuthorizationRefusedError` -> 403 `authorization_refused` (S8) | none (read-only graph; no `insert/update/delete` anywhere under `packages/engine/src/cards/`) |
| `cardFeedback` POST | `ANY_ROLE` | same | same | same | same; `counsellorId` comes from the token (`ctx.auth.counsellorId`), never the body | consent -> fence -> typed unavailable | none (typed 503) |

Role note for C6: the three routes are counsellor/admin only. A `role: "student"` token cannot verify on this verifier at all (`createJwtVerifier` accepts counsellor/admin/approver; the student verifier is a separate key and config, `index.ts:663-664`), so it gets the uniform 401, and an `approver` token gets 403. Tests cover both.

## 4. Tests to add, in TDD order (each written failing first, against `apps/api/src/server.ts` before the production hunk lands)

All in `apps/api/tests/server.test.ts`, names prefixed `T-010 api:`; synthetic data only (B13); mock provider and fake KB (C5); assertions read the RAW fake collections (B14).

1. **Route-table drift (red first):** change the count assertion (:202) from `13` to `16` with the message "T-010 added pre-brief, live cards and card feedback"; the existing OpenAPI drift test (:893-900) then fails until S7 and the openapi hunk are both in and agree on method, path and roles in both directions.
2. **401 uniformity on the new routes:** covered by the existing loop at :204-219 once the count is 16 (the loop sends the 9 bad-credential variants to every protected route, including the three new ones; nothing read or written; identical body and headers). No new test body; assert the three route ids are in `protectedRoutes`.
3. **Role gate:** the existing loops at :225-243 cover approver/admin; add one explicit test that `getPreBrief`, `liveCards`, `cardFeedback` all have `roles` deep-equal to `["counsellor","admin"]` and that an `approver` token gets 403 with `w.calls` empty (no Db touched).
4. **Happy path (live cards):** consent seeded and a scribe approved in tenant A (reuse `approvedWorld`), `POST .../cards` -> 200 `status "ok"`, <= 3 cards, every card has >= 1 source and every `profile` source id is a tenant-A fact id (strip the `tenant-a:` prefix as the branch test does), the planner was called exactly once and the verifier skill once; the dropped script-like text appears nowhere in `res.body`; the call is read-only (raw doc count identical before and after, including a `quiet:true` second call).
5. **Cross-tenant negative (C3):** tenant B token, same student id, no consent in B -> `liveCards` 403 `{error:"consent_required"}`, `planner.calls.length === 0` and the verifier never called; `getPreBrief` 403; `cardFeedback` 403; raw docs unchanged. Then seed consent in B: `liveCards` 200 with `cards: []`, the planner's `knownFacts` input is `[]` (tenant A's facts never reach B's provider call), and tenant A's fact ids planted as sources by the mock planner do not resolve (dropped `unresolved_source`).
6. **No-consent negative (C7), same tenant:** a student with facts but no consent row (and a second case: consent that does not cover `profile_synthesis`) -> 403 on all three routes, zero provider calls, zero reads of `facts` through the cards path (assert via `w.calls` order and planner call count).
7. **Erasure fence negative:** a fenced student (seed the fence row as `server.test.ts:482` and `:1183` do, `erasureFenceKey(STUDENT)`) -> `getPreBrief` and `cardFeedback` 409 `student_fenced`; `liveCards` 403 `authorization_refused` (S8 mapping) with the provider never called; the body leaks no id or value.
8. **Pre-brief content:** known facts (targetCountry, budget), `doNotAsk` includes `budget`, no provider call (branch test, rewritten against main's `PreBriefCardSchema`).
9. **Feedback route is honest (C10):** consented tenant A, valid body -> 503 `card_feedback_unavailable`, raw doc count unchanged, no `decisions` row with `kind: "card_feedback"`, no `feedbackId` in the body; 400 for each of `{cardId:"not-a-card"}`, `{action:"love"}`, `{note:"x".repeat(501)}`, `{ts:1}` (client-supplied `ts`), unknown extra key, malformed JSON, all before any Db access; 403 for tenant B.
10. **Body/boundary (C8):** `liveCards` 400 with issue paths only (no values) for `turns: []`, `turns` > 200, duplicate `turnId`, `quiet:"yes"`, a body `studentId`, a body `sessionId`; 400 for a non-conforming path id (`-bad`, `a%2Fb`, 129 chars); each before any provider call.
11. **Crisis (B9 pass-through):** a self-harm turn -> 200 `status "escalated"`, `cards: []`, `planner.calls.length === 0` (engine behaviour surfaced unchanged; also assert a Devanagari phrase, the same fixture class as `cards-graph.test.ts` SC-019).
12. **Unconfigured and failing dependencies (C4):** no `cards` wiring -> 503 `cards_unavailable` (as the branch: after body validation, before consent; assert no Db read and no provider call); a KB asker that throws, returns `status:"unavailable"`, and returns `ok` with no citations -> 200 and no `kb`-sourced card (knowledge "unavailable"; never an uncited evidence card); a provider that throws `AiUnavailableError` -> engine result `ai_unavailable` or 503 `ai_unavailable` per what the engine returns (assert what the first run shows and pin it); a provider that throws an `AbortError` -> 503 `cards_deadline`.
13. **Verifier is mandatory through the API (C9, C11):** provider with no `verifier` response -> zero cards shown, `dropped` reasons all `verifier_rejected` (proves the API cannot be configured into an unverified path; `semanticVerifier` is not an API field).
14. **startApi wiring (outcome, B14):** in the existing `startApi` section of `apps/api/tests/server.test.ts` (calls at :932, :954, :1024; fake Mongo, loopback), start with `http.kb` and a MockProvider, `POST` a live-cards request over real HTTP with a signed token -> 200 and the fake KB asker was called; start WITHOUT `http.kb` -> still 200, no `kb` card (knowledge `not_configured`). Proves `index.ts` I3/I4, not just `createApiHandler`.
15. **Existing-suite guard:** after the hunks land, run the whole `apps/api` package (section 6) to prove the route-enumerating tests in four other files still pass untouched.

## 5. One falsification per criterion (run against the finished port by the checker; each must FAIL if the criterion were broken)

| id | falsification (a hostile variant, B14) | expected | tests |
|---|---|---|---|
| C1 | Delete the `liveCards` entry from `OPENAPI_DOCUMENT`, then separately from `ROUTES`; run the drift test | the in-both-directions test fails each time | 1 |
| C2 | Send `liveCards` with each of: no header, `Basic`, empty bearer, garbage, expired, wrong issuer, wrong key, HS256 confusion, bad tenant claim, no role | identical 401 body and headers; `w.calls` db and graph empty; raw docs unchanged | 2 |
| C3 | Tenant-B token against tenant-A's student, with and without B consent; plant A's real fact id as a source in the mock planner's output | 403 without consent; with consent `cards: []`, planner `knownFacts: []`, planted id `unresolved_source` | 5 |
| C4 | KB asker throwing; `status:"unavailable"`; `ok` with empty citations; a planner card citing a `kb` source with no KB configured | 200, no `kb` card shown, `knowledge` not `ok` | 12, 14 |
| C5 | Grep the added tests for a real URL/key/network call: run the new tests with network disabled (`--no-network` equivalent: no `fetch` to non-loopback) | green offline; no non-loopback socket | 4-14 |
| C6 | Enumerate `API_ROUTES` filtered to the three ids with an approver token and with a student-key-signed token | 403 and 401 respectively, no Db access | 3, plus `anonymous-route.test.ts:242` (every non-public route 401 without a token, untouched, must stay green) |
| C7 | Revoke consent after approval (delete the consent row), and a consent whose `purposes` lacks `profile_synthesis` | all three routes 403, zero provider calls | 6 |
| C8 | Body `studentId`/`sessionId`/`ts`/unknown keys; oversize turns; duplicate `turnId`; non-JSON | 400 `invalid_request` with `issues[].path` only, never values; zero provider calls | 10 |
| C9 | Mock planner returns an uncited card, a fabricated source, a cross-tenant source, and a script-like imperative; provider omits the verifier | none of them appears in `res.body`; surviving cards each resolve to a tenant-A fact/transcript/kb id | 4, 5, 13 |
| C10 | Diff the raw fake collections before and after every cards/pre-brief/feedback call (consented and refused); grep `apps/api/src` for `client.db(` and any `insertOne|updateOne|deleteOne|replaceOne` newly added | counts identical; no new write call in the diff | 4, 9 |
| C11 | Planner returns an instruction-led question and a card re-asking an approved fact (budget); API result compared to the engine's own `runLiveCards` on the same fixture | API body deep-equals the engine result (no re-derivation in `server.ts`); `git diff` of this unit touches no file under `packages/` | 4, plus `git diff --stat` |

## 6. `Tests[]` affected set (what the manifest must run, and what must stay green)

Edited: `apps/api/tests/server.test.ts` (1 line changed, ~15 tests appended). Unedited but affected because they enumerate routes or the OpenAPI document (must be run, expected green):
- `apps/api/tests/anonymous-route.test.ts:242` (every non-public route 401 without a token; the new routes join the loop),
- `apps/api/tests/chat-profile.test.ts:1127` (w1-counsellor-tenant-guard T1: every route family refuses a partner-tenant counsellor JWT; the loop sends `{}` to each route with filled ids, so the three new routes are exercised: `routes.length >= 12`, families still exactly `admin | approver | counsellor|admin`),
- `apps/api/tests/chat.test.ts:144` and `apps/api/tests/partner-openapi.test.ts:126` (chat/partner route sets must be disjoint from `API_ROUTES`; the new `/pre-brief` and `/cards` paths are not chat or partner paths),
- `apps/api/tests/student-openapi.test.ts:27-31` (the student draft paths must not be in `OPENAPI_DOCUMENT` or `API_ROUTES`),
- `apps/api/tests/index.test.ts:9` (`apiStatus()` regex) and `apps/api/tests/main.test.ts` (launcher builds `startApi` options; confirm it does not enumerate `StartApiHttpOptions` keys),
- engine/db/schemas packages: NOT edited, so not re-run beyond a typecheck, but run `packages/engine/tests/cards-graph.test.ts` once as a non-regression control because the route consumes `runLiveCards`/`buildPreBriefFor`/`recordLiveCardFeedback`.

Verify commands (shared lock; waits are normal): `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 900 pnpm exec tsx --test apps/api/tests/server.test.ts` (new tests), then the same lock with `apps/api/tests/*.test.ts` (full package), then `pnpm --filter @vc/api typecheck` (`apps/api/package.json:13`, `tsc --noEmit`), then `pnpm exec tsx --test packages/engine/tests/cards-graph.test.ts`. If the C: drive is full and the run OOMs, report ENVIRONMENTAL, not a code defect. The pre-push full suite (6c) is the orchestrator's, not this unit's.

## 7. Risks

1. **Wrong-provider seam (medium):** passing `httpSetup.studentProvider` instead of `httpSetup.provider` would route counsellor cards through the student text chain and its spend guard/safety screen. Test 14 asserts the call lands on the injected counsellor provider.
2. **Unmapped engine errors become 500s (medium):** `ProviderAuthorizationRefusedError`, `AbortError`, `CardFeedbackUnavailableError` and a bare `ZodError` all fall through `mapError` (`server.ts:635-657`) to a logged 500 on main. S8 and parse-before-engine (2.4) close three; test 12 pins the abort case. A 500 on a refused tenant would also leak "something happened" instead of the uniform 403.
3. **Fence vs authorize ambiguity (low-medium):** the graph swallows `StudentFencedError` and consent loss into `ProviderAuthorizationRefusedError` (`graph.ts:99-107`), so `liveCards` cannot return 409 `student_fenced` where the other routes do. Plan returns 403 `authorization_refused` (constant body). Q1.
4. **Copying stale expectations (medium):** the branch tests encode cycle-0 verifier outcomes; pasting them gives a red or, worse, a vacuously green run. Mitigation: outcome assertions in 2.6; counts taken from a first run and then falsified by hand (section 5).
5. **Mutable-clock / tenant prefix (low):** fact ids stored as `tenant-a:<id>` and returned bare (branch test comment); the sourcing assertion must strip the prefix for tenant A only.
6. **Concurrent working tree (process):** `D:\vc` carries other sessions' uncommitted work; the build unit must use its own worktree (`wave/p2-cards-api`) and never stage in `D:\vc`. This plan commit touches only `qa/evidence/p2-cards-api/plan.md`.
7. **Silent scope creep to the writer (medium):** the temptation to make `cardFeedback` return 201 by porting `packages/db/src/decisions.ts`. Out of scope per T-050; the checker should reject any `packages/` diff in this unit.
8. **Dual-check blind spot:** both checkers must run the hostile variants in section 5 themselves, not accept the maker's counts (memory: checker briefs prove outcome, not construction).

## 8. Open questions (none block starting; each has a stated default)

- **Q1** `liveCards` fence/consent-loss status: default 403 `authorization_refused` (constant body). Alternative: add a distinguishing 409 by catching `StudentFencedError` before the graph (an extra `assertStudentNotFenced` in the route). Needs a checker or Umesh nod; the default keeps zero new auth code.
- **Q2** Should live cards require an existing `sessions` row (`requireSession`) like the transcript route? Default NO (live use precedes the scribe write). If Umesh wants the session pre-created by a prepare/open step (B23.1 session lifecycle), that is a later unit and a contract-level decision.
- **Q3** Expose `semanticVerifier` on `LiveCardsWiring`? Default NO (legacy, ignored by the engine).
- **Q4** Ship the `cardFeedback` route now as a typed 503, or hold it until T-050 (default: ship; the checker may prefer a hold, which only removes S5's feedback schema, S7's third entry, one S8 mapping and the OpenAPI path).
- **Q5** HTTP code for the 45 s card deadline (`AbortError`, `graph.ts:239-243`): default 503 `cards_deadline`; 504 is the alternative.

## 9. Execution shape for the build unit (for the orchestrator's brief)

One maker, one worktree, files: `apps/api/src/{server,openapi,index}.ts` and `apps/api/tests/server.test.ts` only (4 existing files, no new file; no `packages/` edit). Order: tests 1, 3, 9, 5, 6 red -> hunks S1-S9, openapi, index -> remaining tests -> section 6 commands -> manifest at `Status: ready-for-check` (`Fix cycle: 0`), Tier L, dual-check required, checker briefs demand the section 5 falsifications re-run independently.
