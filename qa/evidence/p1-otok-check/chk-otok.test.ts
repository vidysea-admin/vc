/** CHECKER-owned outcome proof for p1-ollama-actual-tokens (D-103), judged at 553660d. Mocked fetch only; no network. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, appendFileSync, chmodSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { OllamaProvider } from "@vc/providers";
import { parseP1Args, type RunnerOutcome } from "./run-eval.js";
import { runKb } from "./run-kb.js";
import { runProbes } from "./run-probes.js";
import { runLatency } from "./run-latency.js";
import { readLedger, monthSpendUsd, type LedgerEntry } from "./budget.js";

const NOW = () => new Date("2026-10-17T10:00:00Z");
const GATE = (() => {
  const path = join(mkdtempSync(join(tmpdir(), "chk-gate-")), "g-real.md");
  writeFileSync(path, "# G-REAL\n\nAnswered: 2026-10-17T00:00:00+05:30 - A - Umesh\n", "utf-8");
  return path;
})();
const ENV = { VC_G_REAL: "1", VC_REAL_MODEL: "ollama:glm-5.3-flash", OLLAMA_API_KEY: "chk-secret" };

function tmp() {
  const dir = mkdtempSync(join(tmpdir(), "chk-otok-"));
  return { dir, outDir: join(dir, "reports"), ledger: join(dir, "ledger.jsonl") };
}
function write(dir: string, name: string, content: unknown): string {
  const p = join(dir, name);
  writeFileSync(p, typeof content === "string" ? content : JSON.stringify(content), "utf-8");
  return p;
}
const hit = (turnId: string, sessionId = "s-1") => ({ turnId, sessionId, score: 0.9, turn: { text: `passage ${turnId}` }, session: {} });
function kbFiles(dir: string) {
  const golden = write(
    dir,
    "golden.jsonl",
    [
      { source: "synthetic" },
      { id: "g-en", lang: "en", country: "USA", theme: "tuition", question: "SYNTHETIC english tuition question", expectedTurnIds: ["t-en"], expectedSessionIds: [] },
      { id: "g-hi", lang: "hinglish", country: "Germany", theme: "visa", question: "SYNTHETIC-HI germany visa kaise milta hai", expectedTurnIds: ["t-hi"], expectedSessionIds: [] },
    ].map((q) => JSON.stringify(q)).join("\n"),
  );
  const fixture = write(dir, "fixture.json", {
    schemaVersion: 1,
    source: "synthetic",
    recordedAt: "2026-10-17T00:00:00Z",
    search: [
      { query: "SYNTHETIC english tuition question", hits: [hit("t-en")] },
      { query: "how does a student get a germany visa", hits: [hit("t-hi", "s-2")] },
    ],
  });
  return { golden, fixture };
}
function probeCases(dir: string): string {
  const ask = (internal: string[], web: unknown[], verdict: string, insufficient: boolean, webUsed: boolean) => ({
    answer: "recorded answer", verdict, insufficient_coverage: insufficient, web_used: webUsed,
    sources: { internal: internal.map((node_id) => ({ node_id, text: `KB passage text for ${node_id}` })), web },
  });
  return write(dir, "probes.json", {
    schemaVersion: 1, source: "synthetic",
    cases: [
      { id: "p-ok", question: "SYNTHETIC in-KB question", expectServed: true, ask: ask(["n-1"], [], "correct", false, false) },
      { id: "p-out", question: "SYNTHETIC out-of-KB question", expectServed: false, ask: ask([], [{ url: "https://example.invalid" }], "incorrect", true, true) },
    ],
  });
}

type RunnerName = "run-kb" | "run-probes" | "run-latency";
const RUNNERS: { name: RunnerName; base: string; n: number }[] = [
  { name: "run-kb", base: "kb-report.json", n: 1 },
  { name: "run-probes", base: "probes-report.json", n: 2 },
  { name: "run-latency", base: "latency-report.json", n: 20 },
];
function runIt(name: RunnerName, dir: string, outDir: string, ledger: string, fetchImpl: typeof fetch, env: Record<string, string> = ENV): Promise<RunnerOutcome> {
  const deps = { env, gateFile: GATE, now: NOW, fetchImpl };
  if (name === "run-kb") {
    const { golden, fixture } = kbFiles(dir);
    return runKb({ ...parseP1Args(["--real", `--golden=${golden}`, `--fixture=${fixture}`]), outDir, ledger }, deps);
  }
  if (name === "run-probes") return runProbes({ ...parseP1Args(["--real", `--cases=${probeCases(dir)}`]), outDir, ledger }, deps);
  const { golden, fixture } = kbFiles(dir);
  return runLatency({ ...parseP1Args(["--real", `--golden=${golden}`, `--fixture=${fixture}`]), outDir, ledger }, deps);
}

/** A fake Ollama that answers each runner's schema, with extra raw JSON fragments (counts) chosen per call number. */
function fake(name: RunnerName, rawCounts: (n: number) => string): { fetchImpl: typeof fetch; calls: number[] } {
  const calls: number[] = [];
  const fetchImpl = (async (_u: string | URL | Request, init?: RequestInit) => {
    calls.push(calls.length + 1);
    const n = calls.length;
    const body = JSON.parse(String(init?.body)) as { messages: { content: string }[] };
    const user = JSON.parse(body.messages[1]!.content) as Record<string, unknown>;
    let answer: unknown;
    if (name === "run-kb") answer = { english: "how does a student get a germany visa" };
    else if (name === "run-probes") {
      const p = user["passages"] as { node_id: string }[];
      answer = p.length > 0 ? { answer: "g", verdict: "correct", insufficient_coverage: false, web_used: false, source_node_ids: [p[0]!.node_id] } : { answer: "", verdict: "insufficient", insufficient_coverage: true, web_used: false, source_node_ids: [] };
    } else answer = { answer: "short" };
    const content = JSON.stringify(JSON.stringify(answer));
    const extra = rawCounts(n);
    return new Response(`{"message":{"role":"assistant","content":${content}},"done":true${extra ? "," + extra : ""}}`, { status: 200 });
  }) as typeof fetch;
  return { fetchImpl, calls };
}
const kinds = (es: LedgerEntry[]) => es.map((e) => e.kind);
const reportJson = (outDir: string, base: string) => JSON.parse(readFileSync(join(outDir, base), "utf-8"));

