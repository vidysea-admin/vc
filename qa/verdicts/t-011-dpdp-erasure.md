# Verdict — t-011-dpdp-erasure

**Verdict:** PASS
**Cycle checked:** 3
**Unit:** T-011 (DPDP erasure and export) — FINAL cycle (3 of 3)
**Contract:** B15 above all, plus B4, B8, B11, B12, B14
**Diff range checked:** `474c0fe..e3a7b27` (single commit `e3a7b27`, "fix(db,engine): t-011 cycle 3 — writer deadline + minimum fence hold (D-016), one open request, write-path scanner")
**Manifest read:** `qa/manifests/t-011-dpdp-erasure.md` (Status: ready-for-check, Fix cycle: 3)
**Design:** D-016 (`docs/DECISIONS.md`, supersedes D-015), gate `qa/gates/erasure-fencing.md`
**In scope this cycle:** ISS-t-011-c2-1 (high, my cycle-2 FAIL — the grace-0 release-boundary residual), ISS-t-011-c2-rev-1 (high), ISS-t-011-c2-rev-2 (medium, the scanner), ISS-t-011-c2-rev-4 (medium, one open request); lows ISS-t-011-c2-rev-3, ISS-t-011-c2-rev-5

## 1. Verification commands re-run (worktree `D:\vc\.worktrees\t-011-dpdp-erasure`)

```
$ pnpm install
Scope: all 10 workspace projects; Lockfile is up to date. Done in 619ms (exit 0)

$ pnpm -r typecheck
apps/api, apps/web, packages/observability, packages/providers, packages/schemas, packages/db,
packages/engine (+ evals/tsconfig.json), mcp/student-profile, mcp/university-kb — all "Done" (exit 0, 9/9 clean)

$ pnpm -r test
apps/web 1/1 · apps/api 1/1 · packages/providers 8/8 · packages/schemas 50/50 ·
packages/observability 57/57 · packages/db 130/130 · mcp/university-kb 9/9 ·
mcp/student-profile 12/12 · packages/engine 105/105
TOTAL 373/373, 0 fail (exit 0) — matches the manifest's claimed counts exactly (373, up from 359 at cycle 2).

$ python contracts/verify_contracts.py
verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity (exit 0)
```

## 2. Method

Read `src/erasure.ts` in full (the fence section, `WriterDeadline`, `compensateIfFenced`,
`releaseErasureFence`/`releaseExpiredErasureFences`, `fenceReleaseTime`), `src/facts.ts`'s
`applyApprovedDiff` (deadline start before the pre-check, the `settled` late-undo path),
`src/edges.ts`'s `link` (`onCreated`), `packages/engine/src/scribe/graph.ts` (`invokeFenceAware`,
`WriterDeadline` at `startScribe`/`resumeScribe`), `tests/db-scope.test.ts`'s fence-writer scanner,
`tests/fakes.ts`, D-016 and gate `erasure-fencing.md`. Then wrote my own hostile probes,
structurally independent of the maker's tests, in `packages/db/tests/zz-checker-scratch.test.ts`
(6 probes) and `packages/engine/tests/zz-checker-scratch.test.ts` (2 probes), run via
`npx tsx --test` inside the real pnpm workspace, then **deleted** before this commit (`git status
--short` confirmed clean).

For falsification, rather than mutating the worktree in place, I added a **second, detached git
worktree** at `C:\Users\Lenovo\AppData\Local\Temp\claude\d--vc\...\scratchpad\t011-falsify`
(`git worktree add --detach ... e3a7b27`), reused the already-installed `node_modules` trees via
NTFS junctions (`mklink /J`, offline — the plain `pnpm install --offline` there hit one package
missing from the local store and was abandoned rather than fetching over the network), copied in
my own scratch test file, mutated `src/erasure.ts` / `src/facts.ts` there, ran the tests, and
restored each file from a byte-identical backup (`cmp`) afterward. The actual worktree under
review (`D:\vc\.worktrees\t-011-dpdp-erasure`) was never mutated. The falsification worktree and
its junctions are removed after this verdict.

