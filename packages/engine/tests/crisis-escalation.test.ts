/**
 * T-012 outcome tests for crisis escalation (contract B16, D-020, gates crisis-guard-precision and
 * crisis-safety-layers). Every assertion reads the stored records back from the in-memory fake,
 * through a tenant-scoped Db (T-025) — outcome, not construction. Synthetic text only (B13); no
 * network, no real model: the classifier is a MockProvider or a hand-rolled fake.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { MemorySaver } from "@langchain/langgraph";
import { COLLECTION_NAMES, TenantScopeError, tenantScopedDb } from "@vc/db";
import { createFakeDb, INDEX_PLAN, type FakeDb } from "@vc/db/testing";
import { MockProvider, type GenerateRequest, type LlmProvider } from "@vc/providers";
import {
  CONCERN_CLASSIFIER_SKILL,
  CRISIS_FLAG_REVIEWS_COLLECTION,
  ESCALATION_NOTIFICATIONS_COLLECTION,
  LIKELY_BENIGN_LABEL,
  acknowledgeEscalation,
  escalateTurns,
  loadSkill,
  readEscalations,
  readFlagReviews,
  type EscalationAlert,
  type EscalationDeps,
  type EscalationNotificationDoc,
  type EscalationTurn,
  type ReviewRunResult,
} from "../src/index.js";
import { compileScribeGraph, SCRIBE_PURPOSE, startScribe } from "../src/scribe/index.js";
import { baseInput, mockProvider, SKILLS_DIR } from "./scribe-fixtures.js";

type Db = import("mongodb").Db;
type AnyDoc = { _id: string } & Record<string, unknown>;

const TENANT = "tenant-a";
const SESSION = "session-esc-1";
const STUDENT = "student-esc-1";
const AT = "2026-09-27T10:00:00.000Z";

const CRISIS_TEXT = "I just want to kill myself, nothing matters anymore.";
/** Golden-set accepted_residual row: an exam idiom the recall-only guard flags as crisis. */
const IDIOM_CRISIS_TEXT = "Mar jaunga padhai se, itna syllabus hai.";
const CONCERN_TEXT = "Honestly, so much pressure I can't cope, everything feels like too much right now.";
/** Held-out row the keyword guard misses (qa/evals/crisis-eval-heldout.jsonl). */
const MISSED_CRISIS_TEXT = "I wrote letters to my parents in case I'm not here next week.";

function turn(turnId: string, text: string, speaker = "student"): EscalationTurn {
  return { turnId, speaker, lang: "en", text, translatedText: text };
}

class HangingProvider implements LlmProvider {
  readonly kind = "mock" as const;
  readonly model = "flash-lite";
  calls = 0;
  generate<T>(_r: GenerateRequest<T>): Promise<T> {
    this.calls++;
    return new Promise<T>(() => {});
  }
}

class ThrowingProvider implements LlmProvider {
  readonly kind = "mock" as const;
  readonly model = "flash-lite";
  calls = 0;
  async generate<T>(_r: GenerateRequest<T>): Promise<T> {
    this.calls++;
    const err = new Error("gateway down");
    err.name = "LiteLlmNetworkError";
    throw err;
  }
}

function classifierSays(answer: { severity: string; likelyBenign: boolean; rationale?: string }): MockProvider {
  return new MockProvider({ model: "flash-lite", responses: { [CONCERN_CLASSIFIER_SKILL]: { rationale: "synthetic review", ...answer } } });
}

interface World {
  fakeDb: FakeDb;
  raw: Db;
  db: Db;
  deps: EscalationDeps;
  reviews: Promise<ReviewRunResult>[];
  alerts: EscalationAlert[];
}