for (const r of RUNNERS) {
  test(`CHK C2/C4 ${r.name}: one actual line after each charge, tokens equal the mocked counts, report sums equal ledger sums, usdBasis notional`, async () => {
    const { dir, outDir, ledger } = tmp();
    const inTok = (n: number) => 100 + 7 * n;
    const outTok = (n: number) => 3 * n + 1;
    const { fetchImpl, calls } = fake(r.name, (n) => `"prompt_eval_count":${inTok(n)},"eval_count":${outTok(n)}`);
    const outcome = await runIt(r.name, dir, outDir, ledger, fetchImpl);
    assert.equal(outcome.status, "completed");
    assert.equal(calls.length, r.n);
    const es = readLedger(ledger);
    const body = es.filter((e) => e.kind === "charge" || e.kind === "actual");
    assert.equal(body.length, 2 * r.n);
    body.forEach((e, i) => assert.equal(e.kind, i % 2 === 0 ? "charge" : "actual", `line ${i} order`));
    assert.deepEqual(kinds(es)[0], "start");
    assert.deepEqual(kinds(es).at(-1), "end");
    let sumIn = 0, sumOut = 0, sumUsd = 0;
    for (let i = 0; i < r.n; i++) {
      const ch = body[2 * i]!, ac = body[2 * i + 1]!;
      assert.equal(ac.actual, "reported");
      assert.equal(ac.actualInTokens, inTok(i + 1));
      assert.equal(ac.actualOutTokens, outTok(i + 1));
      assert.equal(ac.reservedUsd, ch.usd, "actual belongs to the charge before it");
      assert.ok(Math.abs(ac.actualUsd! - (inTok(i + 1) * 1 + outTok(i + 1) * 4) / 1e6) < 1e-12);
      sumIn += ac.actualInTokens!; sumOut += ac.actualOutTokens!; sumUsd += ac.actualUsd!;
    }
    const j = reportJson(outDir, r.base);
    assert.equal(j.usage.reportedCalls, r.n);
    assert.equal(j.usage.unreportedCalls, 0);
    assert.equal(j.usage.actualInTokens, sumIn);
    assert.equal(j.usage.actualOutTokens, sumOut);
    assert.ok(Math.abs(j.usage.actualUsd - sumUsd) < 1e-9);
    assert.equal(j.usage.usdBasis, "notional");
    assert.equal(j.usage.backend, "ollama");
    assert.match(outcome.markdown, new RegExp(`actual input tokens ${sumIn}, output tokens ${sumOut}`));
    assert.match(outcome.markdown, /notional/);
    assert.match(readFileSync(join(outDir, r.base.replace(".json", ".md")), "utf-8"), new RegExp(`actual input tokens ${sumIn}`));
    // Spend figure = reservation total = charge lines only
    const chargeSum = es.filter((e) => e.kind === "charge").reduce((s, e) => s + e.usd!, 0);
    assert.ok(Math.abs(j.spentUsd - chargeSum) < 1e-9);
    assert.ok(Math.abs(monthSpendUsd(es, NOW()) - chargeSum) < 1e-9, "month spend counts charge lines only");
  });
}

