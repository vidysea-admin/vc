/**
 * T-012 outcome tests for crisis escalation (contract B16, D-020, gates crisis-guard-precision and
 * crisis-safety-layers). Every assertion reads the stored records back from the in-memory fake,
 * through a tenant-scoped Db (T-025) — outcome, not construction. Synthetic text only (B13); no
 * network, no real model: the classifier is a MockProvider or a hand-rolled fake.
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { MemorySaver } from "@langchain/langgraph";
import { COLLECTION_NAMES, TenantScopeError, tenantScopedDb, StudentFencedError, FencedWriterDeadlineError, FENCE_POSTCHECK_TIMEOUT_MS, erasureFenceKey, requestErasure, executeErasure, exportStudent } from "@vc/db";
import { createFakeDb, INDEX_PLAN, confirmTwiceAndApprove, type FakeDb } from "@vc/db/testing";
import { ProviderAuthorizationRefusedError, MockProvider, type GenerateRequest, type LlmProvider } from "@vc/providers";
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
/**
 * A row the keyword guard misses. U6h: the former held-out row ("... in case I'm not here next week.") is now
 * caught by the guard (L5), so this is a different phrasing the guard still misses and that is NOT in the
 * held-out file.
 */
const MISSED_CRISIS_TEXT = "I keep wondering whether it would matter to anyone if I stopped showing up.";

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
  consent?: boolean;
} = {}): World {
  const { fakeDb, db: raw } = createFakeDb();
  if (opts.consent !== false) {
    const tenantId = opts.tenant ?? TENANT;
    fakeDb.collection<any>(COLLECTION_NAMES.consents).seed({
      _id: `${tenantId}:consent-${STUDENT}`, tenantId, studentId: STUDENT,
      guardianConsent: true, purposes: [SCRIBE_PURPOSE], recordedAt: AT, minor: true,
    });
  }
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
  assert.deepEqual(w.alerts, [{ event: "escalation_unrouted", escalationId: `${SESSION}:t2`, sessionId: SESSION, errorName: "RecipientResolutionError" }]);

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
  assert.ok((Object.values(COLLECTION_NAMES) as string[]).includes(ESCALATION_NOTIFICATIONS_COLLECTION), "registered for lifecycle coverage");
  assert.ok((Object.values(COLLECTION_NAMES) as string[]).includes(CRISIS_FLAG_REVIEWS_COLLECTION), "registered for lifecycle coverage");
});

// ---------------------------------------------------------------------------
// scribe integration (startScribe): crisis before any provider call; concern still continues
// ---------------------------------------------------------------------------

