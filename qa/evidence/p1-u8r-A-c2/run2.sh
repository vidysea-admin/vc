export VC_TESTLOCK_TIMEOUT_SECS=7200
cd C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/p1-u8r
L="bash D:/vc/scripts/vc-testlock.sh"
echo "== api official"; $L pnpm -C apps/api exec tsx --test tests/chat-privacy.test.ts tests/chat.test.ts tests/chat-profile.test.ts > C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/u8rA/o-api.txt 2>&1; echo "exit $?"; tail -9 C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/u8rA/o-api.txt
echo "== schemas official"; $L pnpm -C packages/schemas exec tsx --test tests/redact.test.ts > C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/u8rA/o-redact.txt 2>&1; echo "exit $?"; tail -9 C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/u8rA/o-redact.txt
echo "== db official"; $L pnpm -C packages/db exec tsx --test tests/student-store.test.ts > C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/u8rA/o-db.txt 2>&1; echo "exit $?"; tail -9 C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/u8rA/o-db.txt
echo "== typecheck db"; $L pnpm -C packages/db typecheck > C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/u8rA/o-tcdb.txt 2>&1; echo "exit $?"
cp C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/u8rA/probeA-api.test.ts apps/api/tests/_probeA-api.test.ts
cp C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/u8rA/probeA-redact.test.ts packages/schemas/tests/_probeA-redact.test.ts
echo "== probe redact"; $L pnpm -C packages/schemas exec tsx --test tests/_probeA-redact.test.ts > C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/u8rA/p-redact.txt 2>&1; echo "exit $?"
echo "== probe api"; $L pnpm -C apps/api exec tsx --test tests/_probeA-api.test.ts > C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/u8rA/p-api.txt 2>&1; echo "exit $?"
rm -f apps/api/tests/_probeA-api.test.ts packages/schemas/tests/_probeA-redact.test.ts
git status --short | head