// Invalid shapes through the real latency runner (20 calls): shape n-1 for the first calls, then valid zeros.
const SHAPES: [string, string][] = [
  ["missing", ""],
  ["only prompt", `"prompt_eval_count":10`],
  ["only eval", `"eval_count":10`],
  ["negative", `"prompt_eval_count":-5,"eval_count":3`],
  ["negative out", `"prompt_eval_count":5,"eval_count":-3`],
  ["float", `"prompt_eval_count":10.5,"eval_count":3`],
  ["string", `"prompt_eval_count":"10","eval_count":"3"`],
  ["null", `"prompt_eval_count":null,"eval_count":null`],
  ["NaN string", `"prompt_eval_count":"NaN","eval_count":3`],
  ["huge 2^60", `"prompt_eval_count":1152921504606846976,"eval_count":3`],
  ["MAX_SAFE+1", `"prompt_eval_count":9007199254740992,"eval_count":3`],
  ["Infinity (1e999)", `"prompt_eval_count":1e999,"eval_count":3`],
  ["array", `"prompt_eval_count":[1],"eval_count":3`],
  ["bool", `"prompt_eval_count":true,"eval_count":3`],
  ["object", `"prompt_eval_count":{},"eval_count":3`],
];
test("CHK C2 run-latency: missing/negative/string/float/NaN/huge counts -> unreported with the reservation figure, never 0; valid zero counts stay reported", async () => {
  const { dir, outDir, ledger } = tmp();
  const { fetchImpl } = fake("run-latency", (n) => (n <= SHAPES.length ? SHAPES[n - 1]![1] : `"prompt_eval_count":0,"eval_count":0`));
  const outcome = await runIt("run-latency", dir, outDir, ledger, fetchImpl);
  assert.equal(outcome.status, "completed");
  const es = readLedger(ledger);
  const ch = es.filter((e) => e.kind === "charge");
  const ac = es.filter((e) => e.kind === "actual");
  assert.equal(ch.length, 20);
  assert.equal(ac.length, 20);
  let unrepRes = 0;
  for (let i = 0; i < 20; i++) {
    if (i < SHAPES.length) {
      assert.equal(ac[i]!.actual, "unreported", SHAPES[i]![0]);
      assert.equal(ac[i]!.actualInTokens, undefined, SHAPES[i]![0]);
      assert.equal(ac[i]!.actualOutTokens, undefined, SHAPES[i]![0]);
      assert.equal(ac[i]!.actualUsd, undefined, SHAPES[i]![0]);
      assert.equal(ac[i]!.reservedUsd, ch[i]!.usd, SHAPES[i]![0]);
      assert.ok(ch[i]!.usd! > 0);
      unrepRes += ch[i]!.usd!;
    } else {
      assert.equal(ac[i]!.actual, "reported");
      assert.equal(ac[i]!.actualInTokens, 0);
      assert.equal(ac[i]!.actualOutTokens, 0);
    }
  }
  const u = reportJson(outDir, "latency-report.json").usage;
  assert.equal(u.unreportedCalls, SHAPES.length);
  assert.equal(u.reportedCalls, 20 - SHAPES.length);
  assert.equal(u.actualInTokens, 0);
  assert.ok(Math.abs(u.unreportedReservedUsd - unrepRes) < 1e-6);
  assert.ok(u.unreportedReservedUsd > 0);
});

