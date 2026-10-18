import os, shutil, subprocess, re

# Brief rewrite 1 (H1, Low): green before (baseline), each mutant reverts ONE criterion's repair
# in a throwaway copy (red), then the restored copy (green). The bound tree is never edited.
SRC_WT = r'C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/p1-u9'
FALS = r'C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/p1-u9-fals-rw1'
PKG = FALS + '/packages/providers'

if os.path.exists(FALS):
    shutil.rmtree(FALS, ignore_errors=True)
os.makedirs(FALS + '/packages', exist_ok=True)
shutil.copytree(SRC_WT + '/packages/providers', PKG, ignore=shutil.ignore_patterns('node_modules', 'dist'))
for rel in ['packages/providers/node_modules', 'node_modules']:
    target = SRC_WT + '/' + rel
    if os.path.exists(target):
        link = FALS + '/' + rel
        subprocess.run(['cmd', '/c', 'mklink', '/J', link.replace('/', '\\'), target.replace('/', '\\')], check=True, stdout=subprocess.DEVNULL)
for name in os.listdir(SRC_WT + '/packages'):
    if name != 'providers' and not os.path.exists(FALS + '/packages/' + name):
        subprocess.run(['cmd', '/c', 'mklink', '/J', (FALS + '/packages/' + name).replace('/', '\\'), (SRC_WT + '/packages/' + name).replace('/', '\\')], check=True, stdout=subprocess.DEVNULL)
for f in ['package.json', 'pnpm-workspace.yaml', 'tsconfig.base.json', 'tsconfig.json']:
    if os.path.exists(SRC_WT + '/' + f):
        shutil.copy(SRC_WT + '/' + f, FALS + '/' + f)

live = PKG + '/src/live.ts'
orig = open(live, encoding='utf-8', newline='').read()

mutants = {
    # H1: drop lift condition 2 (the pause); a same-utterance chunk after turnComplete lifts the mute again
    'H1-gap-condition-dropped': ('if (this.crisisTurnEnded && gapMs >= this.crisisResumeGapMs) {', 'if (this.crisisTurnEnded) {'),
    # Low: the lift no longer ends the crisis utterance, so a new spoken crisis never refires
    'Low-lift-keeps-crisis-state': ('this.flushUser(true); // the crisis utterance is over; its words must not be re-scanned', '// (mutant: crisis utterance not ended on lift)'),
}


def run():
    r = subprocess.run(['pnpm', '-C', PKG, 'exec', 'tsx', '--test', 'tests/live.test.ts'], capture_output=True, text=False, shell=True, cwd=PKG)
    txt = (r.stdout + r.stderr).decode('utf-8', 'replace')
    m = {}
    for k in ('tests', 'pass', 'fail'):
        hit = re.search(r'(?m)^\S*\s*' + k + r' (\d+)\s*$', txt)
        m[k] = hit.group(1) if hit else '?'
    failing = sorted({l.strip()[:120] for l in txt.splitlines() if l.strip().startswith(chr(10006)) and 'ms)' in l})
    return r.returncode, m, failing


rc, m, _ = run()
print(f"BASELINE: rc={rc} tests={m['tests']} pass={m['pass']} fail={m['fail']}", flush=True)
for name, (a, b) in mutants.items():
    assert orig.count(a) == 1, (name, orig.count(a))
    open(live, 'w', encoding='utf-8', newline='').write(orig.replace(a, b))
    rc, m, failing = run()
    print(f"{name}: rc={rc} tests={m['tests']} pass={m['pass']} fail={m['fail']}", flush=True)
    for f in failing:
        print(f"    {f}", flush=True)
open(live, 'w', encoding='utf-8', newline='').write(orig)
rc, m, _ = run()
print(f"RESTORED: rc={rc} tests={m['tests']} pass={m['pass']} fail={m['fail']}", flush=True)
