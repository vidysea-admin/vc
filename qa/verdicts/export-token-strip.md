# Verdict: export-token-strip (coordinator A, blind)

Verdict: PASS
Cycle checked: 0
Commit checked: 39120b88 (builder commit db72bff7, base bc14ad81). The product and test files in the bound tree at check time are byte-identical to 39120b88 (git diff bc14ad81..39120b88 touches only erasure.ts, erasure.test.ts, qa/QUEUE.md, the manifest).
Checker: coordinator A, Mode A, Tier L dual (security). Checked 2026-11-02T18:55+05:30. All test runs went through `bash scripts/vc-testlock.sh`. I did not read the manifest Pre-check or Falsify lines as evidence, and did not read any other coordinator's verdict.

## Criteria

| Criterion | Result |
|---|---|
| E1 (ISS-119, approvalClaims lease) | PASS |
| E2 (ISS-122, edge writerToken) | PASS |
| E3 (no collateral) | PASS |
| E4 (scope) | PASS |

## E1 PASS

The change is erasure.ts:2020-2025: approvalClaims rows are projected with `({ lease: _lease, ...claim }) => claim`.

1. Whole file, bound tree: `cd packages/db && bash ../../scripts/vc-testlock.sh npx tsx --test tests/erasure.test.ts` -> `tests 79, pass 79, fail 0`, exit 0. This includes the two new canary tests and "B15 export".
2. My own oracle, written outside the repo at `C:\Users\Lenovo\AppData\Local\Temp\claude\d--vc\0bf930b1-3489-49a5-9b64-0223ca3e43b6\scratchpad\oracle\oracle.test.ts`, with a module hook that maps `@vc/db` to a chosen packages/db copy. It uses the REAL scribe path: `makeHarness`, `startScribe`, then `resumeScribe({action:"approve"})`, paused mid-run on `facts.insertOne`. At that moment the real claim holds `newLease()` (a uuid). I called the real `exportStudent` and checked:
   - the uuid is absent from `JSON.stringify(bundle)`;
   - no `lease` key anywhere in `approvalClaims`;
   - 1 claim exported, and it deep-equals the stored claim minus `lease`, so `decision`, `response`, `responseHash` and `claimedAt` are all intact.
   - Bound tree: `[memory]` and `[mongo]` real-path tests ✔ (2 of 3 tests; whole-bundle lease/writerToken key paths printed as `[]` for both).
3. Hostile variants, db-level (the HOSTILE test, ✔ on the bound tree):
   - a claim with `lease: undefined` and a claim with `lease: null` export fine, with no lease key and the rest intact (4 claims for student A, 1 for student B);
   - student B's claim lease never appears in A's export, or the other way round;
   - a claim whose `response` contains nested `lease`, `writerToken` and `deep.lease` keys keeps them verbatim (see the findings section; this is not reachable through the real path).
   - No public decision data was lost in any variant.
4. Falsification, in a throwaway copy outside the repo: `git archive 39120b88 packages/db` into `...\scratchpad\fcopy`, then erasure.ts replaced with `git show bc14ad81:packages/db/src/erasure.ts`. The copy's erasure.ts is byte-identical to base (`diff` empty), and a diff against 39120b88 shows only the two projections removed. node_modules is a junction to the repo's packages/db/node_modules. The bound tree was never modified.
   - `cd fcopy/packages/db && bash <repo>/scripts/vc-testlock.sh npx tsx --test --test-name-pattern="ISS-1(19|22) export" tests/erasure.test.ts` -> `tests 2, pass 0, fail 2`; `AssertionError: export leaks the scribe lease token`.
   - My oracle against the copy (`DB_SRC_ROOT=<fcopy>/packages/db`) -> `tests 3, pass 0, fail 3`; both real-path tests fail with `AssertionError: mid-run export leaks the real lease token`.
   - The same tests are green on the bound tree (items 1-3). So the tests and the oracle discriminate the fix, and the real scribe-generated lease token reaches the export on the base commit.

## E2 PASS

