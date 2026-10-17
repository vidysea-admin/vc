import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
const source='C:/Users/Lenovo/.codex/worktrees/application-draft-core/vc';
const evidence='D:/vc/qa/evidence/t038-cycle1-b-runtime';
const root=evidence+'/copy';
const start=new Date().toISOString();
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const runnerIdentity={hash:hash(fs.readFileSync(new URL(import.meta.url))),nodeVersion:process.version,platform:process.platform,arch:process.arch,execArgv:process.execArgv};
// D-077: these values must come from the existing B coordinator allocation, never a new budget.
const deadline=Date.parse(process.env.T038_B_DEADLINE_UTC??'');
const closeReserveMs=Number(process.env.T038_B_CLOSE_RESERVE_MS);
const commandBoundMs=180000;
const prefix=process.env.T038_B_EVIDENCE_PREFIX??'';
if(!Number.isFinite(deadline)||!Number.isSafeInteger(closeReserveMs)||closeReserveMs<323000)throw Error('explicit B deadline and >=323000ms full-closure/cleanup/persistence reserve required');
if(!/^b-[a-z0-9-]+$/.test(prefix)||fs.readdirSync(evidence).some(f=>f.startsWith(prefix+'-')))throw Error('fresh B evidence prefix required; historical artifacts are immutable');
if(Date.now()+commandBoundMs+closeReserveMs>=deadline)throw Error('B allocation cannot cover one bounded command and full closure reserve');
const files=['packages/schemas/src/schemas.ts','apps/api/src/server.ts','apps/api/src/openapi.ts','apps/api/tests/server.test.ts'];
const pins=Object.fromEntries(files.map(f=>[f,hash(fs.readFileSync(source+'/'+f))]));
const expected=JSON.parse(fs.readFileSync(evidence+'/source-pins-waiting.json','utf8').replace(/^\uFEFF/,''));
for(const pin of expected){const f=pin.Path.replaceAll('\\','/').slice(source.length+1);if(pins[f]!==pin.Hash.toLowerCase())throw Error('bound source drift '+f);}
function copyTree(src,dst){
 const stat=fs.lstatSync(src);
 if(stat.isSymbolicLink()){
  let target=fs.realpathSync(src); const relative=path.relative(source,target);
  if(relative.startsWith('..')) throw Error('outside source link '+src+' '+target);
  fs.mkdirSync(path.dirname(dst),{recursive:true}); fs.symlinkSync(path.join(root,relative),dst,'junction'); return;
 }
 if(stat.isDirectory()){fs.mkdirSync(dst,{recursive:true});for(const item of fs.readdirSync(src)){if(src===source&&!['apps','packages','skills','node_modules','package.json','pnpm-lock.yaml','pnpm-workspace.yaml','tsconfig.base.json'].includes(item))continue;if(['.git','qa','.next','.agents','.codex','.claude','.aws'].includes(item)||item.startsWith('.env'))continue;copyTree(path.join(src,item),path.join(dst,item));}}
 else fs.copyFileSync(src,dst);
}
if(!fs.existsSync(root))copyTree(source,root);
const exclusions=new Set(['.git','qa','.next','.agents','.codex','.claude','.aws']);
const resolveCache=new Map();
function canonicalLink(f){const raw=fs.readlinkSync(f);const absolute=path.resolve(path.dirname(f),raw);if(!resolveCache.has(absolute))resolveCache.set(absolute,fs.realpathSync(absolute));return {raw,target:resolveCache.get(absolute)};}
function inventory(base){const layout=[],physical=[];function walk(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){if(exclusions.has(item.name)||item.name.startsWith('.env'))continue;const f=path.join(dir,item.name),relative=path.relative(base,f);if(item.isSymbolicLink()){const link=canonicalLink(f);if(!link.target.startsWith(path.resolve(base)+path.sep))throw Error('outside retained alias '+f);layout.push([relative,'link',path.relative(base,link.target)]);}else if(item.isDirectory()){layout.push([relative,'directory']);walk(f);}else{layout.push([relative,'file']);physical.push(f);}}}
 for(const top of ['apps','packages','mcp','skills','node_modules'])if(fs.existsSync(base+'/'+top))walk(base+'/'+top);
 for(const top of ['package.json','pnpm-lock.yaml','pnpm-workspace.yaml','tsconfig.base.json']){layout.push([top,'file']);physical.push(base+'/'+top);}
 return {layout:layout.sort((a,b)=>a[0].localeCompare(b[0])),physical};}
