import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
const BASE = "http://127.0.0.1:5191"; const OUT = process.env.OUT as string; mkdirSync(OUT, { recursive: true });
const log: string[] = []; let fails = 0;
function rec(ok: boolean, n: string, d: string) { if (!ok) fails++; const l = `${ok ? "PASS" : "FAIL"} | ${n} | ${d}`; log.push(l); console.error(l); }
const box = async (p: Page, sel: string) => { const b = await p.locator(sel).boundingBox(); if (!b) throw new Error("no box " + sel); return b; };
const b = await chromium.launch();
for (const [w, h] of [[1280, 800], [360, 640]] as const) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } }); const page = await ctx.newPage(); const T = `${w}x${h}`;
  const reqs: string[] = []; page.on("request", r => { if (r.url().includes("/v1/") || r.url().includes("/api/")) reqs.push(r.method() + " " + new URL(r.url()).pathname); });
  await page.route("**/widget/voice.js", r => r.fulfill({ status: 200, contentType: "application/javascript", body: readFileSync("D:/vc/.worktrees/vca-int/apps/widget/src/voice.js", "utf8") }));
  await page.goto(BASE + "/demo.html?voice=on"); await page.locator(".bubble").click(); await page.locator(".panel").waitFor();
  await page.screenshot({ path: join(OUT, `widget-${T}-1-open.png`) });
  try {
    const p0 = await box(page, ".panel"); rec(p0.x >= 0 && p0.y >= 0 && p0.x + p0.width <= w && p0.y + p0.height <= h, `${T} open fits viewport`, JSON.stringify(p0));
    // drag header far outside the viewport -> clamped
    const hd = await box(page, ".panel .head"); await page.mouse.move(hd.x + 40, hd.y + 10); await page.mouse.down(); await page.mouse.move(-500, -500, { steps: 6 }); await page.mouse.up();
    const p1 = await box(page, ".panel"); rec(p1.x >= 0 && p1.y >= 0 && p1.x + p1.width <= w + 0.5 && p1.y + p1.height <= h + 0.5, `${T} drag past top-left clamps in viewport`, JSON.stringify(p1));
    await page.mouse.move(p1.x + 40, p1.y + 10); await page.mouse.down(); await page.mouse.move(w + 900, h + 900, { steps: 6 }); await page.mouse.up();
    const p2 = await box(page, ".panel"); rec(p2.x >= 0 && p2.y >= 0 && p2.x + p2.width <= w + 0.5 && p2.y + p2.height <= h + 0.5, `${T} drag past bottom-right clamps in viewport`, JSON.stringify(p2));
    await page.screenshot({ path: join(OUT, `widget-${T}-2-dragged.png`) });
    // resize to tiny -> min 300x380 (or viewport if smaller)
    const g = await box(page, ".panel .grip"); await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2); await page.mouse.down(); await page.mouse.move(g.x - 900, g.y - 900, { steps: 8 }); await page.mouse.up();
    const p3 = await box(page, ".panel"); rec(Math.round(p3.width) >= Math.min(300, w) - 1 && Math.round(p3.height) >= Math.min(380, h) - 1 && p3.width < 305, `${T} resize small floors at 300x380`, JSON.stringify({ w: p3.width, h: p3.height }));
    await page.screenshot({ path: join(OUT, `widget-${T}-3-resized-min.png`) });
  } catch (e) { rec(false, `${T} drag/resize`, String(e).split("\n")[0] as string); }
  try {
    // chat then voice toggle: history shared
    await page.locator(".panel textarea").fill("Is Computer Science a good option?"); await page.locator(".panel .send").click();
    await page.locator(".panel .log").getByText("Computer Science is a strong option").waitFor();
    const before = (await page.locator(".panel .log").innerText()).length;
    await page.locator(".panel .mode", { hasText: "Voice" }).click(); await page.waitForTimeout(300);
    const modeV = await page.locator(".panel").getAttribute("data-mode"); await page.locator(".panel .mode", { hasText: "Chat" }).click(); await page.waitForTimeout(300);
    const after = (await page.locator(".panel .log").innerText()); rec(modeV === "voice" && after.includes("Computer Science is a strong option") && after.length >= before, `${T} Chat|Voice toggle keeps one shared history`, `mode after click=${modeV}; history retained`);
    await page.screenshot({ path: join(OUT, `widget-${T}-4-toggle.png`) });
  } catch (e) { rec(false, `${T} chat/voice toggle`, String(e).split("\n")[0] as string); }
  try {
    const st = await page.evaluate(() => ({ l: Object.keys(localStorage), s: Object.keys(sessionStorage), c: document.cookie, idb: (indexedDB as unknown as { databases?: () => Promise<unknown[]> }).databases ? undefined : "n/a" }));
    rec(st.l.length === 0 && st.s.length === 0 && st.c === "", `${T} no localStorage/sessionStorage/cookies`, JSON.stringify(st));
    const [popup] = await Promise.all([page.waitForEvent("popup", { timeout: 8000 }).catch(() => null), page.locator(".panel .pop").click()]);
    const url = popup ? popup.url() : "(no popup event)"; rec(!!popup && /\/vc-popout\?site=demo$/.test(url), `${T} pop-out URL carries only the site id`, url);
    if (popup) await popup.close();
  } catch (e) { rec(false, `${T} storage/pop-out`, String(e).split("\n")[0] as string); }
  const sw = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth); rec(sw, `${T} no horizontal page scroll`, String(sw));
  await ctx.close();
}
await b.close();
writeFileSync(join(OUT, "widget-step-log.md"), "# Checker A widget walk (apps/widget stub-server, port 5191)\n\n" + log.map(l => "- " + l).join("\n") + "\n");
console.error(`fails=${fails}`); process.exit(fails ? 1 : 0);
