/** P1 U13b (D-100): the REAL text-runner bodies, driven through the Ollama provider with a MOCKED fetch.
 *  No network, no paid call (B13). Synthetic fixtures only. Every model call must go through the passed
 *  provider (so it is charged to the A24 ledger BEFORE it is sent) and be scored by the runner's existing scorer. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseP1Args, RealNotWiredError, type P1Args, type RunnerDeps, type RunnerOutcome } from "./run-eval.js";
import { runKb } from "./run-kb.js";
import { runH2h } from "./run-h2h.js";
import { runProbes } from "./run-probes.js";
import { runLatency } from "./run-latency.js";
import { runLive, LiveRefusedError } from "./run-live.js";
import { readLedger } from "./budget.js";

const NOW = () => new Date("2026-10-17T10:00:00Z");
const GATE = (() => {
  const path = join(mkdtempSync(join(tmpdir(), "vc-gate-")), "g-real.md");
  writeFileSync(path, "# G-REAL\n\nAnswered: 2026-10-17T00:00:00+05:30 - A - Umesh\n", "utf-8");
  return path;
})();
const KEY = "ollama-real-body-secret";
const ENV = { VC_G_REAL: "1", VC_REAL_MODEL: "ollama:glm-5.3-flash", OLLAMA_API_KEY: KEY };

function tmp(): { dir: string; outDir: string; ledger: string } {
  const dir = mkdtempSync(join(tmpdir(), "vc-real-body-"));
  return { dir, outDir: join(dir, "reports"), ledger: join(dir, "ledger.jsonl") };
}
function write(dir: string, name: string, content: unknown): string {
  const path = join(dir, name);
  writeFileSync(path, typeof content === "string" ? content : JSON.stringify(content), "utf-8");
  return path;
}

interface Seen {
  system: string;
  user: Record<string, unknown>;
}
/** A fake Ollama: `respond(system prompt, parsed user input)` returns the JSON the model "answers". */
function fakeOllama(respond: (system: string, user: Record<string, unknown>) => unknown, delayMs = 0): { fetchImpl: typeof fetch; seen: Seen[] } {
  const seen: Seen[] = [];
  const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { messages: { role: string; content: string }[] };
    const system = body.messages[0]!.content;
    const user = JSON.parse(body.messages[1]!.content) as Record<string, unknown>;
    seen.push({ system, user });
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    return new Response(JSON.stringify({ message: { role: "assistant", content: JSON.stringify(respond(system, user)) }, done: true }), { status: 200 });
  }) as typeof fetch;
  return { fetchImpl, seen };
}
const charges = (ledger: string): number => readLedger(ledger).filter((e) => e.kind === "charge").length;
const jsonReport = (outDir: string, name: string): { status: string; spentUsd: number; result: Record<string, any> } =>
  JSON.parse(readFileSync(join(outDir, name), "utf-8"));

const hit = (turnId: string, sessionId = "s-1") => ({ turnId, sessionId, score: 0.9, turn: { text: `passage ${turnId}` }, session: {} });

