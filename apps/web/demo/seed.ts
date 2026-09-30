/**
 * T-008 demo runtime: the approval UI over the IN-PROCESS fake database (never MONGODB_URL, B8),
 * the mock provider (never Gemini, B13) and synthetic transcripts only (no real student data).
 *
 * The wiring is the production wiring with the fake swapped in underneath:
 * - the Db comes from @vc/db getVcDb on a fake MongoClient (the one B12 helper names the database);
 * - the checkpointer is the REAL LangGraph MongoDBSaver (createScribeCheckpointer) over that fake;
 * - the graph is compileScribeGraph, and every seeded thread is paused by a real startScribe.
 *
 * Lives outside src/ on purpose: it is demo/test infrastructure (it imports @vc/db/testing).
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  COLLECTION_NAMES,
  confirmErasure,
  getVcDb,
  tenantScopedDb,
  tenantScopedClient,
  requestErasure,
  VC_DB_NAME,
  type ConsentDoc,
  type FactDoc,
  type RejectReasonAuditDoc,
  type ScribeResolutionDoc,
  type SessionDoc,
} from "@vc/db";
import { createFakeMongoClient, INDEX_PLAN } from "@vc/db/testing";
import {
  approvalResponseHash,
  compileScribeGraph,
  createScribeCheckpointer,
  inspectScribe,
  resumeScribe,
  SCRIBE_PURPOSE,
  scribeThreadId,
  startScribe,
  type ApprovalResponse,
  type ScribeGraph,
  type ScribeInput,
  type ScribeOutcome,
} from "@vc/engine";
import { AiUnavailableError, MockProvider, type GenerateRequest, type LlmProvider } from "@vc/providers";
import { SummaryInputSchema } from "@vc/engine/scribe/schemas";
import { z } from "zod";
import type { ApprovalRuntime } from "../src/server/approval-service";
import type { SessionRuntime } from "../src/server/session-service";

export const DEMO_THREADS = {
  /** Paused at the approval interrupt: the main demo thread. */
  paused: scribeThreadId("demo-session-1"),
  /** Paused, then the student's erasure was confirmed: the UI must show "fenced". */
  fenced: scribeThreadId("demo-session-2"),
  /** Paused, with a claimed decision whose write has not run (a crashed winner): "in progress". */
  inProgress: scribeThreadId("demo-session-3"),
} as const;

const SESSION_ENDED_AT = "2026-09-24T11:30:00.000Z";

/** Synthetic transcript: invented student, invented numbers. */
function transcript(sessionId: string, studentId: string): ScribeInput {
  const turn = (turnId: string, speaker: "student" | "counsellor", text: string, ts: number) => ({
    turnId,
    speaker,
    lang: "en",
    text,
    translatedText: text,
    ts,
  });
  return {
    sessionId,
    studentId,
    sessionEndedAt: SESSION_ENDED_AT,
    turns: [
      turn("t1", "student", "I am thinking about computer science in Canada, maybe Toronto or Waterloo.", 1),
      turn("t2", "counsellor", "Which intake are you aiming for?", 2),
      turn("t3", "student", "Probably the September 2027 intake, after my boards.", 3),
      turn("t4", "counsellor", "What yearly budget has your family discussed?", 4),
      turn("t5", "student", "My parents said around 20 lakh rupees a year is the limit.", 5),
    ],
  };
}

const cited = (key: string, value: unknown, quote: string, turnId: string, confidence: number) => ({
  key,
  value,
  source: { type: "transcript", quote, turnId },
  confidence,
  purposeTags: [SCRIBE_PURPOSE],
  sensitivity: "low",
});

/** What the mock extraction returns: four cited facts and two the citation guard must drop (B2). */
const DEMO_EXTRACTION = {
  facts: [
    cited("targetCountry", "Canada", "computer science in Canada", "t1", 0.92),
    cited("intendedMajor", "computer science", "thinking about computer science", "t1", 0.81),
    cited("preferredIntake", "September 2027", "the September 2027 intake", "t3", 0.74),
    cited("budget_inr_per_year", 2000000, "around 20 lakh rupees a year", "t5", 0.66),
    // No source at all: dropped as uncited (B2).
    { key: "scholarshipNeed", value: true, confidence: 0.5, purposeTags: [SCRIBE_PURPOSE], sensitivity: "medium" },
    // A quote that is not in the cited turn: dropped as a fabricated citation (B2).
    cited("parentOccupation", "engineer", "my father is an engineer", "t5", 0.7),
  ],
};

const DEMO_SUMMARY =
  "Student is weighing computer science in Canada (Toronto or Waterloo) for the September 2027 intake; family budget discussed as about 20 lakh rupees a year.";

