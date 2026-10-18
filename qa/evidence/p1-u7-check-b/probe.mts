// Checker B hostile probes for P1 U7. Read-only toward the worktree: imports its sources, writes nothing there.
import { pathToFileURL } from "node:url";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateKeyPairSync } from "node:crypto";

const WT = "C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/p1-u7/apps/api";
const imp = (rel: string) => import(pathToFileURL(`${WT}/${rel}`).href);
const fx: any = await imp("tests/anonymous-fixtures.ts");
const anon: any = await imp("src/anonymous.ts");
const srv: any = await imp("src/server.ts");
const idx: any = await imp("src/index.ts");
const gate: any = await imp("src/go-live-gate.ts");
const auth: any = await imp("src/auth.ts");
const dbt: any = await import(pathToFileURL(`${WT}/../../packages/db/src/testing.ts`).href).catch(() => null);

const results: string[] = [];
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failed++;
  results.push(`${ok ? "OK  " : "FAIL"} ${name}${detail ? " :: " + detail : ""}`);
}
const GENERIC = "What are the tuition fees for public universities in Germany?";

// ---- P1: spoofed X-Forwarded-For / Forwarded / X-Real-IP over real HTTP -------------------------------------------
{
  const w = fx.anonWorld();
  const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const PEM = keys.publicKey.export({ type: "spki", format: "pem" }).toString();
  const verifier = auth.createJwtVerifier(auth.jwtConfigFromEnv({ VC_JWT_ISSUER: "https://issuer.synthetic.test", VC_JWT_PUBLIC_KEY: PEM }));
  const main = srv.createApiHandler({ verifier, dbForTenant: () => { throw new Error("db"); }, graphForTenant: () => { throw new Error("graph"); } });
  const server = srv.createApiServer(anon.withAnonymousRoutes(main, w.handler));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as any).port;
  const statuses: number[] = [];
  for (let i = 0; i < 13; i++) {
    const r = await fetch(`http://127.0.0.1:${port}${anon.ANONYMOUS_PATH}`, {
      method: "POST",
      headers: { "x-forwarded-for": `198.51.100.${i + 1}`, "x-real-ip": `192.0.2.${i + 1}`, forwarded: `for=203.0.113.${i + 1}`, "client-ip": `10.9.8.${i + 1}`, "cf-connecting-ip": `10.7.6.${i + 1}` },
      body: JSON.stringify({ text: GENERIC }),
    });
    statuses.push(r.status);
    if (i === 10) {
      const j: any = await r.json();
      check("P1 11th request has helpline and retry-after", j.helpline && /14416/.test(j.helpline) && r.headers.get("retry-after") !== null, JSON.stringify(j));
    } else await r.arrayBuffer();
  }
  check("P1 spoofed XFF/Forwarded/X-Real-IP does not buy a fresh bucket over real HTTP", JSON.stringify(statuses) === JSON.stringify([...Array(10).fill(200), 429, 429, 429]), statuses.join(","));
  // Authorization header + identity are ignored
  const r2 = await fetch(`http://127.0.0.1:${port}${anon.ANONYMOUS_PATH}`, { method: "POST", headers: { authorization: "Bearer not.a.jwt", "x-tenant-id": "t1" }, body: JSON.stringify({ text: "I want to kill myself" }) });
  const j2: any = await r2.json();
  check("P1b crisis with garbage Authorization header still served anonymously (200 escalated)", r2.status === 200 && j2.state === "escalated", `${r2.status} ${j2.state}`);
  const r3 = await fetch(`http://127.0.0.1:${port}/v1/students/s1/export`);
  check("P1c other route still 401", r3.status === 401, String(r3.status));
  const r4 = await fetch(`http://127.0.0.1:${port}${anon.ANONYMOUS_PATH}/`, { method: "POST", body: JSON.stringify({ text: GENERIC }) });
  check("P1d trailing-slash path is NOT served anonymously", r4.status === 401 || r4.status === 404, String(r4.status));
  const r5 = await fetch(`http://127.0.0.1:${port}/v1/public/chat/turns/../../students/s1/export`, { method: "POST", body: JSON.stringify({ text: GENERIC }) });
  check("P1e dot-segment path to another route is not anonymous", r5.status === 401 || r5.status === 404, String(r5.status));
  const r6 = await fetch(`http://127.0.0.1:${port}/v1/voice`, { method: "POST", body: "{}" });
  check("P1f no anonymous voice route", r6.status === 401 || r6.status === 404, String(r6.status));
  await new Promise<void>((r) => server.close(() => r()));
  w.cleanup();
}

