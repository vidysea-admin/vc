#!/usr/bin/env bash
# Tests for scripts/vc-regression-check-conformance.sh / .py (T-043 / ISS-076).
#
# Every test builds its own throwaway fixture tree under `mktemp -d` -- NEVER the real
# D:/vc qa/issues.jsonl or qa/adapter.json. A test that pointed the script at the real
# ledger would be testing production data, not the instrument, and could not assert a
# known-good/known-bad outcome.
#
# Run: bash scripts/vc-regression-check-conformance.test.sh
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$SCRIPT_DIR/vc-regression-check-conformance.sh"

PASS=0
FAIL=0
FAILED_NAMES=()

pass() { PASS=$((PASS+1)); echo "PASS: $1"; }
fail() { FAIL=$((FAIL+1)); FAILED_NAMES+=("$1"); echo "FAIL: $1 -- $2"; }

assert_eq() {
  local desc="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then pass "$desc"; else fail "$desc" "expected [$expected] got [$actual]"; fi
}
assert_contains() {
  local desc="$1" haystack="$2" needle="$3"
  case "$haystack" in *"$needle"*) pass "$desc" ;; *) fail "$desc" "output did not contain: $needle" ;; esac
}
assert_not_contains() {
  local desc="$1" haystack="$2" needle="$3"
  case "$haystack" in *"$needle"*) fail "$desc" "output unexpectedly contained: $needle" ;; *) pass "$desc" ;; esac
}

# Builds a fixture repo (workspace packages, a scenarios CSV, a rubric file, a doc file,
# a test file) shared by most cases below. $1 = target root dir.
build_fixture_repo() {
  local root="$1"
  mkdir -p "$root/packages/foo/tests" "$root/apps/bar/tests" "$root/qa/scenarios" "$root/qa/rubrics" "$root/docs"
  cat > "$root/packages/foo/package.json" <<'EOF'
{"name": "@vc/foo", "scripts": {"test": "tsx --test tests/*.test.ts", "typecheck": "tsc --noEmit"}}
EOF
  cat > "$root/apps/bar/package.json" <<'EOF'
{"name": "@vc/bar", "scripts": {"test": "tsx --test tests/*.test.ts"}}
EOF
  # Two distinct tsconfig.json files (deliberately different jsx settings) so a test can prove
  # direct-tsx+tsconfig requires the test file's OWN workspace tsconfig, not just any real one.
  cat > "$root/packages/foo/tsconfig.json" <<'EOF'
{"compilerOptions": {"jsx": "react-jsx"}}
EOF
  cat > "$root/apps/bar/tsconfig.json" <<'EOF'
{"compilerOptions": {"jsx": "preserve"}}
EOF
  cat > "$root/packages/foo/tests/sample.test.ts" <<'EOF'
// fixture test file, never executed by these tests
EOF
  cat > "$root/qa/scenarios/counselling-engine.csv" <<'EOF'
id,persona,type,preconditions,steps,expected
SC-001,gaurav-pm,happy,precond,steps,expected
EOF
  : > "$root/qa/rubrics/plan-doc.md"
  cat > "$root/docs/intent.md" <<'EOF'
## Non-goals
O8 personalise
EOF
  # A doc file that EXISTS, same shape as the real ISS-092 falsification (a doc wrapped in the
  # retired repo-file-arg grammar must be rejected because the shape is retired, not merely
  # because some path happens to be missing).
  cat > "$root/ARCHITECTURE.md" <<'EOF'
# fixture architecture doc
EOF
  cat > "$root/qa/adapter.json" <<'EOF'
{
  "scenarios": "qa/scenarios/counselling-engine.csv",
  "verify": {
    "doc_units": {"kind": "rubric_ref", "rubric": "qa/rubrics/plan-doc.md"}
  }
}
EOF
}

# $1 = root dir, $2 = a single JSONL line (the fixture's only ledger row/rows, newline-joined by caller)
write_issues() {
  local root="$1" content="$2"
  printf '%s\n' "$content" > "$root/qa/issues.jsonl"
}

run_checker() {
  local root="$1"
  bash "$SCRIPT" --repo-root "$root" --issues "$root/qa/issues.jsonl" --adapter "$root/qa/adapter.json" 2>&1
}

