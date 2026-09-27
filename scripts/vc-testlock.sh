#!/usr/bin/env bash
# vc-testlock.sh -- machine-wide test/typecheck mutex for D:/vc maker/checker agents.
#
# WHY THIS EXISTS (T-040 / ISS-t-037-1):
#   11 committed manifests (t-012..t-037) cite a shared lock at this path/name, but until this
#   commit the script itself lived only in per-session scratchpads -- and forensics found TWO
#   divergent uncommitted copies, so which logic a given verify run actually executed depended on
#   whose scratchpad happened to be on the invoker's path. That is worse than "missing": a third of
#   this project's units had an UNREPRODUCIBLE verify environment. This is the one committed copy;
#   every worktree runs the same file, and fixes to it are inheritable by construction.
#
# Usage: bash scripts/vc-testlock.sh <command...>
#   e.g. bash scripts/vc-testlock.sh pnpm -C D:/vc/.worktrees/t-040-commit-testlock --filter @vc/engine test
#
# Lock dir: the SAME machine-wide path both prior uncommitted copies used
#   (C:/Users/Lenovo/AppData/Local/Temp/claude/vc-testlock) -- deliberately unchanged, so this
#   committed copy and any still-lingering private copy contend for the SAME directory rather than
#   deadlocking each other by locking different paths. Override with VC_TESTLOCK_DIR (tests MUST
#   override this -- never point a test at the real shared path).
#
# THE BUG THIS SCRIPT EXISTS TO NOT REPEAT (both historical deaths, 2026-09-27):
#   Both prior copies broke a "stale" lock on AGE ALONE (one at 20 min, one at 10 min), never
#   checking whether the owning process was still alive. A dead owner is therefore indistinguishable
#   from a slow one, so every waiter serves the full staleness window even when the holder is long
#   gone -- exactly the 15:52->20:05 (4h20m) starve. Separately, one copy's break step at one point
#   ran a bare `rmdir "$L"`, which can NEVER succeed while `$L` still contains the owner file the
#   script itself wrote (rmdir refuses a non-empty directory) -- so that copy's stale-break path
#   spun forever once it fired. This script fixes BOTH: liveness (not age) decides staleness, and
#   the break step is `rm -rf` (recursive), never bare `rmdir`.
#
# DESIGN DECISIONS (own calls, stated per the brief):
#   - Liveness over age: the owner file records the WINDOWS PID (see below) and that process's own
#     StartTime (as .NET ticks). A lock is stale the moment its owner's PID is not running -- this
#     resolves in roughly one poll interval (default 5s), not after any age window. Age is used only
#     as a FALLBACK when the owner file is missing/unparseable (can't determine liveness at all),
#     using VC_TESTLOCK_STALE_FALLBACK_SECS (default 600s, matching the more conservative of the two
#     prior copies) so that degraded case still eventually recovers instead of hanging forever.
#   - Recycled PID handled via StartTime comparison: Windows recycles PIDs, so "a process with this
#     PID exists" is not suffient to prove it's the SAME process that wrote the owner file. Every
#     owner file also records the owning process's StartTime; if a live process now holds that PID
#     but its StartTime no longer matches what was recorded, it is a different process wearing the
#     same PID number, and the lock is treated as stale (broken immediately, same as a dead PID).
#     `tasklist` decides PID-exists (found empirically reliable under load -- see next point);
#     `Get-Process -Id … .StartTime` is consulted ONLY to disambiguate a recycled PID, and only a
#     confirmed, non-empty MISMATCH counts -- a failed/empty StartTime read never downgrades a
#     tasklist-confirmed-alive PID to "stale" on its own (see next point for why).
#   - tasklist over Get-Process for the primary liveness question: built and load-tested this
#     script against a genuinely long-lived owner and found `powershell -Command "Get-Process -Id
#     X ... StartTime.Ticks"` intermittently returns EMPTY (exit 0, no error) for a PID that
#     `tasklist //FI "PID eq X"` and independent process inspection confirmed was alive the entire
#     time -- a flaky auxiliary check, not a real liveness signal, and dangerous here specifically
#     because trusting it would BREAK a genuinely live lock (the opposite failure from the
#     age-only bug, arrived at from the opposite direction). `tasklist` showed zero false negatives
#     across repeated manual runs against a real, continuously-alive process, so it is the primary
#     "is this PID running at all" instrument; the StartTime probe is retried a few times and, even
#     then, only ever used to positively prove a MISMATCH -- never to prove absence.
#   - GIT BASH ON WINDOWS PID GOTCHA (found while building this): `$$` inside Git Bash/MSYS is the
#     MSYS-internal PID, NOT the Windows PID -- `tasklist`/`Get-Process` cannot see it and will
#     always report it as not running, which would make every lock look permanently stale. The real
#     Windows PID is the WINPID column of `ps -p $$`. This script always resolves and stores WINPID,
#     never `$$`, in the owner file.
#   - Acquire timeout, fail loud: a bounded wait (VC_TESTLOCK_TIMEOUT_SECS, default 1800s / 30 min)
#     guards acquisition. On expiry the script prints who (it believes) still holds the lock and
#     exits nonzero WITHOUT running the wrapped command. Proceeding unlocked would silently corrupt
#     a concurrent session's test run (shared RAM budget, shared workspace scratch state elsewhere
#     in this project's history) -- a loud failure the caller can retry or investigate beats a
#     silent double-run every time.
#   - RAM gate kept (soft, not fatal): this machine runs test suites for multiple worktrees
#     concurrently and RAM is genuinely tight (documented in t-013/t-021/t-026/t-032 manifests, with
#     free RAM sometimes measured at 0.6-1.8 GB). One of the two prior copies already gated on free
#     RAM before running the wrapped command; kept here with the same default (2.0 GB) and log
#     format ("[testlock] running (free RAM X GB): ...") so historical manifests reading that exact
#     line stay meaningful. This gate is SOFT (warns and proceeds after retries) because low RAM
#     risks only the CALLER's own test run OOMing -- unlike the lock itself, proceeding here cannot
#     corrupt another session's run, so failing loudly here is not justified the same way.
#
# Release: a trap on EXIT/INT/TERM always removes the lock directory, so a crashed or killed runner
# cannot hold the lock forever (the second historical death this script exists to prevent).

