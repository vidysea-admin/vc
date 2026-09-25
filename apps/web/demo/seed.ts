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
  requestErasure,
  VC_DB_NAME,
  type ConsentDoc,
  type FactDoc,
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
} from "@vc/engine";
import { MockProvider } from "@vc/providers";
import type { ApprovalRuntime } from "../src/server/approval-service";

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
}

export interface DemoRuntime extends ApprovalRuntime {
  mode: "demo";
  threads: typeof DEMO_THREADS;
  readback(studentId: string): DemoReadback;
}

function resolveSkillsDir(): string {
  const candidates = [process.env.VC_SKILLS_DIR, join(process.cwd(), "..", "..", "skills"), join(process.cwd(), "skills")];
  for (const dir of candidates) if (dir && existsSync(join(dir, "fact-extraction", "SKILL.md"))) return dir;
  throw new Error("demo: skills/ directory not found (set VC_SKILLS_DIR)");
}

export async function createDemoRuntime(): Promise<DemoRuntime> {
  const fake = createFakeMongoClient();
  const db = getVcDb(fake.client);
  const fakeDb = fake.dbFor(VC_DB_NAME);
  for (const spec of INDEX_PLAN) {
    if (!spec.unique) continue;
    fakeDb
      .collection<{ _id: string }>(spec.collection)
      .declareUniqueIndex(Object.keys(spec.keys), { partialFilterExpression: spec.partialFilterExpression });
  }
  const consents = fakeDb.collection<ConsentDoc>(COLLECTION_NAMES.consents);
  for (const n of [1, 2, 3]) {
    consents.seed({
      _id: `consent-demo-student-${n}`,
      studentId: `demo-student-${n}`,
      guardianConsent: true,
      purposes: [SCRIBE_PURPOSE],
      recordedAt: "2026-09-01T00:00:00.000Z",
      minor: true,
    });
  }

  const provider = new MockProvider({ responses: { "fact-extraction": DEMO_EXTRACTION, "session-summary": { summary: DEMO_SUMMARY } } });
  const graph: ScribeGraph = compileScribeGraph(
    { db, provider, skillsDir: resolveSkillsDir() },
    { checkpointer: createScribeCheckpointer(fake.client) },
  );

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
  fakeDb.collection<ScribeResolutionDoc>(COLLECTION_NAMES.scribe_resolutions).seed({
    _id: DEMO_THREADS.inProgress,
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
    readback(studentId: string): DemoReadback {
      const facts = fakeDb
        .collection<FactDoc>(COLLECTION_NAMES.facts)
        .all()
        .filter((f) => f.studentId === studentId)
        .map((f) => ({ key: f.key, value: f.value, active: f.active === true }));
      const sessions = fakeDb
        .collection<SessionDoc>(COLLECTION_NAMES.sessions)
        .all()
        .filter((s) => s.studentId === studentId)
        .map((s) => ({
          sessionId: s._id,
          summary: s.summary,
          summaryWithheldReason: s.summaryWithheldReason,
          summaryApprovedAt: s.summaryApprovedAt,
        }));
      const claims = fakeDb
        .collection<ScribeResolutionDoc>(COLLECTION_NAMES.scribe_resolutions)
        .all()
        .filter((c) => c.studentId === studentId).length;
      return { studentId, facts, sessions, claims };
    },
  };
}
