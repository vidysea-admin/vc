# Verdict — t-011-dpdp-erasure

**Verdict:** FAIL
**Cycle checked:** 1
**Unit:** T-011 (DPDP erasure and export)
**Contract:** B15 above all, plus B4, B8, B11, B12, B14
**Diff range checked:** `1d7facb..7ae8fc8` (single commit `7ae8fc8`, "fix(db): t-011 cycle 1 — stable-loop purge (no orphan edges under concurrent writers), checked final CAS")
**Manifest read:** `qa/manifests/t-011-dpdp-erasure.md`
**In scope this cycle:** ISS-t-011-c0-1 (unchecked final CAS under concurrent `executeErasure`), ISS-t-011-rev-3 (orphan edges under a concurrent writer — round-based purge fix)

## 1. Verification commands re-run (worktree `D:\vc\.worktrees\t-011-dpdp-erasure`)

```
$ pnpm install
Scope: all 10 workspace projects
Lockfile is up to date, resolution step is skipped
Already up to date (exit 0)

$ pnpm -r typecheck
apps/api, apps/web, packages/observability, packages/providers, packages/schemas,
packages/db, mcp/student-profile, mcp/university-kb, packages/engine — all "typecheck: Done"
(exit 0, 9/9 clean)

$ pnpm -r test
apps/api 1/1 · apps/web 1/1 · packages/providers 8/8 · packages/schemas 50/50 ·
packages/observability 57/57 · packages/db 99/99 · mcp/university-kb 9/9 ·
mcp/student-profile 12/12 · packages/engine 67/67
TOTAL 304/304, 0 fail (exit 0) — matches the manifest's claimed counts exactly.

$ python contracts/verify_contracts.py
verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity (exit 0)
```

## 2. Method

Read `src/erasure.ts` in full (the cycle-1 diff: the round-based purge loop, `mergeSelectors`,
`ERASURE_MAX_ROUNDS`, `carriedSelectors`, and the checked CAS retry loop in `executeErasure`),
`tests/fakes.ts` (confirmed `findOne`/`find` now return copies — fixed for cycle 1), and the
maker's 5 new cycle-1 tests in `tests/erasure.test.ts`.

I then wrote my own hostile probe suite, structurally independent of the maker's tests, in
`packages/db/tests/zz-checker-scratch.test.ts` (drafted at
`C:\Users\Lenovo\AppData\Local\Temp\claude\d--vc\4028b141-b4f9-4793-84a0-f900414a84fb\scratchpad\t011-hostile-c1.test.ts`,
run via `npx tsx --test tests/zz-checker-scratch.test.ts` inside the real pnpm workspace, then
**deleted** before this commit — `git status --short` confirmed clean). Two additional one-off
debug repros (`zz-debug-h4.test.ts`, `zz-debug-h4b.test.ts`) were written, run, and also deleted.
12 probes (H1–H10c), covering:

- **H1–H3:** a concurrent writer injected before phase 1 (at the first `resolveSelectors` read),
  between phase 1 and phase 2, and mid-phase-2 (between the `facts` anchor delete and the
  `sessions` anchor delete) — new facts, new sessions, new checkpoints, and an edge pointing at a
  fact already deleted this round.
- **H4:** a concurrent writer injected **during the read-back itself** (see §3 — this is where the
  FAIL comes from).
- **H5:** an unstoppable writer — bounded-loop and clean-retry-after-stop.
- **H6–H8:** concurrent `executeErasure`, 2 calls (success), 5 calls (success), 5 calls (all
  failing).
- **H9:** privacy of the completed row after a prior failed attempt had set `carriedSelectors`.
- **H10a–c:** regression — unconfirmed-deletes-nothing, self-confirm refusal, shared-external-
  target isolation.

11/12 probes passed outright, confirming both in-scope fixes work correctly (see §4–5). **H4
failed**, and I reproduced it twice more, independently, with full diagnostic output (§3).

## 3. THE BUG — a writer racing the read-back itself defeats verification (H4)

**This is the reason for the FAIL.** The brief explicitly asked to inject a concurrent writer
"during the read-back" as one of four required injection points. I did, and found a structural
gap the round-based purge fix does not close.

### Root cause

