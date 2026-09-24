# Manifest — t-003-student-kg
**Contract:** qa/contracts/counselling-engine.md (B2, B3, B4, B5, B8, B11, B12)
**Goal task:** T-003
**Date:** 2026-09-25
**Fix cycle:** 0
**Dual check:** no
**Issues addressed:** none
**Executor:** claude-sonnet-subagent
**Executor rationale:** the previous build agent (also claude-sonnet-subagent) had already produced
a complete, on-brief implementation before being stopped mid-way; this session's job was to verify,
finish, and falsify it, not redesign it — no need for a larger model.

## Continuation note (work picked up mid-way)
On start, `git status` in the worktree showed `packages/db/` fully written (untracked) and
`pnpm-lock.yaml` modified (uncommitted), from a previous build agent that was stopped before it
verified, falsified, wrote a manifest, or committed. I read every file on disk against the brief
(ARCHITECTURE.md H3/§5, qa/contracts/counselling-engine.md B2/B3/B4/B5/B8/B11/B12,
docs/DECISIONS.md D-003/D-007/D-008/D-009, docs/plan.md §3, packages/schemas/src/schemas.ts) before
touching anything. The implementation already matched the brief in full — correct DB-name guard
(B12), correct env-only connection with no URI-default fallback, no `dropDatabase` anywhere,
Zod-validated typed accessors, `requireConsent`/minor-guardian gate (B4), pure `proposeFactChanges`
+ approve-gated `applyApprovedDiff` with supersede-via-`validTo` and two edges per written fact (B3),
idempotent `link()`, the live-but-unrun `db-init.ts`, and a static `.db(`-scope test. **Nothing was
rewritten.** My work this session was: verify every claim actually holds (typecheck, tests, the
contract verifier), run the falsification exercise (not yet done by the previous agent), write this
manifest, and commit.

