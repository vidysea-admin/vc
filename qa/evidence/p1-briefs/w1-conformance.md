# Build brief: w1-conformance (/maker build subagent)

**Slug:** w1-conformance. Follow every rule in `qa/evidence/p1-briefs/w1-common-rules.md`, and read it first.

- **Tier:** M (qa tooling).
- **Dual check:** no.
- **Python:** allowed in this unit only as `python -I scripts/vc-regression-check-conformance.py ...` and to run its own test file. Never pipe a heredoc into python.
- **Never edit `qa/issues.jsonl`.** The checker owns it.

## Read first
- `qa/issues.jsonl` rows ISS-076, ISS-093, ISS-099 and ISS-100
- `scripts/vc-regression-check-conformance.py` and its tests
- `qa/adapter.json`, key `verify.narrowing`

## Acceptance

**Q1 (ISS-093).** The script reports a decorative regression_check as non-conforming. A decorative check runs a test that does not exercise the cited defect; ISS-t-013-rev-1 is an example. Test it with a fixture row.

**Q2 (ISS-099).**
- The script reports coverage-absence: a row whose regression test file exists but has no test touching the cited file or symbol.
- An empty test file never passes. This is the companion of ISS-094.

**Q3 (ISS-100).** Ledger rows copied across branches (same id, identical body) are detected and reported once, not counted twice.

**Q4 (ISS-076).**
- The report lists fixed->verified rows separately from named-unverified rows, and prints both counts.
- Record both counts for main in the manifest.
