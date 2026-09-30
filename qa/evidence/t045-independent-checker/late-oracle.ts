import assert from 'node:assert/strict';
import { resolve } from 'node:path'; import {pathToFileURL} from 'node:url';
import {makeHarness,baseInput,SKILLS_DIR,STUDENT_ID} from '../../../packages/engine/tests/scribe-fixtures.ts';
import {requestErasure,executeErasure,releaseExpiredErasureFences,MINIMUM_FENCE_HOLD_MS} from '../../../packages/db/src/index.ts';
import {confirmTwiceAndApprove} from '../../../packages/db/src/testing.ts';
const api=await import(pathToFileURL(resolve(process.env.T045_MUTANT_ROOT||'packages/engine/src','scribe/index.ts')).href);const tracing={enabled:false};let results=[];
for(const mode of ['erase','recreate','readfault','consentfault','undofault','newer']){
 if(process.env.T045_ONLY && mode!==process.env.T045_ONLY)continue;
 const h=makeHarness({tenantId:'independent-late',saver:'mongo'});h.graph=api.compileScribeGraph({db:h.db,provider:h.provider,skillsDir:SKILLS_DIR},{checkpointer:h.checkpointer});const threadId='independent-late-'+mode;const opts={threadId,tracing};await api.startScribe(h.graph,baseInput({sessionId:threadId}),opts);
 const claims=h.fakeDb.collection('scribe_resolutions');let enter,release;const entered=new Promise(r=>enter=r), held=new Promise(r=>release=r);const orig=claims.insertOne.bind(claims);let driverDone=false;
 claims.insertOne=async(...args)=>{enter();await held;const result=await orig(...args);driverDone=true;if(mode==='newer'){const own=claims.all()[0];claims.seed({...own,lease:{token:'independent-new-owner',expiresAt:'2099-01-01T00:00:00.000Z'}});}return result;};
 const observed=api.resumeScribe(h.graph,{action:'approve'},{...opts,writerDeadlineMs:150}).then(v=>({v}),e=>({e}));await entered;const outcome=await observed;assert.equal(outcome.e?.name,'FencedWriterDeadlineError');assert.equal(driverDone,false);let settled=false;const settlement=outcome.e.settled.then(()=>{settled=true;return null;},e=>{settled=true;return e;});await new Promise(r=>setImmediate(r));assert.equal(settled,false,'settlement cannot precede original driver');
 const calls=h.provider.calls.length;let recreated;
 if(['erase','recreate'].includes(mode)){
  const {requestId}=await requestErasure(h.db,{studentId:STUDENT_ID,requestedBy:'independent-admin',reason:'student_request'});await confirmTwiceAndApprove(h.db,{requestId,confirmedBy:'independent-admin'});const erased=await executeErasure(h.db,requestId,{fenceGraceMs:0});assert.equal(erased.status,'completed');const fences=h.fakeDb.collection('erasure_fences');const fence=fences.all()[0];await releaseExpiredErasureFences(h.db,new Date(Date.parse(fence.createdAt)+MINIMUM_FENCE_HOLD_MS+1),0);assert.equal(fences.all().length,0);
  if(mode==='recreate'){h.consents.seed({_id:'independent-late:consent-'+STUDENT_ID,tenantId:'independent-late',studentId:STUDENT_ID,guardianConsent:true,minor:true,purposes:['profile_synthesis'],recordedAt:'2026-09-30T00:00:00.000Z'});const fresh=await api.startScribe(h.graph,baseInput({sessionId:threadId}),opts);assert.equal(fresh.kind,'awaiting_approval');recreated=JSON.stringify(['sessions','scribe_checkpoints','scribe_checkpoint_writes'].map(n=>h.fakeDb.collection(n).all()));}
 } else if(mode==='readfault')h.graph.getState=async()=>{throw Error('INDEPENDENT_PRIVATE_READ');};
 else if(mode==='consentfault')h.consents.findOne=async()=>{throw Error('INDEPENDENT_PRIVATE_CONSENT');};
 else {h.consents.seed({...h.consents.all()[0],purposes:[]});if(mode==='undofault')claims.deleteMany=async()=>{throw Error('INDEPENDENT_PRIVATE_UNDO');};}
 release();const err=await settlement;assert.equal(driverDone,true);
 if(['readfault','consentfault','undofault'].includes(mode)){assert.equal(err?.name,'ProviderAuthorizationRefusedError');assert.doesNotMatch(String(err),/INDEPENDENT_PRIVATE/);}else assert.equal(err,null);
 if(mode==='newer'){assert.equal(claims.all().length,1,'newer durable winner must remain');assert.equal(claims.all()[0]?.lease?.token,'independent-new-owner');assert.equal(claims.all()[0].response.action,'approve');}else if(mode!=='undofault')assert.equal(claims.all().length,0,'late own claim must leave no raw residue after lost authority');
 if(mode==='erase'){assert.equal(h.provider.calls.length,calls);for(const n of ['sessions','scribe_checkpoints','scribe_checkpoint_writes'])assert.equal(h.fakeDb.collection(n).all().length,0);}
 if(mode==='recreate')assert.equal(JSON.stringify(['sessions','scribe_checkpoints','scribe_checkpoint_writes'].map(n=>h.fakeDb.collection(n).all())),recreated,'new checkpoints remain byte-identical');results.push({mode,reached:true,settlementError:err?.name??null});
}
console.log(JSON.stringify({independentLateOracle:results}));

