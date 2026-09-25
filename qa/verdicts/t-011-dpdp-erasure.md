# Verdict — t-011-dpdp-erasure

**Verdict:** FAIL
**Cycle checked:** 0
**Unit:** T-011 (DPDP erasure and export)
**Contract:** B15 above all, plus B4, B8, B11, B12, B14
**Diff range checked:** `e10e49d..becfa81` (single commit `becfa81`)
**Design:** `qa/gates/dpdp-erase-design.md` — (a) hard delete, confirmed, verified
**Manifest read:** `qa/manifests/t-011-dpdp-erasure.md`

## 1. Verification commands re-run (worktree `D:\vc\.worktrees\t-011-dpdp-erasure`)

```
$ pnpm install
Scope: all 10 workspace projects
Lockfile is up to date, resolution step is skipped
Done in 792ms using pnpm v10.33.0

$ pnpm -r typecheck
apps/api typecheck: Done
apps/web typecheck: Done
packages/observability typecheck: Done
packages/providers typecheck: Done
packages/schemas typecheck: Done
packages/db typecheck: Done
mcp/university-kb typecheck: Done
mcp/student-profile typecheck: Done
packages/engine typecheck: Done
(exit 0, all 9 typecheck scripts clean)

$ pnpm -r test
apps/api        1/1
apps/web        1/1
packages/providers   8/8
packages/schemas     50/50
packages/observability 57/57
packages/db          94/94
mcp/university-kb    9/9
mcp/student-profile  12/12
packages/engine      67/67
TOTAL 299/299, 0 fail   (exit 0)

$ python contracts/verify_contracts.py
verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity   (exit 0)
```

All four match the manifest's claims exactly (same 299 total, same per-package counts).

## 2. Method

I read `src/erasure.ts`, `src/facts.ts`, `src/edges.ts`, `src/collections.ts`, `src/consent.ts`,
`scripts/db-init.ts` (`INDEX_PLAN`), `tests/erasure.test.ts`, `tests/fakes.ts`,
`packages/engine/src/scribe/{graph,checkpointer}.ts`, `qa/contracts/counselling-engine.md` (B15,
B4, B8, B11, B12, B14), `qa/gates/dpdp-erase-design.md`, and D-014.

I then wrote my own hostile test file (`t011-hostile.test.ts`, 9 tests), independent of and
structurally different from the maker's `erasure.test.ts`, using the same `@vc/db` test-only
`fakes.ts` harness with **every unique `INDEX_PLAN` index declared** on the fake, seeding through
the real write path (`applyApprovedDiff`). Drafted at
`C:\Users\Lenovo\AppData\Local\Temp\claude\d--vc\4028b141-b4f9-4793-84a0-f900414a84fb\scratchpad\t011-hostile.test.ts`,
copied into `packages/db/tests/zz-checker-scratch.test.ts` to run inside the real pnpm workspace
(`npx tsx --test tests/zz-checker-scratch.test.ts`), then **deleted** before this commit
(`git status --short` confirmed clean afterward — the worktree carries no trace of it).

## 3. Confirm gate — OUTCOME-PROVEN

- **Unconfirmed request deletes nothing:** maker's test + independently re-derived by reading
  `executeErasure`: it reads the row and throws `ErasureNotConfirmedError` for `status==="pending"`
  before any `db.collection(...).deleteMany` call is reached. VERIFIED.
- **Self-confirm refused, case/whitespace variants:** maker's test covers `requestedBy` variants.
  My **H3** additionally hits the literal brief phrase "the student confirms their own": confirming
  with `confirmedBy` equal to the *studentId itself* (not the requester), under exact / padded /
  upper-cased forms — all three refused with `"confirmedBy must be a staff actor id, not the
  student's id"`. VERIFIED.
- **Double confirm / unknown requestId:** maker's tests cover both directly (`ErasureStateError`,
  `ErasureRequestNotFoundError`). VERIFIED.
