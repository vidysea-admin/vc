import hashlib, os, subprocess, re, sys, time
S = r'D:\vc\.worktrees\p1-u6w-A2'
API = S + r'\apps\api'
CHAT = API + r'\src\chat.ts'
GRAPH = S + r'\packages\engine\src\student\classify.ts'
OUT = r'D:\vc\.worktrees\p1-u6w\qa\evidence\p1-u6w-A\mutants.txt'
sha = lambda b: hashlib.sha256(b).hexdigest()[:12]
orig = {CHAT: open(CHAT,'rb').read(), GRAPH: open(GRAPH,'rb').read()}
log = open(OUT,'w',encoding='utf8')
def say(x):
    print(x); log.write(x+'\n'); log.flush()
def run(test):
    r = subprocess.run(['pnpm','-C',API,'exec','tsx','--test',test],capture_output=True,text=True,shell=True,encoding='utf8',errors='replace')
    o = r.stdout + r.stderr
    p = re.search(r'ℹ pass (\d+)',o); f = re.search(r'ℹ fail (\d+)',o)
    fails = re.findall(r'^✖ (A-[A-Za-z0-9]+)',o,re.M)
    return (int(p.group(1)) if p else -1, int(f.group(1)) if f else -1, sorted(set(fails)), o)
mutants = [
 ('M0 ranking runs for every turn (A-X2)', CHAT, 'if (result.selectedTool === "rank_options") response', 'if (true) response'),
 ('M1a C1 chat label not mapped (stored rows passed raw)', CHAT, 'stored.map(rankFactFromStored)', 'stored.map((f) => ({ key: f.key, value: f.value, source: f.source, status: f.status }))'),
 ('M1c C1 any confirmed row counts as student-confirmed', CHAT, 'const confirmedInChat = f.source === "chat" && f.status === "confirmed";', 'const confirmedInChat = f.status === "confirmed";'),
 ('M2a C2 only the first number claim is labelled', CHAT, 'r.claims.map((c) => (c.kind === "number" ?', 'r.claims.map((c, i) => (c.kind === "number" && i === 0 ?'),
 ('M2b C2 message notice dropped', CHAT, 'message: hasNumbers ? [base.message, NOT_PROVEN_NOTICE].filter(Boolean).join(NL2) : base.message,', 'message: base.message,'),
 ('M3 C3 stored facts read from tenant-a db whatever the caller', CHAT, 'const stored = await listProfileFacts(db, { studentId: ctx.studentId });\n      const facts', 'const stored = await listProfileFacts(deps.dbForTenant("tenant-a"), { studentId: ctx.studentId });\n      const facts'),
 ('M4a C4 failure rethrown', CHAT, 'logEvent("chat_rank_failed", { error: err instanceof Error ? err.name : "error" });\n      return base;', 'logEvent("chat_rank_failed", { error: err instanceof Error ? err.name : "error" });\n      throw err;'),
 ('M4b C4 failure log carries the message', CHAT, 'error: err instanceof Error ? err.name : "error" });\n      return base;', 'error: String((err as Error)?.message ?? err) });\n      return base;'),
 ('M5 C5 classifier never calls a question personal (anonymous rank question reaches search)', GRAPH, 'if (reasons.length > 0) return { class: "personal", reasons };', 'if (false) return { class: "personal", reasons };'),
]
say('start '+time.strftime('%Y-%m-%dT%H:%M:%S%z'))
p,f,fl,o = run('tests/probe-A.test.ts'); say(f'BASELINE probe-A: pass={p} fail={f} failing={fl}')
open(OUT.replace('mutants','baseline-probe-A'),'w',encoding='utf8').write(o)
for name,path,a,b in mutants:
    src = orig[path].decode('utf8')
    if chr(13)+chr(10) in src:
        a = a.replace(chr(10), chr(13)+chr(10)); b = b.replace(chr(10), chr(13)+chr(10))
    if src.count(a) != 1:
        say(f'{name}: SKIPPED, anchor count {src.count(a)}'); continue
    try:
        open(path,'wb').write(src.replace(a,b).encode('utf8'))
        p,f,fl,o = run('tests/probe-A.test.ts')
    finally:
        open(path,'wb').write(orig[path])
    ok = sha(open(path,'rb').read()) == sha(orig[path])
    open(OUT.replace('mutants','out-'+name.split()[0]),'w',encoding='utf8').write(o)
    say(f'{name}: pass={p} fail={f} failing={fl} restored={ok}')
# differential: ranking absent, U6w chat.ts vs base chat.ts
base = subprocess.run(['git','-C',r'D:\vc\.worktrees\p1-u6w','show','ef0c3aa:apps/api/src/chat.ts'],capture_output=True).stdout
env = dict(os.environ)
def diffrun(tag):
    e = dict(env); e['DIFF_OUT'] = OUT.replace('mutants', 'diff-'+tag)
    r = subprocess.run(['pnpm','-C',API,'exec','tsx','--test','tests/probe-diff.test.ts'],capture_output=True,text=True,shell=True,env=e,encoding='utf8',errors='replace')
    return re.search(r'ℹ pass (\d+)',r.stdout).group(1), re.search(r'ℹ fail (\d+)',r.stdout).group(1)
say('DIFF u6w: pass/fail '+str(diffrun('u6w.json')))
try:
    open(CHAT,'wb').write(base)
    say('DIFF base: pass/fail '+str(diffrun('base.json')))
finally:
    open(CHAT,'wb').write(orig[CHAT])
say('final chat.ts sha equal: '+str(sha(open(CHAT,'rb').read())==sha(orig[CHAT])))
say('end '+time.strftime('%Y-%m-%dT%H:%M:%S%z'))
