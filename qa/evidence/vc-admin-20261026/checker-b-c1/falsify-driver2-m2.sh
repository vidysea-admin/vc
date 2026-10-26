#!/usr/bin/env bash
SP=/c/Users/Lenovo/AppData/Local/Temp/claude/d--vc/fe5889a6-130f-4952-9226-886a6cea9053/scratchpad
TSX=/d/vc/.worktrees/vca-int/node_modules/.pnpm/tsx@4.23.15/node_modules/tsx/dist/cli.mjs
run() { ( cd "$1" && node "$TSX" --test --test-name-pattern="$2" "$3" 2>&1 | grep -E '^(✔|✖|ℹ (tests|pass|fail))|AssertionError|MUTATE|ENOENT' | cut -c1-260 ); }
# restore m2 to the pristine post-change state and add the fixture dir the test reads
cp /d/vc/.worktrees/vca-int/apps/api/src/admin-routes.ts "$SP/fb1/m2/apps/api/src/admin-routes.ts"
mkdir -p "$SP/fb1/m2/packages/engine/tests" && cp -r /d/vc/.worktrees/vca-int/packages/engine/tests/fixtures "$SP/fb1/m2/packages/engine/tests/fixtures"
cmp /d/vc/.worktrees/vca-int/apps/api/src/admin-routes.ts "$SP/fb1/m2/apps/api/src/admin-routes.ts" && echo "m2 admin-routes.ts identical to the repo file"
echo "===== m2 VA1/VA8 R1 credentialFor re-check weakened (typeof only) -> stored legacy doc test"
echo "-- GREEN-BEFORE (copy)"; run "$SP/fb1/m2/apps/api" "fix1 R1" tests/admin-sync.test.ts
echo "-- EDIT"; node "$SP/mutate.mjs" "$SP/fb1/m2/apps/api/src/admin-routes.ts" "$SP/fb1-m2.old" "$SP/fb1-m2.new"
echo "-- RED-AFTER"; run "$SP/fb1/m2/apps/api" "fix1 R1" tests/admin-sync.test.ts
