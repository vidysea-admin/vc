"use strict";
// pc-voice V3 live-browser smoke: real Chromium, real widget + voice.js, FAKE WebSocket, fake mic device. Outside the repo tree.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("D:/vc/node_modules/.pnpm/playwright-core@1.63.0/node_modules/playwright-core");
const SRC = "D:/vc/.worktrees/pc-voice/apps/widget/src/";
const PORT = 5199;
const KEY = "vck_pub_demo_" + "B".repeat(43);
const hits = [];
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  hits.push(req.method + " " + u.pathname + " key=" + (req.headers["x-vc-key"] ? "yes" : "no"));
  if (u.pathname === "/demo") {
    res.writeHead(200, { "content-type": "text/html" });
    return res.end('<!doctype html><meta charset=utf-8><title>demo</title><h1>partner page</h1><script src="/widget/vc-widget.v1.js" data-vc-key="' + KEY + '" data-vc-voice="on" defer></script>');
  }
  if (u.pathname === "/widget/vc-widget.v1.js") { res.writeHead(200, { "content-type": "application/javascript" }); return res.end(fs.readFileSync(SRC + "vc-widget.js")); }
  if (u.pathname === "/widget/vc-widget-voice.v1.js") { res.writeHead(200, { "content-type": "application/javascript" }); return res.end(fs.readFileSync(SRC + "voice.js")); }
  if (req.method === "POST" && u.pathname === "/v1/public/voice/sessions") {
    res.writeHead(201, { "content-type": "application/json" });
    return res.end(JSON.stringify({ token: "t.o.k", wsUrl: "ws://127.0.0.1:" + PORT + "/v1/public/voice/stream", expiresAt: new Date(Date.now() + 60000).toISOString(), sessionMaxMinutes: 20, audio: { format: "pcm16", inputSampleRateHz: 16000, outputSampleRateHz: 24000 } }));
  }
  res.writeHead(404); res.end();
});
const FAKE_WS = () => {
  window.__sent = []; window.__protocols = null;
  class FakeWS {
    constructor(url, protocols) { this.url = url; this.protocols = protocols; this.readyState = 0; window.__ws = this; window.__protocols = protocols; setTimeout(() => { this.readyState = 1; this.onopen && this.onopen({}); }, 20); }
    send(d) { window.__sent.push(typeof d === "string" ? d : "bin:" + d.byteLength); }
    close(c) { this.readyState = 3; window.__closed = c; }
    say(o) { this.onmessage({ data: JSON.stringify(o) }); }
  }
  window.WebSocket = FakeWS;
};
const results = [];
const ok = (name, cond, extra) => { results.push([cond ? "PASS" : "FAIL", name, extra || ""]); };
(async () => {
  await new Promise((r) => server.listen(PORT, "127.0.0.1", r));
  // A: mic granted by the fake device
  let browser = await chromium.launch({ headless: true, args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });
  let ctx = await browser.newContext({ permissions: ["microphone"] });
  let page = await ctx.newPage();
  await page.addInitScript(FAKE_WS);
  await page.goto("http://127.0.0.1:" + PORT + "/demo");
  await page.waitForSelector("[data-vc-widget]", { state: "attached" });
  const sh = (sel) => page.locator("[data-vc-widget] >> " + sel);
  await page.locator("[data-vc-widget] >> .bubble").click();
  await page.waitForSelector("[data-vc-widget] >> .mic", { timeout: 5000 });
  ok("A1 mic button appears with data-vc-voice=on", true);
  await sh(".mic").click();
  await page.waitForFunction(() => window.__ws && window.__ws.readyState === 1, null, { timeout: 5000 });
  await page.waitForFunction(() => window.__sent.some((s) => s.startsWith("bin:")), null, { timeout: 8000 });
  const sent = await page.evaluate(() => window.__sent);
  ok("A2 start message first, then binary mic frames", sent[0] === JSON.stringify({ type: "start", threadId: "anonymous" }) && sent.some((s) => s.startsWith("bin:")), sent.slice(0, 3).join(" | "));
  ok("A3 subprotocols offered", JSON.stringify(await page.evaluate(() => window.__protocols)) === JSON.stringify(["vc-voice-v1", "vc-token.t.o.k"]));
  ok("A4 mic pressed state", (await sh(".mic").getAttribute("aria-pressed")) === "true");
  await page.evaluate(() => { window.__ws.say({ type: "transcript.partial", eventId: "1", role: "user", text: "which cour" }); window.__ws.say({ type: "transcript.final", eventId: "2", role: "user", text: "Which course suits me?" }); window.__ws.say({ type: "transcript.final", eventId: "3", role: "assistant", text: "<b>Computer Science</b> is a strong option." }); });
  let logText = await sh(".log").innerText();
  ok("A5 transcript and reply shown (markup stays text)", logText.includes("Which course suits me?") && logText.includes("<b>Computer Science</b> is a strong option."), JSON.stringify(logText.slice(-120)));
  await page.evaluate(() => { window.__ws.say({ type: "flag", eventId: "4", reason: "crisis_detected" }); window.__ws.say({ type: "state", eventId: "5", state: "escalated" }); });
  logText = await sh(".log").innerText();
  ok("A6 crisis message plus helpline, once", logText.includes("help is available right now") && logText.includes("14416") && logText.split("help is available right now").length === 2, "");
  await sh(".mic").click();
  await page.waitForFunction(() => window.__closed === 1000, null, { timeout: 3000 });
  const sent2 = await page.evaluate(() => window.__sent.filter((s) => !s.startsWith("bin:")));
  ok("A7 stop sends end and closes", sent2[sent2.length - 1] === JSON.stringify({ type: "end" }) && (await sh(".mic").getAttribute("aria-pressed")) === "false", sent2.join(" "));
  await page.screenshot({ path: path.join(__dirname, "voice-granted.png") });
  await browser.close();
  // B: mic denied (no fake-ui flag, no permission): the browser refuses
  browser = await chromium.launch({ headless: true, args: ["--use-fake-device-for-media-stream"] });
  ctx = await browser.newContext({ permissions: [] });
  page = await ctx.newPage();
  await page.addInitScript(FAKE_WS);
  const before = hits.filter((h) => h.includes("/voice/sessions")).length;
  await page.goto("http://127.0.0.1:" + PORT + "/demo");
  await page.waitForSelector("[data-vc-widget]", { state: "attached" });
  await page.locator("[data-vc-widget] >> .bubble").click();
  await page.waitForSelector("[data-vc-widget] >> .mic", { timeout: 5000 });
  await page.locator("[data-vc-widget] >> .mic").click();
  await page.waitForFunction(() => /keep typing/.test(document.querySelector("[data-vc-widget]").shadowRoot.querySelector(".log").innerText), null, { timeout: 8000 });
  logText = await page.locator("[data-vc-widget] >> .log").innerText();
  const after = hits.filter((h) => h.includes("/voice/sessions")).length;
  ok("B1 denied mic: text fallback note shown", /keep typing/.test(logText), JSON.stringify(logText.slice(-160)));
  ok("B2 denied mic: no session minted, no socket", after === before && (await page.evaluate(() => !window.__ws)), "mint hits " + (after - before));
  ok("B3 text input still usable", await page.locator("[data-vc-widget] >> textarea").isEnabled());
  await page.screenshot({ path: path.join(__dirname, "voice-denied.png") });
  await browser.close();
  server.close();
  for (const r of results) console.log(r.join("  "));
  console.log("TOTAL pass=" + results.filter((r) => r[0] === "PASS").length + " fail=" + results.filter((r) => r[0] === "FAIL").length);
  process.exit(results.some((r) => r[0] === "FAIL") ? 1 : 0);
})().catch((e) => { console.log("SMOKE ERROR", e.message); server.close(); process.exit(2); });
