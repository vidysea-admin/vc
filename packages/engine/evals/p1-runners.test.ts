/** P1 U4: the five runners (eval:kb, run-h2h, run-probes, run-latency, run-live) share one contract:
 *  mock by default on frozen/synthetic fixtures; --real refuses without VC_G_REAL=1; once allowed,
 *  every one is hard-stopped by the A24 budget guard and still writes an abort report. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseP1Args, P1_LEDGER, type P1Args, type RunnerDeps, type RunnerOutcome } from "./run-eval.js";
import { runKb } from "./run-kb.js";
import { runH2h } from "./run-h2h.js";
import { runProbes } from "./run-probes.js";
import { runLatency } from "./run-latency.js";
import { runLive } from "./run-live.js";
import { GRealRefusedError, readLedger, monthSpendUsd } from "./budget.js";

type Runner = (args: P1Args, deps?: RunnerDeps) => Promise<RunnerOutcome>;
const RUNNERS: [string, Runner][] = [
  ["run-kb", runKb],
  ["run-h2h", runH2h],
  ["run-probes", runProbes],
  ["run-latency", runLatency],
  ["run-live", runLive],
];
const NOW = () => new Date("2026-10-17T10:00:00Z");
/** A temp stand-in for qa/gates/g-real.md (the worktree has no real, answered gate). */
const GATE = (() => {
  const path = join(mkdtempSync(join(tmpdir(), "vc-gate-")), "g-real.md");
  writeFileSync(path, "# G-REAL\n\nAnswered: 2026-10-17T00:00:00+05:30 - A - Umesh\n", "utf-8");
  return path;
})();

function tmp(): { outDir: string; ledger: string } {
  const d = mkdtempSync(join(tmpdir(), "vc-runner-"));
  return { outDir: join(d, "reports"), ledger: join(d, "ledger.jsonl") };
}

test("parseP1Args: defaults are mock; --real flips mode; unknown flags are errors, not ignored", () => {
  assert.equal(parseP1Args([]).real, false);
  assert.equal(parseP1Args(["--real"]).real, true);
  const a = parseP1Args(["--golden=/g.jsonl", "--fixture=/f.json", "--cases=/c.json", "--out=/o", "--ledger=/l.jsonl", "--seed=abc"]);
  assert.deepEqual([a.golden, a.fixture, a.cases, a.outDir, a.ledger, a.seed], ["/g.jsonl", "/f.json", "/c.json", "/o", "/l.jsonl", "abc"]);
  assert.throws(() => parseP1Args(["--rael"]), /unknown/i);
});

for (const [name, run] of RUNNERS) {
  test(`${name}: mock mode runs offline on the frozen sample, writes json+md reports, never touches the spend ledger`, async () => {
    const { outDir, ledger } = tmp();
    const outcome = await run({ ...parseP1Args([]), outDir, ledger }, { now: NOW });
    assert.equal(outcome.mode, "mock");
    assert.equal(outcome.status, "completed");
    assert.ok(outcome.markdown.length > 50);
    const files = readdirSync(outDir);
    assert.ok(files.some((f) => f.endsWith(".json")) && files.some((f) => f.endsWith(".md")), `${name} wrote ${files}`);
    assert.equal(existsSync(ledger), false, "mock mode must not create a spend ledger");
  });

  test(`${name}: --real WITHOUT VC_G_REAL refuses and writes nothing`, async () => {
    const { outDir, ledger } = tmp();
    await assert.rejects(run({ ...parseP1Args(["--real"]), outDir, ledger }, { env: {}, now: NOW }), GRealRefusedError);
    assert.equal(existsSync(outDir), false);
    assert.equal(existsSync(ledger), false);
  });

  test(`${name}: --real WITH the flag but no provider wired refuses honestly (no fake real run)`, async () => {
    const { outDir, ledger } = tmp();
    await assert.rejects(run({ ...parseP1Args(["--real"]), outDir, ledger }, { env: { VC_G_REAL: "1" }, gateFile: GATE, now: NOW }), /not wired/i);
    assert.equal(existsSync(ledger), false);
  });

  test(`${name}: REAL hard-stops at USD 50 per run (A24), records the spend and still writes an abort report`, async () => {
    const { outDir, ledger } = tmp();
    const outcome = await run(
      { ...parseP1Args(["--real"]), outDir, ledger },
      {
        env: { VC_G_REAL: "1" },
        gateFile: GATE,
        now: NOW,
        realBody: async (budget) => {
          budget.charge(30);
          budget.charge(30); // would pass 50
          return { never: true };
        },
      },
    );
    assert.equal(outcome.mode, "real");
    assert.equal(outcome.status, "aborted-budget");
    assert.match(outcome.markdown, /aborted/i);
    const jsonFile = readdirSync(outDir).find((f) => f.endsWith(".json"))!;
    const written = JSON.parse(readFileSync(join(outDir, jsonFile), "utf-8"));
    assert.equal(written.status, "aborted-budget");
    assert.equal(written.cap, "per-run");
    assert.equal(written.spentUsd, 30);
    assert.equal(monthSpendUsd(readLedger(ledger), NOW()), 30);
  });

  test(`${name}: REAL hard-stops at USD 200 per month across runs`, async () => {
    const { outDir, ledger } = tmp();
    const spend = (usd: number) => async (budget: { charge(u: number): void }) => {
      budget.charge(usd);
      return {};
    };
    for (let i = 0; i < 4; i++) {
      const ok = await run({ ...parseP1Args(["--real"]), outDir, ledger }, { env: { VC_G_REAL: "1" }, gateFile: GATE, now: NOW, realBody: spend(50) });
      assert.equal(ok.status, "completed");
    }
    const fifth = await run({ ...parseP1Args(["--real"]), outDir, ledger }, { env: { VC_G_REAL: "1" }, gateFile: GATE, now: NOW, realBody: spend(1) });
    assert.equal(fifth.status, "aborted-budget");
    assert.equal(monthSpendUsd(readLedger(ledger), NOW()), 200);
  });
}

