// render.js <log> : print DIAGT trees, T046DUMP and D055 lines from a TAP log
const L=require("fs").readFileSync(process.argv[2],"utf8").split(/\r?\n/);
for(const raw of L){const ln=raw.replace(/^# /,"");
 if(/^DIAGT\d/.test(ln)){const j=JSON.parse(ln.slice(ln.indexOf("{")));console.log(ln.split(" ")[0],j.msg,"roots",j.roots);
  for(const n of j.tree)console.log("  ".repeat(n.d+1)+(n.dup?"(dup "+n.ctor+")":[n.ctor,JSON.stringify(n.msg),n.receipt?"R":"-",n.accepted?"acc":"",n.born?"born":"",n.expected?"EXP":"unexp",n.forced?"F":"",n.frame].join(" ")));}
 else if(/^T046DUMP/.test(ln)){for(const n of JSON.parse(ln.slice(9)))console.log("T046 "+"  ".repeat(n.d)+[n.ctor,n.name,JSON.stringify(n.msg),(n.frames||[]).join(" <- ")].join(" | "));}
 else if(/^(D055|DIAGT-ERR)/.test(ln))console.log(ln.slice(0,500));
 else if(/^not ok|^ok /.test(ln))console.log(ln.slice(0,140));}
