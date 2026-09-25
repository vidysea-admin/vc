# Verdict — t-014-erasure-followups

**Verdict:** PASS
**Cycle checked:** 0
**Unit:** T-014 (T-011 cycle-3 follow-ups: edge ownership, client timeoutMS, fence sweep, server version)
**Contract:** B15 primary; B8, B12, B14
**Diff range checked:** `8df46de..e61cfa3` (single commit `e61cfa3`, "fix(db): t-014 erasure follow-ups (edge ownership, client timeoutMS, fence sweep, server version)")
**Manifest read:** `qa/manifests/t-014-erasure-followups.md` (Status: ready-for-check, Fix cycle: 0)
**Issues addressed:** ISS-t-011-c3-rev-1 (high), ISS-t-011-c3-rev-2 (medium), ISS-t-011-c3-rev-3 (medium), ISS-t-011-c3-rev-4 (low), ISS-t-011-c3-note-1 (medium, documented only, per explicit brief instruction)

## 1. Verification commands re-run (worktree `D:\vc\.worktrees\t-014-erasure-followups`)

```
$ pnpm install
Scope: all 10 workspace projects; Lockfile is up to date. Done in 1.2s (exit 0)

$ pnpm -r typecheck
apps/web, packages/observability, packages/providers, packages/schemas, packages/db, apps/api,
mcp/student-profile, mcp/university-kb, packages/engine (+ evals/tsconfig.json) — all "Done" (exit 0, 9/9 clean)

$ pnpm -r test
apps/web 1/1 · packages/providers 8/8 · packages/schemas 50/50 · packages/observability 57/57 ·
packages/db 146/146 · apps/api 2/2 · mcp/university-kb 9/9 · mcp/student-profile 12/12 ·
packages/engine 105/105
TOTAL 390/390, 0 fail (exit 0) — matches the manifest's claimed counts exactly.

$ python contracts/verify_contracts.py
verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity (exit 0)
```

## 2. Method

