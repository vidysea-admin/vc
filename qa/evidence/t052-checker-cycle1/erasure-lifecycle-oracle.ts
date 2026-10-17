import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { COLLECTION_NAMES as N, ensureScribeSessionRow, requestErasure, executeErasure, releaseExpiredErasureFences, MINIMUM_FENCE_HOLD_MS, FencedWriterDeadlineError } from '../../../packages/db/src/index.js';
import { createFakeDb } from '../../../packages/db/tests/fakes.js';
import { confirmTwiceAndApprove } from '../../../packages/db/src/testing.js';
const gate=()=>{let release:any,entered:any;const held=new Promise<void>(r=>release=r),reached=new Promise<void>(r=>entered=r);return {held,reached,release,entered};};
const setup=()=>{const w=createFakeDb();const grant={_id:'same-id',studentId:'s',purposes:['counselling'],guardianConsent:false,minor:false,recordedAt:'2026-10-01T00:00:00.000Z',lifecycleIncarnation:randomUUID()};w.fakeDb.collection(N.consents).seed(grant);return {...w,grant,binding:{studentId:'s',sessionId:'session',tenantId:'t',actorId:'a'}};};
const purge=async(w:any)=>{const {requestId}=await requestErasure(w.db,{studentId:'s',requestedBy:'requester',reason:'student_request'});await confirmTwiceAndApprove(w.db,{requestId,confirmedBy:'confirmer'});const result=await executeErasure(w.db,requestId,{fenceGraceMs:0});assert.equal(result.receipt.verified,true);for(const n of [N.consents,N.decisions,N.sessions])assert.equal(await w.db.collection(n).countDocuments({studentId:'s'}),0);const fence=w.fakeDb.collection(N.erasure_fences).all()[0];const end=Date.parse(fence.createdAt)+MINIMUM_FENCE_HOLD_MS;assert.equal(await releaseExpiredErasureFences(w.db,new Date(end-1),0),0);assert.equal(await releaseExpiredErasureFences(w.db,new Date(Math.max(end,Date.parse(fence.releaseAfter))),0),1);assert.equal(w.fakeDb.collection(N.erasure_fences).all().length,0);};
for(const stage of ['read','write']){
 const w=setup(),c=w.fakeDb.collection(stage==='read'?N.consents:N.decisions),method=stage==='read'?'findOne':'insertOne';const original=(c as any)[method].bind(c);const g=gate();let caught=false;
 (c as any)[method]=async(...args:any[])=>{const result=stage==='read'?await original(...args):undefined;if(!caught){caught=true;g.entered();await g.held;}return stage==='read'?result:original(...args);};
 const old=ensureScribeSessionRow(w.db,{...w.binding,operation:'prepare'});const oldOutcome=old.then(value=>({value}),error=>({error}));await g.reached;(c as any)[method]=original;
 await purge(w);const replacement={...w.grant,lifecycleIncarnation:randomUUID()};assert.notEqual(replacement.lifecycleIncarnation,w.grant.lifecycleIncarnation);w.fakeDb.collection(N.consents).seed(replacement);
 const fresh=await ensureScribeSessionRow(w.db,{...w.binding,operation:'prepare'});const capRows=JSON.stringify(w.fakeDb.collection(N.decisions).all());g.release();assert.ok('error' in await oldOutcome);assert.equal(JSON.stringify(w.fakeDb.collection(N.decisions).all()),capRows);assert.equal((await ensureScribeSessionRow(w.db,{...w.binding,operation:'open',capability:fresh.capability})).state,'active');console.log('REACHED held prepare '+stage+' actual erase/regrant, owned cleanup, fresh positive');
}
{
 const w=setup();const p=await ensureScribeSessionRow(w.db,{...w.binding,operation:'prepare'}),o=await ensureScribeSessionRow(w.db,{...w.binding,operation:'open',capability:p.capability});await purge(w);w.fakeDb.collection(N.consents).seed({...w.grant,lifecycleIncarnation:randomUUID()});for(const operation of ['open','close'] as const)await assert.rejects(ensureScribeSessionRow(w.db,{...w.binding,operation,capability:p.capability,generation:o.generation}));const fresh=await ensureScribeSessionRow(w.db,{...w.binding,operation:'prepare'});assert.notEqual(fresh.capability,p.capability);assert.equal((await ensureScribeSessionRow(w.db,{...w.binding,operation:'open',capability:fresh.capability})).state,'active');console.log('REACHED old capability/open/generationclose refused after actual purge/regrant');
}
{
 const w=setup(),c=w.fakeDb.collection(N.decisions),original=c.insertOne.bind(c),g=gate();c.insertOne=(async(...args:any[])=>{g.entered();await g.held;return original(...args);}) as any;
 const pending=ensureScribeSessionRow(w.db,{...w.binding,operation:'prepare'},{timeoutMS:35}).then(v=>({v}),error=>({error}));await g.reached;const lateRelease=setTimeout(()=>g.release(),75);const result=await pending;assert.ok('error' in result && result.error instanceof FencedWriterDeadlineError);let settled=false;result.error.settled.then(()=>settled=true);await new Promise(r=>setTimeout(r,5));assert.equal(settled,false);c.insertOne=original;await result.error.settled;clearTimeout(lateRelease);assert.equal(c.all().length,0);console.log('REACHED original deadline rejected, settlement waited actual driver, owned late row removed');
}
{
 const w=setup();const p=await ensureScribeSessionRow(w.db,{...w.binding,operation:'prepare'});const c=w.fakeDb.collection(N.sessions),original=c.findOne.bind(c);c.findOne=(async(...args:any[])=>{const v=await original(...args);await w.db.collection(N.decisions).deleteMany({studentId:'s'});return v;}) as any;await assert.rejects(ensureScribeSessionRow(w.db,{...w.binding,operation:'open',capability:p.capability}));assert.equal(c.all().length,0);console.log('REACHED final capability continued-existence refusal');
}
console.log('INDEPENDENT_LIFECYCLE_OUTCOMES_COMPLETE');

{
 const w=setup();const p=await ensureScribeSessionRow(w.db,{...w.binding,operation:'prepare'}),o=await ensureScribeSessionRow(w.db,{...w.binding,operation:'open',capability:p.capability});await w.db.collection(N.sessions).deleteMany({studentId:'s'});await assert.rejects(ensureScribeSessionRow(w.db,{...w.binding,operation:'close',capability:p.capability,generation:o.generation}));assert.equal(w.fakeDb.collection(N.sessions).all().length,0);console.log('REACHED close absent session never upserts');
}