`executeErasure`'s per-round read-back (`src/erasure.ts:462–489`) is **not atomic**: it is a
sequential loop over the 9 `ERASURE_PLAN` steps, each doing its own `await
db.collection(...).countDocuments(...)`. `totalRemaining` is the sum of all 9 counts, computed
**after the loop finishes**. If a writer inserts a new document for the student into a collection
**after that collection's own count has already run in this round**, but the round as a whole
hasn't finished yet, that new document is invisible to `totalRemaining` for this round. If every
*other* collection was already clean, `totalRemaining === 0`, so the loop breaks (line 488),
`verified = true` is computed, and the CAS commits `status: "completed"` with `studentId` and
`carriedSelectors` **unset**. The new document is now permanently unfindable by any future
erasure — there is no further round (the loop already exited) and no retry path (the request is
`completed`, and a later `executeErasure` call on it just returns `alreadyCompleted: true` with
the same stale, wrong receipt forever).

This is a real race window, not a fake-only artifact: `countDocuments` is a genuine network round
trip against the real driver, so the gap between two sequential `countDocuments` calls in
production is exactly the kind of window a concurrent writer (another counsellor session, a
resuming scribe thread) can land in.

### Reproduction 1 (fact + edge, `H4` in the probe file)

Hooked `students.countDocuments` (the **last** step in `ERASURE_PLAN`, so every other collection's
residue — including `facts` and `edges` — has already been counted clean earlier in the same
loop). Inside the hook, after computing the real count, seeded a brand-new fact (`studentId:
"stu-A"`) and its `sourced_from` edge, then returned the real (pre-injection) count.

Result (`zz-debug-h4.test.ts`, full output captured):
```
receipt.verified: true
receipt.totalRemaining: 0
row.status: "completed"
```
but:
```
facts remaining: [ { _id: 'stu-A-late-h4', studentId: 'stu-A', key: 'h4late', ... } ]
edges remaining: [ { _id: 'fact:stu-A-late-h4->sourced_from->transcript_turn:t-h4', ... } ]
```
The fact and its edge are real documents belonging to `stu-A`, sitting in the database, after a
request that reports `verified: true, totalRemaining: 0, status: completed`.

### Reproduction 2 (session + checkpoint + edge, `zz-debug-h4b.test.ts`)

Same technique, hooked `scribe_resolutions.countDocuments` (runs right after `sessions`' own
residue check) to inject a new session row, a scribe checkpoint, and a session-kind edge. Same
result: `verified: true`, `totalRemaining: 0`, `status: "completed"`, and the late session,
checkpoint and edge all survive, confirmed by direct collection reads after the call returns.

### Why this is worse than ISS-t-011-c0-1 or the original ISS-t-011-rev-3

Both prior issues left the request in a **retryable** state (`failed`, `studentId` kept) when
something went wrong — the system was honest about not having finished. This bug is the opposite:
it reports success, unsets the only fields (`studentId`, `carriedSelectors`) a retry would need,
and the orphaned document is real personal data (a fact, or a session plus its scribe checkpoint
and an edge) that DPDP requires be erased. It directly falsifies the contract's stated guarantee
(B15): "a verification pass reads back every collection and proves zero documents remain for that
student."

### Suggested fix (for the maker to implement, not mine to make)

The per-round read-back needs to be treated as unreliable by construction, the same way the
delete phases already are. Options include: (a) after the loop computes `totalRemaining === 0`,
re-resolve selectors fresh and run one more **full** read-back pass before committing
`completed`; only commit if *that* pass is also clean, otherwise treat it as residue and run
another round (bounded by the existing `ERASURE_MAX_ROUNDS`); or (b) collapse the 9 sequential
`countDocuments` calls into fewer round trips / a tighter time window and accept a documented,
much smaller residual race, with a scheduled reconciliation sweep as the backstop. Either way, a
single monotonic "if every count so far is zero, we're done" is not enough when documents can be
written into an already-counted collection before the round is declared clean.

Filed as **`ISS-t-011-c1-1`** (high) in `qa/issues.jsonl`.

## 4. ISS-t-011-rev-3 (orphan edges under a concurrent writer) — the round-based purge fix ITSELF is correct

Independently re-verified, distinct from the maker's 3 rev-3 tests, with H1 (writer before phase
1), H2 (writer between phases, new session), H3 (writer mid-phase-2, edge for a fact just deleted
this round plus a new session), and H5 (an unstoppable writer: bounded to `n` between 2 and 10
rounds as required, ends `failed` with `studentId` kept and `carriedSelectors` set, then a clean
retry after the writer stops reaches `verified: true` with zero orphan edges and a full identifier
scan of `[]`). All four passed, and B was untouched throughout every one (`docsMentioning(fakeDb,
identifiers(b)).length > 15` held in every probe). **The specific mechanism (anchors deleted by
resolved id, ids accumulated across rounds, `carriedSelectors` on a failed row) is sound** — the
gap is elsewhere, in the read-back's non-atomicity (§3), which is a different failure mode from
the one rev-3 described (orphans surviving a *delete* race) and was not in the original rev-3
scope.

