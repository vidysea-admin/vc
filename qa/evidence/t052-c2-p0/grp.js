const L=require("fs").readFileSync(process.argv[2],"utf8").split(/\r?\n/);
let cur=null,got=false;const g={};
for(const l of L){let m=/^not ok (\d+) - /.exec(l); if(m){cur=m[1];got=false;continue}
 if(/^ok \d+ - /.test(l)){cur=null;continue}
 if(cur&&!got&&!l.includes("location:")){const s=/tests[^a-z]([a-z-]+)\.test\.ts:(\d+)/.exec(l); if(s){(g[s[1]+":"+s[2]]??=[]).push(cur);got=true}}}
for(const [k,v] of Object.entries(g)) console.log(k.padEnd(28),v.join(","));
