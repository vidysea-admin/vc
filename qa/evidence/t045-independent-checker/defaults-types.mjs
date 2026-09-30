import { spawnSync } from 'node:child_process';
import { readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root=process.cwd();
const units=['packages/db','packages/schemas','packages/observability','packages/providers','mcp/student-profile','mcp/university-kb','apps/api','apps/web'];
const results=[];
for(const unit of units){
 const files=readdirSync(resolve(unit,'tests')).filter(n=>/\.test\.tsx?$/.test(n)).map(n=>'tests/'+n);
 const r=spawnSync(process.execPath,[resolve('node_modules/tsx/dist/cli.mjs'),'--test','--test-concurrency=1',...files],{cwd:resolve(unit),encoding:'utf8',maxBuffer:30*1024*1024});
 writeFileSync(resolve('qa/evidence/t045-independent-checker',unit.replaceAll('/','-')+'.log'),r.stdout+r.stderr);
 results.push({unit,status:r.status,files:files.length,summary:r.stdout.split('\n').filter(l=>/tests |pass |fail |cancelled |skipped |duration_ms/.test(l)).slice(-7)});
 console.log(JSON.stringify(results.at(-1)));
}
for(const unit of [...units,'packages/engine','packages/engine/evals','packages/engine/scripts']){
 const r=spawnSync(process.execPath,[resolve('node_modules/typescript/bin/tsc'),'--noEmit','-p',resolve(unit,'tsconfig.json')],{encoding:'utf8',maxBuffer:20*1024*1024});
 writeFileSync(resolve('qa/evidence/t045-independent-checker',unit.replaceAll('/','-')+'-types.log'),r.stdout+r.stderr);
 const rec={config:unit+'/tsconfig.json',status:r.status,output:r.stdout+r.stderr};results.push(rec);console.log(JSON.stringify(rec));
}
writeFileSync('qa/evidence/t045-independent-checker/defaults-types.json',JSON.stringify(results,null,2));
process.exitCode=results.some(r=>r.status!==0)?1:0;
