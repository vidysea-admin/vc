# Manifest: export-token-strip

Status: building
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
(filled at ready-for-check)
