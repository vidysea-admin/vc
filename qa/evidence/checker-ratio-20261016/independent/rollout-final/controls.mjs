import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const vc=process.cwd(),own=path.join(vc,'qa/evidence/checker-ratio-20261016/independent/rollout-final');
const root=path.join(vc,'.worktrees/b1-recovery'),base='qa/evidence/checker-ratio-20261016/rollout-fixture';
const src=path.join(vc,'qa/evidence/checker-ratio-20261016/isolated/tools/tick.mjs'),raw=fs.readFileSync(src,'utf8');
const hash=x=>createHash('sha256').update(x).digest('hex'),sourceHash=hash(fs.readFileSync(src));
const api=await import(pathToFileURL(src)); const cut=Date.parse('2026-10-15T23:00:00Z'); assert(Date.now()<cut);
fs.mkdirSync(path.join(root,base),{recursive:true});const stamp=Date.now(),created=new Set(),clone=structuredClone;
function write(name,x){const rel=base+'/'+name;fs.writeFileSync(path.join(root,rel),typeof x==='string'?x:JSON.stringify(x));return {path:rel,sha256:hash(fs.readFileSync(path.join(root,rel)))};}
const identity=write('own-'+stamp+'-identity.txt','synthetic independent identity'),input=write('own-'+stamp+'-input.txt','synthetic input');
const store=path.join(root,'qa/.delivery');const preexisting=new Map(fs.readdirSync(store).filter(x=>fs.statSync(path.join(store,x)).isFile()).map(x=>[x,hash(fs.readFileSync(path.join(store,x)))]));
const collected=JSON.parse(fs.readFileSync(path.join(own,'collector-zero-report.json')));
let serial=0;function packet(label,{prior=0}={}){
 const id='own-rollout-'+stamp+'-'+(++serial)+'-'+label,p=api.deliveryTemplate(root),report=clone(collected);
 report.feature_report.runs[0].run_id='maker-'+id;report.feature_report.runs[0].session_id='session-'+id;
 for(const r of report.feature_report.runs)r.feature_id=id;
 if(prior){const r={...clone(report.feature_report.runs[0]),role:'checker',run_id:'prior-'+id,tokens:prior,active_seconds:1,wait_seconds:0,usage:{input:prior,output:0,cache_read:0,cache_write:0}};report.feature_report.runs.push(r);Object.assign(report.feature_report.roles.checker,{tokens:prior,input:prior,output:0,cache_read:0,cache_write:0,active_seconds:1,wait_seconds:0,runs:1});Object.assign(report.efficiency,{checker_tokens:prior,checker_minutes:1/60,token_ratio:prior/report.efficiency.maker_tokens,time_ratio:1/100});report.opening.prior_checking_run_ids=[r.run_id];}
 Object.assign(p,{workflow_id:id,root_run_id:id,feature:id,cycle:1,run_id:id,session:'synthetic',policy_id:identity.sha256,protocol_id:identity.sha256,config_id:identity.sha256,dependency_id:identity.sha256,identity_files:Object.fromEntries(['policy_id','protocol_id','config_id','dependency_id'].map(k=>[k,identity])),candidate:{head:p.candidate.head,files:[input],dirty_inputs:[input.path]},resource_caps:{agent:3},closeout_resources:{agent:1},criteria:[{id:'C1',description:'Independent synthetic control',check_task_id:'check'}],tasks:[{id:'check',owner:'own-rollout-checker',kind:'check',depends_on:[],owns:[base+'/'+id],resources:{agent:1},timeout_ms:5000,max_output_bytes:4096,checker_tokens:5000,command:[process.execPath,'-e','process.exit(7)']}],dispatch:{task_id:'check',attempt_id:'a1'},budget:{deadline:new Date(cut+600000).toISOString(),closeout_ms:1000,no_progress_ms:3600000,estimate_ms:3600000,estimate_tokens:null,token_cap:null,estimate_provenance:'synthetic accounting mechanics only',checker_budget:{schema_version:'checker-budget/1',report:write(id+'-report.json',report)}}});
 created.add(id);return p;
}
function state(p){return JSON.parse(fs.readFileSync(path.join(store,p.workflow_id+'.json')));}
function save(p,s){assert(created.has(p.workflow_id));fs.writeFileSync(path.join(store,p.workflow_id+'.json'),JSON.stringify(s));}
function close(p){if(fs.existsSync(path.join(store,p.workflow_id+'.json'))){const s=state(p);for(const a of s.attempts)if(['claimed','running'].includes(a.status))a.status='incomplete';save(p,s);}}
function deny(fn,re){assert.throws(fn,re);}
function reportSet(p,fn){const f=path.join(root,p.budget.checker_budget.report.path),r=JSON.parse(fs.readFileSync(f));fn(r);fs.writeFileSync(f,JSON.stringify(r));p.budget.checker_budget.report.sha256=hash(fs.readFileSync(f));}
try{
 const hint=api.deliveryTemplate(root);assert.equal(hint.budget.checker_budget,null);assert.equal(hint.tasks.find(t=>t.kind==='check').checker_tokens,null);console.log('PASS null template hints');
 const zero=packet('zero');assert.equal(api.deliveryClaim(root,zero).status,'claimed');close(zero);console.log('PASS collector-produced zero opening admission');
 for(const kind of ['hash','incomplete','scope']){const p=packet(kind);if(kind==='hash')p.budget.checker_budget.report.sha256='0'.repeat(64);else reportSet(p,r=>{if(kind==='incomplete')r.efficiency.complete=false;else r.feature_report.runs[0].feature_id='wrong';});deny(()=>api.deliveryClaim(root,p),kind==='hash'?/report hash/:kind==='incomplete'?/complete measured/:/scope mismatch/);assert(!fs.existsSync(path.join(store,p.workflow_id+'.json')));}
 console.log('PASS hash/coverage/scope refuse before workflow write');
 function fresh(m){const p=packet('fresh');delete p.budget.checker_budget;try{deny(()=>m.deliveryClaim(root,p,{now:cut+1}),/checker budget required/);}finally{close(p);}}
 function boundary(m){for(const offset of [-1,0]){const p=packet('boundary');m.deliveryClaim(root,p,{now:cut-1000});const s=state(p);delete s.budget.checker_budget;s.started_at=cut+offset;s.attempts=[];save(p,s);delete p.budget.checker_budget;p.dispatch.attempt_id='boundary';try{if(offset<0)assert.equal(m.deliveryClaim(root,p,{now:cut+1}).status,'claimed');else deny(()=>m.deliveryClaim(root,p,{now:cut+1}),/checker budget required/);}finally{close(p);}}}
 fresh(api);boundary(api);console.log('GREEN C2 fresh denied; persisted cutoff-1 accepted, exact cutoff denied');
 function incomplete(m){for(const mode of ['missing','incomplete','acceptance']){const p=packet('metadata');reportSet(p,r=>{if(mode==='missing')delete r.opening;else if(mode==='incomplete')r.opening.complete=false;else r.opening.acceptance_ready=true;});deny(()=>m.deliveryValidate(root,p),/incomplete opening readiness/);}}
 incomplete(api);console.log('GREEN C3 missing/incomplete/acceptance opening metadata rejected');
 // Mutation changes are confined to independent source copies. Every rejection is an assertion failure, never setup.
 for(const [name,from,to,test] of [
  ['C2','state.started_at < Date.parse("2026-10-15T23:00:00Z")','state.started_at <= Date.parse("2026-10-15T23:00:00Z")',boundary],
  ['C3','if (report.phase === "maker-ready-opening") deliveryNeed(report.opening?.schema_version === "opening-readiness/1" && report.opening.complete === true && report.opening.acceptance_ready === false, "incomplete opening readiness report");','/* independent mutant: opening metadata gate disabled */',incomplete]
 ]){assert.equal(raw.split(from).length,2);const f=path.join(own,name+'-mutant.mjs');fs.writeFileSync(f,raw.replace(from,to));const m=await import(pathToFileURL(f)+'?mutant');assert.throws(()=>test(m),assert.AssertionError);console.log('RED '+name+' intended assertion');fs.writeFileSync(f,fs.readFileSync(src));assert.equal(hash(fs.readFileSync(f)),sourceHash);const restored=await import(pathToFileURL(f)+'?restored');test(restored);console.log('GREEN '+name+' restored source copy');}
 const agg=packet('aggregate',{prior:100});agg.tasks[0].checker_tokens=5000;agg.tasks[0].timeout_ms=4500;assert.equal(api.deliveryClaim(root,agg).status,'claimed');close(agg);agg.dispatch.attempt_id='retry';assert.equal(api.deliveryClaim(root,agg).status,'claimed');close(agg);agg.dispatch.attempt_id='third';deny(()=>api.deliveryClaim(root,agg),/aggregate 10%/);
 const s=state(agg),accounting=JSON.parse(fs.readFileSync(path.join(root,s.attempts[0].checker_reservation.path)));assert.equal(accounting.opening_tokens,100);assert.equal(accounting.opening_ms,1000);assert.equal(accounting.reservations.length,2);assert(accounting.reservations.every(r=>r.actual_tokens===null));
 const reset=clone(agg);delete reset.budget.checker_budget;deny(()=>api.deliveryClaim(root,reset),/lineage cannot reset/);
 const renamed=clone(agg);renamed.feature+='rename';renamed.workflow_id=renamed.root_run_id=renamed.feature;created.add(renamed.workflow_id);reportSet(renamed,r=>r.feature_report.runs.forEach(x=>x.feature_id=renamed.feature));deny(()=>api.deliveryClaim(root,renamed),/baseline cannot be reissued or relabeled/);console.log('PASS aggregate prior costs, retry exhaustion, envelope reset and maker-ID relabel guards');
 // Exercise recovery consumer before any state writes using own exhausted ledger only.
 const previous=clone(agg);const next=clone(agg);next.budget.deadline=new Date(cut+700000).toISOString();next.budget.checker_budget.report.sha256='0'.repeat(64);
 // The explicit recovery guard is independently inspected; unknown report is refused earlier by validation.
 deny(()=>api.deliveryResume(root,{packet:next,previous_packet:previous,recovery:{id:'own-recovery',authorized_by:'synthetic',authorization_ref:'synthetic',reason:'refusal only',expected_state_sha256:hash(fs.readFileSync(path.join(store,agg.workflow_id+'.json'))),max_elapsed_ms:10000}}),/report hash/);
 fs.writeFileSync(path.join(own,'js-results.json'),JSON.stringify({source_sha256:sourceHash,cutover:new Date(cut).toISOString(),C2:'GREEN/RED/restoredGREEN',C3:'GREEN/RED/restoredGREEN',actual_token_control:'UNKNOWN',original_costs_retained:true,synthetic_workflows:[...created]},null,2));
}finally{for(const id of created)close({workflow_id:id});for(const [name,h] of preexisting)assert.equal(hash(fs.readFileSync(path.join(store,name))),h,'peer bytes '+name);assert.equal(hash(fs.readFileSync(src)),sourceHash);console.log('PASS only own claims closed; preexisting B1 ledgers/receipts unchanged; source unchanged');}
