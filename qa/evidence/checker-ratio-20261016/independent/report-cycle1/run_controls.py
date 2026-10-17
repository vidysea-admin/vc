from pathlib import Path
import subprocess, sys, hashlib, ast, json, importlib.util
import pytest
base=Path('qa/evidence/checker-ratio-20261016').resolve(); own=base/'independent/report-cycle1'; own.mkdir(parents=True,exist_ok=True)
src=base/'isolated/scripts/token_scan.py'; tests=base/'isolated/scripts/tests/test_token_scan.py'; original=src.read_bytes(); testbytes=tests.read_bytes()
sha=lambda x:hashlib.sha256(x).hexdigest()
assert sha(original)=='4189ebe7eedc3013171a44f40f38263ede8216d68034a2a37e49300a49e4119c'
assert sha(testbytes)=='365e269ed9801afb0cd45fdf5786638ee1e5eccbfd62af883eddc368cc9d228a'
commands=[]
def run(label,target,temp,extra=()):
 cmd=[sys.executable,'-B','-m','pytest',str(target),'-q','--tb=short','--maxfail=1','-p','no:cacheprovider','--basetemp='+str(own/temp),*extra]
 p=subprocess.run(cmd,capture_output=True,text=True); command=subprocess.list2cmdline(cmd); commands.append(command)
 (own/(label+'.log')).write_text('COMMAND '+command+'\n'+p.stdout+p.stderr,encoding='utf-8'); print(label,p.returncode,p.stdout[-130:].strip(),flush=True); return p
full=run('affected42',tests,'tmp2'); assert full.returncode==0 and '42 passed' in full.stdout
old=ast.parse((base/'report-tests.txt').read_text(encoding='utf-8-sig')); new=ast.parse(testbytes.decode('utf-8-sig'))
def functions(tree): return {n.name:ast.dump(n) for n in tree.body if isinstance(n,ast.FunctionDef) and n.name.startswith('test_')}
a,b=functions(old),functions(new); assert len(a)==37 and all(b.get(k)==v for k,v in a.items()); print('Original 37 test ASTs unchanged',flush=True)
# Independently reuse the prior counterexample input, with positive repair expectations.
spec=importlib.util.spec_from_file_location('cycle1tests',tests); t=importlib.util.module_from_spec(spec); spec.loader.exec_module(t)
probe=own/'positive-probe'; probe.mkdir(exist_ok=True); p=probe/'s.jsonl'; checker=probe/'checker.jsonl'
def task(kind,second,turn): return {'type':'event_msg','timestamp':t.TODAY+'T10:00:%02dZ'%second,'payload':{'type':kind,'turn_id':turn}}
records=[{'type':'session_meta','payload':{'id':'s'}},task('task_started',0,'closed'),{'type':'token_usage_record','timestamp':t.TODAY+'T10:00:03Z','payload':{'session_id':'s','turn_id':'closed','response_id':'u','usage':{'input_tokens':10,'output_tokens':1}}},task('task_complete',10,'closed')]
t._write(str(checker),[t._event('checker','review',1)]); bindings=[t._binding('s','maker',p,start=t.TODAY+'T10:00:02Z',end=t.TODAY+'T10:00:08Z'),t._binding('checker','checker',checker)]
with pytest.MonkeyPatch.context() as m:
 t._write(str(p),records); clean=t._report(probe,m,bindings)
 t._write(str(p),records+[task('task_started',20,'later-open')]); later=t._report(probe,m,bindings)
 t._write(str(p),records+[task('task_started',7,'overlapping-open')]); overlap=t._report(probe,m,bindings)
