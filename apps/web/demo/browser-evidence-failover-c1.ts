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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";

const LOCALIZATION = process.env.VC_EVIDENCE_LOCALE === "hi";
const MODE = process.env.VC_EVIDENCE_MODE === "build" ? "build" : "dev";
const UNIT = process.env.VC_EVIDENCE_UNIT ?? (LOCALIZATION ? "t-048-hindi-session" : "t-053-session-outcomes");
const PORT = Number(process.env.VC_EVIDENCE_PORT ?? 3149);
const BASE = `http://localhost:${PORT}`;
const DATE = LOCALIZATION ? new Date().toISOString().slice(0, 10) : "2026-10-01";
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

const nextBin = join(process.cwd(), "node_modules", "next", "dist", "bin", "next");

function startServer(): Promise<ChildProcess> {
  if (MODE === "build") {
    const result = spawnSync(process.execPath, [nextBin, "build", "--webpack"], {
      cwd: process.cwd(), env: { ...process.env, VC_WEB_MODE: "demo", NEXT_TELEMETRY_DISABLED: "1" },
      stdio: "inherit", timeout: 300_000,
    });
    if (result.error || result.signal !== null || result.status !== 0) throw new Error("Production webpack build failed");
  }
  const args = MODE === "build" ? ["start", "--port", String(PORT)] : ["dev", "--webpack", "--port", String(PORT)];
  const child = spawn(process.execPath, [nextBin, ...args], {
    cwd: process.cwd(),
    env: { ...process.env, VC_WEB_MODE: "demo", NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { stopServer(child); reject(new Error(`next dev did not become ready:\n${log}`)); }, 120_000);
    const onData = (buf: Buffer) => {
      log += buf.toString();
      if (/Ready in/.test(log)) {
        clearTimeout(timer);
        resolve(child);
      }
    };
    child.stdout!.on("data", onData);
    child.stderr!.on("data", onData);
    child.on("error", (err) => { clearTimeout(timer); stopServer(child); reject(err); });
    child.on("exit", (code) => reject(new Error(`next dev exited (${code}):\n${log}`)));
  });
}

/** Stops the server tree this script started (its own PID only). RAM is tight — never leave it running. */
function stopServer(child: ChildProcess) {
  if (child.pid === undefined) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/T", "/F", "/PID", String(child.pid)], { stdio: "ignore" });
  else child.kill("SIGTERM");
}

async function track(page: Page, label: string, action: () => Promise<void>, expectedStatuses: number[] = []) {
  const messages: string[] = [], locations: string[] = [], expectedResponses: number[] = [];
  const onResponse = (response: import("playwright").Response) => {
    if(response.url() === `${BASE}/api/sessions` && response.request().method() === "POST" && expectedStatuses.includes(response.status())) expectedResponses.push(response.status());
  };
  const onConsole = (msg: { type(): string; text(): string; location(): {url:string} }) => {
    if (msg.type() === "error") { messages.push(msg.text()); locations.push(msg.location().url); }
  };
  const onPageError = (err: Error) => {messages.push(`pageerror: ${err.message}`);locations.push("");};
  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  page.on("response", onResponse);
  try {
    await action();
    await page.waitForTimeout(300);
  } finally {
    page.off("console", onConsole);
    page.off("pageerror", onPageError);
    page.off("response", onResponse);
  }
  const remaining=[...expectedResponses];
  const expectedStatusLogs=messages.filter((message,index)=>{
    const match=remaining.findIndex(status=>locations[index] === `${BASE}/api/sessions` && message.startsWith("Failed to load resource:") && message.includes(`status of ${status}`));
    if(match<0)return false;remaining.splice(match,1);return true;
  }).length;
  pages.push({ url:page.url(),label,consoleErrors:messages.length,expectedStatusLogs,unexpectedConsoleErrors:messages.length-expectedStatusLogs,messages });
}