The change is erasure.ts:2017-2019: edges are projected with `({ writerToken: _writerToken, ...edge }) => edge`.

1. Same whole-file run: 79 of 79 pass, including the ISS-122 export test, which uses the real `link(..., {writerToken})`.
2. Oracle real path: after the approve completes (`kind: done`), the raw edges written by the real scribe write path hold 4 writerTokens (`[memory] raw edges=4 raw writerTokens=4`, same for `[mongo]`). Read through the tenant-scoped db, so they are the stored rows. The export:
   - contains none of the 4 token values;
   - has no `writerToken` key at any nesting level of `edges`;
   - has the same edge count (4);
   - has every edge deep-equal to the stored edge minus `writerToken`, so ids, endpoints and relations are intact.
3. Hostile variants (all ✔ on the bound tree, each with a real `link(..., {writerToken})`):
   - the subject is the edge TARGET (`kb_record:kb-1->about->student:A`): exported to A, with no token;
   - the subject is the SOURCE: exported, no token;
   - a shared node: B's edge to the same `kb-1` is NOT in A's export, so A's edge ids are `[about, has, knows, plain]` and B's are `[knows, has]`;
   - a cross-student edge A->B: appears in both exports, with no token in either;
   - an edge with no writerToken: unchanged.
   - All 6 seeded token values, and the lease values, are absent from both A's and B's JSON.
4. Falsification: the copy with the base erasure.ts. The canary test fails with `AssertionError: export leaks an edge writerToken value`; my HOSTILE oracle fails with `AssertionError: A export leaks WT-A-subject-target`. Both are green on the bound tree.

## E3 PASS

