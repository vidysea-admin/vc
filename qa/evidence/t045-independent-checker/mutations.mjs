import { cpSync, mkdirSync, readFileSync, writeFileSync, symlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const cases=[
 ['context','graph.ts','approvedContext: s.approvedContext }, { ...deps, preflight','approvedContext: [] }, { ...deps, preflight'],
 ['verifier','nodes.ts','output.summary.length > 0 && input.approvedContext.length > 0','output.summary.length > 0 && false'],
 ['failclosed','nodes.ts','if (verification.verdict !== "clear" || verification.confidence < 0.95 || verification.offendingSpans.length !== 0) return withhold();','if (false) return withhold();'],
 ['purpose','nodes.ts','readActiveProfile(deps.db, studentId, SCRIBE_PURPOSE)','readActiveProfile(deps.db, studentId, "application_draft")'],
 ['changed','nodes.ts','input.facts.filter((f) => changedKeys.has(f.key))','input.facts.filter((f) => existingFacts.length === 0 && changedKeys.has(f.key))'],
];
const results=[];
for(const [name,file,before,after] of cases){
 const dir=resolve('qa/evidence/t045-independent-checker/mutants',name,'engine');mkdirSync(dir,{recursive:true});cpSync('packages/engine/src',resolve(dir,'src'),{recursive:true});symlinkSync(resolve('packages/engine/node_modules'),resolve(dir,'node_modules'),'junction');
 const path=resolve(dir,'src/scribe',file);const src=readFileSync(path,'utf8');if(!src.includes(before))throw Error('unreached mutation target '+name);writeFileSync(path,src.replace(before,after));
 const r=spawnSync(process.execPath,[resolve('node_modules/tsx/dist/cli.mjs'),resolve('qa/evidence/t045-independent-checker/oracle.ts')],{encoding:'utf8',env:{...process.env,T045_MUTANT_ROOT:resolve(dir,'src')},maxBuffer:10*1024*1024});
 writeFileSync(resolve('qa/evidence/t045-independent-checker',name+'-mutant.log'),r.stdout+r.stderr);const rec={name,status:r.status,assertionReached:/AssertionError/.test(r.stderr),error:r.stderr.slice(-2000)};results.push(rec);console.log(JSON.stringify(rec));
}
writeFileSync('qa/evidence/t045-independent-checker/mutations.json',JSON.stringify(results,null,2));process.exitCode=results.every(r=>r.status!==0&&r.assertionReached)?0:1;
