#!/usr/bin/env bash
W=/d/vc/.worktrees/p1-u6w
E=$W/qa/evidence/p1-u6w-B-c1
export VC_TESTLOCK_TIMEOUT_SECS=7200
date -Iseconds > $E/rerun-start.txt
bash /d/vc/scripts/vc-testlock.sh pnpm -C $W/apps/api exec tsx --test tests/chat-rank.test.ts tests/chat.test.ts tests/chat-privacy.test.ts tests/chat-profile.test.ts tests/anonymous-route.test.ts tests/anonymous-zero-persistence.test.ts tests/student-openapi.test.ts tests/student-auth.test.ts > $E/api.txt 2>&1; echo "EXIT $?" >> $E/api.txt
bash /d/vc/scripts/vc-testlock.sh pnpm -C $W/packages/engine exec tsx --test tests/rank.test.ts > $E/rank.txt 2>&1; echo "EXIT $?" >> $E/rank.txt
bash /d/vc/scripts/vc-testlock.sh pnpm -C $W -r typecheck > $E/typecheck.txt 2>&1; echo "EXIT $?" >> $E/typecheck.txt
date -Iseconds > $E/rerun-end.txt