echo "== Test 1: package-filter shape conforms (pnpm --filter @vc/foo test) =="
ROOT=$(mktemp -d); build_fixture_repo "$ROOT"
write_issues "$ROOT" '{"id":"ISS-1","status":"fixed","regression_check":"pnpm --filter @vc/foo test"}'
OUT=$(run_checker "$ROOT"); RC=$?
assert_eq "package-filter: exit 0" "0" "$RC"
assert_contains "package-filter: reports 1/1 conforming" "$OUT" "conforming: 1/1"
rm -rf "$ROOT"

echo "== Test 2: package-dir shape conforms (pnpm -C apps/bar test) =="
ROOT=$(mktemp -d); build_fixture_repo "$ROOT"
write_issues "$ROOT" '{"id":"ISS-2","status":"verified","regression_check":"pnpm -C apps/bar test"}'
OUT=$(run_checker "$ROOT"); RC=$?
assert_eq "package-dir: exit 0" "0" "$RC"
rm -rf "$ROOT"

echo "== Test 3 (ISS-092, RETIRED SHAPE): repo-file-arg (pnpm -r test -- <path>) is now rejected, even though the path exists, with a reason naming the retirement =="
ROOT=$(mktemp -d); build_fixture_repo "$ROOT"
write_issues "$ROOT" '{"id":"ISS-3","status":"fixed","regression_check":"pnpm -r test -- packages/foo/tests/sample.test.ts"}'
OUT=$(run_checker "$ROOT"); RC=$?
assert_eq "repo-file-arg retired: exit 1" "1" "$RC"
assert_contains "repo-file-arg retired: names ISS-092" "$OUT" "retired 2026-09-27 (ISS-092)"
assert_contains "repo-file-arg retired: suggests direct-tsx" "$OUT" "direct-tsx"
rm -rf "$ROOT"

echo "== Test 3b (ISS-092 FALSIFICATION, the exact case that exposed the Goodhart gap): a DOC path (ARCHITECTURE.md, not a test file) wrapped in the retired grammar must still be rejected -- proves rejection is because the shape is retired, not merely because some path is missing =="
ROOT=$(mktemp -d); build_fixture_repo "$ROOT"
write_issues "$ROOT" '{"id":"ISS-3b","status":"fixed","regression_check":"pnpm -r test -- ARCHITECTURE.md"}'
OUT=$(run_checker "$ROOT"); RC=$?
assert_eq "ARCHITECTURE.md-as-regression-check: exit 1" "1" "$RC"
assert_contains "ARCHITECTURE.md-as-regression-check: rejected via the retirement reason, not a missing-path reason" "$OUT" "retired 2026-09-27 (ISS-092)"
assert_not_contains "ARCHITECTURE.md-as-regression-check: NOT accepted as conforming" "$OUT" "conforming: 1/1"
rm -rf "$ROOT"

echo "== Test 4: direct-tsx shape conforms (npx tsx --test <existing path>) =="
ROOT=$(mktemp -d); build_fixture_repo "$ROOT"
write_issues "$ROOT" '{"id":"ISS-4","status":"fixed","regression_check":"npx tsx --test packages/foo/tests/sample.test.ts"}'
OUT=$(run_checker "$ROOT"); RC=$?
assert_eq "direct-tsx: exit 0" "0" "$RC"
rm -rf "$ROOT"

echo "== Test 5: doc-grep shape conforms (grep -n '...' <existing path>) =="
ROOT=$(mktemp -d); build_fixture_repo "$ROOT"
write_issues "$ROOT" '{"id":"ISS-5","status":"fixed","regression_check":"grep -n '"'"'Non-goals'"'"' docs/intent.md"}'
OUT=$(run_checker "$ROOT"); RC=$?
assert_eq "doc-grep: exit 0" "0" "$RC"
rm -rf "$ROOT"

echo "== Test 6: scenario-ref shape conforms (scenario:<feature>#<real id>) =="
ROOT=$(mktemp -d); build_fixture_repo "$ROOT"
write_issues "$ROOT" '{"id":"ISS-6","status":"fixed","regression_check":"scenario:counselling-engine#SC-001"}'
OUT=$(run_checker "$ROOT"); RC=$?
assert_eq "scenario-ref: exit 0" "0" "$RC"
rm -rf "$ROOT"

