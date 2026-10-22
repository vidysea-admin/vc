"use strict";
// Local stub for the demo and the browser smoke. NOT the real API: canned replies keyed on words in the message.
//   node apps/widget/tests/stub-server.js [port]     (default 5174; never use 8080, 8787 or 3399)
// Serves demo.html, /widget/vc-widget.js and /widget/vc-widget.v1.js (the same file), the key-mode route
// POST /v1/public/chat/turns (needs X-VC-Key: vck_demo_key) and the proxy-mode route POST /api/vc (no key).
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const KEY = "vck_demo_key";

function reply(text) {
  const t = text.toLowerCase();
  if (t.includes("revoke")) return { status: 401, body: { error: "unauthorized" } };
  if (t.includes("ratelimit")) return { status: 429, headers: { "retry-after": "3" }, body: { error: "rate_limited", helpline: "Tele-MANAS 14416" } };
  if (t.includes("boom")) return { status: 500, body: { error: "internal", helpline: "Tele-MANAS 14416 (24x7) · Emergency 112" } };
  if (t.includes("crisis")) return { status: 200, body: { state: "escalated", message: "I am really sorry you are feeling this way. You are not alone.", claims: [], sources: [] } };
  if (t.includes("nosource")) {
    return { status: 200, body: { state: "no_sourced_answer", message: "I could not find a sourced answer to that.", claims: [], sources: [{ id: "w1", kind: "web", title: "Example govt page", url: "https://example.org/page" }, { id: "w2", kind: "web", title: "Bad link", url: "javascript:alert(document.domain)" }] } };
  }
  if (t.includes("xss")) return { status: 200, body: { state: "ok", message: "<img src=x onerror=\"window.__xss=1\"><b>bold</b>", claims: [{ text: "<script>window.__xss=2</script>", kind: "fact", sourceIds: [], status: "unverified" }], sources: [{ id: "s", kind: "toc", title: "<i>title</i>", url: undefined }] } };
  return {
    status: 200,
    delay: t.includes("slow") ? 1500 : 150,
    body: { state: "ok", message: "Computer Science is a strong option if you like problem solving. Typical first-year fees vary by college.", claims: [{ text: "Fees vary by college", kind: "fact", sourceIds: ["a"], status: "verified" }, { text: "Placement rates differ by year", kind: "fact", sourceIds: [], status: "unverified" }], sources: [{ id: "a", kind: "toc", title: "Course guide" }, { id: "w", kind: "web", title: "AICTE", url: "https://www.aicte-india.org/" }] },
  };
}

function start(port) {
  const log = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    if (req.method === "GET" && (url.pathname === "/demo.html" || url.pathname === "/")) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(fs.readFileSync(path.join(ROOT, "demo.html")));
    }
    if (req.method === "GET" && /^\/widget\/vc-widget(\.v1)?\.js$/.test(url.pathname)) {
      res.writeHead(200, { "content-type": "application/javascript; charset=utf-8" });
      return res.end(fs.readFileSync(path.join(ROOT, "src", "vc-widget.js")));
    }
    if (req.method === "GET" && url.pathname === "/__log") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify(log));
    }
    if (req.method === "POST" && (url.pathname === "/v1/public/chat/turns" || url.pathname === "/api/vc")) {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        let text = "";
        try { text = String(JSON.parse(raw).text || ""); } catch (e) { /* bad body */ }
        const key = req.headers["x-vc-key"];
        log.push({ path: url.pathname, key: key === undefined ? null : key, cookie: req.headers.cookie ? "present" : null, body: raw });
        const proxy = url.pathname === "/api/vc";
        const r = !proxy && key !== KEY ? { status: 401, body: { error: "unauthorized" } } : reply(text);
        setTimeout(() => {
          res.writeHead(r.status, Object.assign({ "content-type": "application/json" }, r.headers || {}));
          res.end(JSON.stringify(r.body));
        }, r.delay || 0);
      });
      return;
    }
    res.writeHead(404);
    res.end();
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

module.exports = { start, KEY };

if (require.main === module) {
  const port = Number(process.argv[2] || 5174);
  start(port).then(() => console.log("vc-widget stub listening on http://127.0.0.1:" + port + "/demo.html (pid " + process.pid + ")"));
}