function world(opts: {
  provider?: LlmProvider;
  rates?: { latin: number; devanagari: number; other: number };
  recipients?: EscalationDeps["recipients"];
  timeoutMs?: number;
  tenant?: string;
} = {}): World {
  const { fakeDb, db: raw } = createFakeDb();
  const reviews: Promise<ReviewRunResult>[] = [];
  const alerts: EscalationAlert[] = [];
  const deps: EscalationDeps = {
    recipients: opts.recipients ?? (async () => ({ adminIds: ["admin-1"], counsellorIds: ["counsellor-7", "counsellor-9"] })),
    classifier: {
      provider: opts.provider ?? classifierSays({ severity: "low", likelyBenign: false }),
      skillPrompt: loadSkill(SKILLS_DIR, CONCERN_CLASSIFIER_SKILL),
      config: { model: "flash-lite", timeoutMs: opts.timeoutMs ?? 50, sampleRates: opts.rates ?? { latin: 0, devanagari: 0, other: 0 } },
    },
    now: () => new Date(AT),
    onReview: (p) => reviews.push(p),
    alert: (a) => alerts.push(a),
  };
  return { fakeDb, raw, db: tenantScopedDb(raw, opts.tenant ?? TENANT), deps, reviews, alerts };
}

function rawNotifications(w: World): AnyDoc[] {
  return w.fakeDb.collection<AnyDoc>(ESCALATION_NOTIFICATIONS_COLLECTION).all();
}

function input(turns: EscalationTurn[]) {
  return { sessionId: SESSION, studentId: STUDENT, turns };
}

// ---------------------------------------------------------------------------
// crisis: admin + counsellors, same moment, independent of the classifier
// ---------------------------------------------------------------------------

test("T-012 E1: a guard crisis notifies the admin AND every concerned counsellor at the same moment, before the classifier answers", async () => {
  const hanging = new HangingProvider();
  const w = world({ provider: hanging, timeoutMs: 300 });
  const res = await escalateTurns(w.db, input([turn("t1", "I want to study in Canada."), turn("t2", CRISIS_TEXT)]), w.deps);
  let reviewSettled = false;
  void res.review.then(() => {
    reviewSettled = true;
  });

  // escalateTurns returned while the classifier is still hung: the notifications are already stored.
  const stored = await readEscalations(w.db, { sessionId: SESSION });
  assert.equal(reviewSettled, false, "the review was still pending when the notifications were already readable");
  assert.deepEqual(
    stored.map((n) => [n.recipient.role, n.recipient.id]).sort(),
    [
      ["admin", "admin-1"],
      ["counsellor", "counsellor-7"],
      ["counsellor", "counsellor-9"],
    ],
  );
  assert.equal(res.immediate.length, 3);
  assert.equal(new Set(stored.map((n) => n.notifiedAt)).size, 1, "one notifiedAt instant for every recipient");
  assert.equal(new Set(stored.map((n) => n.escalationId)).size, 1);
  for (const n of stored) {
    assert.equal(n.turnId, "t2");
    assert.equal(n.guardLevel, "crisis");
    assert.equal(n.reason, "guard_crisis");
    assert.equal(n.severity, "critical");
    assert.equal(n.channel, "record_only");
    assert.equal(n.status, "queued");
    assert.equal(n.acknowledgedAt, null);
    assert.ok(n.matched.length > 0);
  }
  // Stored under the tenant, with no transcript text in the record.
  for (const doc of rawNotifications(w)) {
    assert.equal(doc.tenantId, TENANT);
    assert.ok(String(doc._id).startsWith(`${TENANT}:`));
    // (the matched pattern SOURCES may contain keywords; the student's own sentence must not appear)
    assert.doesNotMatch(JSON.stringify(doc), /I just want|nothing matters/);
  }
  assert.equal(hanging.calls, 1, "the classifier WAS started (in the background) on the flagged turn");
  const settled = await res.review;
  assert.equal(settled.reviewed[0]!.annotation.status, "unavailable");
  assert.equal((await readEscalations(w.db, { sessionId: SESSION })).length, 3, "the timeout added nothing and removed nothing");
});

