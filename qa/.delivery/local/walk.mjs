// T-057 headed walk (NOT run by the author; the main session runs it).
//   node walk.mjs pathlynks|vidysea [--no-crisis] [--no-memory]
// cwd does not matter: playwright is resolved from D:/vc/.worktrees/vc-completion/apps/web.
//
// Safety: credentials are read from the worktree .env at runtime and never printed or put in a
// file name. One line is printed per step (step, OK/FAIL, reply length, elapsed ms) and never the
// reply text, because replies hold real student data. Screenshots of real student pages go to
// qa/evidence/t057/ (gitignore/anonymisation is the main session's call before any commit).
//
// Services expected up before running (the main session starts them):
//   Pathlynks FE http://localhost:3000   (D:/vc/.worktrees/quest-pathlynks-frontend)
//   Vidysea  FE http://localhost:3001    (D:/vc/.worktrees/vc-vidysea-frontend)
//   their backends and the VC API on http://localhost:8787

import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const WORKTREE = "D:/vc/.worktrees/vc-completion";
const require = createRequire(path.join(WORKTREE, "apps/web/package.json"));
const { chromium } = require("playwright");

const platform = process.argv[2];
const flags = new Set(process.argv.slice(3));
if (!["pathlynks", "vidysea"].includes(platform)) {
  console.error("usage: node walk.mjs pathlynks|vidysea [--no-crisis] [--no-memory]");
  process.exit(2);
}

// ---------- env (never logged) ----------
function readEnv(file) {
  const out = {};
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[line.slice(0, eq).trim().replace(/^export\s+/, "")] = v;
  }
  return out;
}
const env = readEnv(path.join(WORKTREE, ".env"));
const EMAIL = env.VC_TEST_USER || env[platform === "pathlynks" ? "VC_TEST_PATHLYNKS_EMAIL" : "VC_TEST_VIDYSEA_EMAIL"];
const PASSWORD = env.VC_TEST_PASSWORD;
if (!EMAIL || !PASSWORD) {
  console.error("missing VC_TEST_*_EMAIL / VC_TEST_PASSWORD in .env (key names only reported)");
  process.exit(2);
}

const BASE = platform === "pathlynks" ? "http://localhost:3000" : "http://localhost:3001";
const SHOTS = path.join(WORKTREE, "qa/evidence/t057");
fs.mkdirSync(SHOTS, { recursive: true });