// ---- P2: crisis on a rate-limited client; limiter is not consumed by crisis -----------------------------------------
{
  const w = fx.anonWorld();
  for (let i = 0; i < 10; i++) await fx.ask(w, GENERIC);
  const lim = await fx.ask(w, GENERIC);
  check("P2 generic #11 is 429 with helpline", lim.status === 429 && /14416/.test(lim.json.helpline), String(lim.status));
  const cr = await fx.ask(w, "I want to kill myself");
  check("P2 crisis at #12 on a limited client is 200 escalated + Tele-MANAS", cr.status === 200 && cr.json.state === "escalated" && /14416/.test(cr.json.message), `${cr.status} ${cr.json?.state}`);
  const hi = await fx.ask(w, "mujhe jeene ka mann nahi karta, marna chahta hoon");
  check("P2b Hinglish crisis on limited client 200", hi.status === 200 && hi.json.state === "escalated", `${hi.status} ${hi.json?.state}`);
  for (let i = 0; i < 30; i++) await fx.ask(w, "I want to kill myself");
  const still = await fx.ask(w, GENERIC);
  check("P2c 30 more crisis messages did not reset the budget (generic still 429)", still.status === 429);
  w.kb.calls.length = 0;
  const kbBefore = w.kb.calls.length;
  await fx.ask(w, "I want to end my life");
  check("P2d crisis never reaches KB", w.kb.calls.length === kbBefore);
  // crisis messages do not consume budget for a fresh client
  const w2 = fx.anonWorld();
  for (let i = 0; i < 25; i++) await fx.ask(w2, "I want to kill myself", { ip: "198.51.100.5" });
  const ok10: number[] = [];
  for (let i = 0; i < 11; i++) ok10.push((await fx.ask(w2, GENERIC, { ip: "198.51.100.5" })).status);
  check("P2e 25 crisis then 10 generic allowed, 11th 429", JSON.stringify(ok10) === JSON.stringify([...Array(10).fill(200), 429]), ok10.join(","));
  // limiter-bypass via "concern"-level phrase prefix: must still not reach model/KB
  const w3 = fx.anonWorld();
  for (let i = 0; i < 12; i++) await fx.ask(w3, GENERIC, { ip: "198.51.100.9" });
  w3.kb.calls.length = 0;
  const provBefore = (w3.provider as any).calls?.length;
  const pre = await fx.ask(w3, "I feel hopeless. " + GENERIC, { ip: "198.51.100.9" });
  check("P2f concern/crisis-prefixed generic question (limiter skipped) does not reach the KB or the model", w3.kb.calls.length === 0 && (provBefore === undefined || (w3.provider as any).calls.length === provBefore), `${pre.status} ${pre.json?.state} kbcalls=${w3.kb.calls.length}`);
  w.cleanup(); w2.cleanup(); w3.cleanup();
}

