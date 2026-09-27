#!/usr/bin/env python3
"""vc-regression-check-conformance.py -- ISS-076 conformance instrument (T-043).

WHY THIS EXISTS: qa/issues.jsonl's fixed/verified rows each carry a regression_check --
the command the checker is supposed to run (fix reverted -> RED, fix restored -> GREEN)
to move a row from fixed to verified. Three sweeps found the same ~42% of fixed/verified
rows carrying a regression_check qa/adapter.json's verify.shell.commands does not allow
(16 missing entirely, 34 mostly per-package `pnpm --filter @vc/<pkg> test` forms none of
the 3 whole-monorepo commands prefix verbatim) -- structurally blocking the fixed->verified
transition for those rows (root cause: no per-package narrowing convention existed).
qa/adapter.json now declares that convention under verify.narrowing. This script is the
machine check that a given regression_check actually conforms to it.

THE BUG THIS SCRIPT EXISTS TO NOT REPEAT (ISS-084/ISS-056, "count occurrences not distinct
entities"): qa/issues.jsonl is an APPEND-ONLY ledger. The same id can appear on multiple
lines: an original row, then one or more `"update": true` PATCH rows that carry only the
fields that changed (see ISS-t-032-rev-1: its `update` row carries status/date/evidence
but NOT regression_check -- the correct regression_check is the one on its earlier,
non-update row, inherited forward). Counting raw lines, or trusting only the single latest
line per id, both give a wrong answer. The correct read is a FIELD-LEVEL merge: fold every
line for an id into one accumulating dict, in file order, so a later partial update
overrides only the fields it actually names and inherits everything else.

Usage:
  python3 scripts/vc-regression-check-conformance.py [--repo-root PATH]
                                                       [--issues PATH] [--adapter PATH]
Exit code: 0 if every fixed/verified row conforms (or is null with a note), 1 otherwise.
"""
import argparse
import csv
import json
import re
import sys
from pathlib import Path

WHOLE_MONOREPO = {"pnpm -r typecheck", "pnpm -r test", "python contracts/verify_contracts.py"}

# Trailing args (a 3rd+ token) are allowed -- real usage includes both "eval:scribe
# --provider=x" (no "--" separator) and "eval:scribe -- --provider=y" (with it) -- but must
# not contain parentheses. A parenthetical is how the non-conforming rows in practice smuggle
# narrative ("(54/54 clean)") into what must otherwise be a single, literally-executable
# command; excluding "()" catches that class without rejecting real flags/paths.
RE_PACKAGE_FILTER = re.compile(r"^pnpm --filter @vc/([A-Za-z0-9_-]+) ([A-Za-z0-9:_-]+)(?:\s[^()]+)?$")
RE_PACKAGE_DIR = re.compile(r"^pnpm -C ((?:apps|packages|mcp)/[A-Za-z0-9_-]+) ([A-Za-z0-9:_-]+)(?:\s[^()]+)?$")

# RETIRED 2026-09-27 (ISS-092, T-043 fix cycle 1): this shape matched but was functionally inert --
# every workspace's own "test"/"typecheck" script is a shell glob (e.g. "tsx --test tests/*.test.ts")
# that has already expanded to the package's full file set before pnpm appends this trailing path, so
# node's test runner runs (glob matches) + (one more, already-matched, path) -- never fewer. Kept here
# (not deleted) so conforms_one() can name it explicitly and reject it with a reason, rather than
# falling through to the generic "matches no allowed shape" message, which would hide *why* a
# resurrected/copy-pasted use of this exact string is wrong. See qa/adapter.json verify.narrowing
# .retired_shapes for the full writeup and the empirical proof (checker cycle 0 + maker cycle 1).
RE_REPO_FILE_ARG_RETIRED = re.compile(r"^pnpm -r (?:test|typecheck) -- ([\w./-]+)$")

# --tsconfig is optional and exists only because bare `npx tsx --test <path>` run from repo root uses
# esbuild's default (classic) JSX transform, which throws `ReferenceError: React is not defined` for a
# workspace declaring "jsx": "react-jsx" in its own tsconfig.json (e.g. apps/web) -- empirically
# confirmed 2026-09-27 (T-043 fix cycle 1). When present, conforms_one() requires the tsconfig to exist
# AND to belong to the SAME workspace as the test file (see _workspace_dir_of), so this can't be used to
# launder an unrelated config into the check.
RE_DIRECT_TSX = re.compile(r"^npx tsx(?: --tsconfig ([\w./-]+))? --test ([\w./-]+\.test\.[jt]sx?)$")
RE_DOC_GREP = re.compile(r"^grep -n '[^']+' ([\w./-]+)$")
RE_SCENARIO_REF = re.compile(r"^scenario:([\w-]+)#(SC-\d+)$")
RE_RUBRIC_REF = re.compile(r"^rubric_ref:(.+)$")


def merge_ledger(issues_path: Path):
    """Field-level latest-row-per-id merge (see module docstring). Returns dict id -> merged row,
    plus the ordered list of ids in first-seen order (for stable, deterministic output)."""
    merged = {}
    order = []
    total_lines = 0
    with issues_path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            total_lines += 1
            row = json.loads(line)
            rid = row.get("id")
            if rid is None:
                continue
            if rid not in merged:
                merged[rid] = {}
                order.append(rid)
            merged[rid].update(row)
    return merged, order, total_lines


def load_workspace_packages(repo_root: Path):
    """Map @vc/<name> -> (dir_relpath, set-of-script-names) and dir_relpath -> same, by
    scanning apps/*/package.json, packages/*/package.json, mcp/*/package.json."""
    by_name = {}
    by_dir = {}
    for group in ("apps", "packages", "mcp"):
        base = repo_root / group
        if not base.is_dir():
            continue
        for pkg_dir in sorted(base.iterdir()):
            pkg_json = pkg_dir / "package.json"
            if not pkg_json.is_file():
                continue
            try:
                data = json.loads(pkg_json.read_text(encoding="utf-8"))
            except Exception:
                continue
            name = data.get("name")
            scripts = set((data.get("scripts") or {}).keys())
            rel_dir = f"{group}/{pkg_dir.name}"
            entry = (rel_dir, scripts)
            by_dir[rel_dir] = entry
            if name:
                # name is like "@vc/db" -> key stored as "db"
                short = name.split("/", 1)[-1] if "/" in name else name
                by_name[short] = entry
    return by_name, by_dir


def load_scenario_ids(repo_root: Path, adapter: dict):
    scen_rel = adapter.get("scenarios")
    if not scen_rel:
        return set(), None
    scen_path = repo_root / scen_rel
    feature = Path(scen_rel).stem
    ids = set()
    if scen_path.is_file():
        with scen_path.open(encoding="utf-8", newline="") as f:
            for row in csv.DictReader(f):
                if row.get("id"):
                    ids.add(row["id"])
    return ids, feature