// ---------------------------------------------------------------- run-kb (A2b)
function kbFiles(dir: string): { golden: string; fixture: string } {
  const golden = write(
    dir,
    "golden.jsonl",
    [
      { id: "g-en", lang: "en", country: "USA", theme: "tuition", question: "SYNTHETIC english tuition question", expectedTurnIds: ["t-en"], expectedSessionIds: [] },
      { id: "g-hi", lang: "hinglish", country: "Germany", theme: "visa", question: "SYNTHETIC-HI germany visa kaise milta hai", expectedTurnIds: ["t-hi"], expectedSessionIds: [] },
    ]
      .map((q) => JSON.stringify(q))
      .join("\n"),
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

test("run-kb REAL (ollama): English is scored from the fixture with no model call; Hindi/Hinglish is rewritten through the provider, charged first, and scored with the same hit@3 scorer", async () => {
  const { dir, outDir, ledger } = tmp();
  const { golden, fixture } = kbFiles(dir);
  const { fetchImpl, seen } = fakeOllama(() => ({ english: "how does a student get a germany visa" }));
  const outcome = await runKb({ ...parseP1Args(["--real", `--golden=${golden}`, `--fixture=${fixture}`]), outDir, ledger }, { env: ENV, gateFile: GATE, now: NOW, fetchImpl });
  assert.equal(outcome.status, "completed");
  assert.equal(seen.length, 1, "only the one non-English question needs the model");
  assert.equal(seen[0]!.user["question"], "SYNTHETIC-HI germany visa kaise milta hai");
  assert.equal(charges(ledger), 1, "the request was charged to the A24 ledger");
  const r = jsonReport(outDir, "kb-report.json");
  assert.equal(r.result["model"], "glm-5.3-flash");
  assert.equal(r.result["report"].a2a.hits, 1);
  assert.equal(r.result["report"].a2b.count, 1);
  assert.equal(r.result["report"].a2b.hits, 1, "the rewrite found the recorded query, so the Hinglish question hit");
  assert.match(outcome.markdown, /REAL run: model `glm-5.3-flash`/);
  assert.match(outcome.markdown, /A2b Hindi\/Hinglish rewrite-fidelity \(not Hit@3\) \| 1\/1/);
  assert.ok(!outcome.markdown.includes(KEY));
});

test("run-kb REAL (ollama): a rewrite that matches no recorded query is an unrecorded miss, not a hit", async () => {
  const { dir, outDir, ledger } = tmp();
  const { golden, fixture } = kbFiles(dir);
  const { fetchImpl } = fakeOllama(() => ({ english: "zzz qqq unrelated words" }));
  await runKb({ ...parseP1Args(["--real", `--golden=${golden}`, `--fixture=${fixture}`]), outDir, ledger }, { env: ENV, gateFile: GATE, now: NOW, fetchImpl });
  const r = jsonReport(outDir, "kb-report.json");
  assert.equal(r.result["report"].a2b.hits, 0);
  assert.equal(r.result["report"].unrecorded, 1);
});

// ---------------------------------------------------------------- run-probes (A4)
function probeCases(dir: string): string {
  const ask = (internal: string[], web: unknown[], verdict: string, insufficient: boolean, webUsed: boolean) => ({
    answer: "recorded answer",
    verdict,
    insufficient_coverage: insufficient,
    web_used: webUsed,
    sources: { internal: internal.map((node_id) => ({ node_id, text: `KB passage text for ${node_id}` })), web },
  });
  return write(dir, "probes.json", {
    schemaVersion: 1,
    source: "synthetic",
    cases: [
      { id: "p-ok", question: "SYNTHETIC in-KB question", expectServed: true, ask: ask(["n-1"], [], "correct", false, false) },
      { id: "p-out", question: "SYNTHETIC out-of-KB question", expectServed: false, ask: ask([], [{ url: "https://example.invalid" }], "incorrect", true, true) },
    ],
  });
}

test("run-probes REAL (ollama): an honest model passes the serve rule; the model sees ONLY the recorded internal passages (none for the out-of-KB probe)", async () => {
  const { dir, outDir, ledger } = tmp();
  const cases = probeCases(dir);
  const { fetchImpl, seen } = fakeOllama((_s, user) => {
    const passages = user["passages"] as { node_id: string }[];
    return passages.length > 0
      ? { answer: "grounded", verdict: "correct", insufficient_coverage: false, web_used: false, source_node_ids: [passages[0]!.node_id] }
      : { answer: "", verdict: "insufficient", insufficient_coverage: true, web_used: false, source_node_ids: [] };
  });
  const outcome = await runProbes({ ...parseP1Args(["--real", `--cases=${cases}`]), outDir, ledger }, { env: ENV, gateFile: GATE, now: NOW, fetchImpl });
  assert.equal(outcome.status, "completed");
  assert.equal(seen.length, 2);
  assert.equal((seen[0]!.user["passages"] as unknown[]).length, 1);
  assert.equal((seen[1]!.user["passages"] as unknown[]).length, 0);
  assert.equal(charges(ledger), 2);
  const r = jsonReport(outDir, "probes-report.json").result["report"];
  assert.deepEqual([r.served, r.refused, r.violations.length], [1, 1, 0]);
  assert.equal(r.verdict, "NOT PROVEN", "2 probes is below the 30-probe bar: never a PASS");
});

test("run-probes REAL (ollama): a model that fabricates an answer for the out-of-KB probe is a recorded violation, not a quiet refusal", async () => {
  const { dir, outDir, ledger } = tmp();
  const cases = probeCases(dir);
  const { fetchImpl } = fakeOllama(() => ({ answer: "made up", verdict: "correct", insufficient_coverage: false, web_used: false, source_node_ids: ["invented-node"] }));
  await runProbes({ ...parseP1Args(["--real", `--cases=${cases}`]), outDir, ledger }, { env: ENV, gateFile: GATE, now: NOW, fetchImpl });
  const r = jsonReport(outDir, "probes-report.json").result["report"];
  assert.equal(r.verdict, "FAIL");
  const rules = r.violations
    .filter((v: { id: string }) => v.id === "p-out")
    .map((v: { rule: string }) => v.rule)
    .sort();
  assert.deepEqual(rules, ["answered-without-source", "unservable-answered"]);
});

test("run-probes REAL (B1): a 30-case SYNTHETIC probe set with 0 violations is NOT PROVEN, never PASS; the same 30 cases declared 'recorded' (and --anonymised) can PASS", async () => {
  const mk = (source: string) =>
    write(tmp().dir, "p30.json", {
      schemaVersion: 1,
      source,
      cases: Array.from({ length: 30 }, (_, i) => ({
        id: `p-${i}`,
        question: `question ${i}`,
        expectServed: true,
        ask: { answer: "x", verdict: "correct", insufficient_coverage: false, web_used: false, sources: { internal: [{ node_id: `n-${i}`, text: `passage ${i}` }], web: [] } },
      })),
    });
  const honest = () =>
    fakeOllama((_s, user) => ({ answer: "grounded", verdict: "correct", insufficient_coverage: false, web_used: false, source_node_ids: [(user["passages"] as { node_id: string }[])[0]!.node_id] }));
  const syn = tmp();
  const a = honest();
  const outcome = await runProbes({ ...parseP1Args(["--real", `--cases=${mk("synthetic")}`]), outDir: syn.outDir, ledger: syn.ledger }, { env: ENV, gateFile: GATE, now: NOW, fetchImpl: a.fetchImpl });
  const r = jsonReport(syn.outDir, "probes-report.json").result["report"];
  assert.equal(a.seen.length, 30);
  assert.equal(r.violations.length, 0);
  assert.equal(r.total, 30);
  assert.equal(r.verdict, "NOT PROVEN");
  assert.equal(r.realBarMet, false);
  assert.ok(!/\*\*PASS\*\*/.test(outcome.markdown));
  assert.match(outcome.markdown, /synthetic set cannot prove A4/);

  const rec = tmp();
  const b = honest();
  await runProbes({ ...parseP1Args(["--real", "--anonymised", `--cases=${mk("recorded")}`]), outDir: rec.outDir, ledger: rec.ledger }, { env: ENV, gateFile: GATE, now: NOW, fetchImpl: b.fetchImpl });
  assert.equal(jsonReport(rec.outDir, "probes-report.json").result["report"].verdict, "PASS", "only provenance differs");
});

test("run-probes REAL (B2): the model is shown the probe's retrieved passage text, never the recorded /ask answer; a probe with internal sources but no passage text makes 0 requests and is counted as excluded", async () => {
  const { dir, outDir, ledger } = tmp();
  const ask = (internal: { node_id: string; text?: string }[]) => ({ answer: "RECORDED-ANSWER-MUST-NOT-LEAK", verdict: "correct", insufficient_coverage: false, web_used: false, sources: { internal, web: [] } });
  const cases = write(dir, "probes.json", {
    schemaVersion: 1,
    source: "synthetic",
    cases: [
      { id: "p-text", question: "has text", expectServed: true, ask: ask([{ node_id: "n-1", text: "REAL PASSAGE BODY" }]) },
      { id: "p-notext", question: "no text", expectServed: false, ask: ask([{ node_id: "n-2" }]) },
      { id: "p-blank", question: "blank text", expectServed: false, ask: ask([{ node_id: "n-3", text: "   " }]) },
      { id: "p-none", question: "no sources at all", expectServed: false, ask: ask([]) },
    ],
  });
  const { fetchImpl, seen } = fakeOllama((_s, user) => {
    const passages = user["passages"] as { node_id: string }[];
    return passages.length > 0
      ? { answer: "g", verdict: "correct", insufficient_coverage: false, web_used: false, source_node_ids: [passages[0]!.node_id] }
      : { answer: "", verdict: "insufficient", insufficient_coverage: true, web_used: false, source_node_ids: [] };
  });
  const outcome = await runProbes({ ...parseP1Args(["--real", `--cases=${cases}`]), outDir, ledger }, { env: ENV, gateFile: GATE, now: NOW, fetchImpl });
  assert.deepEqual(seen.map((x) => x.user["question"]), ["has text", "no sources at all"], "no request for the two probes without passage text");
  assert.deepEqual(seen[0]!.user["passages"], [{ node_id: "n-1", text: "REAL PASSAGE BODY" }]);
  assert.ok(!JSON.stringify(seen).includes("RECORDED-ANSWER-MUST-NOT-LEAK"));
  assert.equal(charges(ledger), 2);
  const res = jsonReport(outDir, "probes-report.json").result;
  assert.deepEqual(res["excluded"].map((e: { id: string; reason: string }) => [e.id, e.reason]), [["p-notext", "no passage text"], ["p-blank", "no passage text"]]);
  assert.equal(res["report"].total, 2, "excluded probes are not counted as scored");
  assert.deepEqual(res["report"].violations, []);
  assert.match(outcome.markdown, /2 probe\(s\) excluded: no passage text/);
});

test("run-probes REAL (B2): an honest model no longer mis-scores the shipped sample set (its probes have no passage text, so they are excluded, not failed)", async () => {
  const { outDir, ledger } = tmp();
  const { fetchImpl, seen } = fakeOllama((_s, user) => {
    const passages = user["passages"] as { node_id: string }[];
    return passages.length > 0
      ? { answer: "g", verdict: "correct", insufficient_coverage: false, web_used: false, source_node_ids: [passages[0]!.node_id] }
      : { answer: "", verdict: "insufficient", insufficient_coverage: true, web_used: false, source_node_ids: [] };
  });
  await runProbes({ ...parseP1Args(["--real"]), outDir, ledger }, { env: ENV, gateFile: GATE, now: NOW, fetchImpl });
  const res = jsonReport(outDir, "probes-report.json").result;
  assert.ok(seen.every((x) => (x.user["passages"] as unknown[]).length === 0), "no passage text anywhere in the sample");
  assert.deepEqual(res["report"].violations.filter((v: { rule: string }) => v.rule === "unservable-answered"), []);
  assert.notEqual(res["report"].verdict, "FAIL");
  assert.notEqual(res["report"].verdict, "PASS");
});

// ---------------------------------------------------------------- G1 (B13/D-100): recorded input needs --anonymised
test("G1: a REAL run refuses a source:'recorded' --fixture / --cases / --experts without --anonymised, before any ledger line or request; --anonymised lets it through", async () => {
  const { dir, outDir, ledger } = tmp();
  const { golden, fixture } = kbFiles(dir);
  const recFixture = write(dir, "rec-fixture.json", JSON.parse(readFileSync(fixture, "utf-8").replace('"synthetic"', '"recorded"')));
  const recCases = write(dir, "rec-cases.json", JSON.parse(readFileSync(probeCases(dir), "utf-8").replace('"synthetic"', '"recorded"')));
  const recExperts = write(dir, "rec-experts.json", {
    source: "recorded",
    experts: [
      { questionId: "g-en", text: "x", author: "author-1" },
      { questionId: "g-hi", text: "y", author: "author-2" },
    ],
  });
  const { fetchImpl, seen } = fakeOllama(() => ({ answer: "", english: "b", verdict: "insufficient", insufficient_coverage: true, web_used: false, source_node_ids: [] }));
  const deps = { env: ENV, gateFile: GATE, now: NOW, fetchImpl };
  const refuse = /source "recorded".*--anonymised/s;
  await assert.rejects(runKb({ ...parseP1Args(["--real", `--golden=${golden}`, `--fixture=${recFixture}`]), outDir, ledger }, deps), refuse);
  await assert.rejects(runLatency({ ...parseP1Args(["--real", `--golden=${golden}`, `--fixture=${recFixture}`]), outDir, ledger }, deps), refuse);
  await assert.rejects(runH2h({ ...parseP1Args(["--real", `--golden=${golden}`, `--fixture=${recFixture}`]), outDir, ledger }, deps), refuse);
  await assert.rejects(runH2h({ ...parseP1Args(["--real", `--golden=${golden}`, `--fixture=${fixture}`, `--experts=${recExperts}`]), outDir, ledger }, deps), refuse);
  await assert.rejects(runProbes({ ...parseP1Args(["--real", `--cases=${recCases}`]), outDir, ledger }, deps), refuse);
  assert.equal(existsSync(ledger), false, "no ledger line");
  assert.equal(seen.length, 0, "no request");

  // the same input passes with the explicit confirmation
  const ok = await runProbes({ ...parseP1Args(["--real", "--anonymised", `--cases=${recCases}`]), outDir, ledger }, deps);
  assert.equal(ok.status, "completed");
  assert.ok(seen.length > 0);
  // mock mode is untouched by the guard
  const mockRes = await runKb({ ...parseP1Args([`--golden=${golden}`, `--fixture=${recFixture}`]), outDir: tmp().outDir, ledger: tmp().ledger });
  assert.equal(mockRes.mode, "mock");
});

// ---------------------------------------------------------------- run-latency (A8)
test("run-latency REAL (ollama): 20 sequential answers through the provider, each charged; first-token is recorded as the full-answer bound", async () => {
  const { dir, outDir, ledger } = tmp();
  const { golden, fixture } = kbFiles(dir);
  const { fetchImpl, seen } = fakeOllama(() => ({ answer: "short answer" }));
  const outcome = await runLatency({ ...parseP1Args(["--real", `--golden=${golden}`, `--fixture=${fixture}`]), outDir, ledger }, { env: ENV, gateFile: GATE, now: NOW, fetchImpl });
  assert.equal(outcome.status, "completed");
  assert.equal(seen.length, 20);
  assert.equal(charges(ledger), 20);
  const r = jsonReport(outDir, "latency-report.json").result;
  assert.equal(r["summary"].n, 20);
  assert.equal(r["verdict"].verdict, "PASS", "instant mock responses are far under the A8 bar");
  assert.equal(r["firstTokenBasis"], "full-answer (non-streamed)");
  assert.ok(Math.abs(r["summary"].firstToken.max - r["summary"].full.max) < 50, "first token is the full-answer time, not an invented smaller number");
  assert.match(outcome.markdown, /Mode: `real`/);
});

test("run-latency REAL (ollama): a delayed provider shows up in BOTH first-token and full time (a fabricated early first-token would be caught); the verdict is labelled model-hop only", async () => {
  const { dir, outDir, ledger } = tmp();
  const { golden, fixture } = kbFiles(dir);
  const { fetchImpl } = fakeOllama(() => ({ answer: "slow answer" }), 60);
  const outcome = await runLatency({ ...parseP1Args(["--real", `--golden=${golden}`, `--fixture=${fixture}`]), outDir, ledger }, { env: ENV, gateFile: GATE, now: NOW, fetchImpl });
  const r = jsonReport(outDir, "latency-report.json").result;
  assert.ok(r["summary"].firstToken.p50 >= 55, `first-token p50 ${r["summary"].firstToken.p50} must include the 60 ms model delay`);
  assert.ok(r["summary"].full.p50 >= 55);
  assert.equal(r["verdictScope"], "model-hop only");
  assert.match(outcome.markdown, /\*\*(PASS|FAIL) \(model-hop only\)\*\*/);
});

test("run-latency REAL (ollama): an empty golden set is refused before the run starts (no ledger, no request)", async () => {
  const { dir, outDir, ledger } = tmp();
  const { fixture } = kbFiles(dir);
  const empty = write(dir, "empty.jsonl", "");
  const { fetchImpl, seen } = fakeOllama(() => ({ answer: "x" }));
  await assert.rejects(runLatency({ ...parseP1Args(["--real", `--golden=${empty}`, `--fixture=${fixture}`]), outDir, ledger }, { env: ENV, gateFile: GATE, now: NOW, fetchImpl }), /no questions found|golden set is empty/);
  assert.equal(existsSync(ledger), false);
  assert.equal(seen.length, 0);
});

// ---------------------------------------------------------------- run-h2h (A14)
test("run-h2h REAL (ollama): VC answers come from the provider, pairs stay blind, the key holds a random seed, and the tally is NOT PROVEN without ratings", async () => {
  const { dir, outDir, ledger } = tmp();
  const { golden, fixture } = kbFiles(dir);
  const experts = write(dir, "experts.json", [
    { questionId: "g-en", text: "EXPERT-en", author: "author-1" },
    { questionId: "g-hi", text: "EXPERT-hi", author: "author-2" },
  ]);
  const { fetchImpl, seen } = fakeOllama((_s, user) => ({ answer: `MODEL-ANSWER for ${String(user["question"])}` }));
  const outcome = await runH2h({ ...parseP1Args(["--real", `--golden=${golden}`, `--fixture=${fixture}`, `--experts=${experts}`]), outDir, ledger }, { env: ENV, gateFile: GATE, now: NOW, fetchImpl });
  assert.equal(outcome.status, "completed");
  assert.equal(seen.length, 1, "g-hi has no exact fixture query, so it gets the fixed no-sourced-answer text with no model call");
  assert.equal(charges(ledger), 1);
  const pairsRaw = readFileSync(join(outDir, "h2h-pairs.json"), "utf-8");
  const pairs = JSON.parse(pairsRaw) as { questionId: string; A: string; B: string }[];
  const en = pairs.find((p) => p.questionId === "g-en")!;
  assert.deepEqual([en.A, en.B].sort(), ["EXPERT-en", "MODEL-ANSWER for SYNTHETIC english tuition question"].sort());
  assert.ok(!pairsRaw.includes("vcSide"), "origin never in the public pairs");
  const key = JSON.parse(readFileSync(join(outDir, "h2h-key.json"), "utf-8")) as { seed: string; source: string; key: unknown[] };
  assert.equal(key.source, "random");
  assert.match(key.seed, /^[0-9a-f]{32}$/);
  assert.equal(key.key.length, 2);
  assert.ok(readdirSync(outDir).some((f) => f.startsWith("h2h-judge-sheet-")));
  const r = jsonReport(outDir, "h2h-report.json").result;
  assert.equal(r["tally"].verdict, "NOT PROVEN");
  assert.equal(r["expertsSource"], "counsellor-written (--experts)");
  assert.ok(!JSON.stringify(r).includes(key.seed), "the seed lives only in the key file");
});

test("run-h2h REAL (ollama): without --experts the expert side is a labelled placeholder and the report says so; an --experts file missing a question is refused before any spend", async () => {
  const { dir, outDir, ledger } = tmp();
  const { golden, fixture } = kbFiles(dir);
  const { fetchImpl } = fakeOllama(() => ({ answer: "a" }));
  const outcome = await runH2h({ ...parseP1Args(["--real", `--golden=${golden}`, `--fixture=${fixture}`]), outDir, ledger }, { env: ENV, gateFile: GATE, now: NOW, fetchImpl });
  assert.equal(jsonReport(outDir, "h2h-report.json").result["expertsSource"], "PLACEHOLDER (no --experts given)");
  assert.match(outcome.markdown, /Expert answers: PLACEHOLDER/);

  const bad = tmp();
  const partial = write(bad.dir, "experts.json", [{ questionId: "g-en", text: "x", author: "author-1" }]);
  await assert.rejects(
    runH2h({ ...parseP1Args(["--real", `--golden=${golden}`, `--fixture=${fixture}`, `--experts=${partial}`]), outDir: bad.outDir, ledger: bad.ledger }, { env: ENV, gateFile: GATE, now: NOW, fetchImpl }),
    /no expert answer for question g-hi/,
  );
  assert.equal(existsSync(bad.ledger), false);
});

// ---------------------------------------------------------------- shared contract
test("A24: the per-run cap stops a default REAL body mid-run (run-latency at an absurd price): aborted-budget report, requests stop", async () => {
  const { dir, outDir, ledger } = tmp();
  const { golden, fixture } = kbFiles(dir);
  const { fetchImpl, seen } = fakeOllama(() => ({ answer: "x" }));
  const outcome = await runLatency(
    { ...parseP1Args(["--real", `--golden=${golden}`, `--fixture=${fixture}`]), outDir, ledger },
    { env: { ...ENV, OLLAMA_PRICE_USD_PER_MTOK: "10000,10000" }, gateFile: GATE, now: NOW, fetchImpl },
  );
  assert.equal(outcome.status, "aborted-budget");
  assert.ok(seen.length >= 1 && seen.length < 20, `stopped after ${seen.length} requests`);
  assert.equal(jsonReport(outDir, "latency-report.json").status, "aborted-budget");
});

test("default unchanged: Gemini selected (unset or 'gemini') keeps the REAL text bodies NOT WIRED for every runner; run-live refuses non-Gemini (A10 LiveRefusedError)", async () => {
  const runs: [string, (a: P1Args, d: RunnerDeps) => Promise<RunnerOutcome>][] = [
    ["run-kb", runKb],
    ["run-h2h", runH2h],
    ["run-probes", runProbes],
    ["run-latency", runLatency],
  ];
  for (const env of [{ VC_G_REAL: "1" }, { VC_G_REAL: "1", VC_REAL_MODEL: "gemini" }]) {
    for (const [name, run] of runs) {
      const { outDir, ledger } = tmp();
      const { fetchImpl, seen } = fakeOllama(() => ({}));
      await assert.rejects(run({ ...parseP1Args(["--real"]), outDir, ledger }, { env, gateFile: GATE, now: NOW, fetchImpl }), RealNotWiredError, name);
      assert.equal(existsSync(ledger), false, `${name}: no ledger`);
      assert.equal(seen.length, 0);
    }
  }
  const { outDir, ledger } = tmp();
  const { fetchImpl, seen } = fakeOllama(() => ({}));
  await assert.rejects(runLive({ ...parseP1Args(["--real"]), outDir, ledger }, { env: ENV, gateFile: GATE, now: NOW, fetchImpl }), LiveRefusedError);
  assert.equal(existsSync(ledger), false);
  assert.equal(seen.length, 0);
});

test("a bad Ollama config or a missing fixture refuses BEFORE the budget run starts (no ledger entry, no request)", async () => {
  const { dir, outDir, ledger } = tmp();
  const { fetchImpl, seen } = fakeOllama(() => ({}));
  await assert.rejects(runKb({ ...parseP1Args(["--real"]), outDir, ledger }, { env: { ...ENV, OLLAMA_API_KEY: "  " }, gateFile: GATE, now: NOW, fetchImpl }), /OLLAMA_API_KEY/);
  await assert.rejects(
    runProbes({ ...parseP1Args(["--real", `--cases=${join(dir, "missing.json")}`]), outDir, ledger }, { env: ENV, gateFile: GATE, now: NOW, fetchImpl }),
    /ENOENT/,
  );
  assert.equal(existsSync(ledger), false);
  assert.equal(seen.length, 0);
});
