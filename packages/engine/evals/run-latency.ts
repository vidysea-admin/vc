#!/usr/bin/env node
/**
 * P1 U4: `pnpm --filter @vc/engine eval:latency [--out=<dir>] [--real]` (spec A8). Mock mode times a
 * scripted answerer on a fake clock (harness plumbing only; it can never PROVE A8). `--real` refuses
 * without VC_G_REAL=1 and runs under the A24 budget guard.
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
import { fixtureSearch, loadGoldenSet, loadKbFixture } from "./dataset.js";
import { A8_MIN_SAMPLES, evaluateA8, measureOnce, summarizeLatency, type LatencySample } from "./latency.js";
import { toLatencyMarkdown } from "./report.js";

const AnswerSchema = z.object({ answer: z.string().min(1) });
/** Eval-harness prompt (not a product skill). */
const LATENCY_PROMPT =
  "Answer the student's study-abroad question in at most three sentences using ONLY the supplied knowledge-base passages. " +
  'Return JSON only: {"answer": "<text>"}.';

/**
 * U13b / A8 REAL body (VC_REAL_MODEL=ollama:<id>): times A8_MIN_SAMPLES sequential text answers through
 * `provider` (golden questions cycled, top-3 fixture passages as context). The provider call is NOT
 * streamed, so the first token cannot be observed before the full answer: first-token latency is recorded
 * as equal to full-answer latency, a conservative upper bound (it can only make A8 harder to pass).
 */
export function realLatencyBody(args: P1Args): RealBody {
  const golden = loadGoldenSet(args.golden ?? DEFAULT_GOLDEN_SET);
  const fixture = loadKbFixture(args.fixture ?? DEFAULT_KB_FIXTURE);
  return async (_run, provider) => {
    if (!provider) throw new RealNotWiredError("run-latency");
    const samples: LatencySample[] = [];
    for (let i = 0; i < A8_MIN_SAMPLES; i++) {
      const q = golden[i % golden.length]!;
      const passages = [...(fixtureSearch(fixture, q.question) ?? [])]
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map((h) => ({ node_id: h.turnId, text: h.turn.text }));
      samples.push(
        await measureOnce(async (hooks) => {
          await provider.generate({ skillName: "eval-latency-answer", skillPrompt: LATENCY_PROMPT, outputSchema: AnswerSchema, input: { question: q.question, passages } });
          hooks.firstToken();
        }),
      );
    }
    const summary = summarizeLatency(samples);
    const verdict = evaluateA8(summary, { real: true });
    const markdown = [
      `> REAL run: model \`${provider.model}\`, ${samples.length} sequential non-streamed answers. First-token latency is recorded equal to full-answer latency (no streaming), a conservative upper bound.`,
      "",
      toLatencyMarkdown(summary, verdict, { mode: "real" }),
    ].join("\n");
    return new RealReport({ mode: "real", model: provider.model, firstTokenBasis: "full-answer (non-streamed)", summary, verdict }, markdown);
  };
}

export async function runLatency(args: P1Args, deps: RunnerDeps = {}): Promise<RunnerOutcome> {
  if (args.real) return runRealPath("run-latency", "latency", args, deps, () => realLatencyBody(args));
  const samples: LatencySample[] = [];
  let t = 0;
  for (let i = 0; i < 30; i++) {
    const firstToken = 300 + ((i * 37) % 600);
    const full = 1500 + ((i * 113) % 2500);
    samples.push(
      await measureOnce(async (hooks) => {
        t += firstToken;
        hooks.firstToken();
        t += full - firstToken;
      }, () => t),
    );
  }
  const summary = summarizeLatency(samples);
  const verdict = evaluateA8(summary, { real: false });
  const report = { mode: "mock", summary, verdict };
  const markdown = toLatencyMarkdown(summary, verdict, { mode: "mock" });
  return { runner: "run-latency", mode: "mock", status: "completed", report, markdown, files: writeP1Report(args.outDir, "latency", report, markdown) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) p1Main(runLatency);
