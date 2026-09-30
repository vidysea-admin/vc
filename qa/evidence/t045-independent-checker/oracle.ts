import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { makeHarness, SKILLS_DIR, baseInput, STUDENT_ID } from '../../../packages/engine/tests/scribe-fixtures.ts';
import { MockProvider } from '../../../packages/providers/src/index.ts';
const target=process.env.T045_MUTANT_ROOT || resolve('packages/engine/src');
const api=await import(pathToFileURL(resolve(target,'scribe/index.ts')).href);
const tracing={enabled:false};
const reports=[];
const candidate=(value)=>({key:'ielts_overall',value,source:{type:'transcript',quote:'My IELTS score is '+value,turnId:'score'},confidence:1,purposeTags:['profile_synthesis'],sensitivity:'low'});
const input=(session,value)=>baseInput({sessionId:session,turns:[{turnId:'score',speaker:'student',lang:'en',text:'My IELTS score is '+value,translatedText:'My IELTS score is '+value,ts:1}]});
for(const mode of ['clear','uncertain','duplicate-id','gap','foreign-id','low','conflicting','changed','snapshot','revoked','excluded']){
 let generation='Earlier IELTS results were discussed.';let verify=0;let context;
 if(process.env.T045_ONLY && mode!==process.env.T045_ONLY)continue;
 const p=new MockProvider({responses:{'fact-extraction':{facts:[candidate(6)]},'session-summary':(i)=>{
  if(i.task!=='verify-approved-history') return {summary:generation};
  verify++;context=i.approvedContext;
  const v={verdict:'clear',confidence:1,reviewedFactIds:i.approvedContext.map(f=>f.factId),reviewedRanges:[{start:0,end:i.candidate.length}],offendingSpans:[]};
  if(mode==='uncertain')v.verdict='uncertain';if(mode==='duplicate-id')v.reviewedFactIds.push(v.reviewedFactIds[0]);if(mode==='gap')v.reviewedRanges[0].start=1;if(mode==='foreign-id')v.reviewedFactIds=['foreign'];if(mode==='low')v.confidence=.94;if(mode==='conflicting')v.offendingSpans=[{factId:v.reviewedFactIds[0],start:0,end:1,text:i.candidate.slice(0,1)}];return v;
 }}});
 const h=makeHarness({tenantId:'independent-A',provider:p,saver:'mongo'});
 h.graph=api.compileScribeGraph({db:h.db,provider:p,skillsDir:SKILLS_DIR},{checkpointer:h.checkpointer});
 const opts=(threadId)=>({threadId,tracing});
 const initial=await api.startScribe(h.graph,input('first-'+mode,6),opts('first-'+mode));assert.equal(initial.kind,'awaiting_approval');assert.equal(h.facts.size(),0);
 await api.resumeScribe(h.graph,{action:'approve'},opts('first-'+mode));
 const raw=structuredClone(h.facts.all());assert.equal(raw.length,1);assert.equal(raw[0].value,6);assert.equal(raw[0].tenantId,'independent-A');
 p.setResponse('fact-extraction',{facts:mode==='changed'?[candidate(8)]:[]});verify=0;
 if(mode==='excluded')h.facts.seed({...raw[0],purposeTags:['application_draft']});
 if(mode==='snapshot')p.setResponse('session-summary',(i)=>{if(i.task==='verify-approved-history')throw new Error('Verifier executed after changed authority');h.facts.seed({...raw[0],value:9});return {summary:generation};});
 const out=await api.startScribe(h.graph,input('second-'+mode,8),opts('second-'+mode)).catch(e=>e);
 if(mode==='snapshot'){assert.equal(out.name,'ProviderAuthorizationRefusedError');reports.push({mode,reached:true});continue;}
 assert.equal(out.kind,'awaiting_approval');
 if(mode==='excluded'){assert.equal(verify,0);assert.equal(out.request.summary,generation);reports.push({mode,reached:true});continue;}
 assert.equal(verify,1,'exact independent verifier invocation');assert.equal(context[0].value,6);assert.deepEqual(context[0].source,raw[0].source);assert.equal(context[0].studentId,STUDENT_ID);
 if(['uncertain','duplicate-id','gap','foreign-id','low','conflicting'].includes(mode))assert.equal(out.request.summary,'','invalid independent envelope must withhold');else assert.equal(out.request.summary,generation);
 if(mode==='changed'){assert.equal(out.request.facts.length,1);assert.equal(out.request.facts[0].value,8);assert.deepEqual(h.facts.all(),raw);await api.resumeScribe(h.graph,{action:'approve'},opts('second-'+mode));assert.equal(h.facts.all().length,2);assert.equal(h.openFacts()[0].value,8);const before=JSON.stringify(h.facts.all());await api.resumeScribe(h.graph,null,opts('second-'+mode));assert.equal(JSON.stringify(h.facts.all()),before);}
 if(mode==='revoked'){h.consents.seed({...h.consents.all()[0],purposes:[]});await assert.rejects(api.inspectScribe(h.graph,'second-'+mode),e=>e.name==='ProviderAuthorizationRefusedError');await assert.rejects(api.resumeScribe(h.graph,{action:'approve'},opts('second-'+mode)),e=>e.name==='ProviderAuthorizationRefusedError');assert.deepEqual(h.facts.all(),raw);}
 reports.push({mode,reached:true,verify});
}
console.log(JSON.stringify({independentOracle:reports,source:target}));

