import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemorySaver } from '@langchain/langgraph';
import { COLLECTION_NAMES, tenantScopedDb, FencedWriterDeadlineError, FENCE_POSTCHECK_TIMEOUT_MS, exportStudent, requestErasure, executeErasure } from '@vc/db';
import { createFakeDb, confirmTwiceAndApprove } from '@vc/db/testing';
import { MockProvider, ProviderAuthorizationRefusedError, type LlmProvider } from '@vc/providers';
import { compileScribeGraph, startScribe, SCRIBE_PURPOSE, ScribeInputSchema, ScribeResultSchema } from '../src/scribe/index.js';
import { classifyConcern, escalateTurns, type EscalationDeps } from '../src/index.js';
import { baseInput, mockProvider, SKILLS_DIR } from './scribe-fixtures.js';

const STUDENT='b-student'; const SESSION='b-session'; const AT='2026-10-01T00:00:00.000Z';
const CRISIS='I want to kill myself'; const CONCERN="So much pressure I can't cope";
const guardInput={text:CONCERN,translatedText:CONCERN,lang:'en',guardLevel:'concern' as const,guardMatched:['synthetic']};
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
function world(consent=false, provider?:LlmProvider){
  const {fakeDb,db:raw}=createFakeDb(); const db=tenantScopedDb(raw,'b-tenant-a');
  if(consent) fakeDb.collection<any>(COLLECTION_NAMES.consents).seed({_id:'b-tenant-a:b-consent',tenantId:'b-tenant-a',studentId:STUDENT,guardianConsent:true,minor:true,purposes:[SCRIBE_PURPOSE],recordedAt:AT});
  const model=provider??new MockProvider({model:'b-classifier',responses:{'concern-classifier':{severity:'high',likelyBenign:false,rationale:'synthetic'}}});
  const alerts:any[]=[];
  const deps:EscalationDeps={recipients:async()=>({adminIds:['b-admin'],counsellorIds:['b-counsellor']}),classifier:{provider:model,skillPrompt:'synthetic',config:{model:'b-classifier',timeoutMs:100,sampleRates:{latin:0,devanagari:0,other:0}}},alert:a=>alerts.push(a)};
  const scribe=mockProvider(); const graph=compileScribeGraph({db,provider:scribe,skillsDir:SKILLS_DIR,escalation:deps},{checkpointer:new MemorySaver()});
  return {fakeDb,db,raw,deps,model,scribe,graph,alerts};
}
const input=(text:string)=>({studentId:STUDENT,sessionId:SESSION,turns:[{turnId:'b-turn',speaker:'student',lang:'en',text,translatedText:text}]});
const notifications=(w:ReturnType<typeof world>)=>w.fakeDb.collection<any>('escalation_notifications').all();
const reviews=(w:ReturnType<typeof world>)=>w.fakeDb.collection<any>('crisis_flag_reviews').all();

test('B independent strict minimal schema rejects arbitrary extras and invalid identifier sets',()=>{
 const e={type:'guard_only',level:'crisis',reason:'guard_crisis',studentId:STUDENT,sessionId:SESSION,turnIds:['one','two'],flaggedAt:AT,channel:'record_only',status:'queued'};
 assert.equal(ScribeResultSchema.safeParse({status:'escalated',escalation:e}).success,true);
 for(const escalation of [{...e,message:'PRIVATE'},{...e,matched:['PRIVATE']},{...e,reason:'PRIVATE'},{...e,turnIds:['one','one']},{...e,turnIds:[]}]) assert.equal(ScribeResultSchema.safeParse({status:'escalated',escalation}).success,false);
 const source=baseInput(); source.turns.push({...source.turns[0]!}); assert.equal(ScribeInputSchema.safeParse(source).success,false);
});

test('B independent translated multi-crisis and ordinary refusal bypass all personal boundaries',async()=>{
 for(const crisis of [false,true]){
  const w=world(); const source=baseInput({studentId:STUDENT,sessionId:SESSION});
  if(crisis) source.turns=[{...source.turns[0]!,turnId:'original',text:CRISIS,translatedText:CRISIS},{...source.turns[0]!,turnId:'translated',lang:'hi',text:'Synthetic original-language placeholder',translatedText:CRISIS}];
  const accessed:string[]=[];const collection=w.raw.collection.bind(w.raw);const forbidden=['sessions','session_transcripts','facts','edges','profiles','crisis_flag_reviews','scribe_checkpoints','scribe_checkpoint_writes','scribe_resolutions','kb_entities','kb_chunks'];
  (w.raw as any).collection=(name:string,...args:any[])=>{if(forbidden.includes(name))accessed.push(name);return (collection as any)(name,...args)};
  let invoke=0,getState=0,trace=0; (w.graph as any).invoke=()=>{invoke++;throw Error('forbidden invoke')}; (w.graph as any).getState=()=>{getState++;throw Error('forbidden checkpoint')};
  const out=await startScribe(w.graph,source,{threadId:'b-private',callbacks:[{name:'b trace',handleChainStart:async()=>{trace++}}]});
  assert.deepEqual({accessed,invoke,getState,trace,scribe:w.scribe.calls.length},{accessed:[],invoke:0,getState:0,trace:0,scribe:0});
  assert.equal(out.kind,'done'); if(out.kind!=='done')throw Error('expected done');
  if(crisis){assert.equal(out.result.status,'escalated'); if(out.result.status!=='escalated')throw Error('expected escalated');assert.deepEqual((out.result.escalation as any).turnIds,['original','translated']);assert.equal(notifications(w).length,4);assert.ok(notifications(w).every(n=>n.matched.length===0&&n.reason==='guard_crisis'&&n.severity==='critical'));assert.equal(JSON.stringify(out).includes(CRISIS),false)}
  else assert.deepEqual(out.result,{status:'refused',reason:'Consent required'});
 }
});

