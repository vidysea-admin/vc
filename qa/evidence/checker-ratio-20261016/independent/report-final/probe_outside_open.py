from pathlib import Path
import importlib.util, json, hashlib
import pytest
root=Path('qa/evidence/checker-ratio-20261016').resolve(); own=root/'independent/report-final'; probe=own/'outside-open-probe'; probe.mkdir(parents=True,exist_ok=True)
source=root/'isolated/scripts/token_scan.py'; tests=root/'isolated/scripts/tests/test_token_scan.py'
spec=importlib.util.spec_from_file_location('review_tests',tests); t=importlib.util.module_from_spec(spec); spec.loader.exec_module(t)
p=probe/'s.jsonl'; checker=probe/'checker.jsonl'
def task(kind,second,turn):
 return {'type':'event_msg','timestamp':t.TODAY+'T10:00:%02dZ'%second,'payload':{'type':kind,'turn_id':turn}}
records=[{'type':'session_meta','payload':{'id':'s'}},task('task_started',0,'closed'),{'type':'token_usage_record','timestamp':t.TODAY+'T10:00:03Z','payload':{'session_id':'s','turn_id':'closed','response_id':'u','usage':{'input_tokens':10,'output_tokens':1}}},task('task_complete',10,'closed')]
t._write(str(checker),[t._event('checker','review',1)])
bindings=[t._binding('s','maker',p,start=t.TODAY+'T10:00:02Z',end=t.TODAY+'T10:00:08Z'),t._binding('checker','checker',checker)]
with pytest.MonkeyPatch.context() as m:
 t._write(str(p),records); baseline=t._report(probe,m,bindings)
 t._write(str(p),records+[task('task_started',20,'later-open')]); actual=t._report(probe,m,bindings)
assert baseline['efficiency']['complete'] is True, baseline['efficiency']
assert actual['roles']['maker']['active_seconds']==baseline['roles']['maker']['active_seconds']==6
assert actual['overall_tokens']==baseline['overall_tokens']==27
assert actual['efficiency']['unknown_reasons']==['incomplete_active_task'],actual['efficiency']
assert actual['efficiency']['complete'] is False and actual['efficiency']['time_ratio'] is None
summary={'baseline':baseline,'with_after_window_open_task':actual,'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'tests_sha256':hashlib.sha256(tests.read_bytes()).hexdigest()}
(own/'outside-open-proof.json').write_text(json.dumps(summary,indent=2),encoding='utf-8')
verdict=f'''# T056 scoped report-code review
VERDICT: FAIL
Owner: p0-report-final; independent completed-feature source review and own synthetic execution.
Finding: a native open task beginning strictly after every selected window poisons a completed bounded-window report.
Source: isolated/scripts/token_scan.py:291 stores identity_candidates without checking possible interval intersection; :429-430 treats any pending owners as incomplete_active_task.
Reproduction: python -B qa/evidence/checker-ratio-20261016/independent/report-final/probe_outside_open.py
Baseline: native task 10:00:00-10:00:10; maker selection 10:00:02-10:00:08; usage at :03; separate checker usage/time. complete=True, maker active=6s, overall_tokens=27.
Only change: append task_started at 10:00:20 with a new turn, no endpoint and no usage, same session.
Observed: complete=False, unknown_reasons=['incomplete_active_task'], ratios=None; maker active=6s and overall_tokens=27 unchanged.
Expected: the later open task cannot intersect a window ending at :08 and must not invalidate its completed accounting.
Evidence: outside-open-proof.json retains both complete report objects; synthetic fixtures in outside-open-probe/.
Source SHA256: {summary['source_sha256']}
Tests SHA256: {summary['tests_sha256']}
Scope: R1/R2 selected-window isolation fails. Stop at concrete defect per continuation; no further mutation campaign or PASS claim.
Prior pytest fixture setup errors were missing basetemp parent, not product evidence. Earlier interrupted controls are not acceptance proof.
No main source/shared files, Git, settings, models, providers, real data, or web changed/read. Only owned QA artifacts written.
All T056 planning/review/checking/probe/repair costs remain cumulative. Actual aggregate efficiency ratio UNKNOWN.
This verdict is report-readiness code only; no system-wide install/adoption or actual ten-percent claim.
'''
(own/'verdict.md').write_text(verdict,encoding='utf-8'); print(verdict)
