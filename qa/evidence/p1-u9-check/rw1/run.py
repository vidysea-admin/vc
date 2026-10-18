import os, shutil, subprocess, sys, re, time

SRC = r'C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/p1-u9'
BASE = r'C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/chk-u9rw1'
PROBE = BASE + '/chkrw1.test.ts'
OUT = BASE + '/out'
os.makedirs(OUT, exist_ok=True)


def junction(link, target):
    subprocess.run(['cmd', '/c', 'mklink', '/J', link.replace('/', chr(92)), target.replace('/', chr(92))], check=True, stdout=subprocess.DEVNULL)


def make_tree(name):
    root = BASE + '/' + name
    if os.path.exists(root):
        subprocess.run(['cmd', '/c', 'rmdir', '/S', '/Q', root.replace('/', chr(92))], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    os.makedirs(root + '/packages', exist_ok=True)
    pkg = root + '/packages/providers'
    shutil.copytree(SRC + '/packages/providers', pkg, ignore=shutil.ignore_patterns('node_modules', 'dist'))
    junction(pkg + '/node_modules', SRC + '/packages/providers/node_modules')
    junction(root + '/node_modules', SRC + '/node_modules')
    for n in os.listdir(SRC + '/packages'):
        if n != 'providers':
            junction(root + '/packages/' + n, SRC + '/packages/' + n)
    for f in ['package.json', 'pnpm-workspace.yaml', 'tsconfig.base.json', 'tsconfig.json']:
        if os.path.exists(SRC + '/' + f):
            shutil.copy(SRC + '/' + f, root + '/' + f)
    shutil.copy(PROBE, pkg + '/tests/chkrw1.test.ts')
    return root, pkg


def run(pkg, args):
    t = time.time()
    r = subprocess.run(['pnpm', '-C', pkg, 'exec'] + args, capture_output=True, shell=True, cwd=pkg)
    txt = (r.stdout + r.stderr).decode('utf-8', 'replace')
    return r.returncode, txt, time.time() - t


def counts(txt):
    return {k: (re.search(r'ℹ ' + k + r' (\d+)', txt) or [None, '?'])[1] for k in ('tests', 'pass', 'fail')}


def failing(txt):
    return [l.strip()[:150] for l in txt.splitlines() if l.strip().startswith('✖') and 'ms)' in l][:12]


root, pkg = make_tree('clean')
for f in (['tsx', '--test', 'tests/live.test.ts'], ['tsx', '--test', 'tests/chkrw1.test.ts'], ['tsc', '--noEmit']):
    rc, txt, dt = run(pkg, f)
    nm = f[-1].split('/')[-1]
    open(OUT + '/clean-%s.txt' % nm, 'w', encoding='utf-8').write(txt)
    print('CLEAN %s rc=%s %s t=%.0fs failing=%s' % (nm, rc, counts(txt), dt, failing(txt)), flush=True)
    if rc and f[0] == 'tsc': print(txt[:800])

mutants = {
    'H1a-turnComplete-ends-utterance': ('    this.flushUser(!this.crisisMute);\n    this.flushAssistant(false);', '    this.flushUser(true);\n    this.flushAssistant(false);'),
    'H1b-no-turn-end-condition': ('if (this.crisisTurnEnded && gapMs >= this.crisisResumeGapMs) {', 'if (gapMs >= this.crisisResumeGapMs) {'),
    'Low-lift-keeps-utterance': ('        this.flushUser(true); // the crisis utterance is over; its words must not be re-scanned\n', ''),
}
for name, (a, b) in mutants.items():
    r2, p2 = make_tree('mut-' + name.split('-')[0])
    l2 = p2 + '/src/live.ts'
    o2 = open(l2, encoding='utf-8', newline='').read().replace('\r\n', '\n')
    assert o2.count(a) == 1, (name, o2.count(a))
    open(l2, 'w', encoding='utf-8', newline='').write(o2.replace(a, b))
    rc, txt, dt = run(p2, ['tsx', '--test', 'tests/live.test.ts', 'tests/chkrw1.test.ts'])
    open(OUT + '/mut-%s.txt' % name, 'w', encoding='utf-8').write(txt)
    print('MUTANT %s rc=%s %s t=%.0fs failing=%s' % (name, rc, counts(txt), dt, failing(txt)), flush=True)
print('DONE', flush=True)
