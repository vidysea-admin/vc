// tapx.js <log> : per not-ok row -> number | name | location | error head | first src frames
const fs=require("fs");const L=fs.readFileSync(process.argv[2],"utf8").split(/\r?\n/);
for(let i=0;i<L.length;i++){const m=L[i].match(/^not ok (\d+) - (.*)$/);if(!m)continue;let loc="",err=[],frames=[],j=i+1,inErr=false;
for(;j<L.length&&!/^(ok|not ok) \d+ /.test(L[j])&&!/^# Subtest/.test(L[j]);j++){const t=L[j].trim();
if(t.startsWith("location:"))loc=t.slice(9).trim();
if(/^error:/.test(t)){inErr=true;const v=t.slice(6).trim();if(v&&v!=="|-")err.push(v);continue;}
if(inErr){if(/^(code|name|expected|actual|operator|stack|failureType):/.test(t))inErr=false;else if(err.length<3&&t)err.push(t);}
if(/packages[\/](db|engine)[\/](src|tests)/.test(t)&&frames.length<4)frames.push(t.split("t052-c2").pop());}
console.log(["#"+m[1],m[2],loc.replace(/.*packages/,"packages"),err.join(" / ").slice(0,300),frames.join(" <- ").slice(0,400)].join("\n   "));}