class Checker:
    def __init__(self, repo_root: Path, adapter: dict):
        self.repo_root = repo_root
        self.adapter = adapter
        self.by_name, self.by_dir = load_workspace_packages(repo_root)
        self.scenario_ids, self.scenario_feature = load_scenario_ids(repo_root, adapter)
        self.rubric_path = (adapter.get("verify") or {}).get("doc_units", {}).get("rubric")

    def path_exists(self, rel: str) -> bool:
        return (self.repo_root / rel).exists()

    def _workspace_dir_of(self, rel: str):
        """Return the (apps|packages|mcp)/<dir> workspace prefix that `rel` lives under, or None.
        Used to require that a direct-tsx --tsconfig belongs to the SAME workspace as the test file
        it narrows to -- otherwise the flag could point at an unrelated tsconfig."""
        rel = rel.replace("\\", "/")
        best = None
        for d in self.by_dir:
            if rel == d or rel.startswith(d + "/"):
                if best is None or len(d) > len(best):
                    best = d
        return best

    def conforms_one(self, cmd: str):
        """Return (ok: bool, reason: str) for a single (non-conjunction) command string."""
        cmd = cmd.strip()
        if cmd in WHOLE_MONOREPO:
            return True, "whole-monorepo command"

        m = RE_PACKAGE_FILTER.match(cmd)
        if m:
            pkg, script = m.group(1), m.group(2)
            entry = self.by_name.get(pkg)
            if not entry:
                return False, f"no workspace package named @vc/{pkg}"
            _, scripts = entry
            if script not in scripts:
                return False, f"@vc/{pkg} package.json has no script '{script}'"
            return True, "package-filter"

        m = RE_PACKAGE_DIR.match(cmd)
        if m:
            rel_dir, script = m.group(1), m.group(2)
            entry = self.by_dir.get(rel_dir)
            if not entry:
                return False, f"no workspace directory {rel_dir}"
            _, scripts = entry
            if script not in scripts:
                return False, f"{rel_dir} package.json has no script '{script}'"
            return True, "package-dir"

        m = RE_REPO_FILE_ARG_RETIRED.match(cmd)
        if m:
            rel = m.group(1)
            return False, (
                f"shape 'repo-file-arg' was retired 2026-09-27 (ISS-092): the trailing path "
                f"('{rel}') never narrows what runs -- every workspace's own test/typecheck script "
                f"already globs its full file set before pnpm appends this argument. Use direct-tsx "
                f"('npx tsx --test {rel}') or package-filter/package-dir instead. "
                f"See qa/adapter.json verify.narrowing.retired_shapes."
            )

        m = RE_DIRECT_TSX.match(cmd)
        if m:
            tsconfig, rel = m.group(1), m.group(2)
            if not self.path_exists(rel):
                return False, f"path does not exist: {rel}"
            if tsconfig is not None:
                if not self.path_exists(tsconfig):
                    return False, f"--tsconfig path does not exist: {tsconfig}"
                test_ws = self._workspace_dir_of(rel)
                tsconfig_ws = self._workspace_dir_of(tsconfig)
                if test_ws is None or tsconfig_ws is None or test_ws != tsconfig_ws:
                    return False, (
                        f"--tsconfig {tsconfig} is not the test file's own workspace tsconfig "
                        f"(test file is under {test_ws!r}, tsconfig is under {tsconfig_ws!r})"
                    )
            return True, "direct-tsx" if tsconfig is None else "direct-tsx+tsconfig"

        m = RE_DOC_GREP.match(cmd)
        if m:
            rel = m.group(1)
            if not self.path_exists(rel):
                return False, f"path does not exist: {rel}"
            return True, "doc-grep"

        m = RE_SCENARIO_REF.match(cmd)
        if m:
            feature, scen_id = m.group(1), m.group(2)
            if self.scenario_feature and feature != self.scenario_feature:
                return False, f"scenario feature '{feature}' does not match adapter scenarios file '{self.scenario_feature}'"
            if scen_id not in self.scenario_ids:
                return False, f"scenario id {scen_id} not found in {self.adapter.get('scenarios')}"
            return True, "scenario-ref"

        m = RE_RUBRIC_REF.match(cmd)
        if m:
            path = m.group(1)
            if not self.rubric_path or path != self.rubric_path:
                return False, f"rubric_ref path '{path}' does not equal verify.doc_units.rubric '{self.rubric_path}'"
            return True, "rubric-ref"

        return False, "matches no allowed shape"

    def conforms(self, regression_check):
        """Return (status, reason) where status in {'conforms', 'null-weak', 'nonconform', 'missing'}."""
        if regression_check is None:
            return "null", "explicit null (must carry a note explaining the no-code-change class)"
        if not isinstance(regression_check, str) or not regression_check.strip():
            return "nonconform", "regression_check present but empty/non-string"
        parts = [p.strip() for p in re.split(r"&&|;", regression_check) if p.strip()]
        if not parts:
            return "nonconform", "empty after splitting conjunction"
        reasons = []
        for p in parts:
            ok, reason = self.conforms_one(p)
            if not ok:
                return "nonconform", f"conjunct '{p}': {reason}"
            reasons.append(reason)
        return "conforms", " + ".join(reasons)


