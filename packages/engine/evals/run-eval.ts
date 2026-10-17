#!/usr/bin/env node
/**
 * T-009: `pnpm --filter @vc/engine eval:scribe [--provider=perfect|fabricator|case-drift|lazy]
 * [--dataset=<path>]`.
 *
 * Defaults to the "perfect" scripted provider (offline, synthetic, B8/B13). Prints a markdown report
 * to stdout and writes both `qa/evals/scribe/reports/latest-<mode>.{json,md}` (overwritten each run,
 * so the repo does not accumulate timestamped files).
 *
 * The live-Gemini run is a LATER, separately gated unit: it needs Umesh's per-use go-ahead recorded
 * in `qa/gates/real-transcripts-gemini.md` plus `GEMINI_API_KEY` (contract B13), and this script
 * refuses `--provider=gemini` rather than silently doing nothing. It never runs from `pnpm -r test`.
 */
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { loadDataset } from "./dataset.js";
import { scoreDataset } from "./score.js";
import { toMarkdown, toAbortMarkdown } from "./report.js";
import { type BudgetRun, assertGReal, executeReal } from "./budget.js";
import { PROVIDER_MODES, type ProviderMode } from "./providers.js";

const here = fileURLToPath(new URL(".", import.meta.url));
const DEFAULT_DATASET = join(here, "..", "..", "..", "qa", "evals", "scribe", "sessions.jsonl");
const REPORT_DIR = join(here, "..", "..", "..", "qa", "evals", "scribe", "reports");

function isProviderMode(value: string): value is ProviderMode {
  return (PROVIDER_MODES as readonly string[]).includes(value);
}

export function parseArgs(argv: string[]): { mode: ProviderMode; dataset: string } {
  let mode: ProviderMode = "perfect";
  let dataset = DEFAULT_DATASET;
  for (const arg of argv) {
    if (arg.startsWith("--provider=")) {
      const value = arg.slice("--provider=".length);
      if (value === "gemini") {
        throw new Error(
          "eval:scribe --provider=gemini: the live-Gemini run is a later, human-gated unit (contract B13). " +
            "It needs Umesh's per-use go-ahead recorded in qa/gates/real-transcripts-gemini.md plus GEMINI_API_KEY, " +
            "and it never runs from this script or from `pnpm -r test`. Use one of: " + PROVIDER_MODES.join(", "),
        );
      }
      if (!isProviderMode(value)) {
        throw new Error(`eval:scribe --provider=${value}: must be one of ${PROVIDER_MODES.join(", ")}`);
      }
      mode = value;
    } else if (arg.startsWith("--dataset=")) {
      dataset = arg.slice("--dataset=".length);
    }
  }
  return { mode, dataset };
}

async function main(): Promise<void> {
  const { mode, dataset } = parseArgs(process.argv.slice(2));
  const sessions = loadDataset(dataset);
  const report = await scoreDataset(sessions, mode, { datasetPath: dataset });
  const markdown = toMarkdown(report);
  console.log(markdown);

  mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(join(REPORT_DIR, `latest-${mode}.json`), JSON.stringify(report, null, 2), "utf-8");
  writeFileSync(join(REPORT_DIR, `latest-${mode}.md`), markdown, "utf-8");
}

// ---------------------------------------------------------------------------
// P1 U4: shared plumbing for the Student Virtual Counsellor runners (run-kb = `eval:kb`, run-h2h,
// run-probes, run-latency, run-live). Mock by default on frozen/synthetic fixtures; `--real` refuses
// without VC_G_REAL=1 (plan gate G-REAL) and, once allowed, every runner is hard-stopped by the A24
// budget guard (budget.ts) and still writes an abort report.
// ---------------------------------------------------------------------------

const P1_ROOT = join(here, "..", "..", "..", "qa", "evals", "p1");
export const P1_REPORT_DIR = join(P1_ROOT, "reports");
export const P1_LEDGER = join(P1_ROOT, "spend-ledger.jsonl");
export const P1_FIXTURE_DIR = join(here, "fixtures");
export const DEFAULT_GOLDEN_SET = join(P1_FIXTURE_DIR, "golden.sample.jsonl");
export const DEFAULT_KB_FIXTURE = join(P1_FIXTURE_DIR, "kb-fixture.sample.json");
export const DEFAULT_PROBE_SET = join(P1_FIXTURE_DIR, "probes.sample.json");

export interface P1Args {
  real: boolean;
  golden?: string;
  fixture?: string;
  cases?: string;
  outDir: string;
  ledger: string;
  seed: string;
}