async function scribeWorld(opts: { provider?: LlmProvider; consent?: boolean } = {}) {
  const w = world({ provider: opts.provider, consent: false });
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

test("T-012 E13: no consent crisis -> minimal guard-only escalation; unscoped Db is still refused at compile time", async () => {
  const s = await scribeWorld({ consent: false });
  const outcome = await startScribe(s.graph, scribeInput({ turnId: "t4", text: CRISIS_TEXT }), { threadId: "thread-esc-3" });
  assert.equal(outcome.kind === "done" && outcome.result.status, "escalated");
  assert.equal(rawNotifications(s).length, 3);
  assert.equal(s.reviews.length, 0);
  assert.throws(
    () => compileScribeGraph({ db: s.raw, provider: mockProvider(), skillsDir: SKILLS_DIR, escalation: s.deps }, { checkpointer: new MemorySaver() }),
    TenantScopeError,
  );
});

test("T-012 E14: without `escalation` the scribe writes no escalation record (backward compatible)", async () => {
  const w = world({ consent: false });
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


// ISS-124: the D-016 fenced-writer deadline is wall-clock (setTimeout + Date.now in WriterDeadline and the
// review budget), so a real 50/500 ms deadline can expire during the setup writes when the CPU is loaded
// (FencedWriterDeadlineError in the wrong place), or fire late. The deadline tests mock ONLY setTimeout and
// Date: nothing expires on its own, and the test fires the deadline explicitly with clock.advance() after the
// held write has been reached. setImmediate / performance are untouched, so settling waits stay real.
function useFakeClock(): { advance: (ms: number) => Promise<void>; restore: () => void } {
  mock.timers.enable({ apis: ["setTimeout", "Date"], now: Date.now() });
  // 1 ms steps with the microtasks drained between them: timers fire in due order and each expiry is
  // observed by its waiters before the next timer fires, exactly as on a real event loop (one tick(ms)
  // would fire every due timer in a single synchronous batch, an ordering production never sees).
  const advance = async (ms: number): Promise<void> => {
    for (let i = 0; i < ms; i++) { mock.timers.tick(1); await new Promise<void>((r) => setImmediate(r)); }
  };
  return { advance, restore: () => mock.timers.reset() };
}

/** Wait (real event-loop turns, no timers) until `cond` holds; the cap is a safety net, not the mechanism. */
async function untilTrue(cond: () => boolean, capMs = 20_000): Promise<void> {
  const t0 = performance.now();
  while (!cond() && performance.now() - t0 < capMs) await new Promise<void>((r) => setImmediate(r));
}

/** Let already-released asynchronous work run to completion (negative checks: nothing more happens). */
async function drainEventLoop(turns = 200): Promise<void> {
  for (let i = 0; i < turns; i++) await new Promise<void>((r) => setImmediate(r));
}

async function setSafetyFence(w: World): Promise<void> {
  await w.db.collection(COLLECTION_NAMES.erasure_fences).insertOne({
    _id: erasureFenceKey(STUDENT), studentKey: erasureFenceKey(STUDENT),
    createdAt: new Date().toISOString(), requestId: "synthetic-fence",
  } as never);
}

function holdSafetyUpdate(w: World, name: string, predicate: (update: Record<string, unknown>) => boolean) {
  const c = w.fakeDb.collection<AnyDoc>(name);
  const original = c.updateOne.bind(c);
  let release!: () => void;
  let entered!: () => void;
  const reached = new Promise<void>((r) => { entered = r; });
  const held = new Promise<void>((r) => { release = r; });
  let markApplied!: () => void;
  const applied = new Promise<void>((r) => { markApplied = r; });
  let once = false;
  c.updateOne = async (...args: Parameters<typeof c.updateOne>) => {
    if (!once && predicate(args[1] as Record<string, unknown>)) { once = true; entered(); await held; const result = await original(...args); markApplied(); return result; }
    return original(...args);
  };
  return { reached, release, applied };
}

test("T-035: initial review and notification writes held across a fence leave zero owned insert residue", async () => {
  for (const name of [CRISIS_FLAG_REVIEWS_COLLECTION, ESCALATION_NOTIFICATIONS_COLLECTION]) {
    const w = world();
    const hold = holdSafetyUpdate(w, name, (u) => "$setOnInsert" in u);
    const pending = escalateTurns(w.db, input([turn("t2", CRISIS_TEXT)]), w.deps);
    const rejected = assert.rejects(pending, StudentFencedError);
    await hold.reached;
    await setSafetyFence(w);
    hold.release();
    await rejected;
    assert.deepEqual(w.fakeDb.collection<AnyDoc>(name).all(), [], name);
  }
});

test("T-035: annotation fencing restores only its fields and keeps a pre-existing review row", async () => {
  const w = world();
  await escalateTurns(w.db, input([turn("t2", CRISIS_TEXT)]), w.deps).then((r) => r.review);
  const before = JSON.stringify(w.fakeDb.collection<AnyDoc>(CRISIS_FLAG_REVIEWS_COLLECTION).all());
  const hold = holdSafetyUpdate(w, CRISIS_FLAG_REVIEWS_COLLECTION, (u) => Boolean((u.$set as Record<string, unknown> | undefined)?.classifier));
  const replay = await escalateTurns(w.db, input([turn("t2", CRISIS_TEXT)]), w.deps);
  await hold.reached;
  await setSafetyFence(w);
  hold.release();
  await replay.review;
  assert.equal(JSON.stringify(w.fakeDb.collection<AnyDoc>(CRISIS_FLAG_REVIEWS_COLLECTION).all()), before);
});

test("T-035: acknowledgement held across fencing restores its own annotation, never deletes notification", async () => {
  const w = world();
  await escalateTurns(w.db, input([turn("t2", CRISIS_TEXT)]), w.deps).then((r) => r.review);
  const before = JSON.stringify(rawNotifications(w));
  const [n] = await readEscalations(w.db, { sessionId: SESSION });
  const hold = holdSafetyUpdate(w, ESCALATION_NOTIFICATIONS_COLLECTION, (u) => Boolean((u.$set as Record<string, unknown> | undefined)?.acknowledgedAt));
  const pending = acknowledgeEscalation(w.db, { notificationId: n!._id, acknowledgedBy: "admin-1" });
  const rejected = assert.rejects(pending, StudentFencedError);
  await hold.reached;
  await setSafetyFence(w);
  hold.release();
  await rejected;
  assert.equal(JSON.stringify(rawNotifications(w)), before);
  await assert.rejects(acknowledgeEscalation(w.db, { notificationId: n!._id, acknowledgedBy: "admin-1" }), StudentFencedError);
});

test("T-035: a notification replay compensation preserves the prior invocation's raw records", async () => {
  const w = world();
  await escalateTurns(w.db, input([turn("t2", CRISIS_TEXT)]), w.deps).then((r) => r.review);
  const before = JSON.stringify(rawNotifications(w));
  const hold = holdSafetyUpdate(w, ESCALATION_NOTIFICATIONS_COLLECTION, (u) => "$setOnInsert" in u);
  const pending = escalateTurns(w.db, input([turn("t2", CRISIS_TEXT)]), w.deps);
  const rejected = assert.rejects(pending, StudentFencedError);
  await hold.reached;
  await setSafetyFence(w);
  hold.release();
  await rejected;
  assert.equal(JSON.stringify(rawNotifications(w)), before);
});

test("T-035: timeout observes late insert settlement and removes only its own records", async () => {
  const clock = useFakeClock();
  try {
    const w = world();
    w.deps.writerDeadlineMs = 50;
    const hold = holdSafetyUpdate(w, CRISIS_FLAG_REVIEWS_COLLECTION, (u) => "$setOnInsert" in u);
    let timeout: FencedWriterDeadlineError | undefined;
    const pending = escalateTurns(w.db, input([turn("t2", CRISIS_TEXT)]), w.deps).catch((e: unknown) => {
      assert.ok(e instanceof FencedWriterDeadlineError);
      timeout = e;
    });
    await hold.reached;
    await clock.advance(51); // the 50 ms writer deadline passes while the insert is held
    await pending;
    assert.ok(timeout, "the public call timed out with FencedWriterDeadlineError");
    hold.release();
    await timeout!.settled;
    assert.deepEqual(w.fakeDb.collection<AnyDoc>(CRISIS_FLAG_REVIEWS_COLLECTION).all(), []);
  } finally { clock.restore(); }
});

test("T-035: classifier returning after erasure cannot annotate or notify and a fenced replay writes nothing", async () => {
  let release!: (v: unknown) => void;
  const provider: LlmProvider = { kind: "mock", model: "flash-lite", generate<T>() { return new Promise<T>((r) => { release = r as (v: unknown) => void; }); } };
  const w = world({ provider, timeoutMs: 1000 });
  const result = await escalateTurns(w.db, input([turn("t2", CONCERN_TEXT)]), w.deps);
  await setSafetyFence(w);
  await w.db.collection(CRISIS_FLAG_REVIEWS_COLLECTION).deleteMany({ studentId: STUDENT });
  release({ severity: "high", likelyBenign: false, rationale: "synthetic" });
  await result.review;
  assert.deepEqual(rawNotifications(w), []);
  assert.deepEqual(w.fakeDb.collection<AnyDoc>(CRISIS_FLAG_REVIEWS_COLLECTION).all(), []);
  await assert.rejects(escalateTurns(w.db, input([turn("t2", CRISIS_TEXT)]), w.deps), StudentFencedError);
  assert.deepEqual(rawNotifications(w), []);
});

test("T-035: postcheck fence read failure undoes inserted review and compensation failure is visible", async () => {
  for (const undoFails of [false, true]) {
    const w = world();
    const fences = w.fakeDb.collection<AnyDoc>(COLLECTION_NAMES.erasure_fences);
    const find = fences.findOne.bind(fences);
    let enteredPostcheck = false;
    let ownedToken: unknown;
    const reviews = w.fakeDb.collection<AnyDoc>(CRISIS_FLAG_REVIEWS_COLLECTION);
    fences.findOne = async (...args: Parameters<typeof fences.findOne>) => {
      const owned = reviews.all()[0];
      if (owned && (args[1] as { timeoutMS?: number } | undefined)?.timeoutMS === FENCE_POSTCHECK_TIMEOUT_MS) {
        enteredPostcheck = true;
        ownedToken = owned.writerToken;
        throw new Error("synthetic fence read failure");
      }
      return find(...args);
    };
    if (undoFails) {
      reviews.deleteMany = async (filter) => {
        assert.equal((filter as Record<string, unknown>).writerToken, ownedToken);
        throw new Error("synthetic undo failure");
      };
    }
    await assert.rejects(escalateTurns(w.db, input([turn("t2", CRISIS_TEXT)]), w.deps), undoFails ? /synthetic undo failure/ : /synthetic fence read failure/);
    assert.equal(enteredPostcheck, true, "owned review reached canonical postcheck");
    if (!undoFails) assert.deepEqual(w.fakeDb.collection<AnyDoc>(CRISIS_FLAG_REVIEWS_COLLECTION).all(), []);
  }
});


test("T-035: background late annotation compensation failure emits a text-free alert", async () => {
  const clock = useFakeClock();
  try {
    const w = world();
    w.deps.writerDeadlineMs = 500;
    const hold = holdSafetyUpdate(w, CRISIS_FLAG_REVIEWS_COLLECTION, (u) => Boolean((u.$set as Record<string, unknown> | undefined)?.classifier));
    const c = w.fakeDb.collection<AnyDoc>(CRISIS_FLAG_REVIEWS_COLLECTION);
    const original = c.updateOne.bind(c);
    let released = false;
    c.updateOne = async (...args: Parameters<typeof c.updateOne>) => {
      if (released && "$unset" in args[1]) { const err = new Error("secret transcript must not enter alert"); err.name = "SyntheticLateUndoError"; throw err; }
      return original(...args);
    };
    const result = await escalateTurns(w.db, input([turn("t2", CRISIS_TEXT)]), w.deps);
    await hold.reached;
    await clock.advance(1000); // past the review deadline (classifier timeout 50 ms + writer deadline 500 ms)
    await result.review;
    released = true;
    hold.release();
    await untilTrue(() => w.alerts.some((a) => a.errorName === "ConcernReviewSettlementError"));
    assert.ok(w.alerts.some((a) => a.event === "concern_review_failed" && a.errorName === "ConcernReviewSettlementError"));
    assert.ok(!JSON.stringify(w.alerts).includes("secret transcript"));
  } finally { clock.restore(); }
});

test("T-035: annotation compensation cannot overwrite a newer invocation token", async () => {
  const w = world();
  await escalateTurns(w.db, input([turn("t2", CRISIS_TEXT)]), w.deps).then((r) => r.review);
  const c = w.fakeDb.collection<AnyDoc>(CRISIS_FLAG_REVIEWS_COLLECTION);
  const original = c.updateOne.bind(c);
  let newerWritten = false;
  c.updateOne = async (...args: Parameters<typeof c.updateOne>) => {
    const result = await original(...args);
    if (!newerWritten && (args[1].$set as Record<string, unknown> | undefined)?.classifierWriteToken) {
      newerWritten = true;
      const injection = await original({ _id: args[0]._id }, { $set: { classifierWriteToken: "newer-owner", classifier: { status: "unavailable", reason: "error", model: "mock", errorName: "Newer", attemptedAt: AT } } });
      assert.equal(injection.matchedCount, 1, "newer invocation reached the raw row");
      assert.equal(injection.modifiedCount, 1);
      await setSafetyFence(w);
    }
    return result;
  };
  const result = await escalateTurns(w.db, input([turn("t2", CRISIS_TEXT)]), w.deps);
  await result.review;
  const [row] = c.all();
  assert.equal(row!.classifierWriteToken, "newer-owner");
  assert.equal((row!.classifier as Record<string, unknown>).errorName, "Newer");
});


test("T-035: late notification/annotation/acknowledgement settlement compensates after deadline", async () => {
  const clock = useFakeClock();
  try {
    for (const phase of ["notification", "annotation", "acknowledgement"]) {
      const w = world();
      await escalateTurns(w.db, input([turn("t2", CRISIS_TEXT)]), w.deps).then((r) => r.review);
      const collection = phase === "annotation" ? CRISIS_FLAG_REVIEWS_COLLECTION : ESCALATION_NOTIFICATIONS_COLLECTION;
      const c = w.fakeDb.collection<AnyDoc>(collection);
      const before = JSON.stringify(c.all());
      // The clock is frozen: the writes BEFORE the held one cannot hit the deadline however loaded the CPU is.
      w.deps.writerDeadlineMs = 500;
      const hold = holdSafetyUpdate(w, collection, (u) => phase === "notification" ? "$setOnInsert" in u : Boolean((u.$set as Record<string, unknown> | undefined)?.[phase === "annotation" ? "classifier" : "acknowledgedAt"]));
      let deadline: FencedWriterDeadlineError | undefined;
      let pending: Promise<unknown>;
      if (phase === "acknowledgement") {
        const [n] = await readEscalations(w.db, { sessionId: SESSION });
        pending = acknowledgeEscalation(w.db, { notificationId: n!._id, acknowledgedBy: "admin-1", writerDeadlineMs: 500 }).catch((e: unknown) => { assert.ok(e instanceof FencedWriterDeadlineError); deadline = e; });
      } else if (phase === "annotation") {
        pending = escalateTurns(w.db, input([turn("t2", CRISIS_TEXT)]), w.deps).then((r) => r.review);
      } else {
        pending = escalateTurns(w.db, input([turn("t2", CRISIS_TEXT)]), w.deps).catch((e: unknown) => { assert.ok(e instanceof FencedWriterDeadlineError); deadline = e; });
      }
      await hold.reached;
      await clock.advance(1000); // fires the 500 ms writer deadline (and the 550 ms review deadline) while the write is held
      await pending;
      if (phase !== "annotation") assert.ok(deadline, `${phase}: the public call timed out with FencedWriterDeadlineError`);
      hold.release();
      if (deadline) await deadline.settled;
      // The released write is really applied first; only then is "state == before" evidence that the late
      // compensator undid it.
      await hold.applied;
      await untilTrue(() => JSON.stringify(c.all()) === before);
      // Allow the released asynchronous operation to reach its late compensator even if unchanged yet.
      await drainEventLoop();
      assert.equal(JSON.stringify(c.all()), before, phase);
    }
  } finally { clock.restore(); }
});

test("T-035: acknowledgement rollback preserves a newer invocation", async () => {
  const w = world();
  await escalateTurns(w.db, input([turn("t2", CRISIS_TEXT)]), w.deps).then((r) => r.review);
  const [n] = await readEscalations(w.db, { sessionId: SESSION });
  const c = w.fakeDb.collection<AnyDoc>(ESCALATION_NOTIFICATIONS_COLLECTION);
  const original = c.updateOne.bind(c);
  let newer = false;
  c.updateOne = async (...args: Parameters<typeof c.updateOne>) => {
    const result = await original(...args);
    if (!newer && (args[1].$set as Record<string, unknown> | undefined)?.acknowledgementWriteToken) {
      newer = true;
      const injection = await original({ _id: args[0]._id }, { $set: { acknowledgementWriteToken: "newer-ack", acknowledgedAt: AT, acknowledgedBy: "newer-staff" } });
      await setSafetyFence(w);
    }
    return result;
  };
  await assert.rejects(acknowledgeEscalation(w.db, { notificationId: n!._id, acknowledgedBy: "older-staff" }), StudentFencedError);
  const row = (await readEscalations(w.db, { sessionId: SESSION })).find((d) => d._id === n!._id)!;
  assert.equal(row.acknowledgementWriteToken, "newer-ack");
  assert.equal(row.acknowledgedBy, "newer-staff");
  assert.equal(await acknowledgeEscalation(w.db, { notificationId: n!._id, acknowledgedBy: "third-staff" }), false);
});


test("T-035: late newly inserted notifications are deleted after the public timeout", async () => {
  const clock = useFakeClock();
  try {
    const w = world();
    w.deps.writerDeadlineMs = 500;
    const hold = holdSafetyUpdate(w, ESCALATION_NOTIFICATIONS_COLLECTION, (u) => "$setOnInsert" in u);
    let deadline: FencedWriterDeadlineError | undefined;
    const pending = escalateTurns(w.db, input([turn("t2", CRISIS_TEXT)]), w.deps).catch((e: unknown) => {
      assert.ok(e instanceof FencedWriterDeadlineError); deadline = e;
    });
    await hold.reached;
    await clock.advance(501);
    await pending;
    assert.ok(deadline, "the public call timed out with FencedWriterDeadlineError");
    assert.deepEqual(rawNotifications(w), []);
    hold.release();
    await deadline!.settled;
    assert.deepEqual(rawNotifications(w), []);
  } finally { clock.restore(); }
});


test("T-035: a fence prevents driver dispatch on every safety mutation phase", async () => {
  for (const phase of ["review", "notification", "annotation", "acknowledgement"]) {
    const w = world();
    const name = phase === "review" || phase === "annotation" ? CRISIS_FLAG_REVIEWS_COLLECTION : ESCALATION_NOTIFICATIONS_COLLECTION;
    const c = w.fakeDb.collection<AnyDoc>(name);
    if (phase === "acknowledgement") await escalateTurns(w.db, input([turn("t2", CRISIS_TEXT)]), w.deps).then((r) => r.review);
    let writes = 0;
    const original = c.updateOne.bind(c);
    c.updateOne = async (...args: Parameters<typeof c.updateOne>) => {
      const u = args[1] as Record<string, unknown>;
      if (phase === "review" ? "$setOnInsert" in u : phase === "annotation" ? Boolean((u.$set as Record<string, unknown> | undefined)?.classifier) : phase === "acknowledgement" ? Boolean((u.$set as Record<string, unknown> | undefined)?.acknowledgedAt) : "$setOnInsert" in u) writes++;
      return original(...args);
    };
    if (phase === "review") {
      await setSafetyFence(w);
      await assert.rejects(escalateTurns(w.db, input([turn("t2", CRISIS_TEXT)]), w.deps), StudentFencedError);
    } else if (phase === "notification") {
      w.deps.recipients = async () => { await setSafetyFence(w); return { adminIds: ["admin"], counsellorIds: ["counsellor"] }; };
      await assert.rejects(escalateTurns(w.db, input([turn("t2", CRISIS_TEXT)]), w.deps), StudentFencedError);
    } else if (phase === "annotation") {
      let release!: (v: unknown) => void;
      w.deps.classifier.provider = { kind: "mock", model: "flash-lite", generate<T>() { return new Promise<T>((r) => { release = r as (v: unknown) => void; }); } };
      w.deps.classifier.config.timeoutMs = 1000;
      const result = await escalateTurns(w.db, input([turn("t2", CONCERN_TEXT)]), w.deps);
      await setSafetyFence(w);
      release({ severity: "critical", likelyBenign: false, rationale: "synthetic" });
      await result.review;
    } else {
      const [n] = await readEscalations(w.db, { sessionId: SESSION });
      await setSafetyFence(w);
      await assert.rejects(acknowledgeEscalation(w.db, { notificationId: n!._id, acknowledgedBy: "admin" }), StudentFencedError);
    }
    assert.equal(writes, 0, phase + " must stop before mutation dispatch");
  }
});


test("T-035: applied-write-then-reject ambiguous inserts clean up own writes and preserve replay bytes", async () => {
  for (const name of [CRISIS_FLAG_REVIEWS_COLLECTION, ESCALATION_NOTIFICATIONS_COLLECTION]) {
    for (const replay of [false, true]) {
      const w = world();
      if (replay) await escalateTurns(w.db, input([turn("t2", CRISIS_TEXT)]), w.deps).then((r) => r.review);
      const c = w.fakeDb.collection<AnyDoc>(name);
      const before = JSON.stringify(c.all());
      const original = c.updateOne.bind(c);
      let ambiguous = false;
      c.updateOne = async (...args: Parameters<typeof c.updateOne>) => {
        const result = await original(...args);
        if (!ambiguous && "$setOnInsert" in args[1]) {
          ambiguous = true;
          await setSafetyFence(w);
          const err = new Error("synthetic outcome lost after write");
          err.name = "SyntheticAmbiguousMongoError";
          throw err;
        }
        return result;
      };
      await assert.rejects(escalateTurns(w.db, input([turn("t2", CRISIS_TEXT)]), w.deps), (e: unknown) => {
        assert.ok(e instanceof StudentFencedError);
        assert.equal((e.cause as Error).name, "SyntheticAmbiguousMongoError");
        return true;
      });
      assert.equal(ambiguous, true, "driver applied the target upsert before rejection");
      assert.equal(JSON.stringify(c.all()), before, name + (replay ? " replay" : " new"));
    }
  }
});

// T047: privacy assertions are independent so a wrong outcome cannot hide persistence.
test("T047 RED: no-consent deterministic crises return a minimal outcome for every detected turn", async () => {
  const s = await scribeWorld({ consent: false });
  const i = scribeInput({ turnId: "privacy-crisis-a", text: CRISIS_TEXT });
  i.turns.push({ turnId: "privacy-crisis-b", speaker: "student", lang: "en", text: CRISIS_TEXT, translatedText: CRISIS_TEXT, ts: 5 });
  const outcome = await startScribe(s.graph, i, { threadId: "privacy-crisis-output" });
  assert.equal(outcome.kind === "done" && outcome.result.status, "escalated");
  assert.equal(s.scribeProvider.calls.length, 0);
  assert.equal(s.reviews.length, 0, "guard-only processing must not schedule a classifier review");
  const notifications = rawNotifications(s);
  assert.deepEqual([...new Set(notifications.map(n => n.turnId))].sort(), ["privacy-crisis-a", "privacy-crisis-b"]);
  assert.equal(notifications.length, 6);
  assert.ok(notifications.every(n => n.channel === "record_only"));
  const serialized = JSON.stringify({ outcome, notifications });
  assert.equal(serialized.includes(CRISIS_TEXT), false, "minimal crisis output must contain no transcript text");
});

test("T047 RED: no-consent crisis processing writes no personal session, transcript, review, fact or checkpoint", async () => {
  const s = await scribeWorld({ consent: false });
  await startScribe(s.graph, scribeInput({ turnId: "privacy-crisis", text: CRISIS_TEXT }), { threadId: "privacy-crisis-storage" });
  const counts = Object.fromEntries(["sessions", "session_transcripts", "concerns", "facts", "edges", "scribe_checkpoints", "scribe_checkpoint_writes", CRISIS_FLAG_REVIEWS_COLLECTION].map(name => [name, s.fakeDb.collection<{ _id: string }>(name).all().length]));
  assert.deepEqual(counts, Object.fromEntries(Object.keys(counts).map(name => [name, 0])));
  assert.equal(s.reviews.length, 0);
  assert.equal(s.scribeProvider.calls.length, 0);
});

test("T047 RED: ordinary no-consent refusal writes no personal session, transcript, review, fact or checkpoint", async () => {
  const s = await scribeWorld({ consent: false });
  const outcome = await startScribe(s.graph, baseInput({ sessionId: SESSION, studentId: STUDENT }), { threadId: "privacy-ordinary-storage" });
  assert.equal(outcome.kind === "done" && outcome.result.status, "refused");
  const counts = Object.fromEntries(["sessions", "session_transcripts", "concerns", "facts", "edges", "scribe_checkpoints", "scribe_checkpoint_writes", CRISIS_FLAG_REVIEWS_COLLECTION, ESCALATION_NOTIFICATIONS_COLLECTION].map(name => [name, s.fakeDb.collection<{ _id: string }>(name).all().length]));
  assert.deepEqual(counts, Object.fromEntries(Object.keys(counts).map(name => [name, 0])));
  assert.equal(s.reviews.length, 0);
  assert.equal(s.scribeProvider.calls.length, 0);
});
test("T047 repair RED: a refused classifier leaf cannot recover into annotation or fallback publication", async () => {
  const provider: LlmProvider = { kind: "mock", model: "flash-lite", generate: async () => { throw new ProviderAuthorizationRefusedError(); } };
  const w = world({ provider });
  const result = await escalateTurns(w.db, input([turn("terminal-refusal", CONCERN_TEXT)]), w.deps);
  await result.review;
  const flags = w.fakeDb.collection<any>(CRISIS_FLAG_REVIEWS_COLLECTION).all();
  assert.equal(flags.length, 1, "the original guard flag remains");
  assert.equal(flags[0]!.classifier, undefined, "fresh consent cannot resurrect a previously refused classifier attempt");
  assert.equal(rawNotifications(w).length, 0);
});

test("T047 repair RED: final fence postcheck expiry rejects success and removes only owned notifications", async () => {
  const w = world({ consent: false });
  w.deps.writerDeadlineMs = 100;
  const fences = w.fakeDb.collection<any>(COLLECTION_NAMES.erasure_fences);
  const original = fences.findOne.bind(fences);
  let reads = 0;
  let enteredPostcheck = false;
  fences.findOne = async (...args: Parameters<typeof original>) => {
    reads++;
    if (!enteredPostcheck && rawNotifications(w).length === 3) {
      enteredPostcheck = true;
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    return original(...args);
  };
  const observed = await escalateTurns(w.db, input([turn("late-postcheck", CRISIS_TEXT)]), w.deps).then(value => ({ value, error: undefined as unknown }), error => ({ value: undefined, error }));
  assert.equal(enteredPostcheck, true, "actual final writer fence read reached");
  assert.ok(observed.error instanceof FencedWriterDeadlineError, "expiry during postcheck cannot return success");
  await (observed.error as FencedWriterDeadlineError).settled;
  assert.equal(rawNotifications(w).length, 0);
});
test("T047 no-consent processing never enters graph, checkpoints, tracing or personal collections", async () => {
  for (const text of ["Synthetic ordinary course discussion", CRISIS_TEXT]) {
    const s = await scribeWorld({ consent: false });
    let graphInvocations = 0;
    let checkpointReads = 0;
    let traces = 0;
    const invoked = s.graph.invoke.bind(s.graph);
    const read = s.graph.getState.bind(s.graph);
    (s.graph as any).invoke = (...args: any[]) => { graphInvocations++; return (invoked as any)(...args); };
    (s.graph as any).getState = (...args: any[]) => { checkpointReads++; return (read as any)(...args); };
    const personalAccess: string[] = [];
    const collection = s.raw.collection.bind(s.raw);
    (s.raw as any).collection = (name: string, ...args: any[]) => {
      if (["sessions", "session_transcripts", "facts", "edges", "profiles", "kb_chunks", "kb_entities", "scribe_checkpoints", "scribe_checkpoint_writes", "crisis_flag_reviews"].includes(name)) personalAccess.push(name);
      return (collection as any)(name, ...args);
    };
    await startScribe(s.graph, scribeInput({ turnId: "privacy-spy", text }), { threadId: "privacy-spy", callbacks: [{ name: "synthetic privacy spy", handleChainStart: async () => { traces++; } }] });
    assert.deepEqual({ graphInvocations, checkpointReads, traces, personalAccess }, { graphInvocations: 0, checkpointReads: 0, traces: 0, personalAccess: [] });
    assert.equal(s.scribeProvider.calls.length, 0);
    assert.equal(s.reviews.length, 0);
  }
});
test("T047 publication budget: annotation and delayed recipients share remaining original review budget", async () => {
  let enteredRecipientPhase = false;
  let enteredAnnotationPhase = false;
  // Same structure as the original 20/80/60/100ms timings (recipient delay > the full writer budget AND > what is left after the annotation),
  // but with 700ms of slack between the annotation delay and the writer budget so a CPU stall cannot expire the budget before the recipient phase starts.
  const w = world({ timeoutMs: 100, provider: classifierSays({ severity: "high", likelyBenign: false }), recipients: async () => { enteredRecipientPhase = true; await new Promise(resolve => setTimeout(resolve, 1200)); return { adminIds: ["admin-1"], counsellorIds: ["counsellor-7"] }; } });
  w.deps.writerDeadlineMs = 1000;
  const flags = w.fakeDb.collection<any>(CRISIS_FLAG_REVIEWS_COLLECTION);
  const update = flags.updateOne.bind(flags);
  flags.updateOne = async (...args: Parameters<typeof update>) => {
    if ((args[1] as any).$set?.classifier) { enteredAnnotationPhase = true; await new Promise(resolve => setTimeout(resolve, 300)); }
    return update(...args);
  };
  const result = await escalateTurns(w.db, input([turn("original-review-budget", CONCERN_TEXT)]), w.deps);
  await result.review;
  assert.equal(enteredAnnotationPhase, true);
  assert.equal(enteredRecipientPhase, true);
  assert.equal(rawNotifications(w).length, 0, "recipient resolution cannot start a new full writer budget");
  assert.equal(flags.all().length, 1, "the original guard flag stays visible");
});

test("T047 cancellation RED: explicit background cancellation prevents late annotation and fallback", async () => {
  const controller = new AbortController();
  let start!: () => void;
  let release!: () => void;
  const started = new Promise<void>(resolve => { start = resolve; });
  const held = new Promise<void>(resolve => { release = resolve; });
  const provider: LlmProvider = { kind: "mock", model: "flash-lite", generate: async <T>(_request: GenerateRequest<T>): Promise<T> => { start(); await held; return { severity: "high", likelyBenign: false, rationale: "synthetic" } as T; } };
  const w = world({ provider, timeoutMs: 1000 });
  (w.deps as EscalationDeps & { signal: AbortSignal }).signal = controller.signal;
  const result = await escalateTurns(w.db, input([turn("cancelled-review", CONCERN_TEXT)]), w.deps);
  await started;
  controller.abort();
  release();
  await result.review;
  const flags = w.fakeDb.collection<any>(CRISIS_FLAG_REVIEWS_COLLECTION).all();
  assert.equal(flags.length, 1);
  assert.equal(flags[0]!.classifier, undefined);
  assert.equal(rawNotifications(w).length, 0);
});
test("T047 consent revoked while valid model is held leaves prior guard flag and publishes nothing", async () => {
  let start!: () => void;
  let release!: () => void;
  const started = new Promise<void>(resolve => { start = resolve; });
  const held = new Promise<void>(resolve => { release = resolve; });
  const provider: LlmProvider = { kind: "mock", model: "flash-lite", generate: async <T>(_request: GenerateRequest<T>): Promise<T> => { start(); await held; return { severity: "high", likelyBenign: false, rationale: "synthetic" } as T; } };
  const w = world({ provider, timeoutMs: 1000 });
  const result = await escalateTurns(w.db, input([turn("revoked-review", CONCERN_TEXT)]), w.deps);
  await started;
  const removed = await w.db.collection(COLLECTION_NAMES.consents).deleteMany({ studentId: STUDENT });
  assert.equal(removed.deletedCount, 1);
  release();
  await result.review;
  const flags = w.fakeDb.collection<any>(CRISIS_FLAG_REVIEWS_COLLECTION).all();
  assert.equal(flags.length, 1);
  assert.equal(flags[0]!.classifier, undefined);
  assert.equal(rawNotifications(w).length, 0);
});

test("T047 late guard-only notification compensation reaches own token CAS and preserves full newer-owner record", async () => {
  const w = world({ consent: false });
  w.deps.writerDeadlineMs = 50;
  const rows = w.fakeDb.collection<any>(ESCALATION_NOTIFICATIONS_COLLECTION);
  const update = rows.updateOne.bind(rows);
  const remove = rows.deleteMany.bind(rows);
  let start!: () => void;
  let release!: () => void;
  const started = new Promise<void>(resolve => { start = resolve; });
  const held = new Promise<void>(resolve => { release = resolve; });
  let once = false;
  let ownToken: string | undefined;
  let expected: string | undefined;
  let lateUndoReached = false;
  rows.updateOne = async (...args: Parameters<typeof update>) => {
    if (!once && (args[1] as any).$setOnInsert?.writerToken) {
      once = true; ownToken = (args[1] as any).$setOnInsert.writerToken; start(); await held;
      const result = await update(...args);
      await update(args[0], { $set: { writerToken: "newer-notification-owner" } });
      expected = JSON.stringify(rows.all().find(row => row._id === (args[0] as any)._id));
      return result;
    }
    return update(...args);
  };
  rows.deleteMany = async (...args: Parameters<typeof remove>) => {
    if (expected !== undefined && (args[0] as any).writerToken === ownToken) lateUndoReached = true;
    return remove(...args);
  };
  const pending = escalateTurns(w.db, input([turn("late-cas-notification", CRISIS_TEXT)]), w.deps).then(() => undefined, error => error);
  await started;
  const error = await pending;
  assert.ok(error instanceof FencedWriterDeadlineError);
  release();
  await error.settled;
  assert.equal(lateUndoReached, true);
  assert.equal(rows.all().length, 1);
  assert.equal(JSON.stringify(rows.all()[0]), expected);
  assert.equal(rows.all()[0]!.writerToken, "newer-notification-owner");
});

test("T047 no-session-anchor guard-only records export and erase through actual confirmed workflow", async () => {
  const w = world({ consent: false });
  const other = world({ consent: false, tenant: "tenant-b" });
  await escalateTurns(w.db, input([turn("no-anchor-crisis", CRISIS_TEXT)]), w.deps);
  const otherDb = tenantScopedDb(w.raw, "tenant-b");
  await escalateTurns(otherDb, input([turn("no-anchor-crisis", CRISIS_TEXT)]), other.deps);
  const beforeOther = JSON.stringify(rawNotifications(w).filter(row => row.tenantId === "tenant-b"));
  assert.equal(w.fakeDb.collection<any>(COLLECTION_NAMES.sessions).all().length, 0);
  const exported = await exportStudent(w.db, STUDENT);
  assert.equal(exported.sessions.length, 0);
  assert.equal(exported.escalations.length, 3);
  const { requestId } = await requestErasure(w.db, { studentId: STUDENT, requestedBy: "synthetic-requester", reason: "student_request" });
  await confirmTwiceAndApprove(w.db, { requestId, confirmedBy: "synthetic-confirmer" });
  const erased = await executeErasure(w.db, requestId);
  assert.equal(erased.status, "completed");
  assert.equal(erased.receipt.totalRemaining, 0);
  assert.equal(rawNotifications(w).filter(row => row.tenantId === TENANT).length, 0);
  assert.equal(JSON.stringify(rawNotifications(w).filter(row => row.tenantId === "tenant-b")), beforeOther);
});
test("ISS-126: a budget that refuses early after the writer deadline passed leaves no unhandled rejection from the postcheck race (reached by a held review insert that outlives a 50 ms writer deadline while the host budget has the same expiry)", async () => {
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => { unhandled.push(reason); };
  process.on("unhandledRejection", onUnhandled);
  const clock = useFakeClock();
  try {
    const w = world();
    w.deps.writerDeadlineMs = 50;
    const expiresAt = Date.now() + 50;
    const controller = new AbortController();
    // Same contract as the review budget in escalateTurns: an aborted/expired budget rejects at once and never attaches to the work it was handed.
    w.deps.budget = { expiresAt, signal: controller.signal, run: (work) => (controller.signal.aborted || Date.now() >= expiresAt ? Promise.reject(new FencedWriterDeadlineError()) : work) };
    const hold = holdSafetyUpdate(w, CRISIS_FLAG_REVIEWS_COLLECTION, (u) => "$setOnInsert" in u);
    let timeout: unknown;
    const pending = escalateTurns(w.db, input([turn("t2", CRISIS_TEXT)]), w.deps).catch((e: unknown) => { timeout = e; });
    await hold.reached;
    await clock.advance(51);
    await pending;
    assert.ok(timeout instanceof FencedWriterDeadlineError, "the public call timed out with FencedWriterDeadlineError");
    hold.release();
    await (timeout as FencedWriterDeadlineError).settled;
    await drainEventLoop(50);
    assert.deepEqual(unhandled, [], "no promise was left rejected with nobody attached");
  } finally {
    clock.restore();
    process.off("unhandledRejection", onUnhandled);
  }
});
