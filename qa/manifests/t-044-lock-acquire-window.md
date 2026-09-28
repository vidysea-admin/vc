# Manifest — t-044-lock-acquire-window

**Contract:** qa/contracts/counselling-engine.md (B14 "outcome, not construction" is the applicable
general principle — this unit is dev-infrastructure, not a counselling-engine feature clause; no
other B-row applies)
**Goal task:** T-044 (ISS-111, high; widened mid-task to three sites of one root cause — see
"Scope change" below)
**Date:** 2026-09-28
**Fix cycle:** 0 of max 3
**Dual check:** no
**Persona walk:** skip (backend/dev-infra only — a bash script + its own test file under
`scripts/`; no counsellor-facing, UI, or student-data surface of any kind)
**Issues addressed:** ISS-111 (this unit's whole scope). Related-but-not-addressed: ISS-110 (RAM
gate bypass by a hand-rolled lock — informational note only, not touched, see "Open gaps"); ISS-088
(tasklist-primary-liveness-instrument-has-no-retry — an anomaly consistent with this, observed
during this unit's own testing, is disclosed honestly below but not fixed, per the hard scope
constraint).
**Executor:** claude-sonnet-subagent
**Executor rationale:** a self-contained shell-script authoring + testing unit, same file and same
liveness/staleness machinery T-040 already built; no framework/architecture judgment call that
would favour a different executor.

## Scope change (mid-task, from the coordinator)

The original brief was Site 1 only: `acquire()`'s `mkdir` succeeds, then `write_owner()` (with its
slow `proc_start_ticks` PowerShell shell-out, measured 2.3-4.3s) runs before any owner file exists —
a window `lock_is_stale()`'s 10s "no owner file" orphan rule can misjudge as abandoned.

Partway through, the coordinator widened this to **three sites of the same root cause**: an
operation assumes the lock directory it resolved earlier ($LOCK_DIR, a path re-resolved at every
use) is still the one it owns, with nothing binding a holder to the specific directory instance it
created.
- **Site 1** (as above) — the acquire window.
- **Site 2** — `write_owner`'s final `mv -f "$tmp" "$LOCK_DIR/owner"` had no check of what
  currently sits at that path. If a slow enrich's directory was broken and re-mkdir'd by another
  acquirer while the slow PowerShell call was still in flight, the `mv` still landed in the NEW
  owner's directory, silently overwriting their PID/STARTED with the old holder's.
- **Site 3** — `release()` was a bare, unconditional `rm -rf "$LOCK_DIR"` under `trap release EXIT`,
  with no ownership check at all. Any break cascaded: A breaks B and acquires; B's own (even
  on-time, legitimate) exit then deletes A's live lock; C acquires while A is still running. Every
  break converted into at least two concurrent holders, and the cascade outlived the condition that
  caused the first break.

The suggested mechanism (a per-acquisition opaque **token**, written into the owner file and held
in a shell variable, checked by the enrich step and by `release()` before they act) is what's built
here; no deviation from the suggested shape was needed.

Two figure corrections carried over from the coordinator's note (informational, do not change the
fix): headroom is closer to ~3x than 2.3x (`POLL_SECS`=5s default, `self_winpid` 136-530ms,
`proc_start_ticks` 2051-2732ms measured this session); the RAM gate (`wait_for_ram`) is soft/
advisory by design (returns after `RAM_RETRIES` and runs anyway) — not a defect, not touched.

## What changed

**`scripts/vc-testlock.sh`** — same file, edited in place (no new file, no `_v2`):

- **`gen_token()`** (new) — `date +%s%N-$$-$RANDOM`, a short opaque value unique to one specific
  acquisition (mkdir), never a Windows PID, never fed to `tasklist`/`Get-Process`.