echo "== Test 7: rubric-ref shape conforms (rubric_ref:<path == doc_units.rubric>) =="
ROOT=$(mktemp -d); build_fixture_repo "$ROOT"
write_issues "$ROOT" '{"id":"ISS-7","status":"fixed","regression_check":"rubric_ref:qa/rubrics/plan-doc.md"}'
OUT=$(run_checker "$ROOT"); RC=$?
assert_eq "rubric-ref: exit 0" "0" "$RC"
rm -rf "$ROOT"

echo "== Test 8: conjunction of two conforming shapes (&&) conforms =="
ROOT=$(mktemp -d); build_fixture_repo "$ROOT"
write_issues "$ROOT" '{"id":"ISS-8","status":"fixed","regression_check":"pnpm --filter @vc/foo test && pnpm -C apps/bar test"}'
OUT=$(run_checker "$ROOT"); RC=$?
assert_eq "conjunction: exit 0" "0" "$RC"
rm -rf "$ROOT"

echo "== Test 9: bare whole-monorepo command conforms (pnpm -r test) =="
ROOT=$(mktemp -d); build_fixture_repo "$ROOT"
write_issues "$ROOT" '{"id":"ISS-9","status":"fixed","regression_check":"pnpm -r test"}'
OUT=$(run_checker "$ROOT"); RC=$?
assert_eq "whole-monorepo: exit 0" "0" "$RC"
rm -rf "$ROOT"

echo "== Test 10: null regression_check WITH a hygiene-class note conforms, not flagged weak =="
ROOT=$(mktemp -d); build_fixture_repo "$ROOT"
write_issues "$ROOT" '{"id":"ISS-10","status":"fixed","regression_check":null,"note":"process/ledger hygiene fix, no product code changed"}'
OUT=$(run_checker "$ROOT"); RC=$?
assert_eq "null+note: exit 0" "0" "$RC"
assert_not_contains "null+note: not flagged WEAK" "$OUT" "WEAK  ISS-10"
rm -rf "$ROOT"

echo "== Test 11: null regression_check with NO explanatory note is flagged WEAK (but still exit 0) =="
ROOT=$(mktemp -d); build_fixture_repo "$ROOT"
write_issues "$ROOT" '{"id":"ISS-11","status":"fixed","regression_check":null,"note":"looks fine to me"}'
OUT=$(run_checker "$ROOT"); RC=$?
assert_eq "null-no-note: still exit 0 (null itself conforms)" "0" "$RC"
assert_contains "null-no-note: flagged WEAK" "$OUT" "WEAK  ISS-11"
rm -rf "$ROOT"

echo "== Test 12 (THE 076 CASE, missing key): regression_check absent entirely fails =="
ROOT=$(mktemp -d); build_fixture_repo "$ROOT"
write_issues "$ROOT" '{"id":"ISS-12","status":"fixed","note":"no regression_check field at all"}'
OUT=$(run_checker "$ROOT"); RC=$?
assert_eq "missing key: exit 1" "1" "$RC"
assert_contains "missing key: names the id with MISSING KEY" "$OUT" "ISS-12 [fixed] regression_check='<MISSING KEY>'"
rm -rf "$ROOT"

echo "== Test 13 (THE 076 CASE, unallowlisted): pnpm --filter @vc/<nonexistent package> test fails =="
ROOT=$(mktemp -d); build_fixture_repo "$ROOT"
write_issues "$ROOT" '{"id":"ISS-13","status":"fixed","regression_check":"pnpm --filter @vc/nope test"}'
OUT=$(run_checker "$ROOT"); RC=$?
assert_eq "unallowlisted package: exit 1" "1" "$RC"
assert_contains "unallowlisted package: names the reason" "$OUT" "no workspace package named @vc/nope"
rm -rf "$ROOT"

