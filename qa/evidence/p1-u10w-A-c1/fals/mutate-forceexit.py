import subprocess, sys, re, os, json, shutil, time
SRC_COPY = "D:/vc/.worktrees/p1-u10w-A-s1"
ORIG = "D:/vc/.worktrees/p1-u10w"
OUT = "D:/vc/.worktrees/p1-u10w/qa/evidence/p1-u10w-A-c1/fals"
BASH = "C:\\Program Files\\Git\\usr\\bin\\bash.exe"
os.makedirs(OUT, exist_ok=True)
V = "src/voice.ts"; I = "src/index.ts"
VW = "tests/voice-wiring.test.ts"; VC = "tests/voice-crisis-turn.test.ts"; VT = "tests/voice.test.ts"; VL = "tests/voice-limits.test.ts"
M = {
 "C18a": (V, "      capture();\n      throw err;", "      throw err;", VC),
 "C18d": (V, "const raw = c.crisisUtterances.shift();", "const raw = c.crisisUtterances[0];", VC),
 "C18g": (V, "if (typeof result === \"boolean\" ? result : result.crisis) capture();", "if (!(typeof result === \"boolean\" ? result : result.crisis)) capture();", VC),
 "W1": (V, "if (err instanceof StudentFencedError) {\n          endIfFenced(c, err);\n          return \"fenced\";", "if (err instanceof StudentFencedError || err instanceof FencedWriterDeadlineError) {\n          endIfFenced(c, err);\n          return \"fenced\";", VW),
 "W2": (V, "if (lateWork.size > 0) {", "if (false as boolean) {", VW),
 "W3": (V, "if (!(await settleLingering(c))) break;", "if (!(await Promise.resolve(false))) break;", VW),
 "W4": (V, "turns: [{ turnId, speaker: \"student\"", "turns: [{ turnId: randomUUID(), speaker: \"student\"", VW),
 "W5": (V, "if (raw === undefined || raw === \"\" || raw === \"false\") return false;", "if (raw === \"false\") return false;\n  if (raw === undefined || raw === \"\") return true;", VW),
 "W6": (V, "assertGoLive(route.gatesDir, \"voice\", route.now, route.approver);", "void assertGoLive;", VW),
 "W7": (I, "...(voice ? { onUpgrade: voice.upgrade } : {}),", "...(voice ? {} : {}),", VW),
 "W8": (I, "        await voice?.close();\n        if (liveServer)", "        if (liveServer)", VW),
 "W9": (I, "escalateForTenant: escalateForTenant ?? sharedEscalateForTenant,", "escalateForTenant: escalateForTenant,", VW),
 "A1": (V, "      audience: VOICE_WS_AUDIENCE,\n", "", VT),
 "A2": (V, "      algorithms: [\"HS256\"],\n", "", VT),
 "A3": (V, "if (usedTokens.has(claims.jti)) return refuse(socket, 401, \"Unauthorized\");", "if (false as boolean) return refuse(socket, 401, \"Unauthorized\");", VT),
 "A4": (V, "if (!claims || claims.studentId !== m[1] || claims.threadId !== m[2]) return refuse(socket, 401, \"Unauthorized\");", "if (!claims) return refuse(socket, 401, \"Unauthorized\");", VT),
 "A6": (V, "let remainingMs = limits.voiceMinutesPerMonth * 60_000 - used;\n    if (remainingMs <= 0) {", "let remainingMs = limits.voiceMinutesPerMonth * 60_000 - used;\n    if (remainingMs < -1e15) {", VL),
}
JUNCTIONS = ["node_modules", "apps/api/node_modules", "packages/db/node_modules", "packages/engine/node_modules", "packages/providers/node_modules", "packages/schemas/node_modules"]

def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True, encoding="utf8", errors="replace")

def mk_copy(i):
    d = f"D:/vc/.worktrees/p1-u10w-A-m-{i}"
    if os.path.exists(d): rm_copy(d)
    run(["robocopy", SRC_COPY.replace("/", "\\"), d.replace("/", "\\"), "/E", "/XD", "node_modules", "/NFL", "/NDL", "/NJH", "/NJS", "/NP"])
    for j in JUNCTIONS:
        t = f"{ORIG}/{j}"
        if os.path.exists(t):
            os.makedirs(os.path.dirname(f"{d}/{j}"), exist_ok=True)
            run(["powershell", "-NoProfile", "-Command", f"New-Item -ItemType Junction -Path '{d}/{j}' -Target '{t}' | Out-Null"])
    return d

def rm_copy(d):
    for j in JUNCTIONS:
        p = f"{d}/{j}"
        if os.path.exists(p):
            run(["cmd", "/c", "rmdir", p.replace("/", "\\")])
    shutil.rmtree(d, ignore_errors=True)

def test(d, tf):
    env = dict(os.environ, VC_TESTLOCK_TIMEOUT_SECS="7200", TMP="D:/vc/.worktrees/p1-u10w-A-tmp", TEMP="D:/vc/.worktrees/p1-u10w-A-tmp", TMPDIR="D:/vc/.worktrees/p1-u10w-A-tmp")
    p = subprocess.run([BASH, "D:/vc/scripts/vc-testlock.sh", "pnpm", "-C", d + "/apps/api", "exec", "tsx", "--test", "--test-force-exit", "--test-timeout=120000", "--test-reporter=tap", tf], capture_output=True, text=True, encoding="utf8", errors="replace", env=env)
    log = p.stdout + p.stderr
    ps = re.search(r"^# pass (\d+)", log, re.M); fl = re.search(r"^# fail (\d+)", log, re.M)
    return log, (int(ps.group(1)) if ps else None), (int(fl.group(1)) if fl else None)

ids = sys.argv[1:] or list(M)
res = {}
if os.path.exists(f"{OUT}/summary.json"):
    res = json.load(open(f"{OUT}/summary.json"))
for i in ids:
    f, a, b, tf = M[i]
    t0 = time.time()
    d = mk_copy(i)
    try:
        lg, gp, gf = test(d, tf)
        open(f"{OUT}/{i}.green.log", "w", encoding="utf8").write(lg)
        path = f"{d}/apps/api/{f}"
        raw = open(path, encoding="utf8", newline="").read()
        NL = "\r\n" if "\r\n" in raw else "\n"
        a2, b2 = a.replace("\n", NL), b.replace("\n", NL)
        n = raw.count(a2)
        if n != 1:
            res[i] = {"edit": a[:60], "file": tf, "green": [gp, gf], "verdict": f"UNVERIFIED (old string occurs {n}x)"}
            print(i, res[i], flush=True); continue
        if gf != 0 or not gp:
            res[i] = {"edit": a[:60], "file": tf, "green": [gp, gf], "verdict": "UNVERIFIED (copy not green)"}
            print(i, res[i], flush=True); continue
        open(path, "w", encoding="utf8", newline="").write(raw.replace(a2, b2))
        lg2, rp, rf = test(d, tf)
        open(f"{OUT}/{i}.red.log", "w", encoding="utf8").write(lg2)
        failing = re.findall(r"^\s*not ok \d+ - (.*)$", lg2, re.M)
        res[i] = {"edit": a[:70], "file": tf, "green": [gp, gf], "red": [rp, rf], "failing": failing[:6],
                  "verdict": "killed" if (rf or 0) > 0 else "SURVIVES", "secs": round(time.time() - t0)}
    finally:
        rm_copy(d)
    print(i, res[i], flush=True)
    json.dump(res, open(f"{OUT}/summary.json", "w"), indent=1)
json.dump(res, open(f"{OUT}/summary.json", "w"), indent=1)
print("ALLDONE", flush=True)
