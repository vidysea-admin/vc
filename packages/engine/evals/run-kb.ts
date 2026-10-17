#!/usr/bin/env node
/**
 * P1 U4: `pnpm --filter @vc/engine eval:kb [--golden=<jsonl>] [--fixture=<json>] [--out=<dir>] [--real]`
 * (spec A2a; A2b with --real). Mock mode scores Hit@3 against a FROZEN fixture of recorded KB
 * `/search` responses: no network. `--real` refuses without VC_G_REAL=1 and runs under the A24
 * budget guard.
 */
import { fileURLToPath } from "node:url";
import { DEFAULT_GOLDEN_SET, DEFAULT_KB_FIXTURE, p1Main, runRealPath, writeP1Report, type P1Args, type RunnerDeps, type RunnerOutcome } from "./run-eval.js";
import { fixtureSearch, loadGoldenSet, loadKbFixture } from "./dataset.js";
import { scoreKbEval } from "./kb-eval.js";
import { toKbMarkdown } from "./report.js";

export async function runKb(args: P1Args, deps: RunnerDeps = {}): Promise<RunnerOutcome> {
  if (args.real) return runRealPath("run-kb", "kb", args, deps);
  const golden = loadGoldenSet(args.golden ?? DEFAULT_GOLDEN_SET);
  const fixture = loadKbFixture(args.fixture ?? DEFAULT_KB_FIXTURE);
  const report = await scoreKbEval(golden, async (query) => fixtureSearch(fixture, query), { fixtureSource: fixture.source });
  const markdown = toKbMarkdown(report);
  return { runner: "run-kb", mode: "mock", status: "completed", report, markdown, files: writeP1Report(args.outDir, "kb", report, markdown) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) p1Main(runKb);
