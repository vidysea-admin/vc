# Mode B sweep 2026-09-27T16:35 IST — consolidation report

**Bound root:** D:/vc. **Form:** sharded (3 shards, checks 1-3 / 4,4b,5,6 / 7-9+ledger+graph), 0 shards
failed, plus 4 findings from the root checker session itself (C1-C4). This consolidation session is the
single writer. **Previous sweep:** `qa/.last-sweep` = 2026-09-27T13:52:00+05:30 at SHA `6124ff2`.
**HEAD at report time:** `44034d2982a1c5d7cb8866a6675d0bfafe1697bb` (`git log -1 --format=%cI` =
2026-09-27T16:35:20+05:30). The tree moved through `64ac2eb → 14599b7 → 1260ebb → e1a0263 → 15ba094 →
1f3e8ad → 0223812 → 4b5fa5d → fed6973 → 44034d2` while this sweep ran — a live maker session (vc-30) was
ticking concurrently throughout.

## CLOCK WARNING — governs every age judgement below

The maker's tick stamps in `qa/.last-tick` and several commit messages carried a wall clock **~4-4.5h
ahead** of real time for most of 2026-09-27 (composing the time from its own sense of it, not reading
`date`). Every age and timestamp in this report is derived from `date -Iseconds` or
`git log --format=%cI`, verified independently, never from a prose stamp. Filed as **ISS-086** (fixed
this sweep — verified against 3 post-16:10 commit/tick-timestamp pairs, no skew: `1f3e8ad` 16:17:26 ↔
tick 16:17:25, `4b5fa5d` 16:23:55 ↔ tick 16:23:55, `fed6973` 16:26:26 ↔ tick 16:26:26).

## Check 1 — bypass detection + pair-state reconciliation

CLEAN (corroborated from shard 1, spot-checked independently): no bypassed unit on main. T-034/T-036/
T-037 all closed-out and merged with matching cycle verdicts. T-039/T-040/T-041 correctly in-flight with
live manifests (verified: T-010 c1 `ready-for-check` with **no verdict file on disk at all** —
`qa/verdicts/t-010-live-cards.md` does not exist — corroborating ISS-054 below; T-040 has no manifest yet,
consistent with "still building"). No duplicate `## Status` lines found live. `qa/.paused` absent.

## Check 1b — delegation health

CLEAN, no new finding. `qa/delegation-ledger.jsonl` absent, all manifest `Executor:` lines name Claude
models — this is exactly what the existing **ISS-058** (open, medium, since 2026-09-26) already tracks;
not re-filed.

## Check 1c — regression coverage

**ISS-076 updated.** Re-derived independently over the pre-sweep ledger (432 lines / 251 ids,
latest-row-per-id): **50 of 120** fixed/verified rows carry a non-conforming `regression_check` (16
missing + 34 unallowlisted), vs 48/116 at 13:52 — rate flat at ~41.6%, not shrinking. Root cause
unchanged: the adapter's 3 whole-monorepo verify commands have no per-package narrowing convention.
Mechanism noted in the same update, not double-filed: `verified` (4) has not moved since 13:52 while
`fixed` grew to 118, because a `fixed→verified` transition needs the checker to reproduce the
regression_check failing-with-fix-reverted, structurally blocked for the non-conforming ~42%.

## Check 1d — PLAN bypass

CLEAN. `docs/intent.md` + `qa/contracts/` + `docs/plan.md` remain the project's approved substitution
for `docs/features/<slug>/`. No `built-before-plan`, no `feature-without-plan`.

## Check 2 — inbox fold-in

