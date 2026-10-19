import subprocess, shutil, re, sys, os, json
S='D:/vc/.worktrees/p1-u6w-Bfals'
CHAT=S+'/apps/api/src/chat.ts'
GRAPH=S+'/packages/engine/src/student/graph.ts'
orig={CHAT:open(CHAT,encoding='utf8').read(),GRAPH:open(GRAPH,encoding='utf8').read()}
M=[
 ("M1 C1 stored facts never reach the ranker", CHAT, "...stored.map(rankFactFromStored)]", "...([] as typeof stored).map(rankFactFromStored)]"),
 ("M1b C1 proposed chat facts count as confirmed", CHAT, 'f.source === "chat" && f.status === "confirmed"', 'f.source === "chat" && (f.status === "confirmed" || f.status === "proposed")'),
 ("M1c C1 mapping applies to any status-confirmed row incl chat-extracted label allow", CHAT, 'f.source === "chat" && f.status === "confirmed"', '(f.source === "chat" || f.source === "chat-extracted") && f.status === "confirmed"'),
 ("M2 C2 only the first number claim is labelled", CHAT, 'r.claims.map((c) => (c.kind === "number" ? {', 'r.claims.map((c, i) => (c.kind === "number" && i === 0 ? {'),
 ("M2b C2 notice text lowercased (label not visible in message)", CHAT, 'const NOT_PROVEN_NOTICE = `${NOT_PROVEN_LABEL}:', 'const NOT_PROVEN_NOTICE = `not proven:'),
 ("M3a C3 stored facts read from tenant-b Db", CHAT, "await listProfileFacts(db, { studentId: ctx.studentId });\n      const facts", 'await listProfileFacts(deps.dbForTenant("tenant-b"), { studentId: ctx.studentId });\n      const facts'),
 ("M3b C3 weights callback asked with tenant-b", CHAT, "ranking.weightsForTenant?.(ctx.tenantId)", 'ranking.weightsForTenant?.("tenant-b")'),
 ("M3c C3 Pathlynks port asked with tenant-b", CHAT, "deps.profile.facts({ tenantId: ctx.tenantId, studentId: ctx.studentId })", 'deps.profile.facts({ tenantId: "tenant-b", studentId: ctx.studentId })'),
 ("M3d C3 option-list callback asked with student id of another student", CHAT, "ranking.optionIds({ tenantId: ctx.tenantId, studentId: ctx.studentId })", 'ranking.optionIds({ tenantId: ctx.tenantId, studentId: "syn-x" })'),
 ("M4a C4 catch logs String(err)", CHAT, 'logEvent("chat_rank_failed", { error: err instanceof Error ? err.name : "error" });\n      return base;', 'logEvent("chat_rank_failed", { error: String(err) });\n      return base;'),
 ("M4b C4 refusal path logs the whole input", CHAT, 'logEvent("chat_rank_refused", { error: r.reason })', 'logEvent("chat_rank_refused", { error: JSON.stringify({ optionIds, facts }) })'),
 ("M4c C4 failure returns an empty message instead of base", CHAT, 'logEvent("chat_rank_failed", { error: err instanceof Error ? err.name : "error" });\n      return base;', 'logEvent("chat_rank_failed", { error: err instanceof Error ? err.name : "error" });\n      return { ...base, message: "" };'),
 ("M4d C4 ranking also runs on non-rank tools", CHAT, 'if (result.selectedTool === "rank_options") response', 'if (result.selectedTool !== undefined) response'),
 ("M5a C5 anonymous rank text routed to rank_options tool", GRAPH, 'if (classifyQuestion(input.text).class !== "generic") {', 'if (classifyQuestion(input.text).class !== "generic" && classifyIntent(input.text) !== "rank_options") {'),
]
tests=sys.argv[1:] or ['tests/chat-rank.test.ts','tests/chat-rank-B-hostile.test.ts','tests/anonymous-route.test.ts']
out=[]
for name,f,a,b in M:
    t=orig[f]
    if t.count(a)!=1:
        out.append((name,'NOMATCH',t.count(a))); continue
    open(f,'w',encoding='utf8',newline='').write(t.replace(a,b))
    try:
        r=subprocess.run(['node','node_modules/tsx/dist/cli.mjs','--test']+tests,cwd=S+'/apps/api',capture_output=True,text=True,encoding='utf8',errors='replace',timeout=600)
        txt=r.stdout+r.stderr
        p=re.search(r'ℹ pass (\d+)',txt); fl=re.search(r'ℹ fail (\d+)',txt)
        first=[l for l in txt.splitlines() if l.startswith('✖')][:3]
        out.append((name,'pass=%s fail=%s'%(p and p.group(1),fl and fl.group(1)),first))
    finally:
        open(f,'w',encoding='utf8',newline='').write(orig[f])
for o in out: print(json.dumps(o,ensure_ascii=False))
# baseline after restore
r=subprocess.run(['node','node_modules/tsx/dist/cli.mjs','--test']+tests,cwd=S+'/apps/api',capture_output=True,text=True,encoding='utf8',errors='replace')
print('RESTORED baseline',re.findall(r'ℹ (?:pass|fail) \d+',r.stdout))
