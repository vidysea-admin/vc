import hashlib, os, subprocess, re, time
S = r'D:\vc\.worktrees\p1-u6w-A2'
API = S + r'\apps\api'
CHAT = API + r'\src\chat.ts'
ANON = API + r'\src\anonymous.ts'
OUT = r'D:\vc\.worktrees\p1-u6w\qa\evidence\p1-u6w-A-c1\mutants.txt'
sha = lambda b: hashlib.sha256(b).hexdigest()[:12]
orig = {CHAT: open(CHAT,'rb').read(), ANON: open(ANON,'rb').read()}
log = open(OUT,'w',encoding='utf8')
def say(x):
    print(x); log.write(x+'\n'); log.flush()
def run(tests):
    r = subprocess.run(['pnpm','-C',API,'exec','tsx','--test']+tests,capture_output=True,text=True,shell=True,encoding='utf8',errors='replace')
    o = r.stdout + r.stderr
    p = re.search(r'ℹ pass (\d+)',o); f = re.search(r'ℹ fail (\d+)',o)
    fails = re.findall(r'^✖ (A1?-[A-Za-z0-9/]+)',o,re.M)
    return (int(p.group(1)) if p else -1, int(f.group(1)) if f else -1, sorted(set(fails)), o)
T = ['tests/probe-A1.test.ts','tests/probe-A.test.ts']
mutants = [
 ('M0 ranking runs on every turn', CHAT, 'result.selectedTool === "rank_options" && persistText', 'true'),
 ('M6a status override removed', CHAT, ', status: "unverified" as const }', ' }'),
 ('M6b only the #1 number claim is unverified', CHAT, 'status: "unverified" as const }', 'status: (c.text.startsWith("#1 ") ? "unverified" : c.status) as never }'),
 ('M7a persistText gate removed', CHAT, 'result.selectedTool === "rank_options" && persistText', 'result.selectedTool === "rank_options"'),
 ('M7b gate is consentOk only', CHAT, 'result.selectedTool === "rank_options" && persistText', 'result.selectedTool === "rank_options" && consentOk'),
 ('M7c gate is !overlong only (unconsented minor ranks)', CHAT, 'result.selectedTool === "rank_options" && persistText', 'result.selectedTool === "rank_options" && !overlong'),
 ('M8a profileFactsUsed stored unredacted', CHAT, 'value: redact(f.value) }', 'value: f.value }'),
 ('M8b only the first fact redacted', CHAT, 'response.profileFactsUsed.map((f) => ({ ...f, value: redact(f.value) }))', 'response.profileFactsUsed.map((f, i) => ({ ...f, value: i === 0 ? redact(f.value) : f.value }))'),
 ('M9a option list asked with another student id', CHAT, 'ranking.optionIds({ tenantId: ctx.tenantId, studentId: ctx.studentId })', 'ranking.optionIds({ tenantId: ctx.tenantId, studentId: "syn-other" })'),
 ('M9b stored facts read for another student', CHAT, 'const stored = await listProfileFacts(db, { studentId: ctx.studentId });\n      const facts', 'const stored = await listProfileFacts(db, { studentId: "syn-other" });\n      const facts'),
 ('M9c option list asked with fixed tenant', CHAT, 'ranking.optionIds({ tenantId: ctx.tenantId,', 'ranking.optionIds({ tenantId: "tenant-a",'),
 ('M10 weights asked with fixed tenant-a', CHAT, 'ranking.weightsForTenant?.(ctx.tenantId)', 'ranking.weightsForTenant?.("tenant-a")'),
 ('M10b weights asked with no tenant id', CHAT, 'ranking.weightsForTenant?.(ctx.tenantId)', 'ranking.weightsForTenant?.("")'),
 ('M11 anonymous handler touches ranking/profile deps', ANON, 'result = await runStudentTurn(graphDeps, { mode: "anonymous", text });', 'result = (await (deps as any).ranking?.optionIds?.({tenantId:"x",studentId:"y"}), await (deps as any).profile?.facts?.({}), await runStudentTurn(graphDeps, { mode: "anonymous", text }));'),
]
say('start '+time.strftime('%Y-%m-%dT%H:%M:%S%z'))
p,f,fl,o = run(T); say(f'BASELINE probes: pass={p} fail={f} failing={fl}')
for name,path,a,b in mutants:
    src = orig[path].decode('utf8')
    if chr(13)+chr(10) in src:
        a = a.replace(chr(10), chr(13)+chr(10)); b = b.replace(chr(10), chr(13)+chr(10))
    if src.count(a) != 1:
        say(f'{name}: SKIPPED, anchor count {src.count(a)}'); continue
    try:
        open(path,'wb').write(src.replace(a,b).encode('utf8'))
        p,f,fl,o = run(T)
    finally:
        open(path,'wb').write(orig[path])
    ok = sha(open(path,'rb').read()) == sha(orig[path])
    open(OUT.replace('mutants','out-'+name.split()[0]),'w',encoding='utf8').write(o)
    say(f'{name}: pass={p} fail={f} failing={fl} restored={ok}')
# differential, ranking absent
def diffrun(tag):
    e = dict(os.environ); e['DIFF_OUT'] = OUT.replace('mutants', 'diff-'+tag)
    r = subprocess.run(['pnpm','-C',API,'exec','tsx','--test','tests/probe-diff.test.ts'],capture_output=True,text=True,shell=True,env=e,encoding='utf8',errors='replace')
    return re.search(r'ℹ pass (\d+)',r.stdout).group(1), re.search(r'ℹ fail (\d+)',r.stdout).group(1)
say('DIFF c1: pass/fail '+str(diffrun('c1.json')))
say('final sha equal: '+str(all(sha(open(k,'rb').read())==sha(v) for k,v in orig.items())))
say('end '+time.strftime('%Y-%m-%dT%H:%M:%S%z'))
