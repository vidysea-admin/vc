#!/usr/bin/env bash
set -uo pipefail
export PATH="/c/Program Files/Git/usr/bin:$PATH"
cd /d/vc/.worktrees/t047-crisis
cd packages/engine
node node_modules/tsx/dist/cli.mjs --test --test-concurrency=1 tests/*.test.ts evals/*.test.ts > ../../qa/evidence/t047-primary/engine.log 2>&1
engine=$?
cd ../../apps/api
node node_modules/tsx/dist/cli.mjs --test --test-concurrency=1 tests/*.test.ts > ../../qa/evidence/t047-primary/api.log 2>&1
api=$?
cd ../..
for cfg in packages/engine/tsconfig.json packages/engine/evals/tsconfig.json packages/engine/scripts/tsconfig.json packages/db/tsconfig.json packages/providers/tsconfig.json packages/schemas/tsconfig.json packages/observability/tsconfig.json apps/api/tsconfig.json apps/web/tsconfig.json mcp/student-profile/tsconfig.json mcp/university-kb/tsconfig.json; do
node node_modules/typescript/bin/tsc --noEmit -p "$cfg" >> qa/evidence/t047-primary/types.log 2>&1
printf '%s EXIT%s\n' "$cfg" "$?" >> qa/evidence/t047-primary/types.log
done
printf 'ENGINE_EXIT%s API_EXIT%s\n' "$engine" "$api"