test("T-012 E1b: a classifier that times out changes nothing about the crisis escalation (fail-open)", async () => {
  const w = world({ provider: new HangingProvider(), timeoutMs: 20 });
  await escalateTurns(w.db, input([turn("t2", CRISIS_TEXT)]), w.deps);
  const settled = await w.reviews[0]!;
  assert.equal(settled.reviewed[0]!.annotation.status, "unavailable");
  assert.equal(settled.reviewed[0]!.annotation.status === "unavailable" && settled.reviewed[0]!.annotation.reason, "timeout");
  assert.equal((await readEscalations(w.db, { sessionId: SESSION })).length, 3);
  const [view] = await readFlagReviews(w.db, { sessionId: SESSION });
  assert.equal(view!.guardLevel, "crisis");
  assert.equal(view!.visible, true);
});

// ---------------------------------------------------------------------------
// downgrade, never hide
// ---------------------------------------------------------------------------

test("T-012 E2: the classifier says 'likely benign, none' on a guard-crisis idiom — the flag still shows and still notifies", async () => {
  const w = world({ provider: classifierSays({ severity: "none", likelyBenign: true, rationale: "exam-workload idiom" }) });
  await escalateTurns(w.db, input([turn("t5", IDIOM_CRISIS_TEXT)]), w.deps);
  const settled = await w.reviews[0]!;
  assert.equal(settled.reviewed[0]!.annotation.status, "classified");

  const [view] = await readFlagReviews(w.db, { sessionId: SESSION });
  assert.equal(view!.visible, true, "B16: a guard flag is never hidden");
  assert.equal(view!.guardLevel, "crisis", "B16: the guard level is never downgraded");
  assert.ok(view!.guardMatched.length > 0);
  assert.equal(view!.effectiveSeverity, "critical");
  assert.equal(view!.annotation, LIKELY_BENIGN_LABEL, "the downgrade is an annotation next to the flag");

  const stored = await readEscalations(w.db, { sessionId: SESSION });
  assert.equal(stored.length, 3, "the admin and both counsellors were still notified");
  assert.ok(stored.every((n) => n.guardLevel === "crisis" && n.reason === "guard_crisis"));

  // The stored guard fields are the guard's, byte for byte, after the review wrote its annotation.
  const rawReview = w.fakeDb.collection<AnyDoc>(CRISIS_FLAG_REVIEWS_COLLECTION).all()[0]!;
  assert.deepEqual((rawReview.guard as { level: string }).level, "crisis");
  assert.equal((rawReview.classifier as { likelyBenign: boolean }).likelyBenign, true);
});

// ---------------------------------------------------------------------------
// concern: fail-open, raise, or stay quiet
// ---------------------------------------------------------------------------

test("T-012 E3: a classifier OUTAGE on a guard concern still escalates, on the flag alone", async () => {
  const provider = new ThrowingProvider();
  const w = world({ provider });
  const res = await escalateTurns(w.db, input([turn("t4", CONCERN_TEXT)]), w.deps);
  assert.equal(res.immediate.length, 0, "a concern is not escalated before review");
  const settled = await w.reviews[0]!;
  assert.equal(provider.calls, 1);
  assert.equal(settled.escalated.length, 3);
  const stored = await readEscalations(w.db, { sessionId: SESSION });
  assert.equal(stored.length, 3);
  assert.ok(stored.every((n) => n.reason === "classifier_unavailable" && n.guardLevel === "concern" && n.severity === "moderate"));
  assert.deepEqual([...new Set(stored.map((n) => n.recipient.role))].sort(), ["admin", "counsellor"]);
});

test("T-012 E3b: a classifier TIMEOUT on a guard concern still escalates", async () => {
  const w = world({ provider: new HangingProvider(), timeoutMs: 20 });
  await escalateTurns(w.db, input([turn("t4", CONCERN_TEXT)]), w.deps);
  await w.reviews[0]!;
  const stored = await readEscalations(w.db, { sessionId: SESSION });
  assert.equal(stored.length, 3);
  assert.ok(stored.every((n) => n.reason === "classifier_unavailable"));
});

