import { test } from "node:test";
import assert from "node:assert/strict";
const R = "file:///D:/vc/.worktrees/vc-completion/packages/db/";
const I: any = await import(R + "src/index.js");
const { INDEX_PLAN } = await import(R + "scripts/db-init.js");
const { confirmTwiceAndApprove } = await import(R + "src/testing.js");
const { createFakeDb } = await import(R + "tests/fakes.js");
const { COLLECTION_NAMES } = I;
function setup(){ const {db,fakeDb}=createFakeDb(); for(const s of INDEX_PLAN){ if(!s.unique)continue; fakeDb.collection(s.collection).declareUniqueIndex(Object.keys(s.keys),{partialFilterExpression:s.partialFilterExpression}); } return {db,fakeDb,a:I.tenantScopedDb(db,"tenantA")}; }
const base={studentId:"stu-1",threadId:"th",turnId:"t1",channel:"text",text:"hello",requestHash:"h1"};
async function thread(a:any){ await I.createChatThread(a,{studentId:"stu-1",threadId:"th",textStored:true}); }
const residue=(fakeDb:any)=>Object.values(COLLECTION_NAMES).flatMap((n:any)=>{try{return fakeDb.collection(n).all().filter((d:any)=>d.studentId==="stu-1"||d.data?.studentId==="stu-1").map((d:any)=>n+":"+d._id)}catch{return[]}});

test("H1 parallel claims: exactly one claimed", async()=>{ const {a}=setup(); await thread(a);
  const r=await Promise.all([1,2,3,4,5].map(()=>I.claimChatTurn(a,base)));
  assert.deepEqual(r.map((x:any)=>x.kind).sort(),["claimed","in_progress","in_progress","in_progress","in_progress"]); });
test("H2 replay + conflict + takeover", async()=>{ const {a,fakeDb}=setup(); await thread(a);
  const c:any=await I.claimChatTurn(a,base);
  await assert.rejects(I.claimChatTurn(a,{...base,requestHash:"other"}),/ChatTurnConflict/);
  await I.completeChatTurn(a,{studentId:"stu-1",threadId:"th",turnId:"t1",leaseToken:c.leaseToken,channel:"text",assistantText:"ans",response:{state:"ok",n:1}});
  const r1:any=await I.claimChatTurn(a,base), r2:any=await I.claimChatTurn(a,base);
  assert.equal(r1.kind,"replay"); assert.deepEqual(r1.response,{state:"ok",n:1}); assert.deepEqual(r2.response,r1.response);
  assert.equal(fakeDb.collection(COLLECTION_NAMES.chat_turns).all().length,2);
  // stale lease holder cannot complete twice
  await assert.rejects(I.completeChatTurn(a,{studentId:"stu-1",threadId:"th",turnId:"t1",leaseToken:c.leaseToken,channel:"text",assistantText:"X",response:{x:1}}),/LeaseLost/);
  assert.deepEqual((await I.claimChatTurn(a,base)).response,{state:"ok",n:1}); });
test("H3 crashed attempt: lease expiry takeover, old holder loses, no dup rows", async()=>{ const {a,fakeDb}=setup(); await thread(a);
  const t0=new Date("2026-01-01T00:00:00Z");
  const c1:any=await I.claimChatTurn(a,base,{now:t0,leaseMs:1000});
  const mid:any=await I.claimChatTurn(a,base,{now:new Date(t0.getTime()+500)}); assert.equal(mid.kind,"in_progress");
  const c2:any=await I.claimChatTurn(a,base,{now:new Date(t0.getTime()+5000)}); assert.equal(c2.kind,"claimed");
  await assert.rejects(I.completeChatTurn(a,{studentId:"stu-1",threadId:"th",turnId:"t1",leaseToken:c1.leaseToken,channel:"text",assistantText:"old",response:{}}),/LeaseLost/);
  await I.completeChatTurn(a,{studentId:"stu-1",threadId:"th",turnId:"t1",leaseToken:c2.leaseToken,channel:"text",assistantText:"new",response:{v:2}});
  assert.equal((await I.claimChatTurn(a,base)).response.v,2); assert.equal(fakeDb.collection(COLLECTION_NAMES.chat_turns).all().length,2); });
test("H4 erase landing between final validate and marker upsert: residue?", async()=>{ const {a,fakeDb}=setup(); await thread(a);
  const c:any=await I.claimChatTurn(a,base);
  const usage=fakeDb.collection(COLLECTION_NAMES.student_usage), orig=usage.updateOne.bind(usage); let fired=false;
  usage.updateOne=(async(...args:any[])=>{ if(!fired && String(args[0]._id).includes("memory:")){ fired=true;
      const {requestId}=await I.requestErasure(a,{studentId:"stu-1",requestedBy:"c",reason:"student_request"}); await confirmTwiceAndApprove(a,{requestId,confirmedBy:"admin-2"}); const o=await I.executeErasure(a,requestId); assert.equal(o.status,"completed"); }
    return (orig as any)(...args); }) as any;
  let err:any; try{ await I.completeChatTurn(a,{studentId:"stu-1",threadId:"th",turnId:"t1",leaseToken:c.leaseToken,channel:"text",assistantText:"ans",response:{ok:1},memorySnapshot:{revision:"",policy:"p"}}); }catch(e){err=e}
  console.log("H4 err:",err?.name, err?.message?.slice(0,80), "fired",fired, "RESIDUE:",JSON.stringify(residue(fakeDb))); });
test("H5 erase landing right before the final release CAS", async()=>{ const {a,fakeDb}=setup(); await thread(a);
  const c:any=await I.claimChatTurn(a,base);
  const turns=fakeDb.collection(COLLECTION_NAMES.chat_turns), orig=turns.updateOne.bind(turns); let fired=false;
  turns.updateOne=(async(...args:any[])=>{ if(!fired && args[1]?.$set?.publication==="published"){ fired=true;
      const {requestId}=await I.requestErasure(a,{studentId:"stu-1",requestedBy:"c",reason:"student_request"}); await confirmTwiceAndApprove(a,{requestId,confirmedBy:"admin-2"}); await I.executeErasure(a,requestId); }
    return (orig as any)(...args); }) as any;
  let err:any; try{ await I.completeChatTurn(a,{studentId:"stu-1",threadId:"th",turnId:"t1",leaseToken:c.leaseToken,channel:"text",assistantText:"ans",response:{ok:1}}); }catch(e){err=e}
  console.log("H5 err:",err?.name,"fired",fired,"RESIDUE:",JSON.stringify(residue(fakeDb))); assert.deepEqual(residue(fakeDb).filter((x:string)=>x.startsWith("chat_")),[]); });
test("H6 proposal discarded (thread flips to no-text) with no prior decision: cutoff state", async()=>{ const {a}=setup(); await thread(a);
  await I.createChatThread(a,{studentId:"stu-1",threadId:"th2",textStored:true});
  const c:any=await I.claimChatTurn(a,base); await I.completeChatTurn(a,{studentId:"stu-1",threadId:"th",turnId:"t1",leaseToken:c.leaseToken,channel:"text",assistantText:"ans",response:{ok:1}});
  assert.equal((await I.listChatContext(a,{studentId:"stu-1",threadId:"th"})).length,2);
  const r=await I.proposeProfileFact(a,{studentId:"stu-1",key:"interest",value:"x",threadId:"th2",turnId:"z"}); assert.ok(r);
  const m=await import(R+"src/profile-facts.js");
  // force discard path: expectedRevision stale-by-hook is impossible w/o decision; call with thread already no-text mid-flight
  const facts=(createFakeDb as any); void facts; });
