/**
 * T-010: shared offline fixtures for the live-cards tests (B13: synthetic text only; the in-memory
 * @vc/db fake with the production unique indexes; MockProvider; a fake KnowledgeBase asker — no
 * network, no real LLM, no real KB).
 */
import { COLLECTION_NAMES, tenantScopedDb, type ConsentDoc, type FactDoc } from "@vc/db";
import { createFakeDb, INDEX_PLAN, type FakeDb } from "@vc/db/testing";
import { MockProvider, type MockResponse } from "@vc/providers";
import type { Db } from "mongodb";
import { SCRIBE_PURPOSE, type ScribeTurn } from "../src/scribe/schemas.js";
import type { KnowledgeAsker, LiveCardsDeps } from "../src/cards/index.js";
import { SKILLS_DIR } from "./scribe-fixtures.js";

export { SKILLS_DIR };
export const STUDENT_ID = "student-cards-1";
export const SESSION_ID = "session-cards-1";
/** A fixed clock (2026-09-27) so the B18 two-year horizon is deterministic. */
export const NOW = () => new Date("2026-09-27T10:00:00.000Z");

export function turn(turnId: string, speaker: "student" | "counsellor", text: string, ts = 1): ScribeTurn {
  return { turnId, speaker, lang: "en", text, translatedText: text, ts };
}

/** The default live window: a UK-bound CS student with a 20 lakh budget. */
export const UK_TURNS: ScribeTurn[] = [
  turn("t1", "student", "I want to study computer science in the UK.", 1),
  turn("t2", "counsellor", "What made the UK your first choice?", 2),
  turn("t3", "student", "We can manage around 20 lakh rupees a year.", 3),
];

export function factDoc(id: string, key: string, value: unknown, overrides: Partial<FactDoc> = {}): FactDoc {
  return {
    _id: id,
    studentId: STUDENT_ID,
    key,
    value,
    source: { type: "transcript", quote: "synthetic", turnId: "prior-t1" },
    confidence: 0.9,
    validFrom: "2026-09-01T00:00:00.000Z",
    purposeTags: [SCRIBE_PURPOSE],
    sensitivity: "low",
    active: true,
    ...overrides,
  } as FactDoc;
}

export const UK_FACTS: FactDoc[] = [
  factDoc("f-dest", "targetCountry", "UK"),
  factDoc("f-budget", "budget_inr_per_year", 2000000),
  factDoc("f-course", "intended_major", "computer science"),
];

export const KB_OK = {
  status: "ok" as const,
  answer: "Synthetic: published tuition for UK computer science programmes.",
  citations: { internal: [{ node_id: "kb-node-1" }], web: [{ url: "https://example.edu/fees", title: "Fees" }] },
};

export class FakeKb implements KnowledgeAsker {
  readonly queries: string[] = [];
  constructor(private readonly reply: Awaited<ReturnType<KnowledgeAsker["ask"]>> | Error = KB_OK) {}
  async ask(query: string) {
    this.queries.push(query);
    if (this.reply instanceof Error) throw this.reply;
    return this.reply;
  }
}

export interface CardsHarness {
  db: Db;
  fakeDb: FakeDb;
  provider: MockProvider;
  kb: FakeKb;
  deps: LiveCardsDeps;
}

export function makeCardsHarness(
  opts: {
    planner?: MockResponse;
    verifier?: MockResponse;
    facts?: FactDoc[];
    consent?: boolean;
    kb?: FakeKb | null;
    provider?: LiveCardsDeps["provider"];
    semanticVerifier?: boolean;
  } = {},
): CardsHarness {
  const { db: rawDb, fakeDb } = createFakeDb();
  const db = tenantScopedDb(rawDb, "cards-test");
  for (const spec of INDEX_PLAN) {
    if (!spec.unique) continue;
    fakeDb
      .collection<{ _id: string }>(spec.collection)
      .declareUniqueIndex(Object.keys(spec.keys), { partialFilterExpression: spec.partialFilterExpression });
  }
  if (opts.consent !== false) {
    fakeDb.collection<ConsentDoc>(COLLECTION_NAMES.consents).seed({
      _id: `cards-test:consent-${STUDENT_ID}`,
      tenantId: "cards-test",
      studentId: STUDENT_ID,
      guardianConsent: true,
      purposes: [SCRIBE_PURPOSE],
      recordedAt: "2026-09-01T00:00:00.000Z",
      minor: true,
    });
  }
  const facts = fakeDb.collection<FactDoc>(COLLECTION_NAMES.facts);
  for (const f of opts.facts ?? UK_FACTS) facts.seed({ ...f, _id: `cards-test:${f._id}`, tenantId: "cards-test" } as FactDoc);
  const responses: Record<string, MockResponse> = { "exploration-planner": opts.planner ?? { cards: [] } };
  responses.verifier = opts.verifier ?? ((input: unknown) => ({ decisions: (input as { cards: { id: string }[] }).cards.map(card => ({ cardId: card.id, noScript: "clear", citation: "clear", confidence: 1, offendingSpans: [] })) }));
  const provider = new MockProvider({ responses });
  const kb = opts.kb === null ? undefined : (opts.kb ?? new FakeKb());
  return {
    db,
    fakeDb,
    provider,
    kb: kb ?? new FakeKb(),
    deps: {
      db,
      provider: opts.provider ?? provider,
      skillsDir: SKILLS_DIR,
      ...(kb ? { kb } : {}),
      semanticVerifier: opts.semanticVerifier ?? false,
      now: NOW,
    },
  };
}

export function liveInput(overrides: { turns?: ScribeTurn[]; quiet?: boolean } = {}) {
  return { sessionId: SESSION_ID, studentId: STUDENT_ID, turns: overrides.turns ?? UK_TURNS, quiet: overrides.quiet ?? false };
}

/** Good planner cards for the UK fixture: each cited, each a question/comparison/evidence. */
export const GOOD_CARDS = [
  {
    type: "widen",
    prompt: "Besides the UK, has the student looked at countries where public universities charge little tuition?",
    sources: [{ type: "profile", id: "f-dest" }],
    confidence: 0.7,
  },
  {
    type: "clarify",
    prompt: "Is the 20 lakh budget per year or for the whole course?",
    sources: [{ type: "profile", id: "f-budget" }],
    confidence: 0.6,
  },
  {
    type: "evidence",
    prompt: "Published tuition for UK computer science programmes is on the cited fee page.",
    sources: [{ type: "kb", id: "https://example.edu/fees" }],
    confidence: 0.9,
  },
  {
    type: "compare",
    prompt: "Compare the 20 lakh yearly budget with the published UK tuition.",
    sources: [
      { type: "profile", id: "f-budget" },
      { type: "kb", id: "kb-node-1" },
    ],
    confidence: 0.5,
  },
];
