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

mutants = {
    'F1-interrupted-unmutes-after-crisis': ('    if (!this.crisisMute) this.muted = false; // after a crisis', '    this.muted = false; // after a crisis', r'C4 crisis F1'),
    'F2-half-reply-dropped-on-crisis': ('    this.flushAssistant(true);\n    this.muted = true;\n    this.crisisMute = true;', '    this.assistantBuf = "";\n    this.muted = true;\n    this.crisisMute = true;', r'C4 crisis F2'),
    'M1a-crisis-interrupt-not-queued': ('    if (this.backend) interruptBackend();\n    else this.pendingBackendEvents.push(interruptBackend);', '    interruptBackend();', r'C4 crisis M1'),
    'M1b-toolcall-not-queued': ('    if (this.backend) run();\n    else this.pendingBackendEvents.push(run);', '    run();', r'C4 crisis M1'),
    'M2-typed-text-skips-scan-after-crisis': ('(this.crisisFiredForUtterance && !force)', '(this.crisisFiredForUtterance)', r'C4 crisis M2'),
    'M3-silent-crisis-allowed': ('    if (config.detectCrisis && (!audio || audio.byteLength === 0 || audio.byteLength % 2 !== 0)) {', '    if (false) {', r'C4 crisis M3'),
    'C5-F2-flush-without-audit': ('    const audit = this.config.auditOutput;\n    if (audit) {', '    const audit = this.config.auditOutput;\n    if (audit && !interrupted) {', r'C4 crisis F2'),
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
