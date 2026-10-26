/**
 * vc-admin-control / VA19 (unit vca-ui): the per-role browser walk against the dev server and the STUB admin API (tests/admin-stub-api.ts).
 * A smoke with a mocked API only: the real walk happens after the admin API is integrated.
 *
 *   VC_ADMIN_API_URL=http://127.0.0.1:3119 pnpm exec next dev --webpack --port 3118     (apps/web)
 *   VC_STUB_PORT=3119 pnpm exec tsx tests/admin-stub-api.ts                              (apps/web)
 *   VC_WALK_BASE=http://localhost:3118 VC_WALK_STUB=http://127.0.0.1:3119 VC_WALK_OUT=<dir> pnpm exec tsx tests/admin-walk.ts
 *
 * Writes <dir>/step-log.json (+ step-log.md) and screenshots. Exits 1 if any step failed.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

const BASE = process.env.VC_WALK_BASE ?? "http://localhost:3118";
const STUB = process.env.VC_WALK_STUB ?? "http://127.0.0.1:3119";
const OUT = process.env.VC_WALK_OUT ?? join(process.cwd(), "walk-out");
const PASSWORD = "stub-password-1";
mkdirSync(OUT, { recursive: true });

interface Step { role: string; step: string; expected: string; observed: string; pass: boolean }
const log: Step[] = [];
const consoleErrors: string[] = [];

async function step(role: string, name: string, expected: string, fn: () => Promise<string>): Promise<void> {
  try {
    const observed = await fn();
    log.push({ role, step: name, expected, observed, pass: true });
    console.error(`PASS ${role} :: ${name} :: ${observed}`);
  } catch (e) {
    const observed = e instanceof Error ? e.message.split("\n")[0] : String(e);
    log.push({ role, step: name, expected, observed, pass: false });
    console.error(`FAIL ${role} :: ${name} :: ${observed}`);
  }
}

function ok(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const shot = async (page: Page, name: string) => page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });

async function stub(path: string, body?: unknown): Promise<void> {
  await fetch(`${STUB}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
}

async function newPage(browser: Browser, width = 1100, height = 800): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport: { width, height }, baseURL: BASE });
  const page = await ctx.newPage();
  page.on("console", m => {
    if (m.type() === "error") consoleErrors.push(`${page.url()} ${m.text()}`.slice(0, 300));
  });
  return { ctx, page };
}

async function login(page: Page, email: string, password = PASSWORD): Promise<void> {
  await page.goto("/admin/login");
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-password").fill(password);
  await page.getByTestId("login-submit").click();
}

async function storageAudit(page: Page): Promise<string> {
  const s = await page.evaluate(() => ({ local: Object.keys(localStorage), session: Object.keys(sessionStorage), url: location.href, cookieJs: document.cookie }));
  ok(s.local.length === 0 && s.session.length === 0, `storage not empty: ${JSON.stringify(s)}`);
  ok(!/token|stub\.|jwt/i.test(s.url), `token-like text in URL ${s.url}`);
  ok(!/vc_admin_session/.test(s.cookieJs), "the session cookie is visible to page script");
  return "localStorage and sessionStorage empty, no token in the URL, session cookie not readable by script";
}

async function noHorizontalScroll(page: Page): Promise<string> {
  const w = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  ok(w.sw <= w.cw, `horizontal scroll: scrollWidth ${w.sw} > clientWidth ${w.cw}`);
  return `scrollWidth ${w.sw} <= clientWidth ${w.cw}`;
}

async function main(): Promise<void> {
  await stub("/__stub/reset");
  const browser = await chromium.launch();

  // ---------- anonymous / negative paths ----------
  {
    const { ctx, page } = await newPage(browser);
    await step("anon", "missing session redirects to login", "GET /admin/dashboard with no cookie lands on /admin/login", async () => {
      await page.goto("/admin/dashboard");
      await page.waitForURL("**/admin/login");
      await shot(page, "anon-login");
      return `landed on ${new URL(page.url()).pathname}`;
    });
    await step("anon", "wrong password shows the generic error", "same sentence for a wrong password and an unknown email, no cookie set", async () => {
      await login(page, "viewer@vc.test", "not-the-password");
      const msg1 = await page.getByTestId("error-banner").innerText();
      await login(page, "nobody@vc.test", "not-the-password");
      const msg2 = await page.getByTestId("error-banner").innerText();
      ok(msg1 === msg2 && /incorrect/i.test(msg1), `messages differ or not generic: "${msg1}" vs "${msg2}"`);
      const cookies = await ctx.cookies();
      ok(!cookies.some(c => c.name === "vc_admin_session"), "a cookie was set after a failed login");
      await shot(page, "anon-wrong-password");
      return `both attempts: "${msg1}"; no session cookie`;
    });
    await ctx.close();
  }

  // ---------- super-admin ----------
  {
    const { ctx, page } = await newPage(browser);
    const R = "super-admin";
    await step(R, "login lands on the dashboard; cookie flags; no browser storage", "HttpOnly + SameSite=Strict cookie, URL /admin/dashboard, storage empty", async () => {
      await login(page, "super@vc.test");
      await page.waitForURL("**/admin/dashboard");
      await page.getByTestId("metric-active-students").waitFor();
      const c = (await ctx.cookies()).find(x => x.name === "vc_admin_session");
      ok(c, "no session cookie");
      ok(c.httpOnly && c.sameSite === "Strict" && c.path === "/", `cookie flags ${JSON.stringify({ h: c.httpOnly, s: c.sameSite, p: c.path, sec: c.secure })}`);
      ok(c.secure === false, "localhost cookie should not be Secure");
      await shot(page, "super-dashboard");
      return `cookie HttpOnly=${c.httpOnly} SameSite=${c.sameSite} Secure=${c.secure}; ${await storageAudit(page)}`;
    });
    await step(R, "dashboard shows every metric and the 50 INR target", "all metric ids present, cost per student vs target", async () => {
      for (const id of ["metric-active-students", "metric-tokens", "metric-cost-per-student", "metric-latency-p50", "metric-latency-p95", "metric-guardrail", "metric-unanswered", "metric-chat", "metric-voice", "cost-status"]) {
        ok(await page.getByTestId(id).count(), `missing ${id}`);
      }
      const rows = await page.locator('[data-testid="per-site-day"] tbody tr').count();
      ok(rows >= 7, `per-site-day rows ${rows}`);
      const text = await page.getByTestId("cost-status").innerText();
      return `${rows} per-site-day rows; cost status "${text}" (target 50 INR)`;
    });
    await step(R, "Admins: create an admin, then set the role", "new row appears, role change persists after reload", async () => {
      await page.getByRole("link", { name: "Admins" }).click();
      await page.waitForURL("**/admin/admins");
      await page.getByTestId("admin-email").fill("newbie@vc.test");
      await page.getByTestId("admin-password").fill("a-long-initial-password");
      await page.getByTestId("admin-role").selectOption("viewer");
      await page.getByTestId("create-admin").click();
      await page.getByText("newbie@vc.test").waitFor();
      const row = page.locator('tr:has-text("newbie@vc.test")');
      await row.locator("select").selectOption("admin");
      await page.waitForTimeout(400);
      await page.reload();
      await page.getByText("newbie@vc.test").waitFor();
      const value = await page.locator('tr:has-text("newbie@vc.test") select').inputValue();
      ok(value === "admin", `role after reload is ${value}`);
      await shot(page, "super-admins");
      return "newbie@vc.test created as viewer, set to admin, still admin after reload";
    });
    await step(R, "Sources: set a secret; it never re-displays", "state flips to 'set', the secret text is nowhere on the page, also after reload", async () => {
      await page.getByRole("link", { name: "Sources" }).click();
      await page.waitForURL("**/admin/sources");
      await page.getByTestId("secret-state-gh-frontend").waitFor();
      ok((await page.getByTestId("secret-state-gh-frontend").innerText()) === "not set", "expected 'not set' first");
      const SECRET = "ghp_WALK_SECRET_VALUE_12345";
      await page.getByTestId("secret-input-gh-frontend").fill(SECRET);
      await page.getByTestId("set-secret").first().click();
      await page.waitForFunction(() => document.querySelector('[data-testid="secret-state-gh-frontend"]')?.textContent === "set");
      ok(!(await page.content()).includes(SECRET), "secret text present in the DOM after saving");
      ok((await page.getByTestId("secret-input-gh-frontend").inputValue()) === "", "secret input was not cleared");
      await page.reload();
      await page.getByTestId("secret-state-gh-frontend").waitFor();
      ok(!(await page.content()).includes(SECRET), "secret text present after reload");
      await shot(page, "super-sources");
      return "'not set' -> 'set'; secret text absent from the DOM after save and after reload; input cleared";
    });
    await step(R, "sign out returns to login and the cookie is gone", "cookie cleared, /admin/dashboard redirects to login", async () => {
      await page.getByTestId("sign-out").click();
      await page.waitForURL("**/admin/login");
      ok(!(await ctx.cookies()).some(c => c.name === "vc_admin_session"), "cookie still present");
      await page.goto("/admin/dashboard");
      await page.waitForURL("**/admin/login");
      return "signed out; protected page redirects to login";
    });
    await ctx.close();
  }

  // ---------- admin ----------
  {
    const { ctx, page } = await newPage(browser);
    const R = "admin";
    let firstKey = "";
    await step(R, "login; no Admins nav; /admin/admins is denied", "Admins link absent, page says super-admin only, no API call made for the list", async () => {
      await login(page, "admin@vc.test");
      await page.waitForURL("**/admin/dashboard");
      await page.getByTestId("metric-active-students").waitFor();
      ok((await page.getByRole("link", { name: "Admins" }).count()) === 0, "Admins link visible to admin");
      await page.goto("/admin/admins");
      await page.getByTestId("admins-denied").waitFor();
      return "no Admins link; denied note shown";
    });
    await step(R, "Sites: add a site with origins; both keys shown once", "reveal panel with vck_pub_ and vck_srv_ keys; gone after reload", async () => {
      await page.goto("/admin/sites");
      await page.getByTestId("site-name").fill("Demo College");
      await page.getByTestId("site-origins").fill("https://demo.example\nhttps://www.demo.example");
      await page.getByTestId("add-site").click();
      await page.getByTestId("key-reveal").waitFor();
      firstKey = await page.getByTestId("revealed-key-pub").innerText();
      const srv = await page.getByTestId("revealed-key-srv").innerText();
      ok(firstKey.startsWith("vck_pub_demo-college_") && srv.startsWith("vck_srv_demo-college_"), `keys ${firstKey.slice(0, 24)} ${srv.slice(0, 24)}`);
      await shot(page, "admin-key-shown");
      await page.reload();
      await page.getByTestId("site-row-demo-college").waitFor();
      const html = await page.content();
      ok(!html.includes(firstKey) && !html.includes(srv), "full key still on the page after reload");
      ok((await page.getByTestId("key-reveal").count()) === 0, "reveal panel survived the reload");
      await shot(page, "admin-key-gone-after-reload");
      return "pub and srv keys shown, then absent from the DOM after reload (only the prefix remains)";
    });
    await step(R, "Keys: rotate shows a new key once; old prefix replaced", "confirm step, new key panel, new key differs, gone after reload", async () => {
      await page.getByTestId("site-link-demo-college").click();
      await page.waitForURL("**/admin/sites/demo-college");
      await page.getByTestId("rotate-pub").click();
      await page.getByTestId("confirm-rotate-pub").click();
      await page.getByTestId("revealed-key-pub").waitFor();
      const k = await page.getByTestId("revealed-key-pub").innerText();
      ok(k.startsWith("vck_pub_demo-college_") && k !== firstKey, "rotated key missing or unchanged");
      await page.reload();
      await page.getByTestId("keys-table").waitFor();
      ok(!(await page.content()).includes(k), "rotated key still present after reload");
      return "rotated pub key shown once and gone after reload";
    });
    await step(R, "Keys: revoke then unrevoke", "status badge revoked, rotate buttons gone; unrevoke restores", async () => {
      await page.getByTestId("revoke-site").click();
      await page.waitForFunction(() => document.querySelector('[data-testid="site-status"]')?.textContent === "revoked");
      ok((await page.getByTestId("rotate-pub").count()) === 0, "rotate offered on a revoked site");
      await shot(page, "admin-revoked");
      await page.getByTestId("unrevoke-site").click();
      await page.waitForFunction(() => document.querySelector('[data-testid="site-status"]')?.textContent === "active");
      return "revoked (no rotate), unrevoked (active)";
    });
    await step(R, "Sources: add a GitHub source, Test, Sync", "source appears; Test explains the missing secret; Sync reports ok", async () => {
      await page.goto("/admin/sources");
      await page.getByTestId("source-id").fill("gh-auth");
      await page.getByTestId("source-owner").fill("vidysea");
      await page.getByTestId("source-repo").fill("auth");
      await page.getByTestId("source-service").selectOption("auth");
      await page.getByTestId("source-tokenRef").fill("GITHUB_TOKEN");
      await page.getByTestId("add-source").click();
      await page.getByTestId("source-card-gh-auth").waitFor();
      const card = page.getByTestId("source-card-gh-auth");
      await card.getByTestId("test-source").click();
      await page.getByTestId("source-result-gh-auth").waitFor();
      const t = await page.getByTestId("source-result-gh-auth").innerText();
      await card.getByTestId("sync-source").click();
      await page.waitForFunction(() => /Sync ok/.test(document.querySelector('[data-testid="source-result-gh-auth"]')?.textContent ?? ""));
      const s = await page.getByTestId("source-result-gh-auth").innerText();
      ok((await card.getByTestId("set-secret").count()) === 0, "admin was offered the secret setter");
      await shot(page, "admin-sources");
      return `Test: "${t}"; Sync: "${s}"; no secret setter for admin`;
    });
    await step(R, "stale role: a forced write returns 403 and the page shows it as an error", "after the server downgrades the account, Add site shows 'not allowed' in an alert", async () => {
      await page.goto("/admin/sites");
      await page.getByTestId("add-site").waitFor();
      await stub("/__stub/downgrade", { email: "admin@vc.test" });
      await page.getByTestId("site-name").fill("Forced Write");
      await page.getByTestId("add-site").click();
      const msg = await page.getByTestId("error-banner").innerText();
      ok(/not allowed/i.test(msg), `banner "${msg}"`);
      await shot(page, "admin-forced-403");
      return `banner: "${msg}"`;
    });
    await ctx.close();
  }

  // ---------- viewer ----------
  {
    const { ctx, page } = await newPage(browser);
    const R = "viewer";
    await step(R, "login -> Dashboard", "metrics visible", async () => {
      await login(page, "viewer@vc.test");
      await page.waitForURL("**/admin/dashboard");
      await page.getByTestId("metric-active-students").waitFor();
      await shot(page, "viewer-dashboard");
      return "dashboard rendered";
    });
    await step(R, "lists visible, every write control absent or disabled", "no add/revoke/test/sync/secret/create controls", async () => {
      const found: string[] = [];
      for (const path of ["/admin/sites", "/admin/sources", "/admin/sites/pathlynks"]) {
        await page.goto(path);
        await page.getByTestId("read-only-note").or(page.getByTestId("keys-table")).first().waitFor();
        for (const id of ["add-site", "revoke-site", "unrevoke-site", "add-source", "test-source", "sync-source", "set-secret", "rotate-pub", "rotate-srv", "save-site"]) {
          const els = page.getByTestId(id);
          for (let i = 0; i < (await els.count()); i++) if (await els.nth(i).isEnabled()) found.push(`${path} ${id}`);
        }
      }
      ok(found.length === 0, `live write controls for viewer: ${found.join(", ")}`);
      await page.goto("/admin/sites");
      await page.getByTestId("sites-table").waitFor();
      await shot(page, "viewer-sites");
      await page.goto("/admin/sources");
      await page.getByTestId("secret-state-gh-frontend").waitFor();
      await shot(page, "viewer-sources");
      return "sites, site detail and sources render their lists; zero enabled write controls";
    });
    await step(R, "forced write call returns 403", "POST /sites through the proxy with the viewer's token -> 403", async () => {
      const r = await page.evaluate(async () => {
        const me = await (await fetch("/api/admin-session")).json();
        const res = await fetch("/api/admin-session/proxy/sites", { method: "POST", headers: { authorization: `Bearer ${me.token}`, "content-type": "application/json" }, body: JSON.stringify({ name: "forced", origins: [] }) });
        return { status: res.status, body: await res.text() };
      });
      ok(r.status === 403, `status ${r.status}`);
      return `HTTP ${r.status} ${r.body}`;
    });
    await step(R, "expired session returns to login", "after the API invalidates every token, the next navigation lands on /admin/login", async () => {
      await stub("/__stub/expire");
      await page.getByRole("link", { name: "Audit" }).click();
      await page.waitForURL("**/admin/login");
      ok(!(await ctx.cookies()).some(c => c.name === "vc_admin_session"), "expired cookie not cleared");
      await shot(page, "viewer-expired-login");
      return "401 from the API -> cookie cleared -> /admin/login";
    });
    await ctx.close();
  }

  // ---------- 360 px ----------
  for (const [role, email] of [["super-admin", "super@vc.test"], ["admin", "admin@vc.test"], ["viewer", "viewer@vc.test"]] as const) {
    await stub("/__stub/reset");
    const { ctx, page } = await newPage(browser, 360, 740);
    await login(page, email);
    for (const path of ["/admin/dashboard", "/admin/sites", "/admin/sites/pathlynks", "/admin/sources", "/admin/audit", ...(role === "super-admin" ? ["/admin/admins"] : [])]) {
      await step(`${role}@360`, `no horizontal scroll on ${path}`, "scrollWidth <= clientWidth at 360 px", async () => {
        await page.goto(path);
        await page.locator("main").first().waitFor();
        await page.waitForTimeout(500);
        await shot(page, `w360-${role}-${path.replace(/\//g, "_")}`);
        return noHorizontalScroll(page);
      });
    }
    await ctx.close();
  }
  await page360Login(browser);

  await browser.close();
  const failed = log.filter(s => !s.pass);
  writeFileSync(join(OUT, "step-log.json"), JSON.stringify({ base: BASE, steps: log, consoleErrors, passed: log.length - failed.length, failed: failed.length }, null, 2));
  writeFileSync(
    join(OUT, "step-log.md"),
    ["# Admin UI browser walk (stub API smoke)", "", `Base ${BASE}, stub ${STUB}. ${log.length - failed.length}/${log.length} steps passed. Console errors: ${consoleErrors.length}.`, "", "| Role | Step | Expected | Observed | Result |", "|---|---|---|---|---|", ...log.map(s => `| ${s.role} | ${s.step} | ${s.expected} | ${s.observed.replace(/\|/g, "/")} | ${s.pass ? "PASS" : "FAIL"} |`), "", ...consoleErrors.map(e => `- console error: ${e}`)].join("\n"),
  );
  console.error(`done: ${log.length - failed.length}/${log.length} passed; console errors ${consoleErrors.length}`);
  process.exit(failed.length ? 1 : 0);
}

async function page360Login(browser: Browser): Promise<void> {
  const { ctx, page } = await newPage(browser, 360, 740);
  await step("anon@360", "login page has no horizontal scroll", "scrollWidth <= clientWidth at 360 px", async () => {
    await page.goto("/admin/login");
    await page.getByTestId("login-form").waitFor();
    await shot(page, "w360-login");
    return noHorizontalScroll(page);
  });
  await ctx.close();
}

main().catch(e => {
  console.error(e);
  process.exit(2);
});
