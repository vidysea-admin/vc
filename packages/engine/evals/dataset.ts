/** T-009: loads and validates qa/evals/scribe/sessions.jsonl (one GoldSession per line). */
import { readFileSync } from "node:fs";
import { z } from "zod";
import { GoldSessionSchema, type GoldSession } from "./types.js";

/**
 * ISS-330: a Windows editor saves JSON/JSONL with a leading UTF-8 BOM, and readFileSync("utf-8") keeps it as U+FEFF,
 * which JSON.parse refuses (and which hid the golden provenance header). The one shared helper: every eval input
 * parser strips exactly one leading BOM from the file text before it splits lines or JSON-parses.
 */
export function stripBom(raw: string): string {
  return raw.replace(/^\uFEFF/, "");
}

export function parseDataset(raw: string, sourceLabel: string): GoldSession[] {
  const lines = stripBom(raw).split(/\r?\n/).filter((line) => line.trim().length > 0);
  const sessions: GoldSession[] = [];
  const seenIds = new Set<string>();
  for (const [i, line] of lines.entries()) {
    let json: unknown;
    try {
      json = JSON.parse(line);
    } catch (err) {
      throw new Error(`${sourceLabel}:${i + 1}: invalid JSON (${(err as Error).message})`);
    }
    const parsed = GoldSessionSchema.safeParse(json);
    if (!parsed.success) {
      throw new Error(`${sourceLabel}:${i + 1}: ${parsed.error.issues.map((iss) => `${iss.path.join(".")}: ${iss.message}`).join("; ")}`);
    }
    if (seenIds.has(parsed.data.id)) {
      throw new Error(`${sourceLabel}:${i + 1}: duplicate session id "${parsed.data.id}"`);
    }
    seenIds.add(parsed.data.id);
    sessions.push(parsed.data);
  }
  if (sessions.length === 0) {
    throw new Error(`${sourceLabel}: no sessions found`);
  }
  return sessions;
}

export function loadDataset(path: string): GoldSession[] {
  const raw = readFileSync(path, "utf-8");
  return parseDataset(raw, path);
}

// ---------------------------------------------------------------------------
// P1 U4 (A2a): golden question set + frozen KnowledgeBase fixture.
// Shapes mirror the KB `/search` hit `{turnId, sessionId, score, turn, session}` (spec scope item 4,
// plan section 1). U3 replaces the synthetic samples with anonymised real question logs and recorded
// KB responses; the schemas stay.
// ---------------------------------------------------------------------------

/**
 * The one provenance vocabulary of every eval input (golden header, KB fixture, probe set, experts file).
 * Exactly "synthetic" or "recorded": a mixed-case or unknown value is a clear refusal, never a raw schema dump (ISS-297).
 */
export const PROVENANCE_VALUES = ["synthetic", "recorded"] as const;
export type Provenance = (typeof PROVENANCE_VALUES)[number];
export const ProvenanceSchema = z.enum(PROVENANCE_VALUES, {
  errorMap: (_issue, ctx) => ({ message: `source must be exactly "synthetic" or "recorded" (got ${JSON.stringify(ctx.data)}); refusing` }),
});

export const GoldenQuestionSchema = z
  .object({
    id: z.string().min(1),
    lang: z.enum(["en", "hi", "hinglish"]),
    country: z.string().min(1),
    theme: z.string().min(1),
    question: z.string().min(1),
    /** Hit@k counts the question as found when any top-k hit has one of these turn ids ... */
    expectedTurnIds: z.array(z.string().min(1)).default([]),
    /** ... or belongs to one of these sessions. */
    expectedSessionIds: z.array(z.string().min(1)).default([]),
  })
  .refine((q) => q.expectedTurnIds.length + q.expectedSessionIds.length > 0, {
    message: "a golden question must name at least one expected turn or session",
    path: ["expectedTurnIds"],
  });
export type GoldenQuestion = z.infer<typeof GoldenQuestionSchema>;

/** A golden file may open with ONE provenance header line `{"source": "synthetic"|"recorded"}` (no `id`); it is not a question. */
export interface GoldenFile {
  /** Declared by the header line; undefined when the file has no header. */
  source: Provenance | undefined;
  questions: GoldenQuestion[];
}

