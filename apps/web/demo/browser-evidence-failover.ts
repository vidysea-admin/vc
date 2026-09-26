/**
 * T-021 (D-020, contract B6 "runtime failover" + B17 persona usability) live browser evidence.
 * Starts the demo server, drives a real Chromium through Playwright against the NEW "start a
 * session" flow (demo/seed.ts's FlakyOnceProvider forces the first extraction call to fail exactly
 * like an exhausted FailoverProvider chain), and writes
 *   qa/evidence/browser-t-021-provider-failover-2026-09-26/report.json (+ screenshots).
 * It stops only the server process tree it started itself (by that PID) — same pattern as
 * demo/browser-evidence.ts (T-008), kept as its own script rather than added to that one's
 * hardcoded T-008 flow.
 *
 * Run:  VC_EVIDENCE_PORT=3148 npx tsx demo/browser-evidence-failover.ts
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright";

const UNIT = "t-021-provider-failover";
const PORT = Number(process.env.VC_EVIDENCE_PORT ?? 3148);
const BASE = `http://localhost:${PORT}`;
const DATE = "2026-09-26";
const REPO = join(process.cwd(), "..", "..");
const OUT = join(REPO, "qa", "evidence", `browser-${UNIT}-${DATE}`);

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
  messages: string[];
}

const interactions: Interaction[] = [];
const pages: PageRecord[] = [];

function record(did: string, expected: string, observed: string, pass: boolean) {
  interactions.push({ did, expected, observed, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${did}  ->  ${observed}`);
}

const nextBin = join(process.cwd(), "node_modules", "next", "dist", "bin", "next");

function startServer(): Promise<ChildProcess> {
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

/** Stops the server tree this script started (its own PID only). RAM is tight — never leave it running. */
function stopServer(child: ChildProcess) {
  if (child.pid === undefined) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/T", "/F", "/PID", String(child.pid)], { stdio: "ignore" });
  else child.kill("SIGTERM");
}

