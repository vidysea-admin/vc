"""Checker B cycle-2 falsification: one (or more) single-hunk edits per criterion, each in the scratch copy ONLY, restored after every run.
Usage: python falsify_b.py [ID ...]   CHECK=1 verifies the anchors only."""
import subprocess, os, sys, re, json, time, hashlib

E = "D:/vc/.worktrees/p1-u10-chkB-c2"
BASH = "C:/Program Files/Git/usr/bin/bash.exe"
LOCK = "D:/vc/scripts/vc-testlock.sh"
OUT = E + "/_ev/fals"
os.makedirs(OUT, exist_ok=True)
VO = E + "/apps/api/src/voice.ts"
CT = E + "/packages/db/src/chat-threads.ts"
API = ["tests/voice.test.ts", "tests/voice-audit.test.ts", "tests/voice-history.test.ts", "tests/voice-limits.test.ts"]
DB = ["tests/chat-threads.test.ts", "tests/erasure.test.ts"]

M = []  # (id, desc, set, file, [(old,new),...])


def m(i, d, s, f, *edits):
    M.append((i, d, s, f, list(edits)))


m("C1b", "session route accepts a non-empty/garbage body", "api", VO, ('if (!(await readEmptyBody(req))) return fail(400, "invalid_request");', ''))
m("C2a", "replay allowed (single-use check removed)", "api", VO, ('if (usedTokens.has(claims.jti)) return refuse(socket, 401, "Unauthorized");', ''))
m("C2b", "a token for another thread is accepted on this path", "api", VO, ('claims.studentId !== m[1] || claims.threadId !== m[2])', 'claims.studentId !== m[1])'))
m("C2c", "expiry not enforced", "api", VO, ('currentDate: new Date(nowMs),', 'currentDate: new Date(0),'))
m("C2d", "audience not checked", "api", VO, ('      audience: VOICE_WS_AUDIENCE,\n', ''))
m("C3a", "interrupt not forwarded", "api", VO, ('c.session.interrupt();', 'void 0;'))
m("C3b", "oversize frame answered with bare 1006 not 1009", "api", VO, ('void finalize(c, err.code === "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH" ? 1009 : 1006);', 'void finalize(c, 1006);'))
m("C4a", "silence timeout does not close", "api", VO, ('sendError(c, "silence_timeout");\n      void finalize(c, 1000);', 'sendError(c, "silence_timeout");'))
m("C4b", "session cap does not close", "api", VO, ('sendError(c, "session_time_limit");\n      void finalize(c, 1000);', 'sendError(c, "session_time_limit");'))
m("C5a", "audit flag never sent to the client", "api", VO, ('sendEvent(c, { type: "flag", reason, detail });', ''))
m("C6a", "minor without consent has text stored", "api", VO, ('persistText: !claims.minor || claims.guardianConsent,', 'persistText: true,'))
m("C7a", "minutes never recorded on close", "api", VO, ('if (elapsed > 0) {', 'if (false) {'))
m("C8a", "LiveConfigError reads as live_unavailable", "api", VO, ('err instanceof LiveConfigError ? "live_config" : "live_unavailable"', '"live_unavailable"'))
m("C9a", "provider session not closed on finalize", "api", VO, ('session.close("voice session ended");', 'void 0;'))
m("C9b", "socket cap ignored", "api", VO, ('|| conns.size >= maxSockets', ''))
m("C9c", "resume ignores tenant", "api", VO, ('r.tenantId !== c.claims.tenantId || ', ''))
m("C9d", "provider session leaks when the socket closed during connect", "api", VO, ('session.close("client gone before start finished");', 'void 0;'))
m("C10a", "start timer ignores the starting state", "api", VO, ('if (c.state === "awaiting_start" || c.state === "starting") void finalize(c, 1008);', 'if (c.state === "awaiting_start") void finalize(c, 1008);'))
m("C10b", "waiter never steps aside (no newest-wins)", "api", VO, ('sendError(c, "superseded"); // a newer start for this student is queued behind the same old session\n      void finalize(c, 4000);\n      return true;', 'return false;'))
m("C11a", "no per-student session-route limiter", "api", VO, ('if (!verdict.allowed) return fail(429', 'if (false) return fail(429'))
m("C11b", "no pre-start socket cap", "api", VO, ('>= VOICE_MAX_PRESTART_SOCKETS_PER_STUDENT) return refuse(socket, 429', '>= 9999) return refuse(socket, 429'))
m("C12a", "crisis write not retried", "api", VO, ('export const VOICE_CRISIS_WRITE_ATTEMPTS = 2;', 'export const VOICE_CRISIS_WRITE_ATTEMPTS = 1;'))
m("C12b", "escalation carries unredacted words", "api", VO, ('c.lastUser.text = clamp(stored, 2000);', 'c.lastUser.text = clamp(t.text, 2000);'))
m("C13a", "expired logs never pruned", "api", VO, ('if (now - r.closedAtMs <= VOICE_RESUME_WINDOW_MS) break;', 'break;'))
m("C14a", "unconsented minor IS escalated (no skip)", "api", VO, ('if (!c.persistText) {\n      logEvent("voice_crisis_escalate_skipped_text_not_stored");', 'if (false) {\n      logEvent("voice_crisis_escalate_skipped_text_not_stored");'))
m("C14b", "fenced skip removed (escalates for a fenced student)", "api", VO, ('if (flag === "fenced") {\n      logEvent("voice_crisis_escalate_skipped_fenced");\n      return;\n    }', ''))
m("C14c", "closing connection skips the crisis record (cycle-1 behaviour)", "api", VO, ('const words = c.crisisWords;', 'if (c.state === "closing" || c.state === "closed") return;\n    const words = c.crisisWords;'))
m("C15a", "month not re-read after supersede (usage ignored in the loop)", "api", VO, ('\n      remainingMs = limits.voiceMinutesPerMonth * 60_000 - used;', '\n      remainingMs = limits.voiceMinutesPerMonth * 60_000;'))
m("C16a", "closing connection stays the latest start", "api", VO, ('      if (latestStart.get(c.key) === c) latestStart.delete(c.key);\n      clearTimers(c);', '      clearTimers(c);'))
m("C17a", "escalation port built outside the retried write", "api", VO,
  ('const escalate = deps.escalateForTenant!(c.claims.tenantId, c.db);', 'const escalate = prebuilt;'),
  ('    let unavailable = false;', '    let unavailable = false;\n    const prebuilt = deps.escalateForTenant!(c.claims.tenantId, c.db);'))
