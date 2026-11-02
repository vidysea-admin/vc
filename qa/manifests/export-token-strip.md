# Manifest: export-token-strip

Status: ready-for-check
Fix cycle: 0
Policy-Version: proportional-verification/2026-10-19.17
Tier: L (privacy/security: removes internal ownership tokens from the student export)
Dual check: required
dual-trigger: security packages/db/src/erasure.ts:2018
Base: bc14ad81
Source: qa/QUEUE.md row export-token-strip, approved by Umesh 2026-11-02 in chat; evidence: re-check of ISS-119/ISS-122 on HEAD bc14ad81 (oracles in the maker scratchpad, summarised below).
Round: 2 files (1 product, 1 test), 4 criteria, est 25 min - one failing canary test, a 4-line projection, the db erasure tests plus the api export tests once.
Owners: export-owner
SERIAL: none, a single builder owns both files

## Acceptance criteria
- E1 (ISS-119): the object returned by exportStudent (packages/db/src/erasure.ts) contains no scribe recovery lease ownership token at any nesting level: JSON.stringify of the whole bundle contains neither the seeded lease token value nor any key named lease inside approvalClaims. The public decision data of each approvalClaims row is still exported (same row count, same non-secret fields).
- E2 (ISS-122): the bundle contains no edge writerToken (key or seeded value) at any nesting level, for an edge written by the real link(...) with a writerToken. All other edge fields are still exported (same edge count and the same ids, endpoints and relation fields as before).
- E3 (no collateral): every existing test that reads exportStudent output still passes (packages/db/tests/erasure.test.ts whole file, and every apps/api or packages test that calls exportStudent or the /student export route, found by grep), and the export type (StudentExport) is changed only if a field type had to change.
- E4 (scope): the diff touches only packages/db/src/erasure.ts, packages/db/tests/erasure.test.ts and this manifest (plus a type-only edit in collections.ts or edges.ts if the builder proves it is needed and says so); no assertion deleted or weakened, no skip or xfail added; no other leak is claimed fixed (other fields are listed, not silently changed).

## Evidence from the re-check (not a builder claim)
- ISS-119 reproduced: packages/db/src/erasure.ts:2018-2021 returns scribe_resolutions rows raw (field lease: { token, expiresAt } declared at packages/db/src/collections.ts:209).
- ISS-122 reproduced: packages/db/src/erasure.ts:2017 returns the edges rows raw (writerToken stamped by link() in packages/db/src/edges.ts:24-29).
- Existing coverage: erasure.test.ts:814-815 only asserts edges.length === 6 and approvalClaims.length === 2; nothing asserts the absence of the tokens.

## Changed files
- packages/db/src/erasure.ts: exportStudent edges and approvalClaims now go through an in-place projection (`({ writerToken: _writerToken, ...edge }) => edge`, `({ lease: _lease, ...claim }) => claim`), 7 lines changed around lines 2017-2024. No helper added, no type change (StudentExport, collections.ts and edges.ts untouched; the optional fields simply are absent).
- packages/db/tests/erasure.test.ts: import of link and EdgeDoc from ../src/edges.js, plus two canary tests (ISS-119 export, ISS-122 export) placed after the existing "B15 export" test.
- qa/manifests/export-token-strip.md: this file.

Falsify[E1]: red@2a2208ab green@db72bff7 bash scripts/vc-testlock.sh npx tsx --test --test-name-pattern="ISS-119 export" tests/erasure.test.ts (packages/db) -> unfixed erasure.ts (byte-identical to HEAD, in a throwaway copy of packages/db outside the repo, node_modules junctioned, junction and copy removed afterwards): "AssertionError: export leaks the scribe lease token"; bound tree with the fix: ISS-119 export passes.
Falsify[E2]: red@2a2208ab green@db72bff7 bash scripts/vc-testlock.sh npx tsx --test --test-name-pattern="ISS-122 export" tests/erasure.test.ts (packages/db) -> same throwaway copy: "AssertionError: export leaks an edge writerToken value"; bound tree with the fix: ISS-122 export passes. The same two tests were also run RED in the bound tree before the fix (2 failing, 0 passing, same two assertion messages, not an import error).

