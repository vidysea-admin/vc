# Checkpoint A - p1-u6w-rank-wiring cycle 0 (completed, PASS)
Evidence identity: code fe47e01 (HEAD aa70fe9 for the runs); test blobs apps/api/tests/chat-rank.test.ts:6aab785, chat-privacy.test.ts:12b752a, packages/engine/tests/rank.test.ts:f65e783; chat.ts sha256 prefix bb81f6e43e63.
Commands (VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh ...): pnpm -C apps/api exec tsx --test chat-rank chat chat-privacy chat-profile anonymous-route anonymous-zero-persistence student-openapi student-auth -> 141/141; pnpm -C packages/engine exec tsx --test tests/rank.test.ts -> 33/33; pnpm -C . -r typecheck -> exit 0.
Probes: probe-A 10/10 on fe47e01. Falsification: 9 own edits, 9 killed (qa/evidence/p1-u6w-A/mutants.txt). Differential with ranking absent: identical to base.
Result: PASS with 5 PROPOSED-ISSUEs (see verdict). Process incident disclosed in the verdict (stray dirs moved out of the worktree).
