#!/usr/bin/env bash
# Tests for scripts/vc-testlock.sh (T-040 / ISS-t-037-1).
#
# Every test here points VC_TESTLOCK_DIR at a fresh `mktemp -d` path -- NEVER the real machine-wide
# lock at C:/Users/Lenovo/AppData/Local/Temp/claude/vc-testlock. A test that touched the real path
# would starve every other session on this machine; that is exactly the failure this unit exists to
# stop causing.
#
# Run: bash scripts/vc-testlock.test.sh
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$SCRIPT_DIR/vc-testlock.sh"

PASS=0
FAIL=0
FAILED_NAMES=()

pass() { PASS=$((PASS+1)); echo "PASS: $1"; }
fail() { FAIL=$((FAIL+1)); FAILED_NAMES+=("$1"); echo "FAIL: $1 -- $2"; }

assert_eq() {
  local desc="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then pass "$desc"; else fail "$desc" "expected [$expected] got [$actual]"; fi
}
assert_true() {
  local desc="$1" cond="$2"
  if [ "$cond" = "0" ]; then pass "$desc"; else fail "$desc" "condition was false"; fi
}
assert_lt() {
  local desc="$1" actual="$2" bound="$3"
  if [ "$actual" -lt "$bound" ]; then pass "$desc"; else fail "$desc" "expected < $bound, got $actual"; fi
}

# Resolves the real Windows PID for a bash job's MSYS pid (mirrors vc-testlock.sh's own
# self_winpid -- duplicated here deliberately so the test never has to source/execute the real
# script's body just to get this number).
winpid_of() {
  local mpid="$1" out header idx
  out=$(ps -p "$mpid" 2>/dev/null) || { echo ""; return; }
  header=$(printf '%s\n' "$out" | head -1)
  idx=$(printf '%s\n' "$header" | awk '{for(i=1;i<=NF;i++) if ($i=="WINPID") print i}')
  [ -z "$idx" ] && { echo ""; return; }
  printf '%s\n' "$out" | awk -v c="$idx" 'NR==2{print $c}'
}

start_ticks_of() {
  local winpid="$1"
  [ -z "$winpid" ] && { echo ""; return; }
  powershell -NoProfile -NonInteractive -Command \
    "(Get-Process -Id $winpid -ErrorAction SilentlyContinue).StartTime.Ticks" 2>/dev/null | tr -d '\r\n'
}

pid_exists() {
  local winpid="$1"
  [ -z "$winpid" ] && return 1
  local t
  t=$(start_ticks_of "$winpid")
  [ -n "$t" ]
}

# A Windows PID guaranteed to be not-running right now, found by probing upward from a
# deliberately-improbable starting point until Get-Process confirms nothing answers.
pick_dead_pid() {
  local candidate=999999
  while pid_exists "$candidate"; do
    candidate=$((candidate + 1))
  done
  echo "$candidate"
}

COMMON_ENV=(VC_TESTLOCK_MIN_FREE_GB=0 VC_TESTLOCK_POLL_SECS=1)

echo "== Test 1: acquire/release round trip =="
BASE=$(mktemp -d); LOCK="$BASE/lock"
env "${COMMON_ENV[@]}" VC_TESTLOCK_DIR="$LOCK" bash "$SCRIPT" true
RC=$?
assert_eq "round trip: wrapped command's exit code propagates" "0" "$RC"
[ ! -d "$LOCK" ]; assert_eq "round trip: lock dir removed after release" "0" "$?"
rm -rf "$BASE"

