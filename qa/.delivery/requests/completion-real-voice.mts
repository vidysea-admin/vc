// S13: synthetic local API + real local Mongo + configured Live provider.
// Default is a read-only dry run. A new one-shot approval receipt is required.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {GeminiLiveProvider} from '../../../packages/providers/src/live.ts';
import {voiceWorld,until} from '../../../apps/api/tests/voice-fixtures.ts';
import {adult} from '../../../apps/api/tests/chat-fixtures.ts';
import {tenantScopedDb,createChatThread,proposeProfileFact,decideProfileFact,listProfileFacts} from '../../../packages/db/src/index.ts';
const env={...process.env};
for(const line of (await fs.readFile('D:/vc/.env','utf8')).split(/\r?\n/)){
 const m=/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
 if(m&&env[m[1]]===undefined)env[m[1]]=m[2].replace(/^(["'])(.*)\1$/,'$2');
}
const model=env.VC_VOICE_MODEL?.trim();
const execute=process.argv.includes('--execute');
const approvalPath='qa/.delivery/s13-voice-approval.json',file='qa/evidence/s13-real-voice.json';
const limits={sessions:1,maxWallMs:22000,maxOutputTokens:256};
if(!execute){
 console.log(JSON.stringify({dryRun:true,providerCalls:0,modelConfigured:!!model,keyConfigured:!!env.GEMINI_API_KEY,limits,approvalRequired:approvalPath,proof:['exact spoken question','authoritative finalized yes','candidate/version/thread-bound decision','actual scoped Mongo readback'],costBound:'Must be reviewed for the configured model before approval; time/token limits are not a verified currency cap.'}));
 process.exit(0);
}
if(!model||! /^[A-Za-z0-9._/-]{1,200}$/.test(model)||!env.GEMINI_API_KEY)throw Error('Explicit configured voice model and key required');
const approval=JSON.parse(await fs.readFile(approvalPath,'utf8'));
if(approval.approvedBy!=='Umesh'||approval.model!==model||approval.sessions!==1||approval.maxWallMs!==limits.maxWallMs||approval.maxOutputTokens!==limits.maxOutputTokens||!Number.isFinite(approval.maxCostUsd)||approval.maxCostUsd<=0||approval.maxCostUsd>0.1||approval.priceBoundReviewed!==true||!/^https:\/\/(ai.google.dev|cloud.google.com)\//.test(approval.pricingSource||'')||!Number.isFinite(Date.parse(approval.expiresAt))||Date.parse(approval.expiresAt)<=Date.now()||Date.parse(approval.expiresAt)>Date.now()+86400000)throw Error('Fresh bounded model-specific approval required');
const local=JSON.parse(await fs.readFile('qa/.delivery/completion-mongo.json','utf8')),url=new URL(local.uri);
if(local.synthetic!==true||url.protocol!=='mongodb:'||url.hostname!=='127.0.0.1'||url.pathname!=='/virtual_counsellor'||url.username||url.password)throw Error('Refuse nonlocal QA Mongo');
const require=createRequire(new URL('../../../apps/api/package.json',import.meta.url));
const {MongoClient}=require('mongodb'),{GoogleGenAI}=require('@google/genai');
const clips=[];
for(const path of ['qa/.delivery/requests/synthetic-preference.wav','qa/.delivery/requests/synthetic-yes.wav']){
 const wav=await fs.readFile(path);let offset=12,pcm,format;
 if(wav.toString('ascii',0,4)!=='RIFF'||wav.toString('ascii',8,12)!=='WAVE')throw Error('Synthetic WAV required');
 while(offset+8<=wav.length){const id=wav.toString('ascii',offset,offset+4),n=wav.readUInt32LE(offset+4);
 if(offset+8+n>wav.length)throw Error('Invalid WAV length');
 if(id==='fmt ')format={pcm:wav.readUInt16LE(offset+8),channels:wav.readUInt16LE(offset+10),rate:wav.readUInt32LE(offset+12),bits:wav.readUInt16LE(offset+22)};
 if(id==='data')pcm=wav.subarray(offset+8,offset+8+n);offset+=8+n+n%2;}
 if(!pcm||pcm.length>192000||pcm.length%2||format?.pcm!==1||format.channels!==1||format.rate!==16000||format.bits!==16)throw Error('Bounded mono PCM16/16kHz required');
 clips.push(pcm);
}
const record={synthetic:true,model,limits,approvalRef:approvalPath,maxCostUsd:approval.maxCostUsd,status:'reserved',rawFinalMarkers:[],questionObserved:false,dbUpdated:false,providerCalls:0,extraction:'deterministic Canada fixture; not an extraction-quality verdict'};
await fs.writeFile(file,JSON.stringify(record),{flag:'wx'}); // consumed even if the run fails; no automatic paid retry
const mongo=new MongoClient(local.uri,{serverSelectionTimeoutMS:3000,timeoutMS:5000});
const tenant='s13-voice-'+randomUUID().slice(0,8),student='s13-synthetic-'+randomUUID(),threadId=randomUUID();
let world,client,connection,timer;const started=Date.now();
timer=setTimeout(()=>{client?.abort();connection?.close();},limits.maxWallMs);
try{
 await mongo.connect();const raw=mongo.db('virtual_counsellor'),db=tenantScopedDb(raw,tenant);
 await createChatThread(db,{studentId:student,threadId,textStored:true});
 const prior=await proposeProfileFact(db,{studentId:student,key:'target-country',value:'Germany'});
 assert.ok(prior);await decideProfileFact(db,{studentId:student,factId:prior.factId,action:'confirm'});
 const sdk=new GoogleGenAI({apiKey:env.GEMINI_API_KEY,httpOptions:{timeout:8000}});
 const live=new GeminiLiveProvider({model,connector:{connect:async p=>{
  if(Date.now()-started>=limits.maxWallMs)throw Error('Bounded session ended');
  if(++record.providerCalls!==1)throw Error('Only one paid session authorized');
  connection=await sdk.live.connect({...p,config:{...p.config,maxOutputTokens:limits.maxOutputTokens,temperature:0},callbacks:{...p.callbacks,onmessage:m=>{
   const t=m.serverContent?.inputTranscription;if(t)record.rawFinalMarkers.push({text:t.text,finished:t.finished});p.callbacks.onmessage(m);
  }}});
  if(Date.now()-started>=limits.maxWallMs){connection.close();throw Error('Bounded session ended');}
  return {sendRealtimeInput:i=>{if(Date.now()-started<limits.maxWallMs)connection.sendRealtimeInput(i);},sendToolResponse:i=>{if(Date.now()-started<limits.maxWallMs)connection.sendToolResponse(i);},close:()=>connection.close()};
 }}});
 world=await voiceWorld({live,deps:{dbForTenant:t=>{if(t!==tenant)throw Error('Wrong synthetic tenant');return tenantScopedDb(raw,t);},extractFacts:async({text})=>/\bCanada\b/i.test(text)?[{key:'target-country',value:'Canada'}]:[]}});
 const token=await world.mint(adult(student,tenant),threadId,student);
 const opened=await world.connect(token,{studentId:student,threadId});if(!opened.ok)throw Error('Authenticated voice upgrade failed');
 client=opened.client;
 client.send({type:'start',threadId});
 await until(()=>!!connection,'configured provider connection',8000);
 // Keep synthetic PCM paced. Speech finality comes only from provider events.
 for(let clip=0;clip<2;clip++){
  if(clip===1){
   await until(()=>client.of('confirm').length>0,'exact candidate question',Math.max(1,limits.maxWallMs-(Date.now()-started)));
   const choice=client.of('confirm').at(-1);
   assert.equal(choice.fact.currentValue,'Germany');assert.equal(choice.fact.value,'Canada');assert.equal(choice.threadId,threadId);
   assert.ok(choice.fact.candidateId&&choice.fact.expectedVersion&&choice.promptId);
   const normalize=s=>s.toLowerCase().replace(/[^a-z0-9 ]/g,'').replace(/\s+/g,' ').trim();
   await until(()=>normalize(client.of('transcript.final').filter(e=>e.role==='assistant').map(e=>e.text).join(' ')).includes(normalize(choice.question)),'exact question spoken',Math.max(1,limits.maxWallMs-(Date.now()-started)));
   record.questionObserved=true;
  }
  for(let i=0;i<clips[clip].length;i+=3200){if(client.closed||Date.now()-started>=limits.maxWallMs)throw Error('Bounded session ended');client.ws.send(clips[clip].subarray(i,i+3200),{binary:true});await new Promise(r=>setTimeout(r,100));}
 }
 await until(()=>client.closed,'memory decision closes old context',Math.max(1,limits.maxWallMs-(Date.now()-started)));
 const row=(await listProfileFacts(db,{studentId:student})).find(f=>f.key==='target-country');
 record.authoritativeYes=record.rawFinalMarkers.some(t=>t.finished===true&&/^(yes|yeah|yep)[.!?\s]*$/i.test(t.text||''));
 record.dbUpdated=row?.status==='confirmed'&&row.value==='Canada'&&row.pendingChange===undefined;
 assert.ok(record.authoritativeYes,'No authoritative finalized yes');
 assert.ok(record.dbUpdated,'Spoken acknowledgement is not a DB update');
 record.status='passed';
}catch(e){record.status='failed';record.error=e.name;process.exitCode=1;}
finally{
 clearTimeout(timer);client?.abort();connection?.close();await world?.cleanup();
 const raw=mongo.db('virtual_counsellor');
 for(const name of ['chat_threads','chat_turns','profile_facts','student_usage'])await raw.collection(name).deleteMany({tenantId:tenant,studentId:student}).catch(()=>{record.cleanupIncomplete=true;process.exitCode=1;});
 await mongo.close();record.elapsedMs=Date.now()-started;await fs.writeFile(file,JSON.stringify(record,null,2));
 console.log(JSON.stringify({status:record.status,model,providerCalls:record.providerCalls,questionObserved:record.questionObserved,authoritativeYes:record.authoritativeYes??false,dbUpdated:record.dbUpdated,elapsedMs:record.elapsedMs}));
}
