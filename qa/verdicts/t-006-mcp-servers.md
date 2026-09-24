# Verdict — t-006-mcp-servers

**Verdict:** FAIL
**Cycle checked:** 0
**Date:** 2026-09-25
**Checker:** fresh Claude Sonnet subagent (Mode A), worktree `D:\vc\.worktrees\t-006-mcp-servers`,
branch `wave/t-006-mcp-servers`, judged unit diff `793e4c7..8aefc10`. Commit `e8609b5` (merge main
+ lockfile regen) reviewed for breakage only, per dispatch.
**Judged against:** `qa/contracts/counselling-engine.md` (current version, amendment log through
the 2026-09-25 B15/B16 entry), manifest B2/B3/B4/B6/B8/B11/B12/B13/B14.

## What I re-ran myself

```
$ pnpm install
Scope: all 10 workspace projects
Lockfile is up to date, resolution step is skipped
Already up to date
Done in 1.3s using pnpm v10.33.0
```

```
$ pnpm -r typecheck
Scope: 9 of 10 workspace projects
apps/api typecheck: Done
apps/web typecheck: Done
packages/observability typecheck: Done
packages/providers typecheck: Done
packages/schemas typecheck: Done
packages/engine typecheck: Done
packages/db typecheck: Done
mcp/student-profile typecheck: Done
mcp/university-kb typecheck: Done
```
(exit 0, all 9 typecheck-carrying packages "Done" — one more than the manifest's "8" because
`packages/observability` landed via the T-004/T-005 merge into this branch; not a T-006 change.)

```
$ pnpm -r test
… (per-package pass/fail, exit 0)
apps/api test: pass 1, fail 0
apps/web test: pass 1, fail 0
packages/providers test: pass 1, fail 0
packages/schemas test: pass 50, fail 0
packages/observability test: pass 43, fail 0
packages/engine test: pass 31, fail 0
packages/db test: pass 31, fail 0
mcp/university-kb test: pass 9, fail 0
mcp/student-profile test: pass 7, fail 0
```
Exit code 0. 174 tests total, 0 failures. (`packages/schemas` shows 50 vs. the manifest's 45,
and `packages/observability`/`packages/engine` appear at all, because `main` moved 7 commits ahead
via T-004/T-005 before this branch merged it in — expected, not a T-006 regression. Reproduced the
exact same 7/7 `mcp/student-profile` and 9/9 `mcp/university-kb` test names and timings-shape the
manifest pasted.)

```
$ python contracts/verify_contracts.py
verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity
```

```
$ git status --porcelain=v1
?? .handoffs/
```
(`.handoffs/` is pre-existing and unrelated to this unit — not a T-006 artifact.)

## Independent verification method
I did not trust the manifest's own test suite as the sole proof. I wrote my own temporary
"CHECKER PROBE" test files (`mcp/student-profile/tests/checker-probes.test.ts`,
`mcp/university-kb/tests/checker-probes.test.ts` — deleted before committing, never part of the
diff) that call both servers through a real `Client` connected over
`InMemoryTransport.createLinkedPair()`, exactly as the maker's tests do, but with independently
authored seed data and assertions:

