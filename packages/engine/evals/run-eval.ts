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
import { toMarkdown } from "./report.js";
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

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
