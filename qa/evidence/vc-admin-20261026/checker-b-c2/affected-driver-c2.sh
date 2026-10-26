set -u
R=/d/vc/.worktrees/vca-int
echo "== apps/api (VA1 VA5 VA6 VA8 VA12 affected)"; ( cd $R/apps/api && pnpm exec tsx --test tests/admin-auth.test.ts tests/admin-routes.test.ts tests/admin-secrets-leak.test.ts tests/admin-sync.test.ts tests/chat-pathlynks.test.ts 2>&1 | grep -E '^(?|? (tests|pass|fail))' ); echo "exit_api=$?"
echo "== packages/schemas sources"; ( cd $R/packages/schemas && pnpm exec tsx --test tests/sources.test.ts 2>&1 | grep -E '^(?|? (tests|pass|fail))' )
echo "== apps/web session handlers"; ( cd $R/apps/web && pnpm exec tsx --test tests/admin-session-routes.test.ts tests/admin-client.test.ts 2>&1 | grep -E '^(?|? (tests|pass|fail))' )
echo "== typecheck schemas api web"; for p in packages/schemas apps/api apps/web; do ( cd $R/$p && pnpm exec tsc --noEmit -p . > /dev/null 2>&1; echo "$p tsc exit=$?" ); done
