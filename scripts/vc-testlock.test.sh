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

# D-096 (C3): Tests 1-11 below are the original single-lock suite, run unchanged against the
# single-lock mode (VC_TESTLOCK_SLOTS=1 must behave exactly as before). The two-slot tests (12+)
# set VC_TESTLOCK_SLOTS explicitly per command, so this pin does not affect them.
export VC_TESTLOCK_SLOTS=1

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

# ---------------------------------------------------------------------------------------------
# D-096 item 1: two slots. Every test uses a fresh mktemp VC_TESTLOCK_DIR; free RAM is driven by the
# test-only VC_TESTLOCK_FREE_GB_OVERRIDE (the real RAM probe is never called here).
# ---------------------------------------------------------------------------------------------
TS_ENV=(VC_TESTLOCK_MIN_FREE_GB=0 VC_TESTLOCK_POLL_SECS=1 VC_TESTLOCK_SLOTS=2 VC_TESTLOCK_FREE_GB_OVERRIDE=8)
wait_for_owner() { local d="$1" i; for i in $(seq 1 100); do grep -q '^PID=' "$d/owner" 2>/dev/null && return 0; sleep 0.1; done; return 1; }

echo "== Test 12 (D-096 C1/C5): two concurrent holders take slots 0 and 1, a third waits, release frees only its own slot =="
BASE=$(mktemp -d); LOCK="$BASE/lock"
env "${TS_ENV[@]}" VC_TESTLOCK_DIR="$LOCK" bash "$SCRIPT" sleep 8 2>"$BASE/h1.err" &
H1=$!
wait_for_owner "$LOCK"; assert_eq "C1: first holder took slot 0 (the original path)" "0" "$?"
env "${TS_ENV[@]}" VC_TESTLOCK_DIR="$LOCK" bash "$SCRIPT" sleep 16 2>"$BASE/h2.err" &
H2=$!
wait_for_owner "$LOCK.slot-1"; assert_eq "C1: second concurrent holder took slot 1 (<path>.slot-1)" "0" "$?"
[ -d "$LOCK" ] && [ -d "$LOCK.slot-1" ]; assert_eq "C1: both slots held at the same time" "0" "$?"
env "${TS_ENV[@]}" VC_TESTLOCK_DIR="$LOCK" VC_TESTLOCK_TIMEOUT_SECS=3 bash "$SCRIPT" true 2>/dev/null
assert_eq "C1: a third holder finds both slots busy and times out (exit 75)" "75" "$?"
wait "$H1" 2>/dev/null
[ ! -d "$LOCK" ]; assert_eq "C1: first holder's release freed slot 0" "0" "$?"
[ -d "$LOCK.slot-1" ]; assert_eq "C1: ...and left the other holder's slot 1 untouched" "0" "$?"
wait "$H2" 2>/dev/null
[ ! -d "$LOCK.slot-1" ]; assert_eq "C1: second holder's release freed slot 1" "0" "$?"
grep -q '^\[testlock\] running slot 0 (free RAM [^)]*): sleep 8$' "$BASE/h1.err"; assert_eq "C5: log line 'running slot 0 (free RAM X GB): ...' for slot 0" "0" "$?"
grep -q '^\[testlock\] running slot 1 (free RAM [^)]*): sleep 16$' "$BASE/h2.err"; assert_eq "C5: log line 'running slot 1 (free RAM X GB): ...' for slot 1" "0" "$?"
rm -rf "$BASE" "$LOCK.slot-1"

echo "== Test 13 (D-096 C2): below the two-slot RAM floor only slot 0 is tried =="
BASE=$(mktemp -d); LOCK="$BASE/lock"
env "${TS_ENV[@]}" VC_TESTLOCK_DIR="$LOCK" bash "$SCRIPT" sleep 7 2>/dev/null &
H1=$!
wait_for_owner "$LOCK"
env "${TS_ENV[@]}" VC_TESTLOCK_FREE_GB_OVERRIDE=1.0 VC_TESTLOCK_DIR="$LOCK" VC_TESTLOCK_TIMEOUT_SECS=3 bash "$SCRIPT" true 2>/dev/null
assert_eq "C2: with 1.0 GB free (< 3.0) the second holder waits and times out (exit 75)" "75" "$?"
[ ! -d "$LOCK.slot-1" ]; assert_eq "C2: slot 1 was never created at low RAM" "0" "$?"
env "${TS_ENV[@]}" VC_TESTLOCK_FREE_GB_OVERRIDE=3.0 VC_TESTLOCK_DIR="$LOCK" VC_TESTLOCK_TIMEOUT_SECS=3 bash "$SCRIPT" true 2>/dev/null
assert_eq "C2: exactly at the floor (3.0 GB) the second slot is allowed (exit 0)" "0" "$?"
wait "$H1" 2>/dev/null
rm -rf "$BASE" "$LOCK.slot-1"

echo "== Test 14 (D-096 C3): VC_TESTLOCK_SLOTS=1 never uses a second slot =="
BASE=$(mktemp -d); LOCK="$BASE/lock"
env "${TS_ENV[@]}" VC_TESTLOCK_SLOTS=1 VC_TESTLOCK_DIR="$LOCK" bash "$SCRIPT" sleep 7 2>/dev/null &
H1=$!
wait_for_owner "$LOCK"
env "${TS_ENV[@]}" VC_TESTLOCK_SLOTS=1 VC_TESTLOCK_DIR="$LOCK" VC_TESTLOCK_TIMEOUT_SECS=3 bash "$SCRIPT" true 2>/dev/null
assert_eq "C3: SLOTS=1 with plenty of RAM: the second holder still waits (exit 75)" "75" "$?"
[ ! -d "$LOCK.slot-1" ]; assert_eq "C3: SLOTS=1 never creates slot 1" "0" "$?"
wait "$H1" 2>/dev/null
rm -rf "$BASE" "$LOCK.slot-1"

