import subprocess, sys, shutil, os, re, hashlib, json
W = "C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/p1-u8r"
S = "C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/u8rA"
CHAT = "apps/api/src/chat.ts"
RED = "packages/schemas/src/redact.ts"
PF = "packages/db/src/profile-facts.ts"

# id, file, old, new, pkg, tests
API = ("apps/api", ["tests/chat-privacy.test.ts", "tests/_probeA-api.test.ts"])
SCH = ("packages/schemas", ["tests/redact.test.ts", "tests/_probeA-redact.test.ts"])
DB = ("packages/db", ["tests/student-store.test.ts"])
M = [
 ("C1a", CHAT, 'if (profileDown && !crisis) return fail(503, "profile_unavailable");', 'if (false) return fail(503, "profile_unavailable");', API),
 ("C1b", CHAT, "const persistText = consentOk && !overlong && !profileDown && !quiet;", "const persistText = consentOk && !overlong && !quiet;", API),
 ("C2", CHAT, "if (active !== undefined && rank <= active.rank) return { holds: false, slot: active };", "if (false) return { holds: false, slot: active };", API),
 ("C5", CHAT, "text: escalationText(t.text), translatedText: escalationText(t.translatedText)", "text: t.text, translatedText: t.translatedText", API),
 ("C7", CHAT, "rank <= active.rank", "true", API),
 ("C8b", CHAT, "if (quiet && clientTurnId !== undefined && consentOk", "if (false && quiet && clientTurnId !== undefined && consentOk", API),
 ("C11a", CHAT, "const slotRank = consentOk && !overlong ? LEVEL_RANK[level] : 0;", "const slotRank = LEVEL_RANK[level];", API),
 ("C11b", CHAT, "variant === \"full\" && redactors.escalated === true && !result.flagWriteFailed", "variant === \"full\" && !result.flagWriteFailed", API),
 ("C11c", CHAT, "variant === \"full\" && redactors.escalated === true && !result.flagWriteFailed", "variant === \"full\" && redactors.escalated === true", API),
 ("C12", CHAT, "if (prev !== undefined && !prev.released && prev.until > nowMs()) crisisSlots.set(key, prev);", "if (prev !== undefined && prev.until > nowMs()) crisisSlots.set(key, prev);", API),
 ("C12b", CHAT, "const active = found !== undefined && found.until > t && !found.released ? found : undefined;", "const active = found !== undefined && found.until > t ? found : undefined;", API),
 ("C13a", CHAT, "timer = setTimeout(() => r(false), quietWaitMs);", "timer = setTimeout(() => r(true), quietWaitMs);", API),
 ("C13b", CHAT, "return await Promise.race([slot.done, timeout]);", "return await slot.done;", API),
 ("C13c", CHAT, "    slot.settle(false);\n", "", API),
 ("C4", CHAT, "const allNames = [...knownNames, ...stated];", "const allNames = [...knownNames];", API),
 ("C3", RED, "const lowerOk = LOWER_OK_LEAD.test(lead);", "const lowerOk = false;", SCH),
 ("C9", RED, "&& !TITLES.has(trimTail(tok).toLowerCase())) break;", ") break;", SCH),
 ("C10", RED, 'let text = !input.includes("@")', "let text = false", SCH),
 ("C14a", RED, "(?:${NAME_PREFIX}\\s+)*${NAME_TOKEN}", "${NAME_TOKEN}", SCH),
 ("C14b", RED, "} else if (lowerOk && TITLES.has(trimTail(tok).toLowerCase())) {", "} else if (false) {", SCH),
 ("C6", PF, "const key = redactPii(input.key).text;", "const key = input.key;", DB),
]

