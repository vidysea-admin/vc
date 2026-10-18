import os, shutil, subprocess, sys, re, time

SRC = r'C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/p1-u9'
BASE = r'C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/chk-u9c1'
PROBE = BASE + '/chk1.test.ts'


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
    shutil.copy(PROBE, pkg + '/tests/chk1.test.ts')
    return root, pkg


def run(pkg, args):
    t = time.time()
    r = subprocess.run(['pnpm', '-C', pkg, 'exec'] + args, capture_output=True, shell=True, cwd=pkg)
    txt = (r.stdout + r.stderr).decode('utf-8', 'replace')
    return r.returncode, txt, time.time() - t


def counts(txt):
    return {k: (re.search(r'ℹ ' + k + r' (\d+)', txt) or [None, '?'])[1] for k in ('tests', 'pass', 'fail')}


root, pkg = make_tree('clean')
live = pkg + '/src/live.ts'
orig = open(live, encoding='utf-8', newline='').read().replace('\r\n', '\n')

# 1. clean: whole live.test.ts and the hostile probes, plus typecheck
rc, txt, dt = run(pkg, ['tsx', '--test', 'tests/live.test.ts'])
open(BASE + '/out-live-clean.txt', 'w', encoding='utf-8').write(txt)
print('CLEAN live.test.ts rc=%s %s t=%.0fs' % (rc, counts(txt), dt), flush=True)
rc, txt, dt = run(pkg, ['tsx', '--test', 'tests/chk1.test.ts'])
open(BASE + '/out-probes-clean.txt', 'w', encoding='utf-8').write(txt)
print('CLEAN probes rc=%s %s t=%.0fs' % (rc, counts(txt), dt), flush=True)
rc, txt, dt = run(pkg, ['tsc', '--noEmit'])
open(BASE + '/out-tsc.txt', 'w', encoding='utf-8').write(txt)
print('CLEAN tsc rc=%s t=%.0fs out=%r' % (rc, dt, txt[:200]), flush=True)

# 2. falsification: three isolated copies
mutants = {
    'F1-interrupted-unmutes': ('    if (!this.crisisMute) this.muted = false;', '    this.muted = false;', 'C4 crisis F1'),
    'F1-naive-crisisFiredForUtterance': ('    if (!this.crisisMute) this.muted = false;', '    if (!this.crisisFiredForUtterance) this.muted = false;', 'C4 crisis F1'),
    'F2-half-reply-dropped': ('    this.flushAssistant(true);\n    this.muted = true;\n    this.crisisMute = true;', '    this.assistantBuf = "";\n    this.muted = true;\n    this.crisisMute = true;', 'C4 crisis F2'),
}
for name, (a, b, pat) in mutants.items():
    r2, p2 = make_tree('mut-' + name.split('-')[0] + ('n' if 'naive' in name else ''))
    l2 = p2 + '/src/live.ts'
    o2 = open(l2, encoding='utf-8', newline='').read().replace('\r\n', '\n')
    assert o2.count(a) == 1, (name, o2.count(a))
    open(l2, 'w', encoding='utf-8', newline='').write(o2.replace(a, b))
    # named tests green before (clean) were run above; now run the whole live file + probes against the mutant
    rc, txt, dt = run(p2, ['tsx', '--test', 'tests/live.test.ts', 'tests/chk1.test.ts'])
    open(BASE + '/out-mut-%s.txt' % name, 'w', encoding='utf-8').write(txt)
    failing = [l.strip()[:150] for l in txt.splitlines() if l.strip().startswith('✖') and 'ms)' in l][:8]
    print('MUTANT %s rc=%s %s t=%.0fs failing=%s' % (name, rc, counts(txt), dt, failing), flush=True)
print('DONE', flush=True)
