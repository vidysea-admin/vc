# Verdict — t-003b-db-hardening

**Verdict:** PASS
**Cycle checked:** 2
**Date:** 2026-09-25
**Checker worktree:** D:\vc\.worktrees\t-003b-db-hardening (branch wave/t-003b-db-hardening)
**Diff checked:** `1dd38b0..61eba29` (packages/db/**, mcp/student-profile/**, this manifest). `1242b3b` is a merge of main (brings in D-013). Contract sections: B2, B3, B4, B8, B12, B14 (manifest also claims B15 header row but this unit does not touch erasure code; not scored against it).

This is the LAST cycle in the budget (max 3). Cycle 0 and cycle 1 PASSes were both overridden by review Blocks because the checker's own probes never exercised a value the key had held before, never ran identical concurrent replays, and trusted a fake that was not faithful to the real driver. This verdict is built specifically to close those three gaps: every value-revert probe below uses the SAME sessionId across all calls (the actual collision shape — a different-sessionId revert does not collide even under the old broken code, see the negative-control note under item 2), concurrency is run at 2 AND 5 callers, and the fake's duplicate-key/pre-image behaviour is checked against the installed `mongodb@6` package's own `.d.ts`, not just against the manifest's claim about it.

## 1. Fresh commands, run by the checker, in the worktree (not copied from the manifest)

```
$ pnpm install
Scope: all 10 workspace projects
Lockfile is up to date, resolution step is skipped
Already up to date
Done in 668ms using pnpm v10.33.0

$ pnpm -r typecheck   (exit 0)
apps/web typecheck: Done
apps/api typecheck: Done
packages/providers typecheck: Done
packages/observability typecheck: Done
packages/schemas typecheck: Done
packages/engine typecheck: Done
packages/db typecheck: Done
mcp/university-kb typecheck: Done
mcp/student-profile typecheck: Done

$ pnpm -r test   (exit 0)
apps/web            tests 1  pass 1  fail 0
apps/api             tests 1  pass 1  fail 0
packages/providers   tests 1  pass 1  fail 0
packages/schemas     tests 50 pass 50 fail 0
packages/observability tests 43 pass 43 fail 0
packages/engine      tests 31 pass 31 fail 0
packages/db          tests 70 pass 70 fail 0
mcp/university-kb    tests 9  pass 9  fail 0
mcp/student-profile  tests 12 pass 12 fail 0

$ python contracts/verify_contracts.py   (exit 0)
verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity
```

All 9 workspaces green, matching the manifest's own claimed counts exactly (packages/db 70/70 including all D-013 and D-012 tests; mcp/student-profile 12/12 including the new D-013 legacy-fact test and all 4 ISS-029 tests).

## 2. Value revert — A→B→A, A→B→A→B, A→B→C→A (item 2)

The manifest's own tests use a fixed default `sessionId = "session-1"` across all three calls in its A→B→A / A→B→A→B tests, which is in fact the exact collision shape (same studentId+key+value+sessionId recurring is what made the old content-addressed `_id` collide with the retired original). I wrote fresh, independently-authored probes in a scratch copy (`packages/db/tests/checker-probe.test.ts`, never committed) against the **unmodified** production `facts.ts`/`fakes.ts`, with the production `INDEX_PLAN`'s unique partial index declared via `setupWithProdIndex()`:

- `A->B->A` (same sessionId throughout): 1 open fact = A at the end, 3 docs in history, the original A doc still carries `validTo` and no `active` field, and the reverted A has a **fresh, different `_id`** from the original A.
- `A->B->A->B`: 1 open fact = B, 4 docs, the second B has a fresh `_id` distinct from the first B's now-retired `_id`.
- `A->B->C->A`: 1 open fact = A (a NEW document, not the resurrected original — asserted by `_id` inequality), 4 docs total, A/B/C all remain retired with `validTo` set.

All green on the real code (14/14 in the final probe file — see full listing below). All 3 revert probes were also run with a distinct-sessionId variant (matching the manifest's own coverage) — also green — to make explicit that the same-sessionId case is the harder one.

**Negative control (falsifies the probe itself, not just the code):** in the scratch copy only, I reverted `_id: new ObjectId().toHexString()` back to `_id: contentHash` (the exact cycle-1 bug). Result: the distinct-sessionId revert probes stayed green (they don't exercise the collision — each write's contentHash differs because sessionId differs, so `_id` never collides even under the buggy code — this is exactly the gap in my own cycle-0/1 verdicts), but the **same-sessionId** revert probes went RED on all 3, each with `FactConflictError: another writer already holds the open fact` at the second occurrence of value A/B — reproducing ISS-t-003b-c1-1's "stuck at zero open facts" symptom precisely. Mutation reverted, 14/14 reconfirmed green.

## 3. Concurrency (item 3)

Fresh probes, 2 AND 5 callers, `Promise.allSettled`, against an **existing DIFFERENT open fact** (not a fresh empty key):

- 2 identical concurrent replays (same value, same sessionId) → both fulfilled, 1 open fact with the new value.
- 5 identical concurrent replays → all 5 fulfilled, 0 rejections, 1 open fact.
- 5 DIFFERENT-value concurrent writers against an existing open fact → exactly 1 fulfilled, 4 rejected with `FactConflictError` (verified by `instanceof`, not just message text), 1 open fact after the race, `factsColl.size() === 2` (original retired + exactly one new winner — proves no silent loss: every attempted write is accounted for as either the winner or a typed rejection, none vanish).

**Negative control:** removed the CAS-miss re-read block (`else if (current) throw FactConflictError` branch collapsed to an unconditional immediate throw) in the scratch copy. Both the 2-caller and 5-caller identical-replay probes went RED — 2-caller: 1 fulfilled / 1 rejected with `FactConflictError` on what should have been a no-op replay; 5-caller: 4 of 5 rejected. This is exactly ISS-t-003b-c1-2's symptom ("loser errors although its write landed"). Mutation reverted, reconfirmed green.

## 4. Crash between retire and insert (item 4)

Fresh probe: monkey-patched `factsColl.insertOne` to throw immediately after an existing open fact was seeded, simulating a crash inside the CAS-retire→insert window. Confirmed the precondition (zero open facts) is real, then restored `insertOne` and retried the **same** decision (same value, same sessionId) — healed to exactly 1 open fact.

Second probe: same crash window, but the retry uses a **different** sessionId. Confirmed this is treated as a genuinely new write (not silently merged with the crashed attempt): the healed fact's `contentHash` matches `deriveContentHash(..., "sessionB")`, not `deriveContentHash(..., "sessionA")` — matching the module docstring's documented behaviour ("a retry under a DIFFERENT sessionId is a new write with its own provenance edge").

## 5. D-013 (item 5)

- Confirmed by direct code read (`facts.ts:350`, `:369-372`, `:399`) and by the maker's own `D-013:` tests (all green, re-run fresh): every open fact carries `active: true`; the retire CAS filter is `{_id, active: true}` and the SAME update both sets `validTo` and unsets `active` (one atomic operation, not two).
- Ran `assertSupportedPartialFilter` from `tests/fakes.ts` directly (not through the test suite) against 8 cases: rejects `{validTo: {$exists: false}}` with `"Expression not supported in partial index: validTo: {$exists: false} ($not)"`, rejects `$ne` and `field: null`, accepts plain equality, `$gt`, `$or`/`$in`, and `$exists: true`.
- **Independently fact-checked** (not just trusting the manifest's claim) against MongoDB's own docs via WebSearch (mongodb.com/docs/manual/core/index-partial/): `$exists: true`, `$or` and `$in` are documented as supported in a `partialFilterExpression`; `$exists: false` is not (only `$exists: true` is named). This matches D-013's rationale and the fake's rejection list. `INDEX_PLAN`'s only `partialFilterExpression` is `{active: true}` — pure equality, unambiguously within the allowed set regardless of the edge cases.
- Grepped the full repo for `$exists: false`: the only occurrences are in comments/docstrings explaining why it's NOT used, and in `tests/db-init.test.ts`'s own tests asserting the validator *rejects* it. Zero occurrences as an actual query/index filter in `mcp/`, `apps/`, or `packages/engine`. In `packages/db` it appears only in the same explanatory/negative-test contexts.

## 6. Fake fidelity (item 6)

- Duplicate `_id` on `FakeCollection.insertOne` throws `FakeDuplicateKeyError` with `code === 11000` — confirmed via a fresh probe, not the maker's test.
- `findOneAndUpdate` with no `options` returns the pre-image (`v` before the update) — confirmed via a fresh probe.
- Cross-checked against the actual installed driver: read `node_modules/mongodb/mongodb.d.ts` directly (via `require.resolve('mongodb/package.json')`, not by trusting the manifest's quote) and found, verbatim: `"When set to 'after', returns the updated document rather than the original. The default is 'before'."` on the `returnDocument` field of `FindOneAndUpdateOptions`. This matches the fake's behaviour exactly.
- **Negative control:** reverted the fake's duplicate-`_id` branch to a plain `Error` (no `code`). The fidelity probe went RED (`expected 11000, got undefined`). Restored, reconfirmed green.

## 7. mcp/student-profile (item 7)

- Full suite re-run fresh: 12/12 green, including the new "D-013: a legacy open fact with no `active` field is NOT returned..." test and all 4 ISS-029 consent-leak-oracle tests (no-consent, wrong-purpose consent, purpose-tag mismatch, legitimate path).
- **Negative control:** in the scratch copy, reverted `get_profile_facts`'s filter from `active: true` back to the pre-D-013 `validTo: {$exists: false}` shape. Result: exactly 1 test went RED — the new D-013 legacy-fact test (`1 !== 0`, the legacy doc was wrongly returned) — while all 3 ISS-029 tests and the purpose-filter test stayed green, proving the D-013 fix is surgical and doesn't ride on unrelated test slack. Restored, reconfirmed 12/12.

## 8. B12 / B8 / B11 (item 8)

- `grep -rn "\.db("` over `packages/db/src` and `mcp/`: the only call is `packages/db/src/client.ts:33` (`return client.db(name);`), inside the one designated helper. No other module calls `.db(` directly. This is additionally enforced by the existing `B12: no module outside packages/db/src/client.ts calls .db(` test and its 5 hostile-variant siblings (bracket access, quotes, backticks, whitespace) — all green.
- B8 offline: `connectFromEnv never connects to a real MongoClient` and the db-init `INDEX_PLAN` import-does-not-connect test both pass; no test in this diff opens a real socket. `pnpm -r test` completed without any network dependency.
- B11 secrets: grepped the full `1dd38b0..61eba29` diff for API-key/secret/password/token/`mongodb+srv://` patterns — the only 3 hits are the literal string `SECRET` used as a placeholder value in the pre-existing ISS-029 "guessed key leaks nothing" test fixture (mcp/student-profile), not a real credential. `.env` is not tracked (`git ls-files` confirms). `.env.example` holds only key names (`GEMINI_API_KEY=`, `MONGODB_URL=`), no values.

## Methodology note (why this cycle's evidence is different from cycles 0/1)

All falsification for items 2–7 was run in an independent scratch copy at `C:\Users\Lenovo\AppData\Local\Temp\claude\d--vc\...\scratchpad\c2-falsify` — a `robocopy` of the worktree (excluding `.git` and `node_modules`) with `node_modules` re-linked via NTFS junctions back to the same pnpm content-addressable store (`D:\.pnpm-store\v10`), so the copy runs the identical installed `mongodb` package but is a physically separate tree the checker could mutate freely. The actual worktree (`D:\vc\.worktrees\t-003b-db-hardening`) was never edited during falsification; `git status --short` there is clean throughout and after. Every negative control listed above was reverted and green re-confirmed before moving to the next.

## Issues closed this cycle

`ISS-t-003b-c1-1` (critical), `ISS-t-003b-c1-2` (high), `ISS-t-003b-c1-3`, `ISS-t-003b-c1-4` — all four verified fixed by outcome (not construction) as detailed above, and fixed-status lines appended to `qa/issues.jsonl`. No new issues found this cycle (no `ISS-t-003b-c2-N` needed).

## Remaining risk (carried forward, not blocking)

- `scripts/db-init.ts`'s `main()` (real `createIndex` calls) has still never run against a live server — offline-only per B8/B12, unchanged from prior cycles. The shape is now validated against the documented partial-index operator whitelist, but the live `createIndex` call itself remains reviewed-by-inspection debt, same as cycles 0/1.
- If any pre-D-013 open facts (no `active` field) exist in a live `virtual_counsellor.facts` collection before `db:init` runs, they need a one-off backfill before the unique index can be created — the manifest already flags this; production has never been initialised, so it should be moot, but it is not this unit's job to verify that.
