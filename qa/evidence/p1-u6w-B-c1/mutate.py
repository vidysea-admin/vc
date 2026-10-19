import subprocess, re, sys, json
S = 'D:/vc/.worktrees/p1-u6w-Bfals-c1'
CHAT = S + '/apps/api/src/chat.ts'
ANON = S + '/apps/api/src/anonymous.ts'
orig = {CHAT: open(CHAT, encoding='utf8').read(), ANON: open(ANON, encoding='utf8').read()}
M = [
 ("F6 C6 ranked number claims keep U6b attributed status", CHAT, ', status: "unverified" as const } : c));', ' } : c));'),
 ("F7 C7 persistText gate removed from withRanking call", CHAT, 'if (result.selectedTool === "rank_options" && persistText) response', 'if (result.selectedTool === "rank_options") response'),
 ("F8 C8 profileFactsUsed stored without redact", CHAT, '({ ...f, value: redact(f.value) })', '({ ...f, value: f.value })'),
 ("F9 C9 option-list callback asked with another student id", CHAT, 'ranking.optionIds({ tenantId: ctx.tenantId, studentId: ctx.studentId })', 'ranking.optionIds({ tenantId: ctx.tenantId, studentId: "syn-x" })'),
 ("F10 C10 weightsForTenant asked with a fixed tenant", CHAT, 'ranking.weightsForTenant?.(ctx.tenantId)', 'ranking.weightsForTenant?.("tenant-a")'),
 ("F11 C11 anonymous handler touches ranking/profile/dbForTenant deps", ANON, 'const r = result.response;', 'const r = result.response; (deps as any).ranking?.optionIds?.({ tenantId: "t", studentId: "s" }); (deps as any).profile?.facts?.({ tenantId: "t", studentId: "s" }); (deps as any).dbForTenant?.("t");'),
]
tests = sys.argv[1:] or ['tests/chat-rank.test.ts', 'tests/chat-rank-B1-hostile.test.ts', 'tests/anonymous-route.test.ts']

def run():
    r = subprocess.run(['node', 'node_modules/tsx/dist/cli.mjs', '--test'] + tests, cwd=S + '/apps/api', capture_output=True, text=True, encoding='utf8', errors='replace', timeout=900)
    txt = r.stdout + r.stderr
    p = re.search(r'ℹ pass (\d+)', txt); fl = re.search(r'ℹ fail (\d+)', txt)
    first = [l.strip()[:160] for l in txt.splitlines() if l.startswith('✖')][:3]
    return (p and p.group(1), fl and fl.group(1), first)

print('BASELINE', run(), flush=True)
for name, f, a, b in M:
    t = orig[f]
    if t.count(a) != 1:
        print(json.dumps((name, 'NOMATCH', t.count(a)))); continue
    open(f, 'w', encoding='utf8', newline='').write(t.replace(a, b))
    try:
        print(json.dumps((name,) + run()), flush=True)
    finally:
        open(f, 'w', encoding='utf8', newline='').write(orig[f])
print('RESTORED', run())
