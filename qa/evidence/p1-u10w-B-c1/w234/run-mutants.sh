#!/bin/bash
S=D:/vc/.worktrees/p1-u10w-chkB-w234
E=D:/vc/.worktrees/p1-u10w/qa/evidence/p1-u10w-B-c1/w234
VOICE=apps/api/src/voice.ts
ENG=packages/engine/src/guards/escalation.ts
run() { # name file old new testfile pattern extra
  local name=$1 file=$2 old=$3 new=$4 tf=$5 pat=$6 extra=$7
  { echo "MUTANT $name"; echo "FILE $file"; echo "OLD: $old"; echo "NEW: $new"; echo "TEST $tf pattern=$pat extra=$extra"; date -Iseconds; } > $E/mut-$name.edit.txt
  python $E/mutate.py $S/$file "$old" "$new" >> $E/mut-$name.edit.txt 2>&1 || { echo "mutation failed $name" >> $E/mut-$name.edit.txt; return; }
  VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh pnpm -C $S/apps/api exec tsx --test --test-reporter=tap $extra --test-name-pattern "$pat" tests/$tf > $E/mut-$name.log 2>&1
  date -Iseconds >> $E/mut-$name.edit.txt
  git -C $S checkout -- $file
  git -C $S status --short >> $E/mut-$name.edit.txt
}
run C19base $VOICE "const connectOverlapWaitMs =" "const connectOverlapWaitMs =" voice.test.ts "C19" ""
run W2F1 $VOICE "      if (lateWork.size > 0) {" "      if (false && lateWork.size > 0) {" voice-wiring.test.ts "W2" ""
run W2F2 $VOICE "timer = setTimeout(() => resolve(true), drainTimeoutMs);" "timer = setTimeout(() => resolve(true), 2147483647);" voice-wiring.test.ts "W2" "--test-timeout=8000 --test-force-exit"
run W3F1 $VOICE "const pending = [...(lingering.get(c.key) ?? [])].filter((p) => p !== c && !p.connectDone);" "const pending: Conn[] = [];" voice-wiring.test.ts "W3" ""
run W3F2 $VOICE "timer = setTimeout(() => resolve(true), connectOverlapWaitMs);" "timer = setTimeout(() => resolve(true), 2147483647);" voice-wiring.test.ts "W3" "--test-timeout=8000 --test-force-exit"
run W4F1a $VOICE 'turns: [{ turnId, speaker: "student"' 'turns: [{ turnId: turnId + Math.random().toString(36).slice(2), speaker: "student"' voice-wiring.test.ts "W4" ""
run W4F1b $ENG '_id: `${escalationId}:${recipient.role}:${recipient.id}`,' '_id: `${escalationId}:${recipient.role}:${recipient.id}:${randomUUID()}`,' voice-wiring.test.ts "W4" ""
run C19F1 $VOICE "drainTimer = setTimeout(() => resolve(true), drainTimeoutMs);" "drainTimer = setTimeout(() => resolve(true), 2147483647);" voice.test.ts "C19" "--test-timeout=8000 --test-force-exit"
echo ALLDONE > $E/mutants.done