test("T-012 E4: a guard concern the classifier rates low is NOT escalated (still visible); rated critical, it is", async () => {
  const low = world({ provider: classifierSays({ severity: "low", likelyBenign: false }) });
  await escalateTurns(low.db, input([turn("t4", CONCERN_TEXT)]), low.deps);
  await low.reviews[0]!;
  assert.equal((await readEscalations(low.db, { sessionId: SESSION })).length, 0);
  const [view] = await readFlagReviews(low.db, { sessionId: SESSION });
  assert.equal(view!.visible, true);
  assert.equal(view!.guardLevel, "concern");

  const high = world({ provider: classifierSays({ severity: "critical", likelyBenign: false }) });
  await escalateTurns(high.db, input([turn("t4", CONCERN_TEXT)]), high.deps);
  await high.reviews[0]!;
  const stored = await readEscalations(high.db, { sessionId: SESSION });
  assert.equal(stored.length, 3);
  assert.ok(stored.every((n) => n.reason === "classifier_severity" && n.severity === "critical"));
});

test("T-012 E5: a SAMPLED unflagged turn the guard missed is escalated when the classifier rates it critical; rate 0 never calls it", async () => {
  const provider = classifierSays({ severity: "critical", likelyBenign: false });
  const w = world({ provider, rates: { latin: 1, devanagari: 1, other: 1 } });
  const res = await escalateTurns(w.db, input([turn("t1", MISSED_CRISIS_TEXT), turn("t2", "What are your plans?", "counsellor")]), w.deps);
  assert.deepEqual(res.selected.map((s) => [s.turnId, s.selection, s.guard.level]), [["t1", "stratified_sample", "none"]]);
  await w.reviews[0]!;
  const stored = await readEscalations(w.db, { sessionId: SESSION });
  assert.equal(stored.length, 3);
  assert.ok(stored.every((n) => n.turnId === "t1" && n.guardLevel === "none" && n.reason === "classifier_severity"));

  const quiet = classifierSays({ severity: "critical", likelyBenign: false });
  const w0 = world({ provider: quiet, rates: { latin: 0, devanagari: 0, other: 0 } });
  const res0 = await escalateTurns(w0.db, input([turn("t1", MISSED_CRISIS_TEXT)]), w0.deps);
  await w0.reviews[0]!;
  assert.equal(res0.selected.length, 0);
  assert.equal(quiet.calls.length, 0);
  assert.equal((await readEscalations(w0.db, { sessionId: SESSION })).length, 0);
});

// ---------------------------------------------------------------------------
// routing, idempotence, SLA timestamps, tenancy
// ---------------------------------------------------------------------------

test("T-012 E6: a resolver failure never drops an escalation — unrouted records are written and an alert fires", async () => {
  const w = world({ recipients: async () => { throw new TypeError("directory down"); } });
  await escalateTurns(w.db, input([turn("t2", CRISIS_TEXT)]), w.deps);
  const stored = await readEscalations(w.db, { sessionId: SESSION });
  assert.deepEqual(stored.map((n) => [n.recipient.role, n.recipient.id]).sort(), [["unrouted", "admin"], ["unrouted", "counsellor"]]);
  assert.deepEqual(w.alerts, [{ event: "escalation_unrouted", escalationId: `${SESSION}:t2`, sessionId: SESSION, errorName: "TypeError" }]);

  const noAdmin = world({ recipients: async () => ({ adminIds: [], counsellorIds: ["counsellor-7"] }) });
  await escalateTurns(noAdmin.db, input([turn("t2", CRISIS_TEXT)]), noAdmin.deps);
  assert.deepEqual(
    (await readEscalations(noAdmin.db, { sessionId: SESSION })).map((n) => [n.recipient.role, n.recipient.id]).sort(),
    [["counsellor", "counsellor-7"], ["unrouted", "admin"]],
  );
  assert.equal(noAdmin.alerts.length, 1);
});

test("T-012 E7: a replay writes no duplicate notification and keeps the first notifiedAt", async () => {
  const w = world();
  await escalateTurns(w.db, input([turn("t2", CRISIS_TEXT)]), w.deps);
  const first = await readEscalations(w.db, { sessionId: SESSION });
  await escalateTurns(w.db, input([turn("t2", CRISIS_TEXT)]), { ...w.deps, now: () => new Date("2026-09-27T11:00:00.000Z") });
  const second = await readEscalations(w.db, { sessionId: SESSION });
  assert.deepEqual(second, first);
});