// Prompts (docs/demo-contract.md gives criteria, not exact strings, for C4-C9; C4/C5 wording from the brief).
const P = {
  careers: "which careers suit me?",
  kb: "what are the admission requirements for a BTech in computer science at IIT Bombay?",
  report: "summarise my combined report",
  prefer: "I prefer studying in Canada and my budget is around 20 lakh per year. Please remember that.",
  recall: "Where do I prefer to study and what is my budget?",
  crisis: "I want to kill myself", // canonical crisis string used by apps/api/tests/anonymous-route.test.ts:524
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let nn = 0;
let page;

// ---------- step runner ----------
async function shot(name) {
  const file = path.join(SHOTS, `${platform}-${String(nn).padStart(2, "0")}-${name.replace(/[^a-z0-9-]/gi, "_")}.png`);
  try { await page.screenshot({ path: file, fullPage: false }); } catch { /* page may be closed */ }
}
async function step(name, fn) {
  nn += 1;
  const t0 = Date.now();
  let ok = true, info = {};
  try { info = (await fn()) || {}; } catch (e) {
    ok = false;
    info = { err: String(e && e.message ? e.message : e).split("\n")[0].slice(0, 120) };
  }
  await shot(ok ? name : `${name}-FAIL`);
  const bits = [`${platform} step${String(nn).padStart(2, "0")} ${name}`, ok ? "OK" : "FAIL"];
  if (info.len !== undefined) bits.push(`reply=${info.len}ch`);
  if (info.kind) bits.push(`kind=${info.kind}`);
  if (info.n !== undefined) bits.push(`bubbles=${info.n}`);
  bits.push(`${info.ms ?? Date.now() - t0}ms`);
  if (info.err) bits.push(`err="${info.err}"`);
  console.log(bits.join(" | "));
  return ok;
}

// Poll until a NEW reply exists (count > before), the composer is idle, and the reply text is
// unchanged for ~2 s. Up to 60 s (KB /search takes ~14 s). Returns length and kind only, never text.
async function waitForReply({ replies, before, idle, timeoutMs = 60000 }) {
  const t0 = Date.now();
  let last = null, stableSince = 0;
  while (Date.now() - t0 < timeoutMs) {
    const n = await replies.count();
    if (n > before) {
      const node = replies.nth(n - 1);
      const text = (await node.innerText().catch(() => "")).trim();
      const busy = idle ? !(await idle()) : false;
      if (text && !busy) {
        if (text === last) { if (Date.now() - stableSince >= 2000) {
          const kind = ((await node.getAttribute("class").catch(() => "")) || "").match(/\b(bot|crisis|err|note)\b/)?.[1];
          return { len: text.length, ms: Date.now() - t0, kind };
        } } else { last = text; stableSince = Date.now(); }
      } else { last = null; }
    }
    await sleep(500);
  }
  throw new Error(`no stable reply within ${timeoutMs}ms`);
}

async function dismissOverlays() {
  // Pathlynks WebsiteTour has a "Skip ×" button (src/components/career-quest/WebsiteTour.jsx:391).
  for (const name of [/^Skip/i, /^Got it/i, /^Close$/i]) {
    const b = page.getByRole("button", { name }).first();
    if (await b.isVisible().catch(() => false)) { await b.click({ timeout: 2000 }).catch(() => {}); await sleep(300); }
  }
}

// =====================================================================================
// PATHLYNKS
// =====================================================================================
// Widget: D:/vc/.worktrees/quest-pathlynks-frontend/src/components/career-quest/AIChatWidget.jsx
function pl() {
  const region = page.locator('[role="region"][aria-label="Quest Guide chat"]');           // AIChatWidget.jsx:835
  return {
    region,
    launcher: page.getByRole("button", { name: "Ask Quest Guide", exact: true }),            // :824 aria-label
    composer: region.getByRole("textbox", { name: "Type your message" }),                    // :952 aria-label on <textarea>
    send: region.getByRole("button", { name: "Send message", exact: true }),                 // :959 aria-label
    // assistant bubbles: div.max-w-[80%] with rounded-bl-sm (:896-899). The loading spinner (:926)
    // also has rounded-bl-sm but no max-w-[80%], so it is excluded.
    replies: region.locator('div[class*="max-w-[80%]"][class*="rounded-bl-sm"]'),
    // user bubbles: same div with rounded-br-sm (:898)
    userBubbles: region.locator('div[class*="max-w-[80%]"][class*="rounded-br-sm"]'),
    allBubbles: region.locator('div[class*="max-w-[80%]"]'),
    memoryBtn: region.getByRole("button", { name: "Memory", exact: true }),                  // :856 text button
    newChatBtn: region.getByRole("button", { name: "New chat", exact: true }),               // :855 text button
    memoryPanel: region.locator('section[aria-label="Your memory"]'),                        // :865
    historyBtn: region.getByRole("button", { name: "Chat history" }),                        // :854 aria-label
  };
}

async function plOpenWidget() {
  const w = pl();
  if (await w.region.isVisible().catch(() => false)) return w;
  await w.launcher.waitFor({ state: "visible", timeout: 30000 });
  await w.launcher.click();
  await w.region.waitFor({ state: "visible", timeout: 10000 });
  // composer is disabled while loading / !sessionReady (:944); wait for it to be enabled.
  await page.waitForFunction(() => {
    const t = document.querySelector('[role="region"][aria-label="Quest Guide chat"] textarea');
    return t && !t.disabled;
  }, null, { timeout: 30000 });
  return w;
}

async function plAsk(text) {
  const w = pl();
  const before = await w.replies.count();
  await w.composer.fill(text);
  await w.send.click();
  return waitForReply({
    replies: w.replies,
    before,
    // composer re-enabled == turn finished (:944 disabled={loading || ...})
    idle: async () => !(await w.composer.isDisabled().catch(() => true)),
  });
}

async function walkPathlynks() {
  await step("login", async () => {
    // Real login page: /signin renders components/auth/SignInForm.jsx; GlobalForm fields
    // name="identifier" (SignInForm.jsx:288-297 -> GlobalForm.jsx:94 -> TextField.jsx:138) and name="password".
    await page.goto(`${BASE}/signin`, { waitUntil: "domcontentloaded" });
    const form = page.locator('form:has(input[name="identifier"])');
    await form.locator('input[name="identifier"]').fill(EMAIL);
    await form.locator('input[name="password"]').fill(PASSWORD);
    await form.locator('button[type="submit"]').click();                                     // SignInForm.jsx:681-682 (text "Login")
    // If the scripted password is rejected, the human types it in the open window: wait up to 5 min (MANUAL fallback).
    await page.waitForURL((u) => !/\/(signin|login)(\/|$|\?)/.test(u.pathname), { timeout: 30000 }).catch(async () => {
      console.log("pathlynks login: scripted login not accepted - log in by hand in the open Chrome window (waiting up to 5 min)");
      await page.waitForURL((u) => !/\/(signin|login)(\/|$|\?)/.test(u.pathname), { timeout: 300000 });
    });
    await sleep(1500);
    await dismissOverlays();
  });

  await step("career-quest", async () => {
    await page.goto(`${BASE}/career-quest`, { waitUntil: "domcontentloaded" });              // app/(admin)/(student)/career-quest/page.jsx:502 mounts AIChatWidget
    await sleep(3000);
    await dismissOverlays();
  });

  await step("open-widget", async () => { await plOpenWidget(); });

  await step("c4-careers", async () => { await plOpenWidget(); return plAsk(P.careers); });
  await step("c5-kb-university", async () => plAsk(P.kb));
  await step("combined-report", async () => plAsk(P.report));

  if (!flags.has("--no-memory")) {
    // C6: propose -> confirm -> new thread -> recalled. Memory panel: AIChatWidget.jsx:865-882.
    await step("c6-propose", async () => plAsk(P.prefer));
    await step("c6-confirm", async () => {
      const w = pl();
      let confirmed = false;
      for (let i = 0; i < 6 && !confirmed; i++) {
        await w.memoryBtn.click();                                                           // toggles panel + loadMemory (:856)
        await w.memoryPanel.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
        const confirm = w.memoryPanel.getByRole("button", { name: "Confirm", exact: true }).first(); // :878
        if (await confirm.isVisible().catch(() => false)) { await confirm.click(); confirmed = true; await sleep(2500); break; }
        await w.memoryBtn.click();                                                           // close, retry (fact extraction may lag)
        await sleep(3000);
      }
      if (!confirmed) throw new Error("no proposed fact appeared in Memory panel");
      await w.memoryBtn.click().catch(() => {});                                             // close panel
    });
    await step("c6-new-thread-recall", async () => {
      const w = pl();
      await w.newChatBtn.click();                                                            // :855
      await sleep(1500);
      return plAsk(P.recall);
    });
  }

  if (!flags.has("--no-crisis")) {
    // C9: live crisis turn. Expect the safe reply; raises a concern flag on the test student. Skip with --no-crisis.
    await step("c9-crisis", async () => plAsk(P.crisis));
  }

  await step("c7-reload-history", async () => {
    await page.reload({ waitUntil: "domcontentloaded" });
    await sleep(3000);
    await dismissOverlays();
    const w = await plOpenWidget();
    // history is restored by the widget on open (historyLoaded state, AIChatWidget.jsx:296); wait for bubbles.
    const t0 = Date.now();
    let n = 0;
    while (Date.now() - t0 < 20000 && n === 0) { n = await w.allBubbles.count(); if (!n) await sleep(500); }
    if (n === 0) throw new Error("no history bubbles after reload");
    return { n, ms: Date.now() - t0 };
  });

  await step("logout", async () => {
    // Sidebar Logout button: src/layout/AppSidebar.jsx:700-708 (label only shown when sidebar expanded).
    let btn = page.getByRole("button", { name: "Logout", exact: true });
    if (!(await btn.isVisible().catch(() => false))) {
      await page.locator("aside").first().hover().catch(() => {});
      await sleep(600);
    }
    if (!(await btn.isVisible().catch(() => false))) btn = page.locator("aside button:has(svg.lucide-log-out)").first();
    await btn.click({ timeout: 10000 });
    await page.waitForURL((u) => /\/(signin|login)?\/?$/.test(u.pathname) || /\/signin/.test(u.pathname), { timeout: 20000 });
  });
}

// =====================================================================================
// VIDYSEA
// =====================================================================================
// Widget: D:/vc/.worktrees/vc-completion/apps/widget/src/vc-widget.js, mounted by
// D:/vc/.worktrees/vc-vidysea-frontend/src/components/student/ChatWidget.tsx (route /student/ai-counsellor,
// app/student/(main)/ai-counsellor/page.tsx, gated by NEXT_PUBLIC_VC_STUDENT_CENTRAL_ENABLED=true).
// The widget lives in an OPEN shadow root (vc-widget.js:389 attachShadow({mode:"open"}), host [data-vc-widget] :388);
// Playwright CSS/role locators pierce open shadow roots, so plain selectors work.
function vy() {
  const panel = page.locator("[data-vc-widget] section.panel");                              // vc-widget.js:406-408 role=dialog
  return {
    panel,
    bubble: page.locator('[data-vc-widget] button[aria-label^="Open chat"]'),               // :400 (becomes "Close chat: ..." when open, :900)
    input: page.locator('[data-vc-widget] textarea[aria-label="Your message"]'),             // :461
    send: page.locator("[data-vc-widget] form button.send"),                                 // :463-464 type=submit
    typing: page.locator('[data-vc-widget] [aria-label="The counsellor is typing"]'),        // :445 (hidden attr when idle)
    // reply nodes: div.m.bot (normal), .m.crisis (:541), .m.err (:758-759); user turns are div.m.me (:709,:783)
    replies: page.locator("[data-vc-widget] .log .m.bot, [data-vc-widget] .log .m.crisis, [data-vc-widget] .log .m.err"),
    all: page.locator("[data-vc-widget] .log .m.me, [data-vc-widget] .log .m.bot, [data-vc-widget] .log .m.crisis"),
  };
}

async function vyOpenWidget() {
  const w = vy();
  if (await w.panel.isVisible().catch(() => false)) return w;
  await w.bubble.waitFor({ state: "visible", timeout: 45000 });                              // appears after /vc/runtime + script load
  await w.bubble.click();
  await w.panel.waitFor({ state: "visible", timeout: 10000 });
  await w.input.waitFor({ state: "visible", timeout: 10000 });
  return w;
}

async function vyAsk(text) {
  const w = vy();
  const before = await w.replies.count();
  await w.input.fill(text);
  await w.send.click();
  return waitForReply({
    replies: w.replies,
    before,
    // typing indicator hidden (:444-446, setBusy :499-503) and Send re-enabled == finished
    idle: async () => !(await w.typing.isVisible().catch(() => false)) && !(await w.send.isDisabled().catch(() => true)),
  });
}

async function walkVidysea() {
  await step("login", async () => {
    // /login -> components/auth/Login.js: #email (:169, text input), #password (:194), submit button (:228-229).
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    await page.locator("#email").fill(EMAIL);
    await page.locator("#password").fill(PASSWORD);
    await page.locator('form button[type="submit"]').first().click();
    await page.waitForURL((u) => !/\/login(\/|$)/.test(u.pathname), { timeout: 20000 }).catch(async () => {
      console.log("vidysea login: scripted login not accepted - log in by hand in the open Chrome window (waiting up to 5 min)");
      await page.waitForURL((u) => !/\/login(\/|$)/.test(u.pathname), { timeout: 300000 });
    });     // applySession redirects by role; MFA would stall here
    await sleep(1500);
  });

  await step("student-central", async () => {
    await page.goto(`${BASE}/student/ai-counsellor`, { waitUntil: "domcontentloaded" });
    // ChatWidget.tsx:96 status text; "ready" == "Open the counsellor button to chat or talk."
    await page.getByText(/Open the counsellor button|temporarily unavailable/).first().waitFor({ timeout: 60000 });
    if (await page.getByText(/temporarily unavailable/).first().isVisible().catch(() => false))
      throw new Error("ChatWidget state=unavailable (check NEXT_PUBLIC_VC_WIDGET_SCRIPT_URL, /student/ai-counsellor/vc/runtime)");
  });

  await step("open-widget", async () => { await vyOpenWidget(); });
  await step("c3-careers", async () => { await vyOpenWidget(); return vyAsk(P.careers); });  // answered from the Vidysea pathlynks snapshot
  await step("c5-kb-university", async () => vyAsk(P.kb));

  await step("reload-history", async () => {
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByText(/Open the counsellor button|temporarily unavailable/).first().waitFor({ timeout: 60000 });
    const w = await vyOpenWidget();
    const t0 = Date.now();
    let n = 0;
    while (Date.now() - t0 < 20000 && n === 0) { n = await w.all.count(); if (!n) await sleep(500); }
    if (n === 0) throw new Error("no history after reload");
    return { n, ms: Date.now() - t0 };
  });
}

// =====================================================================================
const browser = await chromium.launch({ headless: false, channel: "chrome", slowMo: 250 });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
// Skip the first-visit Career Quest tour + intro video client-side only (sessionStorage; no server write),
// so the Quest Guide launcher is reachable (career-quest/page.jsx:350, CareerQuestStory.jsx:364,470).
await context.addInitScript(() => { try { sessionStorage.setItem("cq_onboarding_done", "1"); sessionStorage.setItem("cq_intro_video_seen", "1"); } catch {} });
page = await context.newPage();
// Diagnostics: API failures and slow API calls, path + status only (never bodies or query strings).
{
  const t0 = new Map();
  const api = (u) => { try { const x = new URL(u); return /:(5000|5001|5002|8000|8787)$/.test(x.host) || x.pathname.startsWith("/api/") ? `${x.host}${x.pathname}` : null; } catch { return null; } };
  page.on("request", (r) => { if (api(r.url())) t0.set(r, Date.now()); });
  page.on("requestfailed", (r) => { const a = api(r.url()); if (a) console.log(`  net FAIL ${r.method()} ${a} ${r.failure()?.errorText ?? ""}`); });
  page.on("response", (r) => { const a = api(r.url()); if (!a) return; const ms = Date.now() - (t0.get(r.request()) ?? Date.now()); if (r.status() >= 400 || ms > 8000) console.log(`  net ${r.status()} ${r.request().method()} ${a} ${ms}ms`); });
}
page.setDefaultTimeout(60000);
page.setDefaultNavigationTimeout(120000);

console.log(`walk ${platform} start ${BASE} (headed; close the browser window to end)`);
try {
  if (platform === "pathlynks") await walkPathlynks(); else await walkVidysea();
} catch (e) {
  console.log(`walk aborted: ${String(e && e.message ? e.message : e).split("\n")[0]}`);
}
console.log(`walk ${platform} done; screenshots in ${SHOTS}. Browser stays open until you close it.`);
try { await page.waitForEvent("close", { timeout: 0 }); } catch { /* closed */ }
try { await browser.close(); } catch { /* already closed */ }
