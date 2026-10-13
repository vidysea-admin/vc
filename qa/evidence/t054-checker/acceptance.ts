import assert from 'node:assert/strict';
import { createHmac, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { tenantScopedDb } from '../../../packages/db/src/tenant.ts';

const root = resolve('qa/evidence/t054-checker');
const statuses = ['pending', 'failed', 'delivered', 'dead'];
const now = 1791885600123;
const secret = 'independent-synthetic-t054';
const event = (id: string, tenantId = 'alpha') => ({id, type:'concern.flagged', occurredAt:'2026-10-13T00:00:00.000Z', tenantId, data:{sessionId:'s',studentId:'synthetic',turnId:'t',matched:['é'],message:'Hindi हिन्दी / quoted "value"'}});
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const original = {
  outbox: await readFile('packages/engine/src/webhooks/outbox.ts'),
  delivery: await readFile('packages/engine/src/webhooks/delivery.ts'),
  signing: await readFile('packages/engine/src/webhooks/signing.ts'),
};
const normalized = {
  outbox: original.outbox.toString().replace('from "@vc/db"', `from "${pathToFileURL(resolve('packages/db/src/tenant.ts')).href}"`),
  delivery: original.delivery.toString(), signing: original.signing.toString(),
};
const report: any[] = [];
let interrupted: string | undefined;
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { interrupted = signal; });
const checkInterrupt = () => { if (interrupted) throw new Error(`Interrupted by ${interrupted}; no PASS`); };

