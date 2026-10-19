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
import { join, resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { loadDataset, loadGoldenFile, type GoldenQuestion } from "./dataset.js";
import { scoreDataset } from "./score.js";
import { toMarkdown, toAbortMarkdown } from "./report.js";
import { type BudgetRun, assertGReal, executeReal } from "./budget.js";
import { PROVIDER_MODES, type ProviderMode } from "./providers.js";
import { prepareOllamaProvider, type LlmProvider } from "@vc/providers";

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
  /** Blind-pairing seed. Absent = the runner decides (mock: fixed default; --real: random, kept only in the key file). */
  seed?: string;
  /** run-h2h --real only: JSON array of counsellor-written expert answers `{questionId, text, author}` (U13b). */
  experts?: string;
  /** U13b (B13/D-100): the operator confirms a `source: "recorded"` input has been anonymised; REAL runners refuse recorded input without it. */
  anonymised?: boolean;
  /** run-h2h --real only (ISS-294): permit placeholder expert answers; their questions are withheld from the blinded pairs and sheets. */
  allowPlaceholderExperts?: boolean;
}

/**
 * U13b guard (B13/D-100): a REAL run sends fixture text to a paid external provider, so an input declared
 * `source: "recorded"` (real transcripts) is refused unless the operator passes `--anonymised`. Called by each
 * REAL body factory, i.e. BEFORE any ledger line or request. Mock mode never calls it.
 */
export function assertRealInputAllowed(runner: string, flag: string, source: string, args: P1Args): void {
  if (source !== "synthetic" && source !== "recorded") {
    throw new Error(`${runner} --real: ${flag} declares source ${JSON.stringify(source)}; it must be exactly "synthetic" or "recorded". Refusing.`);
  }
  if (source === "recorded" && !args.anonymised) {
    throw new Error(
      `${runner} --real: ${flag} is source "recorded" (real transcripts); a REAL run sends it to an external paid provider (B13/D-100). ` +
        "Refusing. Anonymise it first, then pass --anonymised to confirm.",
    );
  }
}

/**
 * U13b guard for the `--golden` question file (D-101): a REAL run sends the questions to a paid provider, so the
 * file must declare its provenance in a first-line `{"source": "synthetic"|"recorded"}` header. No header = refused
 * (an undeclared file cannot be checked); "recorded" needs `--anonymised`. Mock mode never calls this.
 */
export function loadRealGoldenSet(runner: string, args: P1Args): GoldenQuestion[] {
  const path = args.golden ?? DEFAULT_GOLDEN_SET;
  const file = loadGoldenFile(path);
  if (file.source === undefined) {
    throw new Error(
      `${runner} --real: --golden ${path} declares no provenance, so the recorded-input guard (B13/D-100) cannot check it. ` +
        'Add a first line {"source": "synthetic"} or {"source": "recorded"}. Refusing.',
    );
  }
  assertRealInputAllowed(runner, "--golden", file.source, args);
  return file.questions;
}

export interface RunnerDeps {
  env?: Record<string, string | undefined>;
  now?: () => Date;
  /** Override of qa/gates/g-real.md (tests only). */
  gateFile?: string;
  /**
   * REAL-mode body (the provider/KB/audio call). Absent = the real path is not wired yet and refuses.
   * `provider` (U13b, D-100) is set only when VC_REAL_MODEL selects `ollama:<id>`: an OllamaProvider
   * whose every request is charged to `run` BEFORE it is sent. Unset/"gemini" = the default path,
   * unchanged: `provider` is undefined and the body brings its own, as before.
   */
  realBody?: RealBody;
  estimateUsd?: number;
  /** Mocked fetch for the Ollama provider (tests only; production uses the global fetch). */
  fetchImpl?: typeof fetch;
}

/** The REAL-mode body: runs the runner's fixture set, charging every model call to `run` through `provider`. */
export type RealBody = (run: BudgetRun, provider?: LlmProvider) => Promise<unknown>;

/**
 * U13b: a REAL body may return this to have the runner's own markdown report written (the existing
 * report.ts renderer output) instead of the generic "real run completed" stub; `value` goes into the JSON report.
 */
