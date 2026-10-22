"use strict";
// pc-hardening-2 browser validation (extends qa/evidence/browser-pc-hardening-2026-10-22/smoke.cjs): real headless Chromium, real widget vc-widget.js + voice.js,
// API intercepted with page.route (no API server, no real key), WebSocket faked with page.addInitScript for the voice_busy error-frame scenario.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("D:/vc/node_modules/.pnpm/playwright-core@1.63.0/node_modules/playwright-core");
const SRC = "D:/vc/.worktrees/pc-hardening-2/apps/widget/src/";
const OUT = __dirname;
const PORT = 5191;
const BASE = "http://127.0.0.1:" + PORT;
const KEY = "vck_pub_" + "Zq7" + "k2Xw9P".repeat(6);
const server = http.createServer((req, res) => {
  const u = new URL(req.url, BASE);
  if (u.pathname === "/host") {
    const lang = u.searchParams.get("lang") || "en";
    res.writeHead(200, { "content-type": "text/html" });
    return res.end('<!doctype html><html lang="' + lang + '"><meta charset=utf-8><title>host</title><h1>partner page</h1><script src="/widget/vc-widget.v1.js" data-vc-key="' + KEY + '" data-vc-voice="on" defer></script></html>');
  }
  if (u.pathname === "/widget/vc-widget.v1.js") { res.writeHead(200, { "content-type": "application/javascript" }); return res.end(fs.readFileSync(SRC + "vc-widget.js")); }
  if (u.pathname === "/widget/vc-widget-voice.v1.js") { res.writeHead(200, { "content-type": "application/javascript" }); return res.end(fs.readFileSync(SRC + "voice.js")); }
  res.writeHead(404); res.end();
});
const pages = [];
const checks = [];
const ok = (name, cond, extra) => { checks.push({ name, pass: !!cond, detail: extra === undefined ? null : extra }); console.log((cond ? "PASS " : "FAIL ") + name + " :: " + JSON.stringify(extra)); };
async function scenario(browser, label, lang, routeFn, act, shot, initScript) {
  const ctx = await browser.newContext({ permissions: ["microphone"], viewport: { width: 420, height: 720 } });
  const page = await ctx.newPage();
  const consoleErrors = [], messages = [], apiCalls = [];
  page.on("console", (m) => { messages.push(m.type() + ": " + m.text()); if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => { const t = "pageerror: " + e.message; consoleErrors.push(t); messages.push(t); });
  if (initScript) await page.addInitScript(initScript);
  await page.route("**/v1/public/**", async (route) => {
    const r = route.request();
    apiCalls.push(r.method() + " " + new URL(r.url()).pathname + " x-vc-key=" + (r.headers()["x-vc-key"] ? "yes" : "no"));
    await routeFn(route, r);
  });
  const url = BASE + "/host?lang=" + encodeURIComponent(lang);
  await page.goto(url);
  await page.waitForSelector("[data-vc-widget]", { state: "attached" });
  await page.locator("[data-vc-widget] >> .bubble").click();
  const out = await act(page);
  await page.screenshot({ path: path.join(OUT, shot) });
  const visibleText = await page.locator("[data-vc-widget] >> .panel").innerText();
  const wsLog = await page.evaluate(() => window.__fakeWsLog || null);
  pages.push({ url, label, htmlLang: await page.evaluate(() => document.documentElement.lang), wsLog, consoleErrors, messages, apiCalls, visibleText, screenshot: shot });
  await ctx.close();
  return { out, visibleText, consoleErrors, apiCalls };
}
const mint = (status, body, ra) => (route) => route.fulfill({ status, contentType: "application/json", headers: ra ? { "Retry-After": ra } : {}, body: JSON.stringify(body) });
const clickMic = async (page) => {
  await page.waitForSelector("[data-vc-widget] >> .mic", { timeout: 5000 });
  await page.locator("[data-vc-widget] >> .mic").click();
  await page.waitForSelector("[data-vc-widget] >> :is(.m.note, .m.err)", { timeout: 8000 });
  return await page.evaluate(() => Array.from(document.querySelector("[data-vc-widget]").shadowRoot.querySelectorAll(".m.note, .m.err")).map((e) => e.innerText || e.textContent));
};
// Fake WebSocket: on construct it opens, then sends a {"type":"error","code":"voice_busy"} frame, then closes with 1008 (what the server does when a session cap is hit after upgrade).
const fakeWs = () => {
  window.__fakeWsLog = [];
  class FakeWS {
    constructor(url, protocols) {
      this.url = url; this.protocols = protocols; this.readyState = 0; this.binaryType = "blob";
      window.__fakeWsLog.push("construct " + url + " protocols=" + JSON.stringify((protocols || []).map((p) => String(p).startsWith("vc-token.") ? "vc-token.<redacted>" : p)));
      setTimeout(() => {
        this.readyState = 1;
        if (this.onopen) this.onopen({});
        setTimeout(() => {
          window.__fakeWsLog.push("error frame voice_busy");
          if (this.onmessage) this.onmessage({ data: JSON.stringify({ type: "error", code: "voice_busy", message: "too many active sessions" }) });
          setTimeout(() => { this.readyState = 3; window.__fakeWsLog.push("close 1008"); if (this.onclose) this.onclose({ code: 1008, reason: "voice_busy", wasClean: true }); }, 30);
        }, 30);
      }, 20);
    }
    send() { window.__fakeWsLog.push("send"); }
    close() { this.readyState = 3; }
  }
  FakeWS.CONNECTING = 0; FakeWS.OPEN = 1; FakeWS.CLOSING = 2; FakeWS.CLOSED = 3;
  window.WebSocket = FakeWS;
};
(async () => {
  await new Promise((r) => server.listen(PORT, "127.0.0.1", r));
  const browser = await chromium.launch({ headless: true, args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
  const EN = "Voice is busy right now. Please try again shortly, or keep typing here.";
  const HI = "वॉइस अभी व्यस्त है। कृपया थोड़ी देर में फिर कोशिश करें, या यहीं टाइप करें।";
  const HELP_EN = "Tele-MANAS 14416 (24x7) · Emergency 112";
  const HELP_HI = "Tele-MANAS: 14416, मुफ़्त, 24x7 · 112 पर फ़ोन करें";
  const OFF_EN = "Voice is not available here. Please type your question.";
  const OFF_HI = "यहाँ वॉइस उपलब्ध नहीं है। कृपया अपना सवाल टाइप करें।";
  // one note element holds "<note>\n<helpline>": note text must be followed by the helpline line, in that order
  const followed = (out, note, help) => out.some((t) => { const a = t.indexOf(note), b = t.indexOf(help); return a === 0 && b > a; });
  const noBusyWording = (t) => !/Voice is busy|व्यस्त|try again shortly/i.test(t);
  try {
    const en = await scenario(browser, "en: 429 voice_busy", "en", mint(429, { error: "voice_busy" }, "30"), clickMic, "en-busy.png");
    ok("en busy note shown verbatim", en.out.some((t) => t.includes(EN)), en.out);
    ok("en busy note followed by the English HELP line (same note element, after the busy text)", followed(en.out, EN, HELP_EN), en.out);
    ok("en mint POSTed once with page key", en.apiCalls.filter((c) => c.startsWith("POST /v1/public/voice/sessions")).length === 1, en.apiCalls);
    ok("en no rate-limit text", !/Too many voice requests/.test(en.visibleText));
    const hi = await scenario(browser, "hi: 429 voice_busy", "hi", mint(429, { error: "voice_busy" }, "30"), clickMic, "hi-busy.png");
    ok("hi busy note shown verbatim", hi.out.some((t) => t.includes(HI)), hi.out);
    ok("hi busy note followed by exactly the Hindi helpline line", followed(hi.out, HI, HELP_HI) && hi.out.some((t) => t.split("\n").includes(HELP_HI)), hi.out);
    ok("hi busy note element does not carry the English HELP line (the static panel footer is English by design)", hi.out.every((t) => !t.includes(HELP_EN)), hi.out);
    const hin = await scenario(browser, "hi-IN: 429 voice_busy", "hi-IN", mint(429, { error: "voice_busy" }, "30"), clickMic, "hi-IN-busy.png");
    ok("hi-IN also gets the Hindi note + Hindi helpline", followed(hin.out, HI, HELP_HI), hin.out);
    const rl = await scenario(browser, "control en: 429 rate_limited", "en", mint(429, { error: "rate_limited" }, "30"), clickMic, "en-rate-limited.png");
    ok("control: rate_limited shows old rate text, not busy note", /Too many voice requests\. Please wait 30 seconds/.test(rl.visibleText) && !rl.visibleText.includes(EN), rl.out);
    const cr = await scenario(browser, "control en: chat turn crisis flag", "en", async (route, r) => {
      if (r.url().includes("/chat/turns")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ state: "escalated", message: "I am really sorry you are feeling this way. You are not alone.", claims: [], sources: [] }) });
      return route.fulfill({ status: 404, body: "" });
    }, async (page) => {
      await page.locator("[data-vc-widget] >> textarea").fill("crisis now");
      await page.locator("[data-vc-widget] >> textarea").press("Enter");
      await page.waitForSelector("[data-vc-widget] >> .m.crisis", { timeout: 5000 });
      return await page.locator("[data-vc-widget] >> .m.crisis").allInnerTexts();
    }, "en-crisis-chat.png");
    ok("control: crisis chat turn shows HELP / Tele-MANAS text unchanged", cr.out.some((t) => t.includes(HELP_EN) && t.includes("I am really sorry")) && !cr.visibleText.includes("Voice is busy"), cr.out);

    // scenario off: 403 voice_unavailable, no Retry-After
    const offEn = await scenario(browser, "off en: 403 voice_unavailable", "en", mint(403, { error: "voice_unavailable" }), clickMic, "en-off.png");
    ok("off en: 'voice is not available here' note followed by English HELP line", followed(offEn.out, OFF_EN, HELP_EN), offEn.out);
    ok("off en: no busy wording", noBusyWording(offEn.visibleText), offEn.visibleText);
    const offHi = await scenario(browser, "off hi: 403 voice_unavailable", "hi", mint(403, { error: "voice_unavailable" }), clickMic, "hi-off.png");
    ok("off hi: Hindi 'not available here' note followed by exactly the Hindi helpline", followed(offHi.out, OFF_HI, HELP_HI) && offHi.out.some((t) => t.split("\n").includes(HELP_HI)), offHi.out);
    ok("off hi: no busy wording (en or hi)", noBusyWording(offHi.visibleText), offHi.visibleText);

    // scenario ws: mint 201, fake socket opens, voice_busy error frame, then close 1008
    const wsMint = mint(201, { token: "faketoken" + "x".repeat(24), wsUrl: "ws://127.0.0.1:9/v1/public/voice/ws" });
    const wsEn = await scenario(browser, "ws en: voice_busy error frame then 1008", "en", wsMint, clickMic, "en-ws-busy.png", fakeWs);
    ok("ws en: error-frame path shows busy note followed by English HELP line", followed(wsEn.out, EN, HELP_EN), wsEn.out);
    const wsHi = await scenario(browser, "ws hi: voice_busy error frame then 1008", "hi", wsMint, clickMic, "hi-ws-busy.png", fakeWs);
    ok("ws hi: error-frame path shows Hindi busy note followed by Hindi helpline", followed(wsHi.out, HI, HELP_HI), wsHi.out);
    const wsLog = pages.filter((p) => p.label.startsWith("ws "));
    ok("ws path actually exercised (fake socket constructed, frame delivered, 1008 close)", wsLog.length === 2 && wsLog.every((p) => p.apiCalls.length === 1 && p.wsLog && p.wsLog.some((l) => /^construct ws:/.test(l)) && p.wsLog.includes("error frame voice_busy") && p.wsLog.includes("close 1008")), wsLog.map((p) => p.wsLog));

    for (const p of pages) ok("console JS errors none beyond injected 4xx resource loads: " + p.label, p.consoleErrors.filter((e) => !/Failed to load resource/.test(e)).length === 0, p.consoleErrors);
  } catch (e) {
    ok("SCRIPT ERROR", false, String(e && e.stack || e));
  }
  await browser.close();
  server.close();
  const when = process.env.WHEN;
  const rep = { unit: "pc-hardening-2", date: "2026-10-22", generatedAt: when, baseUrl: BASE, mode: "key mode (data-vc-voice=on), API intercepted with page.route, WebSocket faked via addInitScript for the error-frame scenario, fake page key, no API server, no live LLM", browser: "chromium (playwright-core 1.63.0, headless, --use-fake-ui-for-media-stream --use-fake-device-for-media-stream)", widgetCode: process.env.CODE, passed: checks.filter((c) => c.pass).length, checks: checks.length, checkResults: checks, pages };
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(rep, null, 2));
  console.log(rep.passed + "/" + rep.checks + " pass");
})();
