#!/usr/bin/env bash
# One lock hold: for each mutant copy, run the named check GREEN in the copy, apply the single-hunk edit in the copy, run it RED.
SP=/c/Users/Lenovo/AppData/Local/Temp/claude/d--vc/fe5889a6-130f-4952-9226-886a6cea9053/scratchpad
TSX=/d/vc/.worktrees/vca-int/node_modules/.pnpm/tsx@4.23.15/node_modules/tsx/dist/cli.mjs
run() { # dir pattern file
  ( cd "$1" && node "$TSX" --test --test-name-pattern="$2" "$3" 2>&1 | grep -E '^(✔|✖|ℹ (tests|pass|fail))|AssertionError|MUTATE' | cut -c1-230 )
}
step() { # label copy dir testfile pattern mutfile
  echo "===== $1"
  echo "-- GREEN-BEFORE (in copy, unmutated)"; run "$SP/fb1/$2/$3" "$4" "$5"
  echo "-- EDIT"; node "$SP/mutate.mjs" "$SP/fb1/$2/$6" "$SP/fb1-$2.old" "$SP/fb1-$2.new" || return
  echo "-- RED-AFTER (same check, mutated copy)"; run "$SP/fb1/$2/$3" "$4" "$5"
}
echo "-- m1b GREEN-BEFORE (copy m1 unmutated) api create test"; run "$SP/fb1/m1/apps/api" "fix1 R1" tests/admin-routes.test.ts
step "m1a VA1/VA8 R1 schema allow-list removed -> schemas R1 test" m1 packages/schemas "fix1 R1" tests/sources.test.ts packages/schemas/src/sources.ts
echo "-- m1b (same mutant copy) api create test"; run "$SP/fb1/m1/apps/api" "fix1 R1" tests/admin-routes.test.ts
step "m2 VA1/VA8 R1 credentialFor re-check weakened -> api legacy doc test" m2 apps/api "fix1 R1" tests/admin-sync.test.ts apps/api/src/admin-routes.ts
step "m3 VA5 set_secret minRole super-admin -> admin -> role matrix" m3 apps/api "VA5" tests/admin-routes.test.ts apps/api/src/admin-routes.ts
step "m4 VA8 R6 empty-catalogue guard removed -> frontend sync test" m4 apps/api "fix1 R6: a frontend sync" tests/admin-sync.test.ts apps/api/src/admin-routes.ts
