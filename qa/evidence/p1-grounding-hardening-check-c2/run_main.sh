#!/usr/bin/env bash
export TMP=D:/tmp-chk/c2/tmp TEMP=D:/tmp-chk/c2/tmp VC_TESTLOCK_TIMEOUT_SECS=7200
W=/d/vc/.worktrees/p1-grounding-hardening
L=/d/tmp-chk/c2/logs
run() { name=$1; dir=$2; shift 2
  echo "=== $name START $(date -Iseconds)" >> $L/summary.txt
  ( cd "$W/$dir" && bash D:/vc/scripts/vc-testlock.sh timeout 600 "$@" ) > $L/$name.log 2>&1
  rc=$?
  echo "=== $name END rc=$rc $(date -Iseconds) $(grep -E '^ℹ (pass|fail)' $L/$name.log | tr '\n' ' ')" >> $L/summary.txt
}
run eng-lang packages/engine npx tsx --test tests/lang.test.ts
run eng-graph packages/engine npx tsx --test tests/student-graph.test.ts
run eng-lk5 packages/engine npx tsx --test tests/lk5.test.ts
run tsc-eng packages/engine npx tsc --noEmit
echo "ALLDONE $(date -Iseconds)" >> $L/summary.txt
