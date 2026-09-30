import test from 'node:test';
import assert from 'node:assert/strict';
import { MemorySaver } from '@langchain/langgraph';
import { createFakeDb } from '../../../packages/db/src/testing.ts';
import { tenantScopedDb } from '../../../packages/db/src/index.ts';
import { compileScribeGraph, startScribe } from '../../../packages/engine/src/scribe/index.ts';
import { ScribeResultSchema } from '../../../packages/engine/src/scribe/schemas.ts';
import { ScribeResultSchema as mutant } from './schemas-mutant.ts';
const minimal={type:'guard_only',level:'crisis',reason:'guard_crisis',studentId:'private-id',sessionId:'private-session',turnIds:['c'],flaggedAt:'2026-10-01T00:00:00.000Z',channel:'record_only',status:'queued'};
test('primary oracle strict minimal rejects arbitrary personal fields and flag changes',()=>{
 assert.equal(ScribeResultSchema.safeParse({status:'escalated',escalation:minimal}).success,true);
 for(const field of ['text','rationale','summary','matched','classifier','recipient']) assert.equal(ScribeResultSchema.safeParse({status:'escalated',escalation:{...minimal,[field]:'SYNTHETIC_PRIVATE_SENTINEL'}}).success,false,field);
 for(const value of [{turnIds:[]},{turnIds:['c','c']},{channel:'email'},{reason:'classifier_severity'}]) assert.equal(ScribeResultSchema.safeParse({status:'escalated',escalation:{...minimal,...value}}).success,false);
 assert.equal(mutant.safeParse({status:'escalated',escalation:{...minimal,text:'SYNTHETIC_PRIVATE_SENTINEL'}}).success,true,'mutant independently proves strictness oracle discriminates');
});
test('primary fresh no-consent translated multi-crisis ids and zero forbidden collection access',async()=>{
 const {db:raw,fakeDb}=createFakeDb(); const db=tenantScopedDb(raw,'primary-A'); let modelCalls=0;
 const provider={kind:'mock',model:'primary',generate:async()=>{modelCalls++;throw new Error('must never call');}} as any;
 const graph=compileScribeGraph({db,provider,skillsDir:new URL('../../../skills',import.meta.url).pathname.replace(/^\/(\w):/,'$1:')},{checkpointer:new MemorySaver()});
 const original=raw.collection.bind(raw); const accesses:string[]=[];
 (raw as any).collection=(name:string,...args:any[])=>{accesses.push(name);return (original as any)(name,...args);};
 const base={sessionId:'primary-session',studentId:'private-id',sessionEndedAt:'2026-10-01T00:00:00.000Z'};
 const turns=['private ordinary discussion','private original words','I want to kill myself'].map((text,i)=>({turnId:`p${i}`,speaker:'student' as const,lang:'en',text,translatedText:i===1?'I want to kill myself':text,ts:i}));
 const outcome=await startScribe(graph,{...base,turns},{threadId:'primary-uncreated'});
 assert.equal(outcome.kind,'done'); assert.equal((outcome as any).result.escalation.type,'guard_only');assert.deepEqual((outcome as any).result.escalation.turnIds,['p1','p2']);
 assert.equal(modelCalls,0); assert.deepEqual([...new Set(accesses)].filter(x=>!['consents','erasure_fences'].includes(x)),[]);
 assert.equal(JSON.stringify(outcome).includes('private original words'),false);
 assert.equal(fakeDb.collection<any>('sessions').all().length,0);
});

import { escalateTurns } from '../../../packages/engine/src/guards/escalation.ts';
import { ProviderAuthorizationRefusedError } from '@vc/providers';
test('primary leaf refusal never publishes even with authority immediately restored',async()=>{
 const {db:raw,fakeDb}=createFakeDb(); const db=tenantScopedDb(raw,'primary-A');
 await db.collection('consents').insertOne({_id:'c',studentId:'s',minor:true,guardianConsent:true,purposes:['profile_synthesis'],recordedAt:'2026-10-01T00:00:00.000Z'} as any);
 let calls=0; const provider={kind:'mock',model:'primary',generate:async()=>{calls++;throw new ProviderAuthorizationRefusedError();}} as any;
 const out=await escalateTurns(db,{studentId:'s',sessionId:'primary-terminal',turns:[{turnId:'t',speaker:'student',lang:'en',text:'I feel hopeless',translatedText:'I feel hopeless'}]}, {recipients:async()=>({adminIds:['a'],counsellorIds:['c']}),classifier:{provider,skillPrompt:'synthetic',config:{model:'primary',timeoutMs:1000,sampleRates:{latin:0,devanagari:0,other:0}}},alert:()=>{}});
 await out.review; assert.equal(calls,1); const flags=fakeDb.collection<any>('crisis_flag_reviews').all();assert.equal(flags.length,1);assert.equal(flags[0].classifier,undefined);assert.equal(fakeDb.collection<any>('escalation_notifications').all().length,0);
});
