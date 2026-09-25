/**
 * T-008 live browser evidence. Starts the demo server (next dev, in-process fake db, mock provider,
 * synthetic threads), drives a real Chromium through Playwright, reads the fake db back through the
 * demo-only read-back route, and writes
 *   qa/evidence/browser-t-008-approval-ui-<date>/report.json (+ screenshots).
 * It stops only the server process tree it started itself (by that PID).
 *
 * Run: pnpm --filter @vc/web evidence:browser
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright";

const PORT = Number(process.env.VC_EVIDENCE_PORT ?? 3118);
const BASE = `http://localhost:${PORT}`;
const DATE = new Date().toISOString().slice(0, 10);
const REPO = join(process.cwd(), "..", "..");
const OUT = join(REPO, "qa", "evidence", `browser-t-008-approval-ui-${DATE}`);

const PAUSED = "scribe:demo-session-1";
const FENCED = "scribe:demo-session-2";
const IN_PROGRESS = "scribe:demo-session-3";
const url = (threadId: string) => `${BASE}/approvals/${encodeURIComponent(threadId)}`;

interface Interaction {
  did: string;
  expected: string;
  observed: string;
  pass: boolean;
}
interface PageRecord {
  url: string;
  label: string;
  consoleErrors: number;
  /** Console errors that are the browser's own log line for an HTTP status this step expects. */
  expectedStatusLogs: number;
  unexpectedConsoleErrors: number;
  messages: string[];
}

const interactions: Interaction[] = [];
const pages: PageRecord[] = [];