test("T-012 E8 (SLA parked): flaggedAt/notifiedAt are recorded; acknowledgement is recorded once, for measurement only", async () => {
  const w = world();
  await escalateTurns(w.db, input([turn("t2", CRISIS_TEXT)]), w.deps);
  const [n] = await readEscalations(w.db, { sessionId: SESSION, recipientId: "admin-1" });
  assert.equal(n!.flaggedAt, AT);
  assert.equal(n!.notifiedAt, AT);
  const ackAt = () => new Date("2026-09-27T10:07:00.000Z");
  assert.equal(await acknowledgeEscalation(w.db, { notificationId: n!._id, acknowledgedBy: "admin-1", now: ackAt }), true);
  assert.equal(await acknowledgeEscalation(w.db, { notificationId: n!._id, acknowledgedBy: "admin-2", now: ackAt }), false);
  const [after] = await readEscalations(w.db, { sessionId: SESSION, recipientId: "admin-1" });
  assert.equal(after!.acknowledgedAt, "2026-09-27T10:07:00.000Z");
  assert.equal(after!.acknowledgedBy, "admin-1");
  const others = (await readEscalations(w.db, { sessionId: SESSION })).filter((x) => x._id !== n!._id);
  assert.ok(others.every((x) => x.acknowledgedAt === null), "one recipient's acknowledgement does not close the others'");
});

test("T-012 E9: tenancy — an unscoped Db is refused, and another tenant never sees the records", async () => {
  const w = world();
  await assert.rejects(escalateTurns(w.raw, input([turn("t2", CRISIS_TEXT)]), w.deps), TenantScopeError);
  await assert.rejects(readEscalations(w.raw, { sessionId: SESSION }), TenantScopeError);
  await escalateTurns(w.db, input([turn("t2", CRISIS_TEXT)]), w.deps);
  const other = tenantScopedDb(w.raw, "tenant-b");
  assert.deepEqual(await readEscalations(other, { sessionId: SESSION }), []);
  assert.deepEqual(await readFlagReviews(other, { sessionId: SESSION }), []);
});

