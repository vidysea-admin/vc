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
#
# T-044 (ISS-111) -- ownership token, closing three sites of the SAME root cause: an operation
#   assumed the lock directory it resolved earlier is still the one it owns, when $LOCK_DIR is
#   just a path, re-resolved at every use, with nothing binding a holder to the specific directory
#   it created.
#   - Site 1 (the acquire window): the original write_owner() ran self_winpid AND the slow
#     proc_start_ticks PowerShell call BEFORE writing any owner file, so a fresh mkdir sat with no
#     owner file for the whole PowerShell cold start (measured 2.3-4.3s against the 10s "no owner
#     file" orphan threshold in lock_is_stale() -- real, but thin headroom under this project's
#     documented RAM contention). Fixed: write_owner_minimal() writes PID+ACQUIRED_AT+TOKEN
#     immediately after mkdir, using only self_winpid (no PowerShell) -- lock_is_stale() sees a
#     real, alive PID from that instant on, however long the enrich step takes.
#   - Site 2 (write_owner's mv landing in the wrong directory): if a slow enrich's directory was
#     broken and re-mkdir'd by another acquirer in the meantime, the old single write_owner()'s
#     final `mv` still landed in the NEW owner's directory, silently overwriting their PID/STARTED
#     with the old holder's. Fixed: write_owner_enrich() checks the directory still carries the
#     TOKEN it was given before writing; a mismatch is a no-op (plus a log line), and acquire()
#     treats that as "lost it, retry" rather than proceeding as if it still held the lock.
#   - Site 3 (release() had no ownership check): a bare `rm -rf "$LOCK_DIR"` under `trap release
#     EXIT` deleted whatever was AT that path on exit, regardless of whether it was still this
#     process's lock -- including a live holder's directory after any break (this session's own,
#     a mistaken stale judgment, or a hand-rolled lock, ISS-110), or even a lock this process never
#     acquired at all (e.g. it hit ACQUIRE_TIMEOUT_SECS and exited 75 while someone else legitimately
#     held it). That turned every break into a cascade of at least two concurrent holders that
#     outlived the condition that caused the first break. Fixed: release() only removes the
#     directory when its current TOKEN still matches the one this process wrote when it acquired
#     the lock; LOCK_TOKEN unset (never acquired) or a token mismatch (broken/superseded) both skip
#     the removal.
#   A token is not a Windows PID and is never passed to tasklist/Get-Process -- it exists purely to
#   answer "is this still the directory I created", which nothing here answered before.
#
# D-096 item 1 -- TWO SLOTS (VC_TESTLOCK_SLOTS, default 2):
#   - Slot 0 is the ORIGINAL path (LOCK_DIR, unchanged), so old copies still contend on it. Slot 1 is
#     "${LOCK_DIR}.slot-1". Every slot uses the same mkdir + owner/token + liveness stale-break logic
#     (claim_dir); release() frees only the slot(s) this process holds.
#   - A holder tries slot 0 first, then slot 1, but slot 1 is only tried when free RAM at acquire time
#     is >= VC_TESTLOCK_TWO_SLOT_MIN_GB (default 3.0). Tests drive that with the test-only
#     VC_TESTLOCK_FREE_GB_OVERRIDE; unmeasurable free RAM counts as "too low" (slot 0 only).
#   - VC_TESTLOCK_SLOTS=1 behaves exactly as before (single lock at LOCK_DIR).
#   - VC_TESTLOCK_EXCLUSIVE=1 (a full suite) holds ALL slots: slot 0, then waits for slot 1, under one
#     acquire timeout. Its slot-0 owner file carries EXCLUSIVE=1 so ordinary waiters do not keep
#     refilling slot 1 and starve it. Everyone takes slot 0 before slot 1, so there is no deadlock.

set -uo pipefail

BASE_LOCK_DIR="${VC_TESTLOCK_DIR:-/c/Users/Lenovo/AppData/Local/Temp/claude/vc-testlock}"
# LOCK_DIR is the directory of the slot THIS process holds (the helpers below all act on it); until
# a slot is taken it points at slot 0, i.e. the original path.
LOCK_DIR="$BASE_LOCK_DIR"
SLOTS="${VC_TESTLOCK_SLOTS:-2}"
EXCLUSIVE="${VC_TESTLOCK_EXCLUSIVE:-0}"
TWO_SLOT_MIN_GB="${VC_TESTLOCK_TWO_SLOT_MIN_GB:-3.0}"
EXCLUSIVE_FLAG=0      # 1 while this process takes the slots in exclusive mode (owner-file marker)
SLOT_LABEL=0          # slot shown in the "running" log line
EXTRA_DIRS=()         # exclusive mode: the further slot dirs held besides LOCK_DIR
EXTRA_TOKENS=()
ACQUIRE_START_TS=0
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