echo "== Test 15 (D-096 C4): EXCLUSIVE=1 holds both slots and never runs while another holder has either =="
BASE=$(mktemp -d); LOCK="$BASE/lock"
env "${TS_ENV[@]}" VC_TESTLOCK_DIR="$LOCK" bash "$SCRIPT" sleep 8 2>/dev/null &
H1=$!
wait_for_owner "$LOCK"
env "${TS_ENV[@]}" VC_TESTLOCK_DIR="$LOCK" bash "$SCRIPT" sleep 26 2>/dev/null &
H2=$!
wait_for_owner "$LOCK.slot-1"
env "${TS_ENV[@]}" VC_TESTLOCK_EXCLUSIVE=1 VC_TESTLOCK_DIR="$LOCK" VC_TESTLOCK_TIMEOUT_SECS=3 bash "$SCRIPT" bash -c "echo ran > '$BASE/ex1.marker'" 2>/dev/null
assert_eq "C4: exclusive with BOTH slots held by others times out (exit 75)" "75" "$?"
[ ! -f "$BASE/ex1.marker" ]; assert_eq "C4: ...and its command never ran" "0" "$?"
wait "$H1" 2>/dev/null   # now only slot 1 is held
[ ! -d "$LOCK" ]; assert_eq "C4 setup: slot 0 is free, slot 1 still held" "0" "$?"
env "${TS_ENV[@]}" VC_TESTLOCK_EXCLUSIVE=1 VC_TESTLOCK_DIR="$LOCK" VC_TESTLOCK_TIMEOUT_SECS=3 bash "$SCRIPT" bash -c "echo ran > '$BASE/ex2.marker'" 2>"$BASE/ex2.err"
assert_eq "C4: exclusive with only slot 1 held by another still times out (exit 75)" "75" "$?"
[ ! -f "$BASE/ex2.marker" ]; assert_eq "C4: ...and its command never ran" "0" "$?"
[ ! -d "$LOCK" ]; assert_eq "C4: the timed-out exclusive released the slot 0 it had taken" "0" "$?"
[ -d "$LOCK.slot-1" ]; assert_eq "C4: ...and did not touch the other holder's slot 1" "0" "$?"
wait "$H2" 2>/dev/null
env "${TS_ENV[@]}" VC_TESTLOCK_EXCLUSIVE=1 VC_TESTLOCK_DIR="$LOCK" bash "$SCRIPT" \
  bash -c "if [ -d '$LOCK' ] && [ -d '$LOCK.slot-1' ]; then echo both > '$BASE/ex3.marker'; else echo notboth > '$BASE/ex3.marker'; fi" 2>"$BASE/ex3.err"
assert_eq "C4: exclusive on a free lock runs (exit 0)" "0" "$?"
assert_eq "C4: while exclusive runs, BOTH slot dirs are held" "both" "$(cat "$BASE/ex3.marker" 2>/dev/null)"
[ ! -d "$LOCK" ] && [ ! -d "$LOCK.slot-1" ]; assert_eq "C4: exclusive release frees both slots" "0" "$?"
grep -q '^\[testlock\] running slot 0+1 (free RAM [^)]*):' "$BASE/ex3.err"; assert_eq "C5: exclusive log line reads 'running slot 0+1 (free RAM X GB): ...'" "0" "$?"
rm -rf "$BASE" "$LOCK.slot-1"

echo "== Test 16 (D-096 C4, starvation guard): while an exclusive run holds slot 0, ordinary waiters do not take slot 1 =="
bash -c 'sleep 25' &
EXH_MSYS=$!
EXH_WINPID=$(winpid_of "$EXH_MSYS")
EXH_STARTED=$(start_ticks_of "$EXH_WINPID")
BASE=$(mktemp -d); LOCK="$BASE/lock"
mkdir "$LOCK"
printf 'PID=%s\nSTARTED=%s\nACQUIRED_AT=%s\nTOKEN=exclusive-holder\nEXCLUSIVE=1\nDESC=fake-exclusive\n' "$EXH_WINPID" "$EXH_STARTED" "$(date +%s)" > "$LOCK/owner"
env "${TS_ENV[@]}" VC_TESTLOCK_DIR="$LOCK" VC_TESTLOCK_TIMEOUT_SECS=3 bash "$SCRIPT" true 2>/dev/null
assert_eq "C4: ordinary waiter behind an exclusive slot-0 holder times out (exit 75)" "75" "$?"
[ ! -d "$LOCK.slot-1" ]; assert_eq "C4: ...without creating slot 1" "0" "$?"
kill "$EXH_MSYS" 2>/dev/null; wait "$EXH_MSYS" 2>/dev/null
rm -rf "$BASE" "$LOCK.slot-1"

echo
echo "== Summary: $PASS passed, $FAIL failed =="
if [ "$FAIL" -gt 0 ]; then
  printf 'Failed: %s\n' "${FAILED_NAMES[@]}"
  exit 1
fi
exit 0