set -uo pipefail

LOCK_DIR="${VC_TESTLOCK_DIR:-/c/Users/Lenovo/AppData/Local/Temp/claude/vc-testlock}"
STALE_FALLBACK_SECS="${VC_TESTLOCK_STALE_FALLBACK_SECS:-600}"
ACQUIRE_TIMEOUT_SECS="${VC_TESTLOCK_TIMEOUT_SECS:-1800}"
POLL_SECS="${VC_TESTLOCK_POLL_SECS:-5}"
MIN_FREE_GB="${VC_TESTLOCK_MIN_FREE_GB:-2.0}"
RAM_RETRIES="${VC_TESTLOCK_RAM_RETRIES:-15}"
RAM_RETRY_SLEEP_SECS="${VC_TESTLOCK_RAM_RETRY_SLEEP_SECS:-60}"

log() { echo "[testlock] $*" >&2; }

# Resolve THIS process's Windows PID (see "GIT BASH ON WINDOWS PID GOTCHA" above). $$ is the
# MSYS-internal pid and must never be used for anything Windows-side (tasklist/Get-Process).
self_winpid() {
  local out header idx
  out=$(ps -p $$ 2>/dev/null) || { echo ""; return; }
  header=$(printf '%s\n' "$out" | head -1)
  idx=$(printf '%s\n' "$header" | awk '{for(i=1;i<=NF;i++) if ($i=="WINPID") print i}')
  if [ -z "$idx" ]; then
    echo ""
    return
  fi
  printf '%s\n' "$out" | awk -v c="$idx" 'NR==2{print $c}'
}

