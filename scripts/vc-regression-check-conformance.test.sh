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

echo "== Test 3: repo-file-arg shape conforms (pnpm -r test -- <existing path>) =="
ROOT=$(mktemp -d); build_fixture_repo "$ROOT"
write_issues "$ROOT" '{"id":"ISS-3","status":"fixed","regression_check":"pnpm -r test -- packages/foo/tests/sample.test.ts"}'
OUT=$(run_checker "$ROOT"); RC=$?
assert_eq "repo-file-arg: exit 0" "0" "$RC"
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

echo "== Test 15: repo-file-arg naming a path that does not exist fails =="
ROOT=$(mktemp -d); build_fixture_repo "$ROOT"
write_issues "$ROOT" '{"id":"ISS-15","status":"fixed","regression_check":"pnpm -r test -- packages/foo/tests/does-not-exist.test.ts"}'
OUT=$(run_checker "$ROOT"); RC=$?
assert_eq "missing file path: exit 1" "1" "$RC"
assert_contains "missing file path: names the reason" "$OUT" "path does not exist"
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

echo
echo "== Summary: $PASS passed, $FAIL failed =="
if [ "$FAIL" -gt 0 ]; then
  printf 'Failed: %s\n' "${FAILED_NAMES[@]}"
  exit 1
fi
exit 0
