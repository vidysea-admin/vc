// g5w.js <graph.ts> : copy-only probe, re-insert rememberGraphCausal(owner, error) into the adapter wrapper catches (H-117 literal)
const fs=require("fs");const p=process.argv[2];let t=fs.readFileSync(p,"utf8");
const a=t.indexOf("adapter.put = async"),b=t.indexOf("const graph = builder.compile");
const from="catch (error) { owner.onExpectedExpiry(error); throw error; }",to="catch (error) { rememberGraphCausal(owner, error); owner.onExpectedExpiry(error); throw error; }";
const mid=t.slice(a,b);const n=mid.split(from).length-1;t=t.slice(0,a)+mid.split(from).join(to)+t.slice(b);fs.writeFileSync(p,t);console.log("replaced",n);
