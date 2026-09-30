from pathlib import Path
import subprocess, json

base=Path(__file__).resolve().parent
isolated=base/'isolated'
erasure=isolated/'packages/db/src/erasure.ts'
escalation=isolated/'packages/engine/src/guards/escalation.ts'
probe=isolated/'packages/engine/checker-probe.ts'
original={p:p.read_text(encoding='utf-8-sig') for p in (erasure,escalation)}
mutants=[]
for collection in ('escalation_notifications','crisis_flag_reviews'):
    needle=f'  {{ collection: COLLECTION_NAMES.{collection}, phase: 1, filter: byStudent, residue: byStudent }},'
    mutants.append((f'purge-{collection}',erasure,needle,'','lifecycle','RAW ZERO '+collection))
mutants.append(('writer-precheck',escalation,'    await deadline.run(assertStudentNotFenced(db, studentId, deadline.op()));','    // CHECKER MUTANT removed precheck','precheck','RAW PRECHECK forbids driver dispatch'))
mutants.append(('insert-ownership',escalation,'_id: { $in: docs.map((d) => d._id) }, writerToken','_id: { $in: docs.map((d) => d._id) }','ownership','RAW OWNERSHIP replay preserves prior notification bytes'))
reports=[]
try:
    for name,path,needle,replacement,mode,assertion in mutants:
        assert original[path].count(needle)==1,(name,'mutation target not unique')
        path.write_text(original[path].replace(needle,replacement),encoding='utf-8')
        run=subprocess.run(['node','--import','tsx',str(probe),mode],cwd='D:/vc',capture_output=True,text=True)
        transcript=run.stdout+run.stderr
        (base/(name+'.log')).write_text(transcript,encoding='utf-8')
        report={'mutant':name,'isolated_loaded_module':str(path),'exit':run.returncode,'reached_assertion':assertion,'outcome_failure':run.returncode!=0 and assertion in transcript,'stdout':run.stdout[-1200:],'stderr_tail':run.stderr[-2200:]}
        reports.append(report)
        print(json.dumps(report),flush=True)
        path.write_text(original[path],encoding='utf-8')
        assert report['outcome_failure'],(name,'mutant did not reach expected outcome failure')
finally:
    for p,source in original.items(): p.write_text(source,encoding='utf-8')
    (base/'mutation-results.json').write_text(json.dumps(reports,indent=2),encoding='utf-8')
