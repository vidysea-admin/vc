#!/usr/bin/env bash
export TMP=D:/tmp-chk/tmp TEMP=D:/tmp-chk/tmp VC_TESTLOCK_TIMEOUT_SECS=7200
W=/d/vc/.worktrees/p1-grounding-hardening
L=/d/tmp-chk/c1/logs
run() { name=$1; dir=$2; shift 2
  echo "=== $name START $(date -Iseconds)" >> $L/summary.txt
  ( cd "$W/$dir" && bash D:/vc/scripts/vc-testlock.sh timeout 600 "$@" ) > $L/$name.log 2>&1
  rc=$?
  echo "=== $name END rc=$rc $(date -Iseconds) $(grep -E '^ℹ (pass|fail)' $L/$name.log | tr '\n' ' ')" >> $L/summary.txt
}
run eng-lang packages/engine npx tsx --test tests/lang.test.ts
run eng-graph packages/engine npx tsx --test tests/student-graph.test.ts
run eng-lk5 packages/engine npx tsx --test tests/lk5.test.ts
run eng-classify packages/engine npx tsx --test tests/student-classify.test.ts
run prov-index packages/providers npx tsx --test tests/index.test.ts
run api-anon apps/api npx tsx --test --test-name-pattern="H2|H6|G5" tests/anonymous-route.test.ts
run api-prof apps/api npx tsx --test --test-name-pattern=H2 tests/chat-profile.test.ts
run api-chat apps/api npx tsx --test tests/chat.test.ts
run api-openapi apps/api npx tsx --test tests/student-openapi.test.ts
run tsc-eng packages/engine npx tsc --noEmit
run tsc-prov packages/providers npx tsc --noEmit
run tsc-api apps/api npx tsc --noEmit
echo "ALLDONE $(date -Iseconds)" >> $L/summary.txt