// ---- P3: gate flag on, A20 records wrong/unsigned ---------------------------------------------------------------------
{
  const bad: Record<string, any> = {
    "B13 PENDING": { b13: "B13-signed: PENDING\n" },
    "B13 signed by role word": { b13: "B13-signed: SIGNED 2026-10-16T10:00:00+05:30 by maker\n" },
    "B13 signer not approver": { b13: "B13-signed: SIGNED 2026-10-16T10:00:00+05:30 by Mallory\n" },
    "B13 file missing": { b13: null },
    "g-prod option a (no anonymous)": { gProd: "Answered: 2026-10-16T10:10:00+05:30 - a - text only\n" },
    "g-prod option d (hold)": { gProd: "Answered: 2026-10-16T10:10:00+05:30 - d - hold\n" },
    "g-prod no Answered": { gProd: "# open\n" },
    "g-publish missing": { gPublish: null },
    "nights missing": { nights: null },
    "nights bogus": { nights: "Nights-mode: none\n" },
    "g-prod answered in the future": { gProd: "Answered: 2099-10-16T10:10:00+05:30 - b - x\n" },
    "g-prod commented-out answer": { gProd: "<!-- Answered: 2026-10-16T10:10:00+05:30 - b - x -->\n" },
  };
  for (const [name, o] of Object.entries(bad)) {
    const f = fx.gatesFixture(o);
    let refused = false;
    let built: any;
    try {
      built = anon.createAnonymousApi({ kb: fx.recordingKb(), provider: fx.kbAnswerProvider(), skillsDir: fx.SKILLS_DIR, speakers: fx.SPEAKERS, counter: { increment: async () => {} } }, { enabled: true, gatesDir: f.gates, now: fx.NOW, approver: fx.APPROVER, env: {} });
    } catch (e: any) {
      refused = e?.name === "GoLiveRefusedError";
    }
    check(`P3 gate refuses: ${name}`, refused && built === undefined);
    fx.cleanupGates(f);
  }
  // control: all good serves
  const f = fx.gatesFixture();
  const h = anon.createAnonymousApi({ kb: fx.recordingKb(), provider: fx.kbAnswerProvider(), skillsDir: fx.SKILLS_DIR, speakers: fx.SPEAKERS, counter: { increment: async () => {} } }, { enabled: true, gatesDir: f.gates, now: fx.NOW, approver: fx.APPROVER, env: {} });
  check("P3 control: good gates + flag on serves", typeof h === "function");
  // tracing env
  for (const v of ["LANGSMITH_TRACING", "LANGCHAIN_TRACING_V2", "LANGSMITH_TRACING_V2", "LANGCHAIN_TRACING"]) {
    let threw = false;
    try { anon.createAnonymousApi({ kb: fx.recordingKb(), provider: fx.kbAnswerProvider(), skillsDir: fx.SKILLS_DIR, speakers: fx.SPEAKERS, counter: { increment: async () => {} } }, { enabled: true, gatesDir: f.gates, now: fx.NOW, approver: fx.APPROVER, env: { [v]: "true" } }); } catch (e: any) { threw = e?.name === "Error" || /Tracing|tracing/.test(String(e?.message)); }
    check(`P3 tracing ${v}=true refuses`, threw);
  }
  fx.cleanupGates(f);
  // flag is not enabled by object presence alone; real repo gates refuse
  for (const raw of [undefined, "", "false"]) {
    check(`P3 flag ${JSON.stringify(raw)} off`, anon.anonymousEnabledFromEnv({ VC_ANONYMOUS_ENABLED: raw }) === false);
  }
  const rr = gate.evaluateGoLive(anon.DEFAULT_GATES_DIR, "anonymous");
  check("P3 real repo gates today refuse anonymous", rr.allowed === false, rr.failures.join(" | ").slice(0, 300));
}