echo "== Test 14: script name not declared in that package's package.json fails =="
ROOT=$(mktemp -d); build_fixture_repo "$ROOT"
write_issues "$ROOT" '{"id":"ISS-14","status":"fixed","regression_check":"pnpm --filter @vc/foo lint"}'
OUT=$(run_checker "$ROOT"); RC=$?
assert_eq "unknown script: exit 1" "1" "$RC"
assert_contains "unknown script: names the reason" "$OUT" "no script 'lint'"
rm -rf "$ROOT"

echo "== Test 15 (direct-tsx+tsconfig, same workspace): a JSX-needing test file with its OWN workspace's tsconfig conforms =="
ROOT=$(mktemp -d); build_fixture_repo "$ROOT"
write_issues "$ROOT" '{"id":"ISS-15","status":"fixed","regression_check":"npx tsx --tsconfig packages/foo/tsconfig.json --test packages/foo/tests/sample.test.ts"}'
OUT=$(run_checker "$ROOT"); RC=$?
assert_eq "direct-tsx+tsconfig same workspace: exit 0" "0" "$RC"
rm -rf "$ROOT"

echo "== Test 15b (direct-tsx+tsconfig, MISMATCHED workspace): pointing --tsconfig at a DIFFERENT workspace's config than the test file's own must be rejected -- otherwise the flag could launder an unrelated config into the check =="
ROOT=$(mktemp -d); build_fixture_repo "$ROOT"
write_issues "$ROOT" '{"id":"ISS-15b","status":"fixed","regression_check":"npx tsx --tsconfig apps/bar/tsconfig.json --test packages/foo/tests/sample.test.ts"}'
OUT=$(run_checker "$ROOT"); RC=$?
assert_eq "direct-tsx+tsconfig mismatched workspace: exit 1" "1" "$RC"
assert_contains "direct-tsx+tsconfig mismatched workspace: names the reason" "$OUT" "is not the test file's own workspace tsconfig"
rm -rf "$ROOT"

echo "== Test 15c: direct-tsx+tsconfig naming a tsconfig path that does not exist fails =="
ROOT=$(mktemp -d); build_fixture_repo "$ROOT"
write_issues "$ROOT" '{"id":"ISS-15c","status":"fixed","regression_check":"npx tsx --tsconfig packages/foo/tsconfig.missing.json --test packages/foo/tests/sample.test.ts"}'
OUT=$(run_checker "$ROOT"); RC=$?
assert_eq "direct-tsx+tsconfig missing tsconfig: exit 1" "1" "$RC"
assert_contains "direct-tsx+tsconfig missing tsconfig: names the reason" "$OUT" "--tsconfig path does not exist"
rm -rf "$ROOT"

echo "== Test 15d: direct-tsx (no tsconfig) naming a path that does not exist still fails =="
ROOT=$(mktemp -d); build_fixture_repo "$ROOT"
write_issues "$ROOT" '{"id":"ISS-15d","status":"fixed","regression_check":"npx tsx --test packages/foo/tests/does-not-exist.test.ts"}'
OUT=$(run_checker "$ROOT"); RC=$?
assert_eq "direct-tsx missing file path: exit 1" "1" "$RC"
assert_contains "direct-tsx missing file path: names the reason" "$OUT" "path does not exist"
rm -rf "$ROOT"

echo "== Test 16 (THE 076 CASE, narrative-not-a-command): a parenthetical count breaks the exact-command match =="
ROOT=$(mktemp -d); build_fixture_repo "$ROOT"
write_issues "$ROOT" '{"id":"ISS-16","status":"fixed","regression_check":"pnpm -C apps/bar test (54/54 clean)"}'
OUT=$(run_checker "$ROOT"); RC=$?
assert_eq "narrative not a bare command: exit 1" "1" "$RC"
assert_contains "narrative not a bare command: matches no shape" "$OUT" "matches no allowed shape"
rm -rf "$ROOT"