- Callers of `exportStudent`, by grep over packages/*, apps/*, mcp/* (`--include=*.ts`): only `apps/api/src/server.ts:672` (the route `GET /v1/students/{studentId}/export`, body = the return value, passed straight through) plus tests. `StudentExport` is defined at erasure.ts:1930 and referenced only there; nothing else consumes the type. mcp/ has no references.
- Test files that call or hit export, run by me through the testlock:
  - packages/db: erasure, decisions, student-store, tenant -> `tests 136, pass 136, fail 0`.
  - packages/engine: crisis-escalation, scribe-concern, scribe-persistence, student-graph, ingest-routes -> `tests 248, pass 248, fail 0`.
  - apps/api: acceptance-student-journey, anonymous-route, chat-rank, health, server, voice-history -> `tests 145, pass 145, fail 0`. server.test.ts covers the HTTP export at lines 622, 677 and 799.
  - (student-graph and ingest-routes only matched the grep on "export"; I ran them anyway.)
- `cd packages/db && bash ../../scripts/vc-testlock.sh pnpm exec tsc --noEmit` -> exit 0 (`tsc-exit 0`).
- The HTTP route returns the same shape minus the two stripped fields: server.ts:672 returns the function result unchanged, and the shape differences are exactly those from the projection (field absence only; no type change; `StudentExport` untouched).
- OpenAPI (apps/api/src/openapi.ts:~367-373): the export entry's 200 description says "excludes ... write-ownership fields". It documents neither `lease` nor `writerToken` as an exported field anywhere (grep of openapi.ts for `lease|writerToken` -> none). It is now more accurate, and nothing student-facing documents the removed fields.

## E4 PASS

- `git diff --name-only bc14ad81..39120b88` -> `packages/db/src/erasure.ts`, `packages/db/tests/erasure.test.ts`, `qa/QUEUE.md`, `qa/manifests/export-token-strip.md`. This is exactly the allowed set plus QUEUE bookkeeping.
- `git diff --numstat bc14ad81..39120b88` -> erasure.ts 7 additions, 3 deletions; erasure.test.ts 49 additions, 0 deletions (so no assertion removed or weakened); QUEUE.md 2/1; manifest 46/0. No skip or xfail was added (the added test lines are two plain `test(...)` calls).
- `StudentExport`, collections.ts and edges.ts are untouched. No other leak is claimed fixed; the siblings are listed in the manifest.
- Note: a plain `git diff bc14ad81..HEAD --name-only` at the current HEAD also lists a `qa/verdicts/...b.md` file. I did not open it; it was added after 39120b88 and is outside the checked commit.

### Siblings: required by ISS-119/122 now, or separate?

- `ProfileFactDoc.proposalToken` (profile-facts.ts:40, stamped at :116/:126/:139/:264/:316, used as the compensation-delete guard at :145/:166/:192) is exported raw through `profileFacts` (erasure.ts:2003 reading, :2041 returning). I confirmed by reading the code that `proposalToken` is an internal ownership/compensation token of the same class. But ISS-119 is explicitly the scribe_resolutions lease and ISS-122 is the edge writerToken, and neither lists profile facts. The unit's criteria E1/E2 name only those two fields. Umesh has already approved a separate queue row for it: `qa/QUEUE.md:76`, `profile-facts-token-strip` (S3), which also asks for a report-only check of nested tokens in `approvalClaims.response`. So the correct outcome is a separate PROPOSED-ISSUE, not a FAIL of E1/E2 for this unit.
- `approvalClaims.response` (`Record<string, unknown>`, collections.ts:196-ish) is NOT a real leak through any production path. Its only writer is `resumeScribe`, which stores `ApprovalResponseSchema.parse(response)` (graph.ts:984, 1009; schemas.ts:293-302, all `.strict()` objects), so a `lease` or `writerToken` key cannot be written there. The hostile test shows nested keys would pass through an export only if someone hand-wrote such a document; that is a type-looseness issue, not a student-visible token leak today. The same applies to non-schema extra fields on an edge document (my hostile `extra.writerToken` case passes through): `link()` writes no such field.

## Findings and PROPOSED-ISSUE lines

PROPOSED-ISSUE: severity=medium, unit=profile-facts-token-strip, title="exportStudent returns ProfileFactDoc.proposalToken (and proposalPending) raw in profileFacts", evidence="packages/db/src/erasure.ts:2003 reads and :2041 returns profile_facts rows unprojected; packages/db/src/profile-facts.ts:40 declares proposalToken as 'Internal publication metadata', stamped :116/:126/:264/:316 and used as the delete-compensation guard :145/:166/:192", note="already queued as qa/QUEUE.md:76 profile-facts-token-strip (approved by Umesh 2026-11-02); not a defect of this unit (E1/E2 scope is ISS-119/122 only)".

PROPOSED-ISSUE: severity=low, unit=export-token-strip, title="exportStudent projections are denylists (spread-minus one key); a future token field on edges or scribe_resolutions would leak again", evidence="erasure.ts:2017-2025 destructure out writerToken/lease only; a hand-written nested writerToken/lease in approvalClaims.response or an extra edge field is exported verbatim (HOSTILE oracle output: remaining key paths `A.edges[3].extra.writerToken`, `A.approvalClaims[3].response.lease|writerToken|deep.lease`)", note="not reachable via production writers (ApprovalResponseSchema is strict; link() writes only from/to/rel/createdAt/writerToken); an allowlist projection or a whole-bundle canary scan for key names would be a cheap hardening, optional, not required for ISS-119/122".

PROPOSED-ISSUE: severity=info, unit=export-token-strip, title="Closure bookkeeping: ISS-119 and ISS-122 can be flipped to fixed/verified once the dual verdicts agree", evidence="the outcome proofs above; the ledger rows are qa/issues.jsonl lines for ISS-119 and ISS-122 (open). A coordinator verdict has no side effects, so no ledger row is written here."

## Evidence artifacts (not in the repo)

- Oracle and hook: `C:\Users\Lenovo\AppData\Local\Temp\claude\d--vc\0bf930b1-3489-49a5-9b64-0223ca3e43b6\scratchpad\oracle\` (oracle.test.ts, hook.mjs, resolve.mjs, run.sh).
- Falsification copy: `...\scratchpad\fcopy\packages\db` (erasure.ts = bc14ad81). Bound tree untouched.
- Full-suite log: `...\scratchpad\e3.log`; erasure-only log: `...\scratchpad\erasure-bound.log`.
