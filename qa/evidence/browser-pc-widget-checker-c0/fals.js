const fs=require("fs"),cp=require("child_process"),path=require("path");
const SRC="D:/vc/.worktrees/pc-widget/apps/widget", ROOT=process.argv[2]+"/fals";
const rows=[
 ["W1","tests/config.test.js","title and colour have defaults","src/vc-widget.js",'if (!/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color)) color = DEFAULT_COLOR;','if (false) color = DEFAULT_COLOR;'],
 ["W2","tests/request.test.js","a reply is normalised","src/vc-widget.js",'unverified: c.status === "unverified"','unverified: false'],
 ["W3","tests/request.test.js","401 -> unavailable","src/vc-widget.js",'if (res.status === 401 || res.status === 403) return { kind: "unavailable" };','if (res.status === 403) return { kind: "unavailable" };'],
 ["W4","tests/hosting.test.js","nosniff on both files","nginx-widget.conf.snippet",'add_header Cache-Control "public, max-age=300" always;\n    add_header X-Content-Type-Options "nosniff" always;','add_header Cache-Control "public, max-age=300" always;'],
];
for(const [id,test,pat,file,from,to] of rows){
  const d=path.join(ROOT,id); fs.cpSync(SRC,d,{recursive:true});
  const run=()=>cp.spawnSync("node",["--test","--test-name-pattern="+pat,test],{cwd:d,encoding:"utf8"});
  const g=run(); const gp=(g.stdout.match(/ℹ pass (\d+)/)||[])[1], gf=(g.stdout.match(/ℹ fail (\d+)/)||[])[1];
  const f=path.join(d,file); let s=fs.readFileSync(f,"utf8"); if(!s.includes(from)){console.log(id,"MUTATION TARGET NOT FOUND");continue;}
  fs.writeFileSync(f,s.replace(from,to));
  const r=run(); const rp=(r.stdout.match(/ℹ pass (\d+)/)||[])[1], rf=(r.stdout.match(/ℹ fail (\d+)/)||[])[1];
  const names=[...r.stdout.matchAll(/✖ ([^\n(]+)/g)].map(m=>m[1].trim()).filter((v,i,a)=>a.indexOf(v)===i);
  console.log(id,"green-before pass="+gp+" fail="+gf,"| red-after pass="+rp+" fail="+rf,"| failing:",names.slice(0,2).join(" ; "));
}
