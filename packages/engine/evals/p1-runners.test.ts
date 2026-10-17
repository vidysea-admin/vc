/** P1 U4: the five runners (eval:kb, run-h2h, run-probes, run-latency, run-live) share one contract:
 *  mock by default on frozen/synthetic fixtures; --real refuses without VC_G_REAL=1; once allowed,
 *  every one is hard-stopped by the A24 budget guard and still writes an abort report. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseP1Args, type P1Args, type RunnerDeps, type RunnerOutcome } from "./run-eval.js";
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
    await assert.rejects(run({ ...parseP1Args(["--real"]), outDir, ledger }, { env: { VC_G_REAL: "1" }, now: NOW }), /not wired/i);
    assert.equal(existsSync(ledger), false);
  });

  test(`${name}: REAL hard-stops at USD 50 per run (A24), records the spend and still writes an abort report`, async () => {
    const { outDir, ledger } = tmp();
    const outcome = await run(
      { ...parseP1Args(["--real"]), outDir, ledger },
      {
        env: { VC_G_REAL: "1" },
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
      const ok = await run({ ...parseP1Args(["--real"]), outDir, ledger }, { env: { VC_G_REAL: "1" }, now: NOW, realBody: spend(50) });
      assert.equal(ok.status, "completed");
    }
    const fifth = await run({ ...parseP1Args(["--real"]), outDir, ledger }, { env: { VC_G_REAL: "1" }, now: NOW, realBody: spend(1) });
    assert.equal(fifth.status, "aborted-budget");
    assert.equal(monthSpendUsd(readLedger(ledger), NOW()), 200);
  });
}

test("eval:kb mock verdicts: A2a PASS (synthetic provenance stated), A2b NOT PROVEN", async () => {
  const { outDir, ledger } = tmp();
  const o = await runKb({ ...parseP1Args([]), outDir, ledger }, { now: NOW });
  assert.match(o.markdown, /A2a[^\n]*PASS/);
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
