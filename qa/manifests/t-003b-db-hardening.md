# Manifest — t-003b-db-hardening
**Contract:** qa/contracts/counselling-engine.md (B3, B4, B12, B14)
**Goal task:** T-003b
**Date:** 2026-09-25
**Fix cycle:** 1 of max 3 (cycle-0 checker PASS overridden by two independent Block reviews: ISS-026 critical)
**Dual check:** no
**Issues addressed:** ISS-018, ISS-019, ISS-020, ISS-021, ISS-t-003-student-kg-1
**Executor:** claude-sonnet-subagent
**Executor rationale:** in-scope hardening of an existing, well-understood module (packages/db); no external tool was worthy of delegation.

## What changed
- `packages/db/tests/consent.test.ts:39-49` — ISS-018: the two B4 "resolves" tests wrapped `requireConsent` in `assert.doesNotThrow(async () => ...)`, which never awaits the inner call and so passed unconditionally. Switched to `await assert.doesNotReject(() => requireConsent(...))`.
- `packages/db/tests/fakes.ts` — added `FakeDuplicateKeyError` (duck-typed `{code: 11000}`, matching a real `MongoServerError`) and `FakeCollection.declareUniqueIndex(keys, {partialFilterExpression})` + enforcement in `insertOne`, so tests can reproduce Mongo's unique-partial-index behaviour offline (ISS-019).
- `packages/db/src/facts.ts`:
  - Added `canonicalize`/`canonicalJson`/`deepEqualValue` (recursive key-sorted JSON) — deep-equal value comparison, not reference equality (ISS-021).
  - Added `deriveFactId(studentId, key, value, sessionId)` — sha256-based deterministic fact `_id`, replacing the old wall-clock `${studentId}:${key}:${now}:${i}` scheme (ISS-020).
  - Added `FactConflictError` — typed error thrown when a duplicate-key race is a genuine conflict, not a replay (ISS-019).
  - Rewrote `applyApprovedDiff`'s per-fact loop: insert-new-before-retire-old ordering (a crash between the two leaves the OLD fact open, never zero), duplicate-key (`code 11000`) handling that re-reads and either treats an identical concurrent insert as success (idempotent) or throws `FactConflictError`, and skips the whole insert/retire path entirely when the deterministic `_id` shows this is a replay of an already-applied diff (ISS-019, ISS-020).
  - `proposeFactChanges`: every stored `existingFacts` doc is now `FactSchema.safeParse`d before being treated as active; a schema-drifted doc is skipped and reported via `console.warn` (return shape unchanged — still `ProfileDiff`) instead of trusted as-is (ISS-021). Value comparison switched to `deepEqualValue` (ISS-021).
  - Module + function docstrings rewritten to document the failure modes (crash windows, conflict resolution, replay semantics) per the ISS-019 requirement.
