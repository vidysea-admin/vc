# Verdict — t-006-mcp-servers

**Verdict:** PASS
**Cycle checked:** 1
**Date:** 2026-09-25
**Checker:** fresh Claude Sonnet subagent (Mode A), worktree `D:\vc\.worktrees\t-006-mcp-servers`,
branch `wave/t-006-mcp-servers`, judged unit diff `c676e9f..852c2d1` (commit `852c2d1`, "fix(mcp):
t-006 cycle 1 — consent + purpose gate on propose_profile_diff (ISS-029)").
**Judged against:** `qa/contracts/counselling-engine.md` B2, B3, B4, B5, B8, B12, B14.
**Prior verdict:** FAIL cycle 0, on ISS-029 (critical) — `propose_profile_diff` had no consent
check and echoed the real stored value of any guessed fact key in `ProfileDiff.changes[].before`.

## What changed this cycle
Only `mcp/student-profile/src/index.ts` and `mcp/student-profile/tests/index.test.ts` (confirmed:
`git diff --stat c676e9f..852c2d1` touches exactly `mcp/student-profile/src/index.ts` (+37/-9),
`mcp/student-profile/tests/index.test.ts` (+230 new), and `qa/manifests/t-006-mcp-servers.md`).
`mcp/university-kb/**` is untouched. In `propose_profile_diff`:
- `inputSchema` gained a required `purpose: ProfilePurposeSchema` field (same enum as
  `get_profile_facts`).
- The handler now calls `await requireConsent(db, studentId, purpose)` before any read — a
  refusal is a tool error with no `structuredContent` at all.
- The existing-facts read changed from `find({ studentId })` to
  `find({ studentId, purposeTags: purpose })` — a stored fact outside the consented purpose is
  never fetched, so it can never surface as an `"update"` with a real `before` (it is diffed as an
  unseen key, i.e. an `"add"`).

## What I re-ran myself (worktree, fresh)

```
$ pnpm install
Scope: all 10 workspace projects
Lockfile is up to date, resolution step is skipped
Already up to date
Done in 1.4s using pnpm v10.33.0
```

```
$ pnpm -r typecheck
Scope: 9 of 10 workspace projects
apps/api typecheck: Done
apps/web typecheck: Done
packages/observability typecheck: Done
packages/providers typecheck: Done
packages/schemas typecheck: Done
packages/db typecheck: Done
packages/engine typecheck: Done
mcp/student-profile typecheck: Done
mcp/university-kb typecheck: Done
```
Exit 0, all 9 typecheck-carrying packages "Done".

```
$ pnpm -r test
```
Exit 0. 178 tests total, 0 failures, per package:
```
apps/web test: pass 1, fail 0
apps/api test: pass 1, fail 0
packages/providers test: pass 1, fail 0
packages/schemas test: pass 50, fail 0
packages/observability test: pass 43, fail 0
packages/engine test: pass 31, fail 0
packages/db test: pass 31, fail 0
mcp/university-kb test: pass 9, fail 0
mcp/student-profile test: pass 11, fail 0
```
`mcp/student-profile` (11/11 — 7 pre-existing + 4 new ISS-029 tests), reproduced verbatim:
```
✔ tool registered and callable through MCP: both tools appear in tools/list (53.0458ms)
✔ B4 consent required: get_profile_facts with no consent row returns a tool error and zero facts (6.9917ms)
✔ purpose filter: only facts whose purposeTags include the requested purpose come back, superseded facts excluded (4.6354ms)
✔ B3 propose_profile_diff writes nothing: the facts collection is unchanged after the call, read back directly (4.0534ms)
✔ hostile: purpose not in the enum is rejected by Zod before any DB read (3.5363ms)
✔ hostile: a NoSQL-operator object as studentId ({"$ne": null}) is rejected by Zod, not passed to the DB (2.5625ms)
✔ hostile: an uncited candidate fact in propose_profile_diff is rejected by Zod (FactSchema requires source) (3.151ms)
✔ ISS-029: propose_profile_diff with no consent row and a guessed key leaks nothing -- the secret string appears nowhere in the response (2.8436ms)
✔ ISS-029: consent recorded for a DIFFERENT purpose still leaks nothing (5.4645ms)
✔ ISS-029: consented purpose, but the stored fact is tagged with a DIFFERENT purpose -- no before leak, diff treats it as unseen (3.6001ms)
✔ ISS-029: the legitimate path (consented purpose, fact tagged with that purpose) still produces a correct update diff (2.2164ms)
```

```
$ python contracts/verify_contracts.py
verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity
```

## Independent verification method (my own oracle probe, not the manifest's)

I did not accept the manifest's own 4 new tests as sufficient proof. I wrote a fresh,
independently authored probe file (`checker-probe-cycle1.test.ts`, never committed, run only in an
isolated scratch copy of the repo at
`C:\Users\Lenovo\AppData\Local\Temp\claude\d--vc\4028b141-b4f9-4793-84a0-f900414a84fb\scratchpad\t006-checker-cycle1`
— `tar`-copied from the worktree excluding `.git`/`node_modules`/`.worktrees`/`.handoffs`, then
`pnpm install`'d there, never touching the real worktree). It calls `propose_profile_diff` through
a real `Client` over `InMemoryTransport.createLinkedPair()`, with 3 distinct secret strings seeded
across 3 different fact keys for one student, and asserts the raw serialized JSON response never
contains any of them:

**Baseline (unmodified fixed code, scratch copy) — 7/7 green, plus the full existing 11/11
untouched:**
```
✔ CHECKER c1: zero consent + high-sensitivity fact + guessed key -> no leak, tool error (27.2515ms)
✔ CHECKER c1 hostile: consent for the WRONG purpose (application_filling) -> no leak (5.4326ms)
✔ CHECKER c1 hostile: consented purpose, but ALL THREE facts tagged with a different purpose -> no leak across any key (5.7082ms)
✔ CHECKER c1 hostile: missing `purpose` field entirely is rejected by Zod, not silently treated as consented (3.6742ms)
✔ CHECKER c1 hostile: EXTRA unexpected field alongside a valid purpose is still safely handled (either rejected or the extra field is ignored, never used as a second implicit purpose/consent bypass) (9.542ms)
✔ CHECKER c1 hostile: purpose value outside the enum ('billing') is rejected before any DB read, no leak (3.3889ms)
✔ CHECKER c1: legitimate path (consent covers purpose, fact tagged with same purpose) still produces a correct update diff, and writes zero facts (4.1608ms)
ℹ tests 7, pass 7, fail 0
```

Variants exercised, per the checker brief:
1. **Zero consent rows + high-sensitivity fact + guessed key** → `isError: true`, no secret in
   the serialized response. PASS.
2. **Consent for the wrong purpose** (`application_filling` recorded, `counselling_session`
   requested) → same refusal, no leak. PASS.
3. **Consented purpose, but the fact is tagged with a different purpose** — tested across *all
   three* seeded keys at once (candidateFacts guesses `medicalCondition`, `familyIncome`,
   `visaHistory` in one call): call succeeds (consent covers the requested purpose), but every
   `diff.changes[]` entry is asserted `op !== "update"` and `before === undefined`; no secret
   string anywhere in the response. PASS.
4. **Missing `purpose` field** → Zod's own `/Input validation error/`, rejected before any DB
   read, no leak. PASS.
5. **Purpose value outside the enum** (`"billing"`, even with a consent row that dishonestly
   claims to cover `"billing"`) → Zod rejects the enum value itself before the DB call; no leak.
   PASS.
6. **Extra/decoy fields** (`consentOverride: true`, a plural `purposes: [...]` array) alongside a
   valid `purpose` and zero real consent rows → still refused; the decoy fields are not an
   alternate auth path. PASS.
7. **Legitimate path** (consent covers the purpose, fact tagged with that same purpose) — produces
   a correct `"update"` diff (`before: "France"`, `after: "Ireland"`) and the fake collection is
   read back directly afterward and found byte-for-byte unchanged (zero writes). PASS.

## Falsification (isolating, against my own probe)
In the same scratch copy, commented out **only** the `propose_profile_diff` call site of
`requireConsent` (`src/index.ts` line 148 of that copy), leaving `get_profile_facts`'s call site
(line 104) untouched — confirmed via `grep -n requireConsent src/index.ts` before and after.

- **FAIL-after** (gate removed): `npx tsx --test tests/checker-probe-cycle1.test.ts` → 4 pass, 3
  fail, exit 1. The 3 that went red are exactly the ones whose oracle depends on the
  `propose_profile_diff` consent call: "zero consent + guessed key", "wrong-purpose consent", and
  "extra/decoy fields with zero consent" — each failed with `result.isError` being `undefined`
  instead of `true` (the call silently succeeded again). The 4 that stayed green are the ones that
  don't depend on that exact call: the purpose-tag-mismatch row (enforced by the Mongo
  `purposeTags: purpose` filter term, a separate line, still present), the missing-field and
  out-of-enum rows (Zod boundary, unaffected), and the legitimate path (doesn't exercise the
  no-consent branch). This proves the probe is a genuine, isolating falsification of the exact
  guard added this cycle, not a vacuous assertion.
- Restored the file (`mv src/index.ts.bak src/index.ts`); re-ran the full suite in the scratch
  copy (`npx tsx --test tests/*.test.ts`): **18/18 green** (11 maker + 7 checker-probe).
  `grep -n requireConsent src/index.ts` shows both call sites restored (lines 104, 148).
- Byte-for-byte diff of the restored scratch-copy source against the real worktree's
  `mcp/student-profile/src/index.ts`: identical. No falsification edit leaked back into the real
  worktree (`git status --porcelain=v1` in the worktree shows only the pre-existing, unrelated
  `?? .handoffs/`).

## Re-confirmed cycle-0 criteria (still hold, unchanged by this cycle's diff)
- **B2 (cited facts):** `mcp/university-kb/src/index.ts` (untouched this cycle) still requires
  `sourceUrl`/`fetchedAt` via `CourseDocSchema.safeParse`; a failing record is dropped/errored, not
  invented. Re-confirmed via the unmodified `pnpm -r test` run above (`mcp/university-kb` 9/9,
  including the uncited-record and malformed-date hostile rows).
- **B4 (consent first):** now enforced identically on both `get_profile_facts` and
  `propose_profile_diff`. Re-verified independently above (7 hostile variants, all refusing to
  leak).
- **Tenant scoping:** `get_profile_facts`'s Mongo filter still includes `studentId` alongside
  `purposeTags`/`validTo` (unchanged, `src/index.ts:106-112`) — cross-student leakage was already
  covered by the existing "purpose filter" test's `f4` (a different student's fact) and remains
  covered; not touched by this cycle's diff, so not re-falsified, but confirmed still present by
  reading the file.