// ---- P4: no student text anywhere (DB, logs, console, error bodies) --------------------------------------------------
{
  const MARK = "ZQXMARKER7731";
  const texts = [
    `What are the tuition fees for public universities in Germany? ${MARK}`,
    `${MARK} I scored 72 percent which college should I apply to`,
    `${MARK} I want to kill myself`,
    `${MARK} what is the tuition for xyzzyland quantum medicine`,
    `${MARK} my email is a.b@example.com what are fees`,
  ];
  const w = fx.anonWorld({ kb: fx.recordingKb((q: string) => (q.includes("xyzzyland") ? fx.SEARCH_EMPTY : fx.SEARCH_OK)) });
  const { output } = await fx.captureOutput(async () => {
    for (const t of texts) await fx.ask(w, t);
  });
  const dump = JSON.stringify(w.fakeDb.collection(anon.ANONYMOUS_PATH ? "anonymous_counters" : "").all());
  const ne = fx.nonEmptyCollections(w.fakeDb);
  check("P4 only anonymous_counters non-empty", JSON.stringify(Object.keys(ne)) === JSON.stringify(["anonymous_counters"]), JSON.stringify(ne));
  check("P4 counter docs have only _id,date,kind,count and no marker", !dump.includes(MARK) && w.fakeDb.collection("anonymous_counters").all().every((d: any) => Object.keys(d).sort().join() === "_id,count,date,kind"), dump);
  check("P4 captured console/stderr has no marker", !output.includes(MARK), output.slice(0, 200));
  check("P4 logs array has no marker", !JSON.stringify(w.logs).includes(MARK));
  // errors carrying text
  const wErr = fx.anonWorld({ provider: { ...fx.kbAnswerProvider(), complete: async () => { throw new Error(`boom ${MARK}`); }, name: "x" } as any });
  const wErr2 = fx.anonWorld({ kb: { searchKb: async (q: string) => { throw new Error(`kb down ${q}`); } } as any });
  const outs: string[] = [];
  const cap = await fx.captureOutput(async () => {
    for (const ww of [wErr, wErr2]) {
      const r = await fx.ask(ww, `${MARK} What is the tuition in Germany?`);
      outs.push(r.status + " " + r.body);
      outs.push(JSON.stringify(ww.logs));
    }
  });
  check("P4b provider/KB error text never reaches response, logs or console", !outs.join("\n").includes(MARK) && !cap.output.includes(MARK), outs.join(" | ").slice(0, 400));
  w.cleanup(); wErr.cleanup(); wErr2.cleanup();
}

// ---- P5: personal/ambiguous -> sign_in_required, KB and model untouched -------------------------------------------------
{
  const w = fx.anonWorld();
  const personal = [
    "I scored 72% in 12th, which college should I apply?",
    "mera percentile 90 hai kaunsa college milega",
    "मेरे 12वीं में 80 प्रतिशत हैं, मुझे कौन सा कॉलेज लेना चाहिए",
    "my phone is 9876543210, call me about fees",
    "email me at a@b.co the fee details",
    "Germany",
    "should I study in Germany",
    "Can you review my SOP?",
    "which is better for someone like me, UK or Canada",
    "What are the chances for a student with 7.5 CGPA",
  ];
  for (const t of personal) {
    const r = await fx.ask(w, t, { ip: "198.51.100." + (personal.indexOf(t) + 20) });
    check(`P5 personal -> sign_in_required: ${t.slice(0, 40)}`, r.json?.state === "sign_in_required" && /14416/.test(r.json.message), `${r.status} ${r.json?.state}`);
  }
  check("P5 KB and model untouched for all personal questions", w.kb.calls.length === 0);
  w.cleanup();
}