test("eval:kb mock verdicts: A2a NOT PROVEN on the synthetic fixture (provenance stated), A2b NOT PROVEN", async () => {
  const { outDir, ledger } = tmp();
  const o = await runKb({ ...parseP1Args([]), outDir, ledger }, { now: NOW });
  assert.match(o.markdown, /A2a[^\n]*NOT PROVEN/);
  assert.doesNotMatch(o.markdown, /A2a[^\n]*\bPASS\b/);
  assert.match(o.markdown, /synthetic/);
});

test("run-h2h mock: public pairs file leaks no origin; the key is a separate file; verdict is plumbing-only", async () => {
  const { outDir, ledger } = tmp();
  const o = await runH2h({ ...parseP1Args([]), outDir, ledger }, { now: NOW });
  const files = readdirSync(outDir);
  const pairsFile = files.find((f) => f.includes("pairs"))!;
  const keyFile = files.find((f) => f.includes("key"))!;
  assert.ok(pairsFile && keyFile && pairsFile !== keyFile);
  assert.doesNotMatch(readFileSync(join(outDir, pairsFile), "utf-8"), /vcSide|"origin"|isVc|author/);
  assert.ok(files.filter((f) => f.includes("judge-sheet")).length >= 2);
  assert.match(o.markdown, /plumbing only/i);
});

test("fix3: --real rejects any --ledger other than the fixed P1 ledger, in either argument order", () => {
  assert.throws(() => parseP1Args(["--real", "--ledger=/tmp/other.jsonl"]), /ledger/i);
  assert.throws(() => parseP1Args(["--ledger=/tmp/other.jsonl", "--real"]), /ledger/i);
  assert.equal(parseP1Args(["--real", `--ledger=${P1_LEDGER}`]).ledger, P1_LEDGER);
  assert.equal(parseP1Args(["--real"]).ledger, P1_LEDGER);
  // mock may still point anywhere (it never writes the ledger)
  assert.equal(parseP1Args(["--ledger=/tmp/other.jsonl"]).ledger, "/tmp/other.jsonl");
});

test("fix4: a runner with VC_G_REAL=1 but no answered g-real.md gate file refuses before the budget guard", async () => {
  const { outDir, ledger } = tmp();
  const missing = join(mkdtempSync(join(tmpdir(), "vc-nogate-")), "g-real.md");
  await assert.rejects(
    runKb({ ...parseP1Args(["--real"]), outDir, ledger }, { env: { VC_G_REAL: "1" }, gateFile: missing, now: NOW, realBody: async () => ({}) }),
    GRealRefusedError,
  );
  assert.equal(existsSync(ledger), false);
});

// ---------------------------------------------------------------------------
// U13b (D-100): Ollama-hosted models behind VC_REAL_MODEL=ollama:<id>. MOCKED fetch only: no network,
// no paid call. The A24 caps must apply to Ollama runs exactly as they do to any REAL run.
// ---------------------------------------------------------------------------
import { z } from "zod";
import { OllamaRefusedError } from "@vc/providers";

