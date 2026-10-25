// t046dump.js <per-fact.test.ts> : copy-only F7a. Before the T046 private assertion (the first `assert.ok(error instanceof ProviderAuthorizationRefusedError);`
// after "nestedInvokes++"), print ctor/name/message/cause/errors (recursive) of the rejection value.
const fs=require("fs");const p=process.argv[2];let t=fs.readFileSync(p,"utf8");
const anchor=t.indexOf("nestedInvokes++");const needle="assert.ok(error instanceof ProviderAuthorizationRefusedError);";const i=t.indexOf(needle,anchor);
if(anchor<0||i<0){console.log("anchor missing");process.exit(3);}
const line=t.slice(0,i).split("\n").length;
const dump=`{ const NL = String.fromCharCode(10); const seen = new Set<unknown>(); const out: unknown[] = []; const walk = (e: any, d: number) => { if (seen.has(e) || out.length > 60) return; seen.add(e); const fr = String(e?.stack ?? "").split(NL).filter((x: string) => x.includes("packages") && x.includes("src") && !x.includes("node_modules")).slice(0, 3).map((x: string) => x.trim().slice(x.trim().lastIndexOf("packages"))); out.push({ d, ctor: e?.constructor?.name, name: e?.name, msg: String(e?.message).slice(0, 120), frames: fr }); if (e && typeof e === "object") { if (e.cause !== undefined) walk(e.cause, d + 1); if (Array.isArray(e.errors)) for (const x of e.errors) walk(x, d + 1); } }; walk(error, 0); process.stderr.write("T046DUMP " + JSON.stringify(out) + NL); } `;
t=t.slice(0,i)+dump+t.slice(i);fs.writeFileSync(p,t);console.log("t046 dump inserted at line",line);
