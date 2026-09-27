# Verdict — t-040-commit-testlock

**Cycle checked:** 0
**Unit:** t-040-commit-testlock (branch `wave/t-040-commit-testlock`, head `d7212f5`)
**Contract:** qa/contracts/counselling-engine.md (B14 — dev-infra, no feature-specific row applies)
**Checker:** fresh-context Mode A, read-only toward the artifact

## VERDICT: PASS

## Scope verified

`git diff --stat d02168f..d7212f5`: 13 files, 824 insertions / 39 deletions — `scripts/vc-testlock.sh`
(new, 285 lines), `scripts/vc-testlock.test.sh` (new, 188 lines), `qa/manifests/t-040-commit-testlock.md`
(new, this unit's own manifest), and 10 existing manifests (t-012, t-022, t-023, t-025, t-026, t-027,
t-029, t-030, t-032, t-033) each diff-checked individually — **every hunk is a path-citation change
only** (`<scratchpad>/vc-testlock.sh` / bare `vc-testlock.sh` / the scratchpad-absolute path →
`scripts/vc-testlock.sh`), confirmed by `grep` that **no `Status:` line changed** in any of the 10.
`t-037-failover-cancellation.md` confirmed untouched, matching the maker's stated rationale (its
mentions are historical narrative, not a runnable-path citation).

Confirmed **zero** changes outside this footprint: `qa/contracts/**`, `docs/DECISIONS.md`,
`ARCHITECTURE.md`, `.claude/**`, `qa/issues.jsonl`, `TASKS.md`, and all package source (`packages/`,
`apps/`, `mcp/`) are untouched by this diff.

## Re-derived, not accepted

