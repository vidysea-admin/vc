"""Checker-B falsification driver for P1 U7. One slim throwaway copy PER mutant, outside the bound tree.
Green-before (named tests, in the copy) -> apply ONE single-hunk edit -> red-after -> copy deleted. The bound tree is never written."""
import json, os, re, shutil, subprocess, sys, time

S = "C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad"
WT = f"{S}/p1-u7"
EV = f"{S}/u7b-ev"
TSX = f"{WT}/node_modules/.pnpm/tsx@4.23.15/node_modules/tsx/dist/cli.mjs"
ROOT = f"{S}/u7b-fals"
PATHS = ["apps/api", "packages/engine", "skills", "qa/gates", "mcp/university-kb/src/kb-client.ts", "package.json"]

API_ROUTE = "tests/anonymous-route.test.ts"
API_ZERO = "tests/anonymous-zero-persistence.test.ts"
ENG = ["tests/student-graph.test.ts", "tests/student-classify.test.ts"]

# id, file, find (exact, must occur once), replace, pkg, test files, name pattern (None = whole files), description
M = [
 ("A15a-recordGap-swallowed", "apps/api/src/anonymous.ts", 'recordGap: forbidden("recordGap"),', "recordGap: async () => {},", "apps/api", [API_ZERO], "A15a"),
 ("A15b-limiter-shared-bucket", "apps/api/src/anonymous.ts", "const key = this.digest(rawKey);", 'const key = "shared";', "apps/api", [API_ZERO], "A15b"),
 ("A15b-limit-off-by-one", "apps/api/src/anonymous.ts", "if (stamps.length >= this.opts.limit) {", "if (stamps.length > this.opts.limit) {", "apps/api", [API_ZERO], "A15b"),
 ("A15b-ambiguous-reaches-kb", "packages/engine/src/student/graph.ts", 'if (classifyQuestion(input.text).class !== "generic") {', 'if (classifyQuestion(input.text).class === "personal") {', "packages/engine", ENG, None),
 ("A15c-anon-routes-by-intent", "packages/engine/src/student/graph.ts", 'return { tool: "search_kb" as const };', "return { tool: classifyIntent(input.text) };", "packages/engine", ENG, None),
 ("A15c-extra-arg", "apps/api/src/anonymous.ts", "kb: { searchKb: (query: string) => deps.kb.searchKb(query) },", 'kb: { searchKb: (query: string) => (deps.kb.searchKb as any)(query, "tenant-x") },', "apps/api", [API_ZERO], "A15c"),
 ("A15c-kb-passthrough-ask-reachable", "apps/api/src/anonymous.ts", "kb: { searchKb: (query: string) => deps.kb.searchKb(query) },", "kb: deps.kb as any,", "apps/api", [API_ZERO], "A15c"),
 ("A20-gate-target-weakened", "apps/api/src/anonymous.ts", 'assertGoLive(route.gatesDir, "anonymous", route.now, route.approver);', 'assertGoLive(route.gatesDir, "student-routes", route.now, route.approver);', "apps/api", [API_ROUTE], "A20|startApi|node:http adapter"),
 ("A20-flag-default-on", "apps/api/src/anonymous.ts", 'if (raw === undefined || raw === "" || raw === "false") return false;', 'if (raw === "false") return false;\n  if (raw === undefined || raw === "") return true;', "apps/api", [API_ROUTE], "A20|startApi|node:http adapter"),
 ("TRACE-one-var-dropped", "apps/api/src/anonymous.ts", '"LANGCHAIN_TRACING_V2"', '"LANGCHAIN_TRACING_V2_UNUSED"', "apps/api", [API_ROUTE], "no student text is traced"),
 ("B21-any-method", "apps/api/src/anonymous.ts", 'if (req.method.toUpperCase() !== "POST") return fail(405', 'if (false) return fail(405', "apps/api", [API_ROUTE, API_ZERO], "B21|validation|errors:|U7 repair A"),
 ("B21-extra-body-keys", "apps/api/src/anonymous.ts", 'if (keys.length !== 1 || keys[0] !== "text"', 'if (keys.length < 1 || keys[0] !== "text"', "apps/api", [API_ROUTE, API_ZERO], "B21|validation|errors:|U7 repair A"),
 ("VAL-500-echo", "apps/api/src/anonymous.ts", 'return fail(500, "internal");', 'return fail(500, err instanceof Error ? err.message : "internal");', "apps/api", [API_ZERO], "validation|errors:|provider failure|U7 repair A"),
 ("B24.7-crisis-limited", "apps/api/src/anonymous.ts", 'if (crisisGuard(text).level === "none") {', "if (true) {", "apps/api", [API_ZERO], "crisis|U7 repair A"),
 ("D092-show-unverified", "packages/engine/src/student/graph.ts", 'const shown = authenticated ? guarded.claims : guarded.claims.filter((c) => c.status !== "unverified");', "const shown = guarded.claims;", "packages/engine", ENG, None),
 ("R1B-deadline-5s", "apps/api/src/anonymous.ts", "export const DEFAULT_COUNTER_DEADLINE_MS = 750;", "export const DEFAULT_COUNTER_DEADLINE_MS = 5000;", "apps/api", [API_ZERO], "U7 repair 1"),
 ("R2-clientkey-not-required", "apps/api/src/index.ts", "if (!a.clientKey && a.trustSocketAddress !== true) {", "if (false) {", "apps/api", [API_ROUTE], "U7 repair 2"),
 ("R3-no-64-reduction", "apps/api/src/anonymous.ts", ".slice(0, 4)\n    .map((g) => g.toString(16))", ".slice(0, 8)\n    .map((g) => g.toString(16))", "apps/api", [API_ZERO], "U7 repair 3"),
 ("R4-sweep-unthrottled", "apps/api/src/anonymous.ts", "export const MIN_SWEEP_INTERVAL_MS = 1_000;", "export const MIN_SWEEP_INTERVAL_MS = 0;", "apps/api", [API_ZERO], "U7 repair 4"),
 ("R5-openapi-413-missing", "apps/api/src/openapi.ts", '"413": { description: "Body larger than 256 KiB"', '"4130": { description: "Body larger than 256 KiB"', "apps/api", [API_ROUTE], "U7 repair 5"),
 ("RA-helpline-dropped", "apps/api/src/anonymous.ts", "respond(status, { error, helpline: TELE_MANAS_LINE }, headers)", "respond(status, { error }, headers)", "apps/api", [API_ZERO], "U7 repair A|validation|errors:"),
 ("RC-followup-shown", "packages/engine/src/student/graph.ts", "const followUp = authenticated ? safeFollowUp(draft.followUp, guarded.restricted) : undefined;", "const followUp = safeFollowUp(draft.followUp, guarded.restricted);", "packages/engine", ENG, None),
 ("RD-signin-helpline-dropped", "packages/engine/src/student/graph.ts", 'emptyResponse(input, "sign_in_required", ANONYMOUS_SIGN_IN_TEXT)', 'emptyResponse(input, "sign_in_required", SIGN_IN_REQUIRED_TEXT)', "packages/engine", ENG, None),
 ("RE-opaque-ids-off", "packages/engine/src/student/graph.ts", "if (!authenticated) {\n      // U7 repair E", "if (false) {\n      // U7 repair E", "packages/engine", ENG, None),
 ("RF-email-not-personal", "packages/engine/src/student/classify.ts", 'if (EMAIL.test(t)) reasons.push("email_address");', 'if (false) reasons.push("email_address");', "packages/engine", ENG, None),
]

