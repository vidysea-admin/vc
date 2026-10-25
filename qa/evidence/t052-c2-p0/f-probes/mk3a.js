// mk3a.js <base erasure.ts> <outdir> : build design 3a (review-delta-3 B2) and mutants M39/M43/M44 of it, plus AR-4' (B3) test text
const fs=require("fs");const [src,out]=process.argv.slice(2);const raw=fs.readFileSync(src,"utf8");const cr=raw.includes("\r\n");let t=raw.replace(/\r\n/g,"\n");
const rep=(s,a,b)=>{const n=s.split(a).length-1;if(n!==1)throw new Error("anchor x"+n+": "+a.slice(0,80));return s.replace(a,()=>b);};
const save=(name,s)=>fs.writeFileSync(out+"/"+name,cr?s.replace(/\n/g,"\r\n"):s);
// 1. field
t=rep(t,"  readonly #expire: () => FencedWriterDeadlineError;\n","  readonly #expire: () => FencedWriterDeadlineError;\n  // review-delta-3 3a: the ONE pending expiry E, minted lazily (birth registered once) and shared by the\n  // op()-declared early abort and the timer's fire, so signal.reason === the E run() rejects with.\n  readonly #mint: () => FencedWriterDeadlineError;\n");
// 2. expire body
t=rep(t,`    this.#expire = () => {
      const expired = new FencedWriterDeadlineError();
      const birth = WriterDeadline.inspectCausal(expired)!;
      causalApply(causalBirthSet, WriterDeadline.#expiryConstructions, [
        expired, causalFreeze([birth]),
      ]);
      this.controller.abort(expired);
      fire(expired);
      return expired;
    };`,`    let pending: FencedWriterDeadlineError | undefined;
    this.#mint = () => {
      if (pending) return pending;
      const expired = new FencedWriterDeadlineError();
      const birth = WriterDeadline.inspectCausal(expired)!;
      causalApply(causalBirthSet, WriterDeadline.#expiryConstructions, [
        expired, causalFreeze([birth]),
      ]);
      pending = expired;
      return expired;
    };
    this.#expire = () => {
      const expired = this.#mint();
      this.controller.abort(expired); // a no-op when op() already aborted with this same E
      fire(expired);
      return expired;
    };`);
// 3. op branch
const opOld=`      if (!this.controller.signal.aborted) {
        // plan-v2 3.9: expiry declared here, before the timer ran. Abort now, with the E thrown.
        clearTimeout(this.timer);
        throw this.#expire();
      }`;
const op3a=`      if (!this.controller.signal.aborted) {
        // review-delta-3 3a: expiry declared here, before the timer ran. Abort NOW with the pending E; the
        // overdue timer fires that same E on its macro-task. op() itself throws a fresh E (below).
        this.controller.abort(this.#mint());
      }`;
const a3=rep(t,opOld,op3a);save("erasure-3a.ts",a3);
// M39: drop the op-path abort
save("erasure-3a-m39.ts",rep(a3,"        this.controller.abort(this.#mint());\n","        // M39: op-path abort removed\n"));
// M43: op path fires (option 1a ordering)
save("erasure-3a-m43.ts",rep(a3,"        this.controller.abort(this.#mint());\n","        this.#expire(); // M43: op path fires\n"));
// M44: abort with a minted E that is not the one the timer fires
save("erasure-3a-m44.ts",rep(a3,"        this.controller.abort(this.#mint());\n",`        { const other = new FencedWriterDeadlineError(); causalApply(causalBirthSet, WriterDeadline.#expiryConstructions, [other, causalFreeze([WriterDeadline.inspectCausal(other)!])]); this.controller.abort(other); } // M44
`));
console.log("built, CRLF="+cr);
