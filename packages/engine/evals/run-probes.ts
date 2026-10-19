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
  assertRealInputAllowed,
  RealReport,
  p1Main,
  runRealPath,
  writeP1Report,
  type P1Args,
  type RealBody,
  type RunnerDeps,
  type RunnerOutcome,
} from "./run-eval.js";
import { NO_SOURCED_ANSWER_TEXT, decideAnswer, isServable, parseProbeSet, scoreProbes, type AnswerResult, type AskLike, type ProbeCase } from "./probes.js";
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
 * probe's retrieved INTERNAL KB passage TEXT from the probe set (`sources.internal[].text`), never the recorded
 * /ask answer. A probe that lists internal sources but carries no passage text is EXCLUDED (0 requests, counted
 * in the report): there is nothing real to show the model. A probe with no internal sources at all is a genuine
 * out-of-KB probe and is sent with an empty passage list (the model must refuse). The reply is judged by the
 * same serve rule and scorer as mock mode; a servable-looking reply that cites no supplied passage is recorded
 * as an answered-without-source violation (NOT quietly turned into a refusal). A set whose source is not
 * "recorded" can never print PASS (scoreProbes caps it at NOT PROVEN).
 */
export function realProbesBody(args: P1Args): RealBody {
  const path = args.cases ?? DEFAULT_PROBE_SET;
  const set = parseProbeSet(readFileSync(path, "utf-8"), path);
  assertRealInputAllowed("run-probes", "--cases", set.source, args);
  const passagesOf = (c: ProbeCase): { node_id: string; text: string }[] =>
    c.ask === "unavailable" ? [] : c.ask.sources.internal.filter((s) => (s.text ?? "").trim() !== "").map((s) => ({ node_id: s.node_id, text: s.text!.trim() }));
  const hasSourcesWithoutText = (c: ProbeCase): boolean => c.ask !== "unavailable" && c.ask.sources.internal.length > 0 && passagesOf(c).length === 0;
  const excluded = set.cases.filter(hasSourcesWithoutText).map((c) => ({ id: c.id, reason: "no passage text" }));
  const scorable = set.cases.filter((c) => !hasSourcesWithoutText(c));
  return async (_run, provider) => {
    if (!provider) throw new RealNotWiredError("run-probes");
    const report = await scoreProbes(
      scorable,
      async (c): Promise<AnswerResult> => {
        if (c.ask === "unavailable") return decideAnswer("unavailable");
        const passages = passagesOf(c);
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
      },
      { source: set.source },
    );
    const markdown = [
      `> REAL run: model \`${provider.model}\` answered ${scorable.length} probe(s) from the probe set's retrieved passage text only; ${excluded.length} excluded (no passage text).`,
      "",
      toProbesMarkdown(report, { mode: "real", source: set.source, excluded: excluded.length }),
    ].join("\n");
    return new RealReport({ mode: "real", model: provider.model, source: set.source, excluded, report }, markdown);
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