echo "== Test 2: a second acquirer genuinely blocks while the first holds =="
BASE=$(mktemp -d); LOCK="$BASE/lock"
env "${COMMON_ENV[@]}" VC_TESTLOCK_DIR="$LOCK" bash "$SCRIPT" sleep 4 &
HOLDER_PID=$!
for i in $(seq 1 30); do [ -d "$LOCK" ] && break; sleep 0.2; done
[ -d "$LOCK" ]; assert_eq "blocks: first acquirer actually took the lock" "0" "$?"
T0=$(date +%s)
env "${COMMON_ENV[@]}" VC_TESTLOCK_DIR="$LOCK" VC_TESTLOCK_TIMEOUT_SECS=30 bash "$SCRIPT" true
RC2=$?
T1=$(date +%s)
WAITED=$((T1 - T0))
assert_eq "blocks: second acquirer eventually succeeds once the first releases" "0" "$RC2"
if [ "$WAITED" -ge 2 ]; then pass "blocks: second acquirer genuinely waited (${WAITED}s, not instant)"; else fail "blocks: second acquirer genuinely waited" "only waited ${WAITED}s -- did not block"; fi
wait "$HOLDER_PID" 2>/dev/null
rm -rf "$BASE"

echo "== Test 3 (THE REGRESSION TEST): a stale lock left by a DEAD PID is broken and acquired IN SECONDS =="
BASE=$(mktemp -d); LOCK="$BASE/lock"
mkdir "$LOCK"
DEAD_PID=$(pick_dead_pid)
printf 'PID=%s\nSTARTED=unknown\nACQUIRED_AT=%s\nDESC=dead-pid-regression-test\n' "$DEAD_PID" "$(date +%s)" > "$LOCK/owner"
T0=$(date +%s)
OUT=$(env "${COMMON_ENV[@]}" VC_TESTLOCK_DIR="$LOCK" VC_TESTLOCK_TIMEOUT_SECS=30 bash "$SCRIPT" true 2>&1)
RC3=$?
T1=$(date +%s)
ELAPSED=$((T1 - T0))
assert_eq "T-040 (ISS-t-037-1): a lock owned by a dead PID is acquired, exit 0" "0" "$RC3"
assert_lt "T-040 (ISS-t-037-1): a lock owned by a dead PID is broken in SECONDS, not the staleness window" "$ELAPSED" "20"
case "$OUT" in *"is stale"*|*"orphaned"*|*"breaking stale lock"*) pass "T-040 (ISS-t-037-1): the break path actually announces breaking a stale/dead-owner lock" ;; *) fail "T-040 (ISS-t-037-1): the break path actually announces breaking a stale/dead-owner lock" "no stale/orphaned/breaking message in output: $OUT" ;; esac
rm -rf "$BASE"

echo "== Test 4: a LIVE PID's lock is NOT broken (must wait/time out, never break it) =="
bash -c 'sleep 30' &
LIVE_MSYS_PID=$!
LIVE_WINPID=$(winpid_of "$LIVE_MSYS_PID")
LIVE_STARTED=$(start_ticks_of "$LIVE_WINPID")
if [ -z "$LIVE_WINPID" ] || [ -z "$LIVE_STARTED" ]; then
  fail "live-pid setup: could resolve a real WINPID/StartTime for the background holder" "winpid=[$LIVE_WINPID] started=[$LIVE_STARTED]"
else
  pass "live-pid setup: resolved a real WINPID/StartTime for the background holder"
  BASE=$(mktemp -d); LOCK="$BASE/lock"
  mkdir "$LOCK"
  printf 'PID=%s\nSTARTED=%s\nACQUIRED_AT=%s\nDESC=live-pid-test\n' "$LIVE_WINPID" "$LIVE_STARTED" "$(date +%s)" > "$LOCK/owner"
  T0=$(date +%s)
  OUT4=$(env "${COMMON_ENV[@]}" VC_TESTLOCK_DIR="$LOCK" VC_TESTLOCK_TIMEOUT_SECS=5 bash "$SCRIPT" true 2>&1)
  RC4=$?
  T1=$(date +%s)
  assert_eq "live PID: acquirer refuses to break it, times out loudly (exit 75)" "75" "$RC4"
  case "$OUT4" in *"is stale"*|*"orphaned"*|*"breaking stale lock"*) fail "live PID: no stale/broken message is printed for a genuinely live owner" "saw one anyway: $OUT4" ;; *) pass "live PID: no stale/broken message is printed for a genuinely live owner" ;; esac
  rm -rf "$LOCK"   # nobody else will release this fabricated lock
  rm -rf "$BASE"
