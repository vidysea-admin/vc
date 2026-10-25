# Verdict - cards-api (dual check, coordinator A, blind)
Policy-Version: proportional-verification/2026-10-19.17
Artifact: branch wave/cards-api, head f046a36 (code c569094 + 55c72b4), base 6b2f99a. Manifest qa/manifests/cards-api.md (Fix cycle 0).
Cycle checked: 0
Checked: 2026-10-25T09:50+05:30 (read with `date -Iseconds`)
Tier: L. Mode A. Dual coordinator A; the B verdict, checkpoint and evidence were not read; only my own evidence is counted.

## Verdict: PASS

## Environment note (read first)
The shared pnpm store D:/vc/node_modules/.pnpm was found DAMAGED at the start of the check (timestamp 09:34, the builder's falsification-copy teardown): 11 package directories were empty (typescript, tsx, zod, jose, ws, yaml, mongodb, hono, p-retry, protobufjs, google-auth-library) and `@google+genai` was gone entirely. Rerunning in the worktree failed at once (`'tsx' is not recognized`, `Cannot find module ...typescript\bin\tsc`). That is ENVIRONMENTAL, not a code defect, and nothing was concluded from it. I did not repair the shared store. I ran everything in an isolated copy: `git archive f046a36` into a scratch dir, `pnpm install --frozen-lockfile --ignore-scripts --filter "@vc/api..."` with a private `--store-dir` (191 packages, lockfile-exact). Every run below is from that copy at exactly f046a36, under `vc-testlock.sh`.

## Evidence (my own runs)
- `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 900 pnpm exec tsx --test apps/api/tests/server.test.ts` -> exit 0, tests 52, pass 52, fail 0, skipped 0.
- `... pnpm --filter @vc/api typecheck` -> exit 0, 0 errors.
- `... tsx --test anonymous-route chat-profile chat partner-openapi student-openapi index main` (apps/api/tests) -> exit 0, tests 169, pass 169, fail 0, skipped 0 (route-enumerating regression control).
- `... tsx --test packages/engine/tests/cards-graph.test.ts` -> exit 0, tests 59, pass 59, fail 0 (engine control; `git diff 6b2f99a f046a36` touches only 4 files under apps/api plus the manifest, nothing under packages/).
- Test-diff review: 3 removed test lines only (the MockProvider import line, the engine import line, widened by the new imports, and the 13 -> 16 count assertion). Nothing weakened.
- My own hostile probes (scratch test apps/api/tests/chkA-hostile.test.ts in the copy, outside the artifact; reuses the production wiring, fake Mongo, MockProvider): 9 tests, 9 pass, 0 fail.
  - A1 JWT: expired, wrong issuer, foreign key, tampered payload (tenant swapped), alg none, HS256 public-key confusion, garbage, missing/empty/object/array tenant, missing counsellorId, missing role, student role, upper-case and array role, missing header, Basic/empty/extra-token headers, on all 3 routes: every one 401 with the identical body, zero Db/graph calls, zero provider calls, raw collections unchanged.
  - A2 id probing: a tenant-B token against tenant A's student id vs a student that never existed: status, body and headers byte-identical on all 3 routes, both without and with B's consent. No existence oracle.
  - A3 crisis: 5 phrasings (mid-window, suicide, self-harm, Hinglish/Devanagari-style romanised, upper-case) x quiet true/false, KB wired: every one 200 `escalated`, `cards: []`, zero provider calls, nothing written.
  - A4 mapError scope: AbortError and an Error named CardFeedbackUnavailableError thrown on scribe, approval and erasure routes stay a logged 500 `{"error":"internal"}`; never `cards_deadline` / `card_feedback_unavailable`. (My getProfile probe returned 400 for a missing `purpose` and so did not reach the thrower; the other three routes did.)
  - A5 cardFeedback: write-method spies on every collection count 0 writes across 8 well-formed calls (including a cardId for a session that does not exist) and 6 malformed (400); raw collections unchanged; OpenAPI summary and 503 text state it is NOT persisted.
  - A6 fenced student: 403 `consent_required`, byte-identical (body and headers) to the no-consent response, for counsellor and admin, all 3 routes, zero provider calls.
  - A7 path ids: `..`, `%2e%2e`, `a/b`, `%2F`, 129 chars, space, `$ne`, `{$gt:''}`, `%00`, unicode, leading dot/dash: 400 or 404, zero Db/graph/provider calls.
  - A8 engine path: garbage verifier output and a throwing verifier both give `cards: []`; the deterministic guards (script, uncited, foreign-tenant) hold even under an approve-all verifier; extra body keys (studentId, sessionId, tenantId, knownFacts, consent) are 400.
  - A9 tenant claim cannot come from query string or `x-tenant*` headers; B with consent gets empty `knownFacts` and no A value.
- My own falsifications, applied one at a time to my copy of the head, each run against my hostile suite: M1 `store: () => deps.dbForTenant("tenant-a")` -> killed (A2, A9). M2 getPreBrief `roles: "public"` -> killed (A1, A2, A6, A9). M3 a `decisions` insertOne before the feedback engine call -> killed (A5 write spy; A2, A6). M4 a `refused` engine result returned as 200 -> killed (A6). M5 `mapError` AbortError mapping made global (scope removed) -> killed (A4). M6 crisis escalation disabled in the engine graph -> killed (A3). 6 of 6 killed; originals restored and diffed identical.

## Criteria
C1 PASS (drift test both directions, 16 routes, three new paths in OPENAPI). C2 PASS (A1). C3 PASS (A2, A9, M1). C4 PASS as scoped (injected asker proven in server.test.ts; production wiring gap recorded below, not required by a contract line in this slice). C5 PASS (local keys and fake KB; no live call in any run; no outbound connection made by my runs). C6 PASS (A1 role cases, M2, enumerating files 169/169). C7 PASS (A6, no-consent). C8 PASS (A5/A7/A8 400s). C9 PASS (A8). C10 PASS (A5, M3). C11 PASS (A3, A8, engine control 59/59). Touched-not-owned: B9 crisis-before-generative PASS (A3).

## PROPOSED-ISSUE lines (no side effects in a dual check)
PROPOSED-ISSUE severity=high class=environmental unit=cards-api: the shared store D:/vc/node_modules/.pnpm was emptied through the worktree node_modules junctions (builder's `cards-api-fcopy` teardown, 09:34): 11 package dirs empty, `@google+genai` directory removed. Every worktree and the main tree now fail `tsx` and `tsc` until `pnpm install` repairs it; the `@google/genai` 2.30.0 tarball is NOT in the offline store, so the repair needs network. Falsification-copy teardown must remove junctions first (`rmdir` on the link, never recursive delete through it).
PROPOSED-ISSUE severity=medium class=go-live unit=cards-api: apps/api/src/main.ts supplies no `http.kb`; in production liveCards answers `knowledge: "not_configured"` and no kb-sourced evidence card. Confirmed (main.ts:105 and :124 wire only the anonymous/chat ports). Not a contract line for this slice.
PROPOSED-ISSUE severity=medium class=go-live unit=cards-api: liveCards calls the real counsellor provider per request with no spend or rate guard (the student chain has ChainSpendGuard, index.ts:114-170). JWT-gated and read-only. No contract line in this slice requires it (the USD caps at contract :571-572 concern eval runs).
PROPOSED-ISSUE severity=low class=ownership unit=cards-api: cardFeedback does not check that cardId belongs to the session (a cardId for a non-existent session is still 503 after consent and fence). Moot while nothing is stored (A5: zero writes); T-050 must add the ownership check and inherit B15 erasure coverage.
PROPOSED-ISSUE severity=low class=status-label unit=cards-api: when the semantic verifier throws AiUnavailableError, liveCards answers 200 `status: "ok"` with `cards: []` (planner outage gives `ai_unavailable`). Fails closed, so no safety effect; the label can mislead a client.
PROPOSED-ISSUE severity=info class=scope unit=cards-api: `ProviderAuthorizationRefusedError` is now a constant 403 `authorization_refused` on every route (stated in the manifest, allowed by review-1).

Metrics: suite_runs 4 named-file runs + 1 hostile file + 6 mutation runs, 0 full-suite; own tests added 9 (scratch copy, not committed); mutants 6/6 killed; no code, contract, .claude or ledger file edited; runs in an isolated lockfile-exact copy because the shared store is damaged (environmental).