only = set(sys.argv[1:])
os.makedirs(ROOT, exist_ok=True)


def sh(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, text=True, encoding="utf8", errors="replace", **kw)


def make_copy(dst):
    if os.path.exists(dst):
        shutil.rmtree(dst, ignore_errors=True)
    os.makedirs(dst)
    arc = subprocess.Popen(["git", "-C", WT, "archive", "HEAD", "--"] + PATHS, stdout=subprocess.PIPE)
    subprocess.run(["tar", "-x", "-C", dst], stdin=arc.stdout, check=True)
    arc.wait()
    for rel in ["node_modules", "apps/api/node_modules", "packages/engine/node_modules"]:
        sh(["cmd", "/c", "mklink", "/J", os.path.normpath(f"{dst}/{rel}"), os.path.normpath(f"{WT}/{rel}")])


def run_tests(copy, pkg, files, pattern, timeout=240):
    cmd = ["node", TSX, "--test", "--test-force-exit"]
    if pattern:
        for p in pattern.split("|") if False else [pattern]:
            cmd += [f"--test-name-pattern={p}"]
    cmd += files
    t0 = time.time()
    p = subprocess.Popen(cmd, cwd=f"{copy}/{pkg}", stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf8", errors="replace")
    try:
        out, _ = p.communicate(timeout=timeout)
        rc = p.returncode
    except subprocess.TimeoutExpired:
        subprocess.run(["taskkill", "/T", "/F", "/PID", str(p.pid)], capture_output=True)
        out, _ = p.communicate()
        rc = "TIMEOUT"
    def n(label):
        m = re.search(rf"^ℹ {label} (\d+)", out, re.M)
        return int(m.group(1)) if m else None
    failing = re.findall(r"^\s*✖ (.+?) \(", out, re.M)
    return dict(rc=rc, tests=n("tests"), passed=n("pass"), failed=n("fail"), cancelled=n("cancelled"), failing=sorted(set(failing))[:6], secs=round(time.time() - t0, 1), out=out)


results = []
for mid, rel, find, repl, pkg, files, pattern in M:
    if only and mid not in only:
        continue
    copy = f"{ROOT}/{mid}"
    make_copy(copy)
    target = f"{copy}/{rel}"
    src = open(target, encoding="utf8", newline="").read()
    src_n = src.replace("\r\n", "\n")
    crlf = "\r\n" in src
    cnt = src_n.count(find)
    row = dict(id=mid, file=rel, find_count=cnt)
    if cnt != 1:
        row["error"] = f"find string occurs {cnt} times"
        results.append(row)
        print(json.dumps(row), flush=True)
        shutil.rmtree(copy, ignore_errors=True)
        continue
    g = run_tests(copy, pkg, files, pattern)
    row["green"] = {k: g[k] for k in ("rc", "tests", "passed", "failed", "cancelled", "secs")}
    if g["rc"] != 0 or not g["passed"]:
        row["verdict"] = "COPY-NOT-GREEN"
        open(f"{EV}/fals-{mid}-green.txt", "w", encoding="utf8").write(g["out"])
    else:
        new = src_n.replace(find, repl, 1)
        if crlf:
            new = new.replace("\n", "\r\n")
        open(target, "w", encoding="utf8", newline="").write(new)
        r = run_tests(copy, pkg, files, pattern)
        row["red"] = {k: r[k] for k in ("rc", "tests", "passed", "failed", "cancelled", "secs", "failing")}
        open(f"{EV}/fals-{mid}-red.txt", "w", encoding="utf8").write(r["out"][-6000:])
        row["verdict"] = "KILLED" if (r["rc"] != 0 and (r["failed"] or 0) > 0) else ("RED-BY-CANCEL/TIMEOUT" if r["rc"] != 0 else "SURVIVED")
        # restore + re-green in the same copy
        open(target, "w", encoding="utf8", newline="").write(src)
        rr = run_tests(copy, pkg, files, pattern)
        row["restored"] = {k: rr[k] for k in ("rc", "tests", "passed", "failed")}
    results.append(row)
    print(json.dumps(row, ensure_ascii=False), flush=True)
    shutil.rmtree(copy, ignore_errors=True)

json.dump(results, open(f"{EV}/fals-summary{'-' + '-'.join(sorted(only)) if only else ''}.json", "w", encoding="utf8"), indent=1, ensure_ascii=False)
print("DONE", len(results))