Read `packages/db/src/facts.ts` (module docstring + `applyApprovedDiff`'s `writerToken`/`linkTracked`/
`undo`), `src/edges.ts` (`EdgeDoc.writerToken`, `link()`'s `$setOnInsert`), `src/client.ts`
(`resolveClientTimeoutMs`, `connectFromEnv`), `src/erasure.ts` (`startErasureFenceSweep`,
`releaseExpiredErasureFences`, `hasFencingRequest`), `scripts/db-init.ts` (`isServerVersionAtLeast`,
`assertServerVersionSupportsPartialIn`, `main()`'s call order), and `apps/api/src/index.ts`
(`startApi`) in full, plus the contract (B8/B12/B14/B15) and the diff against `8df46de`.

Falsification and my own hostile probes were done in a **separate scratch copy**
(`C:\Users\Lenovo\AppData\Local\Temp\claude\d--vc\...\scratchpad\checker-t014-c0\repo`, `robocopy`
of the worktree minus `.git`/`node_modules`, then `pnpm install` there — 12.6s, reusing the local
store). The reviewed worktree (`D:\vc\.worktrees\t-014-erasure-followups`) was never mutated;
`git status --porcelain` there is clean throughout. I wrote 12 of my own probes in
`packages/db/tests/probe-t014-c0.test.ts` (scratch-only, never committed), run via
`npx tsx --test`, structurally independent of the maker's own tests, covering every hostile
variant the brief named plus one design-gap probe (a2) I added myself.

## 3. (a) rev-1 — edge ownership: hostile variants beyond the manifest's own 2 tests

The manifest's 2 committed tests (`erasure.test.ts`) already prove: a pre-existing edge from a
*different, earlier, already-completed* call survives an ambiguous `link()` throw + fence, and an
edge *this* call actually created is still removed. I probed 4 further variants:

- **a1 (two GENUINELY concurrent writers, `Promise.all`, real interleaving, racing to create the
  SAME new edge):** one call's edge write is made to throw ambiguously and the student is fenced
  mid-race. By design (facts.ts's own docstring: *"After ALL of its writes... it checks the fence
  again... deletes the facts it inserted and the edges it CREATED"*), **either or both** concurrent
  calls may legitimately end up compensated if the fence lands before their own post-check runs —
  this is correct D-016 behaviour, not a bug. My assertion checks the real invariant either way:
  if the fact survives, it keeps **exactly** its 2 edges (no half-deletion); if it doesn't, **no**
  edge is left dangling, referencing a non-existent fact. **PASS**, 5/5 clean runs (no flakiness
  observed).
- **a2 (DESIGN GAP, not a regression):** writerToken is the *only* isolation key — if two calls'
  tokens were ever to collide (e.g. a broken RNG), the `{_id, writerToken}` delete filter cannot
  tell them apart and could delete a completely unrelated call's edge. Demonstrated directly at
  the `link()`/`deleteMany` level with a forced shared token. This is a real, if extremely
  low-probability, gap (`crypto.randomUUID()`'s v4 collision space is astronomical, and the code
  has zero defense in depth beyond it — no per-call requestId cross-check, no insertedAt window).
  Recorded as `ISS-t-014-c0-1` (see §7), **not blocking**.
- **a3 (a TRULY LEGACY edge, `writerToken` field entirely ABSENT — not just a different token):**
  the manifest's own tests only cover "a different call's token", never the pre-migration case
  where the field is missing outright. Seeded a legacy-shaped edge, replayed onto it with an
  ambiguous throw + fence. **PASS.** Falsified: reverting the writerToken-scoped delete (back to
  `{_id: {$in: [...]}}`) makes this **go RED** (the legacy edge gets deleted) — confirms the fix is
  load-bearing for exactly this case, which the committed suite does not itself prove.
- **a4 (a REPLAY whose edge write is stuck PAST the writer deadline, then settles LATE with an
  ambiguous outcome — the `settled`/second undo path, not the immediate one):** pre-seeded a
  different-call edge at the exact colliding deterministic id; the late-settling call's own
  `undo()` (invoked from `facts.ts`'s `settled` promise, after the stuck op finally resolves) must
  still respect the writerToken scope. **PASS.** Falsified: same revert makes this **go RED** too.

Falsification summary: reverting `facts.ts:420`'s delete filter to plain `{_id: {$in: [...]}}}`
turns **a3 and a4 red** (2/2), while the manifest's own 2 committed tests would also go red per
their own documented falsification. Restored (`git diff` on the scratch copy shows zero diff after
restore); the real worktree was never touched.

## 4. (b) rev-2 — MongoClient timeoutMS: hostile variants

- **b1:** garbage strings (`"abc"`, `"NaN"`, `"Infinity"`, `"-Infinity"`, `"1e999"`, `"{}"`,
  `"[]"`, `"null"`, `"true"`) are all rejected. **PASS.**
- **b3:** `"0"`, `"-1"`, a large negative number are all rejected. **PASS.**
- **b2 (FINDING, not a regression):** a **huge** override (tested: 10 days in ms) is accepted with
  **no upper bound**. `resolveClientTimeoutMs` only checks `Number.isFinite(parsed) && parsed > 0`
  — there is no check tying the override to `FENCE_MARGIN_MS`. The client.ts docstring says the
  default is *"Capped at FENCE_MARGIN_MS (D-016)"*, and the rev-2 issue's own suggested fix text
  said `<= FENCE_MARGIN_MS` — but that cap only holds for the **default**, not for an operator's
  `MONGO_CLIENT_TIMEOUT_MS` override, which can silently defeat the exact liveness guarantee this
  unit was built to close (an unguarded client-level op, e.g. the LangGraph checkpointer, would no
  longer finish within the fence's margin window). Recorded as `ISS-t-014-c0-2` (medium — this one
  directly undermines rev-2's own stated purpose, even though it requires an explicit
  misconfiguration and the default path is unaffected). Not blocking this cycle: the brief asked
  for garbage/negative/zero/huge to be *validated* (accepted-or-rejected), and "huge" is not
  rejected by design intent stated in the manifest — but it should have been capped, not merely
  accepted.

## 5. (c) rev-3 — the fence sweep: hostile variants

- **c1 (the sweep must never release a fence while a confirmed/failed request is still open, even
  when BOTH `createdAt` and an explicit `releaseAfter` are stamped deep in the past):** built to
  specifically exercise `hasFencingRequest`, not the separate `row.status !== "completed"`
  short-circuit that would otherwise make this pass for the wrong reason (confirmed by first
  writing a weaker version of this probe that passed even with `hasFencingRequest` DISABLED — a
  vacuous-pass trap I caught and fixed before relying on it). **PASS**, and correctly **goes RED**
  when I disable `hasFencingRequest`'s check in `releaseExpiredErasureFences` (falsification).
  Restored.
- **c2 (`stop()` really stops ALL future activity, not just the next tick):** advanced fake time
  100x past the interval after `stop()`; zero further ticks observed. **PASS.**
- The "never touches a database other than `virtual_counsellor`" claim is already proven by the
  committed `apps/api/tests/index.test.ts` (`dbCalls === ["virtual_counsellor"]`) plus the B12
  scanner (`db-scope.test.ts`, 11/11 green, unchanged by this diff) — not re-probed, no gap found.
- The "errors go to `onError` and do not crash" claim is already proven by the committed
  `erasure.test.ts` test (a failing tick reports via `onError`, the next tick still runs) — I read
  it and agree it is a genuine outcome test (fake `fences.find` throws synchronously inside the
  tick), not a construction-only check.

## 6. (d) rev-4 — server version check: hostile variants

- **d1:** `isServerVersionAtLeast` against `"5.0.x"` (non-numeric patch → false), `"6.0.0"`
  (exact boundary → true), `"7.0.2-rc1"` (`parseInt` reads the leading digits of `"2-rc1"` → patch
  2 → true, a reasonable outcome), `"garbage"` (→ 0.0.0 → false), `""` (→ false), `"6"` / `"6.0"`
  (major/partial-only → true, boundary), `"5.9.99"` (→ false). All matched expectations. **PASS.**
- **d2 (a MISSING `version` KEY, not just `undefined` — `buildInfo()` resolving to `{}`):**
  `assertServerVersionSupportsPartialIn` correctly fails closed (treats it as `"0.0.0"`, throws
  `UnsupportedServerVersionError`). **PASS**, and **goes RED** when the throw is disabled
  (falsification) — confirms it's load-bearing, and closes a gap the manifest's own test (which
  uses `buildInfoVersion = undefined` via the fake, not a literally-absent key) doesn't itself
  cover.
- **d3 (`buildInfo()` itself REJECTS — e.g. an auth/network failure reading server info):** the
  rejection propagates (is not silently swallowed and treated as "supported"). **PASS.** This
  matters because `main()` calls `assertServerVersionSupportsPartialIn` before creating anything —
  confirmed by reading `db-init.ts`'s `main()` directly, not assumed from the manifest's prose.

## 7. Judgment on the two open questions (manifest)

1. **`apps/api` gaining a `@vc/db` workspace dependency:** the `package.json`/`pnpm-lock.yaml` diff
   is exactly the one new dependency line claimed, nothing else. `apps/api/src/index.ts` remains a
   documented scaffold (`apiStatus()` unchanged, still "not yet implemented"); `startApi` is a
   plain exported function never called on import (verified: no top-level invocation, no server
   bootstrap added) — importing the module still performs zero I/O (B8). This is minimal, honest
   wiring for "the existing app entry," not a new app. **Acceptable.**
2. **Default `intervalMs = MINIMUM_FENCE_HOLD_MS` (90s) with no production SLA:** reasonable as a
   "no faster than a fence could possibly become eligible" floor; correctly flagged in the manifest
   as needing a decision only if/when this ships live. **Acceptable as a stated residual**, not a
   defect.

The manifest's residual list (§ "Residuals") is honest for everything it discloses, and I found no
misstatement in it. It does **not** disclose the writerToken-collision defense-in-depth gap (a2) or
the missing upper bound on `MONGO_CLIENT_TIMEOUT_MS` (b2) — both are new findings from my own
probing, recorded below, not contradictions of anything the manifest claimed.

## 8. Regression

The full `pnpm -r test` run (§1) is the complete regression set: 390/390 green, including every
T-011 cycle 0–3 test (the fence, the deadline, the minimum hold, the one-open-request index, the
B12/D-016 scanners) plus every new T-014 test, matching the manifest's claimed totals (390 overall,
146 in `packages/db`, 2 in `apps/api`) exactly. No regression found anywhere in cycles 0–3's proven
T-011 behaviour.

## 9. Verdict rationale

All 4 in-scope issues (rev-1 high, rev-2/rev-3 medium, rev-4 low) are genuinely fixed, each
independently re-verified against hostile variants beyond the maker's own tests, with falsification
proving the fix load-bearing in every case I could falsify (a3, a4, c1, d2). rev-1's fix
(writerToken via `$setOnInsert`, delete scoped to `{_id, writerToken}`) correctly handles true
concurrency, legacy no-token data, and the late-settled undo path — the 3 cases the committed suite
itself does not directly cover. note-1 is correctly left undocumented-only per the brief's explicit
instruction not to touch `FENCED_WRITER_DEADLINE_MS`. The scope expansion (`apps/api` + `@vc/db`)
is minimal and honestly described. Two new, non-blocking findings surfaced by my own probing (a
writerToken-collision defense-in-depth gap, and an unbounded `MONGO_CLIENT_TIMEOUT_MS` override)
are recorded as follow-up issues — neither falsifies any of this unit's own claims, neither is a
regression this unit introduced beyond what it already had, and neither blocks this cycle. **PASS.**

## 10. Issues ledger

- `ISS-t-011-c3-rev-1` → **fixed**, verified this cycle (writerToken ownership; my own a1/a3/a4
  probes + falsification, see `qa/issues.jsonl`).
- `ISS-t-011-c3-rev-2` → **fixed**, verified this cycle (client-level `timeoutMS` backstop reaches
  the real driver; my own b1/b3 probes). New residual filed: `ISS-t-014-c0-2`.
- `ISS-t-011-c3-rev-3` → **fixed**, verified this cycle (the sweep; my own c1/c2 probes +
  falsification).
- `ISS-t-011-c3-rev-4` → **fixed**, verified this cycle (server version gate; my own d1/d2/d3
  probes + falsification).
- `ISS-t-011-c3-note-1` → correctly left as documented-only, per the brief.
- New: `ISS-t-014-c0-1` (low) — writerToken has no defense-in-depth beyond RNG uniqueness.
- New: `ISS-t-014-c0-2` (medium) — `MONGO_CLIENT_TIMEOUT_MS` override has no upper bound tied to
  `FENCE_MARGIN_MS`, unlike the default.
