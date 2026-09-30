import assert from 'node:assert/strict';
import { createFakeDb, confirmTwiceAndApprove } from '@vc/db/testing';
import { tenantScopedDb, erasureFenceKey, StudentFencedError } from '@vc/db';
import { exportStudent, requestErasure, executeErasure } from '../db/src/erasure.js';
import { escalateTurns, readFlagReviews, readEscalations } from './src/guards/escalation.js';

const mode = process.argv[2] ?? 'all';
const names = ['escalation_notifications', 'crisis_flag_reviews'];
const text = 'I feel hopeless';
const quote = 'Student said: "I feel hopeless"';
const turn = (s = text) => ({turnId:'turn',speaker:'student',lang:'en',text:s,translatedText:s});
function world(output: unknown) {
  const {fakeDb,db:raw} = createFakeDb();
  const db = tenantScopedDb(raw,'A');
  let calls = 0;
  const deps = {recipients:async()=>({adminIds:['admin'],counsellorIds:['staff']}),
    classifier:{provider:{kind:'mock' as const,model:'synthetic',async generate<T>() {calls++; return output as T;}},skillPrompt:'synthetic offline',config:{model:'synthetic',timeoutMs:5000,sampleRates:{latin:1,devanagari:1,other:1}}},alert:()=>{}};
  return {fakeDb,raw,db,deps,calls:()=>calls};
}
async function purge(db:any) {
  const {requestId}=await requestErasure(db,{studentId:'student',requestedBy:'requester',reason:'student_request'});
  await confirmTwiceAndApprove(db,{requestId,confirmedBy:'confirmer'});
  const result=await executeErasure(db,requestId);
  assert.equal(result.status,'completed');
}
async function lifecycle() {
  const w=world({severity:'high',likelyBenign:false,rationale:quote});
  await w.db.collection('consents').insertOne({_id:'consent',studentId:'student',purposes:['counselling'],recordedAt:new Date().toISOString()});
  const result=await escalateTurns(w.db,{sessionId:'session',studentId:'student',turns:[turn()]},w.deps);
  await result.review;
  const b=tenantScopedDb(w.raw,'B');
  for(const name of names) for(const row of await w.db.collection(name).find({}).toArray()) { const {tenantId,...copy}=row; await b.collection(name).insertOne(copy); }
  const bBefore=JSON.stringify(names.map(n=>w.fakeDb.collection(n).all().filter((d:any)=>d.tenantId==='B')));
  const exported=await exportStudent(w.db,'student');
  assert.equal(exported.crisisReviews[0]?.classifier?.status,'classified');
  assert.equal((exported.crisisReviews[0]?.classifier as any).rationale,quote,'valid consented quotation survives exact access export');
  assert.equal(exported.escalations.length,2);
  assert.deepEqual(Object.keys(exported.escalations[0]!).sort(),['escalationId','sessionId','studentId','turnId','guardLevel','matched','severity','reason','channel','status','flaggedAt','notifiedAt','acknowledgedAt'].sort());
  assert.deepEqual(Object.keys(exported.crisisReviews[0]!).sort(),['sessionId','studentId','turnId','guardLevel','matched','flaggedAt','classifier'].sort());
  assert.ok(!JSON.stringify(exported.escalations).includes(quote));
  await purge(w.db);
  for(const name of names) assert.deepEqual(w.fakeDb.collection(name).all().filter((d:any)=>d.tenantId==='A'),[],'RAW ZERO '+name);
  assert.equal(JSON.stringify(names.map(n=>w.fakeDb.collection(n).all().filter((d:any)=>d.tenantId==='B'))),bBefore,'other tenant raw bytes preserved');
  assert.equal((await exportStudent(w.db,'student')).crisisReviews.length,0);
  console.log('PASS independent lifecycle: exact quoted rationale export/erase; raw tenant A zero, B byte-identical, no session anchors');
}
async function schema() {
  const valid={severity:'high',likelyBenign:false,rationale:'synthetic'};
  const invalid=[null,{...valid,severity:'invented'},{...valid,likelyBenign:'false'},{...valid,extra:'PRIVATE-PROVIDER-RAW'},{...valid,rationale:''},{...valid,rationale:'X'.repeat(501)}];
  let cases=0;
  for(const output of invalid) for(const s of [text,'I want to kill myself']) {
    const w=world(output);
    const result=await escalateTurns(w.db,{sessionId:'session',studentId:'student',turns:[turn(s)]},w.deps);
    if(s!==text) assert.equal(result.immediate.length,2,'crisis immediate before review');
    await result.review;
    const raw=w.fakeDb.collection('crisis_flag_reviews').all()[0] as any;
    assert.equal(raw.classifier.status,'unavailable','invalid provider shape rejected');
    assert.equal(raw.classifier.reason,'error');
    assert.equal(raw.classifier.rationale,undefined);
    const [view]=await readFlagReviews(w.db,{sessionId:'session'});
    assert.equal(view!.visible,true);
    assert.equal(view!.effectiveSeverity,s===text?'moderate':'critical');
    const ns=await readEscalations(w.db,{sessionId:'session'});
    assert.equal(ns.length,2,'fail-open safety notification');
    assert.ok(ns.every(n=>n.severity===(s===text?'moderate':'critical')));
    const exported=await exportStudent(w.db,'student');
    assert.deepEqual(Object.keys(exported.crisisReviews[0]!.classifier!).sort(),['status','reason','attemptedAt'].sort());
    assert.ok(!JSON.stringify(w.fakeDb.collection('crisis_flag_reviews').all()).includes('PRIVATE-PROVIDER-RAW'));
    cases++;
  }
  for(const severity of ['high','critical']) {
    const w=world({severity,likelyBenign:false,rationale:'Student said: "I am considering letters"'});
    const result=await escalateTurns(w.db,{sessionId:'session',studentId:'student',turns:[turn('I am considering letters')]},w.deps);
    assert.equal(result.selected[0]!.guard.level,'none');
    await result.review;
    assert.equal((await readEscalations(w.db,{sessionId:'session'})).length,2,'quoted rationale does not discard sampled risk');
    cases++;
  }
  const w=world({severity:'none',likelyBenign:true,rationale:'synthetic'});
  await (await escalateTurns(w.db,{sessionId:'session',studentId:'student',turns:[turn()]},w.deps)).review;
  const [view]=await readFlagReviews(w.db,{sessionId:'session'});
  assert.equal(view!.visible,true); assert.equal(view!.effectiveSeverity,'moderate');
  console.log('PASS independent classifier schema/floors/visibility: '+(cases+1)+' raw-state cases');
}
async function precheck() {
  const w=world({severity:'high',likelyBenign:false,rationale:'synthetic'});
  await w.db.collection('erasure_fences').insertOne({_id:erasureFenceKey('student'),studentKey:erasureFenceKey('student'),createdAt:new Date().toISOString(),requestId:'synthetic'});
  const c=w.fakeDb.collection('crisis_flag_reviews'); const original=c.updateOne.bind(c); let dispatched=0;
  c.updateOne=async(...args:any[])=>{dispatched++; return (original as any)(...args);};
  await assert.rejects(escalateTurns(w.db,{sessionId:'session',studentId:'student',turns:[turn()]},w.deps),StudentFencedError);
  assert.equal(dispatched,0,'RAW PRECHECK forbids driver dispatch');
  assert.deepEqual(c.all(),[]);
  console.log('PASS independent precheck dispatch outcome');
}
async function ownership() {
  const w=world({severity:'high',likelyBenign:false,rationale:'synthetic'});
  await (await escalateTurns(w.db,{sessionId:'session',studentId:'student',turns:[turn('I want to kill myself')]},w.deps)).review;
  const c=w.fakeDb.collection('escalation_notifications'); const before=JSON.stringify(c.all()); const original=c.updateOne.bind(c); let injected=false;
  c.updateOne=async(...args:any[])=>{
    const result=await (original as any)(...args);
    if(!injected && args[1].$setOnInsert){injected=true; await w.db.collection('erasure_fences').insertOne({_id:erasureFenceKey('student'),studentKey:erasureFenceKey('student'),createdAt:new Date().toISOString(),requestId:'synthetic'});}
    return result;
  };
  await assert.rejects(escalateTurns(w.db,{sessionId:'session',studentId:'student',turns:[turn('I want to kill myself')]},w.deps),StudentFencedError);
  assert.equal(injected,true,'replay upsert reached raw driver');
  assert.equal(JSON.stringify(c.all()),before,'RAW OWNERSHIP replay preserves prior notification bytes');
  console.log('PASS independent replay ownership outcome');
}
console.log('CHECKER LOAD isolated erasure/escalation: '+import.meta.url);
if(mode==='all'||mode==='lifecycle') await lifecycle();
if(mode==='all'||mode==='schema') await schema();
if(mode==='all'||mode==='precheck') await precheck();
if(mode==='all'||mode==='ownership') await ownership();