async function track(page: Page, label: string, action: () => Promise<void>) {
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
  pages.push({ url: page.url(), label, consoleErrors: messages.length, messages });
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const browserVersion = browser.version();
  try {
    const context = await browser.newContext({ viewport: { width: 1100, height: 900 } });
    await context.request.get(`${BASE}/`, { timeout: 180_000 });
    const page = await context.newPage();

    // 1. The home page links to the new-session flow.
    await track(page, "index", async () => {
      await page.goto(BASE, { waitUntil: "networkidle", timeout: 180_000 });
      const link = await page.locator('[data-testid="new-session-link"]').count();
      record("open the index page", "a link to the new-session demo flow is present", `linkCount=${link}`, link === 1);
    });

    // 2. Open the new-session screen: the fixed synthetic transcript is shown, Submit is enabled.
    await track(page, "new session (idle)", async () => {
      await page.click('[data-testid="new-session-link"]');
      await page.waitForSelector('[data-testid="submit-session"]', { timeout: 60_000 });
      const turns = await page.locator('[data-testid="new-session-turns"] tr[data-turn-id]').count();
      const student = (await page.locator('[data-testid="new-session-student"]').textContent()) ?? "";
      record("open the new-session screen", "the fixed synthetic transcript (5 turns) and student id render", `turns=${turns} student=${student}`, turns === 5 && student === "demo-student-4");
      await page.screenshot({ path: join(OUT, "01-idle.png"), fullPage: true });
    });

    // 3. FIRST submit: the demo's FlakyOnceProvider forces the whole failover chain to look
    //    exhausted (same typed AiUnavailableError a real exhausted FailoverProvider throws) ->
    //    the apologetic "AI unavailable" state, with a Retry button and no stack trace/jargon.
    await track(page, "first submit (forced all-fail)", async () => {
      await page.click('[data-testid="submit-session"]');
      await page.waitForSelector('[data-state="ai_unavailable"]', { timeout: 60_000 });
      const bannerText = (await page.locator('[data-state="ai_unavailable"]').innerText()) ?? "";
      const hasStackTrace = /at\s+\w+.*\(.*:\d+:\d+\)/.test(bannerText) || /Error:/.test(bannerText);
      const hasRetry = await page.locator('[data-testid="retry-session"]').count();
      record(
        "submit the session while the (demo-forced) failover chain is exhausted",
        "an apologetic AI-unavailable banner, no stack trace, a visible Retry button",
        `bannerText=${JSON.stringify(bannerText)} hasStackTrace=${hasStackTrace} retryButtons=${hasRetry}`,
        !hasStackTrace && hasRetry === 1 && bannerText.length > 0,
      );
      await page.screenshot({ path: join(OUT, "02-ai-unavailable.png"), fullPage: true });
    });

    // 4. Confirm the input the browser can see (the rendered transcript + student id) is UNCHANGED
    //    after the failure — nothing was cleared or reset, so Retry has something to resubmit.
    await track(page, "input preserved after failure", async () => {
      const turns = await page.locator('[data-testid="new-session-turns"] tr[data-turn-id]').count();
      const student = (await page.locator('[data-testid="new-session-student"]').textContent()) ?? "";
      record("re-check the transcript/student after the failure", "unchanged: still 5 turns, same student", `turns=${turns} student=${student}`, turns === 5 && student === "demo-student-4");
    });

    // 5. Click Retry: resubmits the SAME body (same sessionId/turns, built once in client state) ->
    //    the demo's FlakyOnceProvider now succeeds -> the normal "started" outcome, with a working
    //    link into the real approval screen (proving the retry completed the NORMAL flow, not a
    //    fake success flag).
    await track(page, "retry (second submit, identical input)", async () => {
      await page.click('[data-testid="retry-session"]');
      await page.waitForSelector('[data-state="started"]', { timeout: 60_000 });
      const threadLink = await page.locator('[data-testid="session-thread-link"]').getAttribute("href");
      record("click Retry", "the started state with a link to the approval screen (no retype happened)", `threadLink=${threadLink}`, typeof threadLink === "string" && threadLink.startsWith("/approvals/"));
      await page.screenshot({ path: join(OUT, "03-started.png"), fullPage: true });

      await page.click('[data-testid="session-thread-link"]');
      await page.waitForSelector('form[data-state="awaiting_approval"]', { timeout: 60_000 });
      const facts = await page.locator("article[data-fact-key]").count();
      record("follow the thread link after a successful retry", "the SAME approval screen a normal (non-failed) session reaches, with extracted facts", `facts=${facts}`, facts > 0);
      await page.screenshot({ path: join(OUT, "04-approval-after-retry.png"), fullPage: true });
    });
  } finally {
    await browser.close();
    stopServer(server);
  }

  const report = {
    unit: "T-021 provider runtime failover — apologetic AI-unavailable state + Retry (apps/web)",
    date: DATE,
    generatedAt: new Date().toISOString(),
    baseUrl: BASE,
    mode:
      "demo: next dev (webpack), in-process fake db via @vc/db getVcDb + real MongoDBSaver over the fake, demo/seed.ts FlakyOnceProvider forces the FIRST fact-extraction call to throw the same typed AiUnavailableError a real exhausted FailoverProvider chain throws (packages/providers), then succeeds on Retry; no live LiteLLM gateway involved (that path is packages/engine's smoke:litellm script, separate and explicit); no MONGODB_URL, no Gemini, no real student data (B8/B13)",
    browser: `chromium ${browserVersion} (playwright, headless)`,
    pages,
    interactions,
    totals: {
      interactions: interactions.length,
      passed: interactions.filter((i) => i.pass).length,
      failed: interactions.filter((i) => !i.pass).length,
      consoleErrors: pages.reduce((n, p) => n + p.consoleErrors, 0),
    },
  };
  writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(`\nreport: ${join(OUT, "report.json")}`);
  console.log(JSON.stringify(report.totals));
  if (report.totals.failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