**5 entries folded this sweep** (all independently verified not to turn on the held necessary-vs-
sufficient question): the 2026-09-26 ai-engineer T-013 fail-safe entry, and T-036 blind-oracle Q3, Q4,
Q6, Q7, Q8. All five marked `FOLDED: 2026-09-27` in `qa/feedback-inbox.md`, folded into contract B2 as
one "Fail-safe + scope clarifications" block (amendment-log entry added). **Q1, Q2, Q5 deliberately left
unfolded**, correctly held on `qa/gates/auto-verify-surface.md` (still open). Filed as ISS-082 (T-013
pattern) and ISS-083 (Q3/Q4/Q6/Q7/Q8), both status `fixed` on arrival (documentation-only, no code
change, no regression_check applicable — same process/hygiene class as ISS-076's NULL bucket). B10
(draft-only P2 filler) remains untouched by any check — forward-scoped, no prune, note only.

## Check 3 — contract staleness

No stale criteria found beyond the routine fold above. Amendment log is current.

## Check 4 — enforcement liveness

Base wiring confirmed present and firing (settings.json hooks, `mc-sessionstart.ps1`, `mc-precommit.ps1`,
`decisions-append-guard.ps1`, lab-session hooks; D-006 `Approved-by: Umesh`; 440+ commits).
`qa/loop.md` present, Stop line + Human gate uncontradicted.

**Two open gates this sweep, both genuine and neither answered off-disk** (corrects the prior sweep's
stale "all answered except auto-verify-surface" claim — `b18-unimplemented.md` opened at commit `1260ebb`,
after the prior sweep's read):
- `qa/gates/auto-verify-surface.md` — open since 13:52, unaffected by this sweep's B2 fold.
- `qa/gates/b18-unimplemented.md` — NEW, opened by T-039 (`1260ebb`), independently confirmed by the T-039
  checker (`0223812`): B18 has no engine surface on `main` outside the unmerged `wave/t-010-live-cards`
  branch. Not a "gate answered off-disk" finding — genuinely open, correctly asked.

Loop-design Goodhart-risk check re-derived: **ISS-081 updated, IMPROVING.** Instance 1
(ISS-t-030-rev-1) RESOLVED — ledger's own latest row shows `status: fixed`, T-036 checker-verified PASS
`f4f0a7c`. Instance 2 (ISS-t-010-rev-4) stays open, under active widening (27→78 rows, 0/66 contained).

## Check 4b — data boundary (DETERMINATE this run, corrected from the shards' INDETERMINATE)

The shards hit a real WinError3 crash (`.worktrees/t-034-webhook-outbox`'s dangling pnpm symlink under a
merged-but-not-deleted worktree). The peer maker (vc-30) removed two orphaned worktree dirs mid-sweep
(`t-034-webhook-outbox`, `t-036-independent-oracle`) and ran `git worktree prune`. **This checker re-ran
the instrument itself** (`python D:/ai_os/.claude/skills/_shared_validation/data_boundary.py D:/vc`,
~4 minutes): **completed cleanly, exit 1, 52 VIOLATION + 5 ADVISORY.**

**Independently re-derived, file:line, not waved through:**
- Only **9 distinct files breach in the root tree** (not 52) — the other 43 are the same 9 files
  duplicated once per in-flight worktree (`t-010-blind-cards-eval`, `t-010-live-cards`,
  `t-039-suppression-outcome`, `t-040-commit-testlock`, `t-041-concern-classifier-abort`), an artefact of
  the instrument counting file occurrences across worktrees rather than distinct entities.
- `docs/DECISIONS.md:74,109,110` and `qa/gates/config-audit-fixes.md:8,13-14` carry
  `umeshsugara@vidysea.com` (the Approver's own work email, "yes fix and mail is
  umeshsugara@vidysea.com", the answer recorded at `config-audit-fixes.md:8`) and
  `himanshu@vidysea.com` (the operator account named in D-006, corrected in the same file) — both
  accepted staff addresses in governance records, per D-011/ISS-003 (wontfix, accepted, since
  2026-09-25).
- `qa/evidence/{t-008-approval-ui,t-018-approval-followups,t-020-reject-reason-ui}/test.txt:109,131`,
  `qa/sweeps/2026-09-27T{09-03-50+05-30,13-52-consolidation}.md`, and
  `qa/verdicts/t-028-personas-scenarios.md:28` all carry the literal string
  `pass@eu.cloud.langfuse.com` — the NAME of a passing security test (`ISS-016`,
  `ISS-t-004-langfuse-1`) asserting that a credential-bearing URL is REFUSED by `initTracing`. It is a
  test name captured in evidence logs, not a credential and not data.
- `qa/issues.jsonl` carries both classes (its own ledger rows quoting the accepted emails and the
  langfuse test name verbatim while documenting them as accepted, e.g. lines 245/381/403/404 in the
  pre-sweep file).

**Determination: NO DATA-BOUNDARY BREACH. Zero student, applicant, Pathlynks or V3.3 data anywhere.**
The class is unchanged from the 13:52 sweep's correct conclusion; the raw count moving 36→52 is the
worktree-duplication artefact, not a widening — filed as its own finding (**ISS-084**, see below), not
escalated to a false breach and not waved through with a smaller-number precedent.

**ISS-045 reopened anyway (high), for a different reason than a breach:** the WinError3 **crash class**
recurred this window (crashed twice before the mid-sweep fix), and one orphan, `.worktrees/
t-037-failover-cancellation`, remains on disk **unregistered** (`git worktree list` shows 5 registered vs
6 dirs under `.worktrees/`) because a live process still holds its handle ("Device or resource busy" on
removal). The instrument ran clean this time; the risk is latent, not active. Remedy is the maker's own
`git worktree prune` retry once the handle releases — not a checker-writable fix.

## Check 5 — goal-coverage gap analysis

No `.goal/goal.json`; `docs/intent.md` fallback used, per ISS-065 (unaffected this sweep, still tracks the
missing `serves: intent#O<n>` tagging convention). O4/O8 coverage gap (ISS-077) is now substantively
addressed — see the TODO note below — though ISS-077 itself stays open in the ledger until T-038/T-039
close.

## Check 6 — goal-drift / re-grill

**No `GRILL:` row.** `qa/.regrill-due` absent; no unit re-PASSed twice on the same evidence; the goal
(`docs/intent.md`) was not edited after the last contract amendment; all `docs/intent.md` Open questions
are PARKED or in a recently-committed file. Every gate file with 3+ `Answered:` lines matches disk (no
"gate answered off-disk" finding — the two open gates above are genuinely open, not silently answered
elsewhere). Confirmed no invented GRILL trigger, per the dispatch's explicit instruction.

## Check 7 — silent-failure hunt

**ISS-085, NEW, high.** B21 `fact.approved` webhook path silently under-reports:
- `packages/db/src/facts.ts:1001-1005` `getFactsByIds` — its own docstring: unknown ids are silently
  absent from the result, never an error.
- `apps/api/src/server.ts:316-327` `decideApproval` — after `applyApprovedDiff` reports
  `writtenFactIds.length > 0`, calls `getFactsByIds(...)` and emits one `fact.approved` event per fact
  ACTUALLY RETURNED (`written.map(...)`), with **no count check** against `writtenFactIds`. A read-back
  miss (replication lag, a concurrent B15 erasure fence, an `applyApprovedDiff` bug) silently shrinks the
  webhook batch — no log, no error, still 200.
- Second leak, same request: `apps/api/src/server.ts:609-627` — an `outbox.enqueue(...)` throw (line 615)
  is caught (616), logged as `webhook_enqueue_failed`, and the route still returns 200; the event never
  reaches the outbox's own retry/dead-letter machinery.

Not a deliberate-fallback exemption (B21 Events is new, T-034, not one of the contract's named fallbacks
B6/B20). B21 promises the client "keeps its own copy"; today it can silently keep an incomplete one. Filed
as one row (shared root cause: read-back-then-emit with no consistency check and no alerting).

## Check 8 — capability coverage / instrument health

Covered under check 4b above (`data_boundary.py`) and by the root-session's C2/C3 findings (below) — the
project's own verify-path instrument (`vc-testlock.sh`) has its own reliability defect, distinct from
`data_boundary.py`'s.

## Check 9 — structural erosion

No new signal. Shard 3's stale-SHA methodology correction is accepted: diffing against pinned worktree
SHAs (rather than `git merge-base main <HEAD>`) produced large false diffs (apparent deletion of guard
files, a fake 698-line `erasure.ts` shrink); recomputed against the true merge-base, none of that is
real. `ISS-079`/`ISS-080` (scribe/nodes.ts, scribe/graph.ts) unchanged — not worse, not resolved, no
re-run needed.

## Root-session findings (C1-C4) — filed by the consolidator itself, not a shard

- **C1 → ISS-086 (high, fixed, independently verified this sweep)** — the clock-composed-not-read
  defect. See CLOCK WARNING above.
- **C2 → escalated the existing ISS-t-037-1 (low → high)**, not a duplicate: `vc-testlock.sh` is named
  by 11 committed manifests but was never committed; exactly two divergent copies exist, both in session
  scratchpads (md5 `b6c788b6...` 20-minute stale break vs `83c0db3f...` explicit `STALE_SECS` gate) — an
  unreproducible verify environment across roughly a third of this project's units. T-040 (open, in
  flight) is already building the fix.
- **C3 → ISS-087 (medium, new)** — neither lock copy checks owner-PID liveness, only age; a dead holder
  always costs the full staleness window. Falsification named for T-040's checker.
- **C4 → not filed as a ledger row** — the checker safety-net takeover rule reading manifest AGE (rather
  than actual liveness) is a design gap in a skill that lives outside this root's writable surface;
  recorded here as a process note only, per the dispatch's own guidance.

## Token ledger

Shard 3's prepared line appended verbatim (`scanned_at` 2026-09-27T16:06:34, real-clock consistent):
`opus_sub_share` 2026-09-27 ≈ 27.5%, over the 25% threshold, judged **JUSTIFIED** — a genuine 4-parallel-
unit wave with T-010 fix-cycle-1 deliberately Opus-executed; no manifest reached fix-cycle ≥3 today (max
= cycle 2, T-010, now dispatched, still under the cycle-3 spend-flag bound).

## Blast radius / code graph

No `/code-graph` graph exists for D:/vc — correctly skipped, none built, per instruction (never build a
graph from a sweep).

## Ledger

Before: 432 lines / 251 distinct ids. After: **444 lines / 257 distinct ids** (6 new: ISS-082..ISS-087;
6 updates: ISS-045 reopen, ISS-054, ISS-056, ISS-076, ISS-081, ISS-t-037-1). **Validated: all 444 lines
parse as JSON, 0 failures** (python, line-by-line). Latest-row-per-id status: **open=127, fixed=118,
wontfix=8, verified=4** (independently cross-checked against the session-start hook's raw count: 243 raw
open lines vs 127 real — the ~2x gap is ISS-084).

## QUEUE.md

Refreshed: Open gates section corrected (2 open, not 0); top-3 replaced (ISS-085, ISS-076, T-035);
pruned 3 stale TODO rows (T-034/T-036 marked DONE, ISS-066 already fixed — removed as a live TODO,
ISS-077's O4/O8 build-row gap marked DONE via T-038/T-039); added T-039/T-040/T-041 as IN FLIGHT; added
ISS-084/ISS-085/ISS-087 as new TODO rows; updated ISS-081's note to IMPROVING. **No `GRILL:` line** — none
invented, per instruction.

## Contract maintenance

**Routine amendment applied and committed:** contract B2 gained one "Fail-safe + scope clarifications"
block (T-013 pattern + T-036 Q3/Q4/Q6/Q7/Q8), plus an amendment-log entry. **Held, untouched, correctly
left for the human:** Q1 (necessary-vs-sufficient), Q2 (country vocabulary scope), Q5 (exam scope) — all
three still gated on `qa/gates/auto-verify-surface.md`, unanswered. No criterion was softened; every edit
this sweep documents already-implemented, safety-correct behaviour.

## Terminal state: FINDINGS: 6

4 new open (ISS-084 medium, ISS-085 high, ISS-087 medium, ISS-045 reopened high) · 2 new fixed-on-arrival
(ISS-082, ISS-083, documentation folds) · 6 updates (ISS-054, ISS-056, ISS-076, ISS-081, ISS-t-037-1
escalated to high, plus the ISS-045 reopen already counted). No BLOCKED, no EXHAUSTED. Check 4b:
**DETERMINATE, no breach, instrument healthy this run** (corrected from the shards' INDETERMINATE).
