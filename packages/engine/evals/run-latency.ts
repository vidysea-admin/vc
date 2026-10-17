#!/usr/bin/env node
/**
 * P1 U4: `pnpm --filter @vc/engine eval:latency [--out=<dir>] [--real]` (spec A8). Mock mode times a
 * scripted answerer on a fake clock (harness plumbing only; it can never PROVE A8). `--real` refuses
 * without VC_G_REAL=1 and runs under the A24 budget guard.
 */
import { fileURLToPath } from "node:url";
import { p1Main, runRealPath, writeP1Report, type P1Args, type RunnerDeps, type RunnerOutcome } from "./run-eval.js";
import { evaluateA8, measureOnce, summarizeLatency, type LatencySample } from "./latency.js";
import { toLatencyMarkdown } from "./report.js";

export async function runLatency(args: P1Args, deps: RunnerDeps = {}): Promise<RunnerOutcome> {
  if (args.real) return runRealPath("run-latency", "latency", args, deps);
  const samples: LatencySample[] = [];
  let t = 0;
  for (let i = 0; i < 30; i++) {
    const firstToken = 300 + ((i * 37) % 600);
    const full = 1500 + ((i * 113) % 2500);
    samples.push(
      await measureOnce(async (hooks) => {
        t += firstToken;
        hooks.firstToken();
        t += full - firstToken;
      }, () => t),
    );
  }
  const summary = summarizeLatency(samples);
  const verdict = evaluateA8(summary, { real: false });
  const report = { mode: "mock", summary, verdict };
  const markdown = toLatencyMarkdown(summary, verdict, { mode: "mock" });
  return { runner: "run-latency", mode: "mock", status: "completed", report, markdown, files: writeP1Report(args.outDir, "latency", report, markdown) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) p1Main(runLatency);
