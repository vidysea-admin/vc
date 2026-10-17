import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
const root='C:/Users/Lenovo/.codex/worktrees/application-draft-core/vc', out='D:/vc/qa/evidence/t038-cycle1-a';
const node='C:/Program Files/nodejs/node.exe', tsx=root+'/node_modules/tsx/dist/cli.mjs';
const paths=['packages/schemas/src/schemas.ts','apps/api/src/server.ts','apps/api/src/openapi.ts','apps/api/tests/server.test.ts'];
const hash=b=>crypto.createHash('sha256').update(b).digest('hex').toUpperCase();
const pins=Object.fromEntries(paths.map(p=>[p,hash(fs.readFileSync(root+'/'+p))]));
const result={agent:'/root/t038_cycle1_blind_a/runtime_floor',start:new Date().toISOString(),pid:process.pid,root,pins,commands:[],floors:[],environment:{node:process.version,platform:process.platform,arch:process.arch,nodeHash:hash(fs.readFileSync(node)),lockHash:hash(fs.readFileSync('D:/vc/scripts/vc-testlock.sh'))}};
const save=()=>fs.writeFileSync(out+'/citation-exact-results.json',JSON.stringify(result,null,2));
function run(name,args,cwd=root){
 const start=new Date().toISOString(); console.log('RUN',name,start);
 const r=spawnSync(node,args,{cwd,encoding:'utf8',timeout:150000,windowsHide:true,maxBuffer:10*1024*1024});
 const log=(r.stdout||'')+(r.stderr||''); fs.writeFileSync(out+'/'+name+'.log',log);
 result.commands.push({name,args,cwd,start,end:new Date().toISOString(),status:r.status,signal:r.signal,error:r.error?.message,logHash:hash(Buffer.from(log))});save();console.log('RESULT',name,r.status);
 return {status:r.status,log};
}
function tests(name,cwd,pattern){return run(name,[tsx,'--test','--test-concurrency=1','--test-timeout=120000',...(pattern?['--test-name-pattern',pattern]:[]),'apps/api/tests/server.test.ts'],cwd);}
function copyTree(src,dst){
 fs.mkdirSync(dst,{recursive:true});
 for(const e of fs.readdirSync(src,{withFileTypes:true})){
  if(['node_modules','.git','qa','.codex','.agents','.aws'].includes(e.name))continue;
  const s=path.join(src,e.name),d=path.join(dst,e.name);
  if(e.isDirectory())copyTree(s,d);else if(e.isFile())fs.copyFileSync(s,d);
 }
}
function depLinks(src,dst,copy){
 if(!fs.existsSync(src))return;fs.mkdirSync(dst,{recursive:true});
 for(const e of fs.readdirSync(src,{withFileTypes:true})){
  if(e.name==='.pnpm'){fs.symlinkSync(fs.realpathSync(path.join(src,e.name)),path.join(dst,e.name),'junction');continue;}
  if(e.name.startsWith('@')){
   fs.mkdirSync(path.join(dst,e.name),{recursive:true});
   for(const child of fs.readdirSync(path.join(src,e.name))){
    const target=fs.realpathSync(path.join(src,e.name,child));
    const mapped=path.join(copy,path.relative(root,target));
    fs.symlinkSync(e.name==='@vc'?mapped:target,path.join(dst,e.name,child),'junction');
   }
  }else if(e.name!=='.bin'&&fs.statSync(path.join(src,e.name)).isDirectory())fs.symlinkSync(fs.realpathSync(path.join(src,e.name)),path.join(dst,e.name),'junction');
 }
}
function makeCopy(id){
 const c=out+'/copies/'+id;copyTree(root,c);depLinks(root+'/node_modules',c+'/node_modules',c);
 for(const top of ['packages','apps','mcp']){
  if(!fs.existsSync(root+'/'+top))continue;
  for(const name of fs.readdirSync(root+'/'+top)){const s=root+'/'+top+'/'+name;if(fs.existsSync(s+'/package.json'))depLinks(s+'/node_modules',c+'/'+top+'/'+name+'/node_modules',c);}
 }
 const req=createRequire(c+'/apps/api/package.json'),seal={};
 for(const p of ['@vc/schemas','@vc/db','@vc/engine','@vc/providers']){
  const resolved=fs.realpathSync(req.resolve(p));if(!resolved.toLowerCase().startsWith(c.toLowerCase().replaceAll('/','\\')))throw Error('copy import escaped '+p+': '+resolved);seal[p]=resolved;
 }
 fs.writeFileSync(out+'/'+id+'-resolution.json',JSON.stringify(seal,null,2));return c;
}
function replace(c,p,a,b){const f=c+'/'+p,s=fs.readFileSync(f,'utf8');if(s.split(a).length!==2)throw Error('nonunique edit '+p+' '+a);fs.writeFileSync(f,s.replace(a,b));}
try{
 const S='packages/schemas/src/schemas.ts',A='apps/api/src/server.ts';
 const definitions=[
 ['F-report-citation-exact','T038 synthetic oracle 1:',c=>replace(c,A,'if (entry.reasons.length) { entry.status = "invalid"; gaps.invalidFields.push(field.name); }','if (entry.reasons.length) { if (field.name === "zeroField") entry.provenance[0].factId = "mutant-valid-citation"; entry.status = "invalid"; gaps.invalidFields.push(field.name); }'),'mutant-valid-citation']
 ];
 for(const [id,pattern,mutate,intended] of definitions){
  const c=makeCopy(id),before=Object.fromEntries(paths.map(p=>[p,fs.readFileSync(c+'/'+p)]));
  const f={id,copy:c,pattern,start:new Date().toISOString(),originalHashes:Object.fromEntries(paths.map(p=>[p,hash(before[p])]))};result.floors.push(f);save();
  const green=tests(id+'-green',c,pattern);f.green=green.status;if(green.status!==0)throw Error('COPY BASELINE FAIL '+id);
  try{
   mutate(c);f.mutatedHashes=Object.fromEntries(paths.map(p=>[p,hash(fs.readFileSync(c+'/'+p))]));
   const red=tests(id+'-red',c,pattern);f.red=red.status;f.intendedText=intended;f.intendedObserved=red.log.includes(intended);f.assertionFailure=red.log.includes('ERR_ASSERTION');f.noSetupFailure=!/ERR_MODULE_NOT_FOUND|TransformError|SyntaxError/.test(red.log);
  }finally{for(const p of paths)fs.writeFileSync(c+'/'+p,before[p]);f.restoredBytes=paths.every(p=>fs.readFileSync(c+'/'+p).equals(before[p]));save();}
  f.restored=tests(id+'-restored',c,pattern).status;f.end=new Date().toISOString();save();
  if(f.red===0||!f.intendedObserved||!f.assertionFailure||!f.noSetupFailure||!f.restoredBytes||f.restored!==0)throw Error('FLOOR INCOMPLETE '+id);
 }
}catch(e){result.failure=e.stack;console.error(e.stack);process.exitCode=1;}
finally{result.end=new Date().toISOString();result.finalPins=Object.fromEntries(paths.map(p=>[p,hash(fs.readFileSync(root+'/'+p))]));result.sourceUnchanged=JSON.stringify(pins)===JSON.stringify(result.finalPins);save();}