M = [
 ("C11ab", CHAT, [("const slotRank = consentOk && !overlong ? LEVEL_RANK[level] : 0;", "const slotRank = LEVEL_RANK[level];"), ('variant === "full" && redactors.escalated === true && !result.flagWriteFailed', 'variant === "full" && !result.flagWriteFailed')], None, API),
 ("C11abc", CHAT, [("const slotRank = consentOk && !overlong ? LEVEL_RANK[level] : 0;", "const slotRank = LEVEL_RANK[level];"), ('variant === "full" && redactors.escalated === true && !result.flagWriteFailed', '!result.flagWriteFailed')], None, API),
 ("C11bc", CHAT, [('variant === "full" && redactors.escalated === true && !result.flagWriteFailed', '!result.flagWriteFailed')], None, API),
 ("C12ab", CHAT, [("if (prev !== undefined && !prev.released && prev.until > nowMs()) crisisSlots.set(key, prev);", "if (prev !== undefined && prev.until > nowMs()) crisisSlots.set(key, prev);"), ("const active = found !== undefined && found.until > t && !found.released ? found : undefined;", "const active = found !== undefined && found.until > t ? found : undefined;")], None, API),
 ("C13c", CHAT, "slot.settle(false);", ";", API),
 ("C13d", CHAT, "if (!taken.holds && !taken.slot.confirmed) loose = true;", "if (false) loose = true;", API),
 ("C13e", CHAT, "const quiet = taken !== undefined && !taken.holds && !loose;", "const quiet = taken !== undefined && !taken.holds;", API),
]
sel = set(sys.argv[1:])
def sh(a): return hashlib.sha256(open(a, "rb").read()).hexdigest()[:12]
for mid, f, old, new, (pkg, tests) in M:
    if sel and mid not in sel: continue
    path = f"{W}/{f}"
    before = sh(path)
    src = open(path, encoding="utf8", newline="").read()
    pairs = old if isinstance(old, list) else [(old, new)]
    bad = [o for o, _ in pairs if src.count(o) != 1]
    if bad:
        print(f"{mid}: PATTERN COUNT != 1 -> skipped {bad[0][:50]}", flush=True); continue
    shutil.copyfile(path, f"{S}/bak-{mid}")
    for o, nw in pairs: src = src.replace(o, nw)
    open(path, "w", encoding="utf8", newline="").write(src)
    # probes into the tree
    for pf, dst in (("probeA-api.test.ts", f"{W}/apps/api/tests/_probeA-api.test.ts"), ("probeA-redact.test.ts", f"{W}/packages/schemas/tests/_probeA-redact.test.ts")):
        shutil.copyfile(f"{S}/{pf}", dst)
    try:
        existing = [t for t in tests if os.path.exists(f"{W}/{pkg}/{t}")]
        env = dict(os.environ, VC_TESTLOCK_TIMEOUT_SECS="7200")
        r = subprocess.run(["C:/Program Files/Git/usr/bin/bash.exe", "D:/vc/scripts/vc-testlock.sh", "pnpm", "-C", f"{W}/{pkg}", "exec", "tsx", "--test", "--test-timeout=120000"] + existing, capture_output=True, text=True, env=env, encoding="utf8", errors="replace")
        out = r.stdout + r.stderr
        m = lambda k: (re.search(rf"ℹ {k} (\d+)", out) or [None, "?"])[1]
        fails = re.findall(r"^\s*✖ (.+?) \(\d", out, re.M)
        fails = [x for x in fails if not x.startswith("p1-u8r") or True][:3]
        print(f"{mid}: {'KILLED' if m('fail') not in ('0','?') else 'SURVIVED'} tests={m('tests')} pass={m('pass')} fail={m('fail')} first_fail={fails[:2]}", flush=True)
        open(f"{S}/mut-{mid}.txt", "w", encoding="utf8").write(out)
    finally:
        shutil.copyfile(f"{S}/bak-{mid}", path)
        for dst in (f"{W}/apps/api/tests/_probeA-api.test.ts", f"{W}/packages/schemas/tests/_probeA-redact.test.ts"):
            if os.path.exists(dst): os.remove(dst)
        after = sh(path)
        print(f"   restored identical: {before == after} ({before})", flush=True)
