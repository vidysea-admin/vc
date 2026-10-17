import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
const root='D:/vc';
const evidence=path.join(root,'qa/evidence/vc-release-t052-2026-10-13.b');
const acceptance=path.join(evidence,'acceptance.test.ts');
const tsx=path.join(root,'node_modules/tsx/dist/cli.mjs');
const originalGraph=fs.readFileSync(path.join(root,'packages/engine/src/scribe/graph.ts'));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const results=[];
for(const [slug,needle,replacement,pattern] of [
 ['checkpoint-cas-only','collection.updateOne({ _id: rowId, vcWriterAttempt: expectedOwner ?? { $exists: false } }, { $set: fields, ...timestamp }','collection.updateOne({ _id: rowId }, { $set: fields, ...timestamp }','actual existing-row checkpoint CAS'],
 ['special-write-cas-only','collection.updateOne({ _id: rowId, vcWriterAttempt: expectedOwner ?? { $exists: false } }, { $set: fields, ...(timestamps','collection.updateOne({ _id: rowId }, { $set: fields, ...(timestamps','actual existing-row special-write CAS'],
]) {
 const dir=path.join(evidence,'isolated',slug,'engine');
 fs.mkdirSync(dir,{recursive:true});fs.cpSync(path.join(root,'packages/engine/src'),path.join(dir,'src'),{recursive:true});
 const dependency=path.join(dir,'node_modules');if(!fs.existsSync(dependency))fs.symlinkSync(path.join(root,'packages/engine/node_modules'),dependency,'junction');
 const file=path.join(dir,'src/scribe/graph.ts');const baseline=fs.readFileSync(file);const text=baseline.toString();
 if(text.split(needle).length!==2)throw Error(`mutant ${slug} anchor not unique`);
 const run=(phase)=>{const r=spawnSync(process.execPath,[tsx,'--test','--test-name-pattern',pattern,acceptance],{cwd:root,env:{...process.env,VC_SECONDARY_GRAPH:file},encoding:'utf8',timeout:25000});fs.writeFileSync(path.join(evidence,`${slug}.${phase}.log`),(r.stdout??'')+(r.stderr??''));return{status:r.status,signal:r.signal,error:r.error?.message,output:(r.stdout??'')+(r.stderr??'')};};
 let green,red,restored;
 try {green=run('green');fs.writeFileSync(file,text.replace(needle,replacement));red=run('red');}
 finally{fs.writeFileSync(file,baseline);restored=hash(fs.readFileSync(file))===hash(baseline);}
 const killed=green.status===0&&red.status!==0&&red.output.includes('CAS must preserve independently recreated winner byte-for-byte')&&!red.error;
 const result={slug,pattern,green:green.status,red:red.status,redSignal:red.signal,restored,killed,boundSourceUnchanged:hash(fs.readFileSync(path.join(root,'packages/engine/src/scribe/graph.ts')))===hash(originalGraph)};
 results.push(result);console.log(JSON.stringify(result));
}
fs.writeFileSync(path.join(evidence,'mutations.json'),JSON.stringify(results,null,2));
if(results.some(r=>!r.killed||!r.restored||!r.boundSourceUnchanged))process.exitCode=1;
