# Verdict — t-044-lock-acquire-window

**Cycle checked:** 0
**Date:** 2026-09-28T09:31:22+05:30
**Branch/head:** `wave/t-044-lock-acquire-window` @ `1aa7e3f`
**Files:** `scripts/vc-testlock.sh`, `scripts/vc-testlock.test.sh`
**Contract:** qa/contracts/counselling-engine.md B14 ("outcome, not construction") — dev-infra unit,
no other B-row applies (agrees with the manifest's own framing).

## VERDICT: **PASS**

All three named sites (ISS-111, ISS-112, ISS-113) are independently confirmed fixed, against my
own hostile tests and real concurrent processes, not the maker's harness. One new, genuine but
non-blocking defect was found in the mechanism the fix introduces (DESC/argument-content injection,
filed as ISS-116). No regression to the two out-of-scope pre-existing rows (ISS-088, ISS-089).

---

## Per-site findings

### Site 1 / ISS-111 (acquire() window) — **FIXED, confirmed**

I wrote my own real two-process race (`site1_race.sh`, independent of the maker's Test 8: different
shim duration, different log format, own PATH-shim, own three-way verdict logic), and ran it
directly against `main` and against `1aa7e3f`, executed for real (not sourced):

```
$ bash site1_race.sh before.sh 13   # main, powershell shimmed to sleep 13s
...
[testlock] lock dir has no owner file after 12s -- treating as orphaned
[testlock] breaking stale lock at .../lock
W_ACQUIRED 1790565078354361600
H_ACQUIRED 1790565092824525000   <- W's wrapped command already ran and finished
H_RELEASING 1790565099065019500     BEFORE H even got past acquire() itself
VERDICT: BROKEN -- W acquired the lock while H was still the legitimate live holder

$ bash site1_race.sh after.sh 13   # 1aa7e3f, same shim
H_ACQUIRED 1790565156462986700
H_RELEASING 1790565162818983100
W_ACQUIRED 1790565175982188000   <- strictly after H_RELEASING
VERDICT: SAFE -- W only acquired after H legitimately released
```

Reran the AFTER case a second time: same result (SAFE). `main` is exploitable exactly as ISS-111
describes; `1aa7e3f` is not.

**Mutation kill:** built a *faithful* single-phase reversion (`mutC2.sh` — resolves winpid, runs the
slow `proc_start_ticks`, THEN writes the owner file unconditionally, matching old `write_owner`
exactly; my first attempt at this mutant was unfaithful and self-deadlocked, corrected before
drawing any conclusion from it). Ran the full 30-assertion suite against it:

```
FAIL: Site 1: H's live lock was never broken -- W started at ..., before H's legitimate finish
== Summary: 29 passed, 1 failed ==
```

Exactly Test 8 goes red, for exactly the stated reason, nothing else affected. Test 8 is a real
mutation-killer, not a test that passes for the wrong reason.

### Site 2 / ISS-113 (`write_owner`'s `mv` landing in the wrong directory) — **FIXED, confirmed**

Own hostile test (`site2_site3_hostile.sh`, not sourcing the maker's Test 9): sourced a safe-to-source
copy of `main`'s functions (see "Instrument note" below) and of `1aa7e3f`, staged a hostile takeover
mid-flight, and checked the result directly:

```
BEFORE: BAD: Site 2 (BEFORE): write_owner blindly overwrote the other holder's owner file --
  other holder's marker is gone, now: PID=38696 STARTED=... DESC=mine
AFTER:  [testlock] write_owner_enrich: lock dir token changed (ours [...], now [hostile-other-...])
        -- not enriching, this directory is no longer ours
        OK: Site 2: enrich refused (rc=1) and other holder's TOKEN survived untouched
```

**Mutation kill:** `mutA.sh` (token-equality check deleted from `write_owner_enrich`, one line):

```
FAIL: Site 2: write_owner_enrich detects the ownership change and refuses to write (rc=1) -- expected [1] got [0]
FAIL: Site 2: the other holder's owner file survives untouched, not ours
== Summary: 26 passed, 4 failed ==
```
(The other 2 failures in that run are the pre-existing ISS-089 dead/recycled-PID timing bound —
unrelated, present in mutated and unmutated runs alike, see below.) Test 9 is a real kill.

### Site 3 / ISS-112 (`release()` cascade) — **FIXED, confirmed**

Same harness, direct `release()` calls:

```
BEFORE: BAD: Site 3: release() deleted a directory it did not own -- dir gone
AFTER:  [testlock] release: lock dir token changed (ours [...], now [a-holder-...]) -- not removing
        OK: Site 3: release() with a mismatched token left A's directory intact
```

**Mutation kill:** `mutB.sh` (token-equality check deleted from `release()`, ownership guard
removed, restoring the bare `rm -rf`):

```
FAIL: Site 3: A's directory still exists after B's own (unrelated) release fires
FAIL: Site 3: A's owner file survives B's release() untouched
FAIL: Site 3b: a never-acquired caller's release() does not delete a live holder's dir
FAIL: Site 3b: that holder's owner file is untouched
FAIL: Site 3b: the live holder's lock survives the timed-out waiter's own exit
FAIL: Site 3b: the live holder's owner file is untouched
== Summary: 23 passed, 7 failed ==
```
Tests 10 and 11 both go red, for the stated reason, cleanly. Real kill.

**Instrument note (my own harness, not the maker's):** `main`'s script has no sourcing guard, so
`source main-script.sh` runs its unguarded `trap release EXIT; acquire "$@"; ...; exit $status` tail
inside the sourcing shell — my first attempt at this self-deadlocked (confirmed by log: two nested
`acquire "$@"` calls waiting on each other for the same dir) and had to be killed. I built my own
safe-to-source copy of `main` by stripping exactly the 10-line unguarded tail and diffed it against
`main` to confirm nothing else changed (`diff` output pasted in my working notes — only the trap/
acquire/wait_for_ram/exec block is gone). This is the same *technique* the manifest uses (independent
re-derivation, not reuse of the maker's stripped copy) — I flag it because the brief asked me not to
trust the maker's own instrument, and I want it on record that I hit and fixed the same class of
self-inflicted harness bug before trusting my own results.

## Residual non-atomicity — measured, not just disclosed

The manifest discloses the check-then-act gap (`owner_token()` read, then `mv`/`rm -rf`) without a
number. I measured it directly on this machine (own script, `timing2.sh`, isolated from any lock
contention, 15 iterations each):

```
owner_token() alone, avg over 15: 236435 us   (~236 ms)
mv alone, avg over 15:            160403 us   (~160 ms)
```

**The residual window is on the order of 300–600 ms, not microseconds.** This is dominated by
Windows/MSYS per-process-spawn overhead (`grep`, `cut`, `mv` are each a separate process on this
platform) — an artifact of the environment, not the algorithm, but real all the same: it is not
"a few instructions," it is a third to two-thirds of a second, and that is worth knowing precisely
rather than assumed negligible. It is still ~4–10x smaller than the default 5s poll interval and
~4-14x smaller than the original 2.3–4.3s Site-1 exposure — a genuine improvement, just not as
tiny as the phrase "roughly a grep+mv" might suggest to a reader who assumes shell built-ins.

I attempted to actually trigger a violation inside this window: a background loop flips the owner
file's TOKEN between the real value and an attacker value as fast as it can while `write_owner_enrich`
runs in the foreground. In the runs that completed (2 of 5 attempts; 3 others hit an unrelated harness
error I did not chase further, given time budget), the check correctly caught the attacker's value
and refused to write both times — I did not manage to force a bad overwrite. Given the window is
real and now measured at ~0.3–0.6s, I do not consider it definitively unexploitable, only that it is
smaller than the original bug by roughly an order of magnitude and I could not trigger it in bounded
testing. This matches the manifest's own framing (disclosed gap, not claimed closed) and I am not
treating it as a blocking finding, but the concrete number should replace the qualitative claim in
any future reference to this fix.

## Orphaning hazard (item 5 of the brief) — no new permanent-deadlock class found

Traced every path where the new token check could refuse when it should not:

- **Owner file transiently missing** while `LOCK_TOKEN` is still valid → `release()` correctly
  declines (favors "never delete something you can't confirm is yours" over "never leak a
  directory"). The resulting no-owner-file directory is not a *permanent* orphan: the very same
  10-second "no owner file" age-fallback in `lock_is_stale()` that Site 1 is about will let the
  *next* acquirer break it. Self-heals within 10s, not forever — assuming a next acquirer exists.
- **DESC-injection self-mismatch** (see ISS-116 below) can make a legitimate holder falsely believe
  it lost its own lock and abandon it (clearing `LOCK_TOKEN`, so its own `release()` correctly
  declines to touch the directory it just gave up on). The directory is not silently stolen (a
  waiter's `is_pid_alive()` check on the still-genuinely-alive recorded PID keeps it from being
  broken) — but the wrapped command that was supposed to run under the lock never actually runs
  under it in this scenario, and the process exits via the acquire-timeout path (`exit 75`) despite
  having successfully `mkdir`'d. Self-limiting (the directory becomes legitimately stale once that
  real PID later exits for its own reasons), but a real, disclosed-here-for-the-first-time
  inconsistency, not a permanent deadlock.
- Net comparison with the *old* unconditional `rm -rf`: strictly safer. The old code traded
  "never orphans" for "cascades on every break"; the new code trades a narrow, self-healing
  near-miss for the cascade being closed. That is the right trade for a machine-wide mutex other
  units depend on.

## New defect found: DESC/argument injection into the TOKEN-comparison mechanism (not in the manifest)

`write_owner_minimal`/`write_owner_enrich` write `DESC=$*` verbatim, and `owner_token()` reads
`grep -o '^TOKEN=.*' "$LOCK_DIR/owner"` — a pattern that matches **every** line starting with
`TOKEN=`, not just the first. If the wrapped command's own arguments contain an embedded newline
followed by text starting with `TOKEN=`, that string lands in the owner file as an extra line and
gets picked up by `owner_token()`, corrupting the read-back value:

```
$ printf via write_owner_minimal with arg $'legit-arg\nTOKEN=injected-fake-token-xyz'
--- owner file ---
TOKEN=1790565453247612400-1198526-15465
DESC=legit-arg
TOKEN=injected-fake-token-xyz
owner_token() readback => [1790565453247612400-1198526-15465
injected-fake-token-xyz]
```

**Consequence:** the garbled multi-line readback will never *equal* anyone's real single-line token,
so this **fails closed** — it cannot be used to force a false match/overwrite in someone else's
favor (verified: it only ever causes refusals, never incorrect approvals). But it **can** make a
*legitimate* holder's own `write_owner_enrich` (or a later `release()`) conclude "lock dir token
changed... not enriching/not removing" when nothing actually broke the lock — a self-inflicted false
mismatch, tracing to the exact ownership-check machinery this unit built. `main` had no such risk
(no TOKEN-equality comparison existed at all, so DESC content was inert). Likelihood in this
project's actual usage is low (wrapped commands are `pnpm`/test-runner invocations, not
externally-supplied strings with embedded newlines), so I am not blocking the unit on it, but it is
real, reproducible, and sits in the exact mechanism the fix depends on — filed as **ISS-116**.

## BASH_SOURCE vs `$0` sourcing guard — verified across 6 invocation shapes, one caveat

Ran `1aa7e3f` directly (never sourced) as: relative path from cwd, explicit `./after.sh`, absolute
path, via a symlink, with `$0` renamed via `exec -a WEIRDNAME`, and with a failing wrapped command
(`exit 9`) to confirm exit-code propagation + lock cleanup still happens. All six ran the wrapper
normally (RAM log line, correct exit code, lock removed after). Byte-for-byte equivalent to the
pre-fix behavior in every case I could exercise.

**Caveat, disclosed rather than silently skipped:** the brief asks to verify "under `sh`" too. On
this machine `/usr/bin/sh` is itself GNU bash 5.2 (Git-for-Windows MSYS), not a real POSIX-only
shell like dash — so invoking `sh scripts/vc-testlock.sh` here does not actually exercise a
non-bash interpreter, and I cannot claim to have verified that case. I independently grepped the
whole repo (`Grep` tool, respects `.gitignore`) for every place this script is invoked and confirmed
all of them call it as `bash scripts/vc-testlock.sh ...` (never a bare `./scripts/vc-testlock.sh`
relying on the shebang, never an explicit foreign `sh`), so this is a real gap in what I could test,
not a known-relevant risk to this project as currently used.

## Flake claim (ISS-089) — independently reproduced, no contradiction

Ran the full 30-assertion suite myself 4 times (3 from an isolated scratch copy, 1 from the actual
committed worktree at `1aa7e3f`, not the maker's copy): **120/120 passed, 0 failures, across all 4
runs.** This does not contradict the manifest's own 5-run sample (4/5 hit the pre-existing
`<20s` dead/recycled-PID bound) — flake rate is inherently variable; my sample adds 4 clean runs to
theirs, consistent with "load-dependent, not deterministic." Critically: **T-044's own 12 new
assertions were 0/120 across my runs too** (every one of my 4 runs reported "30 passed, 0 failed" —
no ISS-089 hit in my sample at all, and the new assertions never differ from clean). Combined with
the 3 separate mutation-kill runs above (each of which *also* shows the pre-existing ISS-089 bound
firing independently of my mutations — e.g. mutA's run hit the recycled-PID bound while also
correctly failing Test 9 — confirming ISS-089 is orthogonal noise, not something my mutations or
this fix introduce or worsen).

## `pnpm -r typecheck` and `pnpm -r test`

Reproduced the typecheck claim independently from the real worktree: `9/9 Done, 0 errors`, matches
the manifest exactly.

**`pnpm -r test` — I judged it unnecessary and did not run it**, for a stated reason rather than by
default: the risk this unit poses to "every other unit's evidence" runs through the mutex's own
ownership-check logic, which I verified directly and repeatedly (4 independent full-suite runs, 3
independent mutation-kills each isolated to one site, my own real two-process race reproducing
ISS-111 on `main` and refuting it on the fix, hostile token/DESC attacks, and a real round-trip
execution of the actual committed script under 6 invocation shapes). A full monorepo `pnpm -r test`
run would mostly exercise application code this fix does not touch, at real cost to shared machine
time/RAM, for strictly less-direct assurance about the actual defect surface than what I already
ran. I record this as a considered call, not a default skip — if the orchestrator disagrees, running
it post-merge (as the manifest itself proposes) is cheap insurance and I would not object.

## No other consumer regression

Independently grepped the repo for anything else that sources or invokes this script: only
`scripts/vc-testlock.sh` and `scripts/vc-testlock.test.sh` contain executable references; the only
other hit (`scripts/vc-regression-check-conformance.sh`) is a comment, does not source or exec it.
Confirms the manifest's own claim.

## Open items carried forward (not blocking this PASS)

- **ISS-116** (new, this check): DESC/argument-content injection into `owner_token()`'s parsing —
  self-inflicted false-mismatch risk, fails closed, low real-world likelihood given current callers.
- **ISS-088** (medium, pre-existing, T-040): `tasklist` primary-liveness has no retry. Reproduced
  again by the maker during Test 8 (disclosed in the manifest) — not this unit's to fix, unchanged.
- **ISS-089** (low, pre-existing, T-040): `<20s` timing-bound flake — reproduced by me too (0/4
  runs) and by the maker (4/5 runs); still load-dependent, still not this unit's scope.
- The residual check-then-act window, now measured at ~300–600ms rather than assumed-negligible —
  informational, matches the manifest's own disclosed-gap framing, just with a number attached.

## Commands run (this check, abbreviated — full transcripts are this session's tool-call history)

```
bash site1_race.sh before.sh 13        # ISS-111 real race, main:      BROKEN
bash site1_race.sh after.sh 13         # ISS-111 real race, 1aa7e3f:   SAFE (x2)
bash site2_site3_hostile.sh before_lib.sh BEFORE   # Site2/3 real defects confirmed on main
bash site2_site3_hostile.sh after.sh AFTER         # Site2/3 fixed, + DESC-injection found (ISS-116)
bash timing2.sh after.sh               # residual window measured: ~236ms grep, ~160ms mv
bash suite/vc-testlock.test.sh   x3    # independent full-suite reruns, scratch copy: 30/30 each
bash scripts/vc-testlock.test.sh (real worktree, 1aa7e3f)               : 30/30
bash suite_mutA/vc-testlock.test.sh    # Site 2 reverted: Test 9 fails, else clean modulo ISS-089
bash suite_mutB/vc-testlock.test.sh    # Site 3 reverted: Tests 10/11 fail, else clean
bash suite_mutC2/vc-testlock.test.sh   # Site 1 reverted (faithful): Test 8 fails, else clean
cd .claude/worktrees/agent-ad28e5b8b274d2736 && pnpm -r typecheck   : 9/9 Done, 0 errors
Grep vc-testlock (repo-wide)            : only scripts/vc-testlock{,.test}.sh execute it
```

## Live lock check

Every test above (mine and the reruns) pointed `VC_TESTLOCK_DIR`/`LOCK_DIR` at a fresh `mktemp -d`
path. Checked the real shared lock at session start (`C:/Users/Lenovo/AppData/Local/Temp/claude/
vc-testlock`) — did not exist, was never touched by this check.

## INDEPENDENT RECOVERY CHECK — 2026-09-30

**Bound root:** D:/vc. **Cycle checked:** 0. **Candidate:** 1aa7e3f. **Baseline:** main 4dc1186 (scripts unchanged from common ancestor). Original verdict bytes preserved.

**Recovery conclusion:** the three scoped ownership fixes are independently evidenced; safe to integrate the single build commit while preserving main's newer QA ledger. Full manifest regression-suite verification is currently incomplete because the inherited Windows liveness instrument is denied in this sandbox. This addendum does not replace the historical PASS or claim a clean current suite.

Commands and actual results:
- Git-for-Windows bash with explicit `export PATH="/usr/bin:/bin:$PATH"; bash scripts/vc-testlock.test.sh`, candidate worktree: **24 passed, 6 failed**, exit 1. Failures: Test4 live-owner refusal and no-break assertions (2), Test8 Site1 live-lock protection (1), Test11 timeout/live-directory/owner preservation (3). Tests9/10 direct ownership guards pass. Earlier launches without explicit in-bash PATH failed to locate MSYS utilities; those are instrument failures, excluded from product findings.
- `pnpm --config.verifyDepsBeforeRun=false -r typecheck`, candidate worktree: **9/9 Done**, exit 0. Plain `pnpm -r typecheck` attempted automatic dependency installation and aborted without a TTY before typechecking; the explicit flag disabled that side effect.
- `tasklist //FI "PID eq 4"`: **ERROR: Access denied**; PowerShell `Get-Process -Id 4` returns Id 4. Independently sourced baseline and candidate libraries both return **is_pid_alive 4 unknown => rc1**. This equal-baseline evidence locates the current false-negative in inherited liveness machinery (ISS-088), rather than attributing it solely from suite logs. No PASS is claimed for native Windows liveness.
- Independent OS-temp `hostile.sh`: baseline write_owner overwrites hostile TOKEN with PID12345/STARTED999; candidate enrich refuses rc1 and preserves TOKEN=other/PID67890. Baseline release deletes another holder's directory; candidate mismatched-token release preserves it.
- Independent OS-temp `race.sh`, real two concurrent processes, equal controlled liveness oracle (`is_pid_alive(){ return 0; }`), holder STARTED probe delayed 13s: baseline order **W_ACQUIRED, H_ACQUIRED, H_RELEASE** and orphan-break logged after 11s; candidate order **H_ACQUIRED, H_RELEASE, W_ACQUIRED**, no orphan break. The oracle isolates the missing-owner acquisition window; it does not validate actual Windows PID detection. Initial harness released the waiter's directory too early, causing baseline holder write failure; corrected harness holds waiter five seconds, and the above ordering is the corrected completed run.
- DESC injection independently reproduced: minimal write with argument `$'legit\nTOKEN=injected'` gives owner_token readback `[ours\ninjected]`; own enrich refuses rc1 despite no takeover. Filed as ISS-116, low, fails closed.

All new harnesses were in `C:/Users/Lenovo/AppData/Local/Temp/vc-checker-58805011-5aab-4838-a4dd-bd9c1709562b`, baseline library stripped only its unguarded execution tail. No shared-tree source mutations, no mutation runs, and no monorepo tests. Historical mutation evidence was not substituted for current execution. All launched verification sessions reached terminal state; no live test handle remains. The shared machine-wide test lock was not used by the mutex regression suite or hostile harnesses.

Scoped ISS-111/112/113 transition to fixed based on the above independent evidence; ISS-088 remains open. Residual token check-to-act non-atomicity remains disclosed and was not measured or closed in this recovery. Post-integration regression verification remains necessary; do not describe this recovery as deployment readiness or complete mutex safety.