/**
 * T-008 / T-018 live browser evidence. Starts the demo server, drives a real Chromium through
 * Playwright, reads the fake db back through the demo-only read-back route, and writes
 *   qa/evidence/browser-<unit>-<date>/report.json (+ screenshots).
 * It stops only the server process tree it started itself (by that PID).
 *
 * Two server modes, chosen by VC_EVIDENCE_MODE (default "dev"):
 *   - "dev":   next dev --webpack (T-008's original evidence: fast, hot-reloading).
 *   - "build": T-018 residual 7. Runs `next build --webpack` first (spawnSync, must exit 0),
 *              THEN `next start` against that production build — the actual production artifact,
 *              not the dev server. VC_WEB_MODE stays "demo" either way (B8/B12: the in-process
 *              fake db, never MONGODB_URL); the production build changes nothing about that.
 *
 * Run (T-008, dev mode):   pnpm --filter @vc/web evidence:browser
 * Run (T-018, prod build): VC_EVIDENCE_MODE=build VC_EVIDENCE_UNIT=t-018-approval-followups VC_EVIDENCE_PORT=3128 npx tsx demo/browser-evidence.ts
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { MAX_REJECT_REASON_LENGTH } from "../src/server/contracts";

const MODE: "dev" | "build" = process.env.VC_EVIDENCE_MODE === "build" ? "build" : "dev";
const LOCALIZATION = process.env.VC_EVIDENCE_LOCALE === "hi";
const UNIT = process.env.VC_EVIDENCE_UNIT ?? (LOCALIZATION ? "t-048-hindi-approval" : "t-008-approval-ui");
const PORT = Number(process.env.VC_EVIDENCE_PORT ?? (MODE === "build" ? 3128 : 3118));
const BASE = `http://localhost:${PORT}`;
const DATE = new Date().toISOString().slice(0, 10);
const REPO = join(process.cwd(), "..", "..");
const OUT = join(REPO, "qa", "evidence", `browser-${UNIT}-${DATE}`);

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
  consoleLocations: string[];
  observedExpectedResponses: {url:string;status:number;method:string}[];
}

const interactions: Interaction[] = [];
const pages: PageRecord[] = [];

function record(did: string, expected: string, observed: string, pass: boolean) {
  interactions.push({ did, expected, observed, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${did}  ->  ${observed}`);
}

const nextBin = join(process.cwd(), "node_modules", "next", "dist", "bin", "next");

/** ISS-t-018-rev-1: a hung `next build` must not block this script forever. */
const BUILD_TIMEOUT_MS = 300_000;

/**
 * T-018 residual 7: `next build --webpack`, run to completion before the server starts. Throws on
 * a non-zero exit, and ISS-t-018-rev-1: also on a signal (the BUILD_TIMEOUT_MS kill) or a spawn
 * error (e.g. the binary could not be launched) — `spawnSync`'s own `status` alone stays `null` in
 * both of those cases, so checking only `res.status !== 0` would silently pass through a hang.
 */
function runProductionBuild(): void {
  console.log("next build --webpack ...");
  const res = spawnSync(process.execPath, [nextBin, "build", "--webpack"], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    stdio: "inherit",
    timeout: BUILD_TIMEOUT_MS,
  });
  if (res.error) {
    throw new Error(`next build --webpack failed to run: ${res.error.message}`);
  }
  if (res.signal !== null) {
    throw new Error(`next build --webpack was killed by signal ${res.signal} (likely the ${BUILD_TIMEOUT_MS}ms timeout)`);
  }
  if (res.status !== 0) {
    throw new Error(`next build --webpack failed (exit ${res.status})`);
  }
}