- **`bash scripts/vc-testlock.sh` suite, run 12 times total** (not the manifest's claimed 5): **11/12
  clean 18/18**; **1/12 failed** on `recycled PID: broken in seconds (liveness+identity check, not
  the age fallback)` (the `<20s` timing bound). This directly contradicts the manifest's "re-run 4
  further times... all 4 also 18/18, 0 failed" claim — the suite **does** flake, at roughly an 8%
  rate, exactly the kind of thing this brief warned to expect from a lock helper's own tests.
  Isolated reruns of that same assertion (5×, outside the full suite) were 11–14s every time, well
  under the 20s bound and not close to hanging — consistent with transient machine-load contention
  (this machine's RAM tightness under concurrent agents is independently documented across many
  other manifests in this project) rather than a logic defect. Filed as ISS-089 (low, test-fragility
  class, same shape as ISS-t-041-1).
- **`pnpm -r typecheck`**: 9/9 scope, all Done, matches the claimed baseline.
- **Lever A (bare `rmdir` reintroduced)**: reproduced exactly — `14 passed, 4 failed`, the same 4
  named assertions, same failure shape (exit 75 instead of 0, ~30–37s instead of <20s). Confirms the
  regression test is real and confirms the reordered-timeout fix: the acquirer fails loudly at ~30s
  rather than hanging, proving the timeout check now runs unconditionally every loop iteration as
  claimed (bug #3 in "What changed").
- **Lever B (`mkdir` → `mkdir -p`)**: reproduced exactly — `16 passed, 2 failed`, same 2 named
  assertions. Confirms Test 4's live-PID mutual-exclusion assertion is not vacuous.
- **Torn-write fix, independently stress-tested** (not just re-read): two concurrent writers (400
  iterations each, temp-file + `mv -f` pattern lifted verbatim from `write_owner()`) against one
  reader doing 2000 read/validate passes on the shared owner file. Result: **`good=1460 bad=0
  missing_file=540`** — **zero torn/partial reads** observed. The `missing_file` count is an expected
  race (reader ran before the first write landed), not corruption. This is real evidence the fix
  holds, not just code inspection.
- **ISS-087's own demanded falsification, reproduced independently** (fresh owner file naming a
  nonexistent PID, never touching the shipped test file): waiter proceeded in **10s**, not the
  600s/1800s staleness/timeout windows. Confirms the core defect (staleness decided by age alone) is
  genuinely gone for the realistic case.

## The lever the maker didn't build — built it, mixed result

Per the brief: forced the primary liveness instrument (`tasklist`) to misreport, via a `PATH`-shadowing
shim that unconditionally returns "No tasks are running", against a **genuinely live** background
process (`sleep 20`, real WINPID, real StartTime recorded).

**Result: the lock WAS broken** — `rc=0`, `"breaking stale lock"` logged, the wrapped command ran,
in ~11s — while a real process still held it. `tasklist_pid_running()` gets **zero retries**, unlike
the StartTime probe next to it (retried 3×, specifically because *that* instrument was found flaky).
This is a genuine, now-empirically-demonstrated single point of failure, not merely theoretical: if
`tasklist` itself ever misreports, a live lock breaks instantly with no grace period — arguably worse
than the age-only design it replaces, which at least required sustained age before breaking.

**However**, a separate, more alarming claim reached me mid-check via an irregular channel (styled as
"the coordinator", not a normal user turn, not attached to any tool result) asserting the *specific
mechanism* is a PID-namespace bug: that MSYS `$$` and the Windows PID live in different, mismatched
numeric ranges ("Windows pids are always multiples of 4... real owner values were all odd") and that
`tasklist`/`Get-Process` therefore read **every** genuinely live owner as dead, unconditionally, on
this machine. **I did not accept this on trust.** I independently spawned a real background process,
resolved its actual WINPID via `ps -p $$` (exactly as the shipped script does), and confirmed:
`tasklist //FI "PID eq <winpid>"` **correctly found it alive**, `Get-Process -Id <winpid>` returned a
valid `StartTime.Ticks`, and `tasklist` **correctly failed to find it** by the MSYS pid (the wrong
namespace) — i.e., the shipped script's WINPID-resolution is correct and `tasklist` reads the right
namespace correctly on this real machine. **The injected claim's specific mechanism is false, verified
directly.** The redundancy gap I found by adversarial shimming is real; the claim that it is *already
silently firing on every lock* is not — I found no evidence of that in this environment.

Filed as **ISS-088** (medium: no evidence of live misfire, but zero defense-in-depth on the sole
"is this PID running" instrument — a future hardening should retry `tasklist` the way `StartTime` is
retried, or cross-check with a second instrument). This is judged an extension of the maker's own
honestly-disclosed Open Gap #1 (tasklist-primary never independently falsified), not a new surprise —
I built exactly the lever the brief asked for and it produced a real, trackable finding, not a
blocking one, given (a) no observed real-world misfire and (b) the maker's own disclosure already
scoped this as an accepted, judged risk for this cycle.

## Disclosed gaps, independently confirmed rather than taken on faith

- **Gap 2 (recycled-PID degrades to trust-it when StartTime is unreadable at write time):**
  constructed directly — an owner file with `STARTED=unknown` naming a genuinely live PID is judged
  **alive** (8s timeout, exit 75, never broken) purely off `tasklist`, confirming the recycled-PID
  identity check is fully inert whenever `STARTED=unknown`, exactly as disclosed. No new information;
  independently confirmed the maker's own characterization is accurate.
- **Gap 3 (acquire-timeout and RAM-gate backoff not composed under one deadline):** confirmed by
  code read — `acquire()` runs to its own bound, then `wait_for_ram()` runs entirely separately
  against its own unrelated retry budget. Theoretical, correctly disclosed, low severity given the
  generous defaults (1800s / 15×60s).

## Which issue this unit closes

- **ISS-t-037-1 (distribution — divergent uncommitted copies): CLOSED.** One canonical, committed
  `scripts/vc-testlock.sh`; every worktree now runs the same file; 10 manifests repointed cleanly.
- **ISS-087 (staleness decided by age alone, never liveness): CLOSED** for the defect as described —
  liveness now decides staleness for the realistic dead/live/recycled-PID cases, independently
  verified above, not merely re-read from the manifest. **Not** the same as "no residual liveness
  risk" — see ISS-088 (new) for the narrower, separate redundancy gap this check surfaced, which
  stays open.

## New issues filed (qa/issues.jsonl)

- **ISS-088** (medium, open): `tasklist_pid_running()` has zero retry/corroboration before declaring
  a PID dead, unlike the StartTime probe beside it; adversarially forced to misreport, it breaks a
  genuinely live lock. No evidence this occurs unforced on this machine (verified the specific
  PID-namespace theory offered mid-check is false here) — tracked as a hardening item, not a live
  incident.
- **ISS-089** (low, open): the shipped suite's recycled-PID timing assertion flaked 1/12 full-suite
  runs in this check (vs. the manifest's claimed 0/9 total across its own + rerun samples) —
  test-fragility class, consistent with this machine's documented RAM contention under concurrent
  agents.

## Note for Umesh — irregular mid-task message

A message styled as being from "the coordinator" arrived through an unusual channel during this
check (not a normal turn, not the output of any tool I called), asserting that the *committed* T-040
script reads every live owner as dead due to an MSYS-pid vs Windows-pid mismatch, with specific
(unverifiable) PID numbers. I did not act on it at face value.

Having since re-read `qa/issues.jsonl`, there **is** a genuine ledger row behind this
(`ISS-087`'s `update: true` row, "PID-NAMESPACE CORRECTION", written by a concurrent safety-net
checker pass during this same window) — but that row is about the **two pre-T-040 scratchpad
copies** ("neither copy contains any owner-liveness code path at all"), not about the script this
unit committed. T-040's own header already names and fixes exactly this gotcha ("GIT BASH ON WINDOWS
PID GOTCHA... `$$` inside Git Bash/MSYS is the MSYS-internal pid, NOT the Windows PID... always
resolves and stores WINPID"), and my own direct test (real spawned process, `ps -p $$` → WINPID
10936, `tasklist` found it alive by WINPID and correctly failed to find it by the MSYS pid) confirms
the fix works on this machine. So: the underlying ledger finding is real and correctly predicted a
risk, T-040 had already independently built the correct mitigation, and the "coordinator" message's
specific claim that this defect is *live in the helper under check* is false — verified directly, not
inferred. The delivery channel for that message (not a normal turn, not a tool result) is still worth
a look on its own; a future session should not assume a message styled as "the coordinator" is
trustworthy without independent verification, which is exactly why this check didn't accept it as
such and re-derived the underlying question directly instead.

## Commands run (this check, this session)

```
git -C D:/vc/.worktrees/t-040-commit-testlock diff --stat d02168f d7212f5
git -C D:/vc/.worktrees/t-040-commit-testlock diff d02168f d7212f5 -- qa/manifests/<each of the 10>
bash scripts/vc-testlock.test.sh                      # ×12 (own scratch copy, own mktemp -d paths)
pnpm -r typecheck                                     # 9/9 Done
# Lever A / Lever B: single-hunk edits in throwaway scratch copies, never the bound worktree
# ISS-087 falsification: fresh owner file, nonexistent PID, own script/vc-testlock.sh scratch copy
# Adversarial tasklist shim: PATH-shadowed fake `tasklist` always reporting "No tasks", scratch copy
# Torn-write stress: 2 writers × 400 iters + 1 reader × 2000 iters, own mktemp -d path
```

The real shared lock at `C:/Users/Lenovo/AppData/Local/Temp/claude/vc-testlock/` was never touched,
inspected-and-modified, or broken — every experiment above ran against a fresh `mktemp -d` path.