- **Confirm racing execute:** my **H2** ran `Promise.allSettled([confirmErasure(...),
  executeErasure(...)])` on a still-**pending** request, 20 iterations with a fresh fixture each
  time. In every iteration, either (a) `executeErasure` lost the race and threw
  `ErasureNotConfirmedError` with **zero bytes deleted** (snapshot-length assertion), or (b) it won
  only when `confirmErasure` had genuinely landed first, and in that case the erasure completed
  correctly (read-back zero). 20/20 clean, no interleaving ever let an execute slip through on an
  unconfirmed row. VERIFIED.
- **A DIFFERENT execute race was NOT safe — see §7.**

## 4. Completeness — OUTCOME-PROVEN

- Maker's fixture seeds two students through the real `applyApprovedDiff` (real edges, one retired
  fact each via a superseding second session), plus consents, decisions, `scribe_resolutions`, and
  both checkpoint collections with `scribe:<sessionId>` thread ids. The "nothing left" check scans
  every document of every fake collection for the student's identifiers — independent of the
  implementation's own selectors. Confirmed by reading the test, not just trusting its name: it is
  exactly that (`docsMentioning`, no reuse of `erasure.ts` filters).
- **Second student sharing an external target:** the maker's fixture already gives both students
  `universityId: "uni-1"` / `courseId: "course-1"` on their `decisions` rows, and isolation holds
  (byte-identical B before/after). I went further with **H5**: seeded an explicit
  `fact --applies_to--> university:uni-shared` edge for BOTH A and B pointing at the **same**
  external id. After erasing A, A's edge is gone and B's identical-shaped edge to the same target
  survives untouched. This directly proves the edge filter's kind+id qualification (not a bare id
  match) is what protects a shared target, not incidental non-overlap in the fixture. VERIFIED.
- **Edge kind coverage traced against the real write path:** `facts.ts` only ever creates
  `fact--sourced_from-->{session|transcript_turn|kb_record|profile_fact}` and
  `student--has-->fact`, and both always have the *fact* (or *student*) id on the correct side, so
  every real edge is caught by `erasure.ts`'s `edgeFilter` clause 1 or 3 regardless of the `to`
  side's kind. Read directly in `packages/db/src/facts.ts:288-300,421-423` and
  `packages/db/src/edges.ts`. No gap found.
- **Scribe checkpoint thread-id derivation:** confirmed by reading `packages/engine/src/scribe/graph.ts:200-202`
  (`scribeThreadId`) and `checkpointer.ts` — the thread id is always `scribe:<sessionId>`, matching
  `erasure.ts`'s `scribeCheckpointThreadId`, and the drift-guard test reads the same two files at
  runtime so a future rename would go red. The `resolveSelectors` function additionally pulls
  thread ids from `scribe_resolutions.threadId` (the approval-claim store), which is a second,
  independent path to the same ids — belt-and-suspenders, correctly reasoned.

## 5. Partial failure — OUTCOME-PROVEN, extended

- Maker's tests: an edges (phase 1) failure and a sessions (phase 2, anchor) failure, each
  reported, deferred correctly, retried to completion, third call idempotent (`alreadyCompleted`).
  Re-ran these — pass.
- My **H4a**: injected a `facts` (phase 2 anchor) failure specifically (not sessions) — reported as
  `failed`, retried, completes, read-back zero. VERIFIED.
- My **H4b**: injected **two simultaneous** phase-1 failures (`edges` AND `scribe_checkpoints`
  both throwing) in the same attempt — both correctly reported `failed`, all four phase-2 anchors
  correctly `deferred`, no crash, no swallowed error. VERIFIED — the implementation does not assume
  at most one phase-1 failure.

## 6. Receipt and audit — OUTCOME-PROVEN, with a quantified residual risk

