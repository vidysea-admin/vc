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

# Statuses at which a finding row no longer blocks the rows it targets (ISS-093 decorative check).
RESOLVED_STATUSES = {"fixed", "verified", "verified-resolved", "closed", "wontfix", "wontfix-accepted", "resolved-for-now"}

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

# ISS-094 (T-043 fix cycle 2): direct-tsx's path-exists check alone certifies a real but
# content-free .test.ts/.tsx file as conforming, and node:test itself exits 0 with "tests 1, pass 1"
# for such a file (it counts the empty file as one implicit passing test) -- so a regression_check
# pointed at a file with no actual test() call would be indistinguishable from a genuine one, both
# statically and under real execution. Heuristic, not a JS/TS parser: strips comments, then looks for
# a call to test(/it(/describe(. A stray match inside a string literal is an acceptable false
# negative for this low-severity hardening check; it is not load-bearing for the ledger's correctness.
RE_TEST_DECL = re.compile(r"(?<![\w.])(?:test|it|describe)\s*\(")


def _strip_js_comments(text: str) -> str:
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.DOTALL)
    text = re.sub(r"//[^\n]*", "", text)
    return text


RE_DOC_GREP = re.compile(r"^grep -n '[^']+' ([\w./-]+)$")
RE_SCENARIO_REF = re.compile(r"^scenario:([\w-]+)#(SC-\d+)$")
RE_RUBRIC_REF = re.compile(r"^rubric_ref:(.+)$")


