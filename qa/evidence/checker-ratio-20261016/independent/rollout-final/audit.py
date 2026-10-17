import hashlib,json,pathlib,difflib,datetime,subprocess
root=pathlib.Path('D:/vc'); base=root/'qa/evidence/checker-ratio-20261016'; own=base/'independent/rollout-final'
def digest(p): return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
def read(p): return pathlib.Path(p).read_text(encoding='utf-8-sig').replace('\r\n','\n')
inventory=json.loads(read(base/'rollout-policy-stage/inventory.json')); results=[]; diffs=[]
for e in inventory['entries']:
    current=root/e['target']; staged=root/e['staged']; archive=root/e['archive_candidate']
    assert digest(current)==e['before_sha256']
    assert digest(staged)==e['after_sha256']
    assert current.read_bytes()==archive.read_bytes(),str(current)
    diffs.extend(difflib.unified_diff(read(current).splitlines(True),read(staged).splitlines(True),fromfile=str(current),tofile=str(staged)))
    results.append({'target':str(current),'current':digest(current),'staged':digest(staged),'archive':digest(archive),'full_archive_equal':True})
canonical=root/inventory['canonical']['target']; assert digest(canonical)==inventory['canonical']['before_sha256']
diffs.extend(difflib.unified_diff(read(canonical).splitlines(True),read(root/inventory['canonical']['staged']).splitlines(True),fromfile=str(canonical),tofile='staged canonical'))
(own/'policy-body-diffs.log').write_text(''.join(diffs),encoding='utf-8')
before=json.loads(read(base/'rollout-config-before.json')); config=[]
for e in before:
    p=pathlib.Path(e['path']); exists=p.exists(); sha=digest(p) if exists else None
    assert exists==e['exists'] and sha==e['sha256'],str(p)
    config.append({'path':str(p),'exists':exists,'sha256':sha,'unchanged':True})
# Supporting actual TOML and hook files: bytes hashed, no secret values output.
support=[]
for p in [pathlib.Path('D:/ai_os/AGENTS.md'),pathlib.Path('C:/Users/Lenovo/.codex/AGENTS.md')]:
    support.append({'path':str(p),'exists':p.exists(),'sha256':digest(p) if p.exists() else None})
for parent in [pathlib.Path('D:/ai_os/.codex/hooks'),pathlib.Path('D:/ai_os/.claude/hooks'),pathlib.Path('C:/Users/Lenovo/.codex/hooks')]:
    if parent.exists():
        support.extend({'path':str(p),'sha256':digest(p)} for p in parent.iterdir() if p.is_file())
now=datetime.datetime.now(datetime.timezone.utc); cut=datetime.datetime.fromisoformat(inventory['cutover'].replace('Z','+00:00')); assert now<cut
hashpaths=['isolated/tools/tick.mjs','isolated/scripts/token_scan.py','isolated/scripts/tests/test_token_scan.py','isolated/tools/tests/tick-modes.test.mjs','rollout-guard.diff','rollout-opening.diff','rollout-policy.diff','peer2-source.txt']
out={'utc':now.isoformat(),'cutover':inventory['cutover'],'future':True,'protocols':results,'config':config,'support':support,'source_hashes':{p:digest(base/p) for p in hashpaths}}
(own/'audit-hashes-before.json').write_text(json.dumps(out,indent=2),encoding='utf-8')
env=__import__('os').environ.copy();env['AIOS_POLICY_PAGE']=str(root/inventory['canonical']['staged']);env['AIOS_POLICY_ROOTS']=json.dumps([str(base/'rollout-policy-stage/codex'),str(base/'rollout-policy-stage/shared')])
r=subprocess.run(['node',str(base/'isolated/tools/tick.mjs'),'--policy-check'],env=env,capture_output=True,text=True)
(own/'policy-check.log').write_text(r.stdout+r.stderr);assert r.returncode==0
print('PASS four exact full protocol archives; staged/current hashes; config baseline; future cutoff; staged policy check')