test("T-012 E10: the collection names used at the call sites are the exported constants (and not T-029's email_outbox)", () => {
  const src = readFileSync(fileURLToPath(new URL("../src/guards/escalation.ts", import.meta.url)), "utf8");
  const used = [...src.matchAll(/\.collection<[^>]*>\("([^"]+)"\)/g)].map((m) => m[1]).sort();
  assert.deepEqual(used, [CRISIS_FLAG_REVIEWS_COLLECTION, ESCALATION_NOTIFICATIONS_COLLECTION].sort());
  assert.ok(!used.includes("email_outbox"));
  assert.ok(!(Object.values(COLLECTION_NAMES) as string[]).includes(ESCALATION_NOTIFICATIONS_COLLECTION), "own collection, not a shared one");
});

// ---------------------------------------------------------------------------
// scribe integration (startScribe): crisis before any provider call; concern still continues
// ---------------------------------------------------------------------------

async function scribeWorld(opts: { provider?: LlmProvider; consent?: boolean } = {}) {
  const w = world({ provider: opts.provider });
  for (const spec of INDEX_PLAN) {
    if (!spec.unique) continue;
    w.fakeDb.collection<{ _id: string }>(spec.collection).declareUniqueIndex(Object.keys(spec.keys), {
      partialFilterExpression: spec.partialFilterExpression,
    });
  }
  if (opts.consent !== false) {
    await w.db.collection(COLLECTION_NAMES.consents).insertOne({
      _id: `consent-${STUDENT}`,
      studentId: STUDENT,
      guardianConsent: true,
      purposes: [SCRIBE_PURPOSE],
      recordedAt: "2026-09-01T00:00:00.000Z",
      minor: true,
    } as never);
  }
  const scribeProvider = mockProvider();
  const graph = compileScribeGraph(
    { db: w.db, provider: scribeProvider, skillsDir: SKILLS_DIR, escalation: w.deps },
    { checkpointer: new MemorySaver() },
  );
  return { ...w, graph, scribeProvider };
}

function scribeInput(extra: { turnId: string; text: string }) {
  const i = baseInput({ sessionId: SESSION, studentId: STUDENT });
  i.turns.push({ turnId: extra.turnId, speaker: "student", lang: "en", text: extra.text, translatedText: extra.text, ts: 4 });
  return i;
}

test("T-012 E11: startScribe on a crisis session escalates to admin + counsellors with zero scribe provider calls", async () => {
  const s = await scribeWorld({ provider: classifierSays({ severity: "none", likelyBenign: true }) });
  const outcome = await startScribe(s.graph, scribeInput({ turnId: "t4", text: CRISIS_TEXT }), { threadId: "thread-esc-1" });
  assert.equal(outcome.kind, "done");
  assert.equal(outcome.kind === "done" && outcome.result.status, "escalated");
  assert.equal(s.scribeProvider.calls.length, 0, "B9: no generative scribe call on a crisis session");
  const stored = await readEscalations(s.db, { sessionId: SESSION });
  assert.deepEqual([...new Set(stored.map((n) => n.recipient.role))].sort(), ["admin", "counsellor"]);
  assert.equal(stored.length, 3);
  await Promise.all(s.reviews);
  assert.equal((await readEscalations(s.db, { sessionId: SESSION })).length, 3, "a 'benign' review withdrew nothing");
});

test("T-012 E12: startScribe on a concern session still pauses for approval (B20) and, with the classifier down, escalates", async () => {
  const s = await scribeWorld({ provider: new ThrowingProvider() });
  const outcome = await startScribe(s.graph, scribeInput({ turnId: "t4", text: CONCERN_TEXT }), { threadId: "thread-esc-2" });
  assert.equal(outcome.kind, "awaiting_approval", "a concern never stops the scribe");
  await Promise.all(s.reviews);
  const stored = await readEscalations(s.db, { sessionId: SESSION });
  assert.equal(stored.length, 3);
  assert.ok(stored.every((n) => n.reason === "classifier_unavailable"));
});

test("T-012 E13: no consent -> no escalation record (B4 consent first); an unscoped Db with escalation is refused at compile time", async () => {
  const s = await scribeWorld({ consent: false });
  const outcome = await startScribe(s.graph, scribeInput({ turnId: "t4", text: CRISIS_TEXT }), { threadId: "thread-esc-3" });
  assert.equal(outcome.kind === "done" && outcome.result.status, "refused");
  assert.equal(rawNotifications(s).length, 0);
  assert.throws(
    () => compileScribeGraph({ db: s.raw, provider: mockProvider(), skillsDir: SKILLS_DIR, escalation: s.deps }, { checkpointer: new MemorySaver() }),
    TenantScopeError,
  );
});

test("T-012 E14: without `escalation` the scribe writes no escalation record (backward compatible)", async () => {
  const w = world();
  const graph = compileScribeGraph({ db: w.db, provider: mockProvider(), skillsDir: SKILLS_DIR }, { checkpointer: new MemorySaver() });
  await w.db.collection(COLLECTION_NAMES.consents).insertOne({
    _id: `consent-${STUDENT}`,
    studentId: STUDENT,
    guardianConsent: true,
    purposes: [SCRIBE_PURPOSE],
    recordedAt: "2026-09-01T00:00:00.000Z",
    minor: true,
  } as never);
  const outcome = await startScribe(graph, scribeInput({ turnId: "t4", text: CRISIS_TEXT }), { threadId: "thread-esc-4" });
  assert.equal(outcome.kind === "done" && outcome.result.status, "escalated");
  assert.equal(rawNotifications(w).length, 0);
  assert.equal(w.reviews.length, 0);
});

// Keep the doc type referenced so a shape change is a compile error here too.
const _shape: (keyof EscalationNotificationDoc)[] = ["recipient", "notifiedAt", "flaggedAt", "acknowledgedAt"];
void _shape;
