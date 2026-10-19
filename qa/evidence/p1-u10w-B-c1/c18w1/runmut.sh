#!/bin/bash
# usage: runmut.sh <ID>   (ID = BASE for no edit)
E=D:/vc/.worktrees/p1-u10w/qa/evidence/p1-u10w-B-c1/c18w1
S=D:/vc/.worktrees/p1-u10w-chkB-c18w1
ID=$1
cd $S 2>/dev/null
date -Iseconds > $E/$ID.start
if [ "$ID" != "BASE" ]; then
  node $E/mutate.mjs $S/apps/api/src/voice.ts $E/mutants/$ID.json || { echo MUTATE-FAILED; git -C $S checkout -- apps/api/src/voice.ts; exit 2; }
  git -C $S diff -- apps/api/src/voice.ts > $E/$ID.diff
fi
run() { # name file pattern
  local args=(--test --test-reporter=tap tests/$2)
  [ -n "$3" ] && args+=(--test-name-pattern "$3")
  VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh pnpm -C $S/apps/api exec tsx "${args[@]}" > $E/$ID.$1.log 2>&1
}
run crisis-turn voice-crisis-turn.test.ts ""
run wiring-W1 voice-wiring.test.ts "W1"
run voice-C voice.test.ts "C12|C14|C17|C18"
git -C $S checkout -- apps/api/src/voice.ts
git -C $S status --short > $E/$ID.status-after
date -Iseconds > $E/$ID.end
for f in crisis-turn wiring-W1 voice-C; do echo "== $ID $f: $(grep -E '^# (tests|pass|fail) ' $E/$ID.$f.log | tr '\n' ' ')"; done > $E/$ID.summary
echo done