export interface DemoReadback {
  studentId: string;
  /** Every fact document for the student (open and retired). */
  facts: { key: string; value: unknown; active: boolean }[];
  sessions: { sessionId: string; summary?: string; summaryWithheldReason?: string; summaryApprovedAt?: string }[];
  claims: number;
  /**
   * T-020 / ISS-t-018-c0-1: the reject-reason audit records for this student (the `decisions`
   * collection, `kind: "per_fact_reject"` rows only — the pre-existing course/university-selection
   * `DecisionDoc` shape, if any is ever written, is a different `kind` and excluded here). This is
   * the demo-only observability the checker found missing: without it, a reject reason written
   * through the live UI could never be confirmed through the running app.
   */
  decisions: { threadId: string; rejected: { key: string; reason?: string }[]; decidedAt: string }[];
}

export interface DemoRuntime extends ApprovalRuntime, SessionRuntime {
  mode: "demo";
  threads: typeof DEMO_THREADS;
  readback(studentId: string): DemoReadback;
}

// ---------------------------------------------------------------------------
// T-021 (D-020, contract B6 "runtime failover"): the demo/browser proof that a real
// FailoverProvider exhaustion (packages/providers) surfaces as the apologetic "AI unavailable"
// state in apps/web, with a Retry that resubmits the identical input and completes normally.
// ---------------------------------------------------------------------------

/** The synthetic student the "start a new session" demo flow submits against. */
export const DEMO_NEW_SESSION_STUDENT_ID = "demo-student-4";

/**
 * Wraps a normal MockProvider so the FIRST `failCount` calls throw the SAME typed error a real
 * exhausted FailoverProvider chain throws (packages/providers AiUnavailableError) -- proving the
 * apologetic error + Retry path end to end without any real network (B8/B13). Every call after
 * that delegates to `base`, so clicking Retry with the identical input succeeds normally, same as
 * a real provider recovering. Demo/test infrastructure only (lives outside src/, like the rest of
 * this file) -- never used by the live runtime, which gets its real FailoverProvider straight from
 * createProvider(loadProviderConfig(env)) (runtime.ts).
 */
export class FlakyOnceProvider implements LlmProvider {
  readonly kind: LlmProvider["kind"];
  readonly model: string;
  #remaining: number;

  constructor(
    private readonly base: MockProvider,
    failCount = 1,
  ) {
    this.kind = base.kind;
    this.model = base.model;
    this.#remaining = failCount;
  }

  async generate<T>(request: GenerateRequest<T>): Promise<T> {
    if (this.#remaining > 0) {
      this.#remaining -= 1;
      throw new AiUnavailableError(["fast-cheap", "balanced", "smart-coding"], 10, "LiteLlmTimeoutError");
    }
    return this.base.generate<T>(request);
  }
}

function resolveSkillsDir(): string {
  const candidates = [process.env.VC_SKILLS_DIR, join(process.cwd(), "..", "..", "skills"), join(process.cwd(), "skills")];
  for (const dir of candidates) if (dir && existsSync(join(dir, "fact-extraction", "SKILL.md"))) return dir;
  throw new Error("demo: skills/ directory not found (set VC_SKILLS_DIR)");
}

