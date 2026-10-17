import os, shutil, subprocess, sys, re

SRC_WT = r'C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/p1-u9'
FALS = r'C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/p1-u9-fals'
PKG = FALS + '/packages/providers'

if os.path.exists(FALS):
    shutil.rmtree(FALS, ignore_errors=True)
os.makedirs(FALS + '/packages', exist_ok=True)
shutil.copytree(SRC_WT + '/packages/providers', PKG, ignore=shutil.ignore_patterns('node_modules', 'dist'))
# node_modules via junction to the bound tree's (read only use)
for rel in ['packages/providers/node_modules', 'node_modules']:
    target = SRC_WT + '/' + rel
    if os.path.exists(target):
        link = FALS + '/' + rel
        subprocess.run(['cmd', '/c', 'mklink', '/J', link.replace('/', '\\'), target.replace('/', '\\')], check=True, stdout=subprocess.DEVNULL)
# other workspace packages that providers may import
for name in os.listdir(SRC_WT + '/packages'):
    if name != 'providers' and not os.path.exists(FALS + '/packages/' + name):
        subprocess.run(['cmd', '/c', 'mklink', '/J', (FALS + '/packages/' + name).replace('/', '\\'), (SRC_WT + '/packages/' + name).replace('/', '\\')], check=True, stdout=subprocess.DEVNULL)
for f in ['package.json', 'pnpm-workspace.yaml', 'tsconfig.base.json', 'tsconfig.json']:
    if os.path.exists(SRC_WT + '/' + f):
        shutil.copy(SRC_WT + '/' + f, FALS + '/' + f)

live = PKG + '/src/live.ts'
orig = open(live, encoding='utf-8', newline='').read().replace('\r\n', '\n')

# fix cycle 2: each mutant reverts ONE repair; "green before" is the restored full run (63/63)
mutants = {
    'R1-toolcall-ends-crisis-utterance': ('    this.flushUser(!this.crisisMute);\n    this.emit({ type: "tool_call", call });', '    this.flushUser(true);\n    this.emit({ type: "tool_call", call });', r'C4 crisis R1'),
    'R2-turncomplete-clears-crisis-mute': ('    if (!this.crisisMute) this.muted = false;\n    this.emit({ type: "turn_complete" });', '    this.muted = false;\n    this.crisisMute = false;\n    this.emit({ type: "turn_complete" });', r'C4 crisis (R2|F1)'),
    'L1a-queue-uncapped': ('    if (this.pendingBackendEvents.length >= PENDING_BACKEND_EVENTS_MAX) {', '    if (false) {', r'C4 crisis low: the transport floods'),
    'L1b-double-attach-allowed': ('    if (this.backend) throw new LiveConfigError("Live session already has a backend attached");\n', '', r'C4 crisis low: a transport tries'),
    'L2-typed-crisis-blocks-spoken': ('    if (spoken) this.crisisFiredForUtterance = true;', '    this.crisisFiredForUtterance = true;', r'C4 crisis low: the student types'),
    'L3-shared-audio-reference': ('data: message.audio!.slice(),', 'data: message.audio!,', r'C4 crisis low: a client that mutates'),
}

out = []
for name, (a, b, pat) in mutants.items():
    assert orig.count(a) == 1, (name, orig.count(a))
    open(live, 'w', encoding='utf-8', newline='').write(orig.replace(a, b))
    r = subprocess.run(['pnpm', '-C', PKG, 'exec', 'tsx', '--test', '--test-name-pattern=' + pat, 'tests/live.test.ts'], capture_output=True, text=False, shell=True, cwd=PKG)
    txt = (r.stdout + r.stderr).decode('utf-8', 'replace')
    m = {k: (re.search(r'' + k + r' (\d+)', txt) or [None, '?'])[1] for k in ('tests', 'pass', 'fail')}
    failing = [l.strip()[:110] for l in txt.splitlines() if l.strip().startswith(chr(10006)) and 'ms)' in l][:4]
    out.append(f"{name}: rc={r.returncode} tests={m['tests']} pass={m['pass']} fail={m['fail']} first_failing={failing}")
    print(out[-1], flush=True)
# restored
open(live, 'w', encoding='utf-8', newline='').write(orig)
r = subprocess.run(['pnpm', '-C', PKG, 'exec', 'tsx', '--test', 'tests/live.test.ts'], capture_output=True, text=False, shell=True, cwd=PKG)
txt = (r.stdout + r.stderr).decode('utf-8', 'replace')
m = {k: (re.search(r'' + k + r' (\d+)', txt) or [None, '?'])[1] for k in ('tests', 'pass', 'fail')}
print(f"RESTORED: rc={r.returncode} tests={m['tests']} pass={m['pass']} fail={m['fail']}", flush=True)