# True (rc 0) iff `tasklist` currently lists a process with this exact Windows PID. This is the
# PRIMARY liveness instrument (see header note) -- found reliable across repeated load-tests where
# the powershell/Get-Process route intermittently was not.
tasklist_pid_running() {
  local winpid="$1" out
  [ -z "$winpid" ] && return 1
  out=$(tasklist //FI "PID eq $winpid" 2>/dev/null)
  case "$out" in *"No tasks"*) return 1 ;; esac
  printf '%s\n' "$out" | awk -v p="$winpid" '{for(i=1;i<=NF;i++) if ($i==p) f=1} END{exit !f}'
}

# .NET ticks StartTime for a given Windows PID, or empty if no such process exists (or the probe
# itself failed -- callers must not treat empty as proof of anything by itself; see is_pid_alive).
proc_start_ticks() {
  local winpid="$1"
  [ -z "$winpid" ] && { echo ""; return; }
  powershell -NoProfile -NonInteractive -Command \
    "(Get-Process -Id $winpid -ErrorAction SilentlyContinue).StartTime.Ticks" 2>/dev/null | tr -d '\r\n'
}

# True (rc 0) iff a process with $1 (Windows PID) is running AND, when $2 (a recorded StartTime in
# ticks) is given and non-"unknown", that process's current StartTime still matches it -- i.e. it
# is genuinely the SAME process, not a different process that was later handed the same PID number.
#
# tasklist decides "running at all" (the reliable instrument). The StartTime probe is retried a
# few times and used ONLY to catch a recycled PID (a successful read that explicitly differs from
# what was recorded) -- a failed/empty StartTime read, with tasklist already saying the PID is
# alive, is treated as alive too. Doing it any other way let a single flaky powershell call BREAK a
# genuinely live lock during testing (found while building this script, not hypothetical) -- the
# opposite failure from the historical age-only bug, arrived at from the opposite direction.
is_pid_alive() {
  local winpid="$1" recorded_start="${2:-}"
  [ -z "$winpid" ] && return 1
  tasklist_pid_running "$winpid" || return 1
  if [ -n "$recorded_start" ] && [ "$recorded_start" != "unknown" ]; then
    local attempt cur_start
    for attempt in 1 2 3; do
      cur_start=$(proc_start_ticks "$winpid")
      [ -n "$cur_start" ] && break
      [ "$attempt" -lt 3 ] && sleep 0.3
    done
    if [ -n "$cur_start" ] && [ "$cur_start" != "$recorded_start" ]; then
      return 1
    fi
  fi
  return 0
}

dir_age_secs() {
  local d="$1" mtime
  mtime=$(date -r "$d" +%s 2>/dev/null) || { echo ""; return; }
  echo $(( $(date +%s) - mtime ))
}

write_owner() {
  # Written to a temp file and moved into place with `mv` (atomic rename on the same filesystem)
  # rather than written directly to "$LOCK_DIR/owner" -- a concurrent waiter's lock_is_stale() reads
  # that file with no synchronisation of its own, and a direct in-place write let a reader observe a
  # torn/partial write (e.g. a truncated PID) and misjudge a genuinely live owner as dead. Found
  # while testing this script (Test 2 in vc-testlock.test.sh), not a hypothetical.
  local winpid started tmp
  winpid=$(self_winpid)
  started=$(proc_start_ticks "$winpid")
  tmp="$LOCK_DIR/.owner.tmp.$$"
  {
    echo "PID=${winpid:-unknown}"
    echo "STARTED=${started:-unknown}"
    echo "ACQUIRED_AT=$(date +%s)"
    echo "DESC=$*"
  } > "$tmp"
  mv -f "$tmp" "$LOCK_DIR/owner"
}