// C3: cap refuses BEFORE the request.
test("CHK C3 per-run: reservation exceeding the per-run cap -> zero fetch calls and an abort report; tiny actuals do not free headroom", async () => {
  // (a) first reservation already over 50: zero fetch
  {
    const { dir, outDir, ledger } = tmp();
    const { fetchImpl, calls } = fake("run-latency", () => `"prompt_eval_count":1,"eval_count":1`);
    const o = await runIt("run-latency", dir, outDir, ledger, fetchImpl, { ...ENV, OLLAMA_PRICE_USD_PER_MTOK: "100000,100000" });
    assert.equal(o.status, "aborted-budget");
    assert.equal(calls.length, 0, "no request sent when the reservation exceeds the cap");
    assert.equal(readLedger(ledger).filter((e) => e.kind === "actual").length, 0);
  }
  // (b) ~20.5 per call: two fit, the third (61) is refused even though both actuals were 1 token
  {
    const { dir, outDir, ledger } = tmp();
    const { fetchImpl, calls } = fake("run-latency", () => `"prompt_eval_count":1,"eval_count":1`);
    const o = await runIt("run-latency", dir, outDir, ledger, fetchImpl, { ...ENV, OLLAMA_PRICE_USD_PER_MTOK: "10000,10000" });
    assert.equal(o.status, "aborted-budget");
    assert.equal(calls.length, 2);
    const es = readLedger(ledger);
    assert.deepEqual(kinds(es).slice(0, 5), ["start", "charge", "actual", "charge", "actual"]);
    assert.equal(es.filter((e) => e.kind === "charge").length, 2);
    const j = reportJson(outDir, "latency-report.json");
    assert.equal(j.status, "aborted-budget");
    assert.equal(j.usage.reportedCalls, 2);
    const chargeSum = es.filter((e) => e.kind === "charge").reduce((s, e) => s + e.usd!, 0);
    assert.ok(Math.abs(j.spentUsd - chargeSum) < 1e-9, "spend = reservation sum, not the tiny actuals");
  }
});
test("CHK C3 month: seeded month charges + actual lines (actualUsd tiny AND huge) never change month spend; a reservation over the remaining month budget is refused with zero fetches", async () => {
  for (const actualUsd of [0.000001, 1000]) {
    const { dir, outDir, ledger } = tmp();
    const ts = "2026-10-05T00:00:00.000Z";
    const lines = [
      { ts, runId: "seed", runner: "seed", kind: "start" },
      { ts, runId: "seed", runner: "seed", kind: "charge", usd: 190 },
      { ts, runId: "seed", runner: "seed", kind: "actual", actual: "reported", actualInTokens: 1, actualOutTokens: 1, actualUsd, reservedUsd: 190 },
      { ts, runId: "seed", runner: "seed", kind: "end", status: "completed" },
    ];
    writeFileSync(ledger, lines.map((l) => JSON.stringify(l)).join("\n") + "\n", "utf-8");
    assert.equal(monthSpendUsd(readLedger(ledger), NOW()), 190, "month spend counts charge lines only");
    const { fetchImpl, calls } = fake("run-latency", () => `"prompt_eval_count":1,"eval_count":1`);
    const o = await runIt("run-latency", dir, outDir, ledger, fetchImpl, { ...ENV, OLLAMA_PRICE_USD_PER_MTOK: "10000,10000" });
    assert.equal(o.status, "aborted-budget", `actualUsd=${actualUsd}`);
    assert.equal(calls.length, 0, "refused before the request");
    assert.equal(reportJson(outDir, "latency-report.json").cap, "per-month");
  }
});

