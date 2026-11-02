# Verdict: export-token-strip (coordinator B, blind)

Cycle checked: 0
Checked: 2026-11-02T14:35:00+05:30
Verdict: PASS
Commit checked: 39120b88 (builder commit db72bff7, base bc14ad81). Mode A, Tier L, Dual check: required, coordinator B (blind; no other verdict or checkpoint for this unit was read).
Policy-Version: proportional-verification/2026-10-19.17

## Executed checks (this checker, bound tree at 39120b88, tree stayed clean; `git status --short -- packages apps` shows only the pre-existing untracked apps/api/qa/)
- `cd packages/db && bash ../../scripts/vc-testlock.sh npx tsx --test tests/erasure.test.ts tests/decisions.test.ts tests/student-store.test.ts tests/tenant.test.ts` -> exit 0, tests 136, pass 136, fail 0. Output includes `ISS-119 export ...` and `ISS-122 export ...` passing next to `B15 export ...`.
- `cd packages/engine && bash ../../scripts/vc-testlock.sh npx tsx --test tests/crisis-escalation.test.ts tests/scribe-concern.test.ts tests/scribe-persistence.test.ts` -> exit 0, tests 84, pass 84, fail 0.
- `cd apps/api && bash ../../scripts/vc-testlock.sh npx tsx --test tests/acceptance-student-journey.test.ts tests/voice-history.test.ts tests/chat-rank.test.ts tests/server.test.ts tests/health.test.ts tests/anonymous-route.test.ts` -> exit 0, tests 145, pass 145, fail 0 (these call exportStudent or GET /v1/students/:id/export).
- `cd packages/db && bash ../../scripts/vc-testlock.sh pnpm exec tsc --noEmit` -> exit 0.

## Own oracle (outside the repo)
Throwaway copy of packages/{db,engine,schemas,observability,providers} + skills from `git archive HEAD` in C:\Users\Lenovo\AppData\Local\Temp\claude\vc-checkerB-copy (node_modules re-junctioned so @vc/db resolved to the copy; copy deleted afterwards, junctions removed first, bound tree untouched). Oracle file packages/engine/tests/oracle-b.test.ts in the copy, run through vc-testlock.

Scenario 1, REAL scribe path (not a hand-inserted row): `startScribe` then `resumeScribe({action:"approve"})` on the engine harness. Hooked `graph.invoke` so `exportStudent` is called while the claim's run lease is held (the real graph.ts:1022 `lease: newLease(deadline)` insert).
- Premise held: the real path stored a lease token on the claim before invoke (>= 1 token read back).
- Mid-flight export: 1 claim exported, no key `lease` at any nesting level, the real lease token absent from JSON.stringify(bundle), and `approvalClaims` deep-equals the stored claims minus `lease` (all public decision data: decision, response, responseHash, claimedAt, threadId, studentId preserved).
- After the run: the real applyApprovedDiff (facts.ts:421) had stamped writerToken on 4 of 4 edges; none of the 4 token values appear in the bundle, no `writerToken` key anywhere, and each exported edge deep-equals the stored edge minus writerToken (same count and ids).

Scenario 2, hostile variants (run in the same copy, fixed code):
- Subject is the edge TARGET (`kb_record -> student`, real link() with writerToken): exported, token stripped, endpoints kept.
- Two students sharing an edge (`student A -> student B`, real link() with writerToken): present in both exports, token stripped in both; B's export does not receive A's target-side edge; B-only edge not in A's bundle.
- Claim with `lease: undefined`: exported with no `lease` key. Claim with a live lease (`TOK-LIVE-LEASE`): stripped.
- Claim whose `response` object carries nested `lease` / `writerToken` / `nested.lease` keys (planted by updateOne): NOT stripped, they remain in the bundle (paths `$.approvalClaims[0].response.lease`, `.response.writerToken`, `.response.nested.lease`). Likewise an edge with a planted nested `extra.writerToken` keeps it. The fix is a top-level projection only. Reachability: the only writer of `response` is resumeScribe, which stores `ApprovalResponseSchema.parse(response)` (packages/engine/src/scribe/schemas.ts:293-302, every variant `.strict()`; `per_fact` and `edit` nest only FactSchema / PerFactDecision / SummaryDecision, none of which has a lease), and real link() only writes top-level `writerToken`. So neither nested case is reachable through production writers; see PROPOSED-ISSUE 2.
- Public decision data lost anywhere in scenarios 1 and 2: none (every comparison above is deep-equal to the stored document minus the one stripped key).

Falsification (copy only): reverted packages/db/src/erasure.ts to bc14ad81 (`cmp` against `git show bc14ad81:...` equal).
- My oracle (bc14ad81 erasure.ts): 2 failed, 0 passed. `mid-flight export leaks real lease token` (real scribe path) and the hostile test fails on the leaked target-side / shared edge token.
- The builder's new tests (`--test-name-pattern="ISS-1(19|22) export" tests/erasure.test.ts`): 2 failed, 0 passed, `export leaks the scribe lease token` and `export leaks an edge writerToken value` (assertions, not an import error).
- Restored the HEAD erasure.ts in the copy: oracle 2/2 green and the new tests green (same result as the bound tree above).