export function parseGoldenFile(raw: string, sourceLabel: string): GoldenFile {
  const lines = stripBom(raw).split(/\r?\n/).filter((line) => line.trim().length > 0);
  const questions: GoldenQuestion[] = [];
  const seen = new Set<string>();
  let source: Provenance | undefined;
  for (const [i, line] of lines.entries()) {
    let json: unknown;
    try {
      json = JSON.parse(line);
    } catch (err) {
      throw new Error(`${sourceLabel}:${i + 1}: invalid JSON (${(err as Error).message})`);
    }
    if (i === 0 && typeof json === "object" && json !== null && !Array.isArray(json) && "source" in json && !("id" in json)) {
      const header = ProvenanceSchema.safeParse((json as { source: unknown }).source);
      if (!header.success) throw new Error(`${sourceLabel}:1: ${header.error.issues.map((iss) => iss.message).join("; ")}`);
      source = header.data;
      continue;
    }
    const parsed = GoldenQuestionSchema.safeParse(json);
    if (!parsed.success) {
      throw new Error(`${sourceLabel}:${i + 1}: ${parsed.error.issues.map((iss) => `${iss.path.join(".")}: ${iss.message}`).join("; ")}`);
    }
    if (seen.has(parsed.data.id)) throw new Error(`${sourceLabel}:${i + 1}: duplicate question id "${parsed.data.id}"`);
    seen.add(parsed.data.id);
    questions.push(parsed.data);
  }
  if (questions.length === 0) throw new Error(`${sourceLabel}: no questions found`);
  return { source, questions };
}

export function parseGoldenSet(raw: string, sourceLabel: string): GoldenQuestion[] {
  return parseGoldenFile(raw, sourceLabel).questions;
}

export function loadGoldenFile(path: string): GoldenFile {
  return parseGoldenFile(readFileSync(path, "utf-8"), path);
}

export function loadGoldenSet(path: string): GoldenQuestion[] {
  return loadGoldenFile(path).questions;
}

export const KbHitSchema = z
  .object({
    turnId: z.string().min(1),
    sessionId: z.string().min(1),
    score: z.number(),
    turn: z.object({ text: z.string() }).passthrough(),
    session: z.record(z.unknown()).default({}),
  })
  .passthrough();
export type KbHit = z.infer<typeof KbHitSchema>;

export const KbFixtureSchema = z.object({
  schemaVersion: z.literal(1),
  /** "synthetic" fixtures prove plumbing only; "recorded" ones are real, read-only KB API captures (U2/U3). */
  source: ProvenanceSchema,
  recordedAt: z.string(),
  search: z.array(z.object({ query: z.string(), hits: z.array(KbHitSchema) })),
  ask: z.array(z.object({ query: z.string(), response: z.record(z.unknown()) })).default([]),
  sessions: z
    .record(
      z.object({ date: z.string().optional(), sourceId: z.string().optional(), turns: z.array(z.object({ turnId: z.string(), text: z.string() })) }),
    )
    .default({}),
});
export type KbFixture = z.infer<typeof KbFixtureSchema>;

export function parseKbFixture(raw: string, sourceLabel: string): KbFixture {
  let json: unknown;
  try {
    json = JSON.parse(stripBom(raw));
  } catch (err) {
    throw new Error(`${sourceLabel}: invalid JSON (${(err as Error).message})`);
  }
  if (typeof json === "object" && json !== null && (json as { schemaVersion?: unknown }).schemaVersion !== 1) {
    throw new Error(`${sourceLabel}: unsupported schemaVersion ${(json as { schemaVersion?: unknown }).schemaVersion} (expected 1)`);
  }
  const parsed = KbFixtureSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(`${sourceLabel}: ${parsed.error.issues.map((iss) => `${iss.path.join(".")}: ${iss.message}`).join("; ")}`);
  }
  return parsed.data;
}

export function loadKbFixture(path: string): KbFixture {
  return parseKbFixture(readFileSync(path, "utf-8"), path);
}

/** Frozen-fixture lookup: the recorded hits for an exact (trimmed) query, or undefined if never recorded. */
export function fixtureSearch(fixture: KbFixture, query: string): KbHit[] | undefined {
  const wanted = query.trim();
  return fixture.search.find((entry) => entry.query.trim() === wanted)?.hits;
}
