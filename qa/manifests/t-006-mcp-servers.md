# Manifest — t-006-mcp-servers
**Contract:** qa/contracts/counselling-engine.md (B2, B3, B4, B6, B8, B11, B12, B13, B14)
**Goal task:** T-006
**Date:** 2026-09-25
**Fix cycle:** 1 of max 3 (cycle-0 FAIL: ISS-029 critical)
**Dual check:** no
**Issues addressed:** none
**Executor:** claude-sonnet-subagent
**Executor rationale:** two well-specified MCP servers over an existing, already-hardened `@vc/db`
API (T-003, checker PASS `a4dd339`) — a focused build against a fixed brief and a real (verified)
third-party SDK API, no open design questions that need a larger model.

## SDK verification (done before writing any code, per brief)

- **Package:** `@modelcontextprotocol/sdk`. **Installed version:** `1.30.1` (`npm view
  @modelcontextprotocol/sdk version` → `1.30.1`; pinned in both `mcp/*/package.json` as
  `^1.30.1`).
- **Verified against the actual installed `.d.ts`/`.js` sources** at
  `node_modules/.pnpm/@modelcontextprotocol+sdk@1.30.1_zod@3.25.76/node_modules/@modelcontextprotocol/sdk/dist/esm/`
  (`server/mcp.d.ts`, `server/mcp.js`, `inMemory.d.ts`, `client/index.d.ts`,
  `server/zod-compat.d.ts`) rather than trusting training-data memory or an unauthenticated
  README fetch (`raw.githubusercontent.com/.../typescript-sdk/main/src/...` 404'd for the two
  deep-dive files; the top-level README fetch worked and matched what the installed source
  confirmed):
  - `McpServer.registerTool(name, { title?, description?, inputSchema?, outputSchema?,
    annotations?, _meta? }, handler)` — `inputSchema`/`outputSchema` accept a `ZodRawShapeCompat`
    (a plain `{ key: ZodSchema }` object, not a `z.object(...)`-wrapped schema) or a full Zod
    object schema; both are normalized internally (`zod-compat.ts` `normalizeObjectSchema`).
  - A handler that **throws** is caught by `McpServer`'s own `CallToolRequestSchema` handler and
    converted to `{ content: [{type:"text", text: error.message}], isError: true }`
    (`server/mcp.js` `createToolError`) — confirmed by reading the actual compiled source, not
    assumed. Same path for a Zod input-validation failure (`validateToolInput` throws
    `McpError(InvalidParams, "Input validation error: ...")`, caught by the same handler).
  - `InMemoryTransport.createLinkedPair()` (`inMemory.d.ts`) exists for testing a `Client`/`Server`
    pair with no stdio — this is what the tests use to call tools "through the MCP server
    in-process" per the brief, via a real `Client.callTool(...)`, not a direct function call on
    the registered handler.
  - Subpath imports used: `@modelcontextprotocol/sdk/server/mcp.js`,
    `@modelcontextprotocol/sdk/server/stdio.js`, `@modelcontextprotocol/sdk/client/index.js`,
    `@modelcontextprotocol/sdk/inMemory.js` — all present in the package's `exports` map
    (`./server`, `./client`, and a `./*` catch-all to `dist/esm/*`).
  - `ajv`/`ajv-formats` ship as direct dependencies of the SDK itself (used for output-schema
    validation), so no extra install was needed for structured-content checks to work.
- **URLs consulted:** `https://modelcontextprotocol.io` intent (via
  `raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/README.md`, fetched
  successfully) and `npm view @modelcontextprotocol/sdk version`.
- **Transport used:** stdio (`StdioServerTransport`), per the brief — wired only in each package's
  `src/bin.ts`, which is not exercised by any test (contract B8).