echo "== Test 17 (FIELD-LEVEL MERGE, the ISS-084/ISS-056 class bug): a later partial update row that omits regression_check must inherit the earlier row's conforming value, not be treated as missing =="
ROOT=$(mktemp -d); build_fixture_repo "$ROOT"
{
  echo '{"id":"ISS-17","status":"fixed","regression_check":"pnpm --filter @vc/foo test","note":"initial"}'
  echo '{"id":"ISS-17","update":true,"status":"verified","date":"2026-09-27"}'
} > "$ROOT/qa/issues.jsonl"
OUT=$(run_checker "$ROOT"); RC=$?
assert_eq "merge inherits regression_check across update row: exit 0" "0" "$RC"
assert_contains "merge inherits regression_check across update row: counted as 1/1" "$OUT" "conforming: 1/1"
rm -rf "$ROOT"

echo "== Test 18: a row whose LATEST merged status is not fixed/verified (e.g. reopened) is excluded from the count entirely =="
ROOT=$(mktemp -d); build_fixture_repo "$ROOT"
{
  echo '{"id":"ISS-18","status":"fixed","regression_check":"pnpm --filter @vc/nope test"}'
  echo '{"id":"ISS-18","update":true,"status":"open","note":"regressed, reopened"}'
} > "$ROOT/qa/issues.jsonl"
OUT=$(run_checker "$ROOT"); RC=$?
assert_eq "reopened row excluded from fixed/verified count: exit 0" "0" "$RC"
assert_contains "reopened row excluded: 0 fixed/verified rows counted" "$OUT" "0 fixed/verified rows"
rm -rf "$ROOT"

echo "== Test 19: mixed fixture -- conformance rate is computed and printed correctly (1 conforming + 1 non-conforming = 50.0%) =="
ROOT=$(mktemp -d); build_fixture_repo "$ROOT"
{
  echo '{"id":"ISS-19a","status":"fixed","regression_check":"pnpm -r test"}'
  echo '{"id":"ISS-19b","status":"fixed","regression_check":"pnpm --filter @vc/nope test"}'
} > "$ROOT/qa/issues.jsonl"
OUT=$(run_checker "$ROOT"); RC=$?
assert_eq "mixed fixture: exit 1 (one non-conforming row present)" "1" "$RC"
assert_contains "mixed fixture: rate printed as 1/2 (50.0%)" "$OUT" "conforming: 1/2 (50.0%)"
rm -rf "$ROOT"