const OLLAMA_KEY = "ollama-test-secret-key";
const OLLAMA_ENV = { VC_G_REAL: "1", VC_REAL_MODEL: "ollama:glm-5.3-flash", OLLAMA_API_KEY: OLLAMA_KEY };
const AnswerSchema = z.object({ answer: z.string() });

function fakeOllama(): { fetchImpl: typeof fetch; calls: { url: string; auth: string | undefined }[] } {
  const calls: { url: string; auth: string | undefined }[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), auth: (init?.headers as Record<string, string> | undefined)?.["authorization"] });
    return new Response(JSON.stringify({ message: { role: "assistant", content: JSON.stringify({ answer: "ok" }) }, done: true }), { status: 200 });
  }) as typeof fetch;
  return { fetchImpl, calls };
}
const ask = (provider: { generate: (r: never) => Promise<unknown> } | undefined) =>
  provider!.generate({ skillName: "s", skillPrompt: "P", outputSchema: AnswerSchema, input: { q: 1 } } as never);

for (const [name, run] of RUNNERS) {
  test(`${name}: U13b VC_REAL_MODEL=ollama:<id> hands the body an Ollama provider; each request is charged to the ledger BEFORE it is sent`, async () => {
    const { outDir, ledger } = tmp();
    const { fetchImpl, calls } = fakeOllama();
    let kind: string | undefined;
    const outcome = await run(
      { ...parseP1Args(["--real"]), outDir, ledger },
      {
        env: OLLAMA_ENV,
        gateFile: GATE,
        now: NOW,
        fetchImpl,
        realBody: async (budget, provider) => {
          kind = provider?.kind;
          assert.equal(calls.length, 0);
          await ask(provider);
          const afterFirst = readLedger(ledger).filter((e) => e.kind === "charge").length;
          assert.equal(afterFirst, 1, "charged for request 1");
          await ask(provider);
          assert.equal(budget.spentUsd, readLedger(ledger).filter((e) => e.kind === "charge").reduce((a, e) => a + (e.usd ?? 0), 0));
          return { ok: true };
        },
      },
    );
    assert.equal(kind, "ollama");
    assert.equal(outcome.status, "completed");
    assert.equal(calls.length, 2);
    assert.ok(calls.every((c) => c.url === "https://ollama.com/api/chat" && c.auth === `Bearer ${OLLAMA_KEY}`));
    assert.ok(outcome.report && (outcome.report as { spentUsd: number }).spentUsd > 0);
    for (const f of [...readdirSync(outDir).map((x) => join(outDir, x)), ledger]) assert.ok(!readFileSync(f, "utf-8").includes(OLLAMA_KEY), `${f} must not contain the key`);
  });

  test(`${name}: U13b the USD 50 per-run cap stops an Ollama run before the request that would pass it is sent`, async () => {
    const { outDir, ledger } = tmp();
    const { fetchImpl, calls } = fakeOllama();
    const outcome = await run(
      { ...parseP1Args(["--real"]), outDir, ledger },
      {
        env: { ...OLLAMA_ENV, OLLAMA_PRICE_USD_PER_MTOK: "10000,10000" }, // ~USD 20.5 per request upper bound
        gateFile: GATE,
        now: NOW,
        fetchImpl,
        realBody: async (_b, provider) => {
          for (let i = 0; i < 5; i++) await ask(provider);
          return {};
        },
      },
    );
    assert.equal(outcome.status, "aborted-budget");
    assert.equal(calls.length, 2, "the third request (would be ~61 USD) is never sent");
    const written = JSON.parse(readFileSync(join(outDir, readdirSync(outDir).find((f) => f.endsWith(".json"))!), "utf-8"));
    assert.equal(written.cap, "per-run");
    assert.ok(monthSpendUsd(readLedger(ledger), NOW()) > 40 && monthSpendUsd(readLedger(ledger), NOW()) < 50);
  });

  test(`${name}: U13b missing OLLAMA_API_KEY, unknown model price or a junk VC_REAL_MODEL refuse before any run (no ledger, no request)`, async () => {
    for (const env of [
      { VC_G_REAL: "1", VC_REAL_MODEL: "ollama:glm-5.3-flash" },
      { ...OLLAMA_ENV, VC_REAL_MODEL: "ollama:mystery-model" },
      { ...OLLAMA_ENV, VC_REAL_MODEL: "openai:gpt-x" },
    ]) {
      const { outDir, ledger } = tmp();
      const { fetchImpl, calls } = fakeOllama();
      await assert.rejects(
        run({ ...parseP1Args(["--real"]), outDir, ledger }, { env, gateFile: GATE, now: NOW, fetchImpl, realBody: async () => ({}) }),
        OllamaRefusedError,
      );
      assert.equal(existsSync(ledger), false);
      assert.equal(existsSync(outDir), false);
      assert.equal(calls.length, 0);
    }
  });

  test(`${name}: U13b default unchanged: no VC_REAL_MODEL (or "gemini") gives the body no Ollama provider and sends no request`, async () => {
    for (const env of [{ VC_G_REAL: "1" }, { VC_G_REAL: "1", VC_REAL_MODEL: "gemini" }]) {
      const { outDir, ledger } = tmp();
      const { fetchImpl, calls } = fakeOllama();
      let seen: unknown = "unset";
      const outcome = await run(
        { ...parseP1Args(["--real"]), outDir, ledger },
        { env, gateFile: GATE, now: NOW, fetchImpl, realBody: async (_b, provider) => ((seen = provider), {}) },
      );
      assert.equal(outcome.status, "completed");
      assert.equal(seen, undefined);
      assert.equal(calls.length, 0);
    }
  });
}

