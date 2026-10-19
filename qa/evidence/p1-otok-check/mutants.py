import sys,re
w='D:/vc/.worktrees/chk-otok2/packages/'
name=sys.argv[1]
def sub(path,old,new,count=1):
    s=open(w+path,encoding='utf-8',newline='').read()
    assert old in s,(name,old[:40])
    s=s.replace(old,new,count)
    open(w+path,'w',encoding='utf-8',newline='').write(s)
P='providers/src/index.ts'; B='engine/evals/budget.ts'; R='engine/evals/run-eval.ts'
if name=='C1':
    sub(P,'validCount(counts?.prompt_eval_count) && validCount(counts?.eval_count)','true')
    sub(P,'inputTokens: counts.prompt_eval_count,','inputTokens: Number(counts?.prompt_eval_count) || 0,')
    sub(P,'outputTokens: counts.eval_count,','outputTokens: Number(counts?.eval_count) || 0,')
    sub(P,'usd: (counts.prompt_eval_count * this.price.inputUsdPerMTok + counts.eval_count * this.price.outputUsdPerMTok) / 1e6','usd: 0')
elif name=='C2':
    sub(R,'...(usage.inputTokens !== undefined ? { inputTokens: usage.inputTokens } : {}),','inputTokens: usage.inputTokens ?? 0,')
    sub(R,'...(usage.outputTokens !== undefined ? { outputTokens: usage.outputTokens } : {}),','outputTokens: usage.outputTokens ?? 0,')
    sub(R,'...(usage.usd !== undefined ? { usd: usage.usd } : {}),','usd: usage.usd ?? 0,')
elif name=='C3a':
    sub(R,'(estimate) => run.charge(estimate.estimatedCostUsd),','() => undefined,')
elif name=='C3b':
    sub(B,'if (e.kind === "charge" && e.ts.slice(0, 7) === key) total += e.usd ?? 0;','if (e.ts.slice(0, 7) === key) total += (e.kind === "charge" ? e.usd : e.kind === "actual" ? e.actualUsd : 0) ?? 0;')
elif name=='C4':
    sub(R,'const usage = makeOllama && result.usage ?','const usage = false && result.usage ?')
elif name=='C5a':
    sub(P,'this.#actualHookFailures += 1;','this.#actualHookFailures += 1; throw new Error("rethrown");')
elif name=='C5b':
    s2=open(w+B,encoding='utf-8',newline='').read()
    import re
    pat=re.compile(r'    try \{\s+this\.guard\.recordActual\(this, usage, reported\);\s+\} catch \(err\) \{\s+appended = false;\s+appendError = err;\s+\}')
    s2,n=pat.subn('    this.guard.recordActual(this, usage, reported);',s2)
    assert n==1
    open(w+B,'w',encoding='utf-8',newline='').write(s2)
elif name=='FC':
    sub(B,'if (parsed.kind === "actual") validateActualEntry(parsed);','')
