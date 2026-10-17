import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
const out='D:/vc/qa/evidence/t038-cycle1-a',root='C:/Users/Lenovo/.codex/worktrees/application-draft-core/vc';
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').toUpperCase();
const r=JSON.parse(fs.readFileSync(out+'/runtime-results.json')),c=JSON.parse(fs.readFileSync(out+'/citation-exact-results.json'));
const configBefore=JSON.parse(fs.readFileSync(out+'/runtime-config-pins.json'));
const configAfter=configBefore.map(x=>({...x,finalHash:hash(root+'/'+x.path),same:x.hash===hash(root+'/'+x.path)}));
const events=[...r.floors,...c.floors],paths=Object.keys(r.pins),copies=[];
for(const e of events){
 const restored=Object.fromEntries(paths.map(p=>[p,hash(e.copy+'/'+p)]));
 const links=[];
 for(const top of ['packages','apps','mcp']){
  if(!fs.existsSync(e.copy+'/'+top))continue;
  for(const n of fs.readdirSync(e.copy+'/'+top)){
   const dir=e.copy+'/'+top+'/'+n+'/node_modules/@vc';if(!fs.existsSync(dir))continue;
   for(const name of fs.readdirSync(dir)){const target=fs.realpathSync(dir+'/'+name);links.push({name,from:dir,target,insideCopy:target.toLowerCase().startsWith(e.copy.toLowerCase().replaceAll('/','\\'))});}
  }
 }
 copies.push({id:e.id,restored,allFourMatch:paths.every(p=>restored[p]===r.pins[p]),workspaceLinks:links,allWorkspaceLinksIsolated:links.every(x=>x.insideCopy)});
}
const summary={attribution:'/root/t038_cycle1_blind_a/runtime_floor',firstObservedClock:'2026-10-14T10:21:35.7141031Z',end:new Date().toISOString(),baseline:{schemasTypes:r.commands[0].status,apiTypes:r.commands[1].status,API40:r.commands[2].status,schemas63:r.commands[3].status},sourceUnchanged:r.sourceUnchanged&&c.sourceUnchanged,mandatoryEvents:events.filter(e=>e.id!=='F-report-citation'),ordinaryExtras:events.filter(e=>e.id==='F-report-citation'),configAfter,copies,commandCount:r.commands.length+c.commands.length,limitations:['First own config hash capture after baseline runtime; coordinator start state can supply earlier identity.','Workspace dependency link realpaths sealed; not an instrumented module-load trace.','Queued citation lock wait overlaps original owned runtime and is not subtracted twice.','Initial sandbox Git Bash DLL initialization failed; identical escalated mutex execution succeeded.'],sourcePins:r.pins};
fs.writeFileSync(out+'/runtime-audit.json',JSON.stringify(summary,null,2));console.log(JSON.stringify({commands:summary.commandCount,mandatory:summary.mandatoryEvents.length,extras:summary.ordinaryExtras.length,sourceUnchanged:summary.sourceUnchanged,configsStable:configAfter.every(x=>x.same),copiesRestored:copies.every(x=>x.allFourMatch),linksIsolated:copies.every(x=>x.allWorkspaceLinksIsolated)}));
