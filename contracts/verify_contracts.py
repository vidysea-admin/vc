#!/usr/bin/env python3
"""verify_contracts.py -- Lab Protocol frozen-contract validator (the gate's teeth).

Loads contracts/contracts.json; for each frozen stage whose output file exists,
checks required fields + types on a sample of rows and evaluates declared
invariants. Exits non-zero with a per-stage report on any failure -- so a "fix"
that would break a downstream contract fails HERE, before the pipeline rerun does.

/init-lab tailors this skeleton to the project (file formats, invariant grammar).
V3.3 country-dedup projects wire graduated contracts into the /data-quality-auditor
registry instead -- do not maintain both.

Usage: python contracts/verify_contracts.py [--sample N] [--repo-root PATH]
"""
import argparse
import json
import sys
from pathlib import Path

TYPE_MAP = {
    "string": str,
    "int": int,
    "float": (int, float),
    "bool": bool,
    "list": list,
    "dict": dict,
}


def load_rows(path: Path, sample: int):
    """Read up to `sample` rows from a .jsonl or .json output file."""
    rows = []
    if path.suffix == ".jsonl":
        with path.open(encoding="utf-8") as f:
            for i, line in enumerate(f):
                if i >= sample:
                    break
                line = line.strip()
                if line:
                    rows.append(json.loads(line))
    else:
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, list):
            rows = data[:sample]
        else:
            rows = [data]
    return rows


def check_stage(name: str, spec: dict, repo_root: Path, sample: int):
    """Return a list of failure strings for one frozen stage (empty = green)."""
    failures = []
    out_rel = spec.get("output_file")
    if not out_rel:
        return [f"{name}: contract has no output_file declared"]
    out_path = repo_root / out_rel
    if not out_path.exists():
        # Missing output is not a contract violation by itself (stage may not have
        # run yet) -- report as a skip, not a failure.
        print(f"  SKIP {name}: output not present ({out_rel})")
        return failures

    try:
        rows = load_rows(out_path, sample)
    except Exception as exc:  # malformed output IS a contract violation
        return [f"{name}: cannot parse {out_rel}: {exc}"]
    if not rows:
        return [f"{name}: {out_rel} contains zero rows"]

    required = spec.get("required_fields", {})
    for idx, row in enumerate(rows):
        for field, type_name in required.items():
            if field not in row or row[field] is None:
                failures.append(f"{name}: row {idx} missing required field '{field}'")
                continue
            expected = TYPE_MAP.get(type_name)
            if expected and not isinstance(row[field], expected):
                failures.append(
                    f"{name}: row {idx} field '{field}' expected {type_name}, "
                    f"got {type(row[field]).__name__}"
                )

    for inv in spec.get("invariants", []):
        # Supported invariant grammar (extend per project at /graduate time):
        #   "<field> is unique"
        #   "<field> is non-empty"
        parts = inv.split()
        if len(parts) == 3 and parts[1] == "is" and parts[2] == "unique":
            field = parts[0]
            values = [r.get(field) for r in rows if field in r]
            if len(values) != len(set(values)):
                failures.append(f"{name}: invariant violated -- '{field}' not unique in sample")
        elif len(parts) == 3 and parts[1] == "is" and parts[2] == "non-empty":
            field = parts[0]
            if any(not r.get(field) for r in rows):
                failures.append(f"{name}: invariant violated -- '{field}' empty in sample")
        else:
            print(f"  NOTE {name}: invariant '{inv}' not machine-checkable by this skeleton -- verify manually or extend the grammar")
    return failures


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sample", type=int, default=500)
    ap.add_argument("--repo-root", default=".")
    args = ap.parse_args()

    repo_root = Path(args.repo_root).resolve()
    contracts_path = repo_root / "contracts" / "contracts.json"
    if not contracts_path.exists():
        print(f"verify_contracts: no contracts file at {contracts_path}")
        sys.exit(2)

    spec = json.loads(contracts_path.read_text(encoding="utf-8"))
    stages = spec.get("stages", {})
    if not stages:
        print("verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity")
        sys.exit(0)

    all_failures = []
    for name, stage_spec in stages.items():
        frozen_by = stage_spec.get("frozen_by", "?")
        print(f"Checking stage '{name}' (frozen via {frozen_by})...")
        all_failures.extend(check_stage(name, stage_spec, repo_root, args.sample))

    if all_failures:
        print(f"\nverify_contracts: FAIL -- {len(all_failures)} violation(s):")
        for f in all_failures:
            print(f"  FAIL {f}")
        sys.exit(1)
    print("\nverify_contracts: PASS -- all frozen contracts hold")
    sys.exit(0)


if __name__ == "__main__":
    main()
