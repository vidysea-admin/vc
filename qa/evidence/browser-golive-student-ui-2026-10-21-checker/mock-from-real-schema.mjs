import http from "node:http"; import fs from "node:fs"; import path from "node:path";
const root = process.argv[2], port = Number(process.argv[3]);
const reqs = [];
const send = (res, st, obj, h = {}) => { res.writeHead(st, { "content-type": "application/json", ...h }); res.end(JSON.stringify(obj)); };
const HELP = "If things feel heavy, Tele-MANAS on 14416 is free and open 24x7.";
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname === "/__log") return send(res, 200, reqs);
  if (u.pathname === "/v1/public/chat/turns") {
    if (req.method !== "POST") return send(res, 405, { error: "method_not_allowed", helpline: HELP }, { allow: "POST" });
    let raw = ""; req.on("data", c => raw += c); req.on("end", () => {
      let j; try { j = JSON.parse(raw); } catch { return send(res, 400, { error: "invalid_request", helpline: HELP }); }
      reqs.push({ text: (j&&j.text)||"", ct: req.headers["content-type"], keys: Object.keys(j || {}), len: (j.text || "").length });
      // strict schema: exactly {text: string 1..4000}
      if (!j || typeof j !== "object" || Array.isArray(j) || Object.keys(j).length !== 1 || typeof j.text !== "string" || j.text.length < 1 || j.text.length > 4000) return send(res, 400, { error: "invalid_request", helpline: HELP });
      const t = j.text;
      if (t.includes("T429")) return send(res, 429, { error: "rate_limited", helpline: HELP }, { "retry-after": "7" });
      if (t.includes("T500")) return send(res, 500, { error: "internal", helpline: HELP });
      if (t.includes("T502")) { res.writeHead(502, { "content-type": "text/html" }); return res.end("<html>Bad Gateway</html>"); }
      if (t.includes("T413")) return send(res, 413, { error: "body_too_large", helpline: HELP });
      if (t.includes("TDROP")) return req.socket.destroy();
      const delay = t.includes("TSLOW") ? 1500 : 0;
      setTimeout(() => {
        if (t.includes("TCRISISNOMSG")) return send(res, 200, { state: "escalated", claims: [], sources: [] });
        if (t.includes("TCRISIS")) return send(res, 200, { state: "escalated", message: "I am concerned about you. " + HELP, claims: [], sources: [] });
        if (t.includes("TNOANS")) return send(res, 200, { state: "no_sourced_answer", claims: [], sources: [] });
        if (t.includes("TSIGN")) return send(res, 200, { state: "sign_in_required", message: "Sign in to get personal advice.", claims: [], sources: [] });
        if (t.includes("TNOMSG")) return send(res, 200, { state: "ok", claims: [], sources: [] });
        if (t.includes("TXSS")) return send(res, 200, { state: "ok", message: "<img src=x onerror=\"window.__pwned=1\"><script>window.__pwned=2</script><b>bold</b>", claims: [], sources: [{ id: "s1", kind: "kb", title: "<img src=x onerror=\"window.__pwned=3\">" }, { id: "s2", kind: "kb" }] });
        if (t.includes("TBIG")) return send(res, 200, { state: "ok", message: "A".repeat(7000) + " " + "word".repeat(500), claims: [], sources: [] });
        return send(res, 200, { state: "ok", message: "Reply to: " + t.slice(0, 40), claims: [], sources: [{ id: "s1", kind: "kb", title: "Engineering careers guide" }] });
      }, delay);
    });
    return;
  }
  const f = path.join(root, u.pathname === "/" ? "index.html" : u.pathname);
  if (!f.startsWith(path.resolve(root)) || !fs.existsSync(f)) { res.writeHead(404); return res.end("nf"); }
  res.writeHead(200, { "content-type": types[path.extname(f)] || "application/octet-stream" }); res.end(fs.readFileSync(f));
}).listen(port, "127.0.0.1", () => console.log("up", port, process.pid));
