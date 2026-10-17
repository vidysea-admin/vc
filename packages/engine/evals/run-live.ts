#!/usr/bin/env node
/**
 * P1 U4: `pnpm --filter @vc/engine eval:live [--out=<dir>] [--real]` (spec A10 skeleton). Mock only:
 * scores the voice gate against a Mock Live runner (it can never PROVE A10). `--real` refuses without
 * VC_G_REAL=1, then refuses again until U9 wires a Live adapter; it runs under the A24 budget guard.
 */
import { fileURLToPath } from "node:url";
import { p1Main, runRealPath, writeP1Report, type P1Args, type RunnerDeps, type RunnerOutcome } from "./run-eval.js";
import { MockLiveRunner, sampleLiveCases, scoreLive } from "./live-audio.js";
import { toLiveMarkdown } from "./report.js";

export async function runLive(args: P1Args, deps: RunnerDeps = {}): Promise<RunnerOutcome> {
  if (args.real) return runRealPath("run-live", "live", args, deps);
  const report = await scoreLive(sampleLiveCases(), new MockLiveRunner("healthy"), { real: false });
  const markdown = toLiveMarkdown(report);
  return { runner: "run-live", mode: "mock", status: "completed", report, markdown, files: writeP1Report(args.outDir, "live", report, markdown) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) p1Main(runLive);
