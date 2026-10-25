// ar4p.js <erasure.test.ts> : AR-4' exactly per review-delta-3 B3 (lines 2257-2258 + the throwIfAborted relation), copy only
const fs=require("fs");const p=process.argv[2];const raw=fs.readFileSync(p,"utf8");const cr=raw.includes("\r\n");let t=raw.replace(/\r\n/g,"\n");
const a=`      assert.strictEqual(ar4.signal.reason, opError, "AR-4: signal.reason is the E op() threw");
      assert.strictEqual(await ar4.run(new Promise<never>(() => undefined)).catch((e: unknown) => e), opError, "AR-4: run() rejects with the same E");
`;
const b=`      assert.ok(ar4.signal.reason instanceof FencedWriterDeadlineError && WriterDeadline.expiryConstruction(ar4.signal.reason) !== undefined, "AR-4: signal.reason is a born FWD"); assert.notStrictEqual(ar4.signal.reason, opError, "AR-4: op throws a fresh E, the abort reason is the E the timer will reject with");
      assert.strictEqual(await ar4.run(new Promise<never>(() => undefined)).catch((e: unknown) => e), ar4.signal.reason, "AR-4: run() rejects with signal.reason (the overdue timer's E)");
      { let thrown: unknown; try { ar4.signal.throwIfAborted(); } catch (e) { thrown = e; } assert.strictEqual(thrown, ar4.signal.reason, "AR-4: throwIfAborted() throws signal.reason"); }
`;
if(t.split(a).length!==2)throw new Error("AR-4 anchor");t=t.replace(a,()=>b);fs.writeFileSync(p,cr?t.replace(/\n/g,"\r\n"):t);console.log("AR-4' applied, CRLF="+cr);
