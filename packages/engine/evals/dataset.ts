/** T-009: loads and validates qa/evals/scribe/sessions.jsonl (one GoldSession per line). */
import { readFileSync } from "node:fs";
import { z } from "zod";
import { GoldSessionSchema, type GoldSession } from "./types.js";

export function parseDataset(raw: string, sourceLabel: string): GoldSession[] {
  const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
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

export function parseGoldenSet(raw: string, sourceLabel: string): GoldenQuestion[] {
  const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const questions: GoldenQuestion[] = [];
  const seen = new Set<string>();
  for (const [i, line] of lines.entries()) {
    let json: unknown;
    try {
      json = JSON.parse(line);
    } catch (err) {
      throw new Error(`${sourceLabel}:${i + 1}: invalid JSON (${(err as Error).message})`);
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
  return questions;
}

export function loadGoldenSet(path: string): GoldenQuestion[] {
  return parseGoldenSet(readFileSync(path, "utf-8"), path);
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
  source: z.enum(["synthetic", "recorded"]),
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
    json = JSON.parse(raw);
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
