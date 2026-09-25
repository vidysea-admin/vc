# Verdict: t-007-scribe-graph

**Verdict:** PASS
**Cycle checked:** 2
**Date:** 2026-09-25
**Cycle-2 diff:** `d80dc43..087ffa0` (commit 087ffa0)
**Contract rows:** B3, B14 (concurrent approval / crash recovery / outcome-not-construction), touching B12 (index plan), B8 (offline)
**Issues in scope:** ISS-t-007-rev-8 (senior Block, overriding my own cycle-1 PASS), ISS-t-007-c1-2, ISS-t-007-c1-1

This cycle followed from a senior Block on my own cycle-1 PASS: concurrent `resumeScribe` calls on one thread both reported "written" while only one decision persisted. I had seen the same race myself in cycle 1 (ISS-t-007-c1-2) and judged it non-blocking at the time; the senior review reproduced it and raised severity to high. This verdict re-checks that judgment from scratch with harder probes.

## 1. Verify commands (fresh, in the worktree)

```
pnpm install                          -> Done in 474ms, exit 0
pnpm install --frozen-lockfile        -> Done in 489ms, exit 0
pnpm -r typecheck                     -> 9/9 packages "Done", exit 0
pnpm -r test                          -> exit 0
python contracts/verify_contracts.py  -> "no frozen contracts yet (research phase) -- PASS by vacuity", exit 0
```

Test totals (recomputed independently, matches the manifest's table exactly — 278 total, 0 fail):

| Package | tests | pass | fail |
|---|---|---|---|
| apps/api | 1 | 1 | 0 |
| apps/web | 1 | 1 | 0 |
| packages/providers | 8 | 8 | 0 |
| packages/schemas | 50 | 50 | 0 |
| packages/observability | 57 | 57 | 0 |
| packages/db | 73 | 73 | 0 |
| mcp/university-kb | 9 | 9 | 0 |
| mcp/student-profile | 12 | 12 | 0 |
| packages/engine | 67 | 67 | 0 |
| **Total** | **278** | **278** | **0** |

No regression vs cycle 1 (269 -> 278, +6 engine / +3 db for this cycle's new tests; every earlier test name still present and green).

## 2. Own probes (independent of the maker's suite, distinct scenarios)

Script: `C:\Users\Lenovo\AppData\Local\Temp\claude\d--vc\4028b141-b4f9-4793-84a0-f900414a84fb\scratchpad\t007c2-checker-probes.ts`, run from `packages/engine` via its own `node_modules/.bin/tsx` against the unmodified worktree code at `087ffa0`, using the same driver-faithful fake / `INDEX_PLAN` / `MockProvider` / `MemorySaver` harness (`tests/scribe-fixtures.ts`) the maker's own suite uses, but with my own assertions, my own iteration counts, and shuffled submission order. Nothing touched `MONGODB_URL` or Gemini. Run 5 times back to back for stability — identical PASS every time.

- **Probe 1 — edit vs edit, 20 fresh-harness iterations**, submission order alternated: exactly one `done` per iteration, the loser's `already_resolved` decision value equals the value actually persisted (read back from `openFacts()`), and `facts.size()` never exceeds 1 (no double write). All 20/20 passed on every run (100 total across 5 runs).
- **Probe 2 — approve vs reject, both submission orders, 20 iterations each (40 total)**: exactly one `done`; the loser's decision matches the winner's; the loser's `result` is either `null` (read before the winner's invoke finished — documented behaviour) or, when non-null, matches the winner's status exactly. Persisted state (2 facts+4 edges if approve won, 0 if reject won) verified every time. 40/40 x 5 runs = 200 clean.
- **Probe 3 — 10 concurrent mixed resumes (4 edits, 3 rejects, 3 approves, deterministically shuffled), 20 iterations**: exactly 1 `done` and 9 `already_resolved` every time, all 9 losers carrying the byte-identical winner decision (compared via `JSON.stringify` set-uniqueness), and an 11th late resume after the race settles also `already_resolved` with the same decision. 20/20 x 5 runs.
- **Probe 4 — crash after the claim, before `graph.invoke`**: injected a throw into `graph.invoke` on its first call after the claim succeeds. Confirmed: `h.facts.size()===0` immediately after the crash; a rival response (`reject`) gets `already_resolved` with `result: null`, the decision carrying the CLAIMED edit value (not the rival's own reject), `sameAsWinner: false`; `resumeScribe(graph, null, ...)` then completes with `done`/`written` and the claimed value read back from `openFacts()`; a **second** `resumeScribe(null)` also reports `done` and does **not** duplicate the write (`facts.size()` stays 1).
- **Probe 5 — array-contains fake, own scenarios**: scalar filter `"a"` matches every doc whose `tags` array contains it plus a scalar-equal doc (4 of 6 seeded docs); a non-existent scalar (`"z"`) matches nothing; an array filter `["a","b"]` matches only the exactly-ordered array, **not** the reversed `["b","a"]` doc (order-sensitivity proven both directions); an empty array field never falsely matches a scalar filter.

## 3. Crash / claim mechanics — read directly from `graph.ts:resumeScribe`

Confirmed by reading the code (not just the tests): the claim doc `_id = threadId`, inserted via `claims.insertOne` with no `await` between the pre-check and the set inside the fake's `insertOne` (verified in `packages/db/tests/fakes.ts` — the check-then-set is one synchronous block), so the race genuinely can't interleave inside a single insert. On 11000 the loser re-reads the winning claim (`claims.findOne`) and returns the **re-read winner's** decision, never its own — this is the exact mechanism ISS-t-007-rev-8 required. `INDEX_PLAN` (`packages/db/scripts/db-init.ts`) declares `scribe_resolutions_threadId_unique` as `{threadId: 1}`, `unique: true`, **no partial filter** (every claim counts), plus a plain `{studentId: 1}` index for B15/T-011 erasure — read directly, matches the manifest's claim exactly.

## 4. Regression check against cycle-0 and cycle-1 probe sets

Re-ran the surviving scratchpad probes from earlier cycles against the current code:

- `t007-probes/p1-crisis-devanagari.ts`, `t007-probes/p2-idempotency-and-malformed.ts`, `t007-probes/p3-fork-diagnostic.ts`, `t007c1-probes/checker-c1.ts` (44-45 assertions) — all re-run clean, **with two apparent "FAIL" lines that are not regressions**, both re-verified directly:
  1. `p2` probes 3/3b expected a malformed provider output to *throw*. It no longer throws — it now resolves to a terminal `extraction_failed`/`summary_failed` result (zero facts/edges either way). This is cycle-1's own ISS-t-007-rev-1 bounded-retry fix (already tested and green in the current suite), predating this scratch probe. Independently re-confirmed with a fresh check: `startScribe` with a malformed `session-summary` output now returns `{kind:"done", result:{status:"summary_failed", reason:"...schema-invalid after 2 attempts..."}}` — not a throw, and zero writes. Not a regression.
  2. `checker-c1.ts`'s "rev-5 MCP FINDING confirmed" line was a self-check asserting the *old* bug (ISS-t-007-c1-1: `@vc/db/testing`'s `find()` returns 0 facts for the correct purpose too). It now fails **because the bug is fixed** — `right.structuredContent.facts.length` is 2, not 0, matching my own Probe 5 and the maker's `db-init.test.ts` c1-1 tests. Not a regression — it is the fix landing.
- No other regressions found. Every cycle-0/cycle-1 assertion that characterized genuine, still-relevant behaviour (D-012 idempotency, c0-1 fork/already_resolved, rev-4 partial_conflict, rev-5 purpose stripping, the bypass-reachability check) still holds.

## 5. Own falsification (mutate → RED → restore, verified against `git status`/`git diff`)

A from-scratch parallel npm-installed copy under the scratchpad turned out to be impractical in this sandbox (Windows symlink privileges are unavailable here — `cp -a`/`ln -s` both silently fall back to full directory copies instead of links, and the resulting `tsx`/`esbuild` resolution breaks). I used the same mutate-in-the-worktree-with-guaranteed-restore pattern the cycle-1 checker itself used (`t007c1-falsify.py`, assert-anchor-count-1 + `try/finally` restore), scripted at `scratchpad/t007c2-checker-falsify.py`, and verified full restoration with `git status --short` / `git diff --stat` (clean) plus a fresh `pnpm -r test` (278/278) afterward.

| Guard | Mutation | Observed RED |
|---|---|---|
| F1 atomic claim | `await claims.insertOne(claim);` → `void claim;` | engine `tests/scribe.test.ts` fail=4: rev-8 (a), (b), (d), crash-after-claim |
| F2 loser gets its own decision, not the re-read winner's | the 11000-catch branch returns `{decision, responseHash: undefined}` (the loser's own computed decision) instead of `winner` | fail=5: rev-8 (a), (b), (c), (d), crash-after-claim |
| F3 crash recovery ignores the claim | the null-path claim lookup gated to `false && ...` | fail=1: crash-after-claim |
| F4 array-contains match disabled | `valueMatches`'s array-contains branch forced to `return false` | db `tests/db-init.test.ts` fail=1: ISS-t-007-c1-1 |
| F5 unique index dropped | `unique: true` removed from `scribe_resolutions_threadId_unique` | db fail=2: both rev-8 db tests |
| RESTORED | all 3 files restored from the pre-mutation read (verified byte-identical via `git diff --stat` = empty) | engine `tests/scribe.test.ts` 32/32, db `tests/db-init.test.ts` 9/9; full suite 278/278 |

