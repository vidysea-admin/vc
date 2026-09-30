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
import type { MongoDBSaver } from "@langchain/langgraph-checkpoint-mongodb";
import { COLLECTION_NAMES, VC_DB_NAME, tenantScopedDb, tenantScopedClient, type FactDoc, type EdgeDoc, type ConsentDoc } from "@vc/db";
import { MockProvider, type MockResponse } from "@vc/providers";
import { createFakeDb, createFakeMongoClient, INDEX_PLAN, type FakeCollection, type FakeDb } from "@vc/db/testing";
import { compileScribeGraph, createScribeCheckpointer, SCRIBE_PURPOSE, type ScribeInput } from "../src/scribe/index.js";

const here = fileURLToPath(new URL(".", import.meta.url));
/** The repo's real skills/ directory — the graph loads real SKILL.md bodies (B6). */
export const SKILLS_DIR = "D:/vc/.worktrees/t047-crisis/skills";

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
  const summaryResponse = responses["session-summary"] ?? { summary: DEFAULT_SUMMARY };
  const summary = (input: unknown) => {
    if (typeof summaryResponse === "function") return (summaryResponse as (value: unknown) => unknown)(input);
    const request = input as { task?: string; candidate?: string; approvedContext?: { factId: string }[] };
    if (request.task === "verify-approved-history") return { verdict: "clear", confidence: 1,
      reviewedFactIds: (request.approvedContext ?? []).map((fact) => fact.factId),
      reviewedRanges: [{ start: 0, end: request.candidate?.length ?? 0 }], offendingSpans: [] };
    return structuredClone(summaryResponse);
  };
  return new MockProvider({
    responses: {
      "fact-extraction": { facts: DEFAULT_FACTS },
      "session-summary": { summary: DEFAULT_SUMMARY },
      ...responses,
      "session-summary": summary,
    },
  });
}

export interface Harness {
  graph: ReturnType<typeof compileScribeGraph>;
  provider: MockProvider;
  facts: FakeCollection<FactDoc>;
  edges: FakeCollection<EdgeDoc>;
  consents: FakeCollection<ConsentDoc>;
  /**
   * MemorySaver by default. T-016: `makeHarness({ saver: "mongo" })` gives the REAL LangGraph
   * MongoDBSaver class (createScribeCheckpointer) over the same in-process fake db, so its
   * checkpoints land in the fake's scribe_checkpoints / scribe_checkpoint_writes collections.
   */
  checkpointer: MemorySaver | MongoDBSaver;
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

export function makeHarness(opts: { provider?: MockProvider; consent?: boolean; saver?: "memory" | "mongo"; tenantId?: string } = {}): Harness {
  let db: import("mongodb").Db;
  let fakeDb: FakeDb;
  let checkpointer: MemorySaver | MongoDBSaver;
  if (opts.saver === "mongo") {
    // The saver opens VC_DB_NAME on the client; the graph's deps get the SAME fake Db (B12).
    const fake = createFakeMongoClient();
    checkpointer = createScribeCheckpointer(opts.tenantId ? tenantScopedClient(fake.client, opts.tenantId) : fake.client);
    db = fake.client.db(VC_DB_NAME);
    fakeDb = fake.dbFor(VC_DB_NAME);
  } else {
    ({ db, fakeDb } = createFakeDb());
    checkpointer = new MemorySaver();
  }
  for (const spec of INDEX_PLAN) {
    if (!spec.unique) continue;
    fakeDb
      .collection<{ _id: string }>(spec.collection)
      .declareUniqueIndex(Object.keys(spec.keys), { partialFilterExpression: spec.partialFilterExpression });
  }
  const facts = fakeDb.collection<FactDoc>(COLLECTION_NAMES.facts);
  const edges = fakeDb.collection<EdgeDoc>(COLLECTION_NAMES.edges);
  const consents = fakeDb.collection<ConsentDoc>(COLLECTION_NAMES.consents);
  if (opts.consent !== false) {
    seedConsent(consents, opts.tenantId ? { _id: `${opts.tenantId}:consent-${STUDENT_ID}`, tenantId: opts.tenantId } as Partial<ConsentDoc> : {});
  }
  if (opts.tenantId) db = tenantScopedDb(db, opts.tenantId);

  const provider = opts.provider ?? mockProvider();
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