# True (rc 0) iff the currently-held lock at LOCK_DIR should be considered stale and broken.
# Liveness first (resolves in ~1 poll interval); age is only a fallback for the unreadable-owner
# case, per the design note above.
lock_is_stale() {
  local owner_file="$LOCK_DIR/owner"
  if [ ! -f "$owner_file" ]; then
    local age
    age=$(dir_age_secs "$LOCK_DIR")
    if [ -n "$age" ] && [ "$age" -gt 10 ]; then
      log "lock dir has no owner file after ${age}s -- treating as orphaned"
      return 0
    fi
    return 1
  fi
  local pid started
  pid=$(grep -o '^PID=.*' "$owner_file" 2>/dev/null | cut -d= -f2)
  started=$(grep -o '^STARTED=.*' "$owner_file" 2>/dev/null | cut -d= -f2)
  if [ -z "$pid" ] || [ "$pid" = "unknown" ]; then
    local acquired_at age
    acquired_at=$(grep -o '^ACQUIRED_AT=.*' "$owner_file" 2>/dev/null | cut -d= -f2)
    [ -z "$acquired_at" ] && acquired_at=0
    age=$(( $(date +%s) - acquired_at ))
    if [ "$age" -gt "$STALE_FALLBACK_SECS" ]; then
      log "owner PID unknown/unparseable and lock age ${age}s > fallback ${STALE_FALLBACK_SECS}s -- treating as stale"
      return 0
    fi
    return 1
  fi
  if is_pid_alive "$pid" "$started"; then
    return 1
  fi
  log "owner PID $pid is not running (or was recycled onto a different process) -- lock is stale"
  return 0
}

acquire() {
  local start_ts elapsed announced
  start_ts=$(date +%s)
  announced=0
  while true; do
    if mkdir "$LOCK_DIR" 2>/dev/null; then
      write_owner "$@"
      return 0
    fi

    # The timeout check MUST run unconditionally on every iteration, before the stale-break
    # attempt below, not after it. It used to sit after the stale-break block with a `continue`
    # skipping straight back to the top on every break attempt -- so if the break step itself ever
    # kept failing (rm -rf denied by a locked handle, AV scanner, permissions, whatever), the loop
    # never reached the timeout check at all and span forever, silently defeating the very
    # fail-loudly guarantee this script exists to provide. Found by testing this script's own
    # Lever A falsification (bare `rmdir` reintroduced): it did not just fail the stale-break
    # assertion, it hung the whole test run past its 30s VC_TESTLOCK_TIMEOUT_SECS, proving the
    # timeout guard itself was reachable-only, not actually unconditional.
    elapsed=$(( $(date +%s) - start_ts ))
    if [ "$elapsed" -ge "$ACQUIRE_TIMEOUT_SECS" ]; then
      log "FATAL: timed out after ${elapsed}s waiting for $LOCK_DIR (held by: $(cat "$LOCK_DIR/owner" 2>/dev/null | tr '\n' ' '))"
      log "refusing to proceed unlocked -- retry, or investigate the holder above"
      exit 75
    fi

    if lock_is_stale; then
      log "breaking stale lock at $LOCK_DIR"
      rm -rf "$LOCK_DIR" 2>/dev/null   # rm -rf, NEVER bare rmdir -- see header. rmdir cannot
                                       # remove a non-empty dir and would spin forever here.
      continue   # retry mkdir right away; the timeout check above still runs next iteration either way
    fi

    if [ "$announced" -eq 0 ]; then
      log "waiting for lock held by: $(cat "$LOCK_DIR/owner" 2>/dev/null | tr '\n' ' ')"
      announced=1
    fi
    sleep "$POLL_SECS"
  done
}

release() {
  rm -rf "$LOCK_DIR" 2>/dev/null || true
}

wait_for_ram() {
  local i free
  for i in $(seq 1 "$RAM_RETRIES"); do
    free=$(powershell -NoProfile -NonInteractive -Command \
      "[math]::Round((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory/1MB,2)" 2>/dev/null | tr -d '\r')
    [ -z "$free" ] && break   # can't measure -- don't block on it
    if awk -v f="$free" 'BEGIN{exit !(f>=ENVIRON["MIN_FREE_GB"])}' MIN_FREE_GB="$MIN_FREE_GB" 2>/dev/null; then
      echo "$free"
      return 0
    fi
    log "free RAM ${free} GB < ${MIN_FREE_GB} GB, waiting ${RAM_RETRY_SLEEP_SECS}s ($i/$RAM_RETRIES)"
    sleep "$RAM_RETRY_SLEEP_SECS"
  done
  echo "${free:-unknown}"
  return 0
}

trap release EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

acquire "$@"
free_gb=$(wait_for_ram)
log "running (free RAM ${free_gb} GB): $*"
"$@"
status=$?
exit $status