## 5. ISS-t-011-c0-1 / ISS-t-011-rev-1 (unchecked final CAS) — VERIFIED FIXED

- **H6 (2 concurrent, success):** both receipts deep-equal the persisted row's receipt,
  `row.attempts === 1`, `alreadyCompleted` is exactly one `false` and one `true`. PASS.
- **H7 (5 concurrent, success — a stronger version of the maker's 2-call test):** all 5 returned
  receipts deep-equal the persisted row's receipt, `row.attempts === 1` (not 5 — only the true
  winner records), exactly 1 of 5 `alreadyCompleted: false`. PASS.
- **H8 (5 concurrent, all failing — `scribe_checkpoints.deleteMany` stubbed to a silent no-op):**
  each of the 5 calls records its own attempt; attempts observed across the 5 rejections are
  exactly `{1,2,3,4,5}` (some serialization order — the real driver would serialize these CAS
  writes similarly), the final row's `attempts === 5` and its `receipt` deep-equals the attempt-5
  receipt, and `studentId` + `carriedSelectors` are retained for a future retry. PASS.
- **H9:** after a failed attempt sets `carriedSelectors`, a subsequent successful completion
  unsets **both** `studentId` and `carriedSelectors`, and the completed row's JSON contains none of
  the student's identifiers. PASS.

The CAS-check fix itself is correct and matches the manifest's claims. This is not the reason for
the FAIL.

## 6. Regression (H10a–c)

- **H10a:** an unconfirmed request — full before/after snapshot of every collection (except the
  audit log) is byte-identical. PASS.
- **H10b:** self-confirm refused under exact / padded / upper-cased forms of the requester's own
  id. PASS.
- **H10c:** two students each have an edge to the **same** external `kb_record` id
  (`kb-shared`); after erasing A, A's edge is gone and B's identically-shaped edge to the same
  target survives untouched — confirms the edge filter's kind+id qualification, not incidental
  non-overlap. PASS.

No regression in any previously-verified behavior (confirm gate, isolation, partial-failure
reporting/retry, export, coverage, ISS-043, B8/B12 offline-ness) — I re-read the relevant guards
in the diff and they are unchanged from cycle 0 except where the manifest documents the cycle-1
changes.

## 7. Verdict rationale

Both issues explicitly in scope for this cycle — the unchecked final CAS (ISS-t-011-c0-1 /
ISS-t-011-rev-1) and the orphan-edge race under a concurrent writer (ISS-t-011-rev-3) — are
genuinely fixed, and I verified each by outcome with probes of my own (H1–H3, H5–H9), distinct
from and in most cases stronger than the maker's suite (5-way concurrent execute, not just 2-way;
an unstoppable-writer bound-then-recover test; injection at three distinct points around the
delete phases).

However, the brief also asked me to inject a concurrent writer "during the read-back," and doing
so (H4, reproduced twice independently with full diagnostic output in §3) surfaced a real,
high-severity structural gap that neither this cycle's fix nor the cycle-0 implementation
addresses: the read-back itself is a sequence of independent `countDocuments` calls, not an atomic
check, so a write landing between two of those calls in the same round can leave real personal
data (a fact, or a session with its scribe checkpoint and an edge) permanently in the database
while the receipt reports `verified: true, totalRemaining: 0` and the request is marked
`completed` — a state from which no retry is possible, because `studentId` and `carriedSelectors`
are unset on exactly that path.

This is a genuine defect on B15, the contract's top-priority item, found via the exact probe the
brief asked for, so this unit does not PASS cycle 1. `ISS-t-011-c1-1` is filed with the
reproduction and a suggested fix direction above.

**Everything else in this cycle is solid.** The round-based purge design for the delete-phase race
(the original rev-3 scope) is correctly implemented and holds under every variant I threw at it,
and the CAS-check fix for concurrent `executeErasure` is correct under both 2-way and 5-way
concurrency, success and failure. The fix cycle needed here should be targeted: make the read-back
itself resilient to a write landing mid-scan (§3 suggests two directions), which is a smaller,
more contained change than the round-loop work already done this cycle.
