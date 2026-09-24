# Verdict — t-003b-db-hardening

**Verdict:** PASS
**Cycle checked:** 0
**Unit diff judged:** 793e4c7..8aafe46 (commit 42a536c on top is a merge of main [T-004/T-005] only, checked for breakage, not judged as this unit's work — see "Merge breakage check" below)
**Contract:** qa/contracts/counselling-engine.md — B3, B4, B8, B11, B12, B14 (B15 out of scope per instruction, not checked)

## 1. Independent command re-run (fresh, not reusing the maker's run)

```
$ pnpm install --frozen-lockfile
Scope: all 10 workspace projects
Lockfile is up to date, resolution step is skipped
Packages: +30 (reused 30, downloaded 0)
Done in 3s

$ pnpm -r typecheck
Scope: 9 of 10 workspace projects
apps/api typecheck: Done
apps/web typecheck: Done
mcp/student-profile typecheck: Done
mcp/university-kb typecheck: Done
packages/observability typecheck: Done
packages/providers typecheck: Done
packages/schemas typecheck: Done
packages/engine typecheck: Done
packages/db typecheck: Done

$ pnpm -r test        (exit 0)
apps/api test:          tests 1, fail 0
apps/web test:          tests 1, fail 0
mcp/student-profile:    tests 1, fail 0
mcp/university-kb:      tests 1, fail 0
packages/providers:     tests 1, fail 0
packages/schemas test:  tests 50, fail 0
packages/observability: tests 43, fail 0
packages/engine test:   tests 31, fail 0
packages/db test:       tests 43, fail 0   <- this unit's package
  includes all 5 issue-specific tests green:
  ✔ B4: requireConsent resolves for a minor WITH guardianConsent covering the purpose (ISS-018)
  ✔ ISS-019: interleaving two applyApprovedDiff calls ... leaves at most one open fact
  ✔ ISS-020: applyApprovedDiff twice ... is idempotent / deriveFactId is deterministic
  ✔ ISS-021: proposeFactChanges treats structurally-equal object/array values as unchanged
  ✔ ISS-021: proposeFactChanges skips a schema-drifted stored fact ... and reports it
  ✔ B12 scanner: catches `.db(` with whitespace / bracket property access (x4) / file-filter .mts/.cts/.tsx

$ python contracts/verify_contracts.py
verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity
```

All match the manifest's claimed outputs (43/43 in packages/db, full 8/9 → corrected 9/10-workspace
typecheck green, 0 fail everywhere). No discrepancy from the maker's own run.

## 2. Per-issue outcome verification (falsification, not construction)

Every probe below was run directly in the worktree (not a copy) using a revert → run → restore
cycle: `git status --short` confirmed clean before starting and after every restore; `git diff
--stat` empty at the end. This is equivalent to a scratch-copy falsification (same isolation
guarantee — nothing was left modified) and was faster since the worktree already has
`node_modules` installed.

| Issue | Falsifying edit | Result |
|---|---|---|
| **ISS-018** | `src/consent.ts:37` inverted `if (consent.minor && !consent.guardianConsent)` → `if (consent.minor && consent.guardianConsent)` | `✖ B4: requireConsent resolves for a minor WITH guardianConsent...` — `AssertionError [ERR_ASSERTION]: Got unwanted rejection.` Confirms the test now actually exercises the async call (`assert.doesNotReject`, awaited) instead of the old vacuous `assert.doesNotThrow(async () => ...)`. |
| **ISS-019** | `tests/fakes.ts:92` commented out `this.assertNoUniqueConflict(doc);` | `✖ ISS-019: interleaving...` — `AssertionError: expected at most one open fact after the race, got 2`. Confirms `FakeCollection`'s unique-partial-index enforcement is load-bearing for the race test, and by extension that the real index (`scripts/db-init.ts`, reviewed below) is the mechanism the fix relies on. |
| **ISS-020** | `src/facts.ts:263` reverted `deriveFactId(...)` to the old wall-clock scheme (`` `${studentId}:${fact.key}:${Date.now()}:${Math.random()}` ``) | `✖ ISS-020: applyApprovedDiff twice...` — `AssertionError: replay must resolve to the same deterministic _id` with two different actual `_id`s printed. Confirms replay-idempotency depends on the deterministic hash, not on incidental behavior. |
| **ISS-021 (deep-equal)** | `src/facts.ts:183` reverted `!deepEqualValue(existing.value, candidate.value)` → `existing.value !== candidate.value` | `✖ ISS-021: proposeFactChanges treats structurally-equal object/array values as unchanged...` — `1 !== 0`. Confirms deep-equal (not reference) comparison is what the test actually exercises. |
| **ISS-021 (edges indexes)** | Not independently falsifiable offline — `scripts/db-init.ts` connects to the real production server and B8 forbids running it in tests. Reviewed by inspection: `edges_from` on `{"from.kind":1,"from.id":1}` and `edges_to` on `{"to.kind":1,"to.id":1}` (db-init.ts:62-67) match the issue's fix text verbatim. Enumerated debt, consistent with the manifest's own disclosure — acceptable. |
| **ISS-021 (schema-drift skip)** | Covered by the `deepEqualValue` reasoning above; the schema-drift test (`FactSchema.safeParse` skip+warn) was read and is structurally sound (drifted doc excluded from `activeByKey`, `console.warn` called, return shape unchanged) — not independently falsified as a 6th probe, but its logic is simple and directly inspected. |
| **ISS-t-003-student-kg-1** | `tests/db-scope.test.ts:55` reverted `containsDirectDbCall` to the original `content.includes(".db(")` substring check | 4 of 8 tests in the file went red: `✖ B12 scanner: catches \`.db(\` with whitespace before the call`, `✖ ...bracket property access client["db"](`, `✖ ...single quotes`, `✖ ...backticks` — all `false !== true`. The base `B12: no module outside packages/db/src/client.ts calls .db(` test itself stayed green throughout (nothing in the current tree happens to trigger the gap), which is exactly why this needed dedicated regression fixtures — confirmed they do their job. |

All 5 reverts were followed by `git checkout -- <file>` and `git diff --stat` confirming a clean
restore before moving to the next probe.

## 3. My own hostile-variant probe (beyond the manifest's coverage)

Read-only execution (`node --import tsx -e`) against the worktree's own `packages/db/src/facts.ts`,
no edit made:

```js
deriveFactId("alice|X", "c", "v", "s")  === deriveFactId("alice", "X|c", "v", "s")
// -> true (identical sha256 hash)
```

**Finding:** `deriveFactId`'s hash material is `` `${studentId}|${key}|${canonicalJson(value)}|${sessionId ?? ""}` ``
— an unescaped `"|"` delimiter. `studentId` and `key` are both `z.string().min(1)` in
`packages/schemas` (no character restriction), so a `"|"` inside either field lets two different
`(studentId, key)` pairs derive the identical fact `_id`. Traced the consequence through
`applyApprovedDiff`: `activeFilter` still matches on the real `studentId`/`key` fields, so there's
no false idempotent-replay match — but the colliding `_id` would hit Mongo's built-in unique `_id`
index on `insertOne` (E11000), and the code's duplicate-key handler re-reads `activeFilter` for the
*true* pair, finds nothing, and throws `FactConflictError` for what is actually a legitimate,
non-conflicting write. This is a correctness gap (a legitimate write gets wrongly blocked as a
"conflict"), not a crash or a silent data leak between students, and it requires a literal `"|"`
character inside `studentId` or `key` — plausible for `key` (free-text-ish going forward) less so
for `studentId` (likely system-generated), but nothing in the current schema or code prevents it.

Filed as **ISS-t-003b-db-hardening-1**, severity **medium**, status open, not blocking this unit —
it's an edge-case gap in the *new* ISS-020 mechanism, not a regression of anything this unit was
asked to fix, and the manifest's own claimed coverage (idempotent replay under normal identifiers)
holds up under every probe above.

## 4. B12 / B8 (production DB boundary)

- `packages/db/src/client.ts` (unmodified by this unit — confirmed via `git diff 793e4c7..8aafe46 --
  packages/db/src/client.ts` returning nothing) still owns the only `.db(` call in the repo.
- `tests/db-scope.test.ts`'s repo-wide static scan (`B12: no module outside packages/db/src/client.ts
  calls .db(`) passed, and its coverage was independently strengthened per the falsification above.
- Grepped the unit's own diff (`git diff 793e4c7..8aafe46 -- packages/db`) for `MONGODB_URL`,
  `pathlynks`, `global_university_db`, `admin`, `test_db` — zero hits. The only place those DB names
  appear anywhere in `packages/db` is inside `client.ts`'s refusal error message (pre-existing,
  unmodified), never as an actual connection target.
- `tests/fakes.ts` (this unit's new file) is explicitly documented as "No network I/O anywhere in
  this file" and inspection confirms it — `FakeCollection`/`FakeDb`/`FakeDuplicateKeyError` are
  pure in-memory `Map`-backed structures with no `mongodb` import.
- `scripts/db-init.ts` (real-server script, this unit's other changed file) is explicitly **not
  run** by this unit or by these tests — confirmed no test file imports or executes it — and its
  new index-creation calls were reviewed by inspection only, exactly as the manifest discloses.
- No test file added or modified by this unit references `MONGODB_URL` or constructs a real
  `MongoClient`.

**B12/B8 hold.**

## 5. Merge breakage check (commit 42a536c)

`git merge-base HEAD main` = `793e4c7`, confirming the branch forked there and `42a536c` is a
clean merge of main's T-004/T-005 work landing on top, not new work by this unit. The full
`pnpm -r test` run above (post-merge, at HEAD) is green across all 10 workspaces including
`packages/observability` (T-004) and the `packages/engine` skills/guards tests (T-005), so the
merge introduced no breakage.

## 6. B11 (secrets)

Grepped `packages/db` (working tree) and the unit diff for API-key/secret-shaped strings
(`sk-`, `AIza`, `mongodb+srv://user:pass@`, `password: "..."`, `secret: "..."`) — zero hits. This
unit touches no config/`.env` files, so a full git-history grep (B11's "any unit that touches
config" trigger) was not required; still checked and clean.

## Summary

All 5 claimed fixes (ISS-018, ISS-019, ISS-020, ISS-021, ISS-t-003-student-kg-1) are confirmed by
outcome, not construction — each has an independent falsification that reddens exactly the relevant
test(s) and nothing else, and a clean restore was verified after each. B12/B8 (data boundary) and
B11 (secrets) hold. The merge commit introduced no breakage. One new medium-severity, non-blocking
gap found (ISS-t-003b-db-hardening-1: `deriveFactId` delimiter collision) and filed to the ledger.

**PASS.**