// ---- P6: crisis scan CPU on hostile 256 KiB bodies (the scan runs BEFORE the limiter) ------------------------------------
{
  const w = fx.anonWorld();
  const N = 250 * 1024;
  const shapes: Record<string, string> = {
    letterspaced: "a ".repeat(N / 2),
    killspaced: "k i l l   m y s e l f ".repeat(N / 22).slice(0, N).replace("k i l l   m y s e l f", "k i l l   m y s e"),
    aaaa: "a".repeat(N),
    spaces: " ".repeat(N - 1) + "x",
    punct: "!?.,;:-".repeat(N / 7),
    devanagari: "नमस्ते ".repeat(N / 21),
    mixedcase: "AbCd ".repeat(N / 5),
    digits: "1 ".repeat(N / 2),
    zwj: "a\u200b".repeat(N / 2),
    nonascii: "é".repeat(N / 2),
    longword_then_text: "x".repeat(N / 2) + " " + "what is the fee ".repeat(N / 32),
  };
  for (const [name, body] of Object.entries(shapes)) {
    const t0 = performance.now();
    const r = await w.handler(fx.anonRequest({ text: body }, { ip: "203.0.113." + (Object.keys(shapes).indexOf(name) + 1) }));
    const ms = performance.now() - t0;
    results.push(`INFO P6 ${name}: ${Math.round(body.length / 1024)} KiB -> ${r.status} in ${ms.toFixed(0)} ms`);
    check(`P6 ${name} handled < 3000 ms`, ms < 3000, ms.toFixed(0));
  }
  w.cleanup();
}

// ---- P7: counter that never answers / throws never delays or fails the reply --------------------------------------------
{
  const never = { increment: () => new Promise<void>(() => {}) };
  const w = fx.anonWorld({ counter: never });
  for (const [label, text] of [["crisis", "I want to kill myself"], ["generic", GENERIC], ["personal", "which college should I apply for my 80%"]] as const) {
    const t0 = performance.now();
    const r = await fx.ask(w, text, { ip: "198.51.100." + (label.length + 60) });
    const ms = performance.now() - t0;
    check(`P7 never-answering counter, ${label}: reply ${r.status} in ${ms.toFixed(0)} ms (< 1500)`, r.status === 200 && ms < 1500);
  }
  w.cleanup();
  const thr = fx.anonWorld({ counter: { increment: async () => { throw new Error("db down ZQ"); } } });
  const r = await fx.ask(thr, "I want to kill myself");
  check("P7b throwing counter, crisis still 200 with Tele-MANAS", r.status === 200 && /14416/.test(r.json.message));
  check("P7c counter failure logged text-free", !JSON.stringify(thr.logs).includes("kill") && !JSON.stringify(thr.logs).includes("db down"), JSON.stringify(thr.logs).slice(0, 200));
  thr.cleanup();
}

// ---- P8: body-shape and method refusals bare + helpline -------------------------------------------------------------------
{
  const w = fx.anonWorld();
  const cases: [string, any, number][] = [
    ["not json", "{nope", 400],
    ["array", "[]", 400],
    ["extra key tenantId", { text: GENERIC, tenantId: "t" }, 400],
    ["extra key studentId", { text: GENERIC, studentId: "s" }, 400],
    ["text number", { text: 5 }, 400],
    ["empty text", { text: "" }, 400],
    ["over-long non-crisis", { text: "a".repeat(5000) }, 400],
    ["null", "null", 400],
  ];
  for (const [n, b, st] of cases) {
    const res = await w.handler(fx.anonRequest(b, { ip: "198.51.100." + (130 + cases.findIndex((c) => c[0] === n)) }));
    check(`P8 ${n} -> ${st} bare + helpline`, res.status === st && JSON.parse(res.body).helpline && !res.body.includes("tenantId") && !res.body.includes("{nope") && Object.keys(JSON.parse(res.body)).sort().join() === "error,helpline", `${res.status} ${res.body.slice(0, 120)}`);
  }
  for (const m of ["GET", "PUT", "DELETE", "PATCH"]) {
    const res = await w.handler(fx.anonRequest({ text: GENERIC }, { method: m, ip: "198.51.100.200" }));
    check(`P8 ${m} -> 405 + allow`, res.status === 405 && res.headers.allow === "POST");
  }
  // over-long crisis (>4000 chars) scanned
  const longCrisis = "blah ".repeat(1200) + " I want to kill myself";
  const res = await w.handler(fx.anonRequest({ text: longCrisis }, { ip: "198.51.100.201" }));
  check("P8 over-long crisis message answered with crisis message, not 400", res.status === 200 && JSON.parse(res.body).state === "escalated", `${res.status}`);
  w.cleanup();
}