# Fields the ledger has historically used to carry the "why no code-level check applies"
# explanation -- there is no single canonical field name across the ledger's history, so this
# checks all of them rather than demanding one exact key (a real gap found while building this:
# ISS-t-013r-c0-5 explains itself only via "class": "process", ISS-059's explanation lives in a
# later update row's "note" saying the underlying finding was reconciled/moot, not a code fix).
NULL_CLASS_FIELDS = ("note", "fix", "checker_note", "summary", "class", "type", "title")

NULL_CLASS_KEYWORDS = [
    "doc", "process", "hygiene", "ledger", "hook", "enforcement-path", "config",
    "no code", "no product code", "no-code", "reconciled", "no bypass", "moot",
    "false alarm", "fold", "inbox",
]


def note_looks_like_null_class(row):
    text = " ".join(str(row.get(f, "")) for f in NULL_CLASS_FIELDS).lower()
    if not text.strip():
        return False
    return any(k in text for k in NULL_CLASS_KEYWORDS)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo-root", default=".")
    ap.add_argument("--issues", default=None)
    ap.add_argument("--adapter", default=None)
    args = ap.parse_args()

    repo_root = Path(args.repo_root).resolve()
    issues_path = Path(args.issues) if args.issues else repo_root / "qa" / "issues.jsonl"
    adapter_path = Path(args.adapter) if args.adapter else repo_root / "qa" / "adapter.json"

    if not issues_path.is_file():
        print(f"vc-regression-check-conformance: no ledger at {issues_path}")
        return 2
    if not adapter_path.is_file():
        print(f"vc-regression-check-conformance: no adapter at {adapter_path}")
        return 2

    adapter = json.loads(adapter_path.read_text(encoding="utf-8"))
    merged, order, total_lines = merge_ledger(issues_path)
    checker = Checker(repo_root, adapter)

    fv_rows = [(rid, merged[rid]) for rid in order if merged[rid].get("status") in ("fixed", "verified")]

    nonconforming = []
    weak_null = []
    conforming = 0

    for rid, row in fv_rows:
        has_key = "regression_check" in row
        rc = row.get("regression_check") if has_key else "<MISSING KEY>"
        if not has_key:
            nonconforming.append((rid, row.get("status"), rc, "regression_check key absent"))
            continue
        status, reason = checker.conforms(rc)
        if status == "conforms":
            conforming += 1
        elif status == "null":
            conforming += 1
            if not note_looks_like_null_class(row):
                weak_null.append((rid, row.get("status"), reason))
        else:
            nonconforming.append((rid, row.get("status"), rc, reason))

    total = len(fv_rows)
    rate = (conforming / total * 100.0) if total else 100.0

    print(f"vc-regression-check-conformance: {total_lines} ledger lines, {len(order)} distinct ids "
          f"(field-level merge), {total} fixed/verified rows")
    print(f"conforming: {conforming}/{total} ({rate:.1f}%)")

    if weak_null:
        print(f"\nWEAK NULL (null regression_check, note does not name a no-code-change class) -- "
              f"{len(weak_null)} row(s), not counted as failures:")
        for rid, status, reason in weak_null:
            print(f"  WEAK  {rid} [{status}]: {reason}")

    if nonconforming:
        print(f"\nNON-CONFORMING -- {len(nonconforming)} row(s):")
        for rid, status, rc, reason in nonconforming:
            print(f"  FAIL  {rid} [{status}] regression_check={rc!r} -- {reason}")
        print(f"\nvc-regression-check-conformance: FAIL -- {len(nonconforming)} non-conforming row(s), "
              f"rate {rate:.1f}%")
        return 1

    print("\nvc-regression-check-conformance: PASS -- every fixed/verified row conforms")
    return 0


if __name__ == "__main__":
    sys.exit(main())