function rawDatabase() {
  const rows: any[] = []; let expected: string[] | undefined; const queries: any[] = []; const materialized: any[] = [];
  const matches = (row: any, filter: any) => Object.entries(filter).every(([key,v]: any) => v && typeof v === 'object' && '$in' in v ? v.$in.includes(row[key]) : row[key] === v);
  const col = {
    collectionName:'webhook_outbox',
    async insertOne(doc: any) { if (rows.some(r=>r._id === doc._id)) throw Object.assign(new Error('duplicate'),{code:11000}); rows.push(structuredClone(doc)); return {insertedId:doc._id}; },
    async findOne(filter: any) { const row=rows.find(r=>matches(r,filter)); return row ? structuredClone(row) : null; },
    async findOneAndUpdate(filter: any, patch: any) { const row=rows.find(r=>matches(r,filter)); if (!row) return null; Object.assign(row,patch.$set); return structuredClone(row); },
    find(filter: any) {
      queries.push(structuredClone(filter));
      if (expected !== undefined) assert.deepEqual(filter,{status:{$in:expected},tenantId:'alpha'},'C2 raw driver predicate precedes cursor creation');
      return {async toArray() {
        const result=rows.filter(r=>matches(r,filter));
        if (expected !== undefined) assert.ok(result.every(r=>r.tenantId==='alpha' && expected!.includes(r.status)),'C2 no terminal or foreign payload reaches materialization');
        materialized.push(result.map(r=>r._id)); return structuredClone(result);
      }};
    },
  };
  return {db:{databaseName:'synthetic',collection:()=>col},rows,queries,materialized,expect:(value: string[] | undefined)=>{expected=value;}};
}
async function seed(box: any, tenant='alpha') {
  for (const status of statuses) { const id=`id-${status}`; await box.enqueue({id,event:event(id,tenant),destinationUrl:'http://synthetic.invalid/never-used'}); await box.update(id,{status,attempts:7,lastStatus:418,lastError:'preserve'}); }
}
async function c1(m: any) {
  const driver=rawDatabase(); const boxes=[new m.InMemoryWebhookOutbox(),new m.MongoWebhookOutbox(tenantScopedDb(driver.db as any,'alpha'))];
  for (const box of boxes) {
    await seed(box); const all=await box.list(); const before=JSON.stringify(all); const rawBefore=JSON.stringify(driver.rows);
    assert.equal(all.length,4,'C1 unfiltered list contains every status');
    for (const selector of [[],['pending'],['failed'],['failed','pending'],statuses,['pending','pending'],['dead','delivered']]) {
      const selected=await box.list(selector);
      assert.deepEqual(selected,all.filter((r: any)=>selector.includes(r.status)),'C1 exact selected public records');
      assert.equal(JSON.stringify(await box.list()),before,'C1 no argument bytes unchanged');
      assert.equal(JSON.stringify(driver.rows),rawBefore,'C1 reads never rewrite raw rows');
    }
  }
}
async function c2(m: any) {
  const d=rawDatabase(); const a=new m.MongoWebhookOutbox(tenantScopedDb(d.db as any,'alpha')); const b=new m.MongoWebhookOutbox(tenantScopedDb(d.db as any,'beta'));
  await seed(a); await seed(b,'beta'); const before=JSON.stringify(d.rows);
  for (const selector of [[],['pending'],['failed'],['pending','failed'],statuses]) { d.expect(selector); const list=await a.list(selector); assert.equal(list.length,selector.length,'C2 exact raw cursor rows'); }
  assert.equal(JSON.stringify(d.rows),before,'C2 selector never changes either tenant');
  d.expect(['pending']); const sent:string[]=[];
  await m.drainWebhookOutbox(a,{secret,fetchImpl:async (_url:any,init:any)=>{sent.push(JSON.parse(init.body).id);return new Response('ok',{status:200});}});
  assert.deepEqual(sent,['id-pending'],'C2 built-in drain sees pending only'); assert.equal(d.queries.length,6,'C2 exactly one find per list or drain');
  assert.equal((await b.get('id-pending')).status,'pending','C2 tenant beta remains pending');
  for (const status of ['failed','dead','delivered']) assert.equal((await a.get(`id-${status}`)).status,status,'C2 terminal and unselected rows retained');
}
async function drainControl(m:any, legacy:boolean, includeFailed:boolean, mongo:boolean) {
  const d=rawDatabase(); const box=mongo ? new m.MongoWebhookOutbox(tenantScopedDb(d.db as any,'alpha')) : new m.InMemoryWebhookOutbox(); await seed(box);
  if (mongo) await seed(new m.MongoWebhookOutbox(tenantScopedDb(d.db as any,'beta')),'beta');
  const before=await box.list(); const rawBeta=JSON.stringify(d.rows.filter(r=>r.tenantId==='beta')); const selectors:any[]=[]; const requests:any[]=[];
  const adapter={enqueue:(x:any)=>box.enqueue(x),get:(id:string)=>box.get(id),update:(id:string,p:any)=>box.update(id,p),list:(s:any)=>{selectors.push(s); return legacy?box.list():box.list(s);}};
  const results=await m.drainWebhookOutbox(adapter,{secret,includeFailed,nowMs:()=>now,fetchImpl:async (url:any,init:any)=>{requests.push({url,...init});return new Response('ok',{status:202});}});
  const expected=includeFailed?['id-pending','id-failed']:['id-pending'];
  assert.deepEqual(selectors,[includeFailed?['pending','failed']:['pending']],'C3 single selected list call');
  assert.deepEqual(requests.map(r=>r.headers['X-VC-Event-Id']),expected,legacy?'C4 legacy adapter cannot deliver unselected records':'C3 requested eligible statuses delivered');
  assert.equal(results.length,expected.length); assert.ok(results.every((r:any)=>r.delivered));
  for (const r of requests) {
    const id=r.headers['X-VC-Event-Id']; assert.equal(r.body,JSON.stringify(event(id)),'stored event bytes'); assert.equal(r.headers['X-VC-Timestamp'],String(now));
    assert.equal(r.headers['X-VC-Signature'],createHmac('sha256',secret).update(`${now}.${r.body}`).digest('hex'),'independent HMAC oracle');
    assert.equal(r.url,'http://synthetic.invalid/never-used'); const after=await box.get(id); assert.equal(after.status,'delivered');assert.equal(after.attempts,1);assert.equal(after.lastStatus,202);assert.equal(after.createdAt,before.find((x:any)=>x.id===id).createdAt);assert.deepEqual(after.event,event(id));
  }
  for (const record of before.filter((r:any)=>!expected.includes(r.id))) assert.deepEqual(await box.get(record.id),record,'unselected row all bytes unchanged');
  assert.equal(JSON.stringify(d.rows.filter(r=>r.tenantId==='beta')),rawBeta,'C4 all foreign tenant bytes unchanged');
  return requests.map(r=>r.body);
}
async function c3(m:any) {
  for (const incl of [false,true]) await drainControl(m,false,incl,false);
  let count=0; assert.deepEqual(await m.drainWebhookOutbox(new m.InMemoryWebhookOutbox(),{secret,fetchImpl:async()=>{count++;throw new Error('empty must not fetch');}}),[]);assert.equal(count,0,'C3 empty backlog has no fetch');
  const box=new m.InMemoryWebhookOutbox();await box.enqueue({id:'retry',event:event('retry'),destinationUrl:'synthetic'}); const bodies:string[]=[];const sleeps:number[]=[];
  const result=await m.drainWebhookOutbox(box,{secret,nowMs:()=>now,maxAttempts:2,baseDelayMs:20,random:()=>0.5,sleep:async(ms:number)=>{sleeps.push(ms);},fetchImpl:async(_url:any,init:any)=>{bodies.push(init.body);return new Response('',{status:bodies.length===1?503:200});}});
  assert.deepEqual(result,[{delivered:true,attempts:2,status:200}]);assert.deepEqual(bodies,[JSON.stringify(event('retry')),JSON.stringify(event('retry'))]);assert.deepEqual(sleeps,[10]);assert.equal((await box.get('retry')).attempts,2);
  const rejection=new m.InMemoryWebhookOutbox();await rejection.enqueue({id:'reject',event:event('reject'),destinationUrl:'synthetic'});await m.drainWebhookOutbox(rejection,{secret,fetchImpl:async()=>new Response('',{status:400})});assert.equal((await rejection.get('reject')).status,'failed');
}
async function c4(m:any) {
  for (const incl of [false,true]) {
    const filtered=await drainControl(m,false,incl,false);
    assert.deepEqual(await drainControl(m,true,incl,false),filtered,'C4 filtered and legacy delivery bytes agree');
    assert.deepEqual(await drainControl(m,true,incl,true),filtered,'C4 legacy Mongo safety plus tenant parity');
  }
}
const instruments:any={C1:c1,C2:c2,C3:c3,C4:c4};
const mutants:any={
  C1:['outbox','.filter((record) => statuses === undefined || statuses.includes(record.status))',''],
  C2:['outbox','statuses === undefined ? {} : { status: { $in: [...statuses] } }','{}'],
  C3:['delivery','options.includeFailed ? ["pending", "failed"] : ["pending"]','options.includeFailed ? ["pending"] : ["pending", "failed"]'],
  C4:['delivery','if (!wanted.has(record.status)) continue;',''],
};
async function prepare(name:string, mutation?:any) {
  const dir=resolve(root,'copies',name);await mkdir(dir,{recursive:true});
  for (const [file,text] of Object.entries(normalized)) {
    let value=text;
    if (mutation && mutation[0]===file) { assert.equal(value.split(mutation[1]).length,2,'exact one semantic mutation target');value=value.replace(mutation[1],mutation[2]); }
    await writeFile(resolve(dir,`${file}.ts`),value);
  }
  return dir;
}
async function load(dir:string) { const a=await import(pathToFileURL(resolve(dir,'outbox.ts')).href);const b=await import(pathToFileURL(resolve(dir,'delivery.ts')).href);return {...a,...b}; }
for (const id of Object.keys(instruments)) {
  const green=await prepare(`${id}-green`);await instruments[id](await load(green)); report.push({id,phase:'baseline',result:'GREEN'});
  checkInterrupt();
  const red=await prepare(`${id}-red`,mutants[id]);let failure:any;
  try {
    try {await instruments[id](await load(red));}catch(err){failure=err;}
    checkInterrupt();
    assert.ok(failure instanceof assert.AssertionError,`${id} mutant must fail its own acceptance assertion, not setup/import`);
    assert.ok(failure.message.includes(id),`${id} mutant reached intended criterion assertion`);report.push({id,phase:'mutant',result:'RED',message:failure.message,stack:failure.stack});
  } finally {
    for (const [file,text] of Object.entries(normalized)) {await writeFile(resolve(red,`${file}.ts`),text);assert.equal(await readFile(resolve(red,`${file}.ts`),'utf8'),text,'restored source bytes exact');}
  }
  const restored=await prepare(`${id}-restored`);await instruments[id](await load(restored));report.push({id,phase:'restored',result:'GREEN'});
}
for (const file of ['outbox','delivery','signing'] as const) assert.equal(sha(await readFile(`packages/engine/src/webhooks/${file}.ts`)),sha(original[file]),'bound product source unchanged');
await writeFile(resolve(root,'acceptance-report.json'),JSON.stringify({finished:new Date().toISOString(),ownedNodePid:process.pid,mutants:4,controls:8,report,boundSourceHashes:Object.fromEntries(Object.entries(original).map(([k,v])=>[k,sha(v)])),importSetup:'Only isolated copies rewrite @vc/db to actual unchanged tenant.ts; no driver/product behavior stubbed.'},null,2));
console.log(JSON.stringify({acceptance:'PASS',criteria:4,baselineGreen:4,intendedRed:4,restoredGreen:4,ownedNodePid:process.pid}));