1. **B4 consent gating — no consent row.** Re-verified (maker's own test, reproduced): `isError:
   true`, message matches `/ConsentRequiredError|no valid recorded consent/`.
2. **B4 purpose not covered.** My own probe: seeded a consent row whose `purposes` is
   `["application_filling"]` only, then called `get_profile_facts` with `purpose:
   "counselling_session"`. Result: `isError: true`, zero `structuredContent` — confirms the guard
   checks the *specific* purpose, not merely "any consent exists".
3. **Tenant scoping.** My own probe: two students (`s1`, `s2`), both with valid consent for
   `counselling_session`; `s2` holds a `sensitivity: "high"` fact (`medicalCondition`). Querying as
   `s1` returned exactly 1 fact (`s1`'s own), and `s2`'s confidential value never appeared —
   `PASS`.
4. **B3 propose_profile_diff writes nothing.** My own probe, re-verified via `collection.size()`
   directly on the fake (not `deepEqual` on an array snapshot, a different code path than the
   maker's own test): size before === size after across a 3-item candidate diff — `PASS`.
5. **B2 uncited course records — empty-string / invalid-date variants**, which the maker's own
   tests do not cover (they only test a *missing* `sourceUrl`/`fetchedAt` field, not an
   empty-string or malformed one). My own probes:
   - `sourceUrl: ""` (empty string, not undefined) → dropped by `search_courses` (`dropped: 1`,
     `courses: []`); `get_course` on the same record → tool error. `PASS`.
   - `fetchedAt: "not-a-date"` and `fetchedAt: "2026/09/25"` (non-ISO-8601) → both dropped by
     `search_courses` and rejected by `get_course`. `PASS`. (`CourseDocSchema.fetchedAt` is
     `z.string().datetime()`, which is strict RFC 3339 — confirmed these fail `safeParse`.)
6. **Malformed tool input rejected by Zod.** Re-verified NoSQL-operator `studentId`/`courseId`
   objects, out-of-enum `purpose`/`level`, empty `query`, and a non-array `candidateFacts` — all
   rejected with the SDK's own `/Input validation error/` message, confirming the SDK's Zod
   boundary runs *before* any DB call (not just that the call happened to fail downstream).
7. **`client.db(` scan (B12).** Re-ran `packages/db` test `"B12: no module outside
   packages/db/src/client.ts calls .db("` — passes, and I independently `grep -rn "\.db("
   mcp/student-profile/src mcp/university-kb/src` and `grep -rn "client\.db("` — zero hits in
   either package. `mcp/university-kb/src/index.ts` reaches `courses` via
   `db.collection<StoredCourseDoc>(COLLECTION_NAMES.courses)` on the already-`virtual_counsellor`-
   scoped `Db`, never opening a new handle. `PASS`.
8. **B11 secrets.** `grep -rn "MONGODB_URL\s*=\s*['\"]"` and `grep -rln "mongodb://"` across
   `mcp/` — zero hits. `mcp/*/src/bin.ts` reads `MONGODB_URL` only via `connectFromEnv(process.env)`
   (not run by tests). `PASS`.
9. **B6 tools are MCP.** Both servers register their tools on a real `McpServer` and are proven
   callable via `client.listTools()` / `client.callTool()` over a real (in-memory) MCP transport,
   not a bare function call on the handler. `PASS`.

## Falsification (my own, independent of the manifest's five)
I falsified a **different** guard than any of the manifest's five falsification rows, in a fresh
scratch copy (`%TEMP%\claude\d--vc\...\scratchpad\t006-checker-falsify`, `tar`-copied excluding
`.git`/`node_modules`/`.worktrees`, `pnpm install`'d there — never touching the real worktree):

- Removed `studentId` from the Mongo filter object in `get_profile_facts`
  (`mcp/student-profile/src/index.ts`, the `const filter: Filter<FactDoc> = { studentId, ... }`
  block — commented out only the `studentId,` line, leaving `validTo`/`purposeTags` filters
  intact and the code syntactically valid).
- Ran my own tenant-scoping probe test against the falsified copy:
  **PASS-before** (real worktree, unmodified): `✔ CHECKER PROBE: tenant scoping … (29.29ms)`.
  **FAIL-after** (falsified copy): `✖ CHECKER PROBE: tenant scoping … AssertionError: s1's query
  must return exactly s1's fact — 2 !== 1` — `s2`'s `medicalCondition` fact leaked into `s1`'s
  result the moment the `studentId` filter term was removed.
- This is a genuinely isolating falsification of a real guard, done independently of anything the
  manifest ran, confirming the tenant-scoping code path is load-bearing and my probe actually
  exercises it (not a vacuous assertion).
- The other 4 of my own probes were re-run unmodified against the same falsified copy and stayed
  green (as expected — the edit only affects `get_profile_facts`' filter), confirming the
  falsification was isolated to the one guard, not a global break.
- Falsified file reverted to the `.bak` copy inside the scratch directory only; the real worktree
  was never touched (`git status --porcelain=v1` above shows nothing under `mcp/`).

## New finding: B4 consent bypass via `propose_profile_diff` (see ISS-026)

While independently probing `propose_profile_diff`'s "writes nothing" claim, I tested a second,
unstated property: **does the tool leak existing profile data to a caller with no consent at
all?** The manifest's own reasoning for skipping any consent/purpose check on this tool says: *"it
does not expose new protected data the caller didn't already hand it."* I falsified that claim
directly.

`propose_profile_diff({studentId, candidateFacts})` computes `existingFacts =
factsCollection(db).find({studentId}).toArray()` — **every** stored fact for that student, active
and superseded, **with no consent check of any kind** (confirmed: `grep -n requireConsent
mcp/student-profile/src/index.ts` matches only inside `get_profile_facts`, not
`propose_profile_diff`). `proposeFactChanges` diffs each `candidateFacts[i]` against the existing
active fact for the same `key` and, when the values differ, emits `{op: "update", key, before:
<the real existing value>, after: <the candidate's value>}`. The `before` field is returned
verbatim in the tool's `structuredContent`.

**Proof (probe run against the real worktree, unmodified code):**
- Seeded student `s1` with **zero consent rows** and one fact: `medicalCondition:
  "diabetes-type-2-CONFIDENTIAL"`, `sensitivity: "high"`.
- Called `propose_profile_diff({studentId: "s1", candidateFacts: [{key:
  "medicalCondition", value: "guess", ...}]})` — an arbitrary, wrong guess.
- Result: `isError` not set, `structuredContent.diff.changes` = `[{op: "update", key:
  "medicalCondition", before: "diabetes-type-2-CONFIDENTIAL", after: "guess"}]`.
- The tool returned the real, confidential existing value in `before` to a caller who supplied
  only a wrong guess and held **no consent row whatsoever** for this student.

This is a working oracle: any caller who knows or guesses a fact `key` (a small, discoverable
vocabulary — `targetCountry`, `budget`, `medicalCondition`, etc., per the codebase's own fixtures)
can recover the student's actual stored value for that key in one call, with zero consent and no
`purpose` argument at all — the same protected data `get_profile_facts` correctly refuses to
return without a consent row covering the purpose. It also means `propose_profile_diff` is not
"read-only with respect to protected data" as the manifest's design note claims; it is a read
path for existing profile facts that bypasses B4 entirely.

This directly contradicts contract B4 ("Every fact carries purposeTags + sensitivity. A session
without a recorded consent row cannot be processed") and B14 ("Any allow-list or deny-list guard
has a hostile-variant test") — there is no guard here at all, so there is no test for it either.
Filed as **ISS-026, severity critical** (see `qa/issues.jsonl`).

## Contract criteria — summary

| Criterion | Result | Evidence |
|---|---|---|
| B2 (cited facts) | MET | `CourseDocSchema` requires `sourceUrl`/`fetchedAt`; missing, empty-string, and invalid-datetime variants all dropped/errored, not invented. `FactSchema.source` is a required discriminated union (packages/schemas). |
| B3 (writes only after approval / propose writes nothing) | MET for the literal claim | `propose_profile_diff` never calls `factsCollection(db).insertOne/updateOne`; `applyApprovedDiff` is not imported (`grep -n applyApprovedDiff mcp/student-profile/src/index.ts` → 3 hits, all in doc-comments). Re-verified via `collection.size()` before/after. |
| B4 (consent first) | **NOT MET** | `get_profile_facts` is correctly gated; `propose_profile_diff` is not gated at all and leaks existing fact values with zero consent (ISS-026). |
| B6 (tools are MCP) | MET | Both tools proven callable via a real `Client`/`InMemoryTransport` round trip, `tools/list` and `tools/call`. |
| B8/B12 (offline tests, DB helper only) | MET | No network I/O in any test (fake `Db`/`Collection` only); `packages/db`'s repo-wide `.db(` scan (covers `mcp/**`) passes; independently grepped, zero `client.db(`/`.db(` hits in `mcp/`. |
| B11 (secrets) | MET | No literal `MONGODB_URL`/`mongodb://` in `mcp/`; keys only ever read via `connectFromEnv(process.env)` in the untested `bin.ts`. |
| B13 (no student data to external models) | MET (informational) | Both READMEs carry the per-use gate note; this unit makes no external-model calls at all. |
| B14 (outcome, not construction; hostile-variant tests) | **NOT MET** | Both `get_profile_facts` and `search_courses`/`get_course` prove their outcome end to end with hostile variants. `propose_profile_diff` has no guard and no hostile-variant test for the leak in ISS-026 — the exact gap B14 exists to catch. |

## New issues

One new issue found and appended to `qa/issues.jsonl` (ISS-026, severity critical — see above and
the ledger entry for the exact fix suggestion).

## Why this is a cycle-0 FAIL, not a PASS-with-issue

B4 and B14 are both explicitly in this manifest's contract scope (`qa/contracts/
counselling-engine.md` B2/B3/B4/B6/B8/B11/B12/B13/B14), and the leak is trivially reachable by any
caller of the two registered tools with no additional privilege — this is not a low-severity
polish item, it is the exact class of consent-bypass the contract's B4 clause exists to prevent,
on a tool that ships live in this diff. Per the maker-checker discipline, only `/checker` can PASS
a unit, and a unit whose own tool defeats the sibling tool's consent guard cannot PASS on this
contract as written.

## Recommended fix (for the next fix cycle)

`propose_profile_diff` needs one of:
- add a `purpose` argument and call `requireConsent(db, studentId, purpose)` before reading
  `existingFacts`, same as `get_profile_facts`; or
- strip `before`/existing values from the returned diff for any fact the caller has no consent to
  see (i.e. only report `after` + `op`, never echo back the stored value); or
- restrict `propose_profile_diff` to only diff against facts the caller already asserts it knows
  (compare candidate vs. candidate-shaped output, no privileged lookback) — whichever aligns with
  T-007's actual counsellor-approval flow design.
Either way, a hostile-variant test (no consent row, guessed key) must cover it before this unit
can PASS.
