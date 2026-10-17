import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { SignJWT } from '../../../apps/api/node_modules/jose/dist/webapi/index.js';
import { COLLECTION_NAMES as N, exportStudent, ensureScribeSessionRow, tenantScopedDb, validateConsentForWrite } from '../../../packages/db/src/index.js';
import { createFakeDb } from '../../../packages/db/tests/fakes.js';
import { createApiHandler } from '../../../apps/api/src/server.js';
import { createJwtVerifier, jwtConfigFromEnv } from '../../../apps/api/src/auth.js';
const {db,fakeDb}=createFakeDb();
const tenant='checker-tenant', student='checker-student', session='checker-session';
const scoped=tenantScopedDb(db,tenant);
const key=generateKeyPairSync('rsa',{modulusLength:2048});
const verifier=createJwtVerifier(jwtConfigFromEnv({VC_JWT_ISSUER:'checker-local',VC_JWT_PUBLIC_KEY:key.publicKey.export({type:'spki',format:'pem'}).toString()}));
const handler=createApiHandler({verifier,dbForTenant:t=>tenantScopedDb(db,t),graphForTenant:()=>{throw Error('Graph unused');}} as any);
const jwt=async(t=tenant,a='checker-actor',role='counsellor')=>new SignJWT({tenant:t,counsellorId:a,role}).setProtectedHeader({alg:'RS256'}).setIssuer('checker-local').setExpirationTime('5m').sign(key.privateKey);
const call=async(op:string,body:any={},token?:string,s=student,se=session)=>{token ??= await jwt(); const r=await handler({method:op==='export'?'GET':'POST',url:op==='export'?`/v1/students/${s}/export`:`/v1/students/${s}/sessions/${se}/${op}`,headers:{authorization:`Bearer ${token}`},readBody:async()=>JSON.stringify(body)});return {...r,json:JSON.parse(r.body)};};
const grant={_id:'checker-grant',studentId:student,purposes:['counselling'],minor:false,guardianConsent:false,recordedAt:'2026-10-01T00:00:00.000Z'};
assert.deepEqual(validateConsentForWrite(grant),{studentId:student,purposes:['counselling'],minor:false,guardianConsent:false,recordedAt:grant.recordedAt});
for(const field of ['lifecycleIncarnation','creationAttempt','openingCapabilityHash']) assert.throws(()=>validateConsentForWrite({...grant,[field]:undefined}),/internal authority/);
await scoped.collection(N.consents).insertOne(grant as any);
assert.equal((await call('prepare')).status,403);
assert.equal((await scoped.collection(N.consents).findOne({_id:grant._id}))?.lifecycleIncarnation,undefined);
const incarnation=randomUUID();await scoped.collection(N.consents).updateOne({_id:grant._id},{$set:{lifecycleIncarnation:incarnation}});
assert.equal((await call('prepare',{},'tampered')).status,401);
for(const field of ['tenantId','actorId','studentId','lifecycleIncarnation','generation']) assert.equal((await call('prepare',{[field]:'external'})).status,400);
const p=await call('prepare');assert.equal(p.status,200);assert.equal(await scoped.collection(N.sessions).countDocuments({studentId:student}),0);
const caps=await scoped.collection(N.decisions).find({studentId:student}).toArray();assert.equal(caps.length,1);
const opened=await call('open',{capability:p.json.capability});assert.equal(opened.status,200);
const retries=await Promise.all([call('open',{capability:p.json.capability}),call('open',{capability:p.json.capability})]);for(const r of retries){assert.equal(r.status,200);assert.equal(r.json.generation,opened.json.generation);}
for(const [tok,s,se] of [[await jwt('foreign'),student,session],[await jwt(tenant,'foreign'),student,session],[await jwt(), 'foreign',session],[await jwt(),student,'foreign']]) assert.equal((await call('open',{capability:p.json.capability},tok,s,se)).status,403);
assert.equal((await call('close',{capability:p.json.capability,generation:randomUUID()})).status,403);
assert.equal((await call('close',{capability:p.json.capability,generation:opened.json.generation})).status,200);
const before=await scoped.collection(N.sessions).findOne({sessionId:session});await ensureScribeSessionRow(scoped,{sessionId:session,studentId:student,threadId:'checker-attachment'});
const after=await scoped.collection(N.sessions).findOne({sessionId:session});for(const field of ['lifecycleState','lifecycleGeneration','creationAttempt','endedAt','startedAt']) assert.deepEqual(after?.[field],before?.[field]);
assert.equal((await call('open',{capability:p.json.capability})).status,403);
const originals=[{type:'transcript',quote:'legitimate quote',turnId:'original-turn'},{type:'kb',id:'original-kb',fetchedAt:grant.recordedAt},{type:'profile',id:'original-profile'},{type:'student-direct',id:'original-answer'}];
const sources=[...originals,...originals.map(editedFrom=>({type:'counsellor-edit',counsellorId:'editor',editedAt:grant.recordedAt,editedFrom}))];
const privateMarker='PRIVATE_CHECKER_AUTHORITY';
const facts=sources.map((source,i)=>({key:`personal-${i}`,value:{lifecycleIncarnation:'legitimate personal answer',lease:{token:'personal token'},creationAttempt:['personal choice']},source,confidence:0.8,validFrom:grant.recordedAt,validTo:'2027-01-01T00:00:00.000Z',purposeTags:['counselling'],sensitivity:'low',kind:'reasoning',explains:'reason',citationMatch:'verbatim',needsReview:true,reviewReasons:['review']}));
const responses=[{action:'approve'},{action:'reject',reason:'public reason'},{action:'edit',facts},{action:'per_fact',summary:'approve',facts:[{key:'a',decision:'approve'},{key:'b',decision:'reject',reason:'declined'},{key:'c',decision:'edit',value:0}]},{action:'per_fact',summary:'withhold',facts:[{key:'d',decision:'edit',value:false}]}];
const expected=responses.map((response,i)=>({_id:`checker-claim-${i}`,threadId:`checker-thread-${i}`,studentId:student,decision:{approve:i!==1,edits:facts},response,responseHash:`hash-${i}`,claimedAt:grant.recordedAt,approvalMetadata:{counsellorId:'editor',editedAt:grant.recordedAt}}));
const dirtyFacts=facts.map(f=>({...f,creationAttempt:privateMarker,source:{...f.source,lifecycleIncarnation:privateMarker,...('editedFrom' in f.source?{editedFrom:{...f.source.editedFrom,openingCapabilityHash:privateMarker}}:{})}}));
for(const row of expected){await scoped.collection(N.scribe_resolutions).insertOne({...row,lease:{token:privateMarker,expiresAt:grant.recordedAt},lifecycleGeneration:privateMarker,decision:{...row.decision,creationAttempt:privateMarker,edits:dirtyFacts},response:{...row.response,creationAttempt:privateMarker,...(row.response.action==='edit'?{facts:dirtyFacts}:row.response.action==='per_fact'?{facts:row.response.facts.map(f=>({...f,writerToken:privateMarker}))}:{})},approvalMetadata:{...row.approvalMetadata,lease:{token:privateMarker}}} as any);}
const partial={_id:'checker-partial',studentId:student,threadId:'checker-partial-thread'};await scoped.collection(N.scribe_resolutions).insertOne({...partial,lease:{token:privateMarker}} as any);
const rawBefore=JSON.stringify(await scoped.collection(N.scribe_resolutions).find({studentId:student}).toArray());
const result=await exportStudent(scoped,student);assert.deepEqual(result.approvalClaims,[...expected,partial]);assert.equal(JSON.stringify(result).includes(privateMarker),false);assert.equal(result.decisions.length,0);
assert.equal(JSON.stringify(await scoped.collection(N.scribe_resolutions).find({studentId:student}).toArray()),rawBefore);
const viaApi=await call('export',{},await jwt(tenant,'checker-admin','admin'));assert.equal(viaApi.status,200);assert.deepEqual(viaApi.json.approvalClaims,[...expected,partial]);assert.equal(viaApi.body.includes(privateMarker),false);
const foreign=await call('export',{},await jwt('foreign','checker-admin','admin'));assert.equal(foreign.status,200);assert.equal(foreign.json.approvalClaims.length,0);
console.log(JSON.stringify({signedJWT:true,strictBodies:true,legacyRefusalNoIssuance:true,concurrentRetry:true,identityRefusals:4,closedAttachmentPreserved:true,fourActionsAndSummaryVariants:true,citations:8,opaqueValuesPreserved:true,partialLegacy:true,rawClaimsUnchanged:true,directAndJWTExport:true,tenantIsolation:true}));