async function main() {
  if (LOCALIZATION && (MODE !== "build" || !/^t-048-hindi-[a-z0-9-]+$/.test(UNIT) || existsSync(OUT))) throw new Error("Localization evidence requires build mode, scoped t-048-hindi unit and fresh output");
  mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  let browser: Browser | undefined;
  let browserVersion = "unlaunched";
  try {
    browser = await chromium.launch();
    browserVersion = browser.version();

    const context = await browser.newContext({ viewport: { width: 1100, height: 900 } });
    if (LOCALIZATION) await context.addCookies([{ name:"vc-ui-locale",value:"hi",url:BASE }]);
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
      const hasOwnLabel = headerTexts.includes(LOCALIZATION ? "क्या कहा गया" : "What was said");
      const hasOldMislabel = headerTexts.includes(LOCALIZATION ? "प्रस्तावित मान" : "Proposed value");
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
    }, [503]);

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
        const expected = LOCALIZATION ? ({
          "Written":"दर्ज", "Request refused":"अनुरोध अस्वीकृत", "Rejected":"अस्वीकृत", "Escalated":"सहायता को भेजा गया", "Conflict":"विरोध", "Partial conflict":"आंशिक विरोध", "Extraction failed":"तथ्य निकालने में त्रुटि", "Summary failed":"सारांश में त्रुटि", "Erasure in progress":"डेटा मिटाया जा रहा है", "Session processing":"सत्र पर कार्य जारी", "Server error":"सर्वर त्रुटि",
        } as Record<string,string>)[outcome.text] : outcome.text;
        const html = await page.locator("main").innerHTML();
        const links = await page.locator('[data-testid="session-thread-link"]').count();
        const retry = await page.locator('[data-testid="retry-session"]').count();
        record(`T-053 typed response ${index + 1}`, `${outcome.state}: ${outcome.text}; one POST, no private response details or approval link`, `state=${outcome.state} text=${JSON.stringify(text)} posts=${posts} links=${links} retry=${retry}`, text === expected && posts === 1 && links === 0 && retry === 0 && !html.includes(privateSentinel) && !html.includes("scribe:private"));
        await page.unroute("**/api/sessions");
      });
    }
  } finally {
    try { await browser?.close(); } finally { stopServer(server); }
  }

  const report = {
    unit: LOCALIZATION ? UNIT : "T-053 session outcomes + T-021 timeout/Retry regression smoke",
    date: DATE,
    generatedAt: new Date().toISOString(),
    baseUrl: BASE,
    mode:
      `demo: next ${MODE === "build" ? "build/start" : "dev"} (webpack), page.clock installed BEFORE navigation and fast-forwarded past CLIENT_TIMEOUT_MS (50s) so the browser's own AbortController timer fires without a real 50s wait; POST /api/sessions intercepted at the Playwright network layer (page.route, never fulfilled) to simulate a true network hang the server's own 45s deadline can never reach; no live LiteLLM gateway, no MONGODB_URL, no real student data (B8/B13)`,
    serverMode: MODE,
    runtime: { node:process.version, buildId:MODE==="build"?readFileSync(join(process.cwd(),".next/BUILD_ID"),"utf8").trim():null },
    sourceInputs: ["src/components/labels.ts","src/components/ApprovalScreen.tsx","src/components/NewSessionForm.tsx","src/app/layout.tsx","src/app/page.tsx","src/app/sessions/new/page.tsx","src/app/approvals/[threadId]/page.tsx","demo/browser-evidence-failover-c1.ts","package.json","tsconfig.json"].map(file=>({path:file,sha256:createHash("sha256").update(readFileSync(join(process.cwd(),file))).digest("hex")})),
    browser: `chromium ${browserVersion} (playwright, headless)`,
    pages,
    interactions,
    totals: {
      interactions: interactions.length,
      passed: interactions.filter((i) => i.pass).length,
      failed: interactions.filter((i) => !i.pass).length,
      consoleErrors: pages.reduce((n, p) => n + p.consoleErrors, 0),
      expectedStatusLogs: pages.reduce((n,p)=>n+p.expectedStatusLogs,0),
      unexpectedConsoleErrors: pages.reduce((n,p)=>n+p.unexpectedConsoleErrors,0),
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
