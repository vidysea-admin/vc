"""U10 repair 2 falsification harness: one edit at a time on a scratch copy of voice.ts (worktree p1-u10-fals), never the bound tree."""
import json, os, re, shutil, subprocess, sys

WT = r"C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/p1-u10"
FALS = r"C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/p1-u10-fals"
OUT = os.path.join(WT, "qa/evidence/p1-u10/repair2/falsify")
os.makedirs(OUT, exist_ok=True)
SRC = os.path.join(FALS, "apps/api/src/voice.ts")
for rel in ["apps/api/src/voice.ts", "apps/api/tests/voice.test.ts", "apps/api/tests/voice-limits.test.ts", "apps/api/tests/voice-fixtures.ts"]:
    shutil.copyfile(os.path.join(WT, rel), os.path.join(FALS, rel))
ORIG = open(SRC, encoding="utf8").read()

M = [
    ("C14a", "the escalation is skipped again once the socket is closing (the cycle-1 state check restored)",
     "    if (!deps.escalateForTenant) return; // no port configured",
     "    if (c.state === \"closing\" || c.state === \"closed\") return;\n    if (!deps.escalateForTenant) return; // no port configured"),
    ("C14b", "the fenced skip leaves no log line",
     "    if (flag === \"fenced\") {\n      logEvent(\"voice_crisis_escalate_skipped_fenced\");",
     "    if (flag === \"fenced\") {"),
    ("C14c", "the unconsented-minor skip leaves no log line",
     "      logEvent(\"voice_crisis_escalate_skipped_text_not_stored\"); // D-093 4A: no text is kept for an unconsented minor\n", ""),
    ("C15a", "the month is not read again after a supersede",
     "        used = (await getStudentUsage(c.db, { studentId, month: usageMonth(nowDate()) })).voiceMs;",
     "        await Promise.resolve();"),
    ("C16a", "step-aside when the newest start went away (undefined counts as newer, the cycle-1 rule)",
     "      if (newest === undefined) {\n        latestStart.set(c.key, c);\n        return false;\n      }\n", ""),
    ("C16b", "the supersede loop runs once (mutant C10c on the cycle-2 loop)",
     "      if (steppedAside()) return;\n    }\n    if (c.state !== \"starting\") return;\n    activeByStudent.set(c.key, c);",
     "      if (steppedAside()) return;\n      break;\n    }\n    if (c.state !== \"starting\") return;\n    activeByStudent.set(c.key, c);"),
    ("C16c", "finalize does not drop a closing connection from latestStart at once",
     "      if (latestStart.get(c.key) === c) latestStart.delete(c.key);\n      clearTimers(c);", "      clearTimers(c);"),
    ("C17a", "the escalation port is built outside the retried write",
     "    const escalated = await crisisWrite(c, \"voice_crisis_escalate_failed\", async () => {\n      // Built inside the retried write (item 4): a factory that throws is retried and logged, never a sink failure (persist_failed).\n      const escalate = deps.escalateForTenant!(c.claims.tenantId, c.db);",
     "    const escalate0 = deps.escalateForTenant!(c.claims.tenantId, c.db);\n    const escalated = await crisisWrite(c, \"voice_crisis_escalate_failed\", async () => {\n      const escalate = escalate0;"),
    ("C18a", "the escalation reads the latest student turn's words (the cycle-1 source), not the crisis utterance's",
     "    const words = c.crisisWords;", "    const words = c.lastUser?.text;"),
    ("C18b", "the crisis words are taken from any earlier student turn (seq adjacency check removed)",
     "c.lastUser?.seq !== undefined && c.lastUser.seq === t.seq - 1 ? c.lastUser.text : undefined", "c.lastUser?.text"),
    ("C18c", "no marker: a crisis without words is not escalated (the cycle-1 skip)",
     "    const text = words !== undefined && words !== \"\" ? words : VOICE_CRISIS_NO_WORDS_TEXT;",
     "    if (words === undefined || words === \"\") return;\n    const text = words;"),
    ("C19a", "the drain wait ignores drainTimeoutMs (falls back to the 10 s default)",
     "    deps.drainTimeoutMs !== undefined && Number.isFinite", "    false && Number.isFinite"),
]

CMD = [r"C:/Program Files/Git/usr/bin/bash.exe", "D:/vc/scripts/vc-testlock.sh", "pnpm", "-C", FALS + "/apps/api", "exec", "tsx", "--test", "--test-timeout=30000",
       "--test-name-pattern", "^C1[0-9][:/]", "tests/voice.test.ts", "tests/voice-limits.test.ts"]
env = dict(os.environ, VC_TESTLOCK_TIMEOUT_SECS="7200")

def run(tag):
    p = subprocess.run(CMD, capture_output=True, text=True, encoding="utf8", errors="replace", env=env)
    out = p.stdout + p.stderr
    nums = {k: re.search(rf"^ℹ {k} (\d+)", out, re.M) for k in ("tests", "pass", "fail")}
    nums = {k: (int(v.group(1)) if v else None) for k, v in nums.items()}
    failing = sorted(set(m.group(1).strip() for m in re.finditer(r"^✖ (C1\d[^\n]*?) \(\d", out, re.M)))
    return out, nums, failing

only = sys.argv[1:]
results = []
if not only:
    out, base, bf = run("baseline")
    open(os.path.join(OUT, "baseline.log"), "w", encoding="utf8").write(out)
    print("baseline", base, bf, flush=True)
    results.append({"id": "baseline", **base, "failing": bf})
for mid, desc, old, new in M:
    if only and mid not in only:
        continue
    n = ORIG.count(old)
    if n != 1:
        print(mid, "ANCHOR COUNT", n, flush=True)
        results.append({"id": mid, "desc": desc, "error": f"anchor count {n}"})
        continue
    open(SRC, "w", encoding="utf8", newline="\n").write(ORIG.replace(old, new, 1))
    try:
        out, nums, failing = run(mid)
    finally:
        open(SRC, "w", encoding="utf8", newline="\n").write(ORIG)
    open(os.path.join(OUT, f"falsify-{mid}.log"), "w", encoding="utf8").write(f"# {mid} {desc}\n# after {nums}\n# failing: {failing}\n\n{out}")
    verdict = "KILLED" if (nums["fail"] or 0) > 0 else "SURVIVES"
    print(mid, verdict, nums, failing[:2], flush=True)
    results.append({"id": mid, "desc": desc, **nums, "verdict": verdict, "failing": failing})
name = "falsify-summary.json" if not only else f"falsify-summary-{'-'.join(only)}.json"
json.dump(results, open(os.path.join(OUT, name), "w", encoding="utf8"), indent=1, ensure_ascii=False)
