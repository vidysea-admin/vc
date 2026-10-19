#!/usr/bin/env node
/**
 * P1 U11: `pnpm --filter @vc/engine coverage [--fixture=<json>] [--gaps=<json>] [--as-of=<YYYY-MM-DD>] [--out=<dir>]
 * [--stale-after-months=<n>] [--score-threshold=<x>] [--gap-dates=<d1,d2>]` (spec A17, MOCK).
 *
 * Reads a frozen country x theme probe fixture (KB `/search` recordings) plus the recorded KB `/gaps` rows, and prints/writes the
 * coverage report. No network, no Mongo, no clock: the VC gap counts come from the fixture behind the same port shape as
 * `listGapCounts`, and `--as-of` (default: the fixture's recordedAt date) is the only "now". There is no live mode: G-KB and the
 * KB key (D-093 12) are open, so `--real` is refused rather than faked.
 */
import { fileURLToPath } from "node:url";
import { join, relative, resolve } from "node:path";
import { P1_FIXTURE_DIR, P1_REPORT_DIR, writeP1Report, type RunnerOutcome } from "./run-eval.js";
import {
  buildCoverageReport,
  fixtureCoverageSearch,
  fixtureGapCounts,
  loadCoverageFixture,
  loadKbGaps,
  rosterOf,
  toCoverageMarkdown,
  type CoverageFixture,
  type GapCountsPort,
} from "./coverage.js";

const here = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = resolve(here, "..", "..", "..");
export const DEFAULT_COVERAGE_FIXTURE = join(P1_FIXTURE_DIR, "coverage-probes.sample.json");
export const DEFAULT_KB_GAPS = join(REPO_ROOT, "mcp", "university-kb", "kb-fixture", "gaps.json");

export interface CoverageArgs {
  fixture: string;
  gaps: string;
  outDir: string;
  asOf?: string;
  staleAfterMonths?: number;
  scoreThreshold?: number;
  gapDates?: string[];
}

const VALUE_FLAGS = ["--fixture", "--gaps", "--out", "--as-of", "--stale-after-months", "--score-threshold", "--gap-dates"] as const;

export function parseCoverageArgs(argv: readonly string[]): CoverageArgs {
  const args: CoverageArgs = { fixture: DEFAULT_COVERAGE_FIXTURE, gaps: DEFAULT_KB_GAPS, outDir: P1_REPORT_DIR };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--") continue; // pnpm forwards the separator
    if (arg === "--real" || arg.startsWith("--real=")) {
      throw new Error("coverage --real: there is no live mode (G-KB and the KB key, D-093 12, are open). Refusing rather than faking a real run.");
    }
    const flag = VALUE_FLAGS.find((f) => arg === f || arg.startsWith(`${f}=`));
    if (!flag) throw new Error(`unknown argument "${arg}" (known: ${VALUE_FLAGS.join(" ")})`);
    let value: string;
    if (arg === flag) {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) throw new Error(`${flag} needs a value`);
      value = next;
      i += 1;
    } else value = arg.slice(flag.length + 1);
    if (flag === "--fixture") args.fixture = value;
    else if (flag === "--gaps") args.gaps = value;
    else if (flag === "--out") args.outDir = value;
    else if (flag === "--as-of") args.asOf = value;
    else if (flag === "--stale-after-months") {
      const n = Number(value);
      if (!Number.isInteger(n) || n < 1) throw new Error(`--stale-after-months must be a positive integer (got "${value}")`);
      args.staleAfterMonths = n;
    } else if (flag === "--score-threshold") {
      const n = Number(value);
      if (value.trim() === "" || !Number.isFinite(n)) throw new Error(`--score-threshold must be a number (got "${value}")`);
      args.scoreThreshold = n;
    } else args.gapDates = value.split(",").map((d) => d.trim()).filter((d) => d.length > 0);
  }
  return args;
}

export interface CoverageDeps {
  /** Override of the VC gap-count port (a caller with a tenant-scoped Db passes `(input) => listGapCounts(db, input)`). */
  gapCounts?: GapCountsPort;
}

const gapsLabel = (path: string): string => {
  const rel = relative(REPO_ROOT, resolve(path)).replace(/\\/g, "/");
  return rel.startsWith("..") ? path.replace(/\\/g, "/") : rel;
};

export async function runCoverage(args: CoverageArgs, deps: CoverageDeps = {}): Promise<RunnerOutcome> {
  const fixture: CoverageFixture = loadCoverageFixture(args.fixture);
  const kbGaps = loadKbGaps(args.gaps, gapsLabel(args.gaps));
  const roster = rosterOf(fixture);
  const report = await buildCoverageReport({
    fixtureSource: fixture.source,
    countries: roster.countries,
    themes: roster.themes,
    probes: fixture.probes,
    search: fixtureCoverageSearch(fixture),
    asOf: args.asOf ?? fixture.recordedAt.slice(0, 10),
    ...(args.staleAfterMonths !== undefined ? { staleAfterMonths: args.staleAfterMonths } : {}),
    ...(args.scoreThreshold !== undefined ? { scoreThreshold: args.scoreThreshold } : {}),
    kbGaps,
    gapCounts: deps.gapCounts ?? fixtureGapCounts(fixture),
    gapDates: args.gapDates ?? [...new Set(fixture.vcGapCounts.map((r) => r.date))],
  });
  const markdown = toCoverageMarkdown(report);
  return { runner: "run-coverage", mode: "mock", status: "completed", report, markdown, files: writeP1Report(args.outDir, "coverage", report, markdown) };
}

export function coverageMain(argv: readonly string[]): void {
  runCoverage(parseCoverageArgs(argv))
    .then((outcome) => {
      console.log(outcome.markdown);
    })
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exitCode = 1;
    });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) coverageMain(process.argv.slice(2));