// Corrupt actual line fails closed.
const BAD_LINES: [string, string][] = [
  ["reported without tokens", `{"ts":"2026-10-05T00:00:00.000Z","runId":"x","runner":"x","kind":"actual","actual":"reported","reservedUsd":1}`],
  ["unknown flag", `{"ts":"2026-10-05T00:00:00.000Z","runId":"x","runner":"x","kind":"actual","actual":"bogus","reservedUsd":1}`],
  ["no reservedUsd", `{"ts":"2026-10-05T00:00:00.000Z","runId":"x","runner":"x","kind":"actual","actual":"unreported"}`],
  ["negative tokens", `{"ts":"2026-10-05T00:00:00.000Z","runId":"x","runner":"x","kind":"actual","actual":"reported","actualInTokens":-1,"actualOutTokens":1,"actualUsd":0,"reservedUsd":1}`],
  ["string usd", `{"ts":"2026-10-05T00:00:00.000Z","runId":"x","runner":"x","kind":"actual","actual":"reported","actualInTokens":1,"actualOutTokens":1,"actualUsd":"0","reservedUsd":1}`],
  ["not json", `{"ts":"2026-10-05T00:00:00.000Z","kind":"actual","actu`],
];
test("CHK corrupt actual line: readLedger throws; a runner on that ledger refuses with zero fetch calls", async () => {
  for (const [label, line] of BAD_LINES) {
    const { dir, outDir, ledger } = tmp();
    writeFileSync(ledger, line + "\n", "utf-8");
    assert.throws(() => readLedger(ledger), /corrupt/, label);
    const { fetchImpl, calls } = fake("run-kb", () => "");
    await assert.rejects(runIt("run-kb", dir, outDir, ledger, fetchImpl), /corrupt/, label);
    assert.equal(calls.length, 0, label);
  }
});

// Crash between charge and actual (real process death).
test("CHK crash between charge and actual: ledger stays readable, the charge counts, the next run proceeds", async () => {
  const { dir, outDir, ledger } = tmp();
  const script = join(dir, "crash.ts");
  const evals = "file:///" + process.cwd().replace(/\\/g, "/") + "/evals";
  writeFileSync(script, `
import { runKb } from "${evals}/run-kb.ts";
import { parseP1Args } from "${evals}/run-eval.ts";
const golden = ${JSON.stringify(kbFiles(dir).golden)}, fixture = ${JSON.stringify(kbFiles(dir).fixture)};
const fetchImpl = (async () => { process.exit(77); }) as typeof fetch;
await runKb({ ...parseP1Args(["--real", "--golden=" + golden, "--fixture=" + fixture]), outDir: ${JSON.stringify(outDir)}, ledger: ${JSON.stringify(ledger)} },
  { env: ${JSON.stringify(ENV)}, gateFile: ${JSON.stringify(GATE)}, now: () => new Date("2026-10-17T10:00:00Z"), fetchImpl });
`, "utf-8");
  const res = spawnSync(process.execPath, ["--import", "tsx", script], { cwd: process.cwd(), encoding: "utf-8" });
  assert.equal(res.status, 77, `child stderr: ${res.stderr}`);
  const es = readLedger(ledger);
  assert.deepEqual(kinds(es), ["start", "charge"], "charge present, no actual, no end");
  assert.ok(monthSpendUsd(es, NOW()) > 0, "the crashed call's reservation still counts");
  const { fetchImpl, calls } = fake("run-kb", () => `"prompt_eval_count":5,"eval_count":2`);
  const o = await runIt("run-kb", dir, outDir, ledger, fetchImpl);
  assert.equal(o.status, "completed");
  assert.equal(calls.length, 1);
  assert.deepEqual(kinds(readLedger(ledger)), ["start", "charge", "start", "charge", "actual", "end"]);
});

// Default path unchanged.
test("CHK default path (no VC_REAL_MODEL): no usage key, no actual lines, no notional text", async () => {
  const { outDir, ledger } = tmp();
  const o = await runKb({ ...parseP1Args(["--real"]), outDir, ledger }, { env: { VC_G_REAL: "1" }, gateFile: GATE, now: NOW, realBody: async () => ({}) });
  assert.equal(o.status, "completed");
  assert.equal("usage" in (o.report as object), false);
  assert.equal("usage" in reportJson(outDir, "kb-report.json"), false);
  assert.equal(readLedger(ledger).some((e) => e.kind === "actual"), false);
  assert.doesNotMatch(o.markdown, /notional/);
});

