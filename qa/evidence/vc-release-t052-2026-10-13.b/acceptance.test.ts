import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { SignJWT } from '../../../apps/api/node_modules/jose/dist/webapi/index.js';
import { createJwtVerifier, jwtConfigFromEnv } from '../../../apps/api/src/auth.ts';
import { createApiHandler } from '../../../apps/api/src/server.ts';
import { tenantScopedDb, COLLECTION_NAMES as N, validateConsentForWrite } from '../../../packages/db/src/index.ts';
import { createFakeDb, INDEX_PLAN, TEST_ERASURE_CONFIG, confirmTwiceAndApprove } from '../../../packages/db/src/testing.ts';
import * as boundFacts from '../../../packages/db/src/facts.ts';
import * as boundErasure from '../../../packages/db/src/erasure.ts';
import * as boundGraph from '../../../packages/engine/src/scribe/graph.ts';
import { makeHarness, baseInput, STUDENT_ID, SKILLS_DIR } from '../../../packages/engine/tests/scribe-fixtures.ts';
const facts = process.env.VC_SECONDARY_FACTS ? await import(pathToFileURL(process.env.VC_SECONDARY_FACTS).href) : boundFacts;
const erase = process.env.VC_SECONDARY_ERASURE ? await import(pathToFileURL(process.env.VC_SECONDARY_ERASURE).href) : boundErasure;
const graph = process.env.VC_SECONDARY_GRAPH ? await import(pathToFileURL(process.env.VC_SECONDARY_GRAPH).href) : boundGraph;
const B = { studentId: 'secondary-student', sessionId: 'secondary-session', tenantId: 'secondary', actorId: 'actor' };
const G = { _id: 'same-grant', studentId: B.studentId, guardianConsent: true, minor: true, purposes: ['counselling','profile_synthesis'], recordedAt: '2026-10-13T00:00:00.000Z', lifecycleIncarnation: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' };
function world() { const h=createFakeDb(); for (const x of INDEX_PLAN) if(x.unique) h.fakeDb.collection(x.collection).declareUniqueIndex(Object.keys(x.keys),{partialFilterExpression:x.partialFilterExpression}); h.fakeDb.collection(N.consents).seed(structuredClone(G)); return h; }
function gate() { let open!:()=>void; const promise=new Promise<void>(r=>open=r); return {open,promise}; }
async function purge(db:any, fake:any, studentId=B.studentId) {
 const {requestId}=await erase.requestErasure(db,{studentId,requestedBy:'requester',reason:'student_request'});
 await confirmTwiceAndApprove(db,{requestId,confirmedBy:'confirmer'});
 const result=await erase.executeErasure(db,requestId,{fenceGraceMs:0});
 assert.equal(result.receipt.verified,true); assert.equal(result.receipt.totalRemaining,0);
 const fence=fake.collection(N.erasure_fences).all()[0]; assert.ok(fence);
 assert.equal(await erase.releaseExpiredErasureFences(db,new Date(new Date(fence.createdAt).getTime()+erase.MINIMUM_FENCE_HOLD_MS+1),0),1);
 assert.equal(await erase.isStudentFenced(db,studentId),false);
}
test('B23.1/7 signed JWT API identity, strict bodies, winner retry and publication', {timeout:15000}, async()=>{
 const h=world(); await h.db.collection(N.consents).deleteMany({}); const db=tenantScopedDb(h.db,'secondary'); await db.collection(N.consents).insertOne(G);
 const keys=generateKeyPairSync('rsa',{modulusLength:2048}); const bad=generateKeyPairSync('rsa',{modulusLength:2048});
 const verifier=createJwtVerifier(jwtConfigFromEnv({VC_JWT_ISSUER:'https://secondary.synthetic.test',VC_JWT_PUBLIC_KEY:keys.publicKey.export({type:'spki',format:'pem'}).toString(),VC_JWT_CLOCK_SKEW_SEC:'0'}));
 const handler=createApiHandler({verifier,dbForTenant:(t:string)=>tenantScopedDb(h.db,t),graphForTenant:()=>{throw Error('unexpected graph');},log:()=>{},erasureConfig:()=>TEST_ERASURE_CONFIG} as any);
 async function jwt(claims:any={},k=keys.privateKey,expiry='5m',issuer='https://secondary.synthetic.test') { return new SignJWT({tenant:'secondary',counsellorId:'actor',role:'counsellor',...claims}).setProtectedHeader({alg:'RS256'}).setIssuer(issuer).setIssuedAt().setExpirationTime(expiry).sign(k); }
 async function call(op:string,token:string|undefined,body:any={},student=B.studentId,session=B.sessionId) { const r=await handler({method:'POST',url:`/v1/students/${student}/sessions/${session}/${op}`,headers:token?{authorization:`Bearer ${token}`}:{},readBody:async()=>JSON.stringify(body)}); return {...r,json:JSON.parse(r.body)}; }
 const token=await jwt(); const before=JSON.stringify(h.fakeDb.collection(N.decisions).all());
 for(const t of [undefined,'invalid',await jwt({},bad.privateKey),await jwt({},keys.privateKey,'-1m'),await jwt({},keys.privateKey,'5m','https://wrong.synthetic.test')]) assert.equal((await call('prepare',t)).status,401);
 assert.equal(JSON.stringify(h.fakeDb.collection(N.decisions).all()),before);
 for(const key of ['actorId','tenantId','generation','lifecycleIncarnation','creationAttempt','capability']) assert.equal((await call('prepare',token,{[key]:'injected'})).status,400);
 const prepared=await call('prepare',token); assert.equal(prepared.status,200); assert.equal(h.fakeDb.collection(N.sessions).size(),0);
 const cap=prepared.json.capability;
 for(const [t,s,se] of [[await jwt({counsellorId:'foreign'}),B.studentId,B.sessionId],[await jwt({tenant:'foreign'}),B.studentId,B.sessionId],[token,'other-student',B.sessionId],[token,B.studentId,'other-session']]) assert.equal((await call('open',t,{capability:cap},s,se)).status,403);
 const opened=await call('open',token,{capability:cap}); assert.equal(opened.status,200); const winner=structuredClone(h.fakeDb.collection(N.sessions).all());
 assert.equal((await call('open',token,{capability:cap})).json.generation,opened.json.generation); assert.deepEqual(h.fakeDb.collection(N.sessions).all(),winner);
 assert.equal((await call('close',token,{capability:cap,generation:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'})).status,403);
 assert.equal((await call('close',token,{capability:cap,generation:opened.json.generation})).json.state,'closed');
 const closed=h.fakeDb.collection(N.sessions).all(); await facts.ensureScribeSessionRow(db,{sessionId:B.sessionId,studentId:B.studentId,threadId:'secondary-attachment'}); assert.equal(h.fakeDb.collection(N.sessions).all()[0].lifecycleState,'closed');
 assert.equal((await call('open',token,{capability:cap})).status,403); assert.equal(closed[0].creationAttempt,h.fakeDb.collection(N.sessions).all()[0].creationAttempt);
});
test('B23.2 internal incarnation required and external own undefined rejection raw-free', async()=>{
 for(const field of ['lifecycleIncarnation','lifecycleGeneration','creationAttempt','openingCapability','capabilityHash','openingCapabilityHash','lifecycleActor','lifecycleTenant']) { const input={...G,[field]:undefined}; assert.throws(()=>validateConsentForWrite(input),{message:'Consent internal authority must not be supplied.'}); }
 const publicGrant={...G}; delete (publicGrant as any).lifecycleIncarnation; assert.equal((validateConsentForWrite(publicGrant) as any).lifecycleIncarnation,undefined);
 for(const incarnation of [undefined,'bad','aaaaaaaa-aaaa-1aaa-8aaa-aaaaaaaaaaaa',123]) { const h=world(); await h.db.collection(N.consents).updateOne({_id:G._id},{$set:{lifecycleIncarnation:incarnation}}); await assert.rejects(facts.ensureScribeSessionRow(h.db,{...B,operation:'prepare'})); assert.equal(h.fakeDb.collection(N.decisions).size(),0); }
});
test('B23.3/4 held prepare before actual purge cannot adopt identical public regrant; fresh bytes succeed', {timeout:15000},async()=>{
 const h=world(), rows=h.fakeDb.collection(N.decisions), original=rows.insertOne.bind(rows), hold=gate(), reached=gate(); let once=true;
 rows.insertOne=async(...args:any[])=>{if(once){once=false;reached.open();await hold.promise;}return original(...args);};
 const old=facts.ensureScribeSessionRow(h.db,{...B,operation:'prepare'}); const rejected=assert.rejects(old);
 try{await reached.promise; await purge(h.db,h.fakeDb); h.fakeDb.collection(N.consents).seed({...G,lifecycleIncarnation:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'}); const fresh=await facts.ensureScribeSessionRow(h.db,{...B,operation:'prepare'}); const winner=rows.all(); hold.open();await rejected;assert.deepEqual(rows.all(),winner);assert.equal((await facts.ensureScribeSessionRow(h.db,{...B,operation:'open',capability:fresh.capability})).state,'active');}finally{hold.open();rows.insertOne=original;}
});
test('B23.3/4 old capability and close generation invalid after actual erase/regrant', {timeout:15000},async()=>{
 const h=world();const p=await facts.ensureScribeSessionRow(h.db,{...B,operation:'prepare'});const o=await facts.ensureScribeSessionRow(h.db,{...B,operation:'open',capability:p.capability});await purge(h.db,h.fakeDb);h.fakeDb.collection(N.consents).seed({...G,lifecycleIncarnation:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'});
 await assert.rejects(facts.ensureScribeSessionRow(h.db,{...B,operation:'open',capability:p.capability}));await assert.rejects(facts.ensureScribeSessionRow(h.db,{...B,operation:'close',capability:p.capability,generation:o.generation}));assert.equal(h.fakeDb.collection(N.decisions).size(),0);assert.equal(h.fakeDb.collection(N.sessions).size(),0);
 const fresh=await facts.ensureScribeSessionRow(h.db,{...B,operation:'prepare'});assert.notEqual(fresh.capability,p.capability);assert.equal((await facts.ensureScribeSessionRow(h.db,{...B,operation:'open',capability:fresh.capability})).state,'active');
});
test('B23.3 deadline original driver settlement cleans only owned capability', {timeout:10000},async()=>{
 const h=world(),rows=h.fakeDb.collection(N.decisions), original=rows.insertOne.bind(rows), hold=gate(), reached=gate();let once=true;
 rows.insertOne=async(...args:any[])=>{if(once){once=false;reached.open();await hold.promise;}return original(...args);};
 const attempt=facts.ensureScribeSessionRow(h.db,{...B,operation:'prepare'},{timeoutMS:70}); const rejection=attempt.then(()=>assert.fail('deadline renewed'),(e:any)=>e);
 try { await reached.promise; const e=await rejection;assert.equal(e.name,'FencedWriterDeadlineError'); const fresh=await facts.ensureScribeSessionRow(h.db,{...B,operation:'prepare'});const winner=rows.all();hold.open();await e.settled;assert.deepEqual(rows.all(),winner);assert.equal((await facts.ensureScribeSessionRow(h.db,{...B,operation:'open',capability:fresh.capability})).state,'active'); }finally{hold.open();rows.insertOne=original;}
});
test('B23.3 post-read capability existence, consent loss and fence refuse publication',async()=>{
 for(const mode of ['capability','consent','fence']){const h=world();const p=await facts.ensureScribeSessionRow(h.db,{...B,operation:'prepare'});const rows=h.fakeDb.collection(N.sessions),original=rows.findOne.bind(rows);let once=true;
 rows.findOne=async(...args:any[])=>{const value=await original(...args);if(once){once=false;if(mode==='capability')await h.db.collection(N.decisions).deleteMany({studentId:B.studentId});else if(mode==='consent')await h.db.collection(N.consents).deleteMany({studentId:B.studentId});else{const{requestId}=await erase.requestErasure(h.db,{studentId:B.studentId,requestedBy:'r',reason:'student_request'});await erase.confirmErasure(h.db,{requestId,confirmedBy:'c'});}}return value;};
 await assert.rejects(facts.ensureScribeSessionRow(h.db,{...B,operation:'open',capability:p.capability}));assert.equal(rows.size(),0);rows.findOne=original;}
});
test('B23.5 concurrent retry and late original close preserve exact recreated winner',{timeout:12000},async()=>{
 const h=world();const p=await facts.ensureScribeSessionRow(h.db,{...B,operation:'prepare'});const results=await Promise.all([1,2,3].map(()=>facts.ensureScribeSessionRow(h.db,{...B,operation:'open',capability:p.capability})));assert.equal(results.filter(x=>x.created).length,1);const rows=h.fakeDb.collection(N.sessions);const original=rows.updateOne.bind(rows),hold=gate(),reached=gate();let once=true;
 rows.updateOne=async(...args:any[])=>{if(once){once=false;reached.open();await hold.promise;}return original(...args);};
 const attempt=facts.ensureScribeSessionRow(h.db,{...B,operation:'close',capability:p.capability,generation:results[0].generation});const rejected=assert.rejects(attempt);
 try{await reached.promise;const winner={...rows.all()[0],creationAttempt:'independent-recreated',lifecycleState:'active',summary:'preserve winner bytes'};await rows.deleteMany({_id:B.sessionId});rows.seed(winner);hold.open();await rejected;assert.deepEqual(rows.all(),[winner]);}finally{hold.open();rows.updateOne=original;}
});
test('B23.6 recursive authority projection retains public values and legacy claims',async()=>{
 const h=world();const secret={lifecycleIncarnation:'PRIVATE-GRANT',creationAttempt:'PRIVATE-ATTEMPT',lease:{token:'PRIVATE-LEASE'}};
 h.fakeDb.collection(N.sessions).seed({_id:B.sessionId,...B,...secret,summary:'Public summary',scribeThreadIds:['thread']});
 h.fakeDb.collection(N.decisions).seed({_id:'ordinary',studentId:B.studentId,universityId:'u',courseId:'c',rationale:'Public rationale',alternativesConsidered:['a'],decidedAt:'today',...secret});
 h.fakeDb.collection(N.decisions).seed({_id:'cap',studentId:B.studentId,kind:'session_opening_capability',capabilityHash:'PRIVATE-CAP'});
 const value={lease:'student discussed rental lease',token:'personal value token',lifecycleIncarnation:'personal literal label'};
 const fact={key:'housing',value,source:{type:'transcript',quote:'Public quote',turnId:'t',...secret},confidence:.9,validFrom:'today',purposeTags:['counselling'],sensitivity:'low',...secret};
 h.fakeDb.collection(N.scribe_resolutions).seed({_id:'claim',threadId:'thread',studentId:B.studentId,lease:{token:'PRIVATE-LEASE'},decision:{approve:true,edits:[fact],...secret},response:{action:'edit',facts:[fact],...secret},approvalMetadata:{counsellorId:'a',editedAt:'today',...secret}});
 h.fakeDb.collection(N.scribe_resolutions).seed({_id:'legacy',threadId:'legacy-thread',studentId:B.studentId,response:{action:'approve'}});
 const out=await erase.exportStudent(h.db,B.studentId);const bytes=JSON.stringify(out);for(const marker of ['PRIVATE-GRANT','PRIVATE-ATTEMPT','PRIVATE-LEASE','PRIVATE-CAP'])assert.ok(!bytes.includes(marker),marker);
 assert.equal(out.sessions[0].summary,'Public summary');assert.equal(out.decisions[0].rationale,'Public rationale');assert.deepEqual(out.approvalClaims[0].decision.edits[0].value,value);assert.equal(out.approvalClaims.length,2);
});
function engineWorld(){const h=makeHarness({saver:'mongo',tenantId:'secondary'});h.graph=graph.compileScribeGraph({db:h.db,provider:h.provider,skillsDir:SKILLS_DIR},{checkpointer:h.checkpointer});return h;}
for(const kind of ['checkpoint','special-write'])test(`B23.5 actual existing-row ${kind} CAS preserves preceding guards and winner bytes`,{timeout:15000},async()=>{
 const h=engineWorld(),thread=`secondary-${kind}`;await graph.startScribe(h.graph,baseInput(),{threadId:thread});const state=await h.graph.getState({configurable:{thread_id:thread}});const config={configurable:{thread_id:thread,checkpoint_ns:'',checkpoint_id:state.config.configurable.checkpoint_id}};
 const rows=h.fakeDb.collection(kind==='checkpoint'?N.scribe_checkpoints:N.scribe_checkpoint_writes);const task='secondary-task';
 if(kind==='special-write'){await h.checkpointer.putWrites(config,[['__error__','original-value']],task);const previous=rows.all().find((r:any)=>r.thread_id===thread&&r.task_id===task&&r.idx===-1);assert.ok(previous);await rows.deleteMany({thread_id:thread,task_id:task,idx:-1});rows.seed({...previous,_id:'secondary:secondary-special-existing'});}
 const original=rows.updateOne.bind(rows),hold=gate(),reached=gate();let captured:any,once=true;
 rows.updateOne=async(filter:any,update:any,options:any)=>{if(once&&Object.hasOwn(filter,'_id')&&update.$set?.vcWriterAttempt){once=false;captured={filter,update,options};reached.open();await hold.promise;}return original(filter,update,options);};
 h.graph.invoke=async()=>{if(kind==='checkpoint')await h.graph.checkpointer.put(config,{...state.values,id:config.configurable.checkpoint_id,v:1,ts:new Date().toISOString(),channel_values:{},channel_versions:{},versions_seen:{},pending_sends:[]},{source:'update',step:898,parents:{}},{});else await h.graph.checkpointer.putWrites(config,[['__error__','stale-value']],task);throw Error('controlled post-write stop');};
 const attempt=graph.resumeScribe(h.graph,{action:'reject'},{threadId:thread}); const rejection=attempt.then(()=>assert.fail('expected terminal refusal'),e=>e);
 try{await reached.promise;assert.ok(captured.options.timeoutMS>0);const old=rows.all().find((r:any)=>r._id===captured.filter._id);assert.ok(old);const winner={...old,vcWriterAttempt:'independent-driver-winner',...(kind==='checkpoint'?{metadata_search:{winner:'distinct'},metadata:Buffer.from('winner-metadata')}:{value:Buffer.from('winner-pending-value')})};await rows.deleteMany({_id:old._id});rows.seed(winner);const bytes=JSON.stringify(rows.all().filter((r:any)=>r._id===old._id));hold.open();await rejection;assert.equal(JSON.stringify(rows.all().filter((r:any)=>r._id===old._id)),bytes,'CAS must preserve independently recreated winner byte-for-byte');console.log(`REACHED ${kind} existing-row driver after serialization+authority; CASpresent=${Object.hasOwn(captured.filter,'vcWriterAttempt')}; winner-byte-survival`);}finally{hold.open();rows.updateOne=original;}
});
test('B23.5 saved-state crash recovery positive and borrowed lease refusal', {timeout:15000},async()=>{
 const h=engineWorld(),thread='secondary-recovery';await graph.startScribe(h.graph,baseInput(),{threadId:thread});const original=h.graph.invoke.bind(h.graph);h.graph.invoke=async()=>{throw Error('controlled crash after claim');};await assert.rejects(graph.resumeScribe(h.graph,{action:'approve'},{threadId:thread}));h.graph.invoke=original;
 const claims=h.fakeDb.collection(N.scribe_resolutions);assert.equal(claims.size(),1);const result=await graph.resumeScribe(h.graph,null,{threadId:thread});assert.equal(result.kind==='done'&&result.result.status,'written');assert.ok(h.facts.size()>0);const saved=await h.checkpointer.getTuple({configurable:{thread_id:thread}});assert.ok(saved);assert.equal((await graph.resumeScribe(h.graph,null,{threadId:thread})).kind,'done');
});
test('B23.3/5 actual approved summary driver cannot alter recreated session winner', {timeout:15000},async()=>{
 const h=engineWorld(),thread='secondary-summary-driver';await graph.startScribe(h.graph,baseInput(),{threadId:thread});const rows=h.fakeDb.collection(N.sessions),original=rows.updateOne.bind(rows),hold=gate(),reached=gate();let once=true,captured:any;
 rows.updateOne=async(filter:any,update:any,options:any)=>{if(once&&update.$set&&Object.hasOwn(update.$set,'summary')){once=false;captured={filter,update,options};reached.open();await hold.promise;}return original(filter,update,options);};
 const attempt=graph.resumeScribe(h.graph,{action:'approve'},{threadId:thread});const rejection=attempt.then(x=>x,e=>e);
 try{await reached.promise;assert.ok(captured.options.timeoutMS>0);const old=rows.all()[0];const winner={...old,lifecycleGeneration:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',creationAttempt:'independent-summary-winner',summary:'WINNER PUBLIC SUMMARY',summaryApprovedAt:'winner-timestamp'};await rows.deleteMany({_id:old._id});rows.seed(winner);const expected=JSON.stringify(rows.all());hold.open();await rejection;assert.equal(JSON.stringify(rows.all()),expected,'stale DB summary driver must preserve new generation/attempt and its summary bytes');console.log('REACHED actual summary driver and recreated session winner');}finally{hold.open();rows.updateOne=original;}
});
test('B23.6 actual approved graph edges omit compensation writer ownership', {timeout:15000},async()=>{
 const h=engineWorld(),thread='secondary-edge-export';await graph.startScribe(h.graph,baseInput(),{threadId:thread});const result=await graph.resumeScribe(h.graph,{action:'approve'},{threadId:thread});assert.equal(result.kind==='done'&&result.result.status,'written');const rows=h.edges.all();assert.ok(rows.length>0);assert.ok(rows.some((x:any)=>typeof x.writerToken==='string'),'normal approved write owns at least one edge');const out=await erase.exportStudent(h.db,STUDENT_ID);assert.ok(out.edges.length>0);assert.ok(out.edges.every((x:any)=>!Object.hasOwn(x,'writerToken')),'public graph edges must omit internal writerToken ownership');for(const edge of rows){const projected=out.edges.find((x:any)=>x._id===edge._id);assert.ok(projected);assert.deepEqual(projected.from,edge.from);assert.deepEqual(projected.to,edge.to);assert.equal(projected.rel,edge.rel);}
});
test('B23.3/4/5 actual purge regrant while approved summary driver waits preserves new session and zero old facts', {timeout:20000},async()=>{
 const h=engineWorld(),thread='secondary-purge-leaf';await graph.startScribe(h.graph,baseInput(),{threadId:thread});const grant=h.consents.all()[0];const rows=h.fakeDb.collection(N.sessions),original=rows.updateOne.bind(rows),hold=gate(),reached=gate();let once=true,captured:any;
 rows.updateOne=async(filter:any,update:any,options:any)=>{if(once&&update.$set&&Object.hasOwn(update.$set,'summary')){once=false;captured={filter,update,options};reached.open();await hold.promise;}return original(filter,update,options);};
 const attempt=graph.resumeScribe(h.graph,{action:'approve'},{threadId:thread});const rejection=attempt.then(x=>x,e=>e);
 try{await reached.promise;assert.ok(captured.options.timeoutMS>0);await purge(h.db,h.fakeDb,STUDENT_ID);h.consents.seed({...grant,lifecycleIncarnation:'dddddddd-dddd-4ddd-8ddd-dddddddddddd'});assert.equal((await graph.startScribe(h.graph,baseInput(),{threadId:thread})).kind,'awaiting_approval');const fresh=rows.all()[0];await rows.updateOne({_id:fresh._id},{$set:{summary:'FRESH GENERATION PUBLIC SUMMARY',summaryApprovedAt:'fresh-owner-timestamp'}});const winner=JSON.stringify(rows.all());assert.equal(h.facts.size(),0);hold.open();const terminal=await rejection;console.log(`REACHED actual summary Mongo driver held before erase; verified actual purge; released fence; regrant and fresh session; stale terminal=${terminal?.name??terminal?.kind}; stale-facts=${h.facts.size()}`);assert.equal(JSON.stringify(rows.all()),winner,'old approved summary must not mutate fresh generation after actual purge/regrant');assert.equal(h.facts.size(),0,'old approved facts must not persist after actual purge/regrant');}finally{hold.open();rows.updateOne=original;}
});
