#!/usr/bin/env bash
cd /d/vc/.worktrees/p1-u10s-checkB-fals/apps/api
export TMP=D:/vc/.worktrees/p1-u10s-tmpB TEMP=D:/vc/.worktrees/p1-u10s-tmpB VC_TESTLOCK_TIMEOUT_SECS=7200
OUT=/d/vc/.worktrees/p1-u10s/qa/evidence/p1-u10s-check-B
S=/d/vc/.worktrees/p1-u10s
run(){ bash D:/vc/scripts/vc-testlock.sh pnpm exec tsx --test tests/voice-crisis-turn.test.ts tests/chat.test.ts tests/probeB.test.ts > "$OUT/$1.log" 2>&1; echo "EXIT=$?" >> "$OUT/$1.log"; }
restore(){ cp $S/apps/api/src/voice.ts src/voice.ts; cp $S/apps/api/src/chat.ts src/chat.ts; }
restore; run green
for m in M1 M3 M4; do python /d/vc/.worktrees/p1-u10s-checkB-fals/mut.py $m || echo "MUTFAIL $m" >> $OUT/$m.log; run mut-$m; restore; done
run restored
echo ALLDONE > $OUT/runall.done
