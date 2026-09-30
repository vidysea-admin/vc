import {test} from 'node:test';import assert from 'node:assert/strict';import {generateKeyPairSync} from 'node:crypto';import {SignJWT} from 'jose';
import {createFakeMongoClient} from '@vc/db/testing';import {VC_DB_NAME} from '@vc/db';import {MockProvider} from '@vc/providers';
import {startApi} from '../src/index.js';import {createJwtVerifier,jwtConfigFromEnv} from '../src/auth.js';
const keys=generateKeyPairSync('rsa',{modulusLength:2048});const issuer='b-independent-issuer';const publicKey=keys.publicKey.export({type:'spki',format:'pem'}).toString();
const verifier=createJwtVerifier(jwtConfigFromEnv({VC_JWT_ISSUER:issuer,VC_JWT_PUBLIC_KEY:publicKey}));
const token=(tenant:string)=>new SignJWT({tenant,counsellorId:'b-verified',role:'counsellor'}).setProtectedHeader({alg:'RS256'}).setIssuer(issuer).setIssuedAt().setExpirationTime('2m').sign(keys.privateKey);
const skillsDir='D:/vc/.worktrees/t047-crisis/skills';
test('B independent invalid classifier startup refuses before factory/connect',async()=>{
 for(const env of [{VC_CONCERN_TIMEOUT_MS:'0'},{VC_CONCERN_SAMPLE_RATES:'latin=2'}]){
 let factory=0;await assert.rejects(startApi({MONGODB_URL:'mongodb://synthetic/ignored',...env},{clientFactory:()=>{factory++;throw Error('must not reach factory')},http:{port:0,verifier,provider:new MockProvider({responses:{}}),skillsDir}}),/loadConcernClassifierConfig/);assert.equal(factory,0);
 }
});
test('B independent actual JWT server: body cannot grant tenant, two-tenant multi-crisis replay stays minimal',async()=>{
 const fake=createFakeMongoClient();const provider=new MockProvider({responses:{}});const seen:string[]=[];
 const api=await startApi({MONGODB_URL:'mongodb://synthetic/ignored'},{clientFactory:()=>fake.client,http:{port:0,verifier,provider,skillsDir,escalationForTenant:tenant=>{seen.push(tenant);return{recipients:async()=>({adminIds:['b-admin-'+tenant],counsellorIds:['b-counsellor-'+tenant]}),classifier:{provider,skillPrompt:'synthetic',config:{model:'b',timeoutMs:30,sampleRates:{latin:1,devanagari:1,other:1}}}}}}});
 const url=`http://127.0.0.1:${api.port}/v1/students/b-student/sessions/b-session/scribe`;const text='I want to kill myself';const body={sessionEndedAt:'2026-10-01T00:00:00.000Z',turns:[{turnId:'a',speaker:'student',lang:'en',text,translatedText:text,ts:1},{turnId:'b',speaker:'student',lang:'hi',text:'synthetic original',translatedText:text,ts:2}]};
 const send=async(jwt:string|undefined,b:unknown)=>fetch(url,{method:'POST',headers:{...(jwt?{authorization:'Bearer '+jwt}:{}),'content-type':'application/json'},body:JSON.stringify(b)});
 try{
 assert.equal((await send(undefined,body)).status,401);assert.deepEqual(seen,[]);
 const a=await token('b-tenant-a');const forged=await send(a,{...body,tenant:'b-tenant-b',tenantId:'b-tenant-b',recipients:{adminIds:['forged']}});assert.equal(forged.status,400);assert.deepEqual(seen,[]);
 for(const tenant of ['b-tenant-a','b-tenant-b','b-tenant-a']){const response=await send(await token(tenant),body);assert.equal(response.status,200);const out=await response.json() as any;assert.equal(out.result.escalation.type,'guard_only');assert.deepEqual(out.result.escalation.turnIds,['a','b']);assert.equal(JSON.stringify(out).includes(text),false)}
 assert.deepEqual(seen,['b-tenant-a','b-tenant-b']);const raw=fake.dbFor(VC_DB_NAME);const rows=raw.collection<any>('escalation_notifications').all();assert.equal(rows.length,8);assert.ok(rows.every(n=>n.recipient.id===(n.recipient.role==='admin'?'b-admin-':'b-counsellor-')+n.tenantId&&n.matched.length===0&&n.status==='queued'&&n.channel==='record_only'));
 for(const name of ['sessions','session_transcripts','facts','edges','crisis_flag_reviews','scribe_checkpoints','scribe_checkpoint_writes','scribe_resolutions'])assert.equal(raw.collection<any>(name).all().length,0,name);assert.equal(provider.calls.length,0);
 }finally{await api.stop()}
});
