import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { loadConcernClassifierConfig as load } from '../../../packages/engine/src/guards/concern-classifier.js';
import { startApi } from '../../../apps/api/src/index.js';
const timeoutError='loadConcernClassifierConfig: VC_CONCERN_TIMEOUT_MS must be a safe integer in [1, 2147483647]';
const sampleError='loadConcernClassifierConfig: VC_CONCERN_SAMPLE_RATES must look like "latin=0.1,devanagari=0.25,other=0.25" with rates in [0, 1]';
assert.deepEqual(load({}), {model:'flash-lite', timeoutMs:8000, sampleRates:{latin:.1,devanagari:.25,other:.25}});
for(const value of ['1','2147483647',' 2000 ','2e3','0x10']) assert.equal(load({VC_CONCERN_TIMEOUT_MS:value}).timeoutMs, Number(value));
assert.equal(load({VC_CONCERN_MODEL:' custom '}).model,'custom');
assert.equal(load({VC_CONCERN_TIMEOUT_MS:'',VC_CONCERN_MODEL:' '}).timeoutMs,8000);
assert.deepEqual(load({VC_CONCERN_SAMPLE_RATES:'latin=0,other=1'}).sampleRates,{latin:0,devanagari:.25,other:1});
const invalids=[...['0','-1','1.5','NaN','Infinity','2147483648','9007199254740992','SYNTHETIC_TIMEOUT_PRIVATE'].map(value=>({env:{VC_CONCERN_TIMEOUT_MS:value},expected:timeoutError})),...['latin=2','latin=-1','latin=Infinity','latin=SYNTHETIC_VALUE_PRIVATE','SYNTHETIC_KEY_PRIVATE=0.5'].map(value=>({env:{VC_CONCERN_SAMPLE_RATES:value},expected:sampleError}))];
for(const {env,expected} of invalids){
 assert.throws(()=>load(env),e=>e instanceof Error && e.message===expected);
 let factories=0,connects=0;
 await assert.rejects(startApi({...env,MONGODB_URI:'mongodb://127.0.0.1:1'}, {clientFactory:()=>{factories++; return {connect:async()=>{connects++}} as any},http:{port:0,host:'127.0.0.1',verifier:{verify:async()=>{throw Error('unused verifier')}},provider:{kind:'mock',model:'synthetic',generate:async()=>{throw Error('unused provider')}}}}),e=>e instanceof Error && e.message===expected);
 assert.equal(factories,0); assert.equal(connects,0);
}
console.log('PASS loader controls; 13 real startApi rejections: factories=0 connects=0; fixed exact raw-free errors');
const fullSource=readFileSync('packages/engine/src/guards/concern-classifier.ts','utf8');
const source=fullSource.slice(fullSource.indexOf('export const CONCERN_CLASSIFIER_DEFAULT_MODEL'),fullSource.indexOf('// ---------------------------------------------------------------------------',fullSource.indexOf('export const CONCERN_CLASSIFIER_DEFAULT_MODEL'))) + fullSource.slice(fullSource.indexOf('export const SAMPLE_STRATA'),fullSource.indexOf('/**', fullSource.indexOf('  return { model, timeoutMs, sampleRates };')));
for(const [name,mutate,env,expected] of [
 ['overflow', (s:string)=>s.replace('!Number.isSafeInteger(n) || n < 1 || n > 2147483647','!Number.isInteger(n) || n < 1'),{VC_CONCERN_TIMEOUT_MS:'2147483648'},timeoutError],
 ['raw-timeout',(s:string)=>s.replace('throw new Error("'+timeoutError+'")','throw new Error(`'+timeoutError+' ${env.VC_CONCERN_TIMEOUT_MS}`)'),{VC_CONCERN_TIMEOUT_MS:'SYNTHETIC_TIMEOUT_PRIVATE'},timeoutError],
 ['raw-sample',(s:string)=>s.replace("'"+sampleError+"'",'`'+sampleError+' ${part}`'),{VC_CONCERN_SAMPLE_RATES:'SYNTHETIC_KEY_PRIVATE=0.5'},sampleError]
] as const){
 const changed=mutate(source); assert.notEqual(changed,source,'mutation must apply');
 const path=`qa/evidence/t051-checker/${name}.ts`; writeFileSync(path,changed);
 const mutant=await import('./'+name+'.js');
 let killed=false;try{assert.throws(()=>mutant.loadConcernClassifierConfig(env),e=>e instanceof Error&&e.message===expected)}catch(e){assert.ok(e instanceof assert.AssertionError);killed=true;console.log('KILLED '+name+': '+e.message.split('\n')[0]);}assert.equal(killed,true,'semantic mutant must fail independent assertion');
 writeFileSync(path,source);assert.equal(readFileSync(path,'utf8'),source,'restore QA copy');
}
console.log('PASS 3 semantic mutants killed and QA copies restored');

