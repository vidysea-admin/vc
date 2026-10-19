#!/usr/bin/env bash
export VC_TESTLOCK_TIMEOUT_SECS=7200
export TMP=D:/vc/.worktrees/p1-u10w-A-tmp TEMP=D:/vc/.worktrees/p1-u10w-A-tmp TMPDIR=D:/vc/.worktrees/p1-u10w-A-tmp
W=D:/vc/.worktrees/p1-u10w
E=$W/qa/evidence/p1-u10w-A-c1
t0=$(date +%s)
bash D:/vc/scripts/vc-testlock.sh pnpm -C $W/apps/api exec tsx --test --test-reporter=tap tests/voice.test.ts tests/voice-audit.test.ts tests/voice-history.test.ts tests/voice-limits.test.ts tests/voice-wiring.test.ts tests/voice-crisis-turn.test.ts tests/chat.test.ts > $E/api-voice-chat.txt 2>&1; echo "exit $? $(date -Iseconds)" >> $E/api-voice-chat.txt
bash D:/vc/scripts/vc-testlock.sh pnpm -C $W/packages/db exec tsx --test --test-reporter=tap tests/chat-threads.test.ts tests/erasure.test.ts tests/erasure-approver.test.ts > $E/db.txt 2>&1; echo "exit $? $(date -Iseconds)" >> $E/db.txt
bash D:/vc/scripts/vc-testlock.sh pnpm -C $W/packages/providers exec tsx --test --test-reporter=tap tests/live.test.ts > $E/providers-live.txt 2>&1; echo "exit $? $(date -Iseconds)" >> $E/providers-live.txt
bash D:/vc/scripts/vc-testlock.sh pnpm -C $W -r typecheck > $E/typecheck.txt 2>&1; echo "exit $? $(date -Iseconds)" >> $E/typecheck.txt
echo done > $E/baseline.done