test('B independent held private preflight expires before actual model and late release never executes',async()=>{
 let release!:()=>void; const held=new Promise<void>(r=>release=r);let entered=0,executed=0;
 const provider=new MockProvider({model:'b-model',responses:{'concern-classifier':()=>{executed++;return{severity:'low',likelyBenign:true,rationale:'synthetic'}}}});
 const started=Date.now();const out=await classifyConcern(guardInput,{provider,skillPrompt:'synthetic',timeoutMs:40,preflight:async()=>{entered++;await held}});
 assert.equal(out.status,'unavailable');assert.equal(out.status==='unavailable'&&out.reason,'timeout');assert.equal(entered,1);assert.ok(Date.now()-started<1000);release();await sleep(20);assert.equal(executed,0);
});

test('B independent terminal leaf refusal cannot resurrect to annotation or fallback',async()=>{
 const provider:LlmProvider={kind:'mock',model:'b-refusal',generate:async()=>{throw new ProviderAuthorizationRefusedError()}};
 await assert.rejects(classifyConcern(guardInput,{provider,skillPrompt:'synthetic',timeoutMs:100}),ProviderAuthorizationRefusedError);
 const w=world(true,provider);const run=await escalateTurns(w.db,input(CONCERN),w.deps);await run.review;
 assert.equal(reviews(w).length,1);assert.equal(reviews(w)[0].classifier,undefined);assert.equal(notifications(w).length,0);
});

test('B independent genuine timeout and outage retain authorized fail-open',async()=>{
 for(const outage of [false,true]){
 const provider:LlmProvider={kind:'mock',model:'b-outage',generate:async()=>{if(outage)throw Error('SYNTHETIC_PRIVATE');return new Promise(()=>{})}};
 const w=world(true,provider);w.deps.classifier.config.timeoutMs=30;w.deps.writerDeadlineMs=200;
 const result=await escalateTurns(w.db,input(CONCERN),w.deps);await result.review;
 assert.equal(reviews(w)[0].classifier.status,'unavailable');assert.equal(notifications(w).length,2);assert.ok(notifications(w).every(n=>n.reason==='classifier_unavailable'));assert.equal(JSON.stringify(reviews(w)).includes('SYNTHETIC_PRIVATE'),false);
 }
});

test('B independent held model revocation and explicit cancel preserve prior flag without new output',async()=>{
 for(const cancel of [false,true]){
 let release!:()=>void,started!:()=>void;const held=new Promise<void>(r=>release=r);const entered=new Promise<void>(r=>started=r);
 const provider:LlmProvider={kind:'mock',model:'b-held',generate:async<T>():Promise<T>=>{started();await held;return{severity:'high',likelyBenign:false,rationale:'synthetic'} as T}};
 const w=world(true,provider);w.deps.classifier.config.timeoutMs=1000;const controller=new AbortController();w.deps.signal=controller.signal;
 const result=await escalateTurns(w.db,input(CONCERN),w.deps);await entered;
 if(cancel)controller.abort();else await w.db.collection(COLLECTION_NAMES.consents).deleteMany({studentId:STUDENT});
 release();await result.review;assert.equal(reviews(w).length,1);assert.equal(reviews(w)[0].classifier,undefined);assert.equal(notifications(w).length,0);
 }
});

test('B independent annotation work exhausts original notification remainder',async()=>{
 const w=world(true);w.deps.classifier.config.timeoutMs=20;w.deps.writerDeadlineMs=100;
 let annotation=false,recipients=false;const flags=w.fakeDb.collection<any>('crisis_flag_reviews');const update=flags.updateOne.bind(flags);
 flags.updateOne=async(...args:Parameters<typeof update>)=>{if((args[1] as any).$set?.classifier){annotation=true;await sleep(70)}return update(...args)};
 w.deps.recipients=async()=>{recipients=true;await sleep(90);return{adminIds:['b-admin'],counsellorIds:[]}};
 const result=await escalateTurns(w.db,input(CONCERN),w.deps);await result.review;assert.equal(annotation,true);assert.equal(recipients,true);assert.equal(notifications(w).length,0);assert.equal(reviews(w).length,1);
});