m("C18a", "no-words crisis uses the latest student turn's words", "api", VO, ('const text = words !== undefined && words !== "" ? words : VOICE_CRISIS_NO_WORDS_TEXT;', 'const text = (words !== undefined && words !== "" ? words : c.lastUser?.text) ?? VOICE_CRISIS_NO_WORDS_TEXT;'))
m("C19a", "drain wait unbounded in practice (1e9 ms)", "api", VO, ('drainTimer = setTimeout(() => resolve(true), drainTimeoutMs);', 'drainTimer = setTimeout(() => resolve(true), 1e9);'))
m("C6b", "db: a voice row is written as a text turn", "db", CT, ('channel: "voice",', 'channel: "text",'))
m("C6c", "db: audit finding attaches to any row (channel filter removed)", "db", CT, ('{ _id, studentId: input.studentId, channel: "voice" } as never', '{ _id, studentId: input.studentId } as never'))

ONLY = [a for a in sys.argv[1:]]
CHECK = os.environ.get("CHECK") == "1"


def read(p):
    return open(p, encoding="utf8", newline="").read()


def write(p, s):
    open(p, "w", encoding="utf8", newline="").write(s)


orig = {VO: read(VO), CT: read(CT)}
sha = {p: hashlib.sha256(s.encode()).hexdigest()[:12] for p, s in orig.items()}
summary = {}
for (i, d, s, f, edits) in M:
    if ONLY and i not in ONLY:
        continue
    src = orig[f]
    # LF/CRLF: the archive is LF; keep the file's own newline
    nl = "\r\n" if "\r\n" in src else "\n"
    out = src
    ok = True
    for (old, new) in edits:
        old2, new2 = old.replace("\n", nl), new.replace("\n", nl)
        if out.count(old2) != 1:
            print(f"ANCHOR {i}: '{old[:60]}' occurs {out.count(old2)} times")
            ok = False
            break
        out = out.replace(old2, new2)
    if not ok or CHECK:
        continue
    write(f, out)
    t0 = time.time()
    if s == "api":
        cmd = f'VC_TESTLOCK_TIMEOUT_SECS=7200 bash {LOCK} pnpm -C {E}/apps/api exec tsx --test --test-force-exit --test-timeout=30000 ' + " ".join(API)
    else:
        cmd = f'VC_TESTLOCK_TIMEOUT_SECS=7200 bash {LOCK} pnpm -C {E}/packages/db exec tsx --test --test-force-exit --test-timeout=30000 ' + " ".join(DB)
    p = subprocess.Popen([BASH, "-c", cmd], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf8", errors="replace")
    try:
        log, _ = p.communicate(timeout=420)
        rc = p.returncode
    except subprocess.TimeoutExpired:
        subprocess.run(["taskkill", "/F", "/T", "/PID", str(p.pid)], capture_output=True)
        log, rc = "KILLED after 420s", -9
    finally:
        write(f, orig[f])
    assert read(f) == orig[f]
    open(f"{OUT}/falsify-{i}.log", "w", encoding="utf8").write(log)
    tot = re.search(r"ℹ tests (\d+)", log); fl = re.search(r"ℹ fail (\d+)", log); ps = re.search(r"ℹ pass (\d+)", log)
    first = re.findall(r"^\s*✖ (.+?) \(", log, re.M)
    names = [x for x in first if "failing tests" not in x]
    res = {"desc": d, "rc": rc, "tests": tot and int(tot.group(1)), "pass": ps and int(ps.group(1)), "fail": fl and int(fl.group(1)), "first": names[:2], "secs": round(time.time() - t0, 1)}
    summary[i] = res
    print(i, json.dumps(res, ensure_ascii=False), flush=True)
    json.dump(summary, open(OUT + "/summary-" + ("-".join(ONLY) if ONLY else "all") + ".json", "w"), indent=1, ensure_ascii=False)

for f, h in sha.items():
    assert hashlib.sha256(read(f).encode()).hexdigest()[:12] == h, "restore failed " + f
print("restored ok", sha)
