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

# Creates a directory containing a fake `powershell` that sleeps N seconds before delegating to the
# real one, and prints its path. Used by the T-044/ISS-111 regression tests (8, 9) to make
# proc_start_ticks -- the slow PowerShell call inside write_owner_enrich (new code) / the single
# write_owner (old code) -- take an arbitrarily long, DETERMINISTIC time, instead of depending on
# this machine's actual PowerShell cold-start latency (measured 2.3-4.3s, not reliably reproducible
# on demand) to exercise the acquire-window race.
REAL_POWERSHELL=$(command -v powershell)
make_slow_powershell_shim() {
  local secs="$1" dir
  dir=$(mktemp -d)
  cat > "$dir/powershell" <<SHIMEOF
#!/usr/bin/env bash
sleep $secs
exec "$REAL_POWERSHELL" "\$@"
SHIMEOF
  chmod +x "$dir/powershell"
  echo "$dir"
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
# Wait for the OWNER FILE (with a real PID), not just the directory (T-044/ISS-111): mkdir
# succeeding no longer means the wrapper has finished acquiring -- write_owner_minimal still has to
# run (self_winpid, then an atomic mv) before LOCK_TOKEN and the on-disk owner file exist. Polling
# on directory-existence alone raced ahead of that and could SIGTERM the wrapper before it had
# anything of its own to release, at which point the (correct, post-fix) ownership-aware release()
# rightly declines to touch a directory it never finished claiming -- this is the same
# dir-exists-is-not-acquired gap T-044 closes in acquire() itself, surfacing here in the test's own
# synchronisation once release() stopped deleting unconditionally.
for i in $(seq 1 50); do grep -q '^PID=' "$LOCK/owner" 2>/dev/null && break; sleep 0.1; done
grep -q '^PID=' "$LOCK/owner" 2>/dev/null; assert_eq "SIGTERM: the wrapper actually acquired the lock before being killed" "0" "$?"
kill -TERM "$WRAPPER_PID" 2>/dev/null
wait "$WRAPPER_PID" 2>/dev/null
for i in $(seq 1 30); do [ ! -d "$LOCK" ] && break; sleep 0.2; done
[ ! -d "$LOCK" ]; assert_eq "SIGTERM: lock dir removed after the wrapper is killed (does not hold forever)" "0" "$?"
rm -rf "$BASE"

echo "== Test 8 (T-044/ISS-111 REGRESSION -- Site 1, the acquire window): a slow write_owner must never open a break window for a live holder =="
BASE=$(mktemp -d); LOCK="$BASE/lock"
SHIM_DIR=$(make_slow_powershell_shim 18)
OVERLAP_LOG="$BASE/overlap.log"
: > "$OVERLAP_LOG"

# H: PATH-shimmed so its slow PowerShell call takes ~18s -- comfortably past the 10s orphan
# threshold plus a full default 5s poll interval, so a waiter gets at least 1-2 real chances to
# judge the directory stale while H is still legitimately working on acquiring/holding it.
env VC_TESTLOCK_DIR="$LOCK" VC_TESTLOCK_MIN_FREE_GB=0 PATH="$SHIM_DIR:$PATH" \
  bash "$SCRIPT" bash -c "printf 'H_START %s\n' \"\$(date +%s%N)\" >> '$OVERLAP_LOG'; sleep 4; printf 'H_END %s\n' \"\$(date +%s%N)\" >> '$OVERLAP_LOG'" &
H_PID=$!

for i in $(seq 1 50); do [ -d "$LOCK" ] && break; sleep 0.1; done
[ -d "$LOCK" ]; assert_eq "Site 1 setup: H's mkdir succeeded" "0" "$?"

# W: UNSHIMMED PATH, default POLL_SECS (5s) and default 10s orphan threshold -- the actual
# production values ISS-111 is about, not this suite's usual sped-up COMMON_ENV. Generous timeout
# (90s) because the property under test is "never breaks a live lock", not "breaks in under Ns" --
# W timing out having NEVER broken in is just as valid a pass as W succeeding once H legitimately
# releases; see the three-way check below.
env VC_TESTLOCK_DIR="$LOCK" VC_TESTLOCK_MIN_FREE_GB=0 VC_TESTLOCK_TIMEOUT_SECS=90 \
  bash "$SCRIPT" bash -c "printf 'W_START %s\n' \"\$(date +%s%N)\" >> '$OVERLAP_LOG'; sleep 1; printf 'W_END %s\n' \"\$(date +%s%N)\" >> '$OVERLAP_LOG'" &
W_PID=$!

wait "$H_PID" 2>/dev/null
wait "$W_PID" 2>/dev/null

H_END_NS=$(grep '^H_END' "$OVERLAP_LOG" | head -1 | awk '{print $2}')
W_START_NS=$(grep '^W_START' "$OVERLAP_LOG" | head -1 | awk '{print $2}')
# Three possible honest outcomes, only one of which is a violation:
#   (a) W never started at all (timed out waiting) -- safe: it never broke H's live lock.
#   (b) W started, but only at/after H's own legitimate finish -- safe: ordinary mutual exclusion.
#   (c) W started BEFORE H finished -- a live lock was broken. This is the only failure.
if [ -z "$W_START_NS" ]; then
  pass "Site 1: W never broke H's live lock (timed out waiting rather than stealing it)"
elif [ -n "$H_END_NS" ] && [ "$W_START_NS" -ge "$H_END_NS" ]; then
  pass "Site 1: W only started after H's own wrapped command legitimately finished (H's live lock was never broken)"
else
  fail "Site 1: H's live lock was never broken" "W started at $W_START_NS, before H's legitimate finish (H_END=${H_END_NS:-<H never finished>}) -- W broke a live lock"
fi
rm -rf "$BASE" "$SHIM_DIR"

echo "== Test 9 (T-044/ISS-111 REGRESSION -- Site 2): a slow enrich must not silently overwrite a directory that changed hands =="
# Deterministic, not timing-based: source the script as a LIBRARY (safe -- the wrapper at the
# bottom only runs when executed directly, see the sourcing guard) to call write_owner_minimal /
# write_owner_enrich directly. An earlier version of this test tried to win the real race (a
# concurrent process backed by a shimmed-slow PowerShell) and was itself unreliable: the acquirer
# under test kept correctly detecting a FIRST, deliberately-injected mismatch, clearing its token,
# and retrying -- which is exactly Site 1's fix working as intended, but it meant the externally
# staged "other holder" state didn't reliably survive long enough to sample. Calling the guarded
# functions directly removes that whole timing dependency and tests the ownership check itself.
BASE=$(mktemp -d); LOCK="$BASE/lock"
mkdir "$LOCK"
export VC_TESTLOCK_DIR="$LOCK"
export VC_TESTLOCK_MIN_FREE_GB=0
source "$SCRIPT"
LOCK_ACQUIRED_AT=$(date +%s)
MY_TOKEN=$(gen_token)
write_owner_minimal "$MY_TOKEN" mine
assert_eq "Site 2 setup: our minimal write landed our own token" "$MY_TOKEN" "$(owner_token)"

# Simulate the interleaving ISS-111 describes: another acquirer broke this directory and took over
# while our own (real) proc_start_ticks call was still in flight, before we ever got to enrich.
rm -rf "$LOCK"; mkdir "$LOCK"
OTHER_TOKEN="site2-other-holder-$(date +%s%N)"
printf 'PID=999995\nSTARTED=unknown\nACQUIRED_AT=%s\nTOKEN=%s\nDESC=other-holder\n' "$(date +%s)" "$OTHER_TOKEN" > "$LOCK/owner"

write_owner_enrich "$MY_TOKEN" mine
ENRICH_RC=$?
assert_eq "Site 2: write_owner_enrich detects the ownership change and refuses to write (rc=1)" "1" "$ENRICH_RC"
assert_eq "Site 2: the other holder's owner file survives untouched, not ours" "$OTHER_TOKEN" "$(owner_token)"
rm -rf "$BASE"

echo "== Test 10 (T-044/ISS-111 REGRESSION -- Site 3): release() must not delete a lock that changed hands =="
# Deterministic too, for the same reason as Test 9 -- and it catches a real bug an earlier,
# real-process version of this test had: waiting only for B's owner file's PID (not for B to be
# fully past its OWN enrich) let B's still-running acquire() loop notice the externally-injected
# "A" state itself, correctly judge A's fake dead PID stale, and re-break it before this test's own
# assertions ever ran -- a false failure caused by the test, not the script. Calling release()
# directly sidesteps that: no other code path is running to interfere.
BASE=$(mktemp -d); LOCK="$BASE/lock"
mkdir "$LOCK"
LOCK_DIR="$LOCK"   # repoint at a fresh dir; functions already sourced by Test 9 above
LOCK_ACQUIRED_AT=$(date +%s)
B_TOKEN=$(gen_token)
LOCK_TOKEN="$B_TOKEN"
write_owner_minimal "$B_TOKEN" b-holder
write_owner_enrich "$B_TOKEN" b-holder >/dev/null 2>&1 || true

# Someone else (A) broke B's directory and took over -- however that happened (ISS-110's hand-rolled
# lock is one real way; a mistaken stale judgment is another). Site 3 is about what happens AFTER.
rm -rf "$LOCK_DIR"; mkdir "$LOCK_DIR"
A_TOKEN="a-holder-token-$(date +%s%N)"
printf 'PID=999994\nSTARTED=unknown\nACQUIRED_AT=%s\nTOKEN=%s\nDESC=a-holder\n' "$(date +%s)" "$A_TOKEN" > "$LOCK_DIR/owner"

release   # simulates B's own EXIT trap firing, with B's (now-stale) LOCK_TOKEN still set
[ -d "$LOCK_DIR" ]; assert_eq "Site 3: A's directory still exists after B's own (unrelated) release fires" "0" "$?"
assert_eq "Site 3: A's owner file survives B's release() untouched" "$A_TOKEN" "$(owner_token)"

# Sub-case: B never actually finished acquiring at all (e.g. it hit ACQUIRE_TIMEOUT_SECS and exited
# 75 while someone else legitimately held the lock) -- LOCK_TOKEN must be unset, and release() must
# still not touch whatever directory is there.
LOCK_TOKEN=""
release
[ -d "$LOCK_DIR" ]; assert_eq "Site 3b: a never-acquired caller's release() does not delete a live holder's dir" "0" "$?"
assert_eq "Site 3b: that holder's owner file is untouched" "$A_TOKEN" "$(owner_token)"
rm -rf "$BASE"

echo "== Test 11 (T-044/ISS-111 REGRESSION -- Site 3b): a caller that never acquired must not delete a live holder's lock on its own timeout exit =="
bash -c 'sleep 20' &
LIVE2_MSYS_PID=$!
LIVE2_WINPID=$(winpid_of "$LIVE2_MSYS_PID")
LIVE2_STARTED=$(start_ticks_of "$LIVE2_WINPID")
BASE=$(mktemp -d); LOCK="$BASE/lock"
mkdir "$LOCK"
printf 'PID=%s\nSTARTED=%s\nACQUIRED_AT=%s\nTOKEN=genuine-live-holder\nDESC=genuine\n' "$LIVE2_WINPID" "$LIVE2_STARTED" "$(date +%s)" > "$LOCK/owner"
env "${COMMON_ENV[@]}" VC_TESTLOCK_DIR="$LOCK" VC_TESTLOCK_TIMEOUT_SECS=3 bash "$SCRIPT" true
RC11=$?
assert_eq "Site 3b: a waiter that times out on a genuinely live lock exits 75" "75" "$RC11"
[ -d "$LOCK" ]; assert_eq "Site 3b: the live holder's lock survives the timed-out waiter's own exit" "0" "$?"
SURVIVING2=$(grep -o '^TOKEN=.*' "$LOCK/owner" 2>/dev/null | cut -d= -f2-)
assert_eq "Site 3b: the live holder's owner file is untouched" "genuine-live-holder" "$SURVIVING2"
kill "$LIVE2_MSYS_PID" 2>/dev/null; wait "$LIVE2_MSYS_PID" 2>/dev/null
rm -rf "$LOCK" "$BASE"

echo
echo "== Summary: $PASS passed, $FAIL failed =="
if [ "$FAIL" -gt 0 ]; then
  printf 'Failed: %s\n' "${FAILED_NAMES[@]}"
  exit 1
fi
exit 0
