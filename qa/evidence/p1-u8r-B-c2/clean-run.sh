export VC_TESTLOCK_TIMEOUT_SECS=7200
C=C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/p1-u8r-B-clean
run() { echo "### $*"; bash D:/vc/scripts/vc-testlock.sh "$@"; echo "### exit=$?"; }
run pnpm -C $C/apps/api exec tsx --test tests/chat-privacy.test.ts tests/chat.test.ts tests/chat-profile.test.ts
run pnpm -C $C/packages/schemas exec tsx --test tests/redact.test.ts
run pnpm -C $C/packages/db exec tsx --test tests/student-store.test.ts
run pnpm -C $C/packages/schemas typecheck
run pnpm -C $C/packages/db typecheck
run pnpm -C $C/apps/api typecheck
run pnpm -C $C/apps/api exec tsx --test $C/qa/evidence/p1-u8r-B-c2/probe-b.test.ts $C/qa/evidence/p1-u8r-B-c2/probe-c2.test.ts
