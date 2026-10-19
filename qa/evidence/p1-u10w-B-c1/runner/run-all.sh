#!/bin/bash
E=D:/vc/.worktrees/p1-u10w/qa/evidence/p1-u10w-B-c1/runner
S=D:/vc/.worktrees/p1-u10w-chkB-s1
export VC_TESTLOCK_TIMEOUT_SECS=7200
L="bash D:/vc/scripts/vc-testlock.sh"
run(){ name=$1; shift; echo "START $name $(date -Iseconds)" >> $E/progress.txt; "$@" > $E/$name.log 2>&1; echo "END $name exit=$? $(date -Iseconds)" >> $E/progress.txt; }
run item1-voice-chat $L pnpm -C $S/apps/api exec tsx --test --test-reporter=tap tests/voice.test.ts tests/voice-audit.test.ts tests/voice-history.test.ts tests/voice-limits.test.ts tests/voice-wiring.test.ts tests/voice-crisis-turn.test.ts tests/chat.test.ts
run item2-full-api $L pnpm -C $S/apps/api exec tsx --test --test-reporter=tap tests/*.test.ts
run item3-db $L pnpm -C $S/packages/db exec tsx --test --test-reporter=tap tests/chat-threads.test.ts tests/erasure.test.ts tests/erasure-approver.test.ts
run item4-providers $L pnpm -C $S/packages/providers exec tsx --test --test-reporter=tap tests/live.test.ts
run item5-typecheck $L pnpm -C $S -r typecheck
run item7-voice-chat-rerun $L pnpm -C $S/apps/api exec tsx --test --test-reporter=tap tests/voice.test.ts tests/voice-audit.test.ts tests/voice-history.test.ts tests/voice-limits.test.ts tests/voice-wiring.test.ts tests/voice-crisis-turn.test.ts tests/chat.test.ts
echo ALLDONE >> $E/progress.txt