## What changed (already on disk when this session started; verified, not rewritten)
- `packages/db/src/client.ts` — `VC_DB_NAME`, `getVcDb` (throws for any name other than
  `"virtual_counsellor"`), `connectFromEnv` (reads `MONGODB_URL` from an injected `env`, throws if
  missing, ignores the URI's own default db, injectable `MongoClientFactory` for offline tests), and
  `DROP_DATABASE_GATE_NOTE` documenting that no function in this package calls `dropDatabase` (D-009
  gate by omission).
- `packages/db/src/collections.ts` — `COLLECTION_NAMES` (students, sessions, facts, decisions,
  consents, edges, plus name-only `universities`/`courses` owned by the university-kb unit), typed
  `Collection<T>` accessors for each, and `validateFactForWrite`/`validateConsentForWrite`/
  `validateDecisionForWrite` (Zod-first on every write path).
- `packages/db/src/consent.ts` — `ConsentRequiredError`, `requireConsent(db, studentId, purpose)`:
  throws when no consent row exists, when the row doesn't cover `purpose`, or when the student is a
  minor without `guardianConsent` (B4).
- `packages/db/src/facts.ts` — `proposeFactChanges` (pure, never touches `facts`, throws via
  `FactSchema.parse` on an uncited candidate) and `applyApprovedDiff` (writes only when
  `decision.approve === true` and `decision.edits` is non-empty; B3), which supersedes the prior
  active fact for the same `(studentId, key)` via `validTo` (never deletes) and records a
  `fact --sourced_from--> {session|citation}` edge and a `student --has--> fact` edge per written
  fact.
- `packages/db/src/edges.ts` — `EdgeRef`/`EdgeDoc`, `deriveEdgeId` (deterministic), `link()`
  (idempotent upsert by derived `_id`, `createdAt` set only on first insert via `$setOnInsert`).
- `packages/db/src/index.ts` — re-exports client/collections/consent/facts/edges (D-007 source
  exports).
- `packages/db/scripts/db-init.ts` — live init script (collections + `facts`/`consents` indexes via
  `connectFromEnv`); **not run** by this unit; documented command in `packages/db/README.md`.
- `packages/db/tests/fakes.ts` — in-process `FakeCollection`/`FakeDb`/`createFakeMongoClient` (no
  `mongodb-memory-server`, no network).
- `packages/db/tests/{client,consent,db-scope,edges,facts}.test.ts` — 31 tests total (see below).
- `packages/db/package.json`, `packages/db/tsconfig.json`, `packages/db/README.md` — workspace
  wiring (`@vc/schemas: workspace:*`, `mongodb ^6.21.0`), `typecheck`/`test`/`db:init` scripts,
  documented live-init command.
- `pnpm-lock.yaml` — gained the `packages/db` importer (`@vc/schemas` workspace link + `mongodb` +
  dev deps). Pure addition: `126 insertions(+), 0 deletions(-)`.

This session added nothing new to `packages/db` beyond what was already there — verification found
no defect requiring a fix.

## How to verify (commands + expected)
- `pnpm install` → expected: exit 0, "Lockfile is up to date"
- `pnpm -r typecheck` → expected: exit 0, all 8 packages report "Done" incl. `packages/db`
- `pnpm -r test` → expected: exit 0, `packages/db` reports `pass 31 / fail 0`, every other package
  `fail 0`
- `python contracts/verify_contracts.py` → expected: exit 0 ("PASS by vacuity")
- `git diff --stat main -- pnpm-lock.yaml` → expected: additions only
- `git status --porcelain=v1` → expected: `packages/db/` untracked (new), `pnpm-lock.yaml` modified,
  nothing else

## Actual outputs (from this session's own run)

**`pnpm install`** — exit 0:
```
Scope: all 9 workspace projects
Lockfile is up to date, resolution step is skipped
Already up to date
Done in 795ms using pnpm v10.33.0
```

**`pnpm -r typecheck`** — exit 0, all 8 packages "Done", including:
```
packages/db typecheck$ tsc --noEmit
packages/db typecheck: Done
```

**`pnpm -r test`** — exit 0. `packages/db`:
```
✔ VC_DB_NAME is virtual_counsellor
✔ getVcDb accepts the default name (virtual_counsellor)
✔ B12: getVcDb rejects database name "pathlynks"
✔ B12: getVcDb rejects database name "global_university_db"
✔ B12: getVcDb rejects database name "(empty string)"
✔ B12: getVcDb never calls the driver's .db( for a rejected name
✔ connectFromEnv throws when MONGODB_URL is missing
✔ connectFromEnv ignores a URI-encoded default db name and always requests virtual_counsellor
✔ connectFromEnv never connects to a real MongoClient (the injected factory is used, not `new MongoClient`)
✔ B4: requireConsent throws ConsentRequiredError when no consent row exists
✔ B4: requireConsent throws when the recorded consent does not cover the purpose
✔ B4: requireConsent throws for a minor with no guardianConsent even if a consent row exists
✔ B4: requireConsent resolves for a minor WITH guardianConsent covering the purpose
✔ B4: requireConsent resolves for an adult with a matching consent row
✔ B12: no module outside packages/db/src/client.ts calls `.db(`
✔ sanity: the scanner actually walks packages/db/src (finds at least client.ts + collections.ts)
✔ deriveEdgeId is deterministic for the same from/to/rel
✔ deriveEdgeId differs when rel differs
✔ link() is idempotent by derived _id: calling it twice writes exactly one edge doc
✔ link() a second time does not change the original createdAt
✔ link() with a different rel produces a distinct edge doc
✔ proposeFactChanges never touches the facts collection (it only returns a ProfileDiff)
✔ proposeFactChanges emits an 'update' op when a candidate changes an existing active fact's value
✔ proposeFactChanges emits no change when the candidate value matches the existing active fact
✔ proposeFactChanges rejects an uncited candidate fact (Zod, no source)
✔ B3: applyApprovedDiff writes zero facts and zero edges when approve is false
✔ B3: applyApprovedDiff writes zero facts when approve is true but edits is omitted
✔ applyApprovedDiff writes facts + edges (fact->source sourced_from, student->fact has) when approve is true
✔ applyApprovedDiff falls back to a source-derived edge when no sessionId is given
✔ supersede-not-delete: approving a changed value closes the old fact via validTo instead of removing it
✔ Zod rejects an uncited fact on write: applyApprovedDiff rejects a decision.edits fact with no source
ℹ tests 31
ℹ pass 31
ℹ fail 0
```
Every other package (`apps/api`, `apps/web`, `mcp/student-profile`, `mcp/university-kb`,
`packages/providers`, `packages/schemas`, `packages/engine`) also reports `fail 0`.

**`python contracts/verify_contracts.py`** — exit 0:
```
verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity
```

**`git diff --stat main -- pnpm-lock.yaml`**:
```
pnpm-lock.yaml | 126 +++++++++++++++++++++++++++++++++++++++++++++++++++++++
1 file changed, 126 insertions(+)
```
Confirmed 0 deletions (`git diff main -- pnpm-lock.yaml | grep -c '^-'` → `1`, that one line is the
`--- a/pnpm-lock.yaml` diff header itself, not a removed content line).

**`git status --porcelain=v1`**:
```
 M pnpm-lock.yaml
?? packages/db/
```
`node_modules/` is git-ignored (`.gitignore:1: node_modules/`, confirmed via
`git check-ignore -v packages/db/node_modules/.bin/tsc`).

**Note on `git diff --stat main` showing `qa/.last-tick` and `qa/contracts/counselling-engine.md`
changes:** `main` (485b6ca) is 2 commits ahead of this worktree's branch tip (996f344) — commits
`c8d3cd4`/`485b6ca`, made directly on `main` by the checker (B7 tightening + new B14), unrelated to
this unit. `git log HEAD..main` confirms this. `git status --porcelain=v1 -- qa/` in the worktree is
empty — this session never touched `qa/contracts/`, `qa/.last-tick`, or any other `qa/` file except
writing this manifest. Pre-existing branch divergence, not something this unit caused.

## Capability coverage (each claim -> its isolating falsification)

All falsifications were run in a throwaway copy at
`%TEMP%\claude\d--vc\4028b141-b4f9-4793-84a0-f900414a84fb\scratchpad\t003-falsify` (created via `tar`
from the worktree, excluding `.git` and `node_modules`, then `pnpm install`), never in the worktree
itself. GREEN baseline confirmed first (31/31). Each row's edit was applied, observed, then reverted
(from a per-file `.bak` copy) before moving to the next row; the full suite was re-confirmed 31/31
green after the last row, and the temp copy was deleted afterward. No falsification connected to a
real MongoDB server or read `.env` (contract B8 — all offline, fake `Db`/`Collection`/`MongoClient`).

| capability | the check that covers it | the falsifying edit | observed (pasted runner output) |
|---|---|---|---|
| wrong-DB-name refused | `tests/client.test.ts` — `B12: getVcDb rejects database name "pathlynks"` | `client.ts`: `if (name !== VC_DB_NAME) {` → `if (false && name !== VC_DB_NAME) {` (single-hunk guard disable) | PASS-before: `✔ B12: getVcDb rejects database name "pathlynks" (0.3868ms)`. FAIL-after: `✖ B12: getVcDb rejects database name "pathlynks" (1.6ms)` (also the sibling `"global_university_db"`/`""`/`never calls .db(` rows redden in the same run, all for the same disabled-guard reason) |
| URI default db ignored | `tests/client.test.ts` — `connectFromEnv ignores a URI-encoded default db name and always requests virtual_counsellor` | `client.ts`: `getVcDb(client, VC_DB_NAME)` → `getVcDb(client, new URL(url).pathname.slice(1) \|\| VC_DB_NAME)` (single-hunk: derive the db name from the URI instead of the constant) | PASS-before: `✔ connectFromEnv ignores a URI-encoded default db name and always requests virtual_counsellor (0.3649ms)`. FAIL-after: `✖ connectFromEnv ignores a URI-encoded default db name and always requests virtual_counsellor (0.1935ms)` — `Error: getVcDb: refusing database "otherdb" — this engine is only allowed to use "virtual_counsellor" ...`, i.e. the edit made `connectFromEnv` actually try to use the URI's `/otherdb`, which is exactly the claim under test |
| no `.db(` outside helper | `tests/db-scope.test.ts` — `B12: no module outside packages/db/src/client.ts calls \`.db(\`` | appended `export function badDirectAccess(client) { return client.db("oops"); }` to `collections.ts` (single addition, no existing line touched) | PASS-before: `✔ B12: no module outside packages/db/src/client.ts calls \`.db(\` (25.1156ms)`. FAIL-after: `✖ B12: no module outside packages/db/src/client.ts calls \`.db(\` (26.2516ms)` — `AssertionError: .db( found outside the helper in: packages/db/src/collections.ts` |
| consent required | `tests/consent.test.ts` — `B4: requireConsent throws ConsentRequiredError when no consent row exists` | `consent.ts`: `if (!consent) {` → `if (false) {` (single-hunk guard disable) | PASS-before: `✔ B4: requireConsent throws ConsentRequiredError when no consent row exists (2.0463ms)`. FAIL-after: `✖ B4: requireConsent throws ConsentRequiredError when no consent row exists (2.672ms)` — `AssertionError: The error is expected to be an instance of "ConsentRequiredError". Received "TypeError"` (code fell through to read `consent.purposes` on `null`) |
| minor guardian | `tests/consent.test.ts` — `B4: requireConsent throws for a minor with no guardianConsent even if a consent row exists` | `consent.ts`: `if (consent.minor && !consent.guardianConsent) {` → `if (false) {` (single-hunk guard disable) | PASS-before: `✔ B4: requireConsent throws for a minor with no guardianConsent even if a consent row exists (0.3ms)`. FAIL-after: `✖ B4: requireConsent throws for a minor with no guardianConsent even if a consent row exists (0.8013ms)` — `AssertionError: Missing expected rejection (ConsentRequiredError)` |
| no write without approve:true | `tests/facts.test.ts` — `B3: applyApprovedDiff writes zero facts and zero edges when approve is false` | `facts.ts`: `if (!decision.approve \|\| !decision.edits \|\| decision.edits.length === 0) {` → `if (false) {` (single-hunk guard disable) | PASS-before: `✔ B3: applyApprovedDiff writes zero facts and zero edges when approve is false (0.5781ms)`. FAIL-after: `✖ B3: applyApprovedDiff writes zero facts and zero edges when approve is false (3.0626ms)` — `AssertionError [ERR_ASSERTION]: Expected values to be strictly equal` (written.length no longer 0) |
| supersede-not-delete | `tests/facts.test.ts` — `supersede-not-delete: approving a changed value closes the old fact via validTo instead of removing it` | `facts.ts`: removed the `await facts.updateOne({ _id: existing._id }, { $set: { validTo: now } });` line inside `if (existing) {` (single-hunk deletion, `supersededKeys.push` untouched) | PASS-before: `✔ supersede-not-delete: approving a changed value closes the old fact via validTo instead of removing it (0.6007ms)`. FAIL-after: `✖ supersede-not-delete: approving a changed value closes the old fact via validTo instead of removing it (1.5796ms)` — `AssertionError: the superseded fact must have validTo set` |

After the last row, the falsify-copy's `pnpm test` in `packages/db` was re-run and confirmed
31/31 pass, 0 fail; the temp directory was then deleted.

## Live browser evidence
Not UI-touching — no surface changed. This unit only touched `packages/db/**` (new package) and
`pnpm-lock.yaml`. No `apps/web` or any browser-reachable surface changed.

## Status: ready-for-check
