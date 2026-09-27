#!/usr/bin/env bash
# Self-test for scripts/vc-confounded-guard-heuristic.py (T-043 fix cycle 2, ISS-093 successor).
# Builds throwaway fixture .test.ts files under mktemp -d -- never scans the real repo for its
# pass/fail assertions (the real-repo run is a separate, reported-not-asserted smoke check below).
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$SCRIPT_DIR/vc-confounded-guard-heuristic.py"

PASS=0
FAIL=0
FAILED_NAMES=()
pass() { PASS=$((PASS+1)); echo "PASS: $1"; }
fail() { FAIL=$((FAIL+1)); FAILED_NAMES+=("$1"); echo "FAIL: $1 -- $2"; }

ROOT=$(mktemp -d)

cat > "$ROOT/confounded.test.ts" <<'EOF'
import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyCandidateFact } from "../src/scribe/nodes.js";

test("auto-verify NEGATIVE: a confounded fixture (no reviewReasons check)", () => {
  const result = verifyCandidateFact(raw, turns, SESSION_ENDED);
  assert.ok("fact" in result);
  if ("fact" in result) {
    assert.equal(result.fact.needsReview, true, "must never auto-verify");
  }
});
EOF

cat > "$ROOT/clean.test.ts" <<'EOF'
import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyCandidateFact } from "../src/scribe/nodes.js";

test("auto-verify NEGATIVE: a well-formed fixture (pins the specific reason)", () => {
  const result = verifyCandidateFact(raw, turns, SESSION_ENDED);
  assert.ok("fact" in result);
  if ("fact" in result) {
    assert.equal(result.fact.needsReview, true);
    assert.ok(reasonsStartWith(result.fact.reviewReasons, "no-first-person:"), "named reason");
  }
});
EOF

cat > "$ROOT/unrelated.test.ts" <<'EOF'
import { test } from "node:test";
import assert from "node:assert/strict";

test("some other function entirely, not in scope", () => {
  assert.equal(1 + 1, 2);
});
EOF

OUT=$(python3 "$SCRIPT" "$ROOT")

case "$OUT" in
  *"confounded.test.ts:5"*) pass "flags the confounded fixture at its test() line" ;;
  *) fail "flags the confounded fixture" "output: $OUT" ;;
esac
case "$OUT" in
  *"clean.test.ts"*) fail "does NOT flag the well-formed fixture" "output unexpectedly named clean.test.ts: $OUT" ;;
  *) pass "does NOT flag the well-formed fixture (pins a specific reviewReasons prefix)" ;;
esac
case "$OUT" in
  *"unrelated.test.ts"*) fail "does NOT flag an unrelated test" "output: $OUT" ;;
  *) pass "does NOT flag an unrelated test (no verifyCandidateFact/assessFactForReview call at all)" ;;
esac
case "$OUT" in
  *"1 candidate(s) flagged across 3 file(s)."*) pass "exactly one candidate flagged, out of three fixture files" ;;
  *) fail "exactly one candidate flagged" "output: $OUT" ;;
esac

rm -rf "$ROOT"

echo
echo "== Real-repo smoke check (reported, not asserted -- real content can legitimately change) =="
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
REAL_OUT=$(python3 "$SCRIPT" "$REPO_ROOT/packages/engine/tests" 2>&1)
echo "$REAL_OUT" | tail -3

echo
echo "== Summary: $PASS passed, $FAIL failed =="
if [ "$FAIL" -gt 0 ]; then
  printf 'Failed: %s\n' "${FAILED_NAMES[@]}"
  exit 1
fi
exit 0