function record(did: string, expected: string, observed: string, pass: boolean) {
  interactions.push({ did, expected, observed, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${did}  ->  ${observed}`);
}

function startServer(): Promise<ChildProcess> {
  const nextBin = join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
  const child = spawn(process.execPath, [nextBin, "dev", "--webpack", "--port", String(PORT)], {
    cwd: process.cwd(),
    env: { ...process.env, VC_WEB_MODE: "demo", NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`next dev did not become ready:\n${log}`)), 120_000);
    const onData = (buf: Buffer) => {
      log += buf.toString();
      if (/Ready in/.test(log)) {
        clearTimeout(timer);
        resolve(child);
      }
    };
    child.stdout!.on("data", onData);
    child.stderr!.on("data", onData);
    child.on("exit", (code) => reject(new Error(`next dev exited (${code}):\n${log}`)));
  });
}

/** Stops the server tree this script started (its own PID only). */
function stopServer(child: ChildProcess) {
  if (child.pid === undefined) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/T", "/F", "/PID", String(child.pid)], { stdio: "ignore" });
  else child.kill("SIGTERM");
}

async function track(page: Page, label: string, expectedStatuses: number[], action: () => Promise<void>) {
  const messages: string[] = [];
  const onConsole = (msg: { type(): string; text(): string }) => {
    if (msg.type() === "error") messages.push(msg.text());
  };
  const onPageError = (err: Error) => messages.push(`pageerror: ${err.message}`);
  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  try {
    await action();
    await page.waitForTimeout(300);
  } finally {
    page.off("console", onConsole);
    page.off("pageerror", onPageError);
  }
  const isExpected = (m: string) =>
    expectedStatuses.some((s) => m.includes(`status of ${s}`)) && m.startsWith("Failed to load resource");
  const expectedStatusLogs = messages.filter(isExpected).length;
  pages.push({
    url: page.url(),
    label,
    consoleErrors: messages.length,
    expectedStatusLogs,
    unexpectedConsoleErrors: messages.length - expectedStatusLogs,
    messages,
  });
}

async function readback(page: Page, studentId: string) {
  const res = await page.request.get(`${BASE}/api/demo/readback?studentId=${studentId}`);
  return (await res.json()) as {
    facts: { key: string; value: unknown; active: boolean }[];
    sessions: { sessionId: string; summary?: string; summaryWithheldReason?: string }[];
    claims: number;
  };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1100, height: 900 } });
    // Warm-up: compile every route once before the tabs open. In next dev a route compiled for the
    // first time can hot-reload already-open tabs, which would silently replace tab B's stale form.
    // Read-only requests only: GETs never write (B3).
    for (const path of ["/", `/approvals/${encodeURIComponent(PAUSED)}`, `/api/approvals/${encodeURIComponent(PAUSED)}`, "/api/demo/readback?studentId=demo-student-1"]) {
      await context.request.get(`${BASE}${path}`, { timeout: 180_000 });
    }
    const a = await context.newPage();

    // 1. Index lists the synthetic demo threads.
    await track(a, "index", [], async () => {
      await a.goto(BASE, { waitUntil: "networkidle", timeout: 180_000 });
      const links = await a.locator(".thread-list a").allTextContents();
      record("open the index page", "the 3 seeded demo threads are listed", `links: ${links.join(", ")}`, links.length === 3 && links.includes(PAUSED));
    });

    // 2. The paused thread renders the proposal.
    await track(a, "approval (tab A)", [], async () => {
      await a.goto(url(PAUSED), { waitUntil: "networkidle", timeout: 180_000 });
      await a.waitForSelector('form[data-state="awaiting_approval"]', { timeout: 60_000 });
      const keys = await a.locator("article[data-fact-key]").evaluateAll((els) => els.map((e) => e.getAttribute("data-fact-key")));
      const dropped = await a.locator("tr[data-dropped-key]").evaluateAll((els) => els.map((e) => e.getAttribute("data-dropped-key")));
      const summary = (await a.locator('[data-testid="summary"]').textContent()) ?? "";
      const quote = (await a.locator('article[data-fact-key="budget_inr_per_year"] blockquote').textContent()) ?? "";
      const conf = (await a.locator('article[data-fact-key="budget_inr_per_year"] .conf').textContent()) ?? "";
      record(
        "open the paused thread",
        "4 proposed facts with quote/turn/confidence, 2 dropped facts with reasons, the draft summary",
        `facts=[${keys.join(", ")}] dropped=[${dropped.join(", ")}] budget quote="${quote}" confidence=${conf} summary starts "${summary.slice(0, 40)}"`,
        keys.length === 4 && dropped.length === 2 && quote === "around 20 lakh rupees a year" && conf === "66%" && summary.includes("Canada"),
      );
      const submitDisabled = await a.locator('[data-testid="submit"]').isDisabled();
      record("look at Submit before deciding", "Submit is disabled until every fact and the summary are decided", `disabled=${submitDisabled}`, submitDisabled);
      await a.screenshot({ path: join(OUT, "01-pending.png"), fullPage: true });
    });

    // 3. Tab B opens the same thread BEFORE tab A submits (it will lose later).
    const b = await context.newPage();
    await track(b, "approval (tab B, opened before tab A submits)", [], async () => {
      await b.goto(url(PAUSED), { waitUntil: "networkidle", timeout: 180_000 });
      await b.waitForSelector('form[data-state="awaiting_approval"]', { timeout: 60_000 });
    });

    // 4. Decide per fact in tab A and submit.
    await track(a, "decide + submit (tab A)", [], async () => {
      await a.click('button[data-fact="targetCountry"][data-decision="approve"]');
      record("approve targetCountry", "the fact is marked approved", `aria-checked=${await a.getAttribute('button[data-fact="targetCountry"][data-decision="approve"]', "aria-checked")}`, (await a.getAttribute('button[data-fact="targetCountry"][data-decision="approve"]', "aria-checked")) === "true");
      await a.click('button[data-fact="intendedMajor"][data-decision="reject"]');
      record("reject intendedMajor", "the fact is marked rejected", `aria-checked=${await a.getAttribute('button[data-fact="intendedMajor"][data-decision="reject"]', "aria-checked")}`, (await a.getAttribute('button[data-fact="intendedMajor"][data-decision="reject"]', "aria-checked")) === "true");
      await a.click('button[data-fact="preferredIntake"][data-decision="edit"]');
      await a.fill('input[data-edit-for="preferredIntake"]', "January 2028");
      const edited = await a.inputValue('input[data-edit-for="preferredIntake"]');
      record("edit preferredIntake to \"January 2028\"", "the edit field holds the new value", `value="${edited}"`, edited === "January 2028");
      await a.click('button[data-fact="budget_inr_per_year"][data-decision="approve"]');
      record("approve budget_inr_per_year (the 4th fact must be decided too)", "the fact is marked approved", "clicked", true);
      await a.click('button[data-summary="withhold"]');
      const count = await a.locator('[data-testid="decided-count"]').textContent();
      const enabled = !(await a.locator('[data-testid="submit"]').isDisabled());
      record("withhold the summary", "all 4 facts decided and Submit enabled", `decided=${count} submitEnabled=${enabled}`, count === "4/4" && enabled);
      await a.screenshot({ path: join(OUT, "02-decided.png"), fullPage: true });

      const pre = await readback(a, "demo-student-1");
      record("read back the fake db BEFORE submit (B3)", "0 facts, 0 claims, no stored summary", `facts=${pre.facts.length} claims=${pre.claims} summary=${JSON.stringify(pre.sessions[0]?.summary)}`, pre.facts.length === 0 && pre.claims === 0 && pre.sessions[0]?.summary === undefined);

      await a.click('[data-testid="submit"]');
      await a.waitForSelector('[data-state="done"]', { timeout: 60_000 });
      const written = await a.locator("tr[data-written-key]").evaluateAll((els) => els.map((e) => e.getAttribute("data-written-key")));
      const outcome = await a.locator('[data-testid="outcome"]').textContent();
      record("submit", "resolved: outcome written, written facts = targetCountry, preferredIntake, budget_inr_per_year", `outcome=${outcome} written=[${written.join(", ")}]`, outcome === "written" && [...written].sort().join() === "budget_inr_per_year,preferredIntake,targetCountry");
      await a.screenshot({ path: join(OUT, "03-resolved.png"), fullPage: true });
    });

    // 5. Read back through the fake db.
    const rb = await readback(a, "demo-student-1");
    const active = Object.fromEntries(rb.facts.filter((f) => f.active).map((f) => [f.key, f.value]));
    record(
      "read back the fake db after submit",
      "exactly targetCountry=Canada, preferredIntake=January 2028, budget_inr_per_year=2000000 written; intendedMajor never written; summary withheld (\"\" + reason)",
      `active=${JSON.stringify(active)} allFactDocs=${rb.facts.length} summary=${JSON.stringify(rb.sessions[0]?.summary)} withheldReason=${JSON.stringify(rb.sessions[0]?.summaryWithheldReason)}`,
      Object.keys(active).sort().join() === "budget_inr_per_year,preferredIntake,targetCountry" &&
        active.targetCountry === "Canada" &&
        active.preferredIntake === "January 2028" &&
        active.budget_inr_per_year === 2000000 &&
        rb.facts.length === 3 &&
        !rb.facts.some((f) => f.key === "intendedMajor") &&
        rb.sessions[0]?.summary === "" &&
        typeof rb.sessions[0]?.summaryWithheldReason === "string",
    );

    // 6. Reload shows the resolved state.
    await track(a, "reload (tab A)", [], async () => {
      await a.reload({ waitUntil: "networkidle" });
      await a.waitForSelector('[data-state="done"]', { timeout: 60_000 });
      const written = await a.locator("tr[data-written-key]").count();
      const summaryTag = await a.getAttribute("[data-summary-decision]", "data-summary-decision");
      record("reload the page", "the resolved state (not the form) with 3 written facts and the summary withheld", `state=done written=${written} summaryDecision=${summaryTag}`, written === 3 && summaryTag === "withhold");
    });

    // 7. Tab B (still showing the stale form) submits a different decision -> already_resolved.
    await track(b, "second submit (tab B)", [409], async () => {
      for (const key of ["targetCountry", "intendedMajor", "preferredIntake", "budget_inr_per_year"]) {
        await b.click(`button[data-fact="${key}"][data-decision="approve"]`);
      }
      await b.click('button[data-summary="approve"]');
      await b.click('[data-testid="submit"]');
      await b.waitForSelector('[data-state="already_resolved"]', { timeout: 60_000 });
      const same = await b.getAttribute("[data-same-as-winner]", "data-same-as-winner");
      const winner = await b.locator("tr[data-written-key]").evaluateAll((els) => els.map((e) => e.getAttribute("data-written-key")));
      record("second submit of the same thread from a stale tab", "already_resolved, carrying the FIRST decision (3 facts), not this one", `state=already_resolved sameAsWinner=${same} winnerFacts=[${winner.join(", ")}]`, same === "false" && winner.length === 3 && !winner.includes("intendedMajor"));
      await b.screenshot({ path: join(OUT, "04-already-resolved.png"), fullPage: true });
    });
    const rb2 = await readback(a, "demo-student-1");
    record("read back after the second submit", "unchanged: still 3 fact docs, intendedMajor absent, summary still withheld", `allFactDocs=${rb2.facts.length} summary=${JSON.stringify(rb2.sessions[0]?.summary)}`, rb2.facts.length === 3 && !rb2.facts.some((f) => f.key === "intendedMajor") && rb2.sessions[0]?.summary === "");

    // 8. The other UI states.
    const c = await context.newPage();
    await track(c, "fenced thread", [423], async () => {
      await c.goto(url(FENCED), { waitUntil: "networkidle" });
      await c.waitForSelector('[data-state="fenced"]', { timeout: 60_000 });
      const leaked = await c.locator("article[data-fact-key]").count();
      record("open a thread whose student has an erasure in progress", "the fenced state, no fact data shown", `state=fenced factCards=${leaked}`, leaked === 0);
      await c.screenshot({ path: join(OUT, "05-fenced.png"), fullPage: true });
    });
    await track(c, "in-progress thread", [], async () => {
      await c.goto(url(IN_PROGRESS), { waitUntil: "networkidle" });
      await c.waitForSelector('[data-state="in_progress"]', { timeout: 60_000 });
      record("open a claimed thread whose write has not run", "the in-progress state", "state=in_progress", true);
      await c.screenshot({ path: join(OUT, "06-in-progress.png"), fullPage: true });
    });
    await track(c, "unknown thread", [404], async () => {
      await c.goto(url("scribe:no-such-session"), { waitUntil: "networkidle" });
      await c.waitForSelector('[data-state="not_found"]', { timeout: 60_000 });
      record("open an unknown thread", "the not-found state", "state=not_found", true);
    });
    await track(c, "mobile width", [], async () => {
      await c.setViewportSize({ width: 390, height: 844 });
      await c.goto(url(PAUSED), { waitUntil: "networkidle" });
      await c.waitForSelector('[data-state="done"]', { timeout: 60_000 });
      const overflow = await c.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      record("open the resolved thread at 390px width", "no horizontal page scroll", `horizontalOverflowPx=${overflow}`, overflow <= 0);
    });
  } finally {
    await browser.close();
    stopServer(server);
  }

  const report = {
    unit: "T-008 counsellor diff-approval UI",
    date: DATE,
    generatedAt: new Date().toISOString(),
    baseUrl: BASE,
    mode: "demo: next dev (webpack), in-process fake db via @vc/db getVcDb + real MongoDBSaver over the fake, MockProvider, synthetic threads; no MONGODB_URL, no Gemini",
    browser: `chromium ${browser.version()} (playwright, headless)`,
    pages,
    interactions,
    totals: {
      interactions: interactions.length,
      passed: interactions.filter((i) => i.pass).length,
      failed: interactions.filter((i) => !i.pass).length,
      consoleErrors: pages.reduce((n, p) => n + p.consoleErrors, 0),
      unexpectedConsoleErrors: pages.reduce((n, p) => n + p.unexpectedConsoleErrors, 0),
    },
  };
  writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(`\nreport: ${join(OUT, "report.json")}`);
  console.log(JSON.stringify(report.totals));
  if (report.totals.failed > 0 || report.totals.unexpectedConsoleErrors > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
