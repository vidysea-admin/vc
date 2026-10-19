#!/usr/bin/env bash
W=C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/p1-u10
E=$W/qa/evidence/p1-u10-A-c2
export VC_TESTLOCK_TIMEOUT_SECS=7200
run() { name=$1; shift; echo "START $(date -Iseconds)" > $E/$name.txt; "$@" >> $E/$name.txt 2>&1; echo "EXIT $? $(date -Iseconds)" >> $E/$name.txt; }
run official-api bash D:/vc/scripts/vc-testlock.sh pnpm -C $W/apps/api exec tsx --test tests/voice.test.ts tests/voice-audit.test.ts tests/voice-history.test.ts tests/voice-limits.test.ts tests/server.test.ts tests/student-openapi.test.ts tests/go-live-gate.test.ts
run official-db bash D:/vc/scripts/vc-testlock.sh pnpm -C $W/packages/db exec tsx --test tests/chat-threads.test.ts tests/erasure.test.ts
run official-providers bash D:/vc/scripts/vc-testlock.sh pnpm -C $W/packages/providers exec tsx --test tests/live.test.ts
run official-typecheck bash D:/vc/scripts/vc-testlock.sh pnpm -C $W -r typecheck
echo ALLDONE > $E/official.done