// ------------------------------------------------------------------ C5
const Schema = z.object({ answer: z.string() });
const req = { skillName: "s", skillPrompt: "P", outputSchema: Schema, input: { q: 1 } } as never;
test("CHK C5 provider: a throwing afterResponse returns the paid response, one beforeRequest, one fetch, failure counted; no re-send (several throw types)", async () => {
  for (const thrown of [new Error("lock timeout"), "string throw", Object.assign(new Error("EROFS"), { code: "EROFS" }), null]) {
    let fetches = 0, befores = 0, afters = 0;
    const p = new OllamaProvider({
      model: "glm-5.3-flash", apiKey: "k", price: { inputUsdPerMTok: 1, outputUsdPerMTok: 4 },
      beforeRequest: () => { befores++; },
      afterResponse: () => { afters++; throw thrown; },
      fetchImpl: (async () => { fetches++; return new Response(JSON.stringify({ message: { content: JSON.stringify({ answer: "paid" }) }, prompt_eval_count: 9, eval_count: 2 }), { status: 200 }); }) as typeof fetch,
    } as never);
    const out = (await p.generate(req)) as unknown;
    assert.match(JSON.stringify(out), /paid/);
    assert.deepEqual([fetches, befores, afters, p.actualHookFailures], [1, 1, 1, 1]);
  }
});
test("CHK C5 end to end (runner path, custom body): ledger rejects ONE actual append -> that response returned, exactly one charge per call, usage 2 reported + 1 unreported with its reservation, no re-send", async () => {
  const { outDir, ledger } = tmp();
  let calls = 0;
  const fetchImpl = (async () => {
    calls += 1;
    if (calls === 2) chmodSync(ledger, 0o444); // after charge 2, before its actual append
    return new Response(JSON.stringify({ message: { role: "assistant", content: JSON.stringify({ answer: `a${calls}` }) }, done: true, prompt_eval_count: 40, eval_count: 6 }), { status: 200 });
  }) as typeof fetch;
  const answers: unknown[] = [];
  const o = await runKb(
    { ...parseP1Args(["--real"]), outDir, ledger },
    {
      env: ENV, gateFile: GATE, now: NOW, fetchImpl,
      realBody: async (_b, provider) => {
        const ask = () => provider!.generate({ skillName: "s", skillPrompt: "P", outputSchema: Schema, input: { q: 1 } } as never);
        answers.push(await ask());
        answers.push(await ask());
        chmodSync(ledger, 0o666);
        answers.push(await ask());
        return {};
      },
    },
  );
  chmodSync(ledger, 0o666);
  assert.equal(o.status, "completed");
  assert.equal(calls, 3, "no re-send");
  assert.match(JSON.stringify(answers), /a1.*a2.*a3/, "the paid second response was returned");
  const es = readLedger(ledger);
  const ch = es.filter((e) => e.kind === "charge");
  assert.equal(ch.length, 3, "exactly one charge per call");
  assert.deepEqual(kinds(es), ["start", "charge", "actual", "charge", "charge", "actual", "end"]);
  const u = (o.report as { usage: Record<string, number> }).usage;
  assert.equal(u["reportedCalls"], 2);
  assert.equal(u["unreportedCalls"], 1);
  assert.equal(u["actualInTokens"], 80);
  assert.ok(Math.abs(u["unreportedReservedUsd"]! - ch[1]!.usd!) < 1e-9, "the failed-append call keeps its reservation");
  assert.ok(Math.abs((o.report as { spentUsd: number }).spentUsd - ch.reduce((s, e) => s + e.usd!, 0)) < 1e-9);
});
test("CHK C5 torn trailing actual line (killed mid-append) fails closed; the next runner refuses with zero fetch", async () => {
  const { dir, outDir, ledger } = tmp();
  const { fetchImpl } = fake("run-kb", () => `"prompt_eval_count":5,"eval_count":2`);
  await runIt("run-kb", dir, outDir, ledger, fetchImpl);
  const full = JSON.stringify({ ts: "2026-10-17T10:00:00.000Z", runId: "z", runner: "run-kb", kind: "actual", actual: "reported", actualInTokens: 1, actualOutTokens: 1, actualUsd: 0, reservedUsd: 1 });
  appendFileSync(ledger, full.slice(0, Math.floor(full.length / 2)), "utf-8"); // no trailing newline
  assert.throws(() => readLedger(ledger), /corrupt/);
  const f2 = fake("run-kb", () => "");
  await assert.rejects(runIt("run-kb", dir, join(dir, "r2"), ledger, f2.fetchImpl), /corrupt/);
  assert.equal(f2.calls.length, 0);
});