# A short, opaque value unique to THIS acquisition of the lock directory -- not to be confused
# with the owning PID. It identifies the ACQUISITION (this specific mkdir), so later code can tell
# "my directory" apart from "a directory of the same name that a break-and-recreate cycle replaced
# it with" (see write_owner_enrich and release, both ISS-111 findings). Uniqueness only needs to
# hold across concurrent acquirers on this one machine, so wall-clock ns + this process's (MSYS)
# pid + $RANDOM is enough -- this is never compared against a Windows PID and never fed to
# tasklist/Get-Process, so the usual WINPID gotcha does not apply to it.
gen_token() {
  printf '%s-%s-%s' "$(date +%s%N 2>/dev/null || date +%s)" "$$" "$RANDOM"
}

# Reads the TOKEN field of the CURRENT owner file at $LOCK_DIR/owner, or empty if there is none /
# it's unparseable. Used by write_owner_enrich and release to check "do I still own this
# directory" before acting on it.
owner_token() {
  grep -o '^TOKEN=.*' "${1:-$LOCK_DIR}/owner" 2>/dev/null | cut -d= -f2-
}

# Writes the MINIMAL owner file -- PID + ACQUIRED_AT + TOKEN + DESC, STARTED left "unknown" for
# now -- as fast as possible, using only self_winpid (no PowerShell). This closes ISS-111 Site 1:
# the previous single write_owner() ran self_winpid AND the slow proc_start_ticks PowerShell call
# BEFORE writing anything, so the directory had no owner file for the whole PowerShell cold start
# (measured 2.3-4.3s against lock_is_stale()'s 10s "no owner file" orphan threshold -- real but
# thin headroom). The instant this minimal file lands, lock_is_stale() sees a real, alive PID and
# will not treat the directory as orphaned, regardless of how long the enrich step below takes.
# Written via the same atomic temp-file + `mv -f` pattern as before (Test 2's torn-read fix) --
# both writes in this file go through it, so a reader never sees a partial write.
# Sets the caller's ACQUIRE_WINPID (consumed by write_owner_enrich) as a side effect.
write_owner_minimal() {
  local token="$1"; shift
  local tmp
  ACQUIRE_WINPID=$(self_winpid)
  tmp="$LOCK_DIR/.owner.tmp.$$"
  {
    echo "PID=${ACQUIRE_WINPID:-unknown}"
    echo "STARTED=unknown"
    echo "ACQUIRED_AT=$LOCK_ACQUIRED_AT"
    echo "TOKEN=$token"
    [ "$EXCLUSIVE_FLAG" = "1" ] && echo "EXCLUSIVE=1"
    echo "DESC=$*"
  } > "$tmp"
  mv -f "$tmp" "$LOCK_DIR/owner"
}

