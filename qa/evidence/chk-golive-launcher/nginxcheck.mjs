import { readFileSync } from "node:fs";
const t = readFileSync(process.argv[2], "utf8");
const code = t.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");
const errs = [];
if ((code.match(/{/g) || []).length !== (code.match(/}/g) || []).length) errs.push("unbalanced braces");
for (const l of code.split("\n")) { const s = l.trim(); if (s && !s.endsWith(";") && !s.endsWith("{") && s !== "}") errs.push("no terminator: " + s); }
const m = code.match(/location \/v1\/ \{([\s\S]*?)\n    \}/);
if (!m) errs.push("no /v1/ location");
else {
  const b = m[1];
  if (!/proxy_pass http:\/\/127\.0\.0\.1:8080;/.test(b)) errs.push("proxy_pass not 127.0.0.1:8080");
  if (!/proxy_set_header X-Real-IP \$remote_addr;/.test(b)) errs.push("X-Real-IP not set from $remote_addr");
  if (/\$http_x_real_ip|\$http_x_forwarded_for|\$proxy_add_x_forwarded_for/.test(b)) errs.push("client-supplied header forwarded");
}
if (!/root \/opt\/vc\/apps\/student;/.test(code)) errs.push("static root missing");
console.log(errs.length ? "RED " + errs.join("; ") : "GREEN");
process.exit(errs.length ? 1 : 0);