function startServer(): Promise<ChildProcess> {
  if (MODE === "build") runProductionBuild();
  const args = MODE === "build" ? ["start", "--port", String(PORT)] : ["dev", "--webpack", "--port", String(PORT)];
  const child = spawn(process.execPath, [nextBin, ...args], {
    cwd: process.cwd(),
    env: { ...process.env, VC_WEB_MODE: "demo", NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { stopServer(child); reject(new Error(`next ${MODE === "build" ? "start" : "dev"} did not become ready:\n${log}`)); }, 120_000);
    const onData = (buf: Buffer) => {
      log += buf.toString();
      // "next dev" prints "Ready in <ms>"; "next start" prints "- Local:  http://..." instead.
      if (/Ready in/.test(log) || /- Local:/.test(log)) {
        clearTimeout(timer);
        resolve(child);
      }
    };
    child.stdout!.on("data", onData);
    child.stderr!.on("data", onData);
    child.on("error", (err) => { clearTimeout(timer); stopServer(child); reject(err); });
    child.on("exit", (code) => reject(new Error(`next ${MODE === "build" ? "start" : "dev"} exited (${code}):\n${log}`)));
  });
}

/** Stops the server tree this script started (its own PID only). */
function stopServer(child: ChildProcess) {
  if (child.pid === undefined) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/T", "/F", "/PID", String(child.pid)], { stdio: "ignore" });
  else child.kill("SIGTERM");
}

async function track(page: Page, label: string, expectedStatuses: number[], action: () => Promise<void>) {
  const messages: string[] = [], locations: string[] = [];
  const observed: {url:string;status:number;method:string}[] = [];
  const onResponse = (response: import("playwright").Response) => {
    if(!expectedStatuses.includes(response.status()))return;
    const method=response.request().method(), endpoint=new URL(response.url());
    const allowed = endpoint.origin === BASE && (response.status() === 503
      ? method === "POST" && endpoint.pathname === "/api/sessions"
      : ["GET","POST"].includes(method) && endpoint.pathname.startsWith("/api/approvals/"));
    if(allowed)observed.push({url:response.url(),status:response.status(),method});
  };
  const onConsole = (msg: { type():string; text():string; location():{url:string} }) => {
    if(msg.type() === "error"){messages.push(msg.text());locations.push(msg.location().url);}
  };
  const onPageError = (err: Error) => {messages.push(`pageerror: ${err.message}`);locations.push("");};
  page.on("console",onConsole);page.on("pageerror",onPageError);page.on("response",onResponse);
  try { await action(); await page.waitForTimeout(300); }
  finally {page.off("console",onConsole);page.off("pageerror",onPageError);page.off("response",onResponse);}
  const remaining=[...observed];
  const expectedStatusLogs=messages.filter((message,index)=>{
    const match=remaining.findIndex(response=>locations[index]===response.url && message.startsWith("Failed to load resource:") && message.includes(`status of ${response.status}`));
    if(match<0)return false;remaining.splice(match,1);return true;
  }).length;
  pages.push({url:page.url(),label,consoleErrors:messages.length,expectedStatusLogs,unexpectedConsoleErrors:messages.length-expectedStatusLogs,messages,consoleLocations:locations,observedExpectedResponses:observed});
}

async function readback(page: Page, studentId: string) {
  const res = await page.request.get(`${BASE}/api/demo/readback?studentId=${studentId}`);
  return (await res.json()) as {
    facts: { key: string; value: unknown; active: boolean }[];
    sessions: { sessionId: string; summary?: string; summaryWithheldReason?: string }[];
    claims: number;
    /** T-020 / ISS-t-018-c0-1: the reject-reason audit records (`decisions` collection). */
    decisions: { threadId: string; rejected: { key: string; reason?: string }[]; decidedAt: string }[];
  };
}

