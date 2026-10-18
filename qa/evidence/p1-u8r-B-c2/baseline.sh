export VC_TESTLOCK_TIMEOUT_SECS=7200
W=C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/p1-u8r
run() { echo "### $*"; bash D:/vc/scripts/vc-testlock.sh "$@"; echo "### exit=$?"; }
run pnpm -C $W/apps/api exec tsx --test tests/chat-privacy.test.ts tests/chat.test.ts tests/chat-profile.test.ts
run pnpm -C $W/packages/schemas exec tsx --test tests/redact.test.ts
run pnpm -C $W/packages/db exec tsx --test tests/student-store.test.ts
run pnpm -C $W/packages/schemas typecheck
run pnpm -C $W/packages/db typecheck
run pnpm -C $W/apps/api typecheck
