import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {makeHarness,baseInput,STUDENT_ID} from '../../../packages/engine/tests/scribe-fixtures.js';
import {startScribe,resumeScribe} from '../../../packages/engine/src/scribe/index.js';
import {COLLECTION_NAMES as N,requestErasure,executeErasure,releaseExpiredErasureFences,MINIMUM_FENCE_HOLD_MS,readSessionTranscript} from '../../../packages/db/src/index.js';
import {confirmTwiceAndApprove} from '../../../packages/db/src/testing.js';
const gate=()=>{let open:any,enter:any;const wait=new Promise<void>(r=>open=r),reached=new Promise<void>(r=>enter=r);return {open,enter,wait,reached};};
async function erase(h:any){const r=await requestErasure(h.db,{studentId:STUDENT_ID,requestedBy:'requester',reason:'student_request'});await confirmTwiceAndApprove(h.db,{requestId:r.requestId,confirmedBy:'confirmer'});assert.equal((await executeErasure(h.db,r.requestId,{fenceGraceMs:0})).receipt.verified,true);const f=h.fakeDb.collection(N.erasure_fences).all()[0];assert.equal(await releaseExpiredErasureFences(h.db,new Date(Date.parse(f.createdAt)+MINIMUM_FENCE_HOLD_MS+1),0),1);}
for(const saver of ['memory','mongo'] as const) for(const chosen of ['ordinary','__error__']){
 const h=makeHarness({saver,tenantId:'checker-graph'});h.consents.all();await h.consents.updateOne({studentId:STUDENT_ID},{$set:{lifecycleIncarnation:randomUUID()}});
 const thread='checker-graph-'+saver;assert.equal((await startScribe(h.graph,baseInput(),{threadId:thread})).kind,'awaiting_approval');assert.equal(h.facts.size(),0);
 const a=h.graph.checkpointer!,state=await h.graph.getState({configurable:{thread_id:thread}});const cfg={configurable:{thread_id:thread,checkpoint_ns:'',checkpoint_id:state.config.configurable!.checkpoint_id}};
 await assert.rejects(a.putWrites(cfg,[['ordinary','unowned']],'external'));const before=await h.checkpointer.getTuple(cfg);assert.ok(before);
 for(const channel of [chosen]){
  const g=gate(),serde=h.checkpointer.serde,original=serde.dumpsTyped.bind(serde);let once=true;serde.dumpsTyped=async v=>{if(once&&v==='checker-stale-write'){once=false;g.enter();await g.wait;}return original(v);};
  const invoke=h.graph.invoke.bind(h.graph);h.graph.invoke=(async()=>{await a.putWrites(cfg,[[channel,'checker-stale-write']],'checker-same-task');return {};}) as any;
  const outcome=resumeScribe(h.graph,{action:'reject'},{threadId:thread}).then(v=>({v}),error=>({error}));await g.reached;
  await h.checkpointer.putWrites(cfg,[[channel,'checker-independent-winner']],'checker-same-task');const winner=await h.checkpointer.getTuple(cfg);const raw=saver==='mongo'?JSON.stringify(h.fakeDb.collection(N.scribe_checkpoint_writes).all()):undefined;
  g.open();assert.ok('error' in await outcome);assert.deepEqual(await h.checkpointer.getTuple(cfg),winner);if(raw!==undefined)assert.equal(JSON.stringify(h.fakeDb.collection(N.scribe_checkpoint_writes).all()),raw);serde.dumpsTyped=original;h.graph.invoke=invoke;
  console.log('REACHED '+saver+'/'+channel+' serialization winner tuple/raw bytes preserved');
 }
}
for(const phase of ['inserted','pending']){
 const h=makeHarness({saver:'mongo',tenantId:'checker-transcript'});await h.consents.updateOne({studentId:STUDENT_ID},{$set:{lifecycleIncarnation:randomUUID()}});const grant=h.consents.all()[0];
 const rows=h.fakeDb.collection(N.session_transcripts),original=rows.updateOne.bind(rows),g=gate();let first=true;
 rows.updateOne=(async(...args:any[])=>{if(!first)return original(...args);first=false;const result=phase==='inserted'?await original(...args):undefined;g.enter();await g.wait;return result??original(...args);}) as any;
 const attempt=startScribe(h.graph,baseInput(),{threadId:'checker-transcript'}).then(v=>({v}),error=>({error}));await g.reached;rows.updateOne=original;await erase(h);h.consents.seed({...grant,lifecycleIncarnation:randomUUID()});
 if(phase==='inserted')assert.equal((await startScribe(h.graph,baseInput(),{threadId:'checker-transcript'})).kind,'awaiting_approval');const winner=JSON.stringify(rows.all());g.open();assert.ok('error' in await attempt);assert.equal(JSON.stringify(rows.all()),winner);assert.equal(h.facts.size(),0);
 const publicRows=await readSessionTranscript(h.db,{sessionId:baseInput().sessionId,studentId:STUDENT_ID});assert.equal(JSON.stringify(publicRows).includes('writerToken'),false);assert.equal(publicRows.length,rows.all().length);console.log('REACHED transcript '+phase+' actual driver/purge/regrant cleanup winner preserved zero stale facts');
}
{
 const h=makeHarness({saver:'mongo',tenantId:'checker-lease'});await h.consents.updateOne({studentId:STUDENT_ID},{$set:{lifecycleIncarnation:randomUUID()}});const thread='checker-lease';await startScribe(h.graph,baseInput(),{threadId:thread});const orig=h.graph.invoke.bind(h.graph);h.graph.invoke=(async()=>{throw Error('checker crash after claim');}) as any;await assert.rejects(resumeScribe(h.graph,{action:'approve'},{threadId:thread}),/checker crash/);h.graph.invoke=orig;
 const g=gate();h.graph.invoke=(async(...args:any[])=>{g.enter();await g.wait;return orig(...args);}) as any;const recovery=resumeScribe(h.graph,null,{threadId:thread}).then(v=>({v}),error=>({error}));await g.reached;
 const claims=h.fakeDb.collection(N.scribe_resolutions);const claim=claims.all()[0];assert.ok(claim.lease);await claims.updateOne({_id:claim._id},{$unset:{lease:''}});const winner=JSON.stringify(claims.all());g.open();assert.ok('error' in await recovery);assert.equal(JSON.stringify(claims.all()),winner);assert.equal(h.facts.size(),0);h.graph.invoke=orig;const fresh=await resumeScribe(h.graph,null,{threadId:thread});assert.equal(fresh.kind==='done'&&fresh.result.status,'written');console.log('REACHED original recovery lease loss no stale leaf facts, independent claim intact, fresh recovery written');
}
console.log('GRAPH_ORACLE_REACHED_SCOPED_CONTROLS');

