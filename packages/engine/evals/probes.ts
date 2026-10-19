/**
 * P1 U4 / A4 harness: the `/ask` serve rule and the out-of-KB probe scorer.
 *
 * Serve rule (spec scope item 3, G6): an `/ask` answer is served ONLY when `verdict == "correct"`
 * AND `insufficient_coverage == false` AND `web_used == false`. Every other combination, including
 * web fallback failed (`web_used:false`, `insufficient_coverage:true`, a generated `answer` over weak
 * context), is the no-answer path. This file is the EVAL oracle for that rule (U2 implements the
 * runtime rule in `mcp/university-kb` and is judged against it).
 */
import { z } from "zod";
import { ProvenanceSchema, stripBom } from "./dataset.js";

/** Placeholder fixed text; U6 owns the real wording, the probes only require it be constant. */
export const NO_SOURCED_ANSWER_TEXT = "I don't have a sourced answer for that yet.";
export const PROBE_REAL_BAR = 30;

export interface AskLike {
  answer?: string;
  verdict: string;
  insufficient_coverage: boolean;
  web_used: boolean;
  sources: { internal: { node_id: string; text?: string }[]; web: unknown[] };
}

export interface AnswerResult {
  status: "answered" | "no_sourced_answer";
  text: string;
  sourceIds: string[];
  webUsed: boolean;
}

export function isServable(ask: AskLike): boolean {
  return ask.verdict === "correct" && ask.insufficient_coverage === false && ask.web_used === false;
}

export function decideAnswer(ask: AskLike | "unavailable"): AnswerResult {
  const refuse: AnswerResult = { status: "no_sourced_answer", text: NO_SOURCED_ANSWER_TEXT, sourceIds: [], webUsed: false };
  if (ask === "unavailable") return refuse;
  if (!isServable(ask)) return refuse;
  // B2: never an uncited answer. Only INTERNAL node ids are ever carried; web sources never reach a result.
  const sourceIds = ask.sources.internal.map((s) => s.node_id);
  if (sourceIds.length === 0) return refuse;
  return { status: "answered", text: ask.answer ?? "", sourceIds, webUsed: false };
}

const AskLikeSchema = z
  .object({
    answer: z.string().optional(),
    verdict: z.string(),
    insufficient_coverage: z.boolean(),
    web_used: z.boolean(),
    // `text` (optional) is the retrieved KB passage body; a REAL run needs it (U13b), mock mode never reads it.
    sources: z.object({ internal: z.array(z.object({ node_id: z.string(), text: z.string().optional() }).passthrough()), web: z.array(z.unknown()) }),
  })
  .passthrough();

export const ProbeCaseSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  expectServed: z.boolean(),
  ask: z.union([AskLikeSchema, z.literal("unavailable")]),
});
export type ProbeCase = z.infer<typeof ProbeCaseSchema>;

export const ProbeSetSchema = z.object({
  schemaVersion: z.literal(1),
  source: ProvenanceSchema,
  cases: z.array(ProbeCaseSchema),
});
export type ProbeSet = z.infer<typeof ProbeSetSchema>;

export function parseProbeSet(raw: string, label: string): ProbeSet {
  let json: unknown;
  try {
    json = JSON.parse(stripBom(raw));
  } catch (err) {
    throw new Error(`${label}: invalid JSON (${(err as Error).message})`);
  }
  if (typeof json === "object" && json !== null && (json as { schemaVersion?: unknown }).schemaVersion !== 1) {
    throw new Error(`${label}: unsupported schemaVersion ${(json as { schemaVersion?: unknown }).schemaVersion} (expected 1)`);
  }
  const parsed = ProbeSetSchema.safeParse(json);
  if (!parsed.success) throw new Error(`${label}: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  return parsed.data;
}

export type ProbeRule =
  | "web-answer-served"
  | "answered-without-source"
  | "unservable-answered"
  | "refusal-text-not-fixed"
  | "over-refusal";

export interface ProbeViolation {
  id: string;
  rule: ProbeRule;
}

export interface ProbeReport {
  total: number;
  served: number;
  refused: number;
  violations: ProbeViolation[];
  /** >= 30 probes with zero violations: the REAL-model bar ("0 training-data or web answers in 30 probes"). */
  realBarMet: boolean;
  verdict: "PASS" | "FAIL" | "NOT PROVEN";
}

export async function scoreProbes(
  cases: readonly ProbeCase[],
  answer: (c: ProbeCase) => Promise<AnswerResult>,
  /**
   * `source` (U13b, B1): the probe set's provenance. The REAL-model bar is "0 training-data or web answers
   * in 30 REAL probes", so a set whose source is not "recorded" can never reach PASS. Omitted (mock mode) = no cap.
   */
  opts: { source?: ProbeSet["source"] } = {},
): Promise<ProbeReport> {
  const violations: ProbeViolation[] = [];
  let served = 0;
  let refused = 0;
  for (const c of cases) {
    const r = await answer(c);
    const v = (rule: ProbeRule) => violations.push({ id: c.id, rule });
    if (r.status === "answered") {
      served += 1;
      if (r.webUsed) v("web-answer-served");
      if (r.sourceIds.length === 0) v("answered-without-source");
      if (!c.expectServed) v("unservable-answered");
    } else {
      refused += 1;
      if (r.text !== NO_SOURCED_ANSWER_TEXT) v("refusal-text-not-fixed");
      if (c.expectServed) v("over-refusal");
    }
  }
  const total = cases.length;
  const provenanceOk = opts.source === undefined || opts.source === "recorded";
  const realBarMet = violations.length === 0 && total >= PROBE_REAL_BAR && provenanceOk;
  const verdict: ProbeReport["verdict"] = violations.length > 0 ? "FAIL" : realBarMet ? "PASS" : "NOT PROVEN";
  return { total, served, refused, violations, realBarMet, verdict };
}