Pre-check[E1]: db72bff7 cd packages/db && bash ../../scripts/vc-testlock.sh npx tsx --test --test-name-pattern="ISS-1(19|22) export" tests/erasure.test.ts -> exit 0, 2 passed, 0 failed
Pre-check[E2]: db72bff7 cd packages/db && bash ../../scripts/vc-testlock.sh npx tsx --test --test-name-pattern="ISS-1(19|22) export" tests/erasure.test.ts -> exit 0, 2 passed, 0 failed
Pre-check[E3]: db72bff7 bash scripts/vc-testlock.sh npx tsx --test over packages/db tests/erasure.test.ts tests/decisions.test.ts tests/student-store.test.ts tests/tenant.test.ts (136), packages/engine tests/crisis-escalation.test.ts tests/scribe-concern.test.ts tests/scribe-persistence.test.ts (84), apps/api tests/acceptance-student-journey.test.ts tests/anonymous-route.test.ts tests/chat-rank.test.ts tests/health.test.ts tests/server.test.ts tests/voice-history.test.ts (145); and pnpm exec tsc --noEmit in packages/db -> exit 0, 365 passed, 0 failed
Pre-check[E4]: db72bff7 git status --short -- packages apps; git diff --numstat packages/db/tests/erasure.test.ts -> exit 0, 136 passed, 0 failed (only packages/db/src/erasure.ts and packages/db/tests/erasure.test.ts modified; test diff is 49 insertions, 0 deletions)

Sibling: packages/db/src/erasure.ts:2003 and :2041 profileFacts is still returned as raw profile_facts rows; ProfileFactDoc (packages/db/src/profile-facts.ts:40) declares `proposalToken` ("Internal publication metadata"), and profile-facts.ts:126-145 stamps it. Looks like the ISS-120/121 family; not fixed here.
Sibling: erasure.ts:2012-2016, :2035 (student, sessions, decisions, consents, chatThreads) are raw rows; their doc types (collections.ts, decisions.ts, chat-threads.ts ChatThreadDoc) declare no lease/writerToken/token field. erasure.ts:2038-2039 usage and flags (StudentUsageDoc, StudentFlagDoc) declare none either. chatTurns already strips lease, publicationLease and memorySnapshot (erasure.ts:2001); escalations and crisisReviews are explicit projections. approvalClaims.response is `Record<string, unknown>` and is exported as-is; its writers (scribe) put no lease in it, but the type does not forbid one.

Tests[E1]: packages/db/tests/erasure.test.ts "ISS-119 export: the scribe recovery lease token is not in the bundle; every approval claim and its public decision data is still exported" — plants a canary lease.token on a stored claim, asserts the canary is absent from JSON.stringify(bundle), no claim has a lease key, no lease key anywhere in approvalClaims, 2 claims, and each exported claim deep-equals the stored one minus lease.
Tests[E2]: same file, "ISS-122 export: no edge writerToken (key or value) in the bundle; every edge and its other fields is still exported" — writes an edge through the real link(..., {writerToken: canary}), asserts the canary is absent, no writerToken key in any edge, 7 edges (6 seeded plus the canary edge), each exported edge deep-equals the stored one minus writerToken.
Tests[E3]: packages/db/tests/erasure.test.ts (whole file) and the other affected db, engine and api export test files — the existing tests of the whole erasure.test.ts file (including "B15 export" with edges.length 6 and approvalClaims.length 2, and the S12 export test) plus the other 286 tests listed in Pre-check[E3], all unchanged and green; packages/db typecheck exit 0.
Tests[E4]: git diff --name-only bc14ad81..HEAD and the numstat of the test file — diff scope check by git status and name-only diff above; the two new tests only add assertions, no existing assertion was touched (git diff of the test file is additions-only, 49 insertions, 0 deletions).
Metrics: suite_runs=0
