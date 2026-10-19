#!/usr/bin/env node
/**
 * P1 U4: `pnpm --filter @vc/engine eval:probes [--cases=<json>] [--out=<dir>] [--real]` (spec A4).
 * Mock mode applies the /ask serve rule to recorded/synthetic responses (no network). `--real`
 * (30 probes through a real model) refuses without VC_G_REAL=1 and runs under the A24 budget guard.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  DEFAULT_PROBE_SET,
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
import { NO_SOURCED_ANSWER_TEXT, decideAnswer, isServable, parseProbeSet, scoreProbes, type AnswerResult, type AskLike } from "./probes.js";
import { toProbesMarkdown } from "./report.js";

const ModelAskSchema = z.object({
  answer: z.string(),
  verdict: z.string(),
  insufficient_coverage: z.boolean(),
  web_used: z.boolean(),
  source_node_ids: z.array(z.string()),
});
/** Eval-harness prompt (not a product skill): the model plays the /ask answerer under the grounded-answer rule. */
const PROBE_PROMPT =
  "You answer a student's study-abroad question using ONLY the supplied knowledge-base passages. Never use training knowledge or the web. " +
  'If the passages do not support an answer, set verdict "insufficient", insufficient_coverage true, answer "" and source_node_ids []. ' +
  'Otherwise set verdict "correct", insufficient_coverage false, web_used false and cite the node_id of every passage you used. ' +
  'Return JSON only: {"answer": string, "verdict": string, "insufficient_coverage": boolean, "web_used": boolean, "source_node_ids": string[]}.';

/**
 * U13b / A4 REAL body (VC_REAL_MODEL=ollama:<id>): each probe goes through `provider`, which sees only the
 * probe's recorded INTERNAL KB passages (none for an out-of-KB probe). The reply is judged by the same
 * serve rule and scorer as mock mode. A reply the rule would serve but that cites no supplied passage is
 * recorded as an answered-without-source violation (it is NOT quietly turned into a refusal).
 */
export function realProbesBody(args: P1Args): RealBody {
  const path = args.cases ?? DEFAULT_PROBE_SET;
  const set = parseProbeSet(readFileSync(path, "utf-8"), path);
  return async (_run, provider) => {
    if (!provider) throw new RealNotWiredError("run-probes");
    const report = await scoreProbes(set.cases, async (c): Promise<AnswerResult> => {
      if (c.ask === "unavailable") return decideAnswer("unavailable");
      const passages = c.ask.sources.internal.map((s) => ({ node_id: s.node_id, text: c.ask === "unavailable" ? "" : (c.ask.answer ?? "") }));
      const out = await provider.generate({ skillName: "eval-probe-ask", skillPrompt: PROBE_PROMPT, outputSchema: ModelAskSchema, input: { question: c.question, passages } });
      const known = new Set(passages.map((p) => p.node_id));
      const cited = out.source_node_ids.filter((id) => known.has(id));
      const modelAsk: AskLike = {
        answer: out.answer,
        verdict: out.verdict,
        insufficient_coverage: out.insufficient_coverage,
        web_used: out.web_used,
        sources: { internal: cited.map((node_id) => ({ node_id })), web: [] },
      };
      if (!isServable(modelAsk)) return { status: "no_sourced_answer", text: NO_SOURCED_ANSWER_TEXT, sourceIds: [], webUsed: false };
      return { status: "answered", text: out.answer, sourceIds: cited, webUsed: false };
    });
    const markdown = [`> REAL run: model \`${provider.model}\` answered ${set.cases.length} probe(s) from the recorded KB passages only.`, "", toProbesMarkdown(report, { mode: "real", source: set.source })].join("\n");
    return new RealReport({ mode: "real", model: provider.model, source: set.source, report }, markdown);
  };
}

export async function runProbes(args: P1Args, deps: RunnerDeps = {}): Promise<RunnerOutcome> {
  if (args.real) return runRealPath("run-probes", "probes", args, deps, () => realProbesBody(args));
  const path = args.cases ?? DEFAULT_PROBE_SET;
  const set = parseProbeSet(readFileSync(path, "utf-8"), path);
  const report = await scoreProbes(set.cases, async (c) => decideAnswer(c.ask));
  const markdown = toProbesMarkdown(report, { mode: "mock", source: set.source });
  return { runner: "run-probes", mode: "mock", status: "completed", report, markdown, files: writeP1Report(args.outDir, "probes", report, markdown) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) p1Main(runProbes);
