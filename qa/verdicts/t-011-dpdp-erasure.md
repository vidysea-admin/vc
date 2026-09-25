# Verdict — t-011-dpdp-erasure

**Verdict:** FAIL
**Cycle checked:** 2
**Unit:** T-011 (DPDP erasure and export)
**Contract:** B15 above all, plus B4, B8, B11, B12, B14
**Diff range checked:** `58a38f6..ee89337` (single commit `ee89337`, "fix(db,engine): t-011 cycle 2 — erasure fence + post-write compensation (D-015)")
**Manifest read:** `qa/manifests/t-011-dpdp-erasure.md`
**Design:** D-015 (`docs/DECISIONS.md`), gate `qa/gates/erasure-fencing.md`
**In scope this cycle:** ISS-t-011-c1-1 (a write landing after its own collection's read-back count), ISS-t-011-c1-rev-1 (a write landing between the final read-back and the completion CAS); lows ISS-t-011-c1-rev-2, ISS-t-011-c1-rev-3

## 1. Verification commands re-run (worktree `D:\vc\.worktrees\t-011-dpdp-erasure`)

```
$ pnpm install
Lockfile is up to date, resolution step is skipped. Already up to date. Done in 477ms (exit 0)

$ pnpm -r typecheck
apps/api, apps/web, packages/observability, packages/providers, packages/schemas, packages/db,
mcp/student-profile, mcp/university-kb, packages/engine — all "typecheck: Done" (exit 0, 9/9 clean)

$ pnpm -r test
apps/web 1/1 · apps/api 1/1 · packages/providers 8/8 · packages/schemas 50/50 ·
packages/observability 57/57 · packages/db 119/119 · mcp/student-profile 12/12 ·
mcp/university-kb 9/9 · packages/engine 102/102
TOTAL 359/359, 0 fail (exit 0) — matches the manifest's claimed counts exactly.

$ python contracts/verify_contracts.py
verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity (exit 0)
```

Diff scope confirmed: `packages/engine/src/scribe/nodes.ts` is untouched in `58a38f6..ee89337`
(empty `git diff --stat`), matching the manifest's claim that T-013 owns it.

## 2. Method

Read `src/erasure.ts` in full (the fence section, `executeErasure`'s CAS + release ordering),
`src/facts.ts`'s `applyApprovedDiff` (pre-check, tracked ids, post-write `compensateIfFenced`),
`packages/engine/src/scribe/graph.ts` (`invokeFenceAware`, `startScribe`/`resumeScribe` pre-checks),
`src/consent.ts` (`requireConsent`'s fence check), D-015 and gate `erasure-fencing.md`. Then wrote
my own hostile probe suites, structurally independent of the maker's tests, in
`packages/db/tests/zz-checker-scratch.test.ts` (10 probes) and
`packages/engine/tests/zz-checker-scratch.test.ts` (2 probes), drafted at
`C:\Users\Lenovo\AppData\Local\Temp\claude\d--vc\4028b141-b4f9-4793-84a0-f900414a84fb\scratchpad\t011-hostile-c2-{db,engine}.test.ts`,
run via `npx tsx --test tests/zz-checker-scratch.test.ts` inside the real pnpm workspace, then
**deleted** before this commit (`git status --short` confirmed clean). A standalone permanence
repro (`zz-ckr2-permanence.mjs`) was also written, run and deleted the same way.

## 3. Item 2 — cycle-1 probes re-run with the REAL fence-aware writers

- **CKR2-1** (db, own injection point — `scribe_resolutions.countDocuments`, not the maker's
  `students.countDocuments`): a REAL `applyApprovedDiff` writer paused right before its
  `facts.insertOne`, released mid read-back. Result: `StudentFencedError`, zero residue for the
  student (full JSON scan of every fake collection), zero orphan fact→edge, the other student's
  data untouched. **PASS.**
- **CKR2-ENG-1** (engine, own injection point — `students.countDocuments`, the LAST step in
  `ERASURE_PLAN`, vs. the manifest's `scribe_resolutions.countDocuments`): a REAL `resumeScribe`
  paused inside `applyApprovedDiff`, released mid read-back of a real `executeErasure`. Result:
  `{kind:'fenced'}`, `receipt.verified:true`, zero residue across every engine collection, the
  MemorySaver holds nothing for the thread, fence released on completion. **PASS.**
- **Falsification (mutate → red → restore):** disabled the post-write `compensateIfFenced` call in
  `packages/db/src/facts.ts` (`if (false) await compensateIfFenced(...)`), re-ran CKR2-1: it goes
  **red** (the writer is no longer refused; the hook's own assertion throws). Restored the file and
  confirmed byte-identical with `cmp`; the full 359-test suite is green again afterward. Confirms
  the probe is load-bearing, not a tautology.

Both in-scope H4/H4b-class races (ISS-t-011-c1-1, ISS-t-011-c1-rev-1) are genuinely closed for the
timing window D-015 targets — see the `qa/issues.jsonl` updates. **This part of cycle 2 is correct.**

## 4. Item 3 — THE KEY PROBE (grace-0 residual)

**Construction.** A writer's own pre-check (`assertStudentNotFenced`) refuses immediately once a
fence exists, so the only way a real writer's insert can ever land at all is for its pre-check to
pass before the fence is set (the standard `pausedWriter` pattern the maker's own tests use). I
therefore: paused a REAL `applyApprovedDiff` writer right before its `facts.insertOne` (pre-check
already passed); confirmed the erasure (fence now set); hooked `erasure_fences.deleteMany` — the
exact call `releaseErasureFence` makes at grace 0 — so that **after** the real fence deletion
completes, the paused writer is released and its write + post-check (`compensateIfFenced`) run.
This directly targets the boundary the brief asked for: a real writer inserting after the final
read-back, whose post-check is scheduled to run only after the fence's own release.

**Result** (probe `CKR2-KEY`, and a standalone permanence repro):
```
out (executeErasure):        { status: 'completed', receipt.verified: true }
writer (applyApprovedDiff):  { ok: true }  -- NOT StudentFencedError
survivedDocs:                facts:<id>, edges:fact-><id>->sourced_from->session, edges:student->has-><id>
fenceGoneWhenWriterChecked:  true
```
A second `executeErasure(db, requestId)` call on the same, now-`completed` request returns
`alreadyCompleted:true` with the identical stale receipt (`totalRemaining:0`) — it does **not**
re-scan. The row's `studentId` and `carriedSelectors` are already unset. The orphaned fact and its
2 edges are permanently unreachable by any future retry of this request; only a **brand-new**
erasure request for the same student would ever find them again.

**Ruling on item 3's question.** Yes — a non-zero technical grace period, at least as long as the
slowest fence-aware writer can realistically take, is **required for correctness**, independent of
the re-enrolment policy question gate `erasure-fencing.md` Q1 asks. Q1 frames grace length as a
re-enrolment/UX tradeoff; this probe shows grace also does load-bearing correctness work (closing
the release-boundary race). D-015's own closure argument ("W's post-check runs while the fence
exists → W removes its own writes; W's post-check ran before the fence → the purge deletes it")
implicitly assumes every writer's post-check runs before the fence is released — grace 0 does not
guarantee that, and the receipt actively misreports the outcome (`verified:true` over real
residue) with no automated recovery path once `completed` discards the retry key. The maker
already documents this exact mechanism honestly (manifest "Fix cycle 2 → Residuals → Grace 0",
D-015's own comments in `src/erasure.ts`), which is why this is a FAIL rather than an
undisclosed-defect finding — but it is shipped as the **default**, not an opt-in, and it
contradicts contract B15's stated guarantee ("a verification pass … proves zero documents remain
for that student") under a realistic, not contrived, timing window (this is exactly the kind of
race a real MongoDB deployment's per-operation round trips create). Filed as **ISS-t-011-c2-1**
(high).

## 5. Item 4 — the fence must not overreach

- **CKR2-4a:** while A is fenced and mid-purge, a normal write for B (`applyApprovedDiff`)
  succeeds and survives A's erasure untouched (fact + 2 edges intact); A is fully erased. **PASS.**
- **CKR2-4b:** with `fenceGraceMs: 60_000`, the fence lingers past completion; `isStudentFenced`
  correctly reports fenced within the window and unfenced once the clock passes it;
  `releaseExpiredErasureFences` physically sweeps it. **PASS.**
- **CKR2-4c:** a fence-release failure (`erasure_fences.deleteMany` throws) does **not** fail a
  verified erasure (`status:'completed'`, `verified:true`), and fails safe — the fence lingers so
  writes stay refused (`assertStudentNotFenced` still throws). **PASS.**
- **CKR2-4d:** `requireConsent` on a fenced student throws `ConsentRequiredError` with the exact
  same `CONSENT_REQUIRED_MESSAGE` as every other refusal (ISS-043) — no leak that an erasure is
  running. **PASS.**

## 6. Item 5 — regression (cycle 0 / cycle 1)

- **CKR2-REG-1:** an unconfirmed request deletes nothing — full byte-identical snapshot before and
  after (`ErasureNotConfirmedError`). **PASS.**
- **CKR2-REG-2:** self-confirm refused across exact/padded/upper-cased variants. **PASS.**
- **CKR2-REG-3:** two concurrent `executeErasure` calls on one request — exactly one recorded
  attempt, both callers' receipts deep-equal the persisted row, `alreadyCompleted` is
  `[false,true]` (checked CAS, ISS-t-011-c0-1). **PASS.**
- **CKR2-REG-4:** a REAL `applyApprovedDiff` writer injected at the start of phase 2 (round-based
  purge, ISS-t-011-rev-3) — whichever way it resolves (fenced, or picked up by the round loop), the
  erasure ends `verified:true` with zero residue and zero orphan fact→edges, B untouched. **PASS.**

No regression found in any previously-verified behaviour.

## 7. Verdict rationale

Both issues explicitly in scope for this cycle — ISS-t-011-c1-1 and ISS-t-011-c1-rev-1 — are
genuinely fixed for the exact race windows they describe, verified with my own probes at different
injection points than the maker's, and confirmed load-bearing by falsification. Item 4 (fence
scope) and item 5 (regression) are clean.

**The FAIL is item 3.** The grace-0 default leaves a real, reproducible gap in B15's core
guarantee: a fence-aware writer's write can permanently survive a request the system reports as
`completed` / `verified:true`, with the retry key (`studentId`, `carriedSelectors`) already
discarded on that same commit, so there is no automated way to ever find or erase it again. This is
not a hypothetical misconfiguration — `ERASURE_FENCE_GRACE_MS = 0` is the value shipped in this
diff. The maker has been transparent about the mechanism (it is documented, not hidden), and the
fix is narrow and already identified by the maker's own gate document (`erasure-fencing.md` Q1
already recommends a non-zero grace): fix cycle 3 should close this before the 3-cycle budget is
exhausted, either by shipping a safe non-zero default grace or by keeping the retry key alive until
a grace-delayed confirmation pass has also come back clean.

## 8. Issues ledger

- `ISS-t-011-c1-1` → **fixed**, verified this cycle (see `qa/issues.jsonl`).
- `ISS-t-011-c1-rev-1` → **fixed**, verified this cycle (see `qa/issues.jsonl`).
- `ISS-t-011-c2-1` (new, **high**) → the grace-0 release-boundary residual (item 3 above); blocks
  the PASS this cycle.
