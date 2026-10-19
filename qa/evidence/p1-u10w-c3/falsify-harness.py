import subprocess, sys, re, os, json
W = "D:/vc/.worktrees/p1-u10w-fals"
SRC = W + "/apps/api/src/voice.ts"
OUT = "D:/vc/.worktrees/p1-u10w-c3scratch/fals"
M = {
 "C18a": ("drop the capture on a throwing detector", "      capture();\n      throw err;", "      throw err;", "tests/voice-crisis-turn.test.ts"),
 "C18b": ("escalation ignores the captured words (always the marker)", "    const words = raw !== undefined && raw !== \"\" && c.persistText ? clamp(redact(c, raw), 2000) : undefined;", "    const words = undefined as string | undefined; void raw;", "tests/voice-crisis-turn.test.ts"),
 "C18c": ("capture not trimmed (a whitespace-only utterance counts as words)", "push(c.persistText ? text.trim() : undefined)", "push(c.persistText ? text : undefined)", "tests/voice-crisis-turn.test.ts"),
 "C18d": ("captured words not consumed (peek, not shift)", "const raw = c.crisisUtterances.shift();", "const raw = c.crisisUtterances[0];", "tests/voice-crisis-turn.test.ts"),
 "C18e": ("back to seq adjacency: escalate the latest student turn's words", "const raw = c.crisisUtterances.shift();", "const raw = (c.crisisUtterances.shift(), c.lastUserRaw);", "tests/voice-crisis-turn.test.ts"),
 "C18f": ("words escalated unredacted", "clamp(redact(c, raw), 2000)", "clamp(raw, 2000)", "tests/voice.test.ts"),
 "C18g": ("capture only when the detector does NOT report a crisis (inverted)", "if (typeof result === \"boolean\" ? result : result.crisis) capture();", "if (!(typeof result === \"boolean\" ? result : result.crisis)) capture();", "tests/voice-crisis-turn.test.ts"),
}
# C18e needs a lastUserRaw field: record each user transcript's raw text on the conn (the old adjacency behaviour, minus the seq check)
EXTRA = {"C18e": [("  async function onFinalTranscript(c: Conn, t: LiveFinalTranscript): Promise<void> {\n    const { turnId, at } = assignTurn(c, t);\n",
                   "  async function onFinalTranscript(c: Conn, t: LiveFinalTranscript): Promise<void> {\n    const { turnId, at } = assignTurn(c, t);\n    if (t.role === \"user\") (c as any).lastUserRaw = t.text;\n"),
                  ("const raw = (c.crisisUtterances.shift(), c.lastUserRaw);", "const raw = (c.crisisUtterances.shift(), (c as any).lastUserRaw as string | undefined);")]}
ids = sys.argv[1:] or list(M)
orig = open(SRC, encoding="utf8", newline="").read()
NL = chr(13) + chr(10) if chr(13) + chr(10) in orig else chr(10)
fix = lambda t: t.replace(chr(10), NL)
res = {}
for i in ids:
    desc, a, b, tf = M[i]
    a, b = fix(a), fix(b)
    assert orig.count(a) == 1, (i, a)
    s = orig.replace(a, b)
    for x, y in [(fix(x), fix(y)) for x, y in EXTRA.get(i, [])]:
        assert s.count(x) == 1, (i, x); s = s.replace(x, y)
    open(SRC, "w", encoding="utf8", newline="").write(s)
    try:
        env = dict(os.environ, VC_TESTLOCK_TIMEOUT_SECS="7200")
        p = subprocess.run(['C:\\Program Files\\Git\\usr\\bin\\bash.exe', "D:/vc/scripts/vc-testlock.sh", "pnpm", "-C", W + "/apps/api", "exec", "tsx", "--test", "--test-reporter=tap", tf], capture_output=True, text=True, encoding="utf8", errors="replace", env=env)
        log = p.stdout + p.stderr
        open(f"{OUT}/falsify-{i}.log", "w", encoding="utf8").write(log)
        ps = re.search(r"^# pass (\d+)", log, re.M); fl = re.search(r"^# fail (\d+)", log, re.M)
        res[i] = {"desc": desc, "file": tf, "pass": int(ps.group(1)) if ps else None, "fail": int(fl.group(1)) if fl else None,
                  "failing": re.findall(r"^not ok \d+ - (.*)$", log, re.M)[:6]}
    finally:
        open(SRC, "w", encoding="utf8", newline="").write(orig)
    print(i, res[i], flush=True)
json.dump(res, open(f"{OUT}/summary.json", "w"), indent=1)
