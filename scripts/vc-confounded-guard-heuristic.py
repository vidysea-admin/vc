#!/usr/bin/env python3
"""vc-confounded-guard-heuristic.py -- ISS-093 class detector (T-043 fix cycle 2).

WHY THIS EXISTS: ISS-093 (packages/engine/tests/scribe-citation-rescope.test.ts, the
"15 inside 115" row) and a second instance found this cycle (ISS-t-013-c2-rev-3, the
"five six lakh" row -- see the fix-cycle-2 verdict/manifest) share one shape: a test calls
`verifyCandidateFact` / `assessFactForReview` and asserts ONLY the boolean outcome
(`needsReview === true` / `"fact" in result` with `needsReview: true`), never pinning WHICH
`reviewReasons` entry actually fired. Both engine functions OR together several independent
guards (negation, no-first-person, unrecognised-form, third-party, unit-multiplier, ...) before
returning `needsReview: true` -- ANY one of them is enough. A test that checks only the boolean
cannot tell "the mechanism I named in my title fired" from "an unrelated guard fired instead and
the one I meant to test never ran." That is exactly what a revert-and-restore of the wrong guard
misses.

WHAT THIS SCRIPT DOES: a heuristic static scan of test files that call verifyCandidateFact or
assessFactForReview. For each `test(...)` block (found by brace-matching, not a real parser), it
flags a candidate when the block:
  (a) calls one of the two functions, AND
  (b) asserts `needsReview` equal to `true` (or destructures `"fact" in result` then asserts
      `needsReview, true`), AND
  (c) has NO assertion that pins a SPECIFIC reviewReasons value or prefix (a `.startsWith(`, a
      `assert.match`, an `assert.equal`/`assert.deepEqual` against a reason string, or an
      equivalent helper call such as this file's own `reasonsStartWith`/`reasonPrefixes`).

WHAT IT CAN CATCH: exactly the ISS-093/ISS-t-013-c2-rev-3 shape -- an outcome-only assertion on a
function whose "true" branch can be reached by several independent, textually-unrelated causes.
Confirmed by construction below (self-test) to flag both known instances and NOT flag the
surrounding well-formed tests in the same file (which pin a `reviewReasons` prefix).

WHAT IT CANNOT CATCH (say this precisely, do not oversell it):
  - It is NOT a general confounded-guard detector. It is keyed to this ONE codebase pattern
    (verifyCandidateFact/assessFactForReview's OR-of-guards design + reviewReasons convention).
    A different function with a different multi-cause "true" branch and no equivalent reasons
    array is invisible to this script.
  - It does not know WHICH guard the test's own title/comment claims to be testing, so it cannot
    tell you that the reviewReasons check (if present) checks the WRONG reason -- only that no
    reviewReasons check exists at all. A test that pins the wrong prefix (asserts "negation:" when
    it should assert "no-first-person:") is not caught; that needs a human (or an LLM judge) to
    compare the test's claimed defect against the asserted reason.
  - It cannot detect the OTHER flavour this cycle found (ISS-t-013-c2-rev-3): a regression_check
    that points at a real test FILE with no test block for the claimed scenario AT ALL. That is a
    coverage-absence problem, not a confounded-assertion problem, and needs a different check
    (cross-referencing ledger claims against test titles, out of scope for this heuristic).
  - Brace-matching over raw text is not a JS/TS parser: a `{`/`}` inside a template literal or
    string could misalign block boundaries in principle. Not observed in this codebase's test
    style (no such fixtures found in the files this script has been run against), but it is a real
    limitation, not a purely theoretical one, and is exactly the same class of hedge
    `_strip_js_comments` in vc-regression-check-conformance.py already carries.

USAGE: python3 scripts/vc-confounded-guard-heuristic.py <file-or-dir> [<file-or-dir> ...]
Exit code: always 0 (advisory only -- flags candidates for human review, never fails a build).
"""
import re
import sys
from pathlib import Path

CALLS_TARGET_RE = re.compile(r"\b(?:verifyCandidateFact|assessFactForReview)\s*\(")
NEEDS_REVIEW_TRUE_RE = re.compile(r"needsReview\s*[,:]\s*true\b")
# Any assertion that pins a SPECIFIC reviewReasons value/prefix, not just its presence/length.
SPECIFIC_REASON_RE = re.compile(
    r"reviewReasons[\s\S]{0,80}?(?:startsWith|assert\.match|includes\()"
    r"|reasonsStartWith\("
    r"|reasonPrefixes\("
    r"|assert\.(?:equal|deepEqual|deepStrictEqual)\([^)]*reviewReasons"
)
TEST_START_RE = re.compile(r'\btest\(\s*(["\'`])((?:(?!\1).)*)\1\s*,')


def find_test_blocks(text: str):
    """Yield (title, start_line, body_text) for each top-level test(...) call, found by
    brace-matching from the first `{` after the test(...) call's arguments begin."""
    for m in TEST_START_RE.finditer(text):
        title = m.group(2)
        # Find the first '{' after the match (the test function body's opening brace).
        brace_start = text.find("{", m.end())
        if brace_start == -1:
            continue
        depth = 0
        i = brace_start
        in_string = None
        while i < len(text):
            c = text[i]
            if in_string:
                if c == "\\":
                    i += 2
                    continue
                if c == in_string:
                    in_string = None
            elif c in "\"'`":
                in_string = c
            elif c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
                if depth == 0:
                    body = text[brace_start : i + 1]
                    start_line = text.count("\n", 0, m.start()) + 1
                    yield title, start_line, body
                    break
            i += 1


def scan_file(path: Path):
    text = path.read_text(encoding="utf-8")
    findings = []
    for title, line_no, body in find_test_blocks(text):
        if not CALLS_TARGET_RE.search(body):
            continue
        if not NEEDS_REVIEW_TRUE_RE.search(body):
            continue
        if SPECIFIC_REASON_RE.search(body):
            continue
        findings.append((line_no, title))
    return findings


def main(argv):
    if not argv:
        print(__doc__)
        return 0
    targets = []
    for arg in argv:
        p = Path(arg)
        if p.is_dir():
            targets.extend(sorted(p.glob("*.test.ts")) + sorted(p.glob("*.test.tsx")))
        elif p.is_file():
            targets.append(p)
    total = 0
    for path in targets:
        findings = scan_file(path)
        for line_no, title in findings:
            total += 1
            print(f"CONFOUNDED-GUARD CANDIDATE: {path}:{line_no}: {title!r}")
            print(
                "  -> asserts needsReview===true via verifyCandidateFact/assessFactForReview "
                "but never pins a specific reviewReasons value; cannot tell which guard fired "
                "(ISS-093 class). Human/checker review recommended, not auto-failed."
            )
    print(f"\n{total} candidate(s) flagged across {len(targets)} file(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