test("U13b the USD 200 per-month cap also stops Ollama runs across runs", async () => {
  const { outDir, ledger } = tmp();
  const { fetchImpl, calls } = fakeOllama();
  const env = { ...OLLAMA_ENV, OLLAMA_PRICE_USD_PER_MTOK: "20000,20000" }; // ~USD 41.1 per single request
  const statuses: string[] = [];
  for (let i = 0; i < 5; i++) {
    const o = await runKb({ ...parseP1Args(["--real"]), outDir, ledger }, { env, gateFile: GATE, now: NOW, fetchImpl, realBody: async (_b, p) => ask(p) });
    statuses.push(o.status);
  }
  assert.deepEqual(statuses, ["completed", "completed", "completed", "completed", "aborted-budget"]);
  assert.equal(calls.length, 4, "the fifth request is never sent");
  assert.ok(monthSpendUsd(readLedger(ledger), NOW()) <= 200);
});

// ---------------------------------------------------------------------------
// p1-ollama-actual-tokens (D-103): prompt_eval_count / eval_count -> ledger actual lines + per-runner report sums.
// MOCKED fetch only.
// ---------------------------------------------------------------------------
function fakeOllamaCounts(counts: (n: number) => Record<string, unknown>): { fetchImpl: typeof fetch; calls: number[] } {
  const calls: number[] = [];
  const fetchImpl = (async () => {
    calls.push(calls.length);
    return new Response(JSON.stringify({ message: { role: "assistant", content: JSON.stringify({ answer: "ok" }) }, done: true, ...counts(calls.length) }), { status: 200 });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

for (const [name, run] of RUNNERS) {
  test(`${name}: p1-ollama-actual-tokens present counts are recorded per call in the ledger and summed in the report (json + md), USD labelled notional`, async () => {
    const { outDir, ledger } = tmp();
    const { fetchImpl } = fakeOllamaCounts((n) => ({ prompt_eval_count: 1000 * n, eval_count: 100 * n }));
    const outcome = await run(
      { ...parseP1Args(["--real"]), outDir, ledger },
      {
        env: OLLAMA_ENV,
        gateFile: GATE,
        now: NOW,
        fetchImpl,
        realBody: async (_b, provider) => {
          await ask(provider);
          await ask(provider);
          return {};
        },
      },
    );
    assert.equal(outcome.status, "completed");
    const entries = readLedger(ledger);
    assert.deepEqual(entries.map((e) => e.kind), ["start", "charge", "actual", "charge", "actual", "end"], "reservation first, then the actual line, per request");
    const actuals = entries.filter((e) => e.kind === "actual");
    assert.deepEqual(actuals.map((e) => [e.actual, e.actualInTokens, e.actualOutTokens]), [["reported", 1000, 100], ["reported", 2000, 200]]);
    // table price for glm-5.3-flash is 1 / 4 USD per MTok
    assert.deepEqual(actuals.map((e) => e.actualUsd), [(1000 * 1 + 100 * 4) / 1e6, (2000 * 1 + 200 * 4) / 1e6]);
    const reserved = entries.filter((e) => e.kind === "charge").map((e) => e.usd);
    assert.deepEqual(actuals.map((e) => e.reservedUsd), reserved);
    const usage = (outcome.report as { usage: Record<string, unknown> }).usage;
    assert.deepEqual(usage, {
      backend: "ollama",
      usdBasis: "notional",
      reportedCalls: 2,
      unreportedCalls: 0,
      actualInTokens: 3000,
      actualOutTokens: 300,
      actualUsd: (3000 * 1 + 300 * 4) / 1e6,
      unreportedReservedUsd: 0,
    });
    assert.match(outcome.markdown, /actual input tokens 3000, output tokens 300/);
    assert.match(outcome.markdown, /notional/);
    const onDisk = JSON.parse(readFileSync(join(outDir, readdirSync(outDir).find((f) => f.endsWith(".json"))!), "utf-8"));
    assert.deepEqual(onDisk.usage, usage);
    assert.equal(monthSpendUsd(entries, NOW()), (outcome.report as { spentUsd: number }).spentUsd, "the cap figure is still the reservation total");
  });

  test(`${name}: p1-ollama-actual-tokens missing / negative / string counts are 'unreported' (reservation kept, never zero) in ledger and report`, async () => {
    const { outDir, ledger } = tmp();
    const shapes: Record<string, unknown>[] = [{}, { prompt_eval_count: -3, eval_count: 5 }, { prompt_eval_count: "12", eval_count: 5 }];
    const { fetchImpl } = fakeOllamaCounts((n) => shapes[n - 1]!);
    const outcome = await run(
      { ...parseP1Args(["--real"]), outDir, ledger },
      {
        env: OLLAMA_ENV,
        gateFile: GATE,
        now: NOW,
        fetchImpl,
        realBody: async (_b, provider) => {
          for (let i = 0; i < 3; i++) await ask(provider);
          return {};
        },
      },
    );
    assert.equal(outcome.status, "completed");
    const entries = readLedger(ledger);
    const actuals = entries.filter((e) => e.kind === "actual");
    assert.equal(actuals.length, 3);
    for (const a of actuals) {
      assert.equal(a.actual, "unreported");
      assert.equal(a.actualInTokens, undefined);
      assert.equal(a.actualUsd, undefined);
      assert.ok((a.reservedUsd ?? 0) > 0, "the reservation figure is kept, not zero");
    }
    const reservedTotal = entries.filter((e) => e.kind === "charge").reduce((s, e) => s + (e.usd ?? 0), 0);
    const usage = (outcome.report as { usage: Record<string, number> }).usage;
    assert.equal(usage["reportedCalls"], 0);
    assert.equal(usage["unreportedCalls"], 3);
    assert.equal(usage["actualInTokens"], 0);
    assert.ok(Math.abs((usage["unreportedReservedUsd"] ?? 0) - reservedTotal) < 1e-9);
    assert.match(outcome.markdown, /3 unreported/);
  });

  test(`${name}: p1-ollama-actual-tokens the reservation still caps: tiny reported actuals do not free headroom, and the refused request is never sent`, async () => {
    const { outDir, ledger } = tmp();
    const { fetchImpl, calls } = fakeOllamaCounts(() => ({ prompt_eval_count: 1, eval_count: 1 }));
    const outcome = await run(
      { ...parseP1Args(["--real"]), outDir, ledger },
      {
        env: { ...OLLAMA_ENV, OLLAMA_PRICE_USD_PER_MTOK: "10000,10000" }, // ~USD 20.5 per request reservation
        gateFile: GATE,
        now: NOW,
        fetchImpl,
        realBody: async (_b, provider) => {
          for (let i = 0; i < 5; i++) await ask(provider);
          return {};
        },
      },
    );
    assert.equal(outcome.status, "aborted-budget");
    assert.equal(calls.length, 2, "the third reservation (~61 USD) refuses before its request");
    const written = JSON.parse(readFileSync(join(outDir, readdirSync(outDir).find((f) => f.endsWith(".json"))!), "utf-8"));
    assert.equal(written.cap, "per-run");
    assert.equal(written.usage.reportedCalls, 2, "the abort report still shows the actuals recorded before the stop");
    assert.equal(written.usage.actualInTokens, 2);
  });
}

test("p1-ollama-actual-tokens: the default (no VC_REAL_MODEL) path has no usage section and no actual lines", async () => {
  const { outDir, ledger } = tmp();
  const outcome = await runKb({ ...parseP1Args(["--real"]), outDir, ledger }, { env: { VC_G_REAL: "1" }, gateFile: GATE, now: NOW, realBody: async () => ({}) });
  assert.equal(outcome.status, "completed");
  assert.equal("usage" in (outcome.report as object), false);
  assert.equal(readLedger(ledger).some((e) => e.kind === "actual"), false);
  assert.doesNotMatch(outcome.markdown, /notional/);
});