fi
kill "$LIVE_MSYS_PID" 2>/dev/null
wait "$LIVE_MSYS_PID" 2>/dev/null

echo "== Test 5: a RECYCLED PID (same PID number, different process -- StartTime mismatch) is treated as stale =="
bash -c 'sleep 30' &
RECYCLE_MSYS_PID=$!
RECYCLE_WINPID=$(winpid_of "$RECYCLE_MSYS_PID")
if [ -z "$RECYCLE_WINPID" ]; then
  fail "recycled-pid setup: could resolve a real WINPID for the background holder" "winpid empty"
else
  pass "recycled-pid setup: resolved a real WINPID for the background holder"
  BASE=$(mktemp -d); LOCK="$BASE/lock"
  mkdir "$LOCK"
  # A LIVE pid, but a STARTED value that cannot match this process's real StartTime --
  # simulates "this PID number now belongs to a different process than the one that wrote it".
  printf 'PID=%s\nSTARTED=1\nACQUIRED_AT=%s\nDESC=recycled-pid-test\n' "$RECYCLE_WINPID" "$(date +%s)" > "$LOCK/owner"
  T0=$(date +%s)
  OUT5=$(env "${COMMON_ENV[@]}" VC_TESTLOCK_DIR="$LOCK" VC_TESTLOCK_TIMEOUT_SECS=30 bash "$SCRIPT" true 2>&1)
  RC5=$?
  T1=$(date +%s)
  ELAPSED5=$((T1 - T0))
  assert_eq "recycled PID: lock with a live-but-mismatched-StartTime owner is still acquired, exit 0" "0" "$RC5"
  assert_lt "recycled PID: broken in seconds (liveness+identity check, not the age fallback)" "$ELAPSED5" "20"
  rm -rf "$BASE"
fi
kill "$RECYCLE_MSYS_PID" 2>/dev/null
wait "$RECYCLE_MSYS_PID" 2>/dev/null

echo "== Test 6: release happens on a NON-ZERO exit from the wrapped command =="
BASE=$(mktemp -d); LOCK="$BASE/lock"
env "${COMMON_ENV[@]}" VC_TESTLOCK_DIR="$LOCK" bash "$SCRIPT" bash -c 'exit 7'
RC6=$?
assert_eq "non-zero exit: the wrapped command's own exit code (7) propagates" "7" "$RC6"
[ ! -d "$LOCK" ]; assert_eq "non-zero exit: lock dir still removed" "0" "$?"
rm -rf "$BASE"

echo "== Test 7: release happens on SIGTERM (interrupted runner) =="
BASE=$(mktemp -d); LOCK="$BASE/lock"
env "${COMMON_ENV[@]}" VC_TESTLOCK_DIR="$LOCK" bash "$SCRIPT" sleep 30 &
WRAPPER_PID=$!
for i in $(seq 1 30); do [ -d "$LOCK" ] && break; sleep 0.2; done
[ -d "$LOCK" ]; assert_eq "SIGTERM: the wrapper actually acquired the lock before being killed" "0" "$?"
kill -TERM "$WRAPPER_PID" 2>/dev/null
wait "$WRAPPER_PID" 2>/dev/null
for i in $(seq 1 30); do [ ! -d "$LOCK" ] && break; sleep 0.2; done
[ ! -d "$LOCK" ]; assert_eq "SIGTERM: lock dir removed after the wrapper is killed (does not hold forever)" "0" "$?"
rm -rf "$BASE"

echo
echo "== Summary: $PASS passed, $FAIL failed =="
if [ "$FAIL" -gt 0 ]; then
  printf 'Failed: %s\n' "${FAILED_NAMES[@]}"
  exit 1
fi
exit 0
