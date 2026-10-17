import pathlib, shutil, subprocess, os, json, hashlib, time, datetime
ROOT=pathlib.Path('C:/Users/Lenovo/.codex/worktrees/application-draft-core/vc')
OUT=pathlib.Path('D:/vc/qa/evidence/t038-a')
FILES=['packages/schemas/src/schemas.ts','apps/api/src/server.ts','apps/api/src/openapi.ts','apps/api/tests/server.test.ts']
def hashfile(p): return hashlib.sha256(p.read_bytes()).hexdigest().upper()
def junction(p,t):
 p.parent.mkdir(parents=True,exist_ok=True)
 subprocess.run(['cmd','/c','mklink','/J',str(p),str(t)],check=True,stdout=subprocess.DEVNULL)
def copy(name):
 dest=OUT/name
 dest.mkdir()
 for n in ['apps','packages']: shutil.copytree(ROOT/n,dest/n,ignore=shutil.ignore_patterns('node_modules'))
 for n in ['package.json','pnpm-lock.yaml','pnpm-workspace.yaml','tsconfig.json']:
  if (ROOT/n).exists(): shutil.copy2(ROOT/n,dest/n)
 junction(dest/'node_modules', ROOT/'node_modules')
 for group in ['apps','packages']:
  for pkg in (ROOT/group).iterdir():
   deps=pkg/'node_modules'
   if not deps.exists(): continue
   target=dest/group/pkg.name/'node_modules'; target.mkdir()
   for dep in deps.iterdir():
    if dep.name=='@vc':
     (target/'@vc').mkdir()
     for vc in dep.iterdir(): junction(target/'@vc'/vc.name,dest/'packages'/vc.name)
    else: junction(target/dep.name,dep.resolve()) if dep.is_dir() else shutil.copy2(dep,target/dep.name)
 return dest
env=os.environ.copy();env['VC_TESTLOCK_TIMEOUT_SECS']='900'
results=[]
def run(cwd,name,args):
 cmd=['C:/Program Files/Git/bin/bash.exe','D:/vc/scripts/vc-testlock.sh',*args]
 start=time.time()
 with (OUT/(name+'.log')).open('w',encoding='utf8') as log:
  p=subprocess.run(cmd,cwd=cwd,env=env,stdout=log,stderr=subprocess.STDOUT,timeout=1000)
 row={'name':name,'cwd':str(cwd),'command':cmd,'exit':p.returncode,'seconds':time.time()-start,'log':name+'.log'}
 results.append(row); print(json.dumps(row),flush=True)
 (OUT/'results.json').write_text(json.dumps(results,indent=2))
 return p.returncode
node='C:/Program Files/nodejs/node.exe'
tsx=str(ROOT/'node_modules/tsx/dist/cli.mjs')
pnpm='C:/Users/Lenovo/AppData/Roaming/npm/node_modules/pnpm/bin/pnpm.cjs'
state={'start':datetime.datetime.now(datetime.timezone.utc).isoformat(),'source':{f:hashfile(ROOT/f) for f in FILES},'manifest':hashfile(ROOT/'docs/plan.md')}
(OUT/'start.json').write_text(json.dumps(state,indent=2))
for pkg in ['schemas','api']: run(ROOT,pkg+'-types',[node,pnpm,'--filter','@vc/'+pkg,'typecheck'])
run(ROOT,'affected-api-http',[node,tsx,'--test','--test-concurrency=1','--test-timeout=120000','apps/api/tests/server.test.ts'])
mutants=[
 ('C1-options','packages/schemas/src/schemas.ts','z.array(DraftScalarSchema).max(DRAFT_MAPPING_LIMITS.options).nullable()','z.array(DraftScalarSchema).nullable()',3),
 ('C2-original-grant','apps/api/src/server.ts','JSON.stringify({ ...grant.data, purposes: [...grant.data.purposes].sort() }) !== grantSnapshot','false',11),
 ('C3-false-zero','apps/api/src/server.ts','fields[field.name] = entry.expected;','if (entry.expected) fields[field.name] = entry.expected;',1),
 ('C4-public-claim','apps/api/src/server.ts','status: "draft", requirementsVerified: false','status: "draft", requirementsVerified: true',1),
 ('C1-capturedAt','packages/schemas/src/schemas.ts','capturedAt: z.string().datetime().max(128)','capturedAt: z.string().datetime()',3)]
for name,file,old,new,oracle in mutants:
 dest=copy('copy-'+name)
 args=[node,tsx,'--test','--test-concurrency=1','--test-timeout=120000','--test-name-pattern=T038 synthetic oracle '+str(oracle)+':','apps/api/tests/server.test.ts']
 assert run(dest,name+'-green',args)==0
 touched=[dest/file]; before={str(p):p.read_bytes() for p in touched}
 try:
  raw=touched[0].read_bytes(); assert raw.count(old.encode())==1,(name,raw.count(old.encode()))
  touched[0].write_bytes(raw.replace(old.encode(),new.encode()))
  if name=='C4-public-claim':
   p=dest/'packages/schemas/src/schemas.ts';before[str(p)]=p.read_bytes()
   p.write_bytes(before[str(p)].replace(b'requirementsVerified: z.literal(false)',b'requirementsVerified: z.literal(true)'))
  assert run(dest,name+'-red',args)!=0
 finally:
  for path,data in before.items(): pathlib.Path(path).write_bytes(data)
 assert all(pathlib.Path(p).read_bytes()==data for p,data in before.items())
 assert run(dest,name+'-restore',args)==0
 results.append({'name':name+'-restoration','exactBytes':True,'hashes':{p:hashfile(pathlib.Path(p)) for p in before}})
 (OUT/'results.json').write_text(json.dumps(results,indent=2))
state['end']=datetime.datetime.now(datetime.timezone.utc).isoformat();state['after']={f:hashfile(ROOT/f) for f in FILES};state['unchanged']=state['source']==state['after'];state['manifestUnchanged']=state['manifest']==hashfile(ROOT/'docs/plan.md')
(OUT/'end.json').write_text(json.dumps(state,indent=2))
