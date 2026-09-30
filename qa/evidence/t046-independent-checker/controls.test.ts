import test from 'node:test';
import assert from 'node:assert/strict';
import {makeHarness,baseInput,mockProvider,citedCandidate,SKILLS_DIR} from '../../../packages/engine/tests/scribe-fixtures.js';
import {startScribe,resumeScribe,compileScribeGraph,ApprovalResponseError} from '../../../packages/engine/src/scribe/index.js';
import {decisionFromResponse} from '../../../packages/engine/src/scribe/nodes.js';
import {ApprovalResponseSchema,ExtractionSkillOutputSchema} from '../../../packages/engine/src/scribe/schemas.js';
import {FactSourceSchema} from '../../../packages/schemas/src/schemas.js';
import {buildFactApprovedEvent} from '../../../packages/engine/src/webhooks/schemas.js';
const claim=(h:any)=>h.fakeDb.collection('scribe_resolutions').all()[0];
async function pause(h:any,t:string){const r=await startScribe(h.graph,baseInput(),{threadId:t}); assert.equal(r.kind,'awaiting_approval'); assert.equal(h.facts.size(),0); return r.request.facts;}
test('independent exact actor, value, durable winner and original citation readback',async()=>{
 const h=makeHarness({tenantId:'checker'}),t='checker-exact';const facts=await pause(h,t);const p=facts[0], actor='  exact-actor\t';
 await resumeScribe(h.graph,{action:'edit',facts:[{...p,value:'Germany'}]},{threadId:t,counsellorId:actor});
 const f=h.openFacts()[0],w=claim(h);assert.deepEqual(f.source,{type:'counsellor-edit',counsellorId:actor,editedAt:w.approvalMetadata.editedAt,editedFrom:p.source});assert.equal(f.value,'Germany');assert.equal(f.needsReview,true);assert.equal(Object.hasOwn(f,'citationMatch'),false);
 const snap=JSON.stringify(h.facts.all());await resumeScribe(h.graph,{action:'reject'},{threadId:t,counsellorId:'loser'});assert.equal(JSON.stringify(h.facts.all()),snap);
});
test('independent race metadata follows actual winner',async()=>{
 const h=makeHarness({tenantId:'checker'}),t='checker-race';const [p]=await pause(h,t);
 const out=await Promise.all(['Canada-2','Canada-3','Canada-4'].map((value,i)=>resumeScribe(h.graph,{action:'edit',facts:[{...p,value}]},{threadId:t,counsellorId:'actor-'+i})));
 assert.equal(out.filter(r=>r.kind==='done').length,1);const w=claim(h),f=h.openFacts()[0];assert.equal(f.source.type,'counsellor-edit');assert.equal((f.source as any).counsellorId,w.approvalMetadata.counsellorId);assert.equal((f.source as any).editedAt,w.approvalMetadata.editedAt);assert.equal(f.value,w.decision.edits[0].value);
});
test('independent interrupted winner recovery preserves exact identity',async()=>{
 const h=makeHarness({tenantId:'checker'}),t='checker-recover';const [p]=await pause(h,t);const invoke=h.graph.invoke.bind(h.graph);h.graph.invoke=async()=>{throw Error('checker crash');};
 await assert.rejects(resumeScribe(h.graph,{action:'edit',facts:[{...p,value:'Italy'}]},{threadId:t,counsellorId:' original '}),/checker crash/);const saved=structuredClone(claim(h));h.graph.invoke=invoke;await resumeScribe(h.graph,null,{threadId:t,counsellorId:'recovery'});assert.equal((h.openFacts()[0].source as any).counsellorId,' original ');assert.deepEqual((h.openFacts()[0].source as any).editedAt,saved.approvalMetadata.editedAt);
});
test('independent missing actor, graph forwarding and forged metadata rejected',async()=>{
 const h=makeHarness({tenantId:'checker'}),t='checker-forge';const [p]=await pause(h,t);const edit={action:'edit',facts:[{...p,value:'France'}]};
 await assert.rejects(resumeScribe(h.graph,edit as any,{threadId:t}),ApprovalResponseError);assert.equal(h.facts.size(),0);assert.equal(claim(h),undefined);
 for(const body of [{action:'approve',counsellorId:'fake'},{...edit,approvalMetadata:{counsellorId:'fake'}},{action:'edit',facts:[{...p,value:'France',source:{...p.source,counsellorId:'fake'}}]}])assert.equal(ApprovalResponseSchema.safeParse(body).success,false);
 const second=compileScribeGraph({db:h.db,provider:h.provider,skillsDir:SKILLS_DIR},{checkpointer:h.checkpointer});h.graph.invoke=((input:any,c:any)=>second.invoke(input,c)) as any;await assert.rejects(resumeScribe(h.graph,edit as any,{threadId:t,counsellorId:'outer'}),ApprovalResponseError);assert.equal(h.facts.size(),0);
});
test('independent structured unchanged requires no actor; changed subset stores canonical source',async()=>{
 const h=makeHarness({tenantId:'checker',provider:mockProvider({'fact-extraction':{facts:[citedCandidate('structured',{b:[1,2],a:3},'computer science','t1')]}})}),t='checker-structured';const [p]=await pause(h,t);
 const same=decisionFromResponse({action:'edit',facts:[{...p,value:{a:3,b:[1,2]}}]},[p]);assert.deepEqual(same.decision.edits![0].source,p.source);
 await resumeScribe(h.graph,{action:'edit',facts:[{...p,value:{a:4,b:[1,2]}}]},{threadId:t,counsellorId:'structure'});assert.equal(h.openFacts()[0].source.type,'counsellor-edit');assert.deepEqual((h.openFacts()[0].source as any).editedFrom,p.source);
});
test('independent strict provider and canonical bounded schemas',()=>{
 const original={type:'transcript',quote:'original',turnId:'t1'};const source={type:'counsellor-edit',counsellorId:' ok ',editedAt:'2026-09-30T12:00:00.000Z',editedFrom:original};assert.equal(FactSourceSchema.safeParse(source).success,true);assert.equal(FactSourceSchema.safeParse({...source,editedFrom:source}).success,false);assert.equal(FactSourceSchema.safeParse({...source,counsellorId:'  '}).success,false);assert.equal(ExtractionSkillOutputSchema.safeParse({facts:[],approvalMetadata:{counsellorId:'fake'}}).success,false);
});
test('independent event preserves exact source and metadata affects durable event identity',async()=>{
 const h=makeHarness({tenantId:'checker'}),t='checker-event';const [p]=await pause(h,t);await resumeScribe(h.graph,{action:'edit',facts:[{...p,value:'Japan'}]},{threadId:t,counsellorId:' actor '});const f=h.openFacts()[0];
 const input={tenantId:'checker',studentId:baseInput().studentId,sessionId:baseInput().sessionId,fact:f,occurredAt:'2026-09-30T12:00:00.000Z'};const a:any=buildFactApprovedEvent(input),b:any=buildFactApprovedEvent(input);assert.deepEqual(a.data.fact.source,f.source);assert.equal(a.id,b.id);const c:any=buildFactApprovedEvent({...input,fact:{...f,source:{...f.source,counsellorId:'other'}}});assert.notEqual(a.id,c.id);
});
test('independent rejected raw model metadata preserves clean neighbor',async()=>{
 const contaminated={...citedCandidate('bad','fake','Canada','t1'),approvalMetadata:{counsellorId:'forged'}};const clean=citedCandidate('targetCountry','Canada','Canada','t1');const h=makeHarness({tenantId:'checker',provider:mockProvider({'fact-extraction':{facts:[contaminated,clean]}})});const p=await pause(h,'checker-provider');assert.deepEqual(p.map((f:any)=>f.key),['targetCountry']);assert.equal(h.facts.size(),0);
});
test('independent unknown duplicate canonical metadata rejected without claim',async()=>{
 for(const mode of ['confidence','source','duplicate','key']){const h=makeHarness({tenantId:'checker'}),t='checker-fields-'+mode;const [p]=await pause(h,t);const f:any={...p,value:'Japan'};if(mode==='confidence')f.confidence=.11;if(mode==='source')f.source={type:'profile',id:'invented'};if(mode==='key')f.key='unproposed';await assert.rejects(resumeScribe(h.graph,{action:'edit',facts:mode==='duplicate'?[f,f]:[f]},{threadId:t,counsellorId:'verified'}),ApprovalResponseError);assert.equal(h.facts.size(),0);assert.equal(claim(h),undefined);}
});
