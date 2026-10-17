#!/usr/bin/env node
/**
 * P1 U4: `pnpm --filter @vc/engine eval:probes [--cases=<json>] [--out=<dir>] [--real]` (spec A4).
 * Mock mode applies the /ask serve rule to recorded/synthetic responses (no network). `--real`
 * (30 probes through a real model) refuses without VC_G_REAL=1 and runs under the A24 budget guard.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DEFAULT_PROBE_SET, p1Main, runRealPath, writeP1Report, type P1Args, type RunnerDeps, type RunnerOutcome } from "./run-eval.js";
import { decideAnswer, parseProbeSet, scoreProbes } from "./probes.js";
import { toProbesMarkdown } from "./report.js";

export async function runProbes(args: P1Args, deps: RunnerDeps = {}): Promise<RunnerOutcome> {
  if (args.real) return runRealPath("run-probes", "probes", args, deps);
  const path = args.cases ?? DEFAULT_PROBE_SET;
  const set = parseProbeSet(readFileSync(path, "utf-8"), path);
  const report = await scoreProbes(set.cases, async (c) => decideAnswer(c.ask));
  const markdown = toProbesMarkdown(report, { mode: "mock", source: set.source });
  return { runner: "run-probes", mode: "mock", status: "completed", report, markdown, files: writeP1Report(args.outDir, "probes", report, markdown) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) p1Main(runProbes);