test('B independent late notification cleanup preserves complete newer owner and other tenant',async()=>{
 const w=world();w.deps.writerDeadlineMs=50;const rows=w.fakeDb.collection<any>('escalation_notifications');
 rows.seed({_id:'b-tenant-b:untouched',tenantId:'b-tenant-b',studentId:STUDENT,privateSynthetic:'other owner'});const other=JSON.stringify(rows.all()[0]);
 const update=rows.updateOne.bind(rows);let release!:()=>void,started!:()=>void;const held=new Promise<void>(r=>release=r);const entered=new Promise<void>(r=>started=r);let once=false,ownToken:string|undefined,expected:string|undefined,reached=false;
 rows.updateOne=async(...args:Parameters<typeof update>)=>{if(!once&&(args[1] as any).$setOnInsert?.writerToken){once=true;ownToken=(args[1] as any).$setOnInsert.writerToken;started();await held;const result=await update(...args);await update(args[0],{$set:{writerToken:'b-newer-owner',syntheticMarker:'preserve exact'}});expected=JSON.stringify(rows.all().find(n=>n._id===(args[0] as any)._id));return result}return update(...args)};
 const remove=rows.deleteMany.bind(rows);rows.deleteMany=async(...args:Parameters<typeof remove>)=>{if(expected&&(args[0] as any).writerToken===ownToken)reached=true;return remove(...args)};
 const pending=escalateTurns(w.db,input(CRISIS),w.deps).catch(e=>e);await entered;const error=await pending;assert.ok(error instanceof FencedWriterDeadlineError);release();await error.settled;
 assert.equal(JSON.stringify(rows.all().find(n=>n.writerToken==='b-newer-owner')),expected);assert.equal(JSON.stringify(rows.all().find(n=>n.tenantId==='b-tenant-b')),other);assert.equal(reached,true);
});

test('B independent no-anchor export and actual confirmed purge preserve tenant B',async()=>{
 const w=world();await escalateTurns(w.db,input(CRISIS),w.deps);const other=tenantScopedDb(w.raw,'b-tenant-b');await escalateTurns(other,input(CRISIS),w.deps);
 const before=JSON.stringify(notifications(w).filter(n=>n.tenantId==='b-tenant-b'));assert.equal(w.fakeDb.collection<any>('sessions').all().length,0);assert.equal((await exportStudent(w.db,STUDENT)).escalations.length,2);
 const {requestId}=await requestErasure(w.db,{studentId:STUDENT,requestedBy:'b-test',reason:'student_request'});await confirmTwiceAndApprove(w.db,{requestId,confirmedBy:'b-test'});const done=await executeErasure(w.db,requestId);assert.equal(done.status,'completed');assert.equal(done.receipt.totalRemaining,0);
 assert.equal(notifications(w).filter(n=>n.tenantId==='b-tenant-a').length,0);assert.equal(JSON.stringify(notifications(w).filter(n=>n.tenantId==='b-tenant-b')),before);
});

for(const mode of ['unfenced','unreadable','held'] as const)test(`B independent D016 initial consent timeout ${mode} postcheck and no late resurrection`,async()=>{
 const w=world(true);const consents=w.fakeDb.collection<any>(COLLECTION_NAMES.consents);const find=consents.findOne.bind(consents);let releaseConsent!:()=>void;const consentGate=new Promise<void>(r=>releaseConsent=r);let consentEntered=false;
 consents.findOne=async(...args:Parameters<typeof find>)=>{consentEntered=true;await consentGate;return find(...args)};
 const fences=w.fakeDb.collection<any>(COLLECTION_NAMES.erasure_fences);const read=fences.findOne.bind(fences);let releaseFence!:()=>void;const fenceGate=new Promise<void>(r=>releaseFence=r);let post=false;
 fences.findOne=async(...args:Parameters<typeof read>)=>{if((args[1] as any)?.timeoutMS===FENCE_POSTCHECK_TIMEOUT_MS){post=true;if(mode==='unreadable')throw Error('SYNTHETIC_PRIVATE');if(mode==='held')await fenceGate}return read(...args)};
 const started=Date.now();const value=await startScribe(w.graph,baseInput({studentId:STUDENT,sessionId:SESSION}),{threadId:'b-d016-'+mode,writerDeadlineMs:40}).catch(e=>e);
 assert.equal(consentEntered,true);assert.equal(post,true);if(mode==='unfenced')assert.ok(value instanceof FencedWriterDeadlineError);else assert.deepEqual(value,{kind:'fenced'});assert.ok(Date.now()-started<FENCE_POSTCHECK_TIMEOUT_MS+2000);
 releaseConsent();releaseFence();await sleep(30);assert.equal(w.scribe.calls.length,0);for(const name of ['sessions','session_transcripts','facts','edges','crisis_flag_reviews'])assert.equal(w.fakeDb.collection<any>(name).all().length,0,name);
});
