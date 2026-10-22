// Checker's OWN browser script for pc-widget cycle 0. Not the maker's smoke. Stub on 5191.
const { chromium } = require("D:/vc/node_modules/.pnpm/playwright-core@1.63.0/node_modules/playwright-core");
const fs = require("node:fs");
const BASE = "http://127.0.0.1:5191";
const OUT = "C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/checker-report.json";
const R = [];
const rec = (name, pass, detail) => { R.push({ name, pass: !!pass, detail: detail === undefined ? null : detail }); console.log((pass ? "ok   " : "FAIL ") + name + (pass ? "" : " :: " + JSON.stringify(detail))); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const page_html = (attrs, extraHead) => `<!doctype html><html><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">${extraHead || ""}</head><body><h1 id=h1>Host heading</h1><button id=hostbtn>host button</button><p id=hp>para</p><script src="/widget/vc-widget.v1.js" ${attrs} defer></script></body></html>`;

(async () => {
  const browser = await chromium.launch();
  try {
    // ---------- context A: anonymous visitor, key mode, hostile host CSS, 360px ----------
    const ctx = await browser.newContext({ viewport: { width: 360, height: 640 }, hasTouch: true });
    await ctx.addCookies([{ name: "pl_session", value: "visitor-cookie", url: BASE }]);
    const page = await ctx.newPage();
    const consoleAll = [], reqs = [];
    page.on("console", (m) => consoleAll.push(m.type() + ": " + m.text()));
    page.on("pageerror", (e) => consoleAll.push("pageerror: " + e.message));
    page.on("request", (r) => { if (r.method() === "POST") reqs.push({ url: r.url(), headers: r.headers(), body: r.postData() }); });
    const hostile = "<style>body{color:red!important;font-size:3px!important;line-height:0!important} div:not([data-vc-widget]),section,form,textarea,ul,li,a,svg,path,span,i,h2{border:9px solid red!important;display:none!important} h1{color:rgb(0,128,0)!important;display:block!important;font-size:40px!important} #hostbtn,#hp{display:block!important;font-size:20px!important} button{background:lime!important;width:300px!important;height:300px!important}</style>";
    await page.route("**/iso.html*", (route) => route.fulfill({ contentType: "text/html", body: page_html('data-vc-key="vck_demo_key" data-vc-title="Vidysea &lt;img src=x onerror=window.__t=1&gt; Help" data-vc-color="#7a1fa2" data-vc-voice="on"', hostile) }));
    // host-side style before widget for leak check: measure after
    await page.goto(BASE + "/iso.html");
    await page.waitForSelector("[data-vc-widget]", { state: "attached" });
    const host = page.locator("[data-vc-widget]");
    const info = await page.evaluate(() => {
      const h = document.querySelector("[data-vc-widget]");
      const sr = h.shadowRoot;
      const b = sr.querySelector(".bubble");
      const cs = getComputedStyle(b);
      const r = b.getBoundingClientRect();
      return { hasShadow: !!sr, mode: sr && sr.mode, bg: cs.backgroundColor, w: r.width, h: r.height, display: cs.display,
        h1color: getComputedStyle(document.getElementById("h1")).color, h1fs: getComputedStyle(document.getElementById("h1")).fontSize,
        hostbtnBg: getComputedStyle(document.getElementById("hostbtn")).backgroundColor, shadowKids: sr.children.length,
        lightKids: h.children.length, hostText: h.textContent };
    });
    rec("W1 shadow DOM host with open shadow root, content not in light DOM", info.hasShadow && info.lightKids === 0, info);
    rec("W1 hostile page CSS (* display none, font 3px, button lime) does NOT leak in: bubble visible 56px, uses data-vc-color #7a1fa2", info.display === "flex" && Math.round(info.w) === 56 && info.bg === "rgb(122, 31, 162)", info);
    rec("W1 widget CSS does NOT leak out: host h1 still green 40px, host button still lime", info.h1color === "rgb(0, 128, 0)" && info.h1fs === "40px" && info.hostbtnBg === "rgb(0, 255, 0)", info);
    // open panel
    await page.locator("[data-vc-widget] >> .bubble").click();
    const dlg = page.locator("[data-vc-widget] >> [role=dialog]");
    rec("W1 click bubble opens dialog; aria-expanded=true", (await dlg.isVisible()) && (await page.locator("[data-vc-widget] >> .bubble").getAttribute("aria-expanded")) === "true");
    const lay = await page.evaluate(() => {
      const sr = document.querySelector("[data-vc-widget]").shadowRoot;
      const p = sr.querySelector(".panel").getBoundingClientRect();
      const bt = [...sr.querySelectorAll("button")].map((b) => { const r = b.getBoundingClientRect(); return { cls: b.className, w: r.width, h: r.height, vis: r.width > 0 }; });
      const ta = sr.querySelector("textarea");
      return { left: p.left, right: p.right, top: p.top, bottom: p.bottom, vw: innerWidth, vh: innerHeight, sw: document.documentElement.scrollWidth, bt, taFs: getComputedStyle(ta).fontSize,
        title: sr.querySelector("h2").textContent, titleHtml: sr.querySelector("h2").innerHTML, voiceBtn: !!sr.querySelector("[class*=mic],[aria-label*=ic i]"), roleLog: !!sr.querySelector("[role=log]"), label: sr.querySelector("[role=dialog]").getAttribute("aria-label"),
        foot: sr.querySelector(".foot").textContent, injected: window.__t || null };
    });
    rec("W1 360px: panel inside viewport, no horizontal scroll", lay.left >= 0 && lay.right <= lay.vw && lay.top >= 0 && lay.bottom <= lay.vh && lay.sw <= lay.vw, lay);
    rec("W1 touch targets >=44px (close, send)", lay.bt.filter((b) => b.cls === "close" || b.cls === "send").every((b) => b.w >= 44 && b.h >= 44), lay.bt);
    rec("W1 textarea font-size 16px (no iOS zoom)", lay.taFs === "16px", lay.taFs);
    rec("W1 data-vc-title with HTML is literal text (no img element, no flag)", lay.title.includes("<img") && !lay.titleHtml.includes("<img src") && lay.injected === null, { t: lay.title, h: lay.titleHtml });
    rec("W1 data-vc-voice=on renders no mic yet (pc-voice owns it)", lay.voiceBtn === false);
    rec("W1 aria: role=dialog with label, role=log present", lay.roleLog && !!lay.label, lay);
    rec("W2 footer shows 14416 and 112 on open", /14416/.test(lay.foot) && /112/.test(lay.foot), lay.foot);
    // keyboard: focus in textarea after open; Tab order; Esc
    const focusTag = await page.evaluate(() => document.querySelector("[data-vc-widget]").shadowRoot.activeElement && document.querySelector("[data-vc-widget]").shadowRoot.activeElement.tagName);
    rec("W1 keyboard: opening moves focus to the textarea", focusTag === "TEXTAREA", focusTag);
    await page.keyboard.press("Escape");
    const closedState = await page.evaluate(() => { const sr = document.querySelector("[data-vc-widget]").shadowRoot; return { hidden: sr.querySelector(".panel").hidden, focus: sr.activeElement && sr.activeElement.className, exp: sr.querySelector(".bubble").getAttribute("aria-expanded") }; });
    rec("W1 keyboard: Esc closes, focus returns to bubble, aria-expanded=false", closedState.hidden && closedState.focus === "bubble" && closedState.exp === "false", closedState);
    await page.keyboard.press("Enter"); // activates focused bubble -> open
    const reopened = await dlg.isVisible();
    rec("W1 keyboard: Enter on focused bubble reopens", reopened);

    // ---------- W2 text chat key mode ----------
    const ta = page.locator("[data-vc-widget] >> textarea");
    reqs.length = 0;
    await ta.fill("hello counsellor");
    // double Enter fast -> only one request
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    const typingSeen = await page.evaluate(() => !document.querySelector("[data-vc-widget]").shadowRoot.querySelector(".typing").hidden);
    await page.waitForFunction(() => document.querySelector("[data-vc-widget]").shadowRoot.querySelectorAll(".m.bot").length >= 2, null, { timeout: 5000 });
    rec("W2 typing indicator shown while waiting", typingSeen);
    rec("W2 double-Enter sends exactly one request", reqs.length === 1, reqs.length);
    const q = reqs[0] || {};
    rec("W2 key mode: URL path /v1/public/chat/turns, X-VC-Key header, body exactly {text}", /\/v1\/public\/chat\/turns$/.test(q.url) && q.headers["x-vc-key"] === "vck_demo_key" && q.body === JSON.stringify({ text: "hello counsellor" }), q);
    const lg0 = await (await page.request.get(BASE + "/__log")).json(); const lastKey = lg0.filter((e) => e.path === "/v1/public/chat/turns").pop();
    rec("W2 key mode: no cookie sent even though the browser holds one for this origin (credentials omit)", lastKey && lastKey.cookie === null && lastKey.key === "vck_demo_key", lastKey);
    const rend = await page.evaluate(() => {
      const sr = document.querySelector("[data-vc-widget]").shadowRoot;
      const bots = [...sr.querySelectorAll(".m.bot")];
      const last = bots[bots.length - 1];
      return { text: last.textContent, lis: [...last.querySelectorAll("li")].map((l) => l.textContent), flag: !!last.querySelector(".flag"), links: [...last.querySelectorAll("a")].map((a) => ({ href: a.href, t: a.textContent, rel: a.rel, target: a.target })), srcText: last.querySelector(".src") && last.querySelector(".src").textContent };
    });
    rec("W2 renders message + 2 claims (one flagged unverified) + source link (https, noopener, _blank) + non-url source as text", rend.lis.length === 2 && rend.flag && rend.links.length === 1 && rend.links[0].href === "https://www.aicte-india.org/" && /noopener/.test(rend.links[0].rel) && rend.links[0].target === "_blank" && /Course guide/.test(rend.srcText), rend);

    // XSS
    await ta.fill("xss please"); await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.querySelector("[data-vc-widget]").shadowRoot.querySelectorAll(".m.bot").length >= 3, null, { timeout: 5000 });
    const x = await page.evaluate(() => { const sr = document.querySelector("[data-vc-widget]").shadowRoot; const bots = [...sr.querySelectorAll(".m.bot")]; const l = bots[bots.length - 1]; return { xss: window.__xss || null, imgs: sr.querySelectorAll("img").length, scripts: sr.querySelectorAll("script").length, bs: sr.querySelectorAll(".m b, .m i").length, text: l.textContent }; });
    rec("W2 hostile model text (img onerror, script, b, i) renders literal; no element, no execution", x.xss === null && x.imgs === 0 && x.scripts === 0 && x.bs === 0 && /<img src=x/.test(x.text), x);

    // hostile: long unbroken string, custom body via route; link variants
    const longBody = { state: "ok", message: "A".repeat(3000) + " https://" + "b".repeat(500), claims: [{ text: "C".repeat(1500), kind: "fact", sourceIds: [], status: "unverified" }], sources: [
      { id: "1", kind: "web", title: "T".repeat(400), url: "https://example.org/" + "p".repeat(100) },
      { id: "2", kind: "web", title: "data uri", url: "data:text/html,<script>alert(1)</script>" },
      { id: "3", kind: "web", title: "tab js", url: "java\tscript:alert(1)" },
      { id: "4", kind: "web", title: "uppercase JS", url: "JAVASCRIPT:alert(1)" },
      { id: "5", kind: "web", title: "protocol-rel", url: "//evil.test/" },
      { id: "6", kind: "web", title: "http ok", url: "http://plain.example.org/x" } ] };
    await page.route("**/v1/public/chat/turns", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(longBody) }));
    await ta.fill("long please"); await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.querySelector("[data-vc-widget]").shadowRoot.querySelectorAll(".m.bot").length >= 4, null, { timeout: 5000 });
    const lg = await page.evaluate(() => { const sr = document.querySelector("[data-vc-widget]").shadowRoot; const log = sr.querySelector(".log"); const p = sr.querySelector(".panel").getBoundingClientRect(); const bots = [...sr.querySelectorAll(".m.bot")]; const l = bots[bots.length - 1]; const lr = l.getBoundingClientRect(); return { logScrollW: log.scrollWidth, logClientW: log.clientWidth, panelW: p.width, msgRight: lr.right, panelRight: p.right, docSW: document.documentElement.scrollWidth, vw: innerWidth, hrefs: [...l.querySelectorAll("a")].map((a) => a.href) }; });
    rec("W2 hostile long unbroken text at 360px: no horizontal overflow of log/page", lg.logScrollW <= lg.logClientW && lg.docSW <= lg.vw && lg.msgRight <= lg.panelRight + 1, lg);
    rec("W2 link policy: only http/https survive (data:, tab-split js:, upper JS:, //host dropped)", lg.hrefs.length === 2 && lg.hrefs.every((h) => /^https?:\/\//.test(h)) && !lg.hrefs.some((h) => /evil\.test/.test(h)), lg.hrefs);
    await page.unroute("**/v1/public/chat/turns");

    // crisis, nosource, 500, network, 429, 401
    await ta.fill("crisis"); await page.keyboard.press("Enter");
    await page.waitForSelector("[data-vc-widget] >> .m.crisis", { timeout: 5000 });
    const cr = await page.locator("[data-vc-widget] >> .m.crisis").textContent();
    rec("W2 escalated state shows crisis block with 14416 / 112", /14416/.test(cr) && /112/.test(cr), cr);
    await ta.fill("boom"); await page.keyboard.press("Enter");
    await page.waitForSelector("[data-vc-widget] >> .m.err", { timeout: 5000 });
    const er = await page.locator("[data-vc-widget] >> .m.err").last().textContent();
    rec("W2 500 shows error with helpline", /500/.test(er) && /14416/.test(er), er);
    await page.route("**/v1/public/chat/turns", (route) => route.abort());
    await ta.fill("net"); await page.keyboard.press("Enter");
    await page.waitForFunction(() => /Could not reach/.test(document.querySelector("[data-vc-widget]").shadowRoot.querySelector(".log").textContent), null, { timeout: 5000 });
    rec("W2 network failure shows 'Could not reach', input stays usable", await ta.isEnabled());
    await page.unroute("**/v1/public/chat/turns");
    // 429
    const t0 = Date.now();
    await ta.fill("ratelimit"); await page.keyboard.press("Enter");
    await page.waitForFunction(() => /Please wait \d+ s/.test(document.querySelector("[data-vc-widget]").shadowRoot.querySelector(".status").textContent), null, { timeout: 5000 });
    const st1 = await page.evaluate(() => { const sr = document.querySelector("[data-vc-widget]").shadowRoot; return { status: sr.querySelector(".status").textContent, dis: sr.querySelector(".send").disabled, val: sr.querySelector("textarea").value }; });
    const before = reqs.length;
    await page.keyboard.press("Enter"); // attempt during wait
    await sleep(300);
    rec("W3/W2 429: 'Please wait N s' countdown, Send disabled, message returned to input, Enter during wait sends nothing", st1.dis && st1.val === "ratelimit" && reqs.length === before, { st1, before, after: reqs.length });
    await page.waitForFunction(() => !document.querySelector("[data-vc-widget]").shadowRoot.querySelector(".send").disabled, null, { timeout: 8000 });
    const waited = (Date.now() - t0) / 1000;
    rec("W2 429 Retry-After:3 -> controls re-enable after ~3s (2.5..5.5)", waited >= 2.5 && waited <= 5.5, waited);
    // 401
    await ta.fill("revoke"); await page.keyboard.press("Enter");
    await page.waitForFunction(() => /unavailable/i.test(document.querySelector("[data-vc-widget]").shadowRoot.querySelector(".status").textContent), null, { timeout: 5000 });
    const u = await page.evaluate(() => { const sr = document.querySelector("[data-vc-widget]").shadowRoot; return { dis: sr.querySelector("textarea").disabled, send: sr.querySelector(".send").disabled, log: [...sr.querySelectorAll(".m.err")].pop().textContent }; });
    rec("W2 401 -> 'Chat unavailable', input and Send disabled", u.dis && u.send && /^Chat unavailable/.test(u.log), u);
    // storage and secrets
    const stor = await page.evaluate(async () => ({ ls: localStorage.length, ss: sessionStorage.length, ck: document.cookie, idb: indexedDB.databases ? (await indexedDB.databases()).length : "n/a", caches: (await caches.keys()).length, shadowHasKey: document.querySelector("[data-vc-widget]").shadowRoot.innerHTML.includes("vck_demo_key"), hostAttrs: document.querySelector("[data-vc-widget]").outerHTML.includes("vck_demo_key") }));
    rec("W2 nothing persisted (localStorage, sessionStorage, cookies, IndexedDB, Cache API empty)", stor.ls === 0 && stor.ss === 0 && stor.ck === "pl_session=visitor-cookie" && (stor.idb === 0 || stor.idb === "n/a") && stor.caches === 0, stor);
    rec("W2 key not rendered into shadow DOM or host element", !stor.shadowHasKey && !stor.hostAttrs, stor);
    rec("Security: key never appears in any console message", !consoleAll.some((c) => c.includes("vck_demo_key")), consoleAll.filter((c) => !/Failed to load resource/.test(c)));
    rec("Security: no JS pageerror", !consoleAll.some((c) => c.startsWith("pageerror")), consoleAll.filter((c) => c.startsWith("pageerror")));
    // reload -> conversation gone
    await page.reload(); await page.waitForSelector("[data-vc-widget]", { state: "attached" });
    await page.locator("[data-vc-widget] >> .bubble").click();
    const afterReload = await page.evaluate(() => document.querySelector("[data-vc-widget]").shadowRoot.querySelectorAll(".m").length);
    rec("W2 in-memory only: after reload only the greeting exists (1 message)", afterReload === 1, afterReload);
    await page.screenshot({ path: "C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/chk-360.png" });
    await ctx.close();

    // ---------- context B: proxy mode (Pathlynks student), desktop ----------
    const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx2.addCookies([{ name: "pl_session", value: "student-session", url: BASE }]);
    const p2 = await ctx2.newPage();
    const reqs2 = [], con2 = [];
    p2.on("request", (r) => { if (r.method() === "POST") reqs2.push({ url: r.url(), headers: r.headers(), body: r.postData() }); });
    p2.on("console", (m) => con2.push(m.type() + ": " + m.text()));
    await p2.goto(BASE + "/demo.html?mode=proxy");
    await p2.waitForSelector("[data-vc-widget]", { state: "attached" });
    await p2.locator("[data-vc-widget] >> .bubble").click();
    const pw = await p2.evaluate(() => document.querySelector("[data-vc-widget]").shadowRoot.querySelector(".panel").getBoundingClientRect().width);
    rec("W1 desktop 1280: panel is ~380px wide", Math.abs(pw - 380) <= 2, pw);
    const ta2 = p2.locator("[data-vc-widget] >> textarea");
    await ta2.fill("Which course after class 12?"); await p2.locator("[data-vc-widget] >> .send").click();
    await p2.waitForFunction(() => document.querySelector("[data-vc-widget]").shadowRoot.querySelectorAll(".m.bot").length >= 2, null, { timeout: 5000 });
    const q2 = reqs2[0] || {};
    const lg2 = await (await p2.request.get(BASE + "/__log")).json(); const lastPx = lg2.filter((e) => e.path === "/api/vc").pop();
    rec("W2 proxy mode: posts same body {text} to /api/vc, NO X-VC-Key, session cookie rides to the host backend", /\/api\/vc$/.test(q2.url) && q2.body === JSON.stringify({ text: "Which course after class 12?" }) && !("x-vc-key" in q2.headers) && lastPx && lastPx.key === null && lastPx.cookie === "present", { q2url: q2.url, lastPx });
    rec("W2 proxy mode: nothing posted to /v1/public/chat/turns", !reqs2.some((r) => /\/v1\/public\//.test(r.url)), reqs2.map((r) => r.url));
    await ta2.fill("crisis"); await p2.keyboard.press("Enter");
    await p2.waitForSelector("[data-vc-widget] >> .m.crisis", { timeout: 5000 });
    rec("Persona(student/proxy): crisis block with 14416/112 in proxy mode", /14416/.test(await p2.locator("[data-vc-widget] >> .m.crisis").textContent()));
    // Shift+Enter newline, no send
    const n = reqs2.length;
    await ta2.fill("line1"); await p2.keyboard.press("Shift+Enter"); await p2.keyboard.type("line2");
    await sleep(200);
    rec("W1 Shift+Enter inserts newline, does not send", reqs2.length === n && (await ta2.inputValue()) === "line1\nline2");
    // double embed protection
    await p2.evaluate(() => { const s = document.createElement("script"); s.src = "/widget/vc-widget.js"; s.setAttribute("data-vc-key", "x"); document.body.appendChild(s); });
    await sleep(500);
    rec("W1 second embed does not mount a second widget", (await p2.locator("[data-vc-widget]").count()) === 1);
    await ctx2.close();

    // ---------- context C: bad config + open mode + legacy proxy abuse ----------
    const ctx3 = await browser.newContext({ viewport: { width: 360, height: 640 } });
    const p3 = await ctx3.newPage(); const con3 = [];
    p3.on("console", (m) => con3.push(m.type() + ": " + m.text()));
    await p3.route("**/bad1.html", (route) => route.fulfill({ contentType: "text/html", body: page_html('data-vc-proxy="//evil.test/x" data-vc-key="vck_secretleak"') }));
    await p3.goto(BASE + "/bad1.html"); await sleep(600);
    rec("W1 invalid data-vc-proxy (//evil) -> no widget mounted, console error does not echo the key", (await p3.locator("[data-vc-widget]").count()) === 0 && !con3.some((c) => c.includes("vck_secretleak")), con3);
    await p3.route("**/open.html", (route) => route.fulfill({ contentType: "text/html", body: page_html("") }));
    await p3.goto(BASE + "/open.html"); await p3.waitForSelector("[data-vc-widget]", { state: "attached" });
    rec("W1 no attributes: mounts in open mode with a console warning", con3.some((c) => /^warning: vc-widget: no data-vc-key/.test(c)), con3);
    await ctx3.close();
  } catch (e) {
    rec("SCRIPT ERROR", false, String(e && e.stack || e));
  }
  await browser.close();
  fs.writeFileSync(OUT, JSON.stringify({ passed: R.filter((r) => r.pass).length, total: R.length, results: R }, null, 2));
  console.log(R.filter((r) => r.pass).length + "/" + R.length + " pass");
})();