## 3. Item 2 — the KEY PROBE, re-run with my own plumbing, plus the 3 required variants

- **CKR3 KEY PROBE** (own generic wrap of both `erasure_fences.deleteMany` and `.updateOne`,
  rather than the maker's two separate closures): a REAL `applyApprovedDiff` writer paused right
  before its `facts.insertOne` (pre-check already passed), released only *after* the genuine
  fence-release call returns (confirmed: `statusAtRelease === "completed"`). Result:
  `StudentFencedError`, the insert really landed (`lateIds.length === 1`), zero residue across
  every fake collection. **PASS.**
- **Variant — released after a sweep that (correctly) finds nothing, still inside the hold:**
  `releaseExpiredErasureFences` run explicitly at `holdEnd - 1` removes 0 fences; the paused writer
  is then released and is still fenced with zero residue; the same sweep at `holdEnd + 1` then
  removes it. This shows the hold isn't just "nobody swept yet" — an explicit no-op sweep changes
  nothing. **PASS.**
- **Variant — a writer that overruns `FENCED_WRITER_DEADLINE_MS`:** `deadlineMs: 40`, a stuck
  insert. `applyApprovedDiff` throws `FencedWriterDeadlineError` with every driver op seen carrying
  `0 < timeoutMS <= 40`. Releasing the stuck insert afterward and awaiting `err.settled` shows the
  late-landing fact is undone. **PASS.**
- **Variant — a real `resumeScribe` writer, own injection point:** paused inside
  `applyApprovedDiff`'s insert (after the claim), released from the erasure's own
  `edges.deleteMany` (an earlier phase-1 step than the maker's `scribe_resolutions.countDocuments`
  or `students.countDocuments` injection points). Result: `{kind: 'fenced'}`, `receipt.verified:
  true`, zero residue across every engine collection, the MemorySaver holds nothing for the
  thread. A second engine variant confirms a resume that starts fenced never even attempts a claim.
  **PASS** (both).

## 4. Item 3 — hold correctness

- **`CKR3 hold: createdAt is NOT reset...`**: one attempt forced to fail (a `MongoNetworkError` stub
  on `edges.deleteMany`), then retried to completion. `createdAt` is identical before the failure,
  after the failure, and after the successful retry; `releaseAfter` is computed from the *original*
  `createdAt`, not the retry. **PASS.**
- **`CKR3 hold: the sweep releases only when no confirmed/failed request remains...`**: with the
  request left `failed` (still fencing), `releaseExpiredErasureFences` at 10× the hold past
  `createdAt` still releases nothing (`0`). Only after the retry completes (no open request left)
  does the same sweep call release it (`1`). **PASS** — this is the exact mechanism ISS-t-011-c2-rev-4
  needed and the exact one D-016's minimum hold needed *not* to be undermined by.
- **`CKR3: a duplicate erasure request...is refused`**: with one confirmed request open,
  `requestErasure` for the same student throws `ErasureRequestAlreadyOpenError`; exactly one fence
  document exists throughout; after completion a fresh request is accepted. **PASS** — no stuck
  fence under a duplicate-request attempt.
- The persists-past-completion property itself (`createdAt + FENCED_WRITER_DEADLINE_MS +
  FENCE_MARGIN_MS`, even when completion is instantaneous) is exercised by both the KEY PROBE and
  its sweep-before-hold-expiry variant above.

## 5. Item 4 — the scanner

In the falsification worktree: added `packages/db/src/zz-ckr-raw-writer.ts`, a module calling
`factsCollection(db).insertOne(...)` with no fence pre-check, no post-check, and no entry in
`FENCE_AWARE_WRITERS`. Ran `tests/db-scope.test.ts`: the D-016 scanner test fails with
`student-data writes outside the fence-aware allowlist: packages/db/src/zz-ckr-raw-writer.ts` — the
raw writer is caught. Removed the file: the same test (and all 11 in that file) pass again,
confirming no residual false positive from my fixture. Combined with the real-repo scan already
green in the `pnpm -r test` run above (the allowlist equals the real writer set exactly) and the
built-in hostile-variant / no-false-positive fixture tests (16 hostile variants, 5 benign cases,
all passing), the scanner's coverage claim holds.

## 6. Item 5 — regression (cycles 0–2)

The full `pnpm -r test` run (§1) is the complete regression set: 373/373 green, including every
cycle-0/1/2 test (the confirm gate, the round-based purge, the checked CAS, the D-015 fence tests,
H4/H4b at both db and engine level, the grace/lifecycle tests). Running `packages/db/tests/*.test.ts`
and `packages/engine/tests/*.test.ts` together with my own scratch files (136 + 77 = 213 tests, 0
fail) confirms my additions don't interact badly with the existing suite. No regression found.

## 7. Falsification (scratch worktree, mutate → red → restore, `cmp` confirmed byte-identical)

| # | Mutation | Tests run | Red | Restored |
|---|---|---|---|---|
| F1 | `fenceReleaseTime` drops `MINIMUM_FENCE_HOLD_MS` (uses `completed + grace` only); `isStudentFenced` drops its minimum-hold early-return. Reverts to D-015's exact grace-0 behaviour. | `erasure.test.ts` + my `zz-checker-scratch.test.ts` (55 tests) | **5 red**: the maker's D-016 KEY PROBE, the maker's "no stuck fence" test, and 3 of my own (KEY PROBE, sweep-before-hold variant, "sweep releases only when no open request remains") | `cmp` byte-identical |
| F-scan | Add `zz-ckr-raw-writer.ts`, a raw unfenced write to `facts`. | `db-scope.test.ts` (11 tests) | **1 red**: the D-016 allowlist test names the offending file | file removed, re-ran green |
| F2 | `facts.ts`'s immediate `compensateIfFenced(..., {alwaysUndo: timedOut})` call hard-coded to `alwaysUndo: false`. | `erasure.test.ts` + my `zz-checker-scratch.test.ts` (55 tests) | **1 red**: the maker's "post-check runs AT the abort" test (a fact that landed before a stuck edge write is no longer gone *immediately* on the deadline; only later, when the stuck write itself settles) | `cmp` byte-identical |

F1 directly reproduces my own cycle-2 finding (ISS-t-011-c2-1) and confirms D-016's minimum hold —
not merely its existence, but its *use* in both `fenceReleaseTime` and `isStudentFenced` — is what
closes it; this is exactly the fix I asked for last cycle.

**F2 is worth stating precisely, because my own deadline-overrun probe (§3) did *not* go red under
it.** `applyApprovedDiff` has two independent undo paths: an immediate `compensateIfFenced` call
(cleans up whatever had *already* landed by the moment the deadline fires — relevant when an
earlier fact in a multi-fact diff already committed before a later write hangs) and the `settled`
promise (`work.then(() => undo(), () => undo())`, unconditional, cleans up the *specific* operation
that was still in flight once it eventually resolves). My single-fact probe only exercises the
`settled` path, so disabling the immediate path's `alwaysUndo` didn't change its outcome — nothing
had landed yet at the deadline moment in my scenario. The maker's own "post-check runs AT the
abort" test (green in the full §1 regression run) is what actually proves the immediate-cleanup
half of the claim, for the case where a fact commits and then a *later* write in the same call
hangs. Together the two tests cover the full claim; I record this as a genuine gap in my own probe
design, not a defect in the code.

## 8. Judgment on the residual caveats (manifest "Fix cycle 3", 5 numbered caveats)

1. **Network delay / clock skew beyond `FENCE_MARGIN_MS`.** Honest and bounded: the margin (30s) is
   explicitly the budget for post-check latency plus clock skew between app servers, and the
   module doc states plainly that a delay *longer* than the margin is not covered. This is a
   configuration knob, not a silent gap — acceptable for an offline research-phase unit with no
   real student data yet (contract non-goals explicitly exclude production deploy and joining real
   Pathlynks data).
2. **MongoDBSaver checkpoint writes don't carry per-op `timeoutMS`.** Honest, with a concrete,
   actionable recommendation attached (construct the runtime `MongoClient` with `timeoutMS <=
   FENCED_WRITER_DEADLINE_MS` for the first live-wiring unit) rather than left as a vague TODO.
   Acceptable to defer to that unit, since no live wiring exists yet.
3. **A writer that bypasses the fence entirely is caught only by the scanner.** This is a correctly
   stated limit of static analysis (a dynamically-assembled method name can't be proven safe), and
   I independently confirmed the scanner's actual detection power in §5 rather than taking the
   claim on faith. Acceptable, with the scanner's own residual honestly named alongside it.
4. **Everything is proven against the in-memory fake and MemorySaver; the live server's CSOT
   behaviour, the `$in` partial unique index (MongoDB 6.0+) and `deleteThread` on a real
   MongoDBSaver are UNVERIFIED.** This is the same live-DB row that has been open and explicitly
   marked UNVERIFIED since cycle 0 — never silently upgraded to "verified" by construction (B14
   discipline held across all 3 cycles). Acceptable for this stage; a live run against
   `virtual_counsellor` with a synthetic student is already tracked as an open follow-up (#5 in the
   manifest) requiring an explicit human-invoked step, consistent with production Mongo's CRUD
   exception being scoped to `d:\vc` only.
5. **Unchanged crash-mid-write semantics note.** Not a new caveat; restates existing D-012 behaviour
   for context. No new risk.

All five are honestly stated (matching what my own reading of the code and my own falsification
found — none understate the actual boundary), each is bounded by a specific, named mechanism or a
concrete next step, and none of them silently weakens B15's core claim for the surface this unit
actually ships on (offline, fake-DB-proven, no live wiring yet). I judge them acceptable for the
offline stage.

## 9. Verdict rationale

Both issues explicitly in scope this cycle that mattered for closing my own cycle-2 FAIL —
ISS-t-011-c2-1 and ISS-t-011-c2-rev-1 — are now genuinely fixed: the minimum fence hold
(`createdAt + FENCED_WRITER_DEADLINE_MS + FENCE_MARGIN_MS`) forces every fence-aware writer's
post-check to run while the fence still exists, verified with my own KEY PROBE re-run plus 3
required variants at different injection points than the maker's, and confirmed load-bearing by
falsification (F1 reproduces the exact grace-0 bug when the hold is removed). ISS-t-011-c2-rev-2
(the scanner) and ISS-t-011-c2-rev-4 (one open request) are independently verified in §5 and §4.
The lows (ISS-t-011-c2-rev-3: redundant index dropped, `cause` chained, undo scoped to created
edges; ISS-t-011-c2-rev-5: fenced-over-already_resolved kept by design, documented and tested) are
covered by the full green regression suite and, for rev-5, judged an acceptable, explicitly-reasoned
design choice (no student state disclosed during an erasure). No regression found anywhere in
cycles 0–2's proven behaviour. This is the final cycle (3 of 3); the unit PASSes.

## 10. Issues ledger

- `ISS-t-011-c2-1` → **fixed**, verified this cycle (D-016 minimum hold; my own KEY PROBE +
  falsification, see `qa/issues.jsonl`).
- `ISS-t-011-c2-rev-1` → **fixed**, verified this cycle (same mechanism, same probes).
- `ISS-t-011-c2-rev-2` → **fixed**, verified this cycle (the scanner; raw-writer fixture caught,
  no false positive).
- `ISS-t-011-c2-rev-4` → **fixed**, verified this cycle (one open request; duplicate-request probe).
- `ISS-t-011-c2-rev-3` (low) → **fixed**, covered by the full regression suite.
- `ISS-t-011-c2-rev-5` (low) → **wontfix-accepted** (kept by design: fenced takes priority over
  already_resolved so no student state is disclosed mid-erasure; documented and tested).
