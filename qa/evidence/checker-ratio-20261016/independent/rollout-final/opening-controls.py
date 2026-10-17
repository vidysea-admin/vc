import pathlib,json,types,hashlib,sys
root=pathlib.Path('D:/vc'); base=root/'qa/evidence/checker-ratio-20261016'; own=base/'independent/rollout-final'; src=base/'isolated/scripts/token_scan.py'
raw=src.read_text(encoding='utf-8'); before=hashlib.sha256(src.read_bytes()).hexdigest()
def module(text):
    m=types.ModuleType('own_token_scan');m.__file__=str(src);exec(compile(text,str(src),'exec'),m.__dict__);m.PROJECTS=str(own/'never-scan');return m
m=module(raw); fixture=own/'opening-fixture';fixture.mkdir(exist_ok=True)
day=__import__('time').strftime('%Y-%m-%d',__import__('time').gmtime()); transcript=fixture/'root.jsonl'
records=[{'type':'session_meta','payload':{'id':'root'}},{'type':'event_msg','timestamp':day+'T10:00:00Z','payload':{'type':'task_started','turn_id':'t'}},{'type':'token_usage_record','timestamp':day+'T10:01:00Z','payload':{'session_id':'root','turn_id':'t','response_id':'r','usage':{'input_tokens':100000,'output_tokens':1000}}},{'type':'event_msg','timestamp':day+'T10:01:40Z','payload':{'type':'task_complete','turn_id':'t'}}]
transcript.write_text('\n'.join(map(json.dumps,records))+'\n')
binding=dict(feature_id='P0',cycle=1,role='maker',run_id='root',parent_run_id=None,session_id='root',transcript=str(transcript))
ledger=dict(coverage_complete=True,bindings=[binding],delivery=dict(root_run_id='root',child_manifest_complete=True,prior_checking_complete=True,prior_checking_run_ids=[]))
def scan(mod,ledger):
    f=fixture/'ledger.json';f.write_text(json.dumps(ledger));return mod.scan(bindings=str(f),feature='P0',delivery=True,opening=True)
def clone(x):return json.loads(json.dumps(x))
def structural(mod):
    for fault,reason in [('root','missing_root_run_binding'),('child','missing_child_run_binding')]:
        bad=clone(ledger)
        if fault=='root':bad['delivery']['root_run_id']='absent'
        else:bad['bindings'][0]['child_run_ids']=['absent']
        r=scan(mod,bad);assert r['efficiency']['complete'] is False,fault
        assert reason in r['efficiency']['unknown_reasons'],fault
        assert r['efficiency']['status']=='UNKNOWN' and r['opening']['acceptance_ready'] is False
r=scan(m,ledger);assert r['opening']['complete'] and not r['opening']['acceptance_ready'];assert r['efficiency']['checker_tokens']==0 and r['efficiency']['maker_tokens']==101000
structural(m);print('GREEN C1 valid zero readiness; invalid root and missing child UNKNOWN')
anchor='opening_reasons = reasons | (delivery_reasons - {"missing_acceptance_evidence"})';assert raw.count(anchor)==1
mut=raw.replace(anchor,'opening_reasons = set(reasons)');copy=own/'opening-mutant.py';copy.write_text(mut,encoding='utf-8')
try:
    structural(module(mut))
except AssertionError as e: print('RED C1 intended structural assertion:',e)
else:raise AssertionError('surviving mutant')
copy.write_bytes(src.read_bytes());structural(module(copy.read_text(encoding='utf-8')));print('GREEN C1 restored source copy')
checker=fixture/'checker.jsonl';checker.write_text(json.dumps({'session_id':'check','event_id':'c','timestamp':day+'T10:02:00Z','duration_ms':1000,'message':{'model':'synthetic','usage':{'input_tokens':100,'output_tokens':1,'cache_read_input_tokens':2,'cache_creation_input_tokens':3}}})+'\n')
withcheck=clone(ledger);withcheck['bindings'].append(dict(binding,run_id='check',session_id='check',role='checker',parent_run_id='root',transcript=str(checker)));withcheck['delivery']['prior_checking_run_ids']=['check']
known=scan(m,withcheck);assert known['efficiency']['complete'] and known['efficiency']['checker_tokens']==106
withcheck['delivery']['prior_checking_run_ids']=[];hidden=scan(m,withcheck);assert not hidden['efficiency']['complete'] and hidden['efficiency']['checker_tokens']==106
print('PASS prior checker 106 tokens retained; hidden inventory remains UNKNOWN')
out=dict(schema_version=1,feature_report=r,efficiency=r['efficiency'],phase=r['phase'],opening=r['opening'],delivery_summary=r['delivery_summary'])
(own/'collector-zero-report.json').write_text(json.dumps(out,indent=2));assert hashlib.sha256(src.read_bytes()).hexdigest()==before
(own/'opening-results.json').write_text(json.dumps({'source_sha256':before,'C1':'GREEN/RED/restoredGREEN','prior_cost_tokens':106,'actual_aggregate_ratio':'UNKNOWN'},indent=2))