export async function createDemoRuntime(): Promise<DemoRuntime> {
  const fake = createFakeMongoClient();
  const demoTenant = "vc-synthetic-demo";
  const db = tenantScopedDb(getVcDb(fake.client), demoTenant);
  const fakeDb = fake.dbFor(VC_DB_NAME);
  for (const spec of INDEX_PLAN) {
    if (!spec.unique) continue;
    fakeDb
      .collection<{ _id: string }>(spec.collection)
      .declareUniqueIndex(Object.keys(spec.keys), { partialFilterExpression: spec.partialFilterExpression });
  }
  const consents = fakeDb.collection<ConsentDoc & { tenantId: string }>(COLLECTION_NAMES.consents);
  for (const n of [1, 2, 3]) {
    consents.seed({
      _id: `${demoTenant}:consent-demo-student-${n}`,
      tenantId: demoTenant,
      studentId: `demo-student-${n}`,
      guardianConsent: true,
      purposes: [SCRIBE_PURPOSE],
      recordedAt: "2026-09-01T00:00:00.000Z",
      minor: true,
    });
  }
  // T-021: consent for the "start a new session" demo flow's student (see FlakyOnceProvider above).
  consents.seed({
    _id: `${demoTenant}:consent-${DEMO_NEW_SESSION_STUDENT_ID}`,
    tenantId: demoTenant,
    studentId: DEMO_NEW_SESSION_STUDENT_ID,
    guardianConsent: true,
    purposes: [SCRIBE_PURPOSE],
    recordedAt: "2026-09-01T00:00:00.000Z",
    minor: true,
  });

  // Canned demo verification for this controlled synthetic summary; no model accuracy claim.
  const summaryResponse = (raw: unknown) => {
    const task = z.object({ task: z.enum(["generate", "verify-approved-history"]), candidate: z.string().optional() }).passthrough().parse(raw);
    const input = SummaryInputSchema.parse(raw);
    if (input.approvedContext.some((fact) => fact.tenantId !== demoTenant)) throw new Error("demo: invalid history tenant");
    if (task.task === "generate") return { summary: DEMO_SUMMARY };
    if (task.candidate !== DEMO_SUMMARY) throw new Error("demo: unexpected synthetic summary");
    const ids = input.approvedContext.map((fact) => fact.factId);
    if (new Set(ids).size !== ids.length) throw new Error("demo: duplicate history identity");
    return { verdict: "clear", confidence: 1, reviewedFactIds: ids,
      reviewedRanges: [{ start: 0, end: task.candidate.length }], offendingSpans: [] };
  };
  const provider = new MockProvider({ responses: { "fact-extraction": DEMO_EXTRACTION, "session-summary": summaryResponse } });
  const skillsDir = resolveSkillsDir();
  const checkpointer = createScribeCheckpointer(tenantScopedClient(fake.client, demoTenant));
  const graph: ScribeGraph = compileScribeGraph({ db, provider, skillsDir }, { checkpointer });
  // T-021: a SEPARATE graph for the "start a new session" flow, sharing the same db/skills/
  // checkpointer but wired to a FlakyOnceProvider — so the 3 preseeded threads above (already
  // extracted through the always-succeeding `provider`) are never affected by the forced failure.
  const sessionProvider = new FlakyOnceProvider(
    new MockProvider({ responses: { "fact-extraction": DEMO_EXTRACTION, "session-summary": summaryResponse } }),
  );
  const sessionGraph: ScribeGraph = compileScribeGraph({ db, provider: sessionProvider, skillsDir }, { checkpointer });

  for (const n of [1, 2, 3]) {
    const outcome = await startScribe(graph, transcript(`demo-session-${n}`, `demo-student-${n}`), {
      threadId: scribeThreadId(`demo-session-${n}`),
    });
    if (outcome.kind !== "awaiting_approval") throw new Error(`demo: thread ${n} did not pause (${outcome.kind})`);
  }

  // Thread 2: an erasure for its student is requested and confirmed, which sets the D-015 fence.
  const { requestId } = await requestErasure(db, { studentId: "demo-student-2", requestedBy: "demo-counsellor", reason: "student_request" });
  await confirmErasure(db, { requestId, confirmedBy: "demo-admin" });

  // Thread 3: a claim whose winner "crashed" before the graph recorded the decision (D-014 claim,
  // lease already expired). The UI must show it as in progress, and a new submit must lose.
  const claimed: ApprovalResponse = { action: "approve" };
  fakeDb.collection<ScribeResolutionDoc & { tenantId: string }>(COLLECTION_NAMES.scribe_resolutions).seed({
    _id: `${demoTenant}:${DEMO_THREADS.inProgress}`,
    tenantId: demoTenant,
    threadId: DEMO_THREADS.inProgress,
    studentId: "demo-student-3",
    decision: { approve: true, edits: [] },
    response: claimed as unknown as Record<string, unknown>,
    responseHash: approvalResponseHash(claimed),
    claimedAt: "2026-09-24T11:40:00.000Z",
    lease: { token: "demo-crashed-winner", expiresAt: "2026-09-24T11:41:00.000Z" },
  });

  return {
    mode: "demo",
    graph,
    engine: { inspectScribe, resumeScribe },
    threads: DEMO_THREADS,
    startSession: (input: ScribeInput): Promise<ScribeOutcome> =>
      startScribe(sessionGraph, input, { threadId: scribeThreadId(input.sessionId) }),
    readback(studentId: string): DemoReadback {
      const facts = fakeDb
        .collection<FactDoc>(COLLECTION_NAMES.facts)
        .all()
        .filter((f) => (f as FactDoc & { tenantId?: string }).tenantId === demoTenant && f.studentId === studentId)
        .map((f) => ({ key: f.key, value: f.value, active: f.active === true }));
      const sessions = fakeDb
        .collection<SessionDoc>(COLLECTION_NAMES.sessions)
        .all()
        .filter((s) => (s as SessionDoc & { tenantId?: string }).tenantId === demoTenant && s.studentId === studentId)
        .map((s) => {
          if (s._id !== `${demoTenant}:${s.sessionId}`) throw new Error("demo: invalid stored session identity");
          return ({
          sessionId: s.sessionId,
          summary: s.summary,
          summaryWithheldReason: s.summaryWithheldReason,
          summaryApprovedAt: s.summaryApprovedAt,
        }); });
      const claims = fakeDb
        .collection<ScribeResolutionDoc>(COLLECTION_NAMES.scribe_resolutions)
        .all()
        .filter((c) => (c as ScribeResolutionDoc & { tenantId?: string }).tenantId === demoTenant && c.studentId === studentId).length;
      const decisions = fakeDb
        .collection<RejectReasonAuditDoc>(COLLECTION_NAMES.decisions)
        .all()
        .filter((d) => (d as RejectReasonAuditDoc & { tenantId?: string }).tenantId === demoTenant && d.kind === "per_fact_reject" && d.studentId === studentId)
        .map((d) => ({ threadId: d.threadId, rejected: d.rejected, decidedAt: d.decidedAt }));
      return { studentId, facts, sessions, claims, decisions };
    },
  };
}
