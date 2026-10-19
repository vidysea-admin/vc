#!/usr/bin/env node
/**
 * P1 U4: `pnpm --filter @vc/engine eval:kb [--golden=<jsonl>] [--fixture=<json>] [--out=<dir>] [--real]`
 * (spec A2a; A2b with --real). Mock mode scores Hit@3 against a FROZEN fixture of recorded KB
 * `/search` responses: no network. `--real` refuses without VC_G_REAL=1 and runs under the A24
 * budget guard.
 */
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  DEFAULT_GOLDEN_SET,
  DEFAULT_KB_FIXTURE,
  RealNotWiredError,
  RealReport,
  p1Main,
  runRealPath,
  writeP1Report,
  type P1Args,
  type RealBody,
  type RunnerDeps,
  type RunnerOutcome,
} from "./run-eval.js";
import { fixtureSearch, loadGoldenSet, loadKbFixture, type KbFixture, type KbHit } from "./dataset.js";
import { scoreKbEval } from "./kb-eval.js";
import { toKbMarkdown } from "./report.js";

const RewriteSchema = z.object({ english: z.string().min(1) });
/** Eval-harness prompt (not a product skill): the A2b query rewrite the engine will do at runtime. */
const REWRITE_PROMPT =
  "Rewrite the student's question (Hindi, Hinglish or English) as ONE plain English search query for a study-abroad counselling knowledge base. " +
  'Keep every country, theme and named entity. Return JSON only: {"english": "<query>"}.';
/** A rewrite counts as matching a recorded query when their word sets overlap at least this much (Jaccard). */
export const REWRITE_MATCH_MIN_JACCARD = 0.5;

function words(text: string): Set<string> {
  return new Set(text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 0));
}

/** The recorded hits of the fixture query closest to `text` (a frozen fixture cannot run a live /search); undefined below the threshold. */
export function nearestRecordedSearch(fixture: KbFixture, text: string): KbHit[] | undefined {
  const want = words(text);
  let best: { score: number; hits: KbHit[] } | undefined;
  for (const entry of fixture.search) {
    const have = words(entry.query);
    let shared = 0;
    for (const w of want) if (have.has(w)) shared += 1;
    const union = want.size + have.size - shared;
    const score = union === 0 ? 0 : shared / union;
    if (!best || score > best.score) best = { score, hits: entry.hits };
  }
  return best && best.score >= REWRITE_MATCH_MIN_JACCARD ? best.hits : undefined;
}

/**
 * U13b / A2b REAL body (VC_REAL_MODEL=ollama:<id>). English questions are scored exactly as in mock mode
 * (frozen fixture, no model call). Hindi/Hinglish questions go through `provider` once for the English
 * rewrite, then the nearest recorded query's hits are scored with the same hit@3 scorer and report.
 * Retrieval stays on the frozen fixture: a live KB smoke is a separate step.
 */
export function realKbBody(args: P1Args): RealBody {
  const golden = loadGoldenSet(args.golden ?? DEFAULT_GOLDEN_SET);
  const fixture = loadKbFixture(args.fixture ?? DEFAULT_KB_FIXTURE);
  return async (_run, provider) => {
    if (!provider) throw new RealNotWiredError("run-kb");
    const nonEnglish = new Set(golden.filter((q) => q.lang !== "en").map((q) => q.question));
    const rewrites: Record<string, string> = {};
    const report = await scoreKbEval(
      golden,
      async (query) => {
        if (!nonEnglish.has(query)) return fixtureSearch(fixture, query);
        const { english } = await provider.generate({ skillName: "eval-kb-rewrite", skillPrompt: REWRITE_PROMPT, outputSchema: RewriteSchema, input: { question: query } });
        rewrites[query] = english;
        return nearestRecordedSearch(fixture, english);
      },
      { fixtureSource: fixture.source },
    );
    const markdown = [
      `> REAL run: model \`${provider.model}\` rewrote ${Object.keys(rewrites).length} Hindi/Hinglish question(s) to English; retrieval is the frozen fixture (\`${fixture.source}\`), not a live KB.`,
      "",
      toKbMarkdown(report),
    ].join("\n");
    return new RealReport({ mode: "real", model: provider.model, rewrites, report }, markdown);
  };
}

export async function runKb(args: P1Args, deps: RunnerDeps = {}): Promise<RunnerOutcome> {
  if (args.real) return runRealPath("run-kb", "kb", args, deps, () => realKbBody(args));
  const golden = loadGoldenSet(args.golden ?? DEFAULT_GOLDEN_SET);
  const fixture = loadKbFixture(args.fixture ?? DEFAULT_KB_FIXTURE);
  const report = await scoreKbEval(golden, async (query) => fixtureSearch(fixture, query), { fixtureSource: fixture.source });
  const markdown = toKbMarkdown(report);
  return { runner: "run-kb", mode: "mock", status: "completed", report, markdown, files: writeP1Report(args.outDir, "kb", report, markdown) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) p1Main(runKb);