- **`owner_token()`** (new) — reads the `TOKEN=` field of the *current* owner file.
- **`write_owner()` split into two** (Site 1 + Site 2 fix):
  - **`write_owner_minimal(token, ...)`** — writes `PID` (via `self_winpid`, no PowerShell) +
    `STARTED=unknown` + `ACQUIRED_AT` + `TOKEN` + `DESC`, via the existing atomic
    temp-file-then-`mv -f` pattern (T-040's torn-read fix, reused as-is). Runs immediately after
    `mkdir` succeeds — closes Site 1: the no-owner-file window shrinks from "however long
    `proc_start_ticks` takes" (2.3-4.3s) to sub-millisecond.
  - **`write_owner_enrich(token, ...)`** — calls `proc_start_ticks` (the slow call), then **checks
    `owner_token()` still equals `token` before writing**; on a mismatch it logs and returns 1
    without touching the file — closes Site 2: a slow enrich can no longer silently overwrite a
    directory that changed hands.
- **`acquire()`** — generates a token per mkdir success, sets `LOCK_TOKEN`, calls
  `write_owner_minimal` then `write_owner_enrich`; if enrich reports it lost the directory,
  `LOCK_TOKEN` is cleared and the loop retries (treated exactly like any other contended
  acquisition) instead of returning as if it still held the lock.
- **`release()` rewritten** (Site 3 fix) — no longer an unconditional `rm -rf`. Returns immediately
  if `LOCK_TOKEN` is unset (this process never actually finished acquiring — e.g. it hit
  `ACQUIRE_TIMEOUT_SECS` and `exit 75`'d while someone else legitimately held the lock). Otherwise
  compares `owner_token()` to `LOCK_TOKEN`; only removes the directory on a match; a mismatch logs
  and returns without touching it.
- **Sourcing guard added** (`if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then ... fi` around the
  `trap`/`acquire`/`wait_for_ram`/exec tail) — when executed directly, behavior is byte-for-byte the
  same as before (traps set, `acquire "$@"` runs, wrapped command runs, exit code propagates); when
  **sourced**, only the function/variable definitions load and nothing runs automatically. This is
  what lets `vc-testlock.test.sh` call `write_owner_minimal` / `write_owner_enrich` / `release` /
  `gen_token` directly and deterministically, instead of only ever exercising them through a real,
  sub-second, hard-to-win race window. Verified no other script in this repo sources this file
  directly (all other callers invoke it via `bash scripts/vc-testlock.sh <cmd>`), so this is safe.
- Header comment extended with a "T-044 (ISS-111)" section naming all three sites and the token
  mechanism, in the file's existing documentation style (see the file itself for the full text).

**Incidental fix, not asked for, judged in-scope because it directly follows from the Site 3 fix and
would otherwise leave the deliverable unsound:** the *old* `release()`'s unconditional `rm -rf` also
fired when `acquire()` itself timed out (`exit 75`) while someone else legitimately held the lock —
so a waiter that gave up waiting would delete the ACTIVE HOLDER's directory it had been waiting for.
This is a second, direct manifestation of the same missing-ownership-check defect Site 3 names. The
new `release()`'s `LOCK_TOKEN` unset-check fixes this too, for free, and is covered by a dedicated
test (Test 11 / "Site 3b" below).

**`scripts/vc-testlock.test.sh`** — same file, extended in place: 18 pre-existing assertions
untouched in substance (Test 7's synchronization point updated, see "Errors found and fixed" below),
plus 4 new test blocks (Tests 8-11, 12 new assertions) covering Sites 1, 2, 3 and 3b.

- **Test 8 (Site 1)** — a real end-to-end race: H acquires with PATH-shimmed `powershell` (an
  injected fake binary that sleeps N seconds then `exec`s the real one) forced to a deterministic
  18s cold-start, comfortably past the 10s orphan threshold plus a full poll interval; W (unshimmed,
  default `POLL_SECS`/orphan threshold — the real production values) tries to acquire concurrently.
  Asserts W never starts its own wrapped command before H's legitimately finishes (three-way check:
  W timed out without ever breaking in / W started only after H's legitimate finish / W broke a
  live lock — only the third is a failure).
- **Test 9 (Site 2)** and **Test 10 (Site 3)** — deterministic, via the sourcing guard: source the
  script as a library and call `write_owner_minimal` / `write_owner_enrich` / `release` directly
  against hand-crafted owner-file state (a manually-written "other holder" TOKEN), rather than
  trying to win a real, sub-second race. See "Errors found and fixed" for why the real-race versions
  of these two were abandoned.
- **Test 11 (Site 3b)** — real end-to-end: a genuinely alive background holder (`sleep 20`) plus a
  short-timeout waiter; asserts the waiter's own timeout-exit (`75`) does not delete the live
  holder's directory or owner file.

## Errors found and fixed during this unit's own test-authoring (disclosed, not hidden)

1. **Test 7** (pre-existing, SIGTERM/release) — its old synchronization point,
   `[ -d "$LOCK" ]` (directory exists), stopped being sufficient once `release()` became
   ownership-aware: a SIGTERM landing between `mkdir` and `write_owner_minimal` finishing (the
   latter needs `self_winpid`, 136-530ms) leaves `LOCK_TOKEN` unset, so the new `release()` correctly
   declines to delete a directory it never finished claiming — but the test's old assertion expected
   unconditional deletion regardless. **Fixed** by changing the sync point to
   `grep -q '^PID=' "$LOCK/owner"` (wait for the minimal write to actually land, not just for the
   directory to exist). Re-run repeatedly, confirmed stable.
2. **Test 8, first draft** — asserted `W_START_NS -ge H_END_NS` unconditionally; under real load W
   sometimes timed out entirely (never acquired at all), leaving `W_START_NS` empty, which the
   original check treated as a failure even though "W never broke the lock" is itself the property
   holding. **Fixed** with the three-way check described above (W-never-started is a pass, not a
   missing data point), and the waiter's own timeout raised to a generous 90s so the test measures
   "never breaks a live lock," not "wins the race within an arbitrary window."
3. **Test 9 and Test 10, first drafts** — both were written as real end-to-end races (a shimmed-slow
   second process for Test 9; a real backgrounded acquirer plus an external "takeover" injection for
   Test 10). Both were unreliable in ways traced to actual log output, not guessed at:
   - Test 9's real-race version intermittently showed H's *own* token/PID surviving instead of the
     externally-staged "other holder"'s — consistent with H's own acquire-retry loop (the very Site-1
     fix) noticing the injected mismatch and re-acquiring before the test's sampling point could
     observe the intended state.
   - Test 10's real-race version was **confirmed broken** by direct log evidence: its sync point
     (`grep -q '^PID=' "$LOCK/owner"`, i.e. "the minimal write has landed") was reached while B's own
     real enrich phase could still be in flight; injecting a fake dead PID (999997) as "A" at that
     point let B's own `write_owner_enrich` detect the mismatch itself, correctly judge the fake PID
     stale via the ordinary `lock_is_stale()` path, and legitimately re-break/re-acquire A's
     directory *before* the test's own assertions ran — an entirely different scenario from the one
     intended, confirmed via the actual log lines (`write_owner_enrich: lock dir token changed ...`,
     `acquire: lost the lock immediately after taking it -- retrying`, `owner PID 999997 is not
     running ... lock is stale`, `breaking stale lock...`).
   Both were **replaced** with deterministic, sourced-function versions (source the script as a
   library, call `write_owner_minimal`/`write_owner_enrich`/`release` directly against hand-crafted
   state) that carry no dependency on winning a real race at all. This is a stronger, not weaker,
   test of the actual defect: it isolates the ownership-check logic itself from timing noise.

## How to verify (commands + expected)

```
bash scripts/vc-testlock.test.sh        # 30 assertions now (18 pre-existing + 12 new)
pnpm -r typecheck                       # 9/9 Done, 0 errors
```
`pnpm -r test` intentionally **not run** by this unit (per the brief — it needs the shared lock
being modified; the orchestrator runs it on `main` after merge).

## Actual outputs — regression test, BEFORE vs AFTER, all three sites (real runs, this session)

Built a safe-to-source "before" harness: `git show main:scripts/vc-testlock.sh` (the pre-T-044,
285-line committed script) with only its unguarded auto-executing tail (the old bare
`trap release EXIT; acquire "$@"; ...`) stripped off — the function/variable definitions are
byte-identical to what ships on `main` right now. Each check below ran in its own fresh `bash`
subprocess (old lib or new script sourced, never both in the same shell) so there is no possibility
of function/variable pollution between the before- and after- cases.

```
############################################
## SITE 1 -- acquire(): window between mkdir succeeding and an owner file existing at all
############################################
--- BEFORE (old script) ---
CONFIRMED: immediately after old-code mkdir succeeds, NO owner file exists yet.
  lock_is_stale() age-fallback path (no owner file) currently reads: age > 10 => orphaned.
  write_owner's own proc_start_ticks call alone measures 2050-4257ms; under load this
  routinely pushes the no-owner-file window past 10s wall-clock while the true holder is
  still legitimately inside write_owner -- at that point old lock_is_stale() WOULD misjudge
  a live, in-progress acquisition as orphaned and let a waiter break it (ISS-111 exactly).
FAIL: BEFORE: a legitimately-being-acquired lock is never misjudged stale -- old code has no
  minimal-write step, so the no-owner-file window is bounded only by write_owner's full (slow)
  runtime, not eliminated
--- AFTER (new/fixed script) ---
PASS: AFTER: an owner file (PID+ACQUIRED_AT+TOKEN) exists IMMEDIATELY after mkdir --
  write_owner_minimal needs no PowerShell shell-out, so the no-owner-file window is closed to
  sub-millisecond, not bounded by a 2-4s shell-out

############################################
## SITE 2 -- write_owner's slow enrich phase: does it blindly overwrite a directory
##          that changed hands while it was shelling out to PowerShell?
############################################
--- BEFORE (old script) ---
FAIL: BEFORE: the other holder's owner file survives a concurrent write_owner call -- old
  write_owner() has NO ownership check at all: it unconditionally mv'd its own PID/STARTED over
  the other holder's PID=999995 owner file. This is Site 2 exactly.
  (owner file now reads:)
    PID=48900
    STARTED=639261797564832518
    ACQUIRED_AT=1790563165
    DESC=mine
--- AFTER (new/fixed script) ---
[testlock] write_owner_enrich: lock dir token changed (ours [...], now [site2-other-holder-...])
  -- not enriching, this directory is no longer ours
PASS: AFTER: write_owner_enrich detects the token mismatch (dir changed hands), returns rc=1, and
  leaves the other holder's owner file untouched (TOKEN still [site2-other-holder-...])

############################################
## SITE 3 -- release(): does the EXIT trap delete a lock directory regardless of who
##          currently owns it (the break-cascade defect)?
############################################
--- BEFORE (old script) ---
FAIL: BEFORE: a live holder's lock directory survives an unrelated process's release() -- old
  release() is an unconditional 'rm -rf "$LOCK_DIR"' with no ownership check. It deleted A's live,
  currently-held directory outright -- the break-cascade root cause: whichever process's EXIT trap
  fires last wins, deleting whatever directory currently sits at $LOCK_DIR, whether or not it is
  still that process's own lock.
--- AFTER (new/fixed script) ---
[testlock] release: lock dir token changed (ours [...], now [a-holder-token-...]) -- not removing,
  it is no longer ours
PASS: AFTER: release() checks LOCK_TOKEN against the dir's current TOKEN, sees a mismatch, and
  refuses to delete -- A's directory and owner file (TOKEN=a-holder-token-...) survive B's
  release() call untouched
```

All three sites: **FAIL against unmodified `main` code, PASS against the fix**, for exactly the
mechanism ISS-111 (and its Site 2/3 widening) named.

## Actual outputs — full suite, 5 runs (true flake ratio, not a single clean run)

```
Run 1: 30 passed, 0 failed
Run 2: 29 passed, 1 failed  -- Test 3 ("a lock owned by a dead PID is broken in SECONDS")
Run 3: 28 passed, 2 failed  -- Test 3 + Test 5 ("recycled PID: broken in seconds")
Run 4: 28 passed, 2 failed  -- Test 3 + Test 5
Run 5: 28 passed, 2 failed  -- Test 3 + Test 5
```

**Every single failure across all 5 runs is Test 3 and/or Test 5's pre-existing `<20s` timing
bound** (the ISS-089 flake this project's own checker already found and logged against T-040, unrelated
to this unit's scope) — never one of the 12 new T-044 assertions (Tests 8-11), which passed **60/60**
across all 5 runs. The machine was visibly under heavy, fluctuating load throughout this session's
testing (free RAM observed between 0.53 GB and 2.2 GB across runs; the dead-PID/recycled-PID break
that's normally well under 20s measured 20s, 22s, 25s, 26s and 35s in the runs that failed, and a
plain "second acquirer waits" test that's normally ~24-31s measured 51s in run 5) — consistent with
ISS-089 being a load-sensitive timing bound, not something this unit's change touches or worsens.

**Run-level flake rate:** 4 of 5 runs (80%) hit the pre-existing ISS-089 bound at least once.
**Assertion-level flake rate, ISS-089's own two assertions only:** Test 3's bound failed in 4/5 runs,
Test 5's bound failed in 3/5 runs. **T-044's own 12 assertions: 0/60 flaked (0%).**

**One anomaly observed and disclosed, not fixed:** in run 5's Test 8 (Site 1, the real shimmed-race
check), an intermediate log line appeared — `owner PID <H's winpid> is not running (or was recycled
onto a different process) -- lock is stale` / `breaking stale lock` — during the window while H was
still genuinely alive and blocked inside its (deliberately, 18s-shimmed) `proc_start_ticks` call.
The test's own final assertion still passed (W's wrapped command only started after H's legitimately
finished), so the property under test held, but the intermediate message suggests `tasklist` itself
returned a transient false negative for a genuinely alive PID under the heavy load observed
throughout this run. This is **not a Site 1/2/3 defect** — it is the primary-liveness-instrument
reliability question the checker already opened as **ISS-088** against T-040 ("the primary liveness
instrument has no retry or corroboration, unlike the StartTime probe beside it"). Recorded here
because it surfaced during this unit's own testing; not investigated further or fixed, per the hard
scope constraint ("do not widen further than these three sites").

```
$ pnpm -r typecheck
Scope: 9 of 10 workspace projects
packages/schemas typecheck: Done
packages/observability typecheck: Done
packages/db typecheck: Done
packages/providers typecheck: Done
mcp/university-kb typecheck: Done
mcp/student-profile typecheck: Done
packages/engine typecheck: Done
apps/api typecheck: Done
apps/web typecheck: Done
EXIT=0
```
(`node_modules` was missing in this worktree at the start of this unit — `pnpm install` was run
once, a dev-environment setup step, not a production write, before typecheck could run at all.)

## Live lock check

Every test run and every before/after check in this manifest points `VC_TESTLOCK_DIR` (or
`LOCK_DIR` directly, for the sourced-library checks) at a fresh `mktemp -d` path. The real shared
lock at `C:/Users/Lenovo/AppData/Local/Temp/claude/vc-testlock` was never touched, inspected, or
broken by this session.

## Capability coverage (each new claim -> its isolating falsification)

| capability | the check that covers it | before (unmodified `main`) | after (this fix) |
|---|---|---|---|
| Site 1: no window where the dir exists with no owner file for multiple seconds | Test 8 (real shimmed race) + before/after harness | FAIL (window bounded only by `proc_start_ticks`'s 2-4s) | PASS (window closed to sub-ms via `write_owner_minimal`) |
| Site 2: a slow enrich never overwrites a directory that changed hands | Test 9 (deterministic, sourced) + before/after harness | FAIL (old `write_owner` unconditionally overwrote the other holder's owner file) | PASS (`write_owner_enrich` detects the token mismatch, refuses to write, rc=1) |
| Site 3: `release()` never deletes a directory it does not currently own | Test 10 (deterministic, sourced) + before/after harness | FAIL (old `release()` was an unconditional `rm -rf`, deleted a live holder's directory) | PASS (token check refuses the delete) |
| Site 3b: a never-acquired caller's timeout-exit does not delete a live holder's lock | Test 11 (real end-to-end, genuinely alive background holder) | not separately before/after'd (this is the incidentally-found second manifestation of Site 3, same fix) | PASS, all 5 runs |
| The pre-existing 18 assertions (round trip, mutual exclusion, dead-PID break, live-PID refusal, recycled-PID break, non-zero exit, SIGTERM) still hold | full suite, 5 runs | n/a (unchanged behavior claim) | 18/18 modulo the pre-existing, disclosed ISS-089 timing flake (unrelated to this unit) |

## Live browser evidence

Not applicable — no UI-touching or web surface. The only changed paths are
`scripts/vc-testlock.sh` and `scripts/vc-testlock.test.sh`.

## Open gaps

- **The check-then-`mv` in `write_owner_enrich`, and the check-then-`rm -rf` in `release()`, are not
  perfectly atomic.** A break landing in the few instructions between the `owner_token()` read and
  the write/delete that follows it is still possible in principle. This shrinks each of the
  multi-second windows Sites 2 and 3 originally had down to roughly a `grep`+`mv` (or `grep`+`rm`),
  not zero. Disclosed rather than claimed away; a lock-free compare-and-swap primitive isn't
  available to a bash/mkdir-based mutex on this filesystem, so closing this fully would need a
  different mechanism entirely (out of scope — "do not widen further than these three sites").
- **The run-5 Test 8 anomaly** (a transient "PID not running" verdict for a genuinely alive process
  under heavy load) is disclosed above. It reproduces the concern already logged as **ISS-088**
  against T-040 (the `tasklist` primary-liveness-instrument has no retry, unlike the StartTime probe
  beside it) rather than a new defect from this unit's token mechanism. Not investigated further or
  fixed here — hardening `tasklist_pid_running`/`is_pid_alive` itself is a different unit's scope.
- **ISS-089 (the pre-existing `<20s` timing-bound flake in Tests 3 and 5) reproduced at an elevated
  rate this session** (4/5 runs vs. the checker's earlier-measured ~8%) — consistent with, not
  contradicting, that finding: the machine was visibly under heavier load throughout this session's
  testing than typical (free RAM as low as 0.53 GB observed). Not this unit's to fix; reported
  honestly rather than re-running until a clean sample was found.
- **The two figure corrections from the coordinator's note** (headroom ~3x not 2.3x; the RAM gate is
  advisory by design) are recorded here as informational, per the coordinator's own framing — no
  code change was made or needed for either.
- **This unit does not touch `qa/issues.jsonl`** (the checker's own ledger) even though ISS-111 is
  this unit's whole scope — that close-out is the checker's to make, not the maker's.
- **`pnpm -r test` was intentionally not run** by this unit, per the brief (it needs the shared lock
  being modified; the orchestrator runs it on `main` after merge).

## Status: ready-for-check
**Fix cycle:** 0 of max 3