export interface RunnerDeps {
  env?: Record<string, string | undefined>;
  now?: () => Date;
  /** REAL-mode body (the provider/KB/audio call). Absent = the real path is not wired yet and refuses. */
  realBody?: (run: BudgetRun) => Promise<unknown>;
  estimateUsd?: number;
}

export interface RunnerOutcome {
  runner: string;
  mode: "mock" | "real";
  status: "completed" | "aborted-budget";
  report: unknown;
  markdown: string;
  files: string[];
}

export class RealNotWiredError extends Error {
  constructor(runner: string) {
    super(`${runner} --real: the real provider/KB/audio path is not wired in this unit (U4 delivers the harness; U2/U6/U9 wire the callers). Refusing rather than faking a real run.`);
    this.name = "RealNotWiredError";
  }
}

export function parseP1Args(argv: readonly string[]): P1Args {
  const args: P1Args = { real: false, outDir: P1_REPORT_DIR, ledger: P1_LEDGER, seed: "p1-u4" };
  for (const arg of argv) {
    if (arg === "--real") args.real = true;
    else if (arg.startsWith("--golden=")) args.golden = arg.slice("--golden=".length);
    else if (arg.startsWith("--fixture=")) args.fixture = arg.slice("--fixture=".length);
    else if (arg.startsWith("--cases=")) args.cases = arg.slice("--cases=".length);
    else if (arg.startsWith("--out=")) args.outDir = arg.slice("--out=".length);
    else if (arg.startsWith("--ledger=")) args.ledger = arg.slice("--ledger=".length);
    else if (arg.startsWith("--seed=")) args.seed = arg.slice("--seed=".length);
    else throw new Error(`unknown argument "${arg}" (known: --real --golden= --fixture= --cases= --out= --ledger= --seed=)`);
  }
  return args;
}

export function writeP1File(outDir: string, name: string, content: string): string {
  mkdirSync(outDir, { recursive: true });
  const path = join(outDir, name);
  writeFileSync(path, content, "utf-8");
  return path;
}

export function writeP1Report(outDir: string, base: string, report: unknown, markdown: string): string[] {
  return [
    writeP1File(outDir, `${base}-report.json`, `${JSON.stringify(report, null, 2)}\n`),
    writeP1File(outDir, `${base}-report.md`, markdown),
  ];
}

/** The REAL path every runner shares: G-REAL gate -> wired? -> budget guard -> report (or abort report). */
export async function runRealPath(runner: string, base: string, args: P1Args, deps: RunnerDeps): Promise<RunnerOutcome> {
  assertGReal(deps.env ?? process.env);
  if (!deps.realBody) throw new RealNotWiredError(runner);
  const result = await executeReal(
    {
      runner,
      ledgerPath: args.ledger,
      ...(deps.env ? { env: deps.env } : {}),
      ...(deps.now ? { now: deps.now } : {}),
      ...(deps.estimateUsd !== undefined ? { estimateUsd: deps.estimateUsd } : {}),
    },
    deps.realBody,
  );
  if (result.status === "aborted-budget") {
    const report = { status: result.status, runner, spentUsd: result.spentUsd, cap: result.cap, limitUsd: result.limitUsd };
    const markdown = toAbortMarkdown({
      runner,
      spentUsd: result.spentUsd,
      ...(result.cap ? { cap: result.cap } : {}),
      ...(result.limitUsd !== undefined ? { limitUsd: result.limitUsd } : {}),
    });
    return { runner, mode: "real", status: "aborted-budget", report, markdown, files: writeP1Report(args.outDir, base, report, markdown) };
  }
  const report = { status: result.status, runner, spentUsd: result.spentUsd, result: result.value };
  const markdown = `# ${runner}: real run completed\n\nSpend: USD ${result.spentUsd}. Result recorded in the JSON report.\n`;
  return { runner, mode: "real", status: "completed", report, markdown, files: writeP1Report(args.outDir, base, report, markdown) };
}

/** CLI tail shared by the P1 runners: prints the report; exit 1 = refused/failed to run, exit 2 = aborted by the budget guard. */
export function p1Main(run: (args: P1Args, deps?: RunnerDeps) => Promise<RunnerOutcome>): void {
  run(parseP1Args(process.argv.slice(2)))
    .then((outcome) => {
      console.log(outcome.markdown);
      if (outcome.status === "aborted-budget") process.exitCode = 2;
    })
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exitCode = 1;
    });
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