const TYPED_REJECT_REASON = "family wants to re-check this major with the school counsellor first";

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
    if (LOCALIZATION) {
      await context.addCookies([{ name: "vc-ui-locale", value: "hi", url: BASE }]);
      const ssr = await (await context.request.get(`${BASE}/sessions/new`)).text();
      record("Hindi SSR and metadata", "Hindi language/title/session before JS", "server response inspected", ssr.includes('<html lang="hi"') && ssr.includes("<title>परामर्श स्वीकृति</title>") && ssr.includes("नया सत्र"));
      const fallback = await (await context.request.get(`${BASE}/sessions/new`, { headers: { cookie: "vc-ui-locale=HI" } })).text();
      record("invalid locale fallback", "strict en fallback", "HI cookie response inspected", fallback.includes('<html lang="en"') && fallback.includes("New session"));
      const session = await context.newPage();
      await track(session, "Hindi Retry preservation", [503], async () => {
        const bodies: string[] = [];
        await session.route("**/api/sessions", async route => { bodies.push(route.request().postData() ?? ""); await route.fulfill({ status:503, contentType:"application/json", body:JSON.stringify({state:"ai_unavailable",sessionId:(route.request().postDataJSON() as {sessionId:string}).sessionId,attempts:2,modelsAttempted:["mock"]}) }); });
        await session.goto(`${BASE}/sessions/new`,{waitUntil:"networkidle"});
        await session.click('[data-testid="submit-session"]');await session.waitForSelector('[data-state="ai_unavailable"]');
        const first=await session.locator('[data-state="ai_unavailable"]').innerText();
        await session.selectOption('[data-testid="ui-locale"]',"en");await session.selectOption('[data-testid="ui-locale"]',"hi");
        await session.click('[data-testid="retry-session"]');await session.waitForSelector('[data-state="ai_unavailable"]');
        const text=await session.locator("main").innerText();
        record("Hindi Retry bytes", "identical request and original transcript", `posts=${bodies.length} identical=${bodies[0]===bodies[1]}`, bodies.length===2 && bodies[0]===bodies[1] && first.includes("अभी एआई उपलब्ध नहीं") && text.includes("फिर कोशिश करें") && text.includes("20 lakh rupees a year"));
        await session.screenshot({path:join(OUT,"00-hindi-retry.png"),fullPage:true});
      });
      await session.close();
    }
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

    if (LOCALIZATION) await track(a,"Hindi navigation preference",[],async()=>{
      await a.selectOption('[data-testid="ui-locale"]',"en");await a.click('[data-testid="new-session-link"]');await a.waitForSelector('[data-testid="submit-session"]');
      await a.goBack({waitUntil:"networkidle"});await a.selectOption('[data-testid="ui-locale"]',"hi");await a.goForward({waitUntil:"networkidle"});await a.waitForSelector('[data-testid="submit-session"]');
      const text=await a.locator("h1").innerText(),lang=await a.locator("html").getAttribute("lang");
      record("history uses current preference","Hindi on English-mounted route",`h1=${text} lang=${lang}`,text==="नया सत्र"&&lang==="hi");
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

    // 2.5. T-018 / ISS-t-008-c0-1: a fully valid per-fact decision except one edit value is an
    // object for a numeric fact -> refused (400), nothing claimed or written. Run BEFORE any real
    // decision touches this thread (mirrors the T-008 checker's own probe order).
    await track(a, "type refusal (per-fact edit value type mismatch)", [400], async () => {
      const res = await a.request.post(`${BASE}/api/approvals/${encodeURIComponent(PAUSED)}`, {
        data: {
          facts: [
            { key: "targetCountry", decision: "approve" },
            { key: "intendedMajor", decision: "approve" },
            { key: "preferredIntake", decision: "approve" },
            { key: "budget_inr_per_year", decision: "edit", value: { not: "a number" } },
          ],
          summary: "approve",
        },
      });
      const body = await res.json();
      record(
        "POST a fully valid per-fact decision except one edit value is an object for a numeric fact (ISS-t-008-c0-1 / T-018)",
        "refused 400 invalid, before any claim; nothing written",
        `status=${res.status()} state=${body.state}`,
        res.status() === 400 && body.state === "invalid",
      );
      const pre = await readback(a, "demo-student-1");
      const view = await (await a.request.get(`${BASE}/api/approvals/${encodeURIComponent(PAUSED)}`)).json();
      record(
        "confirm the thread is untouched after the refused edit",
        "still awaiting_approval, 0 facts, 0 claims",
        `state=${view.state} facts=${pre.facts.length} claims=${pre.claims}`,
        view.state === "awaiting_approval" && pre.facts.length === 0 && pre.claims === 0,
      );
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
      // T-020 / ISS-t-018-c0-1: type a reject reason into the field the rejected fact now reveals.
      await a.fill('input[data-reason-for="intendedMajor"]', TYPED_REJECT_REASON);
      const typedReason = await a.inputValue('input[data-reason-for="intendedMajor"]');
      record("type a reject reason for intendedMajor", "the reason field holds the typed text", `value="${typedReason}"`, typedReason === TYPED_REJECT_REASON);

      // T-023 / ISS-t-020-c0-1 (B17 persona walk): the live, accessible character counter.
      const reasonInput = a.locator('input[data-reason-for="intendedMajor"]');
      const counter = a.locator('[data-testid="reason-count-intendedMajor"]');
      const counterText = async () => (await counter.textContent())?.replace(/\s+/g, " ").trim() ?? "";
      record(
        "reject-reason counter after typing a short reason",
        `shows ${TYPED_REJECT_REASON.length}/${MAX_REJECT_REASON_LENGTH}, no limit-reached notice`,
        `text="${await counterText()}"`,
        (await counterText()).includes(`${TYPED_REJECT_REASON.length}/${MAX_REJECT_REASON_LENGTH}`) && !(await counterText()).includes(LOCALIZATION ? "सीमा पूरी" : "Limit reached"),
      );
      const describedBy = await reasonInput.getAttribute("aria-describedby");
      const counterId = await counter.getAttribute("id");
      const ariaLive = await counter.getAttribute("aria-live");
      record(
        "reject-reason counter is wired for accessibility",
        "the input's aria-describedby points at the counter's id, and the counter is an aria-live region",
        `aria-describedby="${describedBy}" counter#="${counterId}" aria-live="${ariaLive}"`,
        describedBy === counterId && ariaLive === "polite",
      );

      // Reaching the cap must show a clear "limit reached" notice, not silently stop accepting keys.
      await reasonInput.fill("x".repeat(MAX_REJECT_REASON_LENGTH));
      record(
        "reject-reason counter at the character cap",
        `shows ${MAX_REJECT_REASON_LENGTH}/${MAX_REJECT_REASON_LENGTH} and a limit-reached notice`,
        `text="${await counterText()}" data-at-limit="${await counter.getAttribute("data-at-limit")}"`,
        (await counterText()).includes(`${MAX_REJECT_REASON_LENGTH}/${MAX_REJECT_REASON_LENGTH}`) && (await counterText()).includes(LOCALIZATION ? "सीमा पूरी" : "Limit reached") && (await counter.getAttribute("data-at-limit")) === "true",
      );
      await a.screenshot({ path: join(OUT, "02b-reason-limit-reached.png"), fullPage: true });
      await reasonInput.fill("x".repeat(MAX_REJECT_REASON_LENGTH - 1));
      record(
        "reject-reason counter one character back under the cap",
        "the limit-reached notice disappears again",
        `text="${await counterText()}"`,
        !(await counterText()).includes(LOCALIZATION ? "सीमा पूरी" : "Limit reached"),
      );

      // T-023 (T-020 verdict note): a hostile payload in the reason box must never become real markup
      // or execute -- it is stored and echoed back as plain text/value only.
      const hostilePayload = '<script>window.__pwned = true</script><img src=x onerror="window.__pwned = true">';
      await reasonInput.fill(hostilePayload);
      const hostileValue = await reasonInput.inputValue();
      const scriptTagsInArticle = await a.locator('article[data-fact-key="intendedMajor"] script').count();
      const wasExecuted = await a.evaluate(() => (window as unknown as { __pwned?: boolean }).__pwned === true);
      record(
        "typing <script>/<img onerror> into the reject-reason box",
        "stored verbatim as the input's value; no <script> element created; the payload never executes",
        `value matches="${hostileValue === hostilePayload}" scriptElementsInArticle=${scriptTagsInArticle} executed=${wasExecuted}`,
        hostileValue === hostilePayload && scriptTagsInArticle === 0 && wasExecuted === false,
      );

      // Restore the real reason before the rest of this flow submits and its audit record is read back.
      await reasonInput.fill(TYPED_REJECT_REASON);
      record("restore the reject-reason field before submit", "holds the original typed reason again", `value="${await reasonInput.inputValue()}"`, (await reasonInput.inputValue()) === TYPED_REJECT_REASON);

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

      if(LOCALIZATION){
        const form=await a.locator('form[data-state="awaiting_approval"]').elementHandle();
        const snapshot=()=>a.locator('form[data-state="awaiting_approval"]').evaluate(node=>({values:Array.from(node.querySelectorAll("input")).map(input=>input.value),choices:Array.from(node.querySelectorAll('[aria-checked="true"]')).map(item=>[item.getAttribute("data-fact"),item.getAttribute("data-decision"),item.getAttribute("data-summary")])}));
        const before=await snapshot();let posts=0;const observe=(request:import("playwright").Request)=>{if(request.method()==="POST")posts++;};a.on("request",observe);
        await a.selectOption('[data-testid="ui-locale"]',"en");await a.selectOption('[data-testid="ui-locale"]',"hi");
        const after=await snapshot();a.off("request",observe);const same=await form!.evaluate(node=>node===document.querySelector('form[data-state="awaiting_approval"]'));
        record("toggle with pending edits","same form/choices/values and zero POST",`sameNode=${same} posts=${posts}`,same&&posts===0&&JSON.stringify(before)===JSON.stringify(after));
      }
      await a.click('[data-testid="submit"]');
      await a.waitForSelector('[data-state="done"]', { timeout: 60_000 });
      const written = await a.locator("tr[data-written-key]").evaluateAll((els) => els.map((e) => e.getAttribute("data-written-key")));
      const outcome = await a.locator('[data-testid="outcome"]').textContent();
      record("submit", "resolved: outcome written, written facts = targetCountry, preferredIntake, budget_inr_per_year", `outcome=${outcome} written=[${written.join(", ")}]`, outcome === (LOCALIZATION ? "दर्ज" : "written") && [...written].sort().join() === "budget_inr_per_year,preferredIntake,targetCountry");
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

    // 5.5. T-020 / ISS-t-018-c0-1: the reject-reason audit record, written by the REAL UI submit
    // above (not a raw API call), is observable through the demo read-back route.
    const auditRecord = rb.decisions.find((d) => d.threadId === PAUSED);
    record(
      "read back the reject-reason audit record after a real UI reject+submit",
      "one decisions-collection record for this thread, rejected=[{key: intendedMajor, reason: <typed text>}]",
      `decisions=${JSON.stringify(rb.decisions)}`,
      auditRecord !== undefined &&
        auditRecord.rejected.length === 1 &&
        auditRecord.rejected[0]!.key === "intendedMajor" &&
        auditRecord.rejected[0]!.reason === TYPED_REJECT_REASON &&
        typeof auditRecord.decidedAt === "string",
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
    try { await browser?.close(); } finally { stopServer(server); }
  }

  const report = {
    unit: UNIT === "t-008-approval-ui" ? "T-008 counsellor diff-approval UI" : `follow-up evidence run (${UNIT})`,
    date: DATE,
    generatedAt: new Date().toISOString(),
    runtime: { node:process.version, buildId:MODE==="build"?readFileSync(join(process.cwd(),".next/BUILD_ID"),"utf8").trim():null },
    sourceInputs: ["src/components/labels.ts","src/components/ApprovalScreen.tsx","src/components/NewSessionForm.tsx","src/app/layout.tsx","src/app/page.tsx","src/app/sessions/new/page.tsx","src/app/approvals/[threadId]/page.tsx","demo/browser-evidence.ts","package.json","tsconfig.json"].map(file=>({path:file,sha256:createHash("sha256").update(readFileSync(join(process.cwd(),file))).digest("hex")})),
    baseUrl: BASE,
    serverMode: MODE,
    mode:
      MODE === "build"
        ? "demo: next build --webpack then next start (PRODUCTION build/server), in-process fake db via @vc/db getVcDb + real MongoDBSaver over the fake, MockProvider, synthetic threads; no MONGODB_URL, no Gemini"
        : "demo: next dev (webpack), in-process fake db via @vc/db getVcDb + real MongoDBSaver over the fake, MockProvider, synthetic threads; no MONGODB_URL, no Gemini",
    browser: `chromium ${browserVersion} (playwright, headless)`,
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
