/**
 * T-021 fix cycle 1 (ISS-t-021-rev-1 + ISS-t-021-c0-1) live browser SMOKE evidence — a smoke check,
 * not validation (per the maker dispatch): confirms two things live in a real Chromium that no
 * automated unit test can reach:
 *
 *   1. ISS-t-021-c0-1: the new-session transcript table's second column header is its OWN label
 *      ("What was said"), never the approval screen's "Proposed value" (colValue).
 *   2. ISS-t-021-rev-1: the client-side timeout (NewSessionForm's CLIENT_TIMEOUT_MS AbortController)
 *      genuinely fires and renders the SAME apology + Retry state as a server-reported
 *      ai_unavailable, with the transcript still visible (input preserved) — proven by intercepting
 *      the POST at the network layer so it never resolves (a true hang, not merely a slow server),
 *      then using Playwright's clock emulation (page.clock) to fast-forward past CLIENT_TIMEOUT_MS
 *      without waiting 50 real seconds.
 *
 * Kept as its own script (same precedent as browser-evidence-failover.ts itself, T-021 cycle 0):
 * a separate evidence run for a separate fix cycle, never entangled with the cycle-0 script.
 * Writes qa/evidence/browser-t-021-provider-failover-c1-2026-09-26/report.json (+ screenshots).
 * Stops only the server process tree it started itself (by PID) — RAM discipline.
 *
 * Run:  VC_EVIDENCE_PORT=3149 npx tsx demo/browser-evidence-failover-c1.ts
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright";

const UNIT = "t-053-session-outcomes";
const PORT = Number(process.env.VC_EVIDENCE_PORT ?? 3149);
const BASE = `http://localhost:${PORT}`;
const DATE = "2026-10-01";
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

    // Install the clock BEFORE navigating (Playwright's own recommendation) so every timer the page
    // schedules from load onward — including NewSessionForm's CLIENT_TIMEOUT_MS setTimeout — is
    // virtual and fast-forwardable, not a real 50-second wait.
    await page.clock.install({ time: new Date("2026-09-26T12:00:00.000Z") });

    // 1. Open the new-session screen and check the relabelled column header (ISS-t-021-c0-1) BEFORE
    //    touching the failure path — a plain, static render check.
    await track(page, "new session (idle) — relabelled column header", async () => {
      await page.goto(`${BASE}/sessions/new`, { waitUntil: "networkidle", timeout: 180_000 });
      await page.waitForSelector('[data-testid="submit-session"]', { timeout: 60_000 });
      const headerTexts = await page.locator('[data-testid="new-session-turns"] thead th').allInnerTexts();
      const hasOwnLabel = headerTexts.includes("What was said");
      const hasOldMislabel = headerTexts.includes("Proposed value");
      record(
        "read the transcript table's column headers",
        'the second column reads "What was said" (its own label), never "Proposed value" (the approval screen\'s proposed-fact label)',
        `headers=${JSON.stringify(headerTexts)}`,
        hasOwnLabel && !hasOldMislabel,
      );
      await page.screenshot({ path: join(OUT, "01-idle-relabelled.png"), fullPage: true });
    });

    // 2. Intercept the POST at the network layer so it NEVER resolves — a true hang, stricter than a
    //    slow server, and one the server's own 45s deadline can never rescue (the request never even
    //    reaches it). Only the client's own CLIENT_TIMEOUT_MS can end this.
    let interceptedRequests = 0;
    await page.route("**/api/sessions", async () => {
      interceptedRequests += 1;
      // Deliberately never call route.fulfill()/continue()/abort() — the fetch() just hangs.
    });

    await track(page, "submit while the request hangs forever, then fast-forward past CLIENT_TIMEOUT_MS", async () => {
      await page.click('[data-testid="submit-session"]');
      await page.waitForTimeout(200); // let the fetch() actually start and register its AbortController timer
      // CLIENT_TIMEOUT_MS is 50_000ms (apps/web/src/components/NewSessionForm.tsx) — fast-forward
      // well past it without waiting 50 real seconds.
      await page.clock.fastForward(60_000);
      await page.waitForSelector('[data-state="ai_unavailable"]', { timeout: 15_000 });
      const bannerText = (await page.locator('[data-state="ai_unavailable"]').innerText()) ?? "";
      const hasRetry = await page.locator('[data-testid="retry-session"]').count();
      const hasStackTrace = /at\s+\w+.*\(.*:\d+:\d+\)/.test(bannerText) || /Error:/.test(bannerText);
      const mentionsAbort = /abort/i.test(bannerText);
      record(
        "let the intercepted (hung) request outlive CLIENT_TIMEOUT_MS",
        "the SAME apology + Retry banner as a server-reported ai_unavailable — no stack trace, no AbortError/timeout jargon",
        `interceptedRequests=${interceptedRequests} bannerText=${JSON.stringify(bannerText)} hasStackTrace=${hasStackTrace} mentionsAbort=${mentionsAbort} retryButtons=${hasRetry}`,
        interceptedRequests === 1 && !hasStackTrace && !mentionsAbort && hasRetry === 1 && bannerText.length > 0,
      );
      await page.screenshot({ path: join(OUT, "02-client-timeout-ai-unavailable.png"), fullPage: true });
    });

    // 3. Input preserved: the transcript is still fully visible after the client-side timeout fired
    //    (never cleared), same guarantee as the server-side ai_unavailable path.
    await track(page, "input preserved after the client-side timeout", async () => {
      const turns = await page.locator('[data-testid="new-session-turns"] tr[data-turn-id]').count();
      const student = (await page.locator('[data-testid="new-session-student"]').textContent()) ?? "";
      record(
        "re-check the transcript/student after the client-side timeout",
        "unchanged: still 5 turns, same student",
        `turns=${turns} student=${student}`,
        turns === 5 && student === "demo-student-4",
      );
    });

    // 4. Retry after a client-side timeout still resubmits — remove the hang, unroute, click Retry,
    //    and confirm the flow can still reach a normal outcome (the demo's normal FlakyOnceProvider
    //    graph, unaffected by the intercepted request from step 2, which never reached the server).
    await page.unroute("**/api/sessions");
    await track(page, "retry after a client-side timeout reaches the normal flow", async () => {
      await page.click('[data-testid="retry-session"]');
      await page.waitForSelector('[data-state="ai_unavailable"], [data-state="started"]', { timeout: 15_000 });
      const state = (await page.locator('[data-state="ai_unavailable"], [data-state="started"]').first().getAttribute("data-state")) ?? "unknown";
      // Either outcome is a PASS here: this step's only claim is that Retry sends a real request
      // again (proven by it reaching a server-decided state, not staying stuck) — the demo runtime's
      // own FlakyOnceProvider fail-count behaviour is already covered by session-api.test.ts and the
      // cycle-0 browser evidence, not re-asserted here.
      record("click Retry after a client-side timeout", "a real request goes out again and reaches a server-decided state", `state=${state}`, state === "ai_unavailable" || state === "started");
      await page.screenshot({ path: join(OUT, "03-after-retry.png"), fullPage: true });
    });

    // T-053: instrumented response fixtures prove real client transitions, not provider delivery.
    // Only fixed status text may reach the outcome; every private fixture field is a sentinel.
    const privateSentinel = "T053_PRIVATE_RESPONSE_SENTINEL";
    const outcomes = [
      { response: { state: "done", threadId: "scribe:private", result: { status: "written", writtenFactIds: [privateSentinel], supersededKeys: [privateSentinel] } }, state: "done", text: "Written" },
      ...["refused", "rejected", "extraction_failed", "summary_failed"].map(status => ({ response: { state: "done", threadId: "scribe:private", result: { status, reason: privateSentinel } }, state: "done", text: ({ refused: "Request refused", rejected: "Rejected", extraction_failed: "Extraction failed", summary_failed: "Summary failed" } as Record<string, string>)[status] })),
      { response: { state: "done", threadId: "scribe:private", result: { status: "conflict", key: privateSentinel, message: privateSentinel } }, state: "done", text: "Conflict" },
      { response: { state: "done", threadId: "scribe:private", result: { status: "partial_conflict", key: privateSentinel, message: privateSentinel, writtenFactIds: [privateSentinel] } }, state: "done", text: "Partial conflict" },
      { response: { state: "done", threadId: "scribe:private", result: { status: "escalated", escalation: { type: "guard_only", level: "crisis", reason: "guard_crisis", studentId: privateSentinel, sessionId: privateSentinel, turnIds: [privateSentinel], flaggedAt: "2026-10-01T00:00:00.000Z", channel: "record_only", status: "queued" } } }, state: "done", text: "Escalated" },
      { response: { state: "fenced", threadId: "scribe:private" }, state: "fenced", text: "Erasure in progress" },
      { response: { state: "invalid", issues: [privateSentinel] }, state: "invalid", text: "Request refused" },
      { response: { state: "in_progress", threadId: "scribe:private" }, state: "in_progress", text: "Session processing" },
      { response: { state: "done", result: { status: privateSentinel } }, state: "error", text: "Server error" },
    ];
    for (const [index, outcome] of outcomes.entries()) {
      await track(page, `T-053 response fixture ${index + 1}`, async () => {
        let posts = 0;
        await page.route("**/api/sessions", async route => {
          posts += 1;
          await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(outcome.response) });
        });
        await page.goto(`${BASE}/sessions/new`, { waitUntil: "networkidle" });
        await page.click('[data-testid="submit-session"]');
        const banner = page.locator(`[data-state="${outcome.state}"]`);
        await banner.waitFor();
        const text = await banner.innerText();
        const html = await page.locator("main").innerHTML();
        const links = await page.locator('[data-testid="session-thread-link"]').count();
        const retry = await page.locator('[data-testid="retry-session"]').count();
        record(`T-053 typed response ${index + 1}`, `${outcome.state}: ${outcome.text}; one POST, no private response details or approval link`, `state=${outcome.state} text=${JSON.stringify(text)} posts=${posts} links=${links} retry=${retry}`, text === outcome.text && posts === 1 && links === 0 && retry === 0 && !html.includes(privateSentinel) && !html.includes("scribe:private"));
        await page.unroute("**/api/sessions");
      });
    }
  } finally {
    await browser.close();
    stopServer(server);
  }

  const report = {
    unit: "T-053 session outcomes + T-021 timeout/Retry regression smoke",
    date: DATE,
    generatedAt: new Date().toISOString(),
    baseUrl: BASE,
    mode:
      "demo: next dev (webpack), page.clock installed BEFORE navigation and fast-forwarded past CLIENT_TIMEOUT_MS (50s) so the browser's own AbortController timer fires without a real 50s wait; POST /api/sessions intercepted at the Playwright network layer (page.route, never fulfilled) to simulate a true network hang the server's own 45s deadline can never reach; no live LiteLLM gateway, no MONGODB_URL, no real student data (B8/B13)",
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