echo "== Test 20 (EXECUTION PROOF, ISS-092's B14 gap -- generic reproduction, not tied to the real repo): appending a path AFTER a shell glob that already expanded is inert -- actually RUNS both commands and asserts the counts are IDENTICAL, not merely regex-checked =="
XROOT=$(mktemp -d)
mkdir -p "$XROOT/tests"
cat > "$XROOT/tests/a.test.js" <<'EOF'
const { test } = require("node:test");
test("a1", () => {});
test("a2", () => {});
EOF
cat > "$XROOT/tests/b.test.js" <<'EOF'
const { test } = require("node:test");
test("b1", () => {});
EOF
# Baseline: the shell glob has already matched BOTH files before any extra arg is appended --
# this is exactly what a package.json "test": "... tests/*.test.js" script does when pnpm invokes it.
BASELINE_COUNT=$(cd "$XROOT" && node --test tests/*.test.js 2>&1 | grep -m1 '^ℹ tests ' | awk '{print $3}')
# The "repo-file-arg"-class command: same glob, PLUS a trailing path appended (simulating pnpm's
# `-- <path>` suffix reaching the already-fully-expanded script) -- must run the SAME count.
INERT_COUNT=$(cd "$XROOT" && node --test tests/*.test.js tests/a.test.js 2>&1 | grep -m1 '^ℹ tests ' | awk '{print $3}')
assert_eq "inert shape: baseline count is 3 (both files, both already globbed)" "3" "$BASELINE_COUNT"
assert_eq "inert shape: appending a path after the glob already matched everything changes NOTHING" "$BASELINE_COUNT" "$INERT_COUNT"
rm -rf "$XROOT"

echo "== Test 21 (EXECUTION PROOF): bypassing the glob to name exactly one file DOES narrow -- actually RUNS it and asserts strictly fewer tests than the baseline =="
XROOT=$(mktemp -d)
mkdir -p "$XROOT/tests"
cat > "$XROOT/tests/a.test.js" <<'EOF'
const { test } = require("node:test");
test("a1", () => {});
test("a2", () => {});
EOF
cat > "$XROOT/tests/b.test.js" <<'EOF'
const { test } = require("node:test");
test("b1", () => {});
EOF
BASELINE_COUNT=$(cd "$XROOT" && node --test tests/*.test.js 2>&1 | grep -m1 '^ℹ tests ' | awk '{print $3}')
NARROWED_COUNT=$(cd "$XROOT" && node --test tests/a.test.js 2>&1 | grep -m1 '^ℹ tests ' | awk '{print $3}')
if [ "$NARROWED_COUNT" -lt "$BASELINE_COUNT" ] 2>/dev/null; then
  pass "direct-tsx-class shape: naming one file alone runs strictly fewer tests ($NARROWED_COUNT < $BASELINE_COUNT)"
else
  fail "direct-tsx-class shape: naming one file alone runs strictly fewer tests" "got $NARROWED_COUNT vs baseline $BASELINE_COUNT (not strictly fewer)"
fi
rm -rf "$XROOT"

echo "== Test 22 (EXECUTION PROOF against the REAL repo, read-only -- the exact ISS-t-020-c0-1 case this fix cycle remapped): apps/web/tests/ui.test.tsx needs ITS OWN workspace tsconfig to run standalone via tsx; bare invocation fails, --tsconfig-qualified invocation succeeds AND narrows vs the package baseline =="
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
if [ -f "$REPO_ROOT/apps/web/tests/ui.test.tsx" ]; then
  BARE_OUT=$(cd "$REPO_ROOT" && npx tsx --test apps/web/tests/ui.test.tsx 2>&1); BARE_RC=$?
  assert_eq "bare npx tsx --test on a JSX file (no tsconfig): fails" "1" "$BARE_RC"
  assert_contains "bare npx tsx --test on a JSX file: fails with the React-is-not-defined symptom this fix cycle diagnosed" "$BARE_OUT" "React is not defined"
  QUALIFIED_OUT=$(cd "$REPO_ROOT" && npx tsx --tsconfig apps/web/tsconfig.json --test apps/web/tests/ui.test.tsx 2>&1)
  QUALIFIED_COUNT=$(echo "$QUALIFIED_OUT" | grep -m1 '^ℹ tests ' | awk '{print $3}')
  assert_contains "qualified npx tsx --tsconfig ... --test: actually runs (no failures)" "$QUALIFIED_OUT" "ℹ fail 0"
  if [ -n "$QUALIFIED_COUNT" ] && [ "$QUALIFIED_COUNT" -lt 38 ] 2>/dev/null; then
    pass "qualified run narrows vs the apps/web package baseline (38): ran $QUALIFIED_COUNT"
  else
    fail "qualified run narrows vs the apps/web package baseline (38)" "ran '$QUALIFIED_COUNT' tests, expected < 38"
  fi
else
  fail "Test 22 fixture present" "apps/web/tests/ui.test.tsx not found -- repo layout changed, update this test"
fi

echo "== Test 23: the conformance script itself now certifies the exact Test 22 command as conforming (ties the execution proof back to the static checker) =="
ROOT=$(mktemp -d); build_fixture_repo "$ROOT"
mkdir -p "$ROOT/apps/web/tests"
cat > "$ROOT/apps/web/package.json" <<'EOF'
{"name": "@vc/web", "scripts": {"test": "tsx --test tests/*.test.ts tests/*.test.tsx"}}
EOF
cat > "$ROOT/apps/web/tsconfig.json" <<'EOF'
{"compilerOptions": {"jsx": "react-jsx"}}
EOF
: > "$ROOT/apps/web/tests/ui.test.tsx"
write_issues "$ROOT" '{"id":"ISS-23","status":"fixed","regression_check":"npx tsx --tsconfig apps/web/tsconfig.json --test apps/web/tests/ui.test.tsx"}'
OUT=$(run_checker "$ROOT"); RC=$?
assert_eq "static checker certifies the real remap command: exit 0" "0" "$RC"
rm -rf "$ROOT"

echo
echo "== Summary: $PASS passed, $FAIL failed =="
if [ "$FAIL" -gt 0 ]; then
  printf 'Failed: %s\n' "${FAILED_NAMES[@]}"
  exit 1
fi
exit 0
