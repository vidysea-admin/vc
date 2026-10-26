import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";

const BASE = "http://localhost:4520";
const OUT = process.env.OUT as string;
const PW = "test-password-not-real-1";
mkdirSync(OUT, { recursive: true });
interface Step { role: string; step: string; expected: string; observed: string; pass: boolean }
const log: Step[] = [];
async function step(role: string, name: string, expected: string, fn: () => Promise<string>) {
  try { const o = await fn(); log.push({ role, step: name, expected, observed: o, pass: true }); console.error(`PASS ${role} :: ${name} :: ${o}`); }
  catch (e) { const o = e instanceof Error ? e.message.split("\n")[0] as string : String(e); log.push({ role, step: name, expected, observed: o, pass: false }); console.error(`FAIL ${role} :: ${name} :: ${o}`); }
}
function ok(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
const shot = (p: Page, n: string) => p.screenshot({ path: join(OUT, `${n}.png`), fullPage: true });
async function newPage(b: Browser, w = 1100, h = 800) { const ctx = await b.newContext({ viewport: { width: w, height: h }, baseURL: BASE }); return { ctx, page: await ctx.newPage() }; }
async function login(page: Page, email: string, pw = PW) {
  await page.goto("/admin/login");
  await page.getByTestId("login-email").fill(email); await page.getByTestId("login-password").fill(pw); await page.getByTestId("login-submit").click();
}
async function storageAudit(page: Page) {
  const s = await page.evaluate(() => ({ l: Object.keys(localStorage), s: Object.keys(sessionStorage), u: location.href, c: document.cookie }));
  ok(s.l.length === 0 && s.s.length === 0, "storage not empty " + JSON.stringify(s));
  ok(!/eyJ/.test(s.u) && !/eyJ/.test(s.c), "token in URL or script-visible cookie");
  return "localStorage/sessionStorage empty; URL and document.cookie hold no token";
}
const proxy = (page: Page, method: string, path: string, body?: unknown, noAuth = false) =>
  page.evaluate(async ([m, p, bd, na]) => {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (!na) { const t = await (await fetch("/api/admin-session")).json(); headers.authorization = "Bearer " + t.token; }
    const r = await fetch("/api/admin-session/proxy/" + p, { method: m as string, headers, body: bd ? JSON.stringify(bd) : undefined });
    return { status: r.status, text: await r.text() };
  }, [method, path, body, noAuth] as const);

const b = await chromium.launch();
{
  const { ctx, page } = await newPage(b);
  await step("anon", "no cookie -> /admin/dashboard lands on login", "redirect", async () => { await page.goto("/admin/dashboard"); await page.waitForURL("**/admin/login"); await shot(page, "anon-login"); return page.url(); });
  await step("anon", "wrong password and unknown e-mail show same generic error; no cookie", "same text", async () => {
    await login(page, "viewer@vc.test", "nope-nope-nope"); const a = await page.getByTestId("error-banner").innerText();
    await login(page, "ghost@vc.test", "nope-nope-nope"); const c = await page.getByTestId("error-banner").innerText();
    ok(a === c, `differ: ${a} / ${c}`); ok(!(await ctx.cookies()).some(x => x.name === "vc_admin_session"), "cookie set after failed login"); return `"${a}"`;
  });
  await step("anon", "tampered session cookie redirects to login", "redirect", async () => {
    await ctx.addCookies([{ name: "vc_admin_session", value: "garbage.garbage.garbage", url: BASE }]);
    await page.goto("/admin/dashboard"); await page.waitForURL("**/admin/login", { timeout: 15000 }); return "landed on " + new URL(page.url()).pathname;
  });
  await ctx.close();
}
{
  const { ctx, page } = await newPage(b); const R = "super-admin";
  await step(R, "login -> dashboard; cookie HttpOnly+SameSite; no storage", "ok", async () => {
    await login(page, "super@vc.test"); await page.waitForURL("**/admin/dashboard"); await page.getByTestId("metric-active-students").waitFor();
    const c = (await ctx.cookies()).find(x => x.name === "vc_admin_session"); ok(c, "no cookie");
    ok(c.httpOnly && c.sameSite === "Strict", "flags " + JSON.stringify({ h: c.httpOnly, s: c.sameSite })); await shot(page, "super-dashboard");
    return `HttpOnly=${c.httpOnly} SameSite=${c.sameSite} Secure=${c.secure}; ` + await storageAudit(page);
  });
  await step(R, "dashboard tiles present", "all tiles + per-site-day table", async () => {
    const ids = ["metric-active-students", "metric-tokens", "metric-cost-per-student", "metric-latency-p50", "metric-latency-p95", "metric-guardrail", "metric-unanswered", "metric-chat", "metric-voice", "cost-status"];
    const vals: string[] = [];
    for (const id of ids) { ok(await page.getByTestId(id).count(), "missing " + id); vals.push(`${id.replace("metric-", "")}=${(await page.getByTestId(id).first().innerText()).replace(/\s+/g, " ").slice(0, 30)}`); }
    const def = (await page.getByTestId("metric-tokens").innerText()).replace(/\s+/g, " ");
    await page.getByTestId("filter-to").fill("2026-10-27"); await page.waitForTimeout(1500);
    const rows = await page.locator('[data-testid="per-site-day"] tbody tr').count(); await shot(page, "super-dashboard-to-plus1");
    const tok = (await page.getByTestId("metric-tokens").innerText()).replace(/\s+/g, " "); const cps = (await page.getByTestId("metric-cost-per-student").innerText()).replace(/\s+/g, " ");
    ok(rows >= 1, "no per-site-day rows even with To=2026-10-27");
    return vals.join("; ") + `; DEFAULT range(to=today) tokens=${def}; with To=tomorrow tokens=${tok} cps=${cps} rows=${rows}`;
  });
  await step(R, "Admins: create admin, set role, persists after reload", "ok", async () => {
    await page.getByRole("link", { name: "Admins" }).click(); await page.waitForURL("**/admin/admins");
    await page.getByTestId("admin-email").fill("newbie@vc.test"); await page.getByTestId("admin-password").fill("a-long-initial-password"); await page.getByTestId("admin-role").selectOption("viewer"); await page.getByTestId("create-admin").click();
    await page.getByText("newbie@vc.test").waitFor(); await page.locator('tr:has-text("newbie@vc.test") select').selectOption("admin"); await page.waitForTimeout(600); await page.reload();
    await page.getByText("newbie@vc.test").waitFor(); const v = await page.locator('tr:has-text("newbie@vc.test") select').inputValue(); ok(v === "admin", "role " + v); await shot(page, "super-admins"); return "newbie created viewer->admin, persisted";
  });
  await step(R, "Sources: set secret; never re-displayed", "ok", async () => {
    await page.getByRole("link", { name: "Sources" }).click(); await page.waitForURL("**/admin/sources");
    await page.getByTestId("secret-state-gh-1").waitFor(); ok((await page.getByTestId("secret-state-gh-1").innerText()) === "not set", "initial state");
    const S = "ghp_CHKA_DUMMY_SECRET_12345"; await page.getByTestId("secret-input-gh-1").fill(S); await page.getByTestId("set-secret").first().click();
    await page.waitForFunction(() => document.querySelector('[data-testid="secret-state-gh-1"]')?.textContent === "set");
    ok(!(await page.content()).includes(S), "secret in DOM"); ok((await page.getByTestId("secret-input-gh-1").inputValue()) === "", "input not cleared");
    await page.reload(); await page.getByTestId("secret-state-gh-1").waitFor(); ok(!(await page.content()).includes(S), "secret in DOM after reload");
    const net = await proxy(page, "GET", "sources"); ok(!net.text.includes(S) && !net.text.includes("secretEnc"), "list response carries secret");
    await shot(page, "super-sources"); return "'not set'->'set'; secret absent from DOM, reload and GET sources body";
  });
  await step(R, "sign out clears cookie", "ok", async () => { await page.getByTestId("sign-out").click(); await page.waitForURL("**/admin/login"); ok(!(await ctx.cookies()).some(x => x.name === "vc_admin_session"), "cookie remains"); await page.goto("/admin/dashboard"); await page.waitForURL("**/admin/login"); return "signed out"; });
  await ctx.close();
}
{
  const { ctx, page } = await newPage(b); const R = "admin"; let first = "";
  await step(R, "login; no Admins link; /admin/admins denied", "ok", async () => {
    await login(page, "admin@vc.test"); await page.waitForURL("**/admin/dashboard"); await page.getByTestId("metric-active-students").waitFor();
    ok((await page.getByRole("link", { name: "Admins" }).count()) === 0, "Admins link visible"); await page.goto("/admin/admins"); await page.getByTestId("admins-denied").waitFor(); return "denied page shown";
  });
  await step(R, "Sites: add site; keys shown once, gone after reload", "ok", async () => {
    await page.goto("/admin/sites"); await page.getByTestId("site-name").fill("Demo College"); await page.getByTestId("site-origins").fill("https://demo.example\nhttps://www.demo.example"); await page.getByTestId("add-site").click();
    await page.getByTestId("key-reveal").waitFor(); first = await page.getByTestId("revealed-key-pub").innerText(); const srv = await page.getByTestId("revealed-key-srv").innerText();
    ok(first.startsWith("vck_pub_demo-college_") && srv.startsWith("vck_srv_demo-college_"), "key shapes"); await shot(page, "admin-key-shown");
    await page.reload(); await page.getByTestId("site-row-demo-college").waitFor(); const h = await page.content(); ok(!h.includes(first) && !h.includes(srv), "key still in DOM after reload"); ok((await page.getByTestId("key-reveal").count()) === 0, "reveal survived");
    const list = await proxy(page, "GET", "sites"); ok(!list.text.includes(first) && !list.text.includes(srv), "GET sites carries full key");
    await shot(page, "admin-key-gone"); return "shown once; absent after reload and in GET sites";
  });
  await step(R, "Keys: rotate (confirm), revoke, unrevoke", "ok", async () => {
    await page.getByTestId("site-link-demo-college").click(); await page.waitForURL("**/admin/sites/demo-college");
    await page.getByTestId("rotate-pub").click(); await page.getByTestId("confirm-rotate-pub").click(); await page.getByTestId("revealed-key-pub").waitFor();
    const k = await page.getByTestId("revealed-key-pub").innerText(); ok(k !== first && k.startsWith("vck_pub_demo-college_"), "rotated key"); await page.reload(); await page.getByTestId("keys-table").waitFor(); ok(!(await page.content()).includes(k), "rotated key remains");
    await page.getByTestId("revoke-site").click(); await page.waitForFunction(() => document.querySelector('[data-testid="site-status"]')?.textContent === "revoked"); ok((await page.getByTestId("rotate-pub").count()) === 0, "rotate offered when revoked");
    await page.getByTestId("unrevoke-site").click(); await page.waitForFunction(() => document.querySelector('[data-testid="site-status"]')?.textContent === "active"); return "rotate shown once, revoke hides rotate, unrevoke restores";
  });
  await step(R, "Sources: add GitHub source, Test, Sync; no secret setter", "ok", async () => {
    await page.goto("/admin/sources"); await page.getByTestId("source-id").fill("gh-auth"); await page.getByTestId("source-owner").fill("vidysea"); await page.getByTestId("source-repo").fill("auth"); await page.getByTestId("source-service").selectOption("auth"); await page.getByTestId("source-tokenRef").fill("GITHUB_TOKEN"); await page.getByTestId("add-source").click();
    const card = page.getByTestId("source-card-gh-auth"); await card.waitFor(); await card.getByTestId("test-source").click(); await page.getByTestId("source-result-gh-auth").waitFor(); const t = await page.getByTestId("source-result-gh-auth").innerText();
    await card.getByTestId("sync-source").click(); await page.waitForFunction(() => /Sync ok/.test(document.querySelector('[data-testid="source-result-gh-auth"]')?.textContent ?? "")); const s = await page.getByTestId("source-result-gh-auth").innerText();
    ok((await card.getByTestId("set-secret").count()) === 0, "admin has secret setter"); await shot(page, "admin-sources"); return `Test "${t}" Sync "${s}"`;
  });
  await step(R, "admin forced super-admin-only routes are 403", "403", async () => {
    const a = await proxy(page, "GET", "admins"); const c = await proxy(page, "POST", "admins", { email: "x@vc.test", password: "long-password-1234", role: "super-admin" }); const s = await proxy(page, "PUT", "sources/gh-1/secret", { secret: "x" });
    const r = { list: a.status, create: c.status, secret: s.status }; ok(r.list === 403 && r.create === 403 && r.secret === 403, JSON.stringify(r)); return JSON.stringify(r);
  });
  await ctx.close();
}
{
  const { ctx, page } = await newPage(b); const R = "viewer";
  await step(R, "login; lists visible; all write controls absent/disabled", "ok", async () => {
    await login(page, "viewer@vc.test"); await page.waitForURL("**/admin/dashboard"); await page.getByTestId("metric-active-students").waitFor(); await shot(page, "viewer-dashboard");
    const found: string[] = [];
    for (const path of ["/admin/sites", "/admin/sources", "/admin/sites/demo-college"]) {
      await page.goto(path); await page.getByTestId("read-only-note").or(page.getByTestId("keys-table")).first().waitFor();
      for (const id of ["add-site", "revoke-site", "unrevoke-site", "add-source", "test-source", "sync-source", "set-secret", "rotate-pub", "rotate-srv", "save-site"]) { const els = page.getByTestId(id); for (let i = 0; i < await els.count(); i++) if (await els.nth(i).isEnabled()) found.push(`${path} ${id}`); }
    }
    ok(found.length === 0, "enabled: " + found.join(",")); await page.goto("/admin/sites"); await page.getByTestId("sites-table").waitFor(); await shot(page, "viewer-sites"); return "zero enabled write controls on sites, site detail, sources";
  });
  await step(R, "forced writes through proxy: 403 for every write route", "403", async () => {
    const out: Record<string, number> = {};
    for (const [m, p, body] of [["POST", "sites", { name: "forced" }], ["POST", "sources/gh-1/test", {}], ["POST", "sources/gh-1/sync", {}], ["POST", "sites/demo-college/revoke", {}], ["PUT", "sources/gh-1/secret", { secret: "x" }], ["POST", "admins", { email: "q@vc.test", password: "long-password-1234", role: "viewer" }]] as const)
      out[m + " " + p] = (await proxy(page, m, p, body)).status;
    ok(Object.values(out).every(s => s === 403), JSON.stringify(out)); return JSON.stringify(out);
  });
  await step(R, "cookie alone authorises nothing (no Authorization header) incl. a write", "401", async () => {
    const g = await proxy(page, "GET", "sites", undefined, true); const w = await proxy(page, "POST", "sites", { name: "csrfish" }, true);
    ok(g.status === 401 && w.status === 401, JSON.stringify({ g: g.status, w: w.status })); return JSON.stringify({ get: g.status, post: w.status });
  });
  await step(R, "proxy hostile paths do not escape the admin API", "no foreign 200", async () => {
    const out: Record<string, number> = {};
    for (const p of ["..%2fme", "%2e%2e/%2e%2e/api/sessions", "http://evil.example/x", "//evil.example/x", "me%00"]) out[p] = (await proxy(page, "GET", p)).status;
    ok(!Object.values(out).some(s => s === 200), JSON.stringify(out)); return JSON.stringify(out);
  });
  await ctx.close();
}
for (const [role, email] of [["super-admin", "super@vc.test"], ["admin", "admin@vc.test"], ["viewer", "viewer@vc.test"]] as const) {
  const { ctx, page } = await newPage(b, 360, 740); await login(page, email); await page.waitForURL("**/admin/dashboard");
  for (const path of ["/admin/dashboard", "/admin/sites", "/admin/sites/demo-college", "/admin/sources", "/admin/audit", ...(role === "super-admin" ? ["/admin/admins"] : [])]) {
    await step(`${role}@360`, `no horizontal scroll ${path}`, "scrollWidth<=clientWidth", async () => {
      await page.goto(path); await page.locator("main").first().waitFor(); await page.waitForTimeout(500); await shot(page, `w360-${role}-${path.replace(/\//g, "_")}`);
      const w = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth })); ok(w.sw <= w.cw, `${w.sw} > ${w.cw}`); return `${w.sw} <= ${w.cw}`;
    });
  }
  await ctx.close();
}
await b.close();
writeFileSync(join(OUT, "step-log.json"), JSON.stringify(log, null, 2));
writeFileSync(join(OUT, "step-log.md"), "# Checker A admin UI walk (real withAdminRoutes API + next dev)\n\n| role | step | expected | observed | result |\n|---|---|---|---|---|\n" + log.map(s => `| ${s.role} | ${s.step} | ${s.expected} | ${s.observed.replace(/\|/g, "/")} | ${s.pass ? "PASS" : "FAIL"} |`).join("\n") + "\n");
console.error(`${log.filter(s => s.pass).length}/${log.length} passed`);
process.exit(log.every(s => s.pass) ? 0 : 1);
