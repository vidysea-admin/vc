import { readFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
const dir = process.argv[2];
const fixture = JSON.parse(readFileSync(process.argv[3], "utf8")).phrases;
const m = JSON.parse(readFileSync(dir + "/manifest.json", "utf8").replace(/^﻿/, ""));
let total = 0, bad = 0; const shas = new Set();
for (const c of m.clips) {
  const b = readFileSync(dir + "/" + c.file); total += b.length;
  const sha = createHash("sha256").update(b).digest("hex");
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let end = 0;
  for (let i = Math.floor(b.length/2)-1; i>=0; i--) if (Math.abs(v.getInt16(i*2,true))>500) { end = Math.ceil((i+1)/16); break; }
  const fx = fixture.find(p => p.id === c.id);
  const ok = sha===c.sha256 && Math.abs(c.durationMs-b.length/32)<=1 && Math.abs(c.speechEndMs-end)<=10 && fx && fx.lang===c.lang && fx.text===c.text && !shas.has(sha) && String.fromCharCode(...b.subarray(0,4))!=="RIFF";
  shas.add(sha); if(!ok){bad++; console.log("BAD", c.id, sha===c.sha256, c.speechEndMs, end);}
  console.log(c.id, c.lang, b.length, "speechEnd", c.speechEndMs, end, "gap-to-end", (b.length/32-end).toFixed(0));
}
console.log("clips", m.clips.length, "distinct", shas.size, "total bytes", total, "<5MB", total<5*1024*1024, "bad", bad, "gaps", JSON.stringify(m.gaps), "langs", ["en","hinglish","hi"].map(l=>l+":"+m.clips.filter(c=>c.lang===l).length).join(" "), "files in dir", readdirSync(dir).length);
