#!/usr/bin/env bash
# Does the repo's OWN api suite notice the index.ts wiring mutant (m3: the seededSources spread removed)? Runs in the m3 throwaway copy only.
SP=/c/Users/Lenovo/AppData/Local/Temp/claude/d--vc/fe5889a6-130f-4952-9226-886a6cea9053/scratchpad/fb2b/m3/apps/api
TSX=/d/vc/.worktrees/vca-int/node_modules/.pnpm/tsx@4.23.15/node_modules/tsx/dist/cli.mjs
cd "$SP" || exit 9
grep -c "seededSources: sourcesFile" src/index.ts | sed 's/^/seededSources spread occurrences in the m3 copy of index.ts: /'
ls tests | grep -E "^(index|main)\.test\.ts$"
node "$TSX" --test tests/admin-auth.test.ts tests/admin-routes.test.ts tests/admin-secrets-leak.test.ts tests/admin-sync.test.ts tests/chat-pathlynks.test.ts tests/index.test.ts tests/main.test.ts 2>&1 | grep -E '^(✖|ℹ (tests|pass|fail))'
