#!/usr/bin/env bash
W=/d/vc/.worktrees/p1-u6w; E=$W/qa/evidence/p1-u6w-A-c1
export VC_TESTLOCK_TIMEOUT_SECS=7200
echo "start $(date -Iseconds) head $(git -C $W rev-parse --short HEAD)" > $E/official-run.txt
bash /d/vc/scripts/vc-testlock.sh pnpm -C $W/apps/api exec tsx --test tests/chat-rank.test.ts tests/chat.test.ts tests/chat-privacy.test.ts tests/chat-profile.test.ts tests/anonymous-route.test.ts tests/anonymous-zero-persistence.test.ts tests/student-openapi.test.ts tests/student-auth.test.ts > $E/official-api.txt 2>&1
echo "api exit $?" >> $E/official-run.txt
bash /d/vc/scripts/vc-testlock.sh pnpm -C $W/packages/engine exec tsx --test tests/rank.test.ts > $E/official-rank.txt 2>&1
echo "rank exit $?" >> $E/official-run.txt
bash /d/vc/scripts/vc-testlock.sh pnpm -C $W -r typecheck > $E/official-typecheck.txt 2>&1
echo "typecheck exit $? end $(date -Iseconds)" >> $E/official-run.txt
