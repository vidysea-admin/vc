// Evidence only (golive-harden C1): static check of infra/ubuntu/nginx-vc.conf. Usage: node nginxcheck.mjs [conf-path]
import { readFileSync } from "node:fs";
const path = process.argv[2] ?? "infra/ubuntu/nginx-vc.conf";
const live = readFileSync(path, "utf8").split(/\r?\n/).filter((l) => !/^\s*#/.test(l)).join("\n"); // comments dropped
// split top-level location blocks of the (single) server
const blocks = [...live.matchAll(/location\s+(=\s+|~\s+)?(\S+)\s*\{([^}]*)\}/g)].map((m) => ({ mod: (m[1] ?? "").trim(), p: m[2], body: m[3] }));
const fails = [];
const chk = (ok, msg) => { if (!ok) fails.push(msg); };
const chat = blocks.find((b) => b.mod === "=" && b.p === "/v1/public/chat/turns");
chk(chat, "no `location = /v1/public/chat/turns`");
chk(chat && /proxy_pass\s+http:\/\/127\.0\.0\.1:8080;/.test(chat.body), "chat location does not proxy_pass to 127.0.0.1:8080");
chk(chat && /proxy_set_header\s+X-Real-IP\s+\$remote_addr;/.test(chat.body), "chat location does not SET X-Real-IP from $remote_addr");
chk(chat && /proxy_read_timeout\s+120s;/.test(chat.body), "chat location proxy_read_timeout is not 120s");
chk(chat && /limit_req\s+zone=vcchat\s+burst=10\s+nodelay;/.test(chat.body), "chat location lacks `limit_req zone=vcchat burst=10 nodelay;`");
const v1 = blocks.find((b) => b.mod === "" && b.p === "/v1/");
chk(v1 && /return\s+404;/.test(v1.body) && !/proxy_pass/.test(v1.body), "`location /v1/` is not a bare `return 404`");
for (const b of blocks) if (b.mod !== "=" && b.p !== "/" && /proxy_pass/.test(b.body) && !/^~/.test(b.mod)) fails.push(`unexpected proxying location ${b.mod} ${b.p}`);
chk(!blocks.some((b) => /proxy_pass/.test(b.body) && b.p === "/v1/"), "/v1/ still proxies");
const raw = readFileSync(path, "utf8");
chk(/#\s*location\s+~\s+\^\/v1\/students\/\[\^\/\]\+\/chat\(\/\|\$\)\s*\{/.test(raw), "commented student chat block missing");
console.log(fails.length ? "FAIL\n" + fails.join("\n") : "PASS nginx static check (" + blocks.length + " live locations)");
process.exit(fails.length ? 1 : 0);