# Enriches the owner file with STARTED once proc_start_ticks (the slow PowerShell call) returns --
# but ONLY if the directory still carries OUR token. Without this check (ISS-111 Site 2), a slow
# enrich whose directory was broken and re-mkdir'd by someone else in the meantime would still `mv`
# its file into place -- landing silently in the NEW owner's directory and overwriting their
# PID/STARTED with ours, so a later waiter tests the wrong process's liveness while the real
# current owner holds the lock. Returns 1 (and writes nothing) on a token mismatch; the caller
# (acquire) treats that as "lost the lock immediately after taking it" and retries.
# NOTE: the token check-then-mv is not atomic -- a break landing in the few instructions between
# the check and the `mv` is still possible in principle. It shrinks the previous multi-second
# PowerShell-cold-start window to roughly a `grep`+`mv`, not zero; disclosed as a residual gap.
write_owner_enrich() {
  local token="$1"; shift
  local started tmp cur_token
  started=$(proc_start_ticks "$ACQUIRE_WINPID")
  cur_token=$(owner_token)
  if [ "$cur_token" != "$token" ]; then
    log "write_owner_enrich: lock dir token changed (ours [$token], now [${cur_token:-<none>}]) -- not enriching, this directory is no longer ours"
    return 1
  fi
  tmp="$LOCK_DIR/.owner.tmp.$$"
  {
    echo "PID=${ACQUIRE_WINPID:-unknown}"
    echo "STARTED=${started:-unknown}"
    echo "ACQUIRED_AT=$LOCK_ACQUIRED_AT"
    echo "TOKEN=$token"
    [ "$EXCLUSIVE_FLAG" = "1" ] && echo "EXCLUSIVE=1"
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

# slot_dir <n>: slot 0 is the original path (old copies contend on it), slot n>0 is "<path>.slot-n".
slot_dir() {
  if [ "$1" -eq 0 ]; then echo "$BASE_LOCK_DIR"; else echo "${BASE_LOCK_DIR}.slot-$1"; fi
}

# claim_dir <dir> <primary|extra> <cmd...>: compete for ONE slot directory. Returns 0 when taken,
# 1 when it is held by a live owner (the caller decides whether to try another slot or sleep).
# primary: LOCK_DIR/LOCK_TOKEN become this slot. extra (exclusive mode): recorded in EXTRA_*, LOCK_DIR
# is left pointing at the primary slot. Stale handling is the original logic, per directory.
claim_dir() {
  local dir="$1" role="$2" token elapsed saved="$LOCK_DIR"
  shift 2
  while true; do
    LOCK_DIR="$dir"
    if mkdir "$dir" 2>/dev/null; then
      LOCK_ACQUIRED_AT=$(date +%s)
      token=$(gen_token)
      [ "$role" = "primary" ] && LOCK_TOKEN="$token"
      write_owner_minimal "$token" "$@"
      if write_owner_enrich "$token" "$@"; then
        if [ "$role" = "primary" ]; then
          LOCK_DIR="$dir"
        else
          EXTRA_DIRS+=("$dir"); EXTRA_TOKENS+=("$token"); LOCK_DIR="$saved"
        fi
        return 0
      fi
      # Lost the directory to another acquirer between the minimal write and the enrich (ISS-111
      # Site 2's mismatch case, caught rather than silently overwritten). We do not hold this lock
      # -- clear the token so our own EXIT trap (release, Site 3) does not touch whatever directory
      # exists now, and go back around to compete for it like any other waiter.
      [ "$role" = "primary" ] && LOCK_TOKEN=""
      log "acquire: lost the lock immediately after taking it -- retrying"
      continue
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
    elapsed=$(( $(date +%s) - ACQUIRE_START_TS ))
    if [ "$elapsed" -ge "$ACQUIRE_TIMEOUT_SECS" ]; then
      log "FATAL: timed out after ${elapsed}s waiting for $dir (held by: $(cat "$dir/owner" 2>/dev/null | tr '\n' ' '))"
      log "refusing to proceed unlocked -- retry, or investigate the holder above"
      LOCK_DIR="$saved"   # exclusive mode: our EXIT trap must see the slot we DO hold, not this one
      exit 75
    fi

    if lock_is_stale; then
      log "breaking stale lock at $dir"
      rm -rf "$dir" 2>/dev/null   # rm -rf, NEVER bare rmdir -- see header. rmdir cannot
                                  # remove a non-empty dir and would spin forever here.
      continue   # retry mkdir right away; the timeout check above still runs next iteration either way
    fi
    LOCK_DIR="$saved"
    return 1
  done
}

# Free RAM in GB (empty when it cannot be measured).
probe_free_gb() {
  powershell -NoProfile -NonInteractive -Command \
    "[math]::Round((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory/1MB,2)" 2>/dev/null | tr -d '\r'
}

# True iff a SECOND concurrent holder is affordable right now (free RAM >= TWO_SLOT_MIN_GB).
# VC_TESTLOCK_FREE_GB_OVERRIDE is test-only; unmeasurable RAM counts as "not enough".
two_slot_ram_ok() {
  local free="${VC_TESTLOCK_FREE_GB_OVERRIDE:-}"
  [ -z "$free" ] && free=$(probe_free_gb)
  [ -z "$free" ] && return 1
  awk -v f="$free" -v m="$TWO_SLOT_MIN_GB" 'BEGIN{exit !(f+0>=m+0)}'
}

# True iff slot 0's holder is an exclusive (whole-suite) run: nobody else may start on slot 1 then.
slot0_is_exclusive() {
  grep -q '^EXCLUSIVE=1' "$BASE_LOCK_DIR/owner" 2>/dev/null
}

acquire() {
  local announced=0 n
  ACQUIRE_START_TS=$(date +%s)

  if [ "$EXCLUSIVE" = "1" ]; then
    # Hold every slot: slot 0 first, then each further slot, all under the one acquire timeout.
    EXCLUSIVE_FLAG=1
    until claim_dir "$(slot_dir 0)" primary "$@"; do
      if [ "$announced" -eq 0 ]; then
        log "waiting (exclusive) for lock held by: $(cat "$BASE_LOCK_DIR/owner" 2>/dev/null | tr '\n' ' ')"
        announced=1
      fi
      sleep "$POLL_SECS"
    done
    announced=0
    for (( n=1; n<SLOTS; n++ )); do
      until claim_dir "$(slot_dir "$n")" extra "$@"; do
        if [ "$announced" -eq 0 ]; then
          log "holding slot 0, waiting (exclusive) for slot $n held by: $(cat "$(slot_dir "$n")/owner" 2>/dev/null | tr '\n' ' ')"
          announced=1
        fi
        sleep "$POLL_SECS"
      done
      announced=0
    done
    EXCLUSIVE_FLAG=0
    SLOT_LABEL=0
    for (( n=1; n<SLOTS; n++ )); do SLOT_LABEL="${SLOT_LABEL}+${n}"; done
    return 0
  fi

  while true; do
    if claim_dir "$(slot_dir 0)" primary "$@"; then
      SLOT_LABEL=0
      return 0
    fi
    if [ "$SLOTS" -gt 1 ] && ! slot0_is_exclusive && two_slot_ram_ok; then
      for (( n=1; n<SLOTS; n++ )); do
        if claim_dir "$(slot_dir "$n")" primary "$@"; then
          SLOT_LABEL="$n"
          return 0
        fi
      done
    fi

    if [ "$announced" -eq 0 ]; then
      log "waiting for lock held by: $(cat "$BASE_LOCK_DIR/owner" 2>/dev/null | tr '\n' ' ')"
      announced=1
    fi
    sleep "$POLL_SECS"
  done
}
release() {
  # Only remove the lock directory if it still carries the token we wrote when we acquired it
  # (ISS-111 Site 3). The previous bare `rm -rf` got this wrong in two ways:
  #   (a) we never actually finished acquiring (e.g. acquire() hit ACQUIRE_TIMEOUT_SECS and called
  #       `exit 75` -- this trap still fires) -- LOCK_TOKEN is unset, so we own nothing at
  #       LOCK_DIR and must not touch it: it may be a live holder's directory the whole time we
  #       were waiting for it;
  #   (b) we DID acquire, but our lock was later broken by a waiter who misjudged it stale (or hand
  #       -rolled one, ISS-110) and took over -- the directory now carries a DIFFERENT token, and
  #       removing it on our own exit would delete THEIR live lock. That is the cascade: A breaks
  #       B and acquires; B's unconditional release() then deletes A's live lock; C acquires while
  #       A is still running. Every break used to convert into at least two concurrent holders, and
  #       the cascade outlived the condition that caused the first break.
  if [ -z "${LOCK_TOKEN:-}" ]; then
    return 0
  fi
  local cur_token
  cur_token=$(owner_token)
  if [ "$cur_token" != "$LOCK_TOKEN" ]; then
    log "release: lock dir token changed (ours [$LOCK_TOKEN], now [${cur_token:-<none>}]) -- not removing, it is no longer ours"
    return 0
  fi
  rm -rf "$LOCK_DIR" 2>/dev/null || true
}

# Exclusive mode also holds the extra slots; free each one only if it still carries our token.
release_extras() {
  local i cur
  for (( i=0; i<${#EXTRA_DIRS[@]}; i++ )); do
    cur=$(owner_token "${EXTRA_DIRS[$i]}")
    if [ "$cur" = "${EXTRA_TOKENS[$i]}" ]; then
      rm -rf "${EXTRA_DIRS[$i]}" 2>/dev/null || true
    else
      log "release: ${EXTRA_DIRS[$i]} token changed -- not removing, it is no longer ours"
    fi
  done
}

wait_for_ram() {
  local i free
  for i in $(seq 1 "$RAM_RETRIES"); do
    free=$(probe_free_gb)
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

# Only run the wrapper when EXECUTED directly (bash scripts/vc-testlock.sh ...). When SOURCED
# instead, only the function/variable definitions above load and nothing runs automatically --
# vc-testlock.test.sh does this to reach write_owner_minimal / write_owner_enrich / release /
# gen_token directly, so ISS-111 Site 2/3's token-ownership guards can be tested deterministically
# instead of by trying to win a real, sub-second race window.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  trap 'release; release_extras' EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM

  acquire "$@"
  free_gb=$(wait_for_ram)
  log "running slot ${SLOT_LABEL} (free RAM ${free_gb} GB): $*"
  "$@"
  status=$?
  exit $status
fi
