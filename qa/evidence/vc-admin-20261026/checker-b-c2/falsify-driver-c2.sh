#!/usr/bin/env bash
# Checker B cycle 2 falsification: one mutant per repaired criterion, each in its OWN throwaway copy of apps/api outside the repo.
# For each: GREEN-BEFORE (unmutated copy), apply one single-hunk edit in the copy, RED-AFTER (same probe, mutated copy). The repo tree is never edited.
set -u
SP=/c/Users/Lenovo/AppData/Local/Temp/claude/d--vc/fe5889a6-130f-4952-9226-886a6cea9053/scratchpad/fb2b
REPO=/d/vc/.worktrees/vca-int
EV=$REPO/qa/evidence/vc-admin-20261026/checker-b-c2
TSX=$REPO/node_modules/.pnpm/tsx@4.23.15/node_modules/tsx/dist/cli.mjs
ONLY=${1:-all}
[ "$ONLY" = all ] && rm -rf "$SP"; mkdir -p "$SP"
mkcopy() { # name
  local d="$SP/$1"; mkdir -p "$d/apps/api" "$d/packages/engine/tests"
  cp -r "$REPO/apps/api/src" "$REPO/apps/api/tests" "$REPO/apps/api/package.json" "$d/apps/api/"
  cp -r "$REPO/config" "$d/config"; ln -s "$REPO/skills" "$d/skills"
  cp -r "$REPO/packages/engine/tests/fixtures" "$d/packages/engine/tests/fixtures"
  mkdir -p "$d/apps/api/node_modules"
  for e in "$REPO/apps/api/node_modules/"* "$REPO/apps/api/node_modules/.bin"; do [ -e "$e" ] && ln -s "$e" "$d/apps/api/node_modules/$(basename "$e")"; done
  # probes: point the repo-file imports at the COPY's apps/api (packages stay the real, unmutated ones)
  for p in probe-h1-c2 probe-startapi-c2; do
    sed -e "s#R + \"apps/#RC + \"apps/#g" -e "s#^const R = \"file:///D:/vc/.worktrees/vca-int/\";#const R = \"file:///D:/vc/.worktrees/vca-int/\"; const RC = \"file:///C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/fe5889a6-130f-4952-9226-886a6cea9053/scratchpad/fb2b/$1/\";#" "$EV/$p.mts" > "$d/apps/api/$p.mts"
  done
}
run() { # dir file pattern
  ( cd "$1" && node "$TSX" --test --test-name-pattern="$3" "$2" 2>&1 | grep -E '^(✔|✖|ℹ (tests|pass|fail))|AssertionError|MUTATE|Error:' | cut -c1-260 )
}
mut() { # copyname file oldtext newtext (single exact replacement)
  node -e '
const fs=require("fs");const [f,o,n]=process.argv.slice(1);let s=fs.readFileSync(f,"utf8");
const i=s.indexOf(o); if(i<0||s.indexOf(o,i+1)>=0){console.error("MUTATE FAIL: old text not exactly once");process.exit(2)}
fs.writeFileSync(f,s.slice(0,i)+n+s.slice(i+o.length));console.log("mutated "+f)' "$2" "$3" "$4"
}
ROUTES=apps/api/src/admin-routes.ts

if [ "$ONLY" = all ]; then mkcopy m1; mkcopy m2; fi
rm -rf "$SP/m3"; mkcopy m3
if [ "$ONLY" = all ]; then
echo "===== m1 VA1/VA8: boundEnvRef ignores the host (env credential follows the id/ref but not the host) -> probe P3 / P5"
echo "-- GREEN-BEFORE"; run "$SP/m1/apps/api" probe-h1-c2.mts "P3|P5"
echo "-- EDIT"; mut m1 "$SP/m1/$ROUTES" "lower(c.host) === seed.host.toLowerCase() && c.port === seed.port" "c.port === seed.port"
echo "-- RED-AFTER"; run "$SP/m1/apps/api" probe-h1-c2.mts "P3|P5"
echo
echo "===== m2 VA6: a 429-limited login no longer writes its audit row -> probe P6"
echo "-- GREEN-BEFORE"; run "$SP/m2/apps/api" probe-h1-c2.mts "P6"
echo "-- EDIT"; mut m2 "$SP/m2/$ROUTES" "    if (!verdict.allowed) {
      await auditFailedLogin(UNKNOWN_ACTOR);" "    if (!verdict.allowed) {"
echo "-- RED-AFTER"; run "$SP/m2/apps/api" probe-h1-c2.mts "P6"
fi
echo
echo "===== m3 VA1 positive side (seeded sources keep their credential): index.ts drops the seededSources spread -> startApi probe"
echo "-- GREEN-BEFORE"; run "$SP/m3/apps/api" probe-startapi-c2.mts "startApi"
echo "-- EDIT"; mut m3 "$SP/m3/apps/api/src/index.ts" "...(sourcesFile ? { seededSources: sourcesFile.sources } : {})," ""
echo "-- RED-AFTER"; run "$SP/m3/apps/api" probe-startapi-c2.mts "startApi"
