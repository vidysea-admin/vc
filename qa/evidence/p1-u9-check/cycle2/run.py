import os, shutil, subprocess, sys, re, time

SRC = r'C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/p1-u9'
BASE = r'C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/chk-u9c2'
PROBE = BASE + '/chk2.test.ts'


def junction(link, target):
    subprocess.run(['cmd', '/c', 'mklink', '/J', link.replace('/', '\\'), target.replace('/', '\\')], check=True, stdout=subprocess.DEVNULL)


def make_tree(name):
    root = BASE + '/' + name
    if os.path.exists(root):
        subprocess.run(['cmd', '/c', 'rmdir', '/S', '/Q', root.replace('/', '\\')], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
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
    shutil.copy(PROBE, pkg + '/tests/chk2.test.ts')
    return root, pkg


def run(pkg, args):
    t = time.time()
    r = subprocess.run(['pnpm', '-C', pkg, 'exec'] + args, capture_output=True, shell=True, cwd=pkg)
    txt = (r.stdout + r.stderr).decode('utf-8', 'replace')
    return r.returncode, txt, time.time() - t


def counts(txt):
    return {k: (re.search(r'ℹ ' + k + r' (\d+)', txt) or [None, '?'])[1] for k in ('tests', 'pass', 'fail')}


root, pkg = make_tree('clean')
for f in (['tsx', '--test', 'tests/live.test.ts'], ['tsx', '--test', 'tests/chk2.test.ts'], ['tsc', '--noEmit']):
    rc, txt, dt = run(pkg, f)
    nm = f[-1].split('/')[-1]
    open(BASE + '/out-clean-%s.txt' % nm, 'w', encoding='utf-8').write(txt)
    print('CLEAN %s rc=%s %s t=%.0fs' % (nm, rc, counts(txt), dt), flush=True)
    if rc and nm.endswith('.txt') is False and f[0] == 'tsc': print(txt[:500])

mutants = {
    'R1-toolCall-resets': ('    this.flushUser(!this.crisisMute);', '    this.flushUser(true);', 'C4 crisis R1'),
    'R2-turnComplete-clears': ('    if (!this.crisisMute) this.muted = false;\n    this.emit({ type: "turn_complete" });', '    this.muted = false;\n    this.crisisMute = false;\n    this.emit({ type: "turn_complete" });', 'C4 crisis R2'),
}
for name, (a, b, pat) in mutants.items():
    r2, p2 = make_tree('mut-' + name.split('-')[0])
    l2 = p2 + '/src/live.ts'
    o2 = open(l2, encoding='utf-8', newline='').read().replace('\r\n', '\n')
    assert o2.count(a) == 1, (name, o2.count(a))
    open(l2, 'w', encoding='utf-8', newline='').write(o2.replace(a, b))
    rc, txt, dt = run(p2, ['tsx', '--test', 'tests/live.test.ts', 'tests/chk2.test.ts'])
    open(BASE + '/out-mut-%s.txt' % name, 'w', encoding='utf-8').write(txt)
    failing = [l.strip()[:140] for l in txt.splitlines() if l.strip().startswith('✖') and 'ms)' in l][:12]
    print('MUTANT %s rc=%s %s t=%.0fs failing=%s' % (name, rc, counts(txt), dt, failing), flush=True)
print('DONE', flush=True)
