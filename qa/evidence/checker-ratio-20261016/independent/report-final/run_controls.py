from pathlib import Path
import subprocess, sys, hashlib, ast, json
base=Path('qa/evidence/checker-ratio-20261016'); own=base/'independent/report-final'; src=base/'isolated/scripts/token_scan.py'; tests=base/'isolated/scripts/tests/test_token_scan.py'
def run(label, target, temp, extra=()):
 cmd=[sys.executable,'-B','-m','pytest',str(target),'-q','--tb=short','-p','no:cacheprovider','--basetemp='+str(own/temp),*extra]
 p=subprocess.run(cmd,capture_output=True,text=True); (own/(label+'.log')).write_text('COMMAND '+subprocess.list2cmdline(cmd)+'\n'+p.stdout+p.stderr,encoding='utf-8'); print(label,p.returncode,p.stdout[-180:]); return p
p=run('affected',tests,'tmp1')
if p.returncode: sys.exit(1)
old=ast.parse((base/'report-tests.txt').read_text(encoding='utf-8-sig')); new=ast.parse(tests.read_text(encoding='utf-8-sig'))
a={n.name:ast.dump(n) for n in old.body if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef)) and n.name.startswith('test_')}; b={n.name:ast.dump(n) for n in new.body if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef)) and n.name.startswith('test_')}
unchanged=all(b.get(k)==v for k,v in a.items()); print('baseline tests',len(a),'unchanged',unchanged); assert len(a)==37 and unchanged
original=src.read_bytes(); source=original.decode('utf-8-sig'); cases=[('clip','test_native_scope_closed_turn_clips_outside_endpoints_and_old_usage','native_pending[task_key] = (stamp(payload.get("started_at")) or ts, identity_candidates)','native_pending[task_key] = (stamp(payload.get("started_at")) or ts, candidates)'),('outside','test_native_scope_closed_turn_clips_outside_endpoints_and_old_usage','outside_scope = bool(is_native and mapped and ts is not None','outside_scope = bool(False and is_native and mapped and ts is not None'),('identity','test_native_scope_missing_or_wrong_pair_never_supplies_time','task_key = (session, actual_turn)','task_key = (transcript_session, "unsafe")')]
results=[]
for name,test,oldtext,newtext in cases:
 d=own/name/'scripts'; (d/'tests').mkdir(parents=True,exist_ok=True); target=d/'tests/test_token_scan.py'; target.write_bytes(tests.read_bytes()); copy=d/'token_scan.py'; copy.write_bytes(original)
 args=('-k',test)
 g=run(name+'-green',target,name+'-green-tmp',args); assert g.returncode==0
 assert source.count(oldtext)==1; copy.write_text(source.replace(oldtext,newtext),encoding='utf-8')
 r=run(name+'-red',target,name+'-red-tmp',args); assert r.returncode==1 and 'AssertionError' in r.stdout and 'ERROR at setup' not in r.stdout
 copy.write_bytes(original); restored=run(name+'-restored',target,name+'-restored-tmp',args); assert restored.returncode==0
 results.append({'criterion':name,'test':test,'old':oldtext,'mutant':newtext,'green':g.returncode,'red':r.returncode,'restored':restored.returncode})
assert src.read_bytes()==original
(own/'controls.json').write_text(json.dumps({'baseline_test_count':len(a),'unchanged':unchanged,'source_sha256':hashlib.sha256(original).hexdigest(),'tests_sha256':hashlib.sha256(tests.read_bytes()).hexdigest(),'controls':results},indent=2),encoding='utf-8')
