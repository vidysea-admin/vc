import assert from 'node:assert/strict';
import {MockProvider,RulesProvider,GeminiProvider,LiteLlmProvider,FailoverProvider} from '../../../packages/providers/src/index.ts';
import {SummarySkillOutputSchema} from '../../../packages/engine/src/scribe/schemas.ts';
const ps=[new MockProvider({responses:{'session-summary':{summary:'controlled'}}}),new RulesProvider(),new GeminiProvider({model:'synthetic',apiKey:'synthetic'}),new LiteLlmProvider({model:'synthetic',baseUrl:'http://127.0.0.1:1'})];
let fetches=0;const fetch=globalThis.fetch;globalThis.fetch=async()=>{fetches++;throw Error('Forbidden network execution');};let results=[];
try{for(const p of ps){
 const request={skillName:'session-summary',skillPrompt:'synthetic',outputSchema:SummarySkillOutputSchema,input:{task:'generate',turns:[],facts:[],approvedContext:[]}};
 await assert.rejects(p.generate({...request,preflight:async()=>{throw Error('PRIVATE_AUTH_MARKER');}}),e=>e.name==='ProviderAuthorizationRefusedError'&&!String(e).includes('PRIVATE_AUTH_MARKER'));
 let enter,release;const ready=new Promise(r=>enter=r),held=new Promise(r=>release=r);const c=new AbortController();const observed=p.generate({...request,signal:c.signal,preflight:async()=>{enter();await held;}}).then(v=>({v}),e=>({e}));await ready;c.abort();const out=await observed;release();assert.equal(out.e?.name,p.kind==='litellm'?'LiteLlmAbortedError':'AbortError');results.push({provider:p.kind,heldGateReached:true,refusalAndAbort:true});
 }
 const chain=new FailoverProvider({chain:[ps[0],ps[1],ps[3]],maxAttempts:3,baseDelayMs:0,maxDelayMs:0,deadlineMs:1000,onExhausted:()=>{throw Error('Refusal must not exhaust/failover');}});
 await assert.rejects(chain.generate({skillName:'session-summary',skillPrompt:'synthetic',outputSchema:SummarySkillOutputSchema,input:{},preflight:async()=>{throw Error('PRIVATE_AUTH_MARKER');}}),e=>e.name==='ProviderAuthorizationRefusedError');assert.equal(fetches,0);assert.equal(ps[0].calls.length,0);results.push({provider:'failover',nonretryable:true,actualExecutions:0});console.log(JSON.stringify({independentLeafOracle:results}));
}finally{globalThis.fetch=fetch;}