// ---- P9: address normalisation & limiter ------------------------------------------------------------------------------------
{
  const n = anon.normalizeClientAddress;
  check("P9 ipv4-mapped == ipv4", n("::ffff:203.0.113.7") === "203.0.113.7" && n("::ffff:cb00:7107") === "203.0.113.7", n("::ffff:203.0.113.7") + " " + n("::ffff:cb00:7107"));
  const a = n("2001:db8:1:2:aaaa:bbbb:cccc:dddd"), b = n("2001:db8:1:2:1111:2222:3333:4444"), c = n("2001:db8:1:3::1");
  check("P9 same /64 shares, different /64 differs", a === b && a !== c, `${a} ${b} ${c}`);
  check("P9 garbage never throws", ["", "zzz", "::::", "1.2.3", "fe80::1%eth0", undefined, "::ffff:999.1.1.1"].every((x) => { try { n(x as any); return true; } catch { return false; } }));
  const clock = { ms: 0 };
  const lim = new anon.AnonymousRateLimiter({ limit: 10, windowMs: 60000, maxKeys: 3, nowMs: () => clock.ms });
  lim.check("a"); lim.check("b"); lim.check("c");
  const full = lim.check("d");
  check("P9 full table of live keys refuses a NEW key (fail closed) but serves existing", full.allowed === false && lim.check("a").allowed === true);
  clock.ms = 61000;
  check("P9 after TTL a new key is admitted", lim.check("d").allowed === true);
}

// ---- P10: output hardening ----------------------------------------------------------------------------------------------------
{
  const HIT = fx.HIT;
  const wa = fx.anonWorld({
    kb: fx.recordingKb({ status: "ok", hits: [{ ...HIT, sourceKind: "whatsapp", sessionTitle: "Private chat with Priya Sharma" }], dropped: 0 }),
    provider: fx.kbAnswerProvider([{ text: "Public universities in Germany charge no tuition for most programmes.", kind: "fact", sourceIds: ["t-sem-1"] }], "Could you tell me your marks and school?"),
  });
  const r = await fx.ask(wa, GENERIC);
  const body = JSON.stringify(r.json);
  check("P10 whatsapp-kind: state ok/no_answer, no title/Priya, no raw turn id, no follow-up solicitation", !body.includes("Priya") && !body.includes("t-sem-1") && !body.includes("marks and school"), body.slice(0, 300));
  const wb = fx.anonWorld({
    provider: fx.kbAnswerProvider([{ text: "Public universities in Germany charge no tuition for most programmes.", kind: "fact", sourceIds: ["t-sem-1"] }]),
  });
  const r2 = await fx.ask(wb, GENERIC);
  check("P10b normal answer: opaque ids and no internal fields", r2.json.state === "ok" && r2.json.sources.every((s: any) => /^s\d+$/.test(s.id)) && !JSON.stringify(r2.json).includes("sess-sem-1") && !JSON.stringify(r2.json).includes("t-sem-1") && !("turnId" in r2.json), JSON.stringify(r2.json).slice(0, 400));
  // training-data claim (no source) dropped
  const wc = fx.anonWorld({ provider: fx.kbAnswerProvider([{ text: "Germany is the best country on earth.", kind: "fact", sourceIds: [] }]) });
  const r3 = await fx.ask(wc, GENERIC);
  check("P10c uncited/unverified claim dropped -> no_sourced_answer with helpline", r3.json.state === "no_sourced_answer" && /14416/.test(r3.json.message), JSON.stringify(r3.json).slice(0, 300));
  wa.cleanup(); wb.cleanup(); wc.cleanup();
}

console.log(results.join("\n"));
console.log(`\nPROBE SUMMARY: ${results.filter((r) => r.startsWith("OK")).length} ok, ${failed} FAIL`);
process.exit(failed ? 1 : 0);