## 6. B11 (secrets)

`git diff d80dc43..087ffa0` greped for API-key-shaped strings (`GEMINI_API_KEY=...`, `AIza...`, generic `key: "..."`) — no matches. `.env.example` is unchanged in this cycle's diff.

## 7. Verdict rationale

Every item the brief named is proven by outcome with probes of my own, distinct in shape from both the maker's suite and my own cycle-1 probes: shuffled-order edit/edit races, both approve/reject orderings run 20x each, a 10-way mixed race run 20x, and a targeted crash-after-claim/before-invoke sequence including double-idempotent recovery. All held across 5 repeated full runs (300+ individual resumes, 100 races) with zero flakes. Reading `resumeScribe` and the fake's `insertOne` directly confirms the claimed mechanism (synchronous check-then-set, no `await` in between) is genuinely atomic in the test harness, matching how a real unique-index insert behaves. `INDEX_PLAN` matches the manifest's claim exactly (unique, non-partial, on `threadId`, plus a plain `studentId` index for erasure). Falsifying each of the five load-bearing guards (the atomic insert, the re-read-winner behaviour, the crash-recovery claim lookup, the array-contains match, the unique index) independently turned the relevant tests RED, and restoring returned the full suite to 278/278 — confirmed via `git status`/`git diff` that the worktree is byte-identical to what I started with. Regression sweep against cycle-0 and cycle-1 probes found no new regressions; the two surface-level "FAIL" lines both trace to intentional, already-tested fixes from earlier cycles (rev-1's bounded retry, and this cycle's own array-contains fix closing ISS-t-007-c1-1). No new issues found — ISS-t-007-c2-N was not needed. ISS-t-007-rev-8 (both the medium data-engineer and high senior-reproduced entries), ISS-t-007-c1-1, and ISS-t-007-c1-2 are marked fixed in `qa/issues.jsonl`. The unit **PASSes** cycle 2.
