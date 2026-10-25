#!/usr/bin/env bash
# rr.sh <dir> <logprefix> <n> <pattern> <files...> : n isolated runs under vc-testlock, one log each, summary line per run
d=$1; p=$2; n=$3; pat=$4; shift 4
cd "$d" || exit 9
for i in $(seq 1 $n); do
  VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 900 node node_modules/tsx/dist/cli.mjs --test --test-concurrency=1 --test-timeout=120000 --test-reporter=tap --test-name-pattern "$pat" "$@" > "$p-$i.log" 2>&1
  rc=$?
  echo "run $i exit=$rc $(grep -E '^# (tests|pass|fail) ' "$p-$i.log" | tr '\n' ' ') sha=$(sha256sum "$p-$i.log" | cut -c1-8)"
done