- No personal data in the receipt or the surviving audit row: maker's test scans both for every
  identifier. Re-derived by reading the schema (`ErasureReceiptSchema`, strict) and the `$unset
  studentId` on completion.
- **The salted-hash "dictionary check" the module's own docstring flags as residual risk**: my
  **H6** demonstrates it concretely rather than leaving it as a stated assumption. Given the
  completed audit row (which is legitimately readable — it's the audit log) and a **candidate id
  list of 50,000 plausible student ids**, recomputing `sha256("vc-erasure-v1|" + hashSalt +
  "|" + candidate)` for each and comparing to `studentHash` recovered the real id
  (`stu-A`) in **18ms**. `hashSalt` is stored in clear on the row (by design — it has to be, to let
  a caller later confirm a match via `erasureRequestMatchesStudent`), so the salt buys nothing
  against an attacker with a plausible id list; it only defeats a rainbow table built without
  knowing the salt is per-request. This is already flagged in the manifest's "Open questions #1"
  as a non-blocking follow-up (HMAC keyed from `.env`) — I confirm the risk is real and worth
  keeping on that list, not a new finding, but it is now proven rather than asserted.

## 7. THE BUG — concurrent `executeErasure` on the same confirmed request (H1)

**This is the reason for the FAIL.** `confirmErasure` and `executeErasure` racing was explicitly
in scope (per the brief), and I found the adjacent, unprobed case: **two concurrent
`executeErasure(db, requestId)` calls on the same already-confirmed request.**

Reproduction (`H1`, `packages/db/tests/zz-checker-scratch.test.ts`, run via `npx tsx --test`):

```
H1 results: [
  { ok: 1, alreadyCompleted: false },
  { ok: 1, alreadyCompleted: false }
]
H1 persisted row: { status: 'completed', attempts: 1, receiptAttempt: 1 }
H1 both returned receipts equal the PERSISTED receipt: false
```

Both concurrent calls resolve successfully (no throw), both return `alreadyCompleted: false` (i.e.
each believes it, personally, just performed and completed the erasure), but **only one write
actually lands** in `erasure_requests` (the loser's final `findOneAndUpdate` is a CAS on
`{_id, status: row.status}` and simply doesn't match once the winner has already flipped the
status — the code never checks whether that update matched). The loser's returned receipt is
therefore **not** what is persisted as the audit record (they even differ byte-for-byte —
`verifiedAt`/`startedAt` differ, since each computed its own timestamps).

Root cause: `src/erasure.ts:416-424` (the `verified` branch) and `:426-429` (the `failed` branch)
both call `erasureRequests(db).findOneAndUpdate({_id: requestId, status: row.status}, ...)` and
**discard the result** without checking whether it matched. Contrast with `confirmErasure` in the
very same file (`:222-229`), which does exactly this CAS pattern **correctly** — it checks
`if (!updated)` and re-reads/throws `ErasureStateError` for the loser. `executeErasure` has the
same race shape but not the same guard.

**Why this matters for a DPDP audit trail (B15):** the returned receipt is the thing an operator
or a compliance process would rely on as proof of a specific erasure attempt. If two admin
sessions (or a client retry after an apparent timeout, with no idempotency key) both call execute,
each is told "completed" with its own attempt/timestamp, but the persisted audit record only ever
reflects one of them — silently. This does **not** cause data to survive (the actual deletion is
real and idempotent; B untouched throughout, confirmed in H1), and it does not leak personal data.
It is a narrower defect than a data-safety bug, but it breaks the "the receipt IS the record"
guarantee the audit log exists to provide, on the exact feature the brief named "above all."

**Suggested fix (small, same file, mirrors the existing correct pattern):** check the result of
both `findOneAndUpdate` calls in `executeErasure`; when it does not match (another call already
transitioned the row), re-read the now-persisted row and return **its** stored receipt instead of
the locally-computed one (with `alreadyCompleted` reflecting reality), the same way
`confirmErasure` already re-reads on a CAS miss.

Filed as `ISS-t-011-c0-1` (medium) in `qa/issues.jsonl`.

## 8. Export — OUTCOME-PROVEN

Maker's tests: full history (including the retired fact) for A, nothing of B, an unknown student
gets an empty bundle, export writes nothing. My **H7**: exporting a student with a request still
**pending** (nothing deleted yet) returns the full 3-fact bundle — confirms export never silently
filters on erasure-request state. VERIFIED.

## 9. ISS-043 — VERIFIED

`consent.ts`'s three former messages now collapse to one `CONSENT_REQUIRED_MESSAGE`, named neither
student nor purpose nor minor status. `consent.test.ts` covers it; the existing 5 B4 tests and the
`mcp/student-profile` regex match stayed green in the full `pnpm -r test` run above.

## 10. Coverage test — VERIFIED, and proven non-vacuous

The maker's coverage test (`ERASURE_PLAN` ∪ `ERASURE_EXEMPT_COLLECTIONS` = `COLLECTION_NAMES`) was
checked for whether it could actually fail, not just whether it currently passes. My **H8**
independently re-implements the same coverage check against `COLLECTION_NAMES` plus a synthetic
unplanned `"cards"` entry and confirms the check flags it as uncovered — the assertion is a real
tripwire, not vacuous.

## 11. B8 / B12 — VERIFIED by inspection

`erasure.ts` never imports `mongodb`'s client-level API, only uses `db.collection(...)` on the
`Db` it is handed (same pattern the B12 helper enforces elsewhere); no `client.db(`, no
`dropDatabase`, no collection drop anywhere in the diff. All tests run offline against
`fakes.ts` (confirmed: no `MONGODB_URL` reference, no network import, in either the src or test
files touched by this diff).

## 12. Falsification

Re-ran the maker's own mutate→RED→restore table (F1–F7) by reading each guard directly in
`src/erasure.ts` against its cited test names — each guard (confirm gate, verification pass,
isolation selector, partial-failure reporting, self-confirm check, anchor deferral,
`$unset studentId`) is exactly where the manifest says it is, single-point, easy to falsify and
easy to restore (consistent with the claimed 18/18 results). I did not re-run the maker's mutation
script itself (no need — my own H1–H8 are independent probes that exercise the same code paths
plus two the maker's suite doesn't reach at all: concurrent execute, and the two-simultaneous
phase-1-failure case).

## 13. Verdict rationale

Every item in the brief was proven by outcome with hostile probes of my own, distinct from the
maker's suite: 20-iteration confirm/execute race sweep, self-confirm with the studentId itself
under case/whitespace, a shared-external-target edge isolation test, a phase-2 (`facts`) failure
and a two-simultaneous-phase-1-failure case, a quantified salted-hash dictionary recovery, a
pending-request export check, and a non-vacuity check on the coverage test. All of B15's stated
requirements (confirm gate, full purge, verification, isolation, receipt privacy, partial-failure
reporting/retry, export, coverage) hold under these probes.

One genuine, reproducible bug was found that the maker's suite does not cover and that the brief's
explicit "confirm racing execute" scope led directly to: concurrent `executeErasure` calls on the
same request can return a receipt to a caller that does not match what is actually persisted to
the audit log, because the final CAS update's result is discarded rather than checked (unlike the
adjacent, correctly-guarded `confirmErasure`). This is scoped, well-understood, and has a small,
low-risk fix mirroring existing code in the same file — but it is a real defect on the contract's
top-priority item (B15), so this unit does not PASS cycle 0. `ISS-t-011-c0-1` is filed with the
reproduction and suggested fix above.

**Everything else in this unit is exceptionally rigorous** — real write-path fixtures, a fake that
throws on unsupported Mongo operators rather than silently mismatching, index-declared partial
filters checked against real server semantics, and a manifest whose every claim I was able to
reproduce independently. The fix cycle needed here should be small.
