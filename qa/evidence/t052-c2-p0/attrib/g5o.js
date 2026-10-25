// g5o.js <checkpointer.test.ts> : copy-only, align the source-text oracle call string with the g5w insert
const fs=require("fs");const p=process.argv[2];let t=fs.readFileSync(p,"utf8");
const from='catch (error) { owner.onExpectedExpiry(error); throw error; } })())";',to='catch (error) { rememberGraphCausal(owner, error); owner.onExpectedExpiry(error); throw error; } })())";';
const n=t.split(from).length-1;t=t.split(from).join(to);fs.writeFileSync(p,t);console.log("oracle replaced",n);
