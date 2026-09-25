/**
 * Shared offline fixtures for the T-007 scribe graph tests (B8/B13: synthetic
 * transcript text only, in-memory DB, mock provider — nothing touches
 * MONGODB_URL or Gemini).
 *
 * The DB fake is packages/db's own driver-faithful fake (11000 on unique
 * violations, pre-image findOneAndUpdate, partial-filter validation), with the
 * PRODUCTION unique indexes declared from scripts/db-init.ts INDEX_PLAN — the
 * same pattern packages/db/tests/facts.test.ts uses (ISS-t-003b-c1-3), so the
 * scribe's writes are checked against the real index set, never a laxer copy.
 */
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { MemorySaver } from "@langchain/langgraph";
import { COLLECTION_NAMES, type FactDoc, type EdgeDoc, type ConsentDoc } from "@vc/db";
import { MockProvider, type MockResponse } from "@vc/providers";
import { createFakeDb, INDEX_PLAN, type FakeCollection, type FakeDb } from "@vc/db/testing";
import { compileScribeGraph, SCRIBE_PURPOSE, type ScribeInput } from "../src/scribe/index.js";

const here = fileURLToPath(new URL(".", import.meta.url));
/** The repo's real skills/ directory — the graph loads real SKILL.md bodies (B6). */
export const SKILLS_DIR = join(here, "..", "..", "..", "skills");

export const STUDENT_ID = "student-synthetic-1";
export const SESSION_ID = "session-synthetic-1";

export function baseInput(overrides: Partial<ScribeInput> = {}): ScribeInput {
  return {
    sessionId: SESSION_ID,
    studentId: STUDENT_ID,
    sessionEndedAt: "2026-09-25T10:00:00.000Z",
    turns: [
      {
        turnId: "t1",
        speaker: "student",
        lang: "en",
        text: "I want to study computer science in Canada.",
        translatedText: "I want to study computer science in Canada.",
        ts: 1,
      },
      {
        turnId: "t2",
        speaker: "counsellor",
        lang: "en",
        text: "What budget does your family have in mind?",
        translatedText: "What budget does your family have in mind?",
        ts: 2,
      },
      {
        turnId: "t3",
        speaker: "student",
        lang: "en",
        text: "We can manage around 20 lakh rupees a year.",
        translatedText: "We can manage around 20 lakh rupees a year.",
        ts: 3,
      },
    ],
    ...overrides,
  };
}

export function citedCandidate(key: string, value: unknown, quote: string, turnId: string) {
  return {
    key,
    value,
    source: { type: "transcript", quote, turnId },
    confidence: 0.85,
    purposeTags: [SCRIBE_PURPOSE],
    sensitivity: "low",
  };
}

export const DEFAULT_FACTS = [
  citedCandidate("targetCountry", "Canada", "study computer science in Canada", "t1"),
  citedCandidate("budget_inr_per_year", 2000000, "around 20 lakh rupees a year", "t3"),
];

export const DEFAULT_SUMMARY =
  "Student wants to study computer science in Canada; the family budget is around 20 lakh rupees a year.";

export function mockProvider(responses: Record<string, MockResponse> = {}): MockProvider {
  return new MockProvider({
    responses: {
      "fact-extraction": { facts: DEFAULT_FACTS },
      "session-summary": { summary: DEFAULT_SUMMARY },
      ...responses,
    },
  });
}

export interface Harness {
  graph: ReturnType<typeof compileScribeGraph>;
  provider: MockProvider;
  facts: FakeCollection<FactDoc>;
  edges: FakeCollection<EdgeDoc>;
  consents: FakeCollection<ConsentDoc>;
  checkpointer: MemorySaver;
  openFacts: () => FactDoc[];
  /** T-011 / D-015: the Db the graph writes to, and its fake (for erasure-race tests). */
  db: import("mongodb").Db;
  fakeDb: FakeDb;
}

export function seedConsent(consents: FakeCollection<ConsentDoc>, overrides: Partial<ConsentDoc> = {}): void {
  consents.seed({
    _id: `consent-${STUDENT_ID}`,
    studentId: STUDENT_ID,
    guardianConsent: true,
    purposes: [SCRIBE_PURPOSE],
    recordedAt: "2026-09-01T00:00:00.000Z",
    minor: true,
    ...overrides,
  });
}

export function makeHarness(opts: { provider?: MockProvider; consent?: boolean } = {}): Harness {
  const { db, fakeDb } = createFakeDb();
  for (const spec of INDEX_PLAN) {
    if (!spec.unique) continue;
    fakeDb
      .collection<{ _id: string }>(spec.collection)
      .declareUniqueIndex(Object.keys(spec.keys), { partialFilterExpression: spec.partialFilterExpression });
  }
  const facts = fakeDb.collection<FactDoc>(COLLECTION_NAMES.facts);
  const edges = fakeDb.collection<EdgeDoc>(COLLECTION_NAMES.edges);
  const consents = fakeDb.collection<ConsentDoc>(COLLECTION_NAMES.consents);
  if (opts.consent !== false) seedConsent(consents);

  const provider = opts.provider ?? mockProvider();
  const checkpointer = new MemorySaver();
  const graph = compileScribeGraph({ db, provider, skillsDir: SKILLS_DIR }, { checkpointer });
  return {
    graph,
    provider,
    facts,
    edges,
    consents,
    checkpointer,
    openFacts: () => facts.all().filter((f) => f.active === true),
    db,
    fakeDb,
  };
}
