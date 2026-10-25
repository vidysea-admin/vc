const fs=require("fs"),cr=require("crypto"),cp=require("child_process");
const s=fs.readFileSync("qa/.wave.json","utf8"); let w;
try{w=JSON.parse(s)}catch(e){const m=/position (\d+)/.exec(e.message); w=JSON.parse(s.slice(0,+m[1]))}
const H=b=>cr.createHash("sha256").update(b).digest("hex").toUpperCase();
const g=a=>cp.execFileSync("git",a,{maxBuffer:1<<28});
const targets=process.argv.slice(2);
for (const {path,sha256} of w.currentCandidate.inputs){
  if(!targets.includes(path)) continue;
  const commits=g(["log","--all","--format=%H %ad","--date=iso","--",path]).toString().trim().split("\n").filter(Boolean);
  const seen=new Map(); let hit=null;
  for(const line of commits){ const c=line.split(" ")[0];
    let blob; try{blob=g(["rev-parse",c+":"+path]).toString().trim()}catch{continue}
    if(seen.has(blob)) continue; seen.set(blob,1);
    const lf=g(["cat-file","-p",blob]).toString("latin1").replace(/\r\n/g,"\n");
    const f=[H(Buffer.from(lf,"latin1")),H(Buffer.from(lf.replace(/\n/g,"\r\n"),"latin1"))];
    if(f.includes(sha256)){hit=line;break}
  }
  console.log(path, "commits="+commits.length, "blobs="+seen.size, hit?("MATCH "+hit):"NO MATCH in any commit");
}