const workspacePatterns=[...fs.readFileSync(source+'/pnpm-workspace.yaml','utf8').matchAll(/-\s*"([^"]+)"/g)].map(m=>m[1]);
for(const pattern of workspacePatterns){if(!pattern.endsWith('/*'))throw Error('unsupported workspace glob '+pattern);const group=pattern.slice(0,-2);for(const item of fs.readdirSync(source+'/'+group,{withFileTypes:true})){if(!item.isDirectory())continue;const relative=group+'/'+item.name;if(!fs.existsSync(root+'/'+relative))copyTree(source+'/'+relative,root+'/'+relative);}}
const sourceInventory=inventory(source);
for(const row of sourceInventory.layout.filter(row=>row[1]==='link')){if(!fs.existsSync(root+'/'+row[2]))copyTree(source+'/'+row[2],root+'/'+row[2]);}
resolveCache.clear();
const copyInventory=inventory(root);
if(JSON.stringify(sourceInventory.layout)!==JSON.stringify(copyInventory.layout))throw Error('source/copy complete alias-layout mismatch');
async function fullSeal(inv,base){const output=new Array(inv.physical.length);let next=0;async function worker(){while(next<inv.physical.length){const i=next++,f=inv.physical[i];const h=crypto.createHash('sha256');let bytes=0;for await(const chunk of fs.createReadStream(f)){h.update(chunk);bytes+=chunk.length;}output[i]=[path.relative(base,f),h.digest('hex'),bytes];}}await Promise.all(Array.from({length:8},worker));return output.sort((a,b)=>a[0].localeCompare(b[0]));}
const [seal,sourceSeal]=await Promise.all([fullSeal(copyInventory,root),fullSeal(sourceInventory,source)]);
if(JSON.stringify(seal)!==JSON.stringify(sourceSeal))throw Error('source/copy full canonical bytes mismatch');
const nativePaths=[process.execPath,'C:/Program Files/Git/bin/bash.exe','D:/vc/scripts/vc-testlock.sh'];
const nativeSeal=nativePaths.map(f=>[f,hash(fs.readFileSync(f)),fs.statSync(f).size]);
const preservedIdentities={
 'resume2-copy-seal.json':'30e4aada4df3514387ee5cea4745db551bbf15616494570d41b396c6f99d8f35',
 'resume2-api40.log':'a7584fd34c7cec11347a91defc9049f840c3746c5b7029889a675ddcab8cad50',
 'resume2-progress.json':'bed1302a5a6885306eac1bb8c47902948165474a0b966014abcc30be8ead6bab',
};
const preservedBytes=Object.fromEntries(Object.entries(preservedIdentities).map(([f,h])=>{const b=fs.readFileSync(evidence+'/'+f);if(hash(b)!==h)throw Error('preserved B evidence identity mismatch '+f);return [f,b];}));
const preservedSeal=JSON.parse(preservedBytes['resume2-copy-seal.json']);
for(const [key,current]of Object.entries({pins,root,workspacePatterns,layout:copyInventory.layout,sourceLayout:sourceInventory.layout,files:seal,sourceFiles:sourceSeal,nativeSeal}))if(JSON.stringify(current)!==JSON.stringify(preservedSeal[key]))throw Error('preserved B complete identity mismatch '+key);
const preservedProgress=JSON.parse(preservedBytes['resume2-progress.json']);
const apiBaseline=preservedProgress.results.filter(r=>r.name==='api40');
if(apiBaseline.length!==1||apiBaseline[0].status!==0||apiBaseline[0].signal!==null||apiBaseline[0].error||JSON.stringify(apiBaseline[0].args)!==JSON.stringify([root+'/node_modules/tsx/dist/cli.mjs','--test','--test-concurrency=1','--test-timeout=120000','apps/api/tests/server.test.ts']))throw Error('preserved B API40 command/status mismatch');
const baselineLog=preservedBytes['resume2-api40.log'].toString('utf8');
for(const [key,count]of Object.entries({tests:40,pass:40,fail:0,cancelled:0,skipped:0,todo:0})){const rows=baselineLog.split(/\r?\n/).filter(line=>line.startsWith('ℹ '+key+' '));if(rows.length!==1||rows[0]!=='ℹ '+key+' '+count)throw Error('preserved B API40 count mismatch '+key);}
fs.writeFileSync(evidence+'/'+prefix+'-copy-seal.json',JSON.stringify({start,pins,root,workspacePatterns,layout:copyInventory.layout,sourceLayout:sourceInventory.layout,files:seal,sourceFiles:sourceSeal,nativeSeal,canonicalFiles:seal.length,bytes:seal.reduce((n,row)=>n+row[2],0),preservedIdentities,runnerIdentity,deadline,closeReserveMs}),{flag:'wx'});
const node='C:/Program Files/nodejs/node.exe';
const results=[];
let activeChild,activeStartTicks,interrupted=false;
function cleanupOwnedChild(){if(activeChild&&activeChild.exitCode===null&&activeChild.signalCode===null){
 if(!/^\d+$/.test(activeStartTicks??''))throw Error('owned child start identity unavailable; refusing PID-only cleanup');
 const stopped=spawnSync('powershell',['-NoProfile','-NonInteractive','-Command',`$p=Get-Process -Id ${activeChild.pid} -ErrorAction SilentlyContinue; if($null -eq $p){exit 0}; try{$null=$p.Handle; if($p.StartTime.ToUniversalTime().Ticks -ne ${activeStartTicks}){exit 76}; & taskkill /PID ${activeChild.pid} /T /F; exit $LASTEXITCODE} finally{$p.Dispose()}`],{windowsHide:true,encoding:'utf8',timeout:30000});
 if(stopped.error||stopped.status!==0)throw Error('identity-bound owned child cleanup failed '+(stopped.error?.message??stopped.status));
}}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{interrupted=true;cleanupOwnedChild();});
async function run(name,args,expectation){
 if(interrupted)throw Error('owned run interrupted');
 const t=Date.now(),available=deadline-t-closeReserveMs;
 if(available<commandBoundMs)throw Error('B deadline reserve forbids next command '+name);
 const logfile=fs.createWriteStream(evidence+'/'+prefix+'-'+name+'.log',{flags:'wx'});
 const child=spawn(node,args,{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});activeChild=child;
 let error,cleanupError,output='';
 child.on('error',e=>{error=e.message;});
 const closed=new Promise(resolve=>child.on('close',(status,signal)=>resolve({status,signal})));
 for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{output+=chunk.toString();});
 child.stdout.pipe(logfile,{end:false});child.stderr.pipe(logfile,{end:false});
 const identity=spawnSync('powershell',['-NoProfile','-NonInteractive','-Command',`$p=Get-Process -Id ${child.pid} -ErrorAction Stop; $p.StartTime.ToUniversalTime().Ticks`],{windowsHide:true,encoding:'utf8',timeout:10000});
 activeStartTicks=identity.status===0?identity.stdout.trim():undefined;
 fs.writeFileSync(evidence+'/'+prefix+'-owned-child.json',JSON.stringify({name,pid:child.pid,startTicks:activeStartTicks,start:new Date(t).toISOString(),args}));
 const timer=setTimeout(()=>{interrupted=true;try{cleanupOwnedChild();}catch(e){cleanupError=e.message;}},Math.max(1,Math.min(commandBoundMs,available)-(Date.now()-t)));
 const r=await closed;clearTimeout(timer);activeChild=undefined;activeStartTicks=undefined;
 await new Promise((resolve,reject)=>{logfile.once('error',reject);logfile.end(resolve);});
 const out={name,args,pid:child.pid,...r,error,cleanupError,ms:Date.now()-t,expectation};results.push(out);
 fs.writeFileSync(evidence+'/'+prefix+'-progress.json',JSON.stringify({start,pid:process.pid,deadline,closeReserveMs,results}));
 if(interrupted||error||cleanupError||r.signal!==null)throw Error('incomplete owned command '+name);
 if(expectation){
  for(const [key,count]of Object.entries({tests:1,pass:expectation.red?0:1,fail:expectation.red?1:0,cancelled:0,skipped:0,todo:0})){const rows=output.split(/\r?\n/).filter(line=>line.startsWith('# '+key+' '));if(rows.length!==1||rows[0]!=='# '+key+' '+count)throw Error('targeted test count mismatch '+name+' '+key);}
  const escaped=expectation.title.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  if(!new RegExp('^'+(expectation.red?'not ok':'ok')+' \\d+ - '+escaped+'$', 'm').test(output))throw Error('targeted test name mismatch '+name);
  if(expectation.red){if(r.status===0||r.status===null||!output.includes("code: 'ERR_ASSERTION'")||!new RegExp('server\\.test\\.ts:'+expectation.assertionLine+':\\d+').test(output))throw Error('missing intended semantic RED '+name);}
  else if(r.status!==0)throw Error('restored GREEN failed '+name);
 }else if(r.status!==0)throw Error('command failed '+name);
 return out;
}
const tsx=root+'/node_modules/tsx/dist/cli.mjs';
const testArgs=pattern=>[tsx,'--test','--test-reporter=tap','--test-concurrency=1','--test-timeout=120000',...(pattern?['--test-name-pattern','^'+pattern.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$']:[]),'apps/api/tests/server.test.ts'];
const originals=Object.fromEntries(files.map(f=>[f,fs.readFileSync(root+'/'+f)]));
for(const f of files)if(hash(originals[f])!==pins[f]||!originals[f].equals(fs.readFileSync(source+'/'+f)))throw Error('source/copy raw mismatch '+f);
function replace(f,a,b){const raw=fs.readFileSync(root+'/'+f,'utf8');if(raw.split(a).length!==2)throw Error('nonunique target '+f+' '+a);fs.writeFileSync(root+'/'+f,raw.replace(a,b));}
const schema=files[0],server=files[1];
const floor=[
 ['options','T038 synthetic oracle 3',()=>replace(schema,'z.array(DraftScalarSchema).max(DRAFT_MAPPING_LIMITS.options).nullable()','z.array(DraftScalarSchema).nullable()')],
 ['originalauthority','T038 synthetic oracle 11',()=>replace(server,'JSON.stringify({ ...grant.data, purposes: [...grant.data.purposes].sort() }) !== grantSnapshot','false')],
 ['falsezero','T038 synthetic oracle 1:',()=>replace(server,'fields[field.name] = entry.expected;','if (entry.expected) fields[field.name] = entry.expected;')],
 ['publicclaim','T038 synthetic oracle 1:',()=>{replace(server,'schemaVersion: 1, status: "draft", requirementsVerified: false,','schemaVersion: 1, status: "draft", requirementsVerified: true,');replace(schema,'status: z.literal("draft"), requirementsVerified: z.literal(false),','status: z.literal("draft"), requirementsVerified: z.literal(true),');}],
 ['capturedAt128','T038 synthetic oracle 3',()=>{replace(schema,'capturedAt: z.string().max(128).refine(value => {','capturedAt: z.string().refine(value => {');replace(schema,'if (value.length > 128) return false;','');}],
 ['unicode','T038 synthetic oracle 7',()=>replace(server,'value.match(/\\P{White_Space}+/gu)','value.match(/\\S+/gu)')],
 ['reportcitation','T038 synthetic oracle 1:',()=>replace(server,'if (entry.reasons.length) { entry.status = "invalid"; gaps.invalidFields.push(field.name); }','if (entry.reasons.length) { entry.status = "invalid"; gaps.invalidFields.push(field.name); if (candidate.fact.value === 0) entry.provenance[0]!.factId = "wrong-valid-id"; }')],
];
// Each baseline name and intended assertion belongs to the authenticated, unchanged B test bytes.
const assertionLines={options:1200,originalauthority:1778,falsezero:1094,publicclaim:1094,capturedAt128:1212,unicode:1493,reportcitation:1120};
const assertionTokens={options:'assert.equal((await call(w, "POST", endpoint, { token: cred, body: options })).status, 400)',originalauthority:'assert.equal(response.status, authorityChange ? 403 : 409',falsezero:'assert.deepEqual(result, { schemaVersion: 1, status: "draft", requirementsVerified: false',publicclaim:'assert.deepEqual(result, { schemaVersion: 1, status: "draft", requirementsVerified: false',capturedAt128:'assert.equal(refusedTimestamp.status, 400)',unicode:'assert.deepEqual(result.packet.fields, item.reason ? {} : { answer: item.value })',reportcitation:'assert.deepEqual(rejectedResult.report[1], { field: "zeroField", expected: 0'};
const testLines=originals[files[3]].toString('utf8').split(/\r?\n/);
const baselineMappings=Object.fromEntries(floor.map(([name,pattern])=>{
 const titles=[...originals[files[3]].toString('utf8').matchAll(/^test\("([^"]+)"/gm)].map(m=>m[1]).filter(title=>title.startsWith(pattern));
 const assertionLine=assertionLines[name];
 if(titles.length!==1||!testLines[assertionLine-1]?.includes(assertionTokens[name]))throw Error('B baseline assertion mapping mismatch '+name);
 const title=titles[0],rows=baselineLog.split(/\r?\n/).filter(line=>line.startsWith('✔ '+title+' ('));
 if(rows.length!==1||!/^.* \([\d.]+ms\)$/.test(rows[0]))throw Error('B baseline named GREEN missing '+name);
 return [name,{title,assertionLine,testHash:pins[files[3]],logHash:preservedIdentities['resume2-api40.log']}];
}));
let failure;
try{
 await run('schemas-types',[root+'/node_modules/typescript/bin/tsc','--noEmit','-p','packages/schemas/tsconfig.json']);
 await run('api-types',[root+'/node_modules/typescript/bin/tsc','--noEmit','-p','apps/api/tsconfig.json']);
 results.push({name:'api40-green-reused',status:0,command:apiBaseline[0],preservedIdentities,baselineMappings,fullCurrentIdentityMatched:true});
 const schemaTests=fs.readdirSync(root+'/packages/schemas/tests').filter(f=>f.endsWith('.test.ts')).map(f=>'packages/schemas/tests/'+f);
 await run('schemas63',[tsx,'--test','--test-reporter=tap','--test-concurrency=1',...schemaTests]);
 const schemaLog=fs.readFileSync(evidence+'/'+prefix+'-schemas63.log','utf8');
 for(const [key,count]of Object.entries({tests:63,pass:63,fail:0,cancelled:0,skipped:0,todo:0})){const rows=schemaLog.split(/\r?\n/).filter(line=>line.startsWith('# '+key+' '));if(rows.length!==1||rows[0]!=='# '+key+' '+count)throw Error('schemas63 count mismatch '+key);}
 for(const [name,pattern,edit]of floor){
  const mapping=baselineMappings[name];
  results.push({name:name+'-green-reused',status:0,...mapping,fullCurrentIdentityMatched:true});
  // Admission precedes the edit; a refused allocation never leaves a mutant on disk.
  if(interrupted||Date.now()+2*commandBoundMs+closeReserveMs>=deadline)throw Error('B deadline reserve forbids RED/restored pair '+name);
  try{edit();await run(name+'-red',testArgs(mapping.title),{...mapping,red:true});}finally{for(const [f,b]of Object.entries(originals))fs.writeFileSync(root+'/'+f,b);}
  const restoration=files.every(f=>fs.readFileSync(root+'/'+f).equals(originals[f]));if(!restoration)throw Error('restoration failed');
  results.push({name:name+'-byte-restoration',restored:restoration,hashes:Object.fromEntries(files.map(f=>[f,hash(fs.readFileSync(root+'/'+f))]))});
  await run(name+'-restored',testArgs(mapping.title),{...mapping,red:false});
  results.push({name:name+'-floor-complete',green:'own authenticated API40',intendedRed:true,exactRestoration:true,restoredGreen:true,...mapping});
 }
}catch(e){failure=e.message;throw e;
}finally{
 let terminalCleanupError;
 try{cleanupOwnedChild();}catch(e){terminalCleanupError=e.message;interrupted=true;}
 for(const [f,b]of Object.entries(originals))fs.writeFileSync(root+'/'+f,b);
 const sourceDrift=files.filter(f=>hash(fs.readFileSync(source+'/'+f))!==pins[f]);
 const copyDrift=files.filter(f=>!fs.readFileSync(root+'/'+f).equals(originals[f]));
 resolveCache.clear();const finalInventory=inventory(root);const finalSourceInventory=inventory(source);const [finalSeal,finalSourceSeal]=await Promise.all([fullSeal(finalInventory,root),fullSeal(finalSourceInventory,source)]);
 const inputDrift=JSON.stringify(seal)===JSON.stringify(finalSeal)?[]:['canonical byte drift'];const sourceInputDrift=JSON.stringify(sourceSeal)===JSON.stringify(finalSourceSeal)?[]:['source canonical byte drift'];const layoutDrift=JSON.stringify(copyInventory.layout)===JSON.stringify(finalInventory.layout)&&JSON.stringify(sourceInventory.layout)===JSON.stringify(finalSourceInventory.layout)?[]:['complete alias-layout drift'];
 const nativeDrift=nativeSeal.filter(([f,h])=>hash(fs.readFileSync(f))!==h);
 if(hash(fs.readFileSync(new URL(import.meta.url)))!==runnerIdentity.hash)nativeDrift.push(['B runner drift']);
 for(const [f,h]of Object.entries(preservedIdentities))if(hash(fs.readFileSync(evidence+'/'+f))!==h)sourceInputDrift.push('preserved B evidence drift '+f);
 fs.writeFileSync(evidence+'/'+prefix+'-post-seal.json',JSON.stringify({files:finalSeal,sourceFiles:finalSourceSeal,layout:finalInventory.layout,sourceLayout:finalSourceInventory.layout,nativeSeal,runnerIdentity}),{flag:'wx'});
 const deadlineExceeded=Date.now()>deadline;
 fs.writeFileSync(evidence+'/'+prefix+'-results.json',JSON.stringify({start,end:new Date().toISOString(),pid:process.pid,node,source,root,pins,sourceDrift,copyDrift,inputDrift,sourceInputDrift,layoutDrift,nativeDrift,results,noFullSuite:true,excludedCredentialPaths:true,interrupted,failure,terminalCleanupError,deadline,closeReserveMs,deadlineExceeded}),{flag:'wx'});
 if(sourceDrift.length||copyDrift.length||inputDrift.length||sourceInputDrift.length||layoutDrift.length||nativeDrift.length||interrupted||deadlineExceeded)throw Error('B full closure/owned completion/deadline guard failed');
}
