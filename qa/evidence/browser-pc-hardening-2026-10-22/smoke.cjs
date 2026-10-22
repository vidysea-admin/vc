"use strict";
// pc-hardening H3 browser validation: real headless Chromium, real widget vc-widget.js + voice.js, API intercepted with page.route (no API server, no real key).
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("D:/vc/node_modules/.pnpm/playwright-core@1.63.0/node_modules/playwright-core");
const SRC = "D:/vc/.worktrees/pc-hardening/apps/widget/src/";
const OUT = __dirname;
const PORT = 5188;
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
async function scenario(browser, label, lang, routeFn, act, shot) {
  const ctx = await browser.newContext({ permissions: ["microphone"], viewport: { width: 420, height: 720 } });
  const page = await ctx.newPage();
  const consoleErrors = [], messages = [], apiCalls = [];
  page.on("console", (m) => { messages.push(m.type() + ": " + m.text()); if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => { const t = "pageerror: " + e.message; consoleErrors.push(t); messages.push(t); });
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
  pages.push({ url, label, htmlLang: await page.evaluate(() => document.documentElement.lang), consoleErrors, messages, apiCalls, visibleText, screenshot: shot });
  await ctx.close();
  return { out, visibleText, consoleErrors, apiCalls };
}
const mint429 = (body, ra) => (route) => route.fulfill({ status: 429, contentType: "application/json", headers: ra ? { "Retry-After": ra } : {}, body: JSON.stringify(body) });
const clickMic = async (page) => {
  await page.waitForSelector("[data-vc-widget] >> .mic", { timeout: 5000 });
  await page.locator("[data-vc-widget] >> .mic").click();
  await page.waitForSelector("[data-vc-widget] >> :is(.m.note, .m.err)", { timeout: 8000 });
  return await page.evaluate(() => Array.from(document.querySelector("[data-vc-widget]").shadowRoot.querySelectorAll(".m.note, .m.err")).map((e) => e.innerText || e.textContent));
};
(async () => {
  await new Promise((r) => server.listen(PORT, "127.0.0.1", r));
  const browser = await chromium.launch({ headless: true, args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
  const EN = "Voice is busy right now. Please try again shortly, or keep typing here.";
  const HI = "वॉइस अभी व्यस्त है। कृपया थोड़ी देर में फिर कोशिश करें, या यहीं टाइप करें।";
  try {
    const en = await scenario(browser, "en: 429 voice_busy", "en", mint429({ error: "voice_busy" }, "30"), clickMic, "en-busy.png");
    ok("en busy note shown verbatim", en.out.includes(EN), en.out);
    ok("en mint POSTed once with page key", en.apiCalls.filter((c) => c.startsWith("POST /v1/public/voice/sessions")).length === 1, en.apiCalls);
    ok("en no rate-limit text", !/Too many voice requests/.test(en.visibleText));
    const hi = await scenario(browser, "hi: 429 voice_busy", "hi", mint429({ error: "voice_busy" }, "30"), clickMic, "hi-busy.png");
    ok("hi busy note shown verbatim", hi.out.includes(HI), hi.out);
    const hin = await scenario(browser, "hi-IN: 429 voice_busy", "hi-IN", mint429({ error: "voice_busy" }, "30"), clickMic, "hi-IN-busy.png");
    ok("hi-IN also gets the Hindi note", hin.out.includes(HI), hin.out);
    const rl = await scenario(browser, "control en: 429 rate_limited", "en", mint429({ error: "rate_limited" }, "30"), clickMic, "en-rate-limited.png");
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
    ok("control: crisis chat turn shows HELP / Tele-MANAS text unchanged", cr.out.some((t) => t.includes("Tele-MANAS 14416 (24x7) · Emergency 112") && t.includes("I am really sorry")) && !cr.visibleText.includes("Voice is busy"), cr.out);
    for (const p of pages) ok("console JS errors none beyond injected 4xx resource loads: " + p.label, p.consoleErrors.filter((e) => !/Failed to load resource/.test(e)).length === 0, p.consoleErrors);
  } catch (e) {
    ok("SCRIPT ERROR", false, String(e && e.stack || e));
  }
  await browser.close();
  server.close();
  const when = process.env.WHEN;
  const rep = { unit: "pc-hardening", date: "2026-10-22", generatedAt: when, baseUrl: BASE, mode: "key mode (data-vc-voice=on), API intercepted with page.route, fake page key, no API server, no live LLM", browser: "chromium (playwright-core 1.63.0, headless, --use-fake-ui-for-media-stream --use-fake-device-for-media-stream)", widgetCode: process.env.CODE, passed: checks.filter((c) => c.pass).length, checks: checks.length, checkResults: checks, pages };
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(rep, null, 2));
  console.log(rep.passed + "/" + rep.checks + " pass");
})();