export class RealReport {
  constructor(
    readonly value: unknown,
    readonly markdown: string,
  ) {}
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
  const args: P1Args = { real: false, outDir: P1_REPORT_DIR, ledger: P1_LEDGER };
  for (const arg of argv) {
    if (arg === "--real") args.real = true;
    else if (arg === "--anonymised") args.anonymised = true;
    else if (arg === "--allow-placeholder-experts") args.allowPlaceholderExperts = true;
    else if (arg.startsWith("--golden=")) args.golden = arg.slice("--golden=".length);
    else if (arg.startsWith("--fixture=")) args.fixture = arg.slice("--fixture=".length);
    else if (arg.startsWith("--cases=")) args.cases = arg.slice("--cases=".length);
    else if (arg.startsWith("--out=")) args.outDir = arg.slice("--out=".length);
    else if (arg.startsWith("--ledger=")) args.ledger = arg.slice("--ledger=".length);
    else if (arg.startsWith("--seed=")) args.seed = arg.slice("--seed=".length);
    else if (arg.startsWith("--experts=")) args.experts = arg.slice("--experts=".length);
    else throw new Error(`unknown argument "${arg}" (known: --real --anonymised --allow-placeholder-experts --golden= --fixture= --cases= --out= --ledger= --seed= --experts=)`);
  }
  // --real spends money against the one shared A24 ledger; a different --ledger would hide that spend from the caps.
  if (args.real && resolve(args.ledger) !== resolve(P1_LEDGER)) {
    throw new Error(`--real may not use --ledger=${args.ledger}: the spend ledger is fixed at ${P1_LEDGER} so the USD 50/200 caps see all spend`);
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

/** D-103: the report block for an Ollama run's actual token usage. The Spend line above it is the pre-request reservation total (what the caps count). */
function usageMarkdown(u: { reportedCalls: number; unreportedCalls: number; actualInTokens: number; actualOutTokens: number; actualUsd: number; unreportedReservedUsd: number }): string {
  return [
    `Ollama actual usage (this runner): ${u.reportedCalls} calls reported, ${u.unreportedCalls} unreported; actual input tokens ${u.actualInTokens}, output tokens ${u.actualOutTokens}.`,
    `Actual USD ${u.actualUsd} is notional (actual tokens x the table/override price, not an invoice); the Spend figure above is the pre-request reservation upper bound that the caps count.` +
      (u.unreportedCalls > 0 ? ` The ${u.unreportedCalls} unreported calls keep their reservation figure (USD ${u.unreportedReservedUsd} in total), never zero.` : ""),
  ].join("\n");
}

/** The REAL path every runner shares: G-REAL gate -> wired? -> budget guard -> report (or abort report). */
export async function runRealPath(
  runner: string,
  base: string,
  args: P1Args,
  deps: RunnerDeps,
  /**
   * U13b: the runner's own REAL body factory. Used only when the caller supplied no `deps.realBody` AND
   * VC_REAL_MODEL selects an Ollama model (a `provider` exists). With Gemini selected (the default) the
   * body is still not wired and the runner refuses with RealNotWiredError, exactly as before. The factory
   * runs after the gate and the config validation but before the budget run starts, so a bad fixture path
   * refuses without touching the spend ledger.
   */
  makeDefaultBody?: () => RealBody,
): Promise<RunnerOutcome> {
  assertGReal(deps.env ?? process.env, deps.gateFile);
  if (!deps.realBody && !makeDefaultBody) throw new RealNotWiredError(runner);
  // U13b: validate the model selection (VC_REAL_MODEL, OLLAMA_API_KEY, price) BEFORE the budget guard
  // starts a run, so a bad config refuses without touching the spend ledger.
  const makeOllama = prepareOllamaProvider(deps.env ?? process.env, deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {});
  if (!deps.realBody && !makeOllama) throw new RealNotWiredError(runner);
  const realBody = deps.realBody ?? makeDefaultBody!();
  const result = await executeReal(
    {
      runner,
      ledgerPath: args.ledger,
      ...(deps.env ? { env: deps.env } : {}),
      ...(deps.gateFile ? { gateFile: deps.gateFile } : {}),
      ...(deps.now ? { now: deps.now } : {}),
      ...(deps.estimateUsd !== undefined ? { estimateUsd: deps.estimateUsd } : {}),
    },
    (run) =>
      realBody(
        run,
        makeOllama?.(
          (estimate) => run.charge(estimate.estimatedCostUsd),
          // D-103: record the response's own token counts next to the reservation just charged (informational; the cap uses the reservation).
          (usage) =>
            run.recordActual({
              reservedUsd: usage.estimate.estimatedCostUsd,
              ...(usage.inputTokens !== undefined ? { inputTokens: usage.inputTokens } : {}),
              ...(usage.outputTokens !== undefined ? { outputTokens: usage.outputTokens } : {}),
              ...(usage.usd !== undefined ? { usd: usage.usd } : {}),
            }),
        ),
      ),
  );
  // D-103: per-runner sums of the actual tokens the Ollama responses reported (ollama runs only).
  const usage = makeOllama && result.usage ? { backend: "ollama" as const, usdBasis: "notional" as const, ...result.usage } : undefined;
  if (result.status === "aborted-budget") {
    const report = { status: result.status, runner, spentUsd: result.spentUsd, cap: result.cap, limitUsd: result.limitUsd, ...(usage ? { usage } : {}) };
    const markdown =
      toAbortMarkdown({
        runner,
        spentUsd: result.spentUsd,
        ...(result.cap ? { cap: result.cap } : {}),
        ...(result.limitUsd !== undefined ? { limitUsd: result.limitUsd } : {}),
      }) + (usage ? `\n${usageMarkdown(usage)}\n` : "");
    return { runner, mode: "real", status: "aborted-budget", report, markdown, files: writeP1Report(args.outDir, base, report, markdown) };
  }
  const rich = result.value instanceof RealReport ? result.value : undefined;
  const report = { status: result.status, runner, spentUsd: result.spentUsd, result: rich ? rich.value : result.value, ...(usage ? { usage } : {}) };
  const usageNote = usage ? `\n${usageMarkdown(usage)}\n` : "";
  const markdown = rich
    ? `${rich.markdown.trimEnd()}\n\nSpend: USD ${result.spentUsd}.\n${usageNote}`
    : `# ${runner}: real run completed\n\nSpend: USD ${result.spentUsd}. Result recorded in the JSON report.\n${usageNote}`;
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