def merge_ledger(issues_path: Path):
    """Field-level latest-row-per-id merge (see module docstring). Returns dict id -> merged row,
    the ordered list of ids in first-seen order (for stable, deterministic output), the raw
    non-blank line count, and a ledger-hygiene dict (ISS-100):
      dupes: {id: [line numbers of repeats of an earlier row for that id with an identical body]}
      stale: [(id, line number)] -- an identical earlier row re-landing AFTER a different row for
             the same id (a cross-branch copy that silently reverts that id's state).
    Copies are detected by (id, canonical JSON body), so whitespace/key-order differences do not hide
    one. The merge itself still applies every line in file order (that is what every other reader of
    the ledger does); duplicates are collapsed only in the counts and reported once."""
    merged = {}
    order = []
    total_lines = 0
    seen = {}
    last_sig = {}
    dupes = {}
    stale = []
    with issues_path.open(encoding="utf-8") as f:
        for lineno, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            total_lines += 1
            row = json.loads(line)
            rid = row.get("id")
            if rid is None:
                continue
            sig = json.dumps(row, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
            if sig in seen.setdefault(rid, set()):
                dupes.setdefault(rid, []).append(lineno)
                if last_sig.get(rid) != sig:
                    stale.append((rid, lineno))
            seen[rid].add(sig)
            last_sig[rid] = sig
            if rid not in merged:
                merged[rid] = {}
                order.append(rid)
            merged[rid].update(row)
    return merged, order, total_lines, {"dupes": dupes, "stale": stale}


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


# ISS-093: a finding row of this type, while unresolved, says the regression_check of the row(s) it
# targets runs a test that does not exercise the cited defect. Targets come from an explicit
# `targets` (list) / `target` field, else from the leading "<id>'s" of the finding's title.
RE_FINDING_TARGET = re.compile(r"^\s*(ISS-[\w.-]+?)'s\b")


def decorative_findings(merged: dict, order: list):
    """Map target id -> finding id for every UNRESOLVED decorative-regression-check finding."""
    out = {}
    for fid in order:
        f = merged[fid]
        if f.get("type") != "decorative-regression-check" or f.get("status") in RESOLVED_STATUSES:
            continue
        targets = f.get("targets", f.get("target"))
        if isinstance(targets, str):
            targets = [targets]
        if not targets:
            m = RE_FINDING_TARGET.match(str(f.get("title", "")))
            targets = [m.group(1)] if m else []
        for tid in targets:
            out.setdefault(tid, fid)
    return out


# ISS-099 coverage-absence. What a row "cites", most specific first:
#   1. explicit `cited_symbols` / `cited_files` fields (a row author can state it outright);
#   2. scenario literals in the title/fix: double-quoted or backticked strings (the defect's own example
#      data -- e.g. "five six lakh"); 3+ digit numbers (600000) join them ONLY alongside such a quoted
#      literal, because a bare number in a title is as often a count or line number as example data;
#   3. otherwise the cited code: file names (stem) and identifiers (camelCase, PascalCase, snake_case).
# Tier 2 outranks tier 3 on purpose: a row whose defect is a specific scenario is not covered just
# because its test file mentions a ubiquitous identifier such as needsReview. Ledger ids (ISS-12,
# T-043, D-020) are stripped first so they never count as a cited number. A row that cites nothing
# is "unassessable" -- never guessed at.
RE_LEDGER_ID = re.compile(r"\b(?:ISS|T|D)-[\w.-]*\d[\w.-]*")
RE_LITERAL = re.compile(r'"([^"\n]{3,80})"|`([^`\n]{2,80})`')
RE_NUMBER = re.compile(r"(?<![\w.])\d{3,}(?![\w.])")
RE_CITED_FILE = re.compile(r"(?<![\w])([\w-]+)\.(?:tsx?|jsx?|mjs|py|sh)\b")
RE_IDENT = re.compile(r"\b(?:[a-z][a-z0-9]*(?:[A-Z][a-z0-9]*)+|(?:[A-Z][a-z0-9]+){2,}|[a-z][a-z0-9]*(?:_[a-z0-9]+)+)\b")


def _as_list(v):
    if v is None:
        return []
    return [v] if isinstance(v, str) else [str(x) for x in v]


def cited_tokens(row: dict):
    """Return (tier, tokens, case_sensitive) for what the row says is its defect (no tokens = nothing cited)."""
    explicit = _as_list(row.get("cited_symbols")) + _as_list(row.get("cited_files"))
    if explicit:
        return "explicit", explicit, True
    text = RE_LEDGER_ID.sub(" ", " ".join(str(row.get(k, "")) for k in ("title", "fix")))
    literals = [a or b for a, b in RE_LITERAL.findall(text)]
    if literals:
        literals += RE_NUMBER.findall(text)
    if literals:
        return "literal", list(dict.fromkeys(literals)), False
    code = list(dict.fromkeys(RE_CITED_FILE.findall(text) + RE_IDENT.findall(text)))
    return ("code", code, True) if code else ("none", [], True)


class Checker:
    def __init__(self, repo_root: Path, adapter: dict):
        self.repo_root = repo_root
        self.adapter = adapter
        self.by_name, self.by_dir = load_workspace_packages(repo_root)
        self.scenario_ids, self.scenario_feature = load_scenario_ids(repo_root, adapter)
        self.rubric_path = (adapter.get("verify") or {}).get("doc_units", {}).get("rubric")

    def path_exists(self, rel: str) -> bool:
        return (self.repo_root / rel).exists()

    def has_real_test_declaration(self, rel: str) -> bool:
        """ISS-094: does this test file contain at least one real test()/it()/describe() call?"""
        try:
            content = (self.repo_root / rel).read_text(encoding="utf-8")
        except OSError:
            return False
        return bool(RE_TEST_DECL.search(_strip_js_comments(content)))

    def _is_empty_test_file(self, rel: str) -> bool:
        """True for a zero-byte file or one holding only whitespace and comments."""
        try:
            content = (self.repo_root / rel).read_text(encoding="utf-8")
        except OSError:
            return False
        return not _strip_js_comments(content).strip()

    def coverage_absence(self, row: dict, rc: str):
        """ISS-099. For a row whose regression_check names direct-tsx test file(s): does any of them
        touch what the row cites? Returns ('n/a'|'unassessable'|'covered'|'absent', detail)."""
        files = []
        for part in re.split(r"&&|;", rc):
            m = RE_DIRECT_TSX.match(part.strip())
            if m:
                files.append(m.group(2))
        if not files:
            return "n/a", ""
        tier, tokens, case_sensitive = cited_tokens(row)
        if not tokens:
            return "unassessable", ""
        body = ""
        for rel in files:
            try:
                body += _strip_js_comments((self.repo_root / rel).read_text(encoding="utf-8")) + "\n"
            except OSError:
                pass
        hay = body if case_sensitive else body.lower()
        if any((tok if case_sensitive else tok.lower()) in hay for tok in tokens):
            return "covered", ""
        shown = ", ".join(repr(t) for t in tokens[:6]) + (" ..." if len(tokens) > 6 else "")
        return "absent", (
            f"coverage-absence (ISS-099): {', '.join(files)} exists and has tests, but none touches "
            f"what the row cites ({tier}: {shown})"
        )

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
            if self._is_empty_test_file(rel):
                return False, (
                    f"empty test file {rel} (nothing but whitespace/comments; ISS-094/ISS-099): an "
                    f"empty test file never passes, whether or not the row cites anything"
                )
            if not self.has_real_test_declaration(rel):
                return False, (
                    f"{rel} contains no real test()/it()/describe() declaration (ISS-094): "
                    f"node:test counts a content-free file as one implicit passing test, so this "
                    f"path would otherwise be indistinguishable from a genuine regression check"
                )
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
    merged, order, total_lines, hygiene = merge_ledger(issues_path)
    checker = Checker(repo_root, adapter)
    decorative = decorative_findings(merged, order)
    dupes, stale = hygiene["dupes"], hygiene["stale"]
    extra_copies = sum(len(v) for v in dupes.values())

    fv_rows = [(rid, merged[rid]) for rid in order if merged[rid].get("status") in ("fixed", "verified")]

    nonconforming = []
    weak_null = []
    conforming = 0
    unassessable = 0

    for rid, row in fv_rows:
        has_key = "regression_check" in row
        rc = row.get("regression_check") if has_key else "<MISSING KEY>"
        if not has_key:
            nonconforming.append((rid, row.get("status"), rc, "regression_check key absent"))
            continue
        status, reason = checker.conforms(rc)
        if status == "conforms" and rid in decorative:
            # ISS-093: right shape, real file, but an unresolved finding says it proves nothing.
            nonconforming.append((rid, row.get("status"), rc, (
                f"decorative regression_check ({decorative[rid]}): it runs a test that does not "
                f"exercise the cited defect (still green with the fix reverted)")))
        elif status == "conforms":
            cov, detail = checker.coverage_absence(row, rc)
            if cov == "absent":
                nonconforming.append((rid, row.get("status"), rc, detail))
                continue
            if cov == "unassessable":
                unassessable += 1
            conforming += 1
        elif status == "null":
            conforming += 1
            if not note_looks_like_null_class(row):
                weak_null.append((rid, row.get("status"), reason))
        else:
            nonconforming.append((rid, row.get("status"), rc, reason))

    total = len(fv_rows)
    rate = (conforming / total * 100.0) if total else 100.0

    # ISS-076: "fixed" is a claim, "verified" is a checker's revert-and-restore. Keep them apart.
    verified_ids = [rid for rid, r in fv_rows if r.get("status") == "verified"]
    named_unverified = [rid for rid, r in fv_rows if r.get("status") == "fixed"
                        and isinstance(r.get("regression_check"), str) and r["regression_check"].strip()]
    unnamed_fixed = [rid for rid, r in fv_rows if r.get("status") == "fixed" and rid not in set(named_unverified)]

    print(f"vc-regression-check-conformance: {total_lines} ledger lines ({total_lines - extra_copies} unique rows "
          f"after collapsing {extra_copies} duplicate cop{'y' if extra_copies == 1 else 'ies'}), "
          f"{len(order)} distinct ids (field-level merge), {total} fixed/verified rows")
    print(f"conforming: {conforming}/{total} ({rate:.1f}%)")
    print(f"coverage-unassessable: {unassessable} (conforming direct-tsx rows citing nothing extractable)")
    print(f"fixed->verified (status verified): {len(verified_ids)}")
    print(f"named-unverified (status fixed, regression_check named): {len(named_unverified)}")
    print(f"fixed, no named check (null/missing): {len(unnamed_fixed)}")
    for label, ids in (("VERIFIED", verified_ids), ("NAMED-UNVERIFIED", named_unverified),
                       ("FIXED-NO-NAMED-CHECK", unnamed_fixed)):
        if ids:
            print(f"\n{label} -- {len(ids)} row(s):")
            print("  " + ", ".join(ids))

    if dupes:
        print(f"\nDUPLICATE LEDGER ROWS -- {len(dupes)} id(s), {extra_copies} extra cop"
              f"{'y' if extra_copies == 1 else 'ies'} (identical body; collapsed in the counts, reported once):")
        for rid, lines in dupes.items():
            n = len(lines)
            print(f"  DUP   {rid}: {n} extra cop{'y' if n == 1 else 'ies'} at line(s) "
                  f"{', '.join(str(x) for x in lines)}")
    if stale:
        print(f"\nSTALE COPIES -- {len(stale)} identical copy(ies) re-landing after a different row for the same id:")
        for rid, lineno in stale:
            print(f"  STALE {rid}: line {lineno} repeats an earlier row after a newer one -- "
                  f"state-revert hazard (ISS-100)")

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