- **Zod boundaries (B5):** all four tool input schemas (`get_profile_facts`,
  `propose_profile_diff` ×2 fields, `search_courses`, `get_course`) still reject NoSQL-operator
  objects, out-of-enum values, and missing required fields with the SDK's own
  `/Input validation error/`, confirmed both by the maker's own hostile tests and my own
  missing-purpose / out-of-enum probes above.
- **B12 (no `client.db(` outside `packages/db`):** `grep -rn "\.db(" mcp/student-profile/src
  mcp/university-kb/src` → zero hits (re-run this cycle). `packages/db`'s own repo-wide scanner
  test (`B12: no module outside packages/db/src/client.ts calls .db(`) passed in the `pnpm -r
  test` run above, and it covers `mcp/**`.
- **B11 (secrets):** `grep -rln "mongodb://" mcp/` and `grep -rn "MONGODB_URL\s*=\s*['\"]" mcp/` →
  zero hits, re-run this cycle.
- **B8 (offline tests):** all falsification and probe work ran against the in-process `FakeDb`
  fake, never a real MongoDB connection; confirmed no network calls in any test file touched.

## Contract criteria — summary (this cycle's scope: B2, B3, B4, B5, B8, B12, B14)

| Criterion | Result | Evidence |
|---|---|---|
| B2 (cited facts) | MET | Unchanged this cycle; re-confirmed via `mcp/university-kb` 9/9 including hostile drop rows. |
| B3 (writes only after approval) | MET | `propose_profile_diff` still never calls `insertOne`/`updateOne`; re-verified zero-writes both in the worktree's own test and my independent legitimate-path probe (`collection.all()` before/after, byte-for-byte equal). |
| B4 (consent first) | **MET — the cycle-0 gap is closed** | `propose_profile_diff` now gates on `requireConsent(db, studentId, purpose)` before any read, identical to `get_profile_facts`; 7 independent hostile variants (no consent, wrong purpose, purpose-tag mismatch across 3 keys, missing field, out-of-enum, decoy fields) all confirmed non-leaking; isolating falsification confirms the guard is load-bearing. |
| B5 (typed boundaries / Zod) | MET | All 4 tool input schemas reject malformed input at the SDK's Zod boundary before any DB call. |
| B8 (offline, DB helper only) | MET | No network I/O anywhere in this cycle's tests or probes; fake `Db`/`Collection` only. |
| B12 (single DB, no raw `client.db(`) | MET | Zero hits in `mcp/**`; `packages/db`'s repo-wide scanner test passes and covers `mcp/**`. |
| B14 (outcome, not construction; hostile-variant tests) | MET | The exact gap B14 exists to catch (ISS-029) is now covered by both the maker's own 4 new tests and 7 independently-authored hostile variants from this session, including combinations the maker's tests didn't try (multiple simultaneous guessed keys, decoy/extra fields, missing-field vs. out-of-enum distinguished). |

## Issue disposition
ISS-029 (critical) is **fixed**, confirmed by independent re-verification (not just re-running the
manifest's own tests). Fixed-status line appended to `qa/issues.jsonl` below this verdict's commit.
No new issues found this cycle.

## Status
**PASS.** The unit may close out to `checked-PASS`.
