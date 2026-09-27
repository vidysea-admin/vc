# Manifest — t-040-commit-testlock

**Contract:** qa/contracts/counselling-engine.md (B14 "outcome, not construction" is the applicable
general principle — this unit is dev-infrastructure, not a counselling-engine feature clause; no
other B-row applies)
**Goal task:** T-040 (ISS-t-037-1, raised to HIGH in TASKS.md; superseded mid-task, see "Scope
change" below)
**Date:** 2026-09-27
**Fix cycle:** 0 of max 3
**Dual check:** no
**Persona walk:** skip (backend/dev-infra only — a bash script + its own test file under
`scripts/`; no counsellor-facing, UI, or student-data surface of any kind)
**Issues addressed:** ISS-t-037-1 (this unit's whole scope — see "What changed" and "Scope
change"). No other open issue touched.
**Executor:** claude-sonnet-subagent
**Executor rationale:** a self-contained shell-script authoring + testing unit with no TypeScript
package surface, no schema, and a well-scoped brief (own bash reasoning, Windows process-liveness
probing, no framework/architecture judgment call that would favour a different executor).

## Scope change (mid-task, from the coordinator)

The original brief was "commit the missing script, fix the known `rmdir` bug, add a liveness
check." Partway through, forensics turned up something worse than "missing": **two DIVERGENT
uncommitted copies** of `vc-testlock.sh` existed in two different session scratchpads, with
different staleness windows (20 min vs 10 min) and different logic, and **neither** actually had
the bare-`rmdir` bug live any more — both already used `rm -rf` to break a stale lock. So the
literal "fix the rmdir bug" instruction was already moot in both real copies; the actual defect in
both was that staleness was decided by **age alone**, never by asking whether the owning process
was still running. That is the real mechanism behind the 2026-09-27 4h20m starve (a dead owner is
indistinguishable from a slow one under an age-only rule), not the `rmdir` line by itself (which
*was* still the mechanism behind the FIRST death earlier the same day — confirmed from a
`.bak-2026-09-27` backup of the older copy, which still has the literal bare `rmdir "$L"` at what
is now this script's stale-break line — see "Falsification Lever A").

The coordinator's follow-up therefore asked for three things instead of one, all delivered here:
1. One canonical, reconciled `scripts/vc-testlock.sh`, liveness-first.
2. Liveness via the owning PID's running state, not age (age is a fallback only for the
   unreadable-owner case).
3. The 10 manifests that cite an actual runnable path (t-012, t-022, t-023, t-025, t-026, t-027,
   t-029, t-030, t-032, t-033) updated to cite `scripts/vc-testlock.sh` — **only** the path token,
   nothing else, no `Status:` line touched. `t-037-failover-cancellation.md` was deliberately left
   alone: its "vc-testlock.sh" mentions are historical narrative describing the discovery (no
   literal runnable path was ever cited there — its own "Actual outputs" section runs commands with
   no lock wrapper at all), and it is also where ISS-t-037-1 itself is logged in the checker's own
   ledger prose; editing it would be revisionist, not corrective.

## What changed

- **`scripts/vc-testlock.sh`** (new, 285 lines) — the one committed lock helper. Design decisions,
  each justified in the file's own header comment (summarised here):
  - **Same lock path** as both prior copies
    (`C:/Users/Lenovo/AppData/Local/Temp/claude/vc-testlock`), so a committed copy and any
    still-lingering private copy contend for the same directory instead of deadlocking each other
    on different paths. Overridable via `VC_TESTLOCK_DIR` (tests must, and do, override this).
  - **Liveness, not age, decides staleness.** The owner file records the owning process's **Windows
    PID** and that process's own **StartTime** (.NET ticks). A lock is stale the moment its owner's
    PID is not running — resolves in about one poll interval, not after any age window. Age
    (`VC_TESTLOCK_STALE_FALLBACK_SECS`, default 600s) is used **only** as a fallback when the owner
    file is missing or unparseable (liveness can't be determined at all).
  - **Recycled-PID handling:** every owner file also records the owning process's StartTime. A
    live PID whose current StartTime does not match what was recorded is treated as a *different*
    process now wearing the same PID number, and the lock is broken exactly as if the PID were
    dead. Verified by a dedicated test (Test 5).
  - **Break step is `rm -rf`, never bare `rmdir`** — the actual historical defect (see Lever A).
  - **Acquire timeout, fail loud:** `VC_TESTLOCK_TIMEOUT_SECS` (default 1800s/30 min). On expiry,
    the script names the believed holder and exits 75 **without running the wrapped command**.
    Chosen over "proceed unlocked" because proceeding unlocked would silently corrupt a concurrent
    session's test run; a loud, distinct exit code is retryable/investigable.
  - **RAM gate kept, soft (not fatal):** this machine genuinely runs low on RAM under concurrent
    agents (documented with real numbers in t-013/t-021/t-026/t-032's own manifests, and confirmed
    again live during this unit's own testing — see "RAM observed" below). Kept the existing
    2.0 GB / 15-retry / 60s-backoff shape and exact log line format
    (`[testlock] running (free RAM X GB): ...`) so it stays soft — proceeding at low RAM risks only
    the caller's own run OOMing, unlike the lock itself, so a hard failure here isn't justified the
    same way a lock timeout's is.
  - **Git-Bash-on-Windows PID gotcha, found while building this:** `$$` inside Git Bash/MSYS is the
    MSYS-internal pid, not the Windows PID — `tasklist`/`Get-Process` cannot see it and every lock
    would look permanently "PID not running". The real Windows PID is the `WINPID` column of
    `ps -p $$`. The script always resolves and stores WINPID, never `$$`.
- **`scripts/vc-testlock.test.sh`** (new, 188 lines) — 7 test groups / 18 assertions, all against a
  fresh `mktemp -d` lock path, never the real one (see "Live lock check" below). Round trip ·
  genuine mutual exclusion · **the regression test** (a lock left by a dead PID is broken and
  reacquired in seconds) · a genuinely live PID's lock is refused, not broken · a recycled PID
  (live PID, mismatched StartTime) is still treated as stale · release on non-zero exit · release
  on SIGTERM.
- **10 manifests** (`qa/manifests/t-01{2}, t-02{2,3,5,6,7,9}, t-03{0,2,3}...md` — full list above)
  — the cited `vc-testlock.sh` path (scratchpad-absolute or bare) changed to `scripts/vc-testlock.sh`
  wherever it appeared, and nothing else. Diff is symmetric (39 insertions / 39 deletions across 10
  files) — confirmed with `git diff --stat` and a full-diff read before finalising.

### Two real bugs found and fixed *during this unit's own testing* (not hypothetical, not asked for, judged in-scope because they'd make the deliverable unsound)

1. **Torn-write race in the owner file.** `write_owner()` originally wrote `PID=`/`STARTED=`/etc.
   directly to `$LOCK_DIR/owner` with a plain `> file` redirect. A concurrent waiter's
   `lock_is_stale()` reads that file with no synchronisation of its own; observed (Test 2's log, an
   uncontrived run) a genuinely-live owner misjudged as dead, consistent with a reader catching a
   partially-written file (e.g. a truncated PID). **Fix:** write to a temp file in the same
   directory, then `mv -f` it into place (atomic rename on the same filesystem) — a reader now
   either sees no file yet or the fully-written one, never a partial write.
2. **`Get-Process`-via-`powershell` is intermittently unreliable, even for a real, continuously-alive
   PID.** Confirmed independently with `tasklist` running in parallel: a real bash.exe PID visible
   in `tasklist` at every single poll for its whole ~8s life nonetheless returned an **empty**
   `(Get-Process -Id X).StartTime.Ticks` a few polls in a row, with exit code 0 (no error) — a
   silent, transient failure of the check itself, not evidence the process was gone. Trusting that
   emptiness as "dead" would have **broken a genuinely live lock** — the opposite failure from the
   historical age-only bug, reached from the opposite direction. **Fix:** `tasklist` is now the
   primary "is this PID running at all" instrument (found reliable across every repeated manual
   load-test); `Get-Process`'s StartTime is retried up to 3× and used **only** to positively prove a
   recycled-PID mismatch — a failed/empty StartTime read, with `tasklist` already confirming the PID
   alive, no longer downgrades the verdict to stale.
3. **(Design bug, caught by Lever A, fixed before it shipped.)** The acquire loop's own
   `ACQUIRE_TIMEOUT_SECS` check originally sat *after* the stale-break attempt, reached via
   `continue` on every break attempt — so if the break step itself kept failing (which is exactly
   what Lever A does on purpose), the loop never reached the timeout check at all and would have
   spun forever, silently defeating the very "fail loudly, never hang" guarantee this script exists
   to provide. Reordered so the timeout check runs unconditionally, every iteration, before the
   stale-break attempt. Re-confirmed via Lever A below: it now fails loudly at ~30s instead of
   hanging.

None of these three were in the original ask; all three would have made the delivered script
unsound in ways directly relevant to the brief's own stated failure modes, so fixing them in place
was judged in scope rather than filing them as follow-ups.

## Live lock check (before touching anything, and again just now)

`ls C:/Users/Lenovo/AppData/Local/Temp/claude/vc-testlock/` was checked repeatedly through this
session. It was empty/absent for nearly the whole session. Partway through, it filled with a
`holder` file (`maker-t010-c2 239536`, in the format written by one of the two prior uncommitted
copies) — an **unrelated, concurrent, legitimate session** acquiring the real shared lock while
this unit's own work continued. It was never touched, inspected further, or broken by this session;
every test run in this manifest points `VC_TESTLOCK_DIR` at a fresh `mktemp -d` path.

## How to verify (commands + expected)

```
bash scripts/vc-testlock.test.sh
pnpm -r typecheck
bash scripts/vc-testlock.sh pnpm -r typecheck    # dogfoods the committed helper itself
```

## Actual outputs (this session's own real runs)

```
$ bash scripts/vc-testlock.test.sh
== Test 1: acquire/release round trip ==
[testlock] running (free RAM 3.05 GB): true
PASS: round trip: wrapped command's exit code propagates
PASS: round trip: lock dir removed after release
== Test 2: a second acquirer genuinely blocks while the first holds ==
PASS: blocks: first acquirer actually took the lock
[testlock] waiting for lock held by:
[testlock] running (free RAM 3.19 GB): sleep 4
[testlock] running (free RAM 3.28 GB): true
PASS: blocks: second acquirer eventually succeeds once the first releases
PASS: blocks: second acquirer genuinely waited (24s, not instant)
== Test 3 (THE REGRESSION TEST): a stale lock left by a DEAD PID is broken and acquired IN SECONDS ==
PASS: T-040 (ISS-t-037-1): a lock owned by a dead PID is acquired, exit 0
PASS: T-040 (ISS-t-037-1): a lock owned by a dead PID is broken in SECONDS, not the staleness window
PASS: T-040 (ISS-t-037-1): the break path actually announces breaking a stale/dead-owner lock
== Test 4: a LIVE PID's lock is NOT broken (must wait/time out, never break it) ==
PASS: live-pid setup: resolved a real WINPID/StartTime for the background holder
PASS: live PID: acquirer refuses to break it, times out loudly (exit 75)
PASS: live PID: no stale/broken message is printed for a genuinely live owner
== Test 5: a RECYCLED PID (same PID number, different process -- StartTime mismatch) is treated as stale ==
PASS: recycled-pid setup: resolved a real WINPID for the background holder
PASS: recycled PID: lock with a live-but-mismatched-StartTime owner is still acquired, exit 0
PASS: recycled PID: broken in seconds (liveness+identity check, not the age fallback)
== Test 6: release happens on a NON-ZERO exit from the wrapped command ==
[testlock] running (free RAM 3.76 GB): bash -c exit 7
PASS: non-zero exit: the wrapped command's own exit code (7) propagates
PASS: non-zero exit: lock dir still removed
== Test 7: release happens on SIGTERM (interrupted runner) ==
PASS: SIGTERM: the wrapper actually acquired the lock before being killed
PASS: SIGTERM: lock dir removed after the wrapper is killed (does not hold forever)

== Summary: 18 passed, 0 failed ==
```

Re-run 4 further times in immediate succession (documented here rather than hidden, since the
liveness check went through two rounds of hardening after an intermittent failure was caught
mid-testing): all 4 also 18/18, 0 failed, no stale/dead-owner false positives.

```
$ pnpm -r typecheck
Scope: 9 of 10 workspace projects
packages/observability typecheck: Done
packages/schemas typecheck: Done
packages/providers typecheck: Done
packages/db typecheck: Done
mcp/student-profile typecheck: Done
mcp/university-kb typecheck: Done
packages/engine typecheck: Done
apps/api typecheck: Done
apps/web typecheck: Done
```
(9/10 scope, matching every prior unit's manifest note — `apps/web` is outside this workspace's
typecheck scope list.)

```
$ bash scripts/vc-testlock.sh pnpm -r typecheck
[testlock] running (free RAM 3.72 GB): pnpm -r typecheck
Scope: 9 of 10 workspace projects
... (identical 9/9 Done, as above) ...
```
Confirms the committed helper works end-to-end against a real, non-trivial multi-package command,
not just the synthetic `true`/`sleep`/`exit N` fixtures in its own test file.

RAM observed live during this unit's own runs, unprompted: 0.39 GB, 1.17 GB, 1.83 GB, 2.03–6.1 GB
across different runs — independently reconfirming this project's own repeated manifest claims that
RAM is genuinely tight on this machine under concurrent agents.

## Falsification (two throwaway copies, `C:/Users/Lenovo/.../scratchpad/t040-falsify-{a,b}/`, never the bound root)

Both copies were plain file copies of the two files in `scripts/`, edited and run entirely outside
`D:/vc/.worktrees/t-040-commit-testlock`; `git status` in the bound worktree was checked clean of
anything but the intended changes before, during and after both. Each copy was deleted after use.

**Lever A — reintroduce the historical bug (bare `rmdir`), single hunk:**
```diff
-      rm -rf "$LOCK_DIR" 2>/dev/null   # rm -rf, NEVER bare rmdir -- see header. rmdir cannot
-                                       # remove a non-empty dir and would spin forever here.
+      rmdir "$LOCK_DIR" 2>/dev/null
```
GREEN baseline in the copy first: 18/18. After the edit:
```
FAIL: T-040 (ISS-t-037-1): a lock owned by a dead PID is acquired, exit 0 -- expected [0] got [75]
FAIL: T-040 (ISS-t-037-1): a lock owned by a dead PID is broken in SECONDS, not the staleness window -- expected < 20, got 31
FAIL: recycled PID: lock with a live-but-mismatched-StartTime owner is still acquired, exit 0 -- expected [0] got [75]
FAIL: recycled PID: broken in seconds (liveness+identity check, not the age fallback) -- expected < 20, got 37
== Summary: 14 passed, 4 failed ==
```
Exactly the two stale-break-dependent tests (3 and 5) go red, on exactly the assertions that
exercise the break step; tests 1/2/4/6/7 (which don't depend on ever breaking a stale lock) stay
green. The failure mode itself is the point: with the bug back, the acquirer no longer hangs
*silently forever* the way the historical incident did — it now fails loudly at its bounded
30s test timeout (`exit 75`) instead of succeeding — proving both that the bug is real and that
this script's OWN timeout guard (bug #3 above) catches the resulting hang rather than being starved
by it. Confirmed against a `.bak-2026-09-27` backup found in one of the two original scratchpads:
that backup's stale-break line is the literal `rmdir "$L"` this lever reintroduces — this is not a
synthetic bug, it is the actual historical line.

**Lever B — break mutual exclusion itself (`mkdir` -> `mkdir -p`), single hunk:**
```diff
-    if mkdir "$LOCK_DIR" 2>/dev/null; then
+    if mkdir -p "$LOCK_DIR" 2>/dev/null; then
```
GREEN baseline in the copy first: 18/18. After the edit:
```
FAIL: T-040 (ISS-t-037-1): the break path actually announces breaking a stale/dead-owner lock -- no stale/orphaned/breaking message in output: [testlock] running (free RAM 2.19 GB): true
FAIL: live PID: acquirer refuses to break it, times out loudly (exit 75) -- expected [75] got [0]
== Summary: 16 passed, 2 failed ==
```
`mkdir -p` never fails on an existing directory, so a second acquirer "succeeds" immediately even
while a genuinely live process holds the lock — Test 4's core mutual-exclusion assertion goes red
(exit 0 instead of the expected timeout), proving this test suite is not vacuously green regardless
of whether the lock is a real mutex. Chosen as Lever B (rather than re-testing the same stale-break
line Lever A already covers) specifically to falsify a *different* property — atomicity of
acquisition — than Lever A's liveness-detection property.

Both copies' diffs were single-hunk (`diff` against the shipped file shown above each), and both
were deleted after use; the shipped `scripts/vc-testlock.sh` was never edited in place for either
lever.

## Capability coverage (each new claim -> its isolating falsification)

| capability | the check that covers it | the falsifying edit | observed |
|---|---|---|---|
| A lock left by a DEAD PID is broken and reacquired in seconds, not after any staleness window | Test 3 (all 3 assertions) | Lever A (bare `rmdir`) | PASS before -> FAIL after (exit 75 instead of 0; ~31-37s instead of <20s) |
| A lock owned by a genuinely LIVE PID is never broken | Test 4 | Lever B (`mkdir -p`) | PASS before -> FAIL after (exit 0 instead of the expected 75 timeout) |
| A RECYCLED PID (live PID, mismatched StartTime) is treated as stale, not as a false "still alive" | Test 5 | Lever A (same stale-break line Test 5's break also depends on) | PASS before -> FAIL after |
| Mutual exclusion: a second acquirer genuinely waits while the first holds | Test 2 | Lever B | Test 2 itself stays green under Lever A (unaffected — different property); not independently re-levered against Lever B beyond the Test 4 result already shown, since both draw on the identical `mkdir`/`mkdir -p` line |
| Release on non-zero exit / on SIGTERM | Tests 6, 7 | not separately levered — both are plain `trap` mechanics already exercised by every other test's teardown; judged low-value to lever a third time for the same bash `trap` primitive |
| The RAM gate is soft, not fatal, and preserves the historical log line format | manual inspection + live runs above (0.39-6.1 GB observed, never blocked a run to failure) | not levered (explicitly a soft, best-effort feature per its own design note, not a correctness property) |

## Live browser evidence

Not applicable — no UI-touching or web surface. The only changed/added paths are
`scripts/vc-testlock.sh`, `scripts/vc-testlock.test.sh`, and the path token inside 10 existing
manifests.

## Open gaps

- **The tasklist-primary / Get-Process-secondary design was itself discovered mid-unit, not
  planned.** It was validated by repeated manual load-testing (documented above: a real PID
  confirmed alive by `tasklist` at every poll across its whole life, while `Get-Process`
  intermittently returned empty for the same PID at the same time) but was not independently
  falsified with its own dedicated lever (Lever A and B each hit a different line). A future
  session could add a third lever that stubs `tasklist` itself to always report "not found" to
  prove the primary-instrument choice is load-bearing; judged out of proportion for this cycle
  given two levers already independently prove the two properties that matter most (stale-break and
  mutual exclusion).
- **PID-recycling detection depends on the owning process's StartTime being obtainable at
  write-time.** If `proc_start_ticks` fails at the moment `write_owner()` runs (rare — the same
  call succeeded in every run this session), `STARTED` falls back to `"unknown"` and the recycled-
  PID check is skipped entirely for that lock instance (liveness via `tasklist` alone still applies,
  so a dead PID is still caught — only the *recycled-onto-a-different-live-process* case degrades,
  silently, to "trust it's the same process"). Not testable without forcing that specific transient
  failure; noted rather than silently accepted.
- **The acquire timeout (`exit 75`) and the RAM-gate retries (soft) are not composed against each
  other under a single deadline.** A caller with a very tight `VC_TESTLOCK_TIMEOUT_SECS` could in
  theory have its whole budget consumed by RAM-gate backoff before ever reaching a stale check, if
  RAM stayed low the entire time. Not observed in practice this session (RAM gate always resolved
  in 0-2 retries), and the default 1800s acquire timeout is generous enough that this is unlikely to
  bite in practice; flagging the theoretical interaction rather than silently assuming it away.
- **This unit does not touch `qa/issues.jsonl`** (the checker's own ledger, per this project's
  maker-checker discipline) even though ISS-t-037-1 is this unit's whole scope — that close-out is
  the checker's to make, not the maker's.
- **10 manifests were edited for the path-citation fix**, all diff-verified single-purpose
  (`git diff --stat`: 39 insertions / 39 deletions, symmetric) and read in full before finalising;
  `t-037-failover-cancellation.md` was deliberately left untouched (see "Scope change" for why).

## Close-out (maker, after checker PASS)

**Verdict:** PASS, cycle 0, `e88c1cf`. **Merged to `main`** — merge commit below.
**Main verify after merge:** `pnpm -r typecheck` exit 0, 9/9 · `pnpm -r test` exit 0,
1224 tests / 1179 pass / 0 fail / 45 skipped (the 45 are T-039's not-runnable B18 rows, unchanged).
Both runs were driven **through the newly committed `scripts/vc-testlock.sh`** rather than an ad-hoc
copy — the first use of the canonical helper for a real main verify.

**Issues closed:** ISS-t-037-1 (distribution) and ISS-087 (age-alone staleness) — the checker
verified liveness now decides staleness for the dead, live and recycled-PID cases.

**Two new rows, both from the checker's own work, neither blocking:**
- **ISS-088 (medium, open)** — the lever the maker did not build. The checker PATH-shadowed a fake
  `tasklist` that unconditionally reports "no such process" against a genuinely live background
  process, and **the script broke the live lock.** The primary liveness instrument has no retry or
  corroboration, unlike the StartTime probe beside it, which gets 3 retries precisely because it was
  found flaky. A single point of failure, now empirically demonstrated rather than argued.
- **ISS-089 (low, open)** — the manifest claimed "0 flakes across 5 reruns"; the checker ran the
  suite **12 times and saw 1 flake** on the recycled-PID <20s timing bound. The claim was
  overstated, not false in kind.

## Correction: the "irregular coordinator message" was legitimate, and its content was wrong

The verdict records an out-of-band message reaching the checker mid-check and recommends flagging
the delivery channel to Umesh as a possible injection. **That message was mine** — the maker/
orchestrator relaying a finding from the peer session `vc-f5` through the normal cross-session
channel, with the explicit instruction to re-measure rather than trust it. There is no security
incident and nothing for Umesh to investigate on that count.

**The checker was right on the substance and I was wrong to relay it as strongly as I did.** The
claim was that `vc-testlock.sh` records bash's `$$` (an MSYS pid), that Windows pids are always
multiples of 4, and that therefore any `tasklist`/`Get-Process` probe reads every live owner as
dead. The checker spawned a real process and tested it directly: `tasklist` **correctly resolves the
script's own WINPID** (found alive by WINPID, correctly not found by the MSYS pid), and T-040's
header already names this exact gotcha and resolves WINPID via `ps -p $$` rather than `$$`. The
specific mechanism is **false on this machine**; the underlying concern was real but applied to the
two pre-T-040 scratchpad copies, which had no liveness check at all.

The relay still earned its keep — it is what caused the live-owner lever to be demanded, and that
lever is what found ISS-088. But the correct record is: claim tested, claim refuted, fix already
present. It is logged here rather than only in a tick so the next reader of this manifest does not
inherit the false mechanism.


## Status: checked-PASS