## What changed
- `mcp/student-profile/src/index.ts` (rewritten from the T-002 stub) — `ProfilePurposeSchema`
  (`counselling_session | profile_synthesis | application_filling`; **[ASSUMPTION, T-006]**: no
  ARCHITECTURE/plan.md page fixes a purpose enum for this read boundary — `Consent.purposes` and
  `Fact.purposeTags` stay open strings per D-003 — so this is the smallest enum plan.md §3/§4
  imply, documented in-file, revisit if a later unit needs more) and
  `createStudentProfileServer(deps: { db: Db })`, which registers exactly two tools:
  - `get_profile_facts({studentId, purpose})` — calls `@vc/db` `requireConsent(db, studentId,
    purpose)` first (B4); on success, reads `factsCollection(db).find({studentId, validTo:
    {$exists:false}, purposeTags: purpose})` (Mongo's own array-membership match) and returns
    `Fact[]`.
  - `propose_profile_diff({studentId, candidateFacts})` — reads all facts (active + superseded)
    for `studentId`, calls `@vc/db` `proposeFactChanges` (pure), returns the `ProfileDiff`.
    **Never imports or calls `applyApprovedDiff`** (B3) — `grep -n
    "applyApprovedDiff" mcp/student-profile/src/index.ts` returns 3 lines, all inside `/** */`
    doc-comments/prose explaining that it is deliberately not exposed; there is no `import`
    statement or call site.
  - Both tools use Zod input schemas (`z.string().min(1)` for `studentId`, the `Fact`/`FactSchema`
    from `@vc/schemas` for `candidateFacts`) — the MCP SDK's own input validation is the NoSQL-
    injection guard (an object like `{"$ne": null}` fails the `z.string()` type check before any
    DB call).
- `mcp/student-profile/src/bin.ts` (new) — stdio entry: `connectFromEnv(process.env)` +
  `client.connect()` + `createStudentProfileServer` + `StdioServerTransport`. Not run by tests.
- `mcp/student-profile/tests/fakes.ts` (new) — package-local `FakeCollection`/`FakeDb` (offline,
  no network), a copy of the minimal pattern in `packages/db/tests/fakes.ts` extended with
  `find().toArray()` and array-membership filter matching (`packages/db`'s fake only needed
  `findOne`/`insertOne`/`updateOne`; this unit's tests are not imported across packages, per
  brief).
- `mcp/student-profile/tests/index.test.ts` (rewritten, 7 tests) — see Actual outputs.
- `mcp/student-profile/package.json` — added `@modelcontextprotocol/sdk ^1.30.1`, `@vc/db
  workspace:*`, `@vc/schemas workspace:*`, `mongodb ^6.21.0`, `zod ^3.24.0`; added a `bin` entry.
- `mcp/student-profile/README.md` (new) — tool docs + the B13 "no student data to external models
  without a per-use gate" note (the brief's item 4).
- `mcp/university-kb/src/index.ts` (rewritten from the T-002 stub) — a local `CourseDocSchema`
  (`courseId, universityId, name, country?, level?, sourceUrl, fetchedAt` — `sourceUrl`/
  `fetchedAt` REQUIRED) and `createUniversityKbServer(deps: { db: Db })`, registering:
  - `search_courses({query, country?, level?})` — Mongo-filters by `country`/`level` when given,
    then a case-insensitive JS substring match on `name` (no `$regex` needed in the fake, and no
    LLM/vector search per the brief), then `CourseDocSchema.safeParse` per candidate — a record
    missing `sourceUrl`/`fetchedAt` (or otherwise malformed) is excluded and counted in `dropped`,
    never invented (B2).
  - `get_course({courseId})` — `findOne` by `courseId`; not found → tool error; found but fails
    `CourseDocSchema` (missing citation) → also a tool error, never a partial/fabricated record.
  - Reaches `courses`/`universities` only via `@vc/db`'s exported `COLLECTION_NAMES` constant +
    `db.collection(...)` on the already-scoped `Db` — the same pattern
    `packages/db/src/collections.ts` itself uses (that file deliberately exposes no
    `coursesCollection`/`universitiesCollection` accessor yet, "owned by the university-kb unit").
    Confirmed no `packages/**` file was touched by this session: `git status --porcelain=v1 --
    packages/` is empty throughout (see the full `git status` below) — `git diff --stat main --
    packages/` is NOT a valid check for this because `main` has 7 commits this worktree's branch
    doesn't (T-005 landed after this branch point, adding/removing files under `packages/engine`
    and `packages/observability`), so it shows that unrelated divergence, not anything this
    session did. Working-tree status is the authoritative check, and it is empty for `packages/`.
  - `universities` collection: only the name constant is used (via `COLLECTION_NAMES`); no
    `search_universities`/`get_university` tool exists yet — out of scope for the two tools the
    brief names, and ARCHITECTURE §6 Q1 (the KB's ultimate shape/source) is still open. Noted here
    rather than silently built.
- `mcp/university-kb/src/bin.ts` (new) — same stdio pattern as student-profile's `bin.ts`.
- `mcp/university-kb/tests/fakes.ts` (new) — identical package-local fake (same reasoning as
  student-profile's).
- `mcp/university-kb/tests/index.test.ts` (rewritten, 9 tests) — see Actual outputs.
- `mcp/university-kb/package.json` — added `@modelcontextprotocol/sdk ^1.30.1`, `@vc/db
  workspace:*`, `mongodb ^6.21.0`, `zod ^3.24.0`; added a `bin` entry.
- `mcp/university-kb/README.md` (new) — tool docs + the open-question note + the B13 pointer.
- `pnpm-lock.yaml` — gained the two `mcp/*` importers' new deps. Relative to this branch's own
  starting point (not `main`, which has diverged — see the note at the end of this section):
  **793 insertions, 0 deletions** (`git diff --stat HEAD -- pnpm-lock.yaml` before any of this
  session's edits vs. after `pnpm install`; the "1" line from `grep -c '^-'` is the `--- a/...`
  diff header itself).
- **`packages/**` was NOT touched** (brief constraint — a parallel unit, T-003b, is hardening
  `packages/db` internals). Every `@vc/db` symbol this unit uses (`factsCollection`,
  `requireConsent`, `proposeFactChanges`, `COLLECTION_NAMES`, and the `Db`/`Filter` types) is
  consumed exactly as exported on `main` today; nothing in `packages/db/src/collections.ts`'s
  deliberate "no accessor yet" comment for `universities`/`courses` was worked around by adding an
  accessor there — the accessor equivalent (`coursesCollection`) lives locally in
  `mcp/university-kb/src/index.ts` instead.

## Note on why "purpose" has no consent check on `propose_profile_diff`
The brief's tool signature for `propose_profile_diff` is `{studentId, candidateFacts}` — no
`purpose` field, unlike `get_profile_facts`. `requireConsent` needs a specific `purpose` to check
against, so it cannot be meaningfully called here without inventing a field the brief didn't ask
for. This tool only diffs already-extracted candidate facts (the caller's job to have gathered
consensually) against stored facts and writes nothing; it does not expose new protected data the
caller didn't already hand it. Followed the brief literally rather than silently widening scope;
flagging here per the anti-drift discipline of naming design choices instead of burying them.

## How to verify (commands + expected)
- `pnpm install` → expected: exit 0
- `pnpm -r typecheck` → expected: exit 0, all 8 workspace packages report "Done"
- `pnpm -r test` → expected: exit 0, `mcp/student-profile` 7/7, `mcp/university-kb` 9/9, every
  other package `fail 0`
- `python contracts/verify_contracts.py` → expected: exit 0 ("PASS by vacuity")
- `git status --porcelain=v1` → expected: only `mcp/**` (M + new files) + `pnpm-lock.yaml` (M) +
  this manifest (new)

## Actual outputs (from this session's own run)

**`pnpm install`** — exit 0:
```
Already up to date
Done in 809ms using pnpm v10.33.0
```

**`pnpm -r typecheck`** — exit 0, all 8 packages "Done":
```
apps/api typecheck: Done
packages/providers typecheck: Done
apps/web typecheck: Done
packages/schemas typecheck: Done
packages/engine typecheck: Done
packages/db typecheck: Done
mcp/student-profile typecheck: Done
mcp/university-kb typecheck: Done
```

**`pnpm -r test`** — exit 0, 97 tests total, 0 failures (per-package pass/fail from this session's
own run):
```
packages/providers test: pass 1, fail 0
apps/web test: pass 1, fail 0
apps/api test: pass 1, fail 0
packages/schemas test: pass 45, fail 0
packages/engine test: pass 2, fail 0
packages/db test: pass 31, fail 0
mcp/student-profile test: pass 7, fail 0
mcp/university-kb test: pass 9, fail 0
```

`mcp/student-profile` (7/7):
```
✔ tool registered and callable through MCP: both tools appear in tools/list (136.9311ms)
✔ B4 consent required: get_profile_facts with no consent row returns a tool error and zero facts (21.3424ms)
✔ purpose filter: only facts whose purposeTags include the requested purpose come back, superseded facts excluded (6.237ms)
✔ B3 propose_profile_diff writes nothing: the facts collection is unchanged after the call, read back directly (5.6243ms)
✔ hostile: purpose not in the enum is rejected by Zod before any DB read (4.5202ms)
✔ hostile: a NoSQL-operator object as studentId ({"$ne": null}) is rejected by Zod, not passed to the DB (3.4002ms)
✔ hostile: an uncited candidate fact in propose_profile_diff is rejected by Zod (FactSchema requires source) (6.8626ms)
```

`mcp/university-kb` (9/9):
```
✔ tool registered and callable through MCP: both tools appear in tools/list
✔ uncited course excluded: search_courses drops a stored record missing sourceUrl/fetchedAt and counts it in `dropped`
✔ search_courses filters by country and level and is case-insensitive
✔ get_course returns the record for a known courseId
✔ unknown courseId: get_course returns a not-found tool error, never a fabricated record
✔ get_course on a stored-but-uncited record (missing sourceUrl) is also a tool error, not a partial record
✔ hostile: empty query is rejected by Zod (min length 1)
✔ hostile: a NoSQL-operator object as courseId ({"$ne": null}) is rejected by Zod, not passed to the DB
✔ hostile: level not in the enum is rejected by Zod
```

**`python contracts/verify_contracts.py`** — exit 0:
```
verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity
```

**`git status --porcelain=v1`**:
```
 M mcp/student-profile/package.json
 M mcp/student-profile/src/index.ts
 M mcp/student-profile/tests/index.test.ts
 M mcp/university-kb/package.json
 M mcp/university-kb/src/index.ts
 M mcp/university-kb/tests/index.test.ts
 M pnpm-lock.yaml
?? mcp/student-profile/README.md
?? mcp/student-profile/src/bin.ts
?? mcp/student-profile/tests/fakes.ts
?? mcp/university-kb/README.md
?? mcp/university-kb/src/bin.ts
?? mcp/university-kb/tests/fakes.ts
```
(This manifest itself, `qa/manifests/t-006-mcp-servers.md`, is the one additional new file, added
at commit time.) `node_modules/` is git-ignored.

**Note on `git diff --stat main` showing unrelated files (`packages/engine`, `skills/`, `qa/`,
etc.):** same situation as `qa/manifests/t-003-student-kg.md` documented — `main` has moved on
since this worktree's branch point (T-005 landed 7 commits on `main`: `git log --oneline
HEAD..main` → `61de27d, 4b80602, 907898e, 2447749, 431182a, 6229a9a, f63383c`). `git status
--porcelain=v1` in the worktree (above) is the authoritative record of what this session actually
touched, and it is confined to `mcp/**` + `pnpm-lock.yaml` (+ this manifest). `git diff --stat
main -- mcp pnpm-lock.yaml` (scoped) shows exactly the 7 files this unit changed plus the new
files pnpm/git report as pure additions.

## Capability coverage (each claim -> its isolating falsification)

All falsifications were run in a throwaway copy at
`%TEMP%\claude\d--vc\4028b141-b4f9-4793-84a0-f900414a84fb\scratchpad\t006-falsify` (created via
`tar`, excluding `.git`/`node_modules`, then `pnpm install`), never in the worktree. GREEN
baseline confirmed first (7/7 `mcp/student-profile`, 9/9 `mcp/university-kb`). Each row's edit was
applied to the copy, observed, then reverted from a `.bak` copy of the exact file before moving to
the next row; both suites were re-confirmed fully green after the last row. No falsification
connected to a real MongoDB server or read `.env` (B8 — all offline, fake `Db`/`Collection`).

Two hostile-input tests (`NoSQL-operator studentId/courseId`, `purpose`/`level` enum, `empty
query`) were **strengthened mid-session**: the first falsification attempt on the NoSQL-injection
row (disabling the `z.string()` guard) left the test still green, because the object silently
reached `requireConsent`/`findOne`, which still threw for an unrelated reason (no matching consent
row / no matching document) and still set `isError: true` — a false-negative-proof, not a real
falsification. Fixed by asserting the SDK's specific `/Input validation error/` message (confirmed
from the SDK's own source: `validateToolInput` throws `McpError(InvalidParams, "Input validation
error: ...")`) rather than the generic `isError === true`, which any tool error would satisfy. The
retry below shows the corrected, genuinely isolating result.

| capability | the check that covers it | the falsifying edit | observed (pasted runner output) |
|---|---|---|---|
| consent required | `mcp/student-profile/tests/index.test.ts` — `B4 consent required: get_profile_facts with no consent row returns a tool error and zero facts` | `src/index.ts`: commented out `await requireConsent(db, studentId, purpose);` (single-hunk disable) | PASS-before: `✔ B4 consent required: get_profile_facts with no consent row returns a tool error and zero facts (7.7589ms)`. FAIL-after: `✖ B4 consent required: ... (5.2485ms)` — `AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: + undefined - true` (`result.isError` was `undefined`, i.e. the call silently succeeded with no consent) |
| purpose filter | `mcp/student-profile/tests/index.test.ts` — `purpose filter: only facts whose purposeTags include the requested purpose come back, superseded facts excluded` | `src/index.ts`: removed the `purposeTags: purpose,` line from the Mongo filter object (single-hunk deletion) | PASS-before: `✔ purpose filter: ... (6.3813ms)`. FAIL-after: `✖ purpose filter: ... (4.389ms)` — `AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: 2 !== 1` (the `application_filling`-tagged fact leaked into a `counselling_session` query) |
| propose writes nothing | `mcp/student-profile/tests/index.test.ts` — `B3 propose_profile_diff writes nothing: the facts collection is unchanged after the call, read back directly` | `src/index.ts`: added `if (candidateFacts.length > 0) { await factsCollection(db).insertOne({...candidateFacts[0], _id: ..., studentId} as unknown as FactDoc); }` right after computing `diff` (single-hunk addition, nothing else touched) | PASS-before: `✔ B3 propose_profile_diff writes nothing: ... (4.8706ms)`. FAIL-after: `✖ B3 propose_profile_diff writes nothing: ... (8.2352ms)` — `AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal` — the `after` array gained an extra doc (`_id: 'falsify:s1:targetCountry'`) that `before` didn't have, read back directly from the fake collection (not through the tool) |
| uncited course excluded | `mcp/university-kb/tests/index.test.ts` — `uncited course excluded: search_courses drops a stored record missing sourceUrl/fetchedAt and counts it in \`dropped\`` | `src/index.ts`: `if (parsed.success) {` → `if (true) {` (single-hunk guard disable — now pushes `parsed.data` regardless of parse success) | PASS-before: `✔ uncited course excluded: ... (5.9225ms)`. FAIL-after: `✖ uncited course excluded: ... (8.2571ms)` — `AssertionError [ERR_ASSERTION]: Expected "actual" to be strictly unequal to: true` (`result.isError` became `true` — the two malformed docs, now pushed as `undefined`, fail the tool's own `outputSchema` validation, which is itself a second line of defense the falsification also exposed) |
| NoSQL-operator injection rejected | `mcp/student-profile/tests/index.test.ts` — `hostile: a NoSQL-operator object as studentId ({"$ne": null}) is rejected by Zod, not passed to the DB` | `src/index.ts`: `get_profile_facts` inputSchema `studentId: z.string().min(1)` → `z.any()` (single-hunk type-guard removal) | PASS-before: `✔ hostile: a NoSQL-operator object as studentId ... (3.8525ms)`. FAIL-after: `✖ hostile: ... (9.1985ms)` — `AssertionError [ERR_ASSERTION]: The input did not match /Input validation error/. Input: 'ConsentRequiredError: student "[object Object]" has no valid recorded consent covering purpose "counselling_session" (no consent row found) ...'` — i.e. with the guard removed, the raw `{"$ne": null}` object reaches `requireConsent` and gets stringified as `"[object Object]"`, proving the object was NOT stopped at the boundary |
| tool registered and callable through MCP | `mcp/student-profile/tests/index.test.ts` — `tool registered and callable through MCP: both tools appear in tools/list` | `src/index.ts`: commented out the entire second `server.registerTool("propose_profile_diff", ...)` call (single-hunk block comment) | PASS-before: `✔ tool registered and callable through MCP: both tools appear in tools/list (57.6023ms)`. FAIL-after: `✖ tool registered and callable through MCP: ... (63.5631ms)` — `AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal: actual: [ 'get_profile_facts' ], expected: [ 'get_profile_facts', 'propose_profile_diff' ]` — proved via a real `client.listTools()` round trip over the SDK's `InMemoryTransport`, not a direct object inspection |

After the last row, both packages' `pnpm test` were re-run in the falsify copy and confirmed fully
green (7/7, 9/9); the two edited source files were diffed byte-for-byte against the worktree's
originals afterward and found identical (no falsification edit leaked back into the real
worktree). The temp directory was left under the session scratchpad (a `rm -rf` there was denied
by the sandbox's destructive-command guard even though it targets only the scratch copy — not a
repo path, so nothing in `D:\vc` is affected).

## Live browser evidence
Not UI-touching — no surface changed. This unit only touched `mcp/student-profile/**`,
`mcp/university-kb/**`, and `pnpm-lock.yaml`. No `apps/web` or any browser-reachable surface
changed; the two servers are stdio MCP processes with no HTTP/UI surface.

## Status: ready-for-check