## Criteria
- E1 (ISS-119) PASS. Command: the oracle scenario 1 and the bound-tree erasure.test.ts run above. Output: real mid-flight lease token absent, no `lease` key in approvalClaims, same row count (1 in scenario 1, 2 in the test, 3 in scenario 2 with the two planted), non-secret fields deep-equal. Red on bc14ad81, green on 39120b88.
- E2 (ISS-122) PASS. Command: same runs. Output: all 4 real writerTokens from applyApprovedDiff and the link() canary absent, no `writerToken` key on any exported edge, edge count and ids unchanged, other fields deep-equal to stored. Target-side and shared-student edges covered. Red on bc14ad81, green on 39120b88.
- E3 (no collateral) PASS. Callers of exportStudent found by grep over packages/*, apps/*, mcp/*, scripts/*: only apps/api/src/server.ts:668-672 (route `GET /v1/students/:studentId/export`, returns the db result unchanged as the body, admin role) and tests. No consumer in mcp/. Every test file referencing exportStudent or the export route was run (136 + 84 + 145 = 365 passed, 0 failed) and `tsc --noEmit` in packages/db exits 0. `StudentExport` (erasure.ts:1930-1979) is untouched; `EdgeDoc.writerToken?` and `ScribeResolutionDoc.lease?` are optional so the projection type-checks without a type change. OpenAPI (apps/api/src/openapi.ts:371) says the export "excludes ... write-ownership fields", which is now true for edges and claims; neither openapi.ts nor server.ts documents lease or writerToken for the student export. docs/schema.md:168,248,428 list `lease` and `writerToken` as stored collection fields (generated by scripts/gen-schema-doc.ts), not as export fields, so nothing there became wrong.
- E4 (scope) PASS. `git diff --name-only bc14ad81..HEAD` = packages/db/src/erasure.ts, packages/db/tests/erasure.test.ts, qa/manifests/export-token-strip.md, qa/QUEUE.md (bookkeeping: the TODO row rename and the ISS-120/121 candidate row). erasure.ts diff is the two projections (+ comments) only, no other field touched. Test diff: 49 insertions, 0 deletions, no skip/xfail; two new tests plus one import line. The two new tests are hermetic canary tests that add assertions only.

## Sibling judgment (builder's note)
- ProfileFactDoc.proposalToken (packages/db/src/profile-facts.ts:40, stamped at :116/:126/:264/:316 and used as a compare-and-set ownership filter at :137, :166-167, :192, :277): confirmed by my own run on the fixed code that `exportStudent(...).profileFacts[0]` carries `proposalToken` (a string; keys include `_id, decidedAt, factId, key, proposalToken, proposedAt, quote, source, status, studentId, threadId, value`). It is a real internal ownership/CAS token reaching the export (admin-only route, `x-roles: ["admin"]`, openapi.ts:370) and it makes the OpenAPI sentence "excludes ... write-ownership fields" false for profileFacts. It is NOT required by the stated issues: ISS-119 is the scribe recovery lease (qa/issues.jsonl, packages/db/src/erasure.ts:1908 raw approvalClaims) and ISS-122 is the edge compensation writerToken (release verdict F2), and E1/E2 name exactly those two. So not a FAIL of E1/E2; it is a separate PROPOSED-ISSUE, the same fix family (a one-line projection at erasure.ts:2041), unit scope was correctly kept narrow and the builder disclosed it.
- approvalClaims.response is `Record<string, unknown>` (collections.ts) but is only ever written from the strict-parsed ApprovalResponse (graph.ts claim insert, schemas.ts:293-302), which has no lease/token field. Not a current leak; type-level only. Same for the planted nested edge key (real link() writes only a top-level key). Not required by ISS-119/122, hence no FAIL.

## PROPOSED-ISSUE lines
- PROPOSED-ISSUE medium (security/privacy, same family as ISS-119/122): exportStudent still returns `profileFacts[*].proposalToken` raw (packages/db/src/erasure.ts:2003 / :2041, ProfileFactDoc.proposalToken at packages/db/src/profile-facts.ts:40, comment "Internal publication metadata"). Reproduced on 39120b88 with proposeProfileFact + decideProfileFact + exportStudent (token present on a confirmed fact). Strip it with the same in-place projection plus a canary test; also makes the OpenAPI "write-ownership fields excluded" statement true.
- PROPOSED-ISSUE low (defence in depth): the new projections strip only the top-level `lease` / `writerToken` keys. A deep key (planted `approvalClaims[*].response.lease`, edge `extra.writerToken`) survives; unreachable through today's writers (strict ApprovalResponseSchema, link()). Consider an explicit allow-list projection (as escalations/crisisReviews already use) or a deep-key assertion in the canary test so a future writer cannot reopen it silently.
- PROPOSED-ISSUE low (test): the new canary tests seed the lease by updateOne and the edge via link() on the fake db, and never exercise the real in-flight scribe path; my out-of-repo oracle did and passed. Optional: add one engine-level test that exports during resumeScribe (the hook pattern used in oracle scenario 1).
- PROPOSED-ISSUE low (bookkeeping): the manifest's Changed-files text says "7 lines changed around lines 2017-2024"; the diff is +10/-4 (lines 2017-2025). Count only.

## Not run by this checker
- Full-repo `pnpm test`, the senior-software-engineer review and the push gate (6c). Coordinator B's PASS has no side effects: no ledger rows and no QUEUE rows were written by this file.