- `packages/db/scripts/db-init.ts` (script, NOT run by this unit) — replaced the non-unique `facts_studentId_key_validTo` index with a UNIQUE partial index `{studentId:1, key:1}` / `partialFilterExpression: {validTo: {$exists:false}}` (ISS-019); added `edges_from` (`{"from.kind":1,"from.id":1}`) and `edges_to` (`{"to.kind":1,"to.id":1}`) indexes (ISS-021). Docstring updated.
- `packages/db/tests/db-scope.test.ts` — ISS-t-003-student-kg-1: extracted `containsDirectDbCall` (now `/\.db\s*\(/` OR `/\[\s*(["'`])db\1\s*\]\s*\(/`, catching whitespace-before-call and bracket property access) and `isScannableSourceFile` (now `.ts`/`.mts`/`.cts`/`.tsx`, excluding `.test.`/`.spec.` markers, not just `.test.ts`) as named functions, and added 7 in-memory-fixture regression tests exercising each variant directly.
- `packages/db/tests/facts.test.ts` — added tests for ISS-019 (interleaved concurrent writers), ISS-020 (replay idempotency, `deriveFactId` determinism), and ISS-021 (deep-equal object/array comparison, schema-drift skip+report).

## How to verify (commands + expected)
- `pnpm install --offline` → expected: exit 0
- `pnpm -r typecheck` → expected: exit 0, all workspaces "Done"
- `pnpm -r test` → expected: exit 0, `packages/db test: ℹ pass 43` / `ℹ fail 0`
- `python contracts/verify_contracts.py` → expected: exit 0 (`PASS by vacuity` — no frozen contracts yet)
- `git diff --stat HEAD -- pnpm-lock.yaml` → expected: empty (lockfile untouched relative to this branch's own history)
- `git diff --stat HEAD` → expected: only `packages/db/**` (+ this manifest, once staged)

## Actual outputs (from maker's own run)
```
$ pnpm install --offline
Scope: all 9 workspace projects
Lockfile is up to date, resolution step is skipped
Already up to date
Done in 756ms using pnpm v10.33.0

$ pnpm -r typecheck
Scope: 8 of 9 workspace projects
apps/api typecheck: Done
apps/web typecheck: Done
mcp/student-profile typecheck: Done
mcp/university-kb typecheck: Done
packages/providers typecheck: Done
packages/schemas typecheck: Done
packages/engine typecheck: Done
packages/db typecheck: Done

$ pnpm -r test   (packages/db excerpt; full run: 8/8 workspaces green)
packages/db test: ✔ B4: requireConsent resolves for a minor WITH guardianConsent covering the purpose (0.3772ms)
packages/db test: ✔ B4: requireConsent resolves for an adult with a matching consent row (0.3133ms)
packages/db test: ✔ B12: no module outside packages/db/src/client.ts calls `.db(` (40.1978ms)
packages/db test: ✔ B12 scanner: catches `.db(` with whitespace before the call (0.2796ms)
packages/db test: ✔ B12 scanner: catches bracket property access client["db"]( (0.1725ms)
packages/db test: ✔ B12 scanner: catches bracket property access with single quotes client['db']( (0.1735ms)
packages/db test: ✔ B12 scanner: catches bracket property access with backticks and internal whitespace (0.1569ms)
packages/db test: ✔ B12 scanner: file filter now includes .mts/.cts/.tsx and excludes .test./.spec. variants (0.206ms)
packages/db test: ✔ ISS-020: applyApprovedDiff twice with the same inputs is idempotent (one open fact, no duplicate edges) (0.9242ms)
packages/db test: ✔ ISS-020: deriveFactId is deterministic for identical inputs and differs when the value differs (0.312ms)
packages/db test: ✔ ISS-019: interleaving two applyApprovedDiff calls for the same (studentId,key) leaves at most one open fact (1.1757ms)
packages/db test: ✔ ISS-021: proposeFactChanges treats structurally-equal object/array values as unchanged (deep-equal, not reference-equal) (0.4418ms)
packages/db test: ✔ ISS-021: proposeFactChanges DOES flag an object/array value whose content actually differs (0.3869ms)
packages/db test: ✔ ISS-021: proposeFactChanges skips a schema-drifted stored fact instead of throwing, and reports it (0.7069ms)
packages/db test: ℹ tests 43
packages/db test: ℹ pass 43
packages/db test: ℹ fail 0

$ python contracts/verify_contracts.py
verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity

$ git diff --stat HEAD -- pnpm-lock.yaml
(empty)

$ git diff --stat HEAD
 packages/db/scripts/db-init.ts     |  36 +++++--
 packages/db/src/facts.ts           | 196 +++++++++++++++++++++++++++++++++----
 packages/db/tests/consent.test.ts  |   9 +-
 packages/db/tests/db-scope.test.ts |  88 +++++++++++++++--
 packages/db/tests/facts.test.ts    | 136 ++++++++++++++++++++++++-
 packages/db/tests/fakes.ts         |  57 +++++++++++
 6 files changed, 486 insertions(+), 36 deletions(-)
```

**Note on `git diff --stat main`:** run against the current `main` tip, this shows additional
files outside `packages/db/**` (packages/engine/**, skills/**, qa/manifests/t-005-skills-guards.md,
TASKS.md, pnpm-lock.yaml, ...) as apparent deletions. This is NOT something this unit touched —
`git merge-base HEAD main` is `793e4c7`, the exact commit `wave/t-003b-db-hardening` forked from;
`main`'s tip has since moved to `61de27d` via a separate, already-merged wave (T-005:
skills/guards) that landed after this branch forked. `git diff --stat HEAD` (this branch's own
history) and `git diff --stat HEAD -- pnpm-lock.yaml` (both pasted above) are the correct measure
of this unit's own scope and both confirm: packages/db/** only, lockfile untouched. Verified with
`git diff HEAD -- TASKS.md` also being empty (the TASKS.md delta against `main` is the same
upstream-drift artifact, not a local edit).

## Capability coverage (each new claim -> its isolating falsification)

All falsification below was run in an isolated temp copy at
`%LOCALAPPDATA%\Temp\claude\d--vc\...\scratchpad\t003b-fz2` — a fresh `pnpm-workspace.yaml` +
`packages/db` + `packages/schemas` (source only, no `node_modules`) followed by `pnpm install
--offline` + `pnpm rebuild esbuild`, entirely outside `D:\vc`. GREEN was confirmed first
(43/43), then each row's edit was applied, the named check re-run, reverted, and GREEN
re-confirmed (43/43 at the end). No real MongoDB connection was made anywhere in this exercise.

| capability (one line) | the check that covers it | the falsifying edit | observed (pasted runner output) |
|---|---|---|---|
| ISS-018: the two `requireConsent` "resolves" tests can now actually fail | `tests/consent.test.ts` "B4: requireConsent resolves for a minor WITH guardianConsent..." | `src/consent.ts:37` invert `if (consent.minor && !consent.guardianConsent)` → `if (consent.minor && consent.guardianConsent)` | BEFORE (old vacuous form, separate script proving it): `OLD FORM RESULT: assert.doesNotThrow did NOT fail synchronously (vacuous pass) -- the bug was invisible to it` (exit 0, bug present). AFTER (fixed form, same bug): `✖ B4: requireConsent resolves for a minor WITH guardianConsent covering the purpose` / `AssertionError [ERR_ASSERTION]: Got unwanted rejection. Actual message: "ConsentRequiredError: ... student is a minor and guardianConsent is not recorded ..."` |
| ISS-019: `FakeCollection` enforces a unique partial index (throws `{code:11000}`) | `tests/facts.test.ts` "ISS-019: interleaving two applyApprovedDiff calls..." | `tests/fakes.ts:92` comment out `this.assertNoUniqueConflict(doc);` in `insertOne` | BEFORE: `✔ ISS-019: interleaving two applyApprovedDiff calls for the same (studentId,key) leaves at most one open fact (0.9034ms)`. AFTER: `✖ ISS-019: ...` / `AssertionError: expected at most one open fact after the race, got 2` |
| ISS-019: `applyApprovedDiff` resolves a duplicate-key race deterministically (idempotent-match or typed `FactConflictError`), never a raw driver error or a silent second open fact | `tests/facts.test.ts` "ISS-019: interleaving..." + "ISS-020: applyApprovedDiff twice..." | `src/facts.ts` revert the `let doc: FactDoc; if (existingBefore && existingBefore._id === _id) {...} else { try {...} catch {...} ...}` block to the pre-fix unguarded `supersede-then-insert` with wall-clock `_id` | BEFORE: both `✔`. AFTER: `✖ ISS-020: ... AssertionError: replay must resolve to the same deterministic _id` (`...2026-09-24T23:35:14.640Z:0` !== `...641Z:0`) AND `✖ ISS-019: ... AssertionError: expected FactConflictError, got FakeDuplicateKeyError: E11000 duplicate key error...` |
| ISS-020: `deriveFactId` is deterministic (same _id for identical inputs) and replaying an approved diff is a no-op | `tests/facts.test.ts` "ISS-020: deriveFactId is deterministic..." + "ISS-020: applyApprovedDiff twice..." | same edit as the row above (the old wall-clock `_id` scheme) | see the ISS-020 AssertionError pasted in the row above — the two calls no longer resolve to the same `_id`, so the "no duplicate open fact on replay" guarantee breaks at the source |
| ISS-021: `proposeFactChanges` compares values by deep-equal (canonical JSON), not reference | `tests/facts.test.ts` "ISS-021: proposeFactChanges treats structurally-equal object/array values as unchanged..." | `src/facts.ts` revert `!deepEqualValue(existing.value, candidate.value)` → `existing.value !== candidate.value` | BEFORE: `✔`. AFTER: `✖ ISS-021: ... treats structurally-equal... AssertionError: Expected values to be strictly equal: 1 !== 0` (a same-content, different-instance object was wrongly flagged as changed) |
| ISS-021: `proposeFactChanges` skips a schema-drifted stored fact (not thrown, not trusted) and reports it | `tests/facts.test.ts` "ISS-021: proposeFactChanges skips a schema-drifted stored fact..." | `src/facts.ts` revert the `FactSchema.safeParse(fact)` skip+warn block to plain `activeByKey.set(fact.key, fact)` | BEFORE: `✔`. AFTER: `✖ ISS-021: ... skips a schema-drifted... AssertionError: Expected values to be strictly equal: 0 !== 1` (the drifted doc was trusted as "Canada" already-active, so the identical-value candidate produced 0 changes instead of the expected "add") |
| ISS-t-003-student-kg-1: scanner catches whitespace-before-call and bracket-property-access `.db(` variants | `tests/db-scope.test.ts` "B12 scanner: catches ... whitespace..." / "...bracket property access..." (x3) | `containsDirectDbCall` reverted to `return content.includes(".db(")` (the original substring-only check) | BEFORE: all 4 `✔`. AFTER: `✖ B12 scanner: catches \`.db(\` with whitespace before the call` / `✖ ...client["db"](` / `✖ ...client['db'](` / `✖ ...backticks...` — all `AssertionError: Expected values to be strictly equal: false !== true` |
| ISS-t-003-student-kg-1: file filter now scans `.mts`/`.cts`/`.tsx`, excludes `.test.`/`.spec.` | `tests/db-scope.test.ts` "B12 scanner: file filter now includes .mts/.cts/.tsx..." | `isScannableSourceFile` reverted to `return name.endsWith(".ts") && !name.endsWith(".test.ts")` | BEFORE: `✔`. AFTER: `✖ B12 scanner: file filter... AssertionError: Expected values to be strictly equal: false !== true` (`isScannableSourceFile("client.mts")` now `false`) |
| edges gets `from`/`to` indexes; facts gets the unique partial index (scripts/db-init.ts) | Not automatically tested — `scripts/db-init.ts` connects to the real production server and this unit is explicitly forbidden from running it (B8: offline tests only; this file is "NOT RUN by T-003b") | n/a | `UNVERIFIED — scripts/db-init.ts's new `createIndex` calls (unique partial on facts, edges_from, edges_to) are reviewed by inspection only (see "What changed"); they cannot be executed or falsified without a real MongoDB connection, which this unit and contract B8 forbid. Coverage is: (a) `tests/fakes.ts`'s `declareUniqueIndex`/`FakeDuplicateKeyError` independently prove the *shape and semantics* the real index is meant to provide (row 2 above), and (b) the index spec is copied verbatim from the ledger's fix text (ISS-019/ISS-021).` — enumerated debt, not silently shipped. |

## Live browser evidence
Not UI-touching — no surface changed. This unit only touches `packages/db/**` (a Mongo access
layer with no HTTP/UI surface) and a manifest file.

## Status: ready-for-check
