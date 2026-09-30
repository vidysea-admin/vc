/**
 * T-019 (3): E2E with VC_LLM_PROVIDER=rules — the counsellor's core flow (scribe -> facts ->
 * profile diff -> approve) must complete with ZERO AI calls (lead's 2026-09-25 review,
 * qa/feedback-inbox.md: "AI dependence is one thing, Gemini dependence is another").
 *
 * This test builds its OWN harness (not packages/engine/tests/scribe-fixtures.ts, which types its
 * `provider` option as MockProvider only) so it never touches that shared fixture or nodes.ts /
 * schemas.ts — both are a parallel unit's (T-018) working files this session avoids. It runs the
 * REAL scribe graph (compileScribeGraph, unmodified) over the REAL LangGraph MongoDBSaver
 * checkpointer class (createScribeCheckpointer, over @vc/db's in-process fake Mongo client — same
 * pattern packages/engine/tests/scribe-fixtures.ts uses for `saver: "mongo"`), from a synthetic
 * transcript through the approval interrupt, approves, and reads the written facts back from the
 * fake `facts` collection (outcome, not construction — B14).
 *
 * Offline proof (B8/B13): global fetch is stubbed to throw if called at all, so this test FAILS
 * loudly if any code path on the VC_LLM_PROVIDER=rules run ever reaches for the network.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import {
  COLLECTION_NAMES,
  VC_DB_NAME,
  tenantScopedDb, tenantScopedClient,
  type FactDoc,
  type ConsentDoc,
} from "@vc/db";
import { createFakeMongoClient, INDEX_PLAN } from "@vc/db/testing";
import { createProvider, loadProviderConfig } from "@vc/providers";
import { compileScribeGraph, createScribeCheckpointer, startScribe, resumeScribe, SCRIBE_PURPOSE } from "../src/scribe/index.js";

const here = fileURLToPath(new URL(".", import.meta.url));
const SKILLS_DIR = join(here, "..", "..", "..", "skills");

const STUDENT_ID = "student-rules-e2e";
const SESSION_ID = "session-rules-e2e";

/**
 * A synthetic transcript encoding structured intake-form annotations as "key: value" lines — the
 * RulesProvider's documented input contract (packages/providers/src/index.ts, above RulesProvider).
 * No prose for a model to interpret; the rules provider needs none.
 */
function syntheticTurns() {
  return [
    {
      turnId: "t1",
      speaker: "counsellor" as const,
      lang: "en",
      text: "targetCountry: Canada",
      translatedText: "targetCountry: Canada",
      ts: 1,
    },
    {
      turnId: "t2",
      speaker: "counsellor" as const,
      lang: "en",
      text: "budget_inr_per_year: 2000000",
      translatedText: "budget_inr_per_year: 2000000",
      ts: 2,
    },
  ];
}

function buildRulesHarness() {
  const fake = createFakeMongoClient();
  const checkpointer = createScribeCheckpointer(tenantScopedClient(fake.client, "scribe-rules")); // the REAL LangGraph MongoDBSaver class
  const db = tenantScopedDb(fake.client.db(VC_DB_NAME), "scribe-rules");
  const fakeDb = fake.dbFor(VC_DB_NAME);
  for (const spec of INDEX_PLAN) {
    if (!spec.unique) continue;
    fakeDb.collection<{ _id: string }>(spec.collection).declareUniqueIndex(Object.keys(spec.keys), {
      partialFilterExpression: spec.partialFilterExpression,
    });
  }
  const facts = fakeDb.collection<FactDoc>(COLLECTION_NAMES.facts);
  const consents = fakeDb.collection<ConsentDoc>(COLLECTION_NAMES.consents);
  consents.seed({
    _id: `scribe-rules:consent-${STUDENT_ID}`,
    tenantId: "scribe-rules",
    studentId: STUDENT_ID,
    guardianConsent: true,
    purposes: [SCRIBE_PURPOSE],
    recordedAt: "2026-09-01T00:00:00.000Z",
    minor: true,
  } as ConsentDoc);

  // B6/B13: read from an env-like object, never process.env directly; VC_LLM_PROVIDER=rules needs
  // no key, no base URL, no network — this is the whole point of the rules provider.
  const config = loadProviderConfig({ VC_LLM_PROVIDER: "rules" });
  assert.equal(config.provider, "rules");
  const provider = createProvider(config);

  const graph = compileScribeGraph({ db, provider, skillsDir: SKILLS_DIR }, { checkpointer });
  return { graph, facts, db };
}

test("T-019 E2E: VC_LLM_PROVIDER=rules runs the real scribe graph, over the real MongoDBSaver checkpointer, to the approval interrupt, approves, and the written facts read back correctly — with zero network calls", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  // @ts-expect-error -- test-only stub proving the offline claim (B8/B13), not merely asserted.
  globalThis.fetch = async (...args: unknown[]) => {
    fetchCalls += 1;
    throw new Error(`no network call may happen on VC_LLM_PROVIDER=rules; fetch was called with ${JSON.stringify(args[0])}`);
  };

  try {
    const h = buildRulesHarness();
    const threadId = "thread-rules-e2e";

    const paused = await startScribe(
      h.graph,
      { sessionId: SESSION_ID, studentId: STUDENT_ID, sessionEndedAt: "2026-09-25T10:00:00.000Z", turns: syntheticTurns() },
      { threadId },
    );
    assert.equal(paused.kind, "awaiting_approval", "the graph must reach the counsellor approval interrupt with no AI call");
    if (paused.kind !== "awaiting_approval") return;
    assert.deepEqual(
      paused.request.diff.changes.map((c) => c.key).sort(),
      ["budget_inr_per_year", "targetCountry"],
    );
    assert.match(paused.request.summary, /targetCountry = Canada \(turn t1\)/, "the deterministic summary cites the fact and its turn");

    // Nothing written before approval (B3), even with the rules provider.
    assert.equal(h.facts.size(), 0);

    const outcome = await resumeScribe(h.graph, { action: "approve" }, { threadId });
    assert.equal(outcome.kind, "done");
    if (outcome.kind !== "done") return;
    assert.equal(outcome.result.status, "written");

    // Read back the written facts from the fake `facts` collection — outcome, not construction.
    const open = h.facts.all().filter((f) => f.active === true);
    assert.equal(open.length, 2);
    const byKey = new Map(open.map((f) => [f.key, f]));
    assert.equal(byKey.get("targetCountry")?.value, "Canada");
    assert.equal(byKey.get("budget_inr_per_year")?.value, 2000000, "the rules provider coerced the numeric-looking value");
    for (const fact of open) {
      assert.equal(fact.studentId, STUDENT_ID);
      assert.equal(fact.source.type, "transcript");
      assert.ok(fact.purposeTags.includes(SCRIBE_PURPOSE));
    }

    assert.equal(fetchCalls, 0, "the full P1 flow — scribe -> facts -> profile diff -> approve — used zero network calls");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