assert clean['efficiency']['complete'] and clean['efficiency']==later['efficiency'] and clean['roles']==later['roles']
assert clean['roles']['maker']['active_seconds']==6 and clean['overall_tokens']==27
assert 'incomplete_active_task' in overlap['efficiency']['unknown_reasons'] and not overlap['efficiency']['complete']
(own/'positive-proof.json').write_text(json.dumps({'baseline':clean,'later_open':later,'overlapping_open':overlap},indent=2),encoding='utf-8'); print('Prior counterexample fixed; overlapping open remains UNKNOWN',flush=True)
source=original.decode('utf-8-sig')
cases=[('R1','test_native_scope_closed_turn_clips_outside_endpoints_and_old_usage','native_pending[task_key] = (started, possible_owners)','native_pending[task_key] = (started, identity_candidates)','assert later["efficiency"] == result["efficiency"]'),('R2','test_native_scope_closed_turn_clips_outside_endpoints_and_old_usage','outside_scope = bool(is_native and mapped and ts is not None','outside_scope = bool(False and is_native and mapped and ts is not None','assert result["roles"]["unknown"]["tokens"] == 0'),('R3','test_native_scope_missing_or_wrong_pair_never_supplies_time','task_key = (session, actual_turn)','task_key = (transcript_session, "unsafe")','assert result["roles"]["maker"]["active_seconds"] == 0, fault')]
results=[]
for name,test,before,after,reached in cases:
 d=own/name/'scripts'; (d/'tests').mkdir(parents=True,exist_ok=True); target=d/'tests/test_token_scan.py'; target.write_bytes(testbytes); copy=d/'token_scan.py'; copy.write_bytes(original)
 g=run(name+'-green',target,name+'-green-tmp',('-k',test)); assert g.returncode==0
 assert source.count(before)==1; copy.write_text(source.replace(before,after),encoding='utf-8')
 r=run(name+'-red',target,name+'-red-tmp',('-k',test))
 copy.write_bytes(original)
 assert r.returncode==1 and reached in r.stdout and 'FAILED ' in r.stdout and 'ERROR at setup' not in r.stdout,(name,r.stdout)
 restored=run(name+'-restored',target,name+'-restored-tmp',('-k',test)); assert restored.returncode==0
 assert target.read_bytes()==testbytes and copy.read_bytes()==original
 results.append(dict(criterion=name,test=test,mutation_before=before,mutation_after=after,reached_assertion=reached,green=0,red=1,restored=0))
assert src.read_bytes()==original and tests.read_bytes()==testbytes
(own/'controls.json').write_text(json.dumps({'source_sha256':sha(original),'tests_sha256':sha(testbytes),'unchanged_original_tests':37,'results':results,'commands':commands},indent=2),encoding='utf-8')
(own/'verdict.md').write_text('''# T056 repair cycle 1: independent report-code review
VERDICT: PASS (scoped report readiness only)
Owner: p0-report-final; independent of author and plan approver.
Source SHA256: '''+sha(original)+'''
Tests SHA256: '''+sha(testbytes)+'''
Own affected module: 42 passed; affected42.log records exact command and output.
Own source comparison: all original 37 test function ASTs unchanged against report-tests.txt.
Own positive counterexample: completed task :00-:10 clipped to :02-:08; later open at :20 leaves efficiency and roles identical; open at :07 remains UNKNOWN.
Positive proof: positive-proof.json; own synthetic fixtures in positive-probe/.
R1 GREEN/RED/restored GREEN: remove possible_owners use; reaches later efficiency equality failure.
R2 GREEN/RED/restored GREEN: disable native outside_scope exclusion; reaches unknown tokens == 0 failure.
R3 GREEN/RED/restored GREEN: collapse session/turn task key; wrong-turn negative reaches maker active_seconds == 0 failure.
Each control used unchanged tests, isolated source, unique explicit basetemp and no bytecode/cache writes; source byte-restored and verified.
Exact mutations, intended reached assertions and own commands: controls.json; full outputs: R1/R2/R3-green/red/restored.log.
R1 source: scan:289-294 derives possible owners from genuine start and finite window end; clipping still requires ordered completed pair with matching session/turn.
R2 source: outside_scope remains native-only, known mapped session, known turn/time, strictly outside every valid finite window; unknown child/identity and selected-window misses stay UNKNOWN.
Data lens: cumulative delta baseline/reset validation is unchanged; default daily stats remain outside feature exclusion; partial known costs and delivery descendant completeness guards retained.
Affected module includes cumulative boundary/reset, unknown child/identity, adjacency/overlap, delivery descendant and legacy/default-shape checks; all passed.
No main source/shared files, Git, settings, models, providers, real data or web modified/accessed; only owned isolated QA artifacts.
Prior FAIL retained; repair assessed against new hashes, not converted administratively into PASS.
All original T056 planning/review/checking/probe/repair costs remain cumulative; actual aggregate ratio UNKNOWN.
Open: full P0 integration, actual ten-percent result, shared installation/adoption and rollout; none established by this verdict.
''',encoding='utf-8')
print('MANDATORY EVIDENCE COMPLETE; scoped verdict written',flush=True)
