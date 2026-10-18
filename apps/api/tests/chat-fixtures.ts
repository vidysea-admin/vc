/**
 * P1 U8 shared SYNTHETIC fixtures for the authenticated student chat tests (not a test file: `tsx --test tests/*.test.ts` skips it).
 * Keys, tokens, students and KB text are all invented (B13); the DB is the in-memory fake (B8), and no network is used.
 */
import { generateKeyPairSync } from "node:crypto";
import { SignJWT, type JWTPayload } from "jose";
import { MockProvider } from "@vc/providers";
import { COLLECTION_NAMES, tenantScopedDb } from "@vc/db";
import { createFakeDb, type FakeDb } from "@vc/db/testing";
import { STUDENT_JWT_ENV, createStudentJwtVerifier, studentJwtConfigFromEnv } from "../src/auth.js";
import { createChatApi, type ChatApiDeps } from "../src/chat.js";
import type { ApiHandler, ApiRequest, ApiResponse } from "../src/server.js";
import { APPROVER, NOW, SKILLS_DIR, SPEAKERS, cleanupGates, gatesFixture, kbAnswerProvider, recordingKb, type GatesFixture } from "./anonymous-fixtures.js";

export const ISSUER = "https://pathlynks.synthetic.test";
export const AUDIENCE = "vc-student";
const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const PEM = keys.publicKey.export({ type: "spki", format: "pem" }).toString();
export const studentVerifier = () =>
  createStudentJwtVerifier(studentJwtConfigFromEnv({ [STUDENT_JWT_ENV.issuer]: ISSUER, [STUDENT_JWT_ENV.audience]: AUDIENCE, [STUDENT_JWT_ENV.publicKey]: PEM }));

export const GERMANY_QUESTION = "What are the tuition fees for public universities in Germany?";
export const CRISIS_TEXT = "I want to kill myself";

export async function studentToken(claims: Record<string, unknown>, opts: { key?: ReturnType<typeof generateKeyPairSync>["privateKey"] } = {}): Promise<string> {
  return new SignJWT(claims as JWTPayload)
    .setProtectedHeader({ alg: "RS256" })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setExpirationTime(Math.floor(Date.now() / 1000) + 300)
    .sign(opts.key ?? keys.privateKey);
}

export const adult = (studentId = "stu-1", tenant = "tenant-a") => ({ tenant, studentId, role: "student", isMinor: false });
export const minor = (studentId = "stu-1", tenant = "tenant-a", extra: Record<string, unknown> = {}) => ({ tenant, studentId, role: "student", isMinor: true, ...extra });

export interface ChatWorld {
  fakeDb: FakeDb;
  handler: ApiHandler;
  provider: MockProvider;
  kb: ReturnType<typeof recordingKb>;
  escalations: unknown[];
  logs: unknown[];
  clock: { ms: number };
  gates: GatesFixture;
  deps: ChatApiDeps;
  cleanup(): void;
}

export function chatWorld(opts: { provider?: MockProvider; kb?: ReturnType<typeof recordingKb>; deps?: Partial<ChatApiDeps> } = {}): ChatWorld {
  const { db, fakeDb } = createFakeDb();
  const provider = opts.provider ?? kbAnswerProvider();
  const kb = opts.kb ?? recordingKb();
  const escalations: unknown[] = [];
  const logs: unknown[] = [];
  const clock = { ms: Date.parse("2026-11-01T10:00:00.000Z") };
  const gates = gatesFixture();
  const deps: ChatApiDeps = {
    verifier: studentVerifier(),
    dbForTenant: (tenantId) => tenantScopedDb(db, tenantId),
    kb,
    provider,
    skillsDir: SKILLS_DIR,
    speakers: SPEAKERS,
    escalateForTenant: () => async (input) => {
      escalations.push(input);
    },
    now: () => new Date(clock.ms),
    nowMs: () => clock.ms,
    log: (line) => logs.push(line),
    ...opts.deps,
  };
  const handler = createChatApi(deps, { enabled: true, gatesDir: gates.gates, now: NOW, approver: APPROVER, env: {} })!;
  return { fakeDb, handler, provider, kb, escalations, logs, clock, gates, deps, cleanup: () => cleanupGates(gates) };
}

export function chatRequest(method: string, path: string, opts: { token?: string; body?: unknown; headers?: Record<string, string>; readBody?: () => Promise<string> } = {}): ApiRequest {
  const raw = opts.body === undefined ? "" : typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body);
  return {
    method,
    url: path,
    headers: { ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}), ...(opts.body !== undefined ? { "content-type": "application/json" } : {}), ...(opts.headers ?? {}) },
    remoteAddress: "203.0.113.9",
    readBody: opts.readBody ?? (async () => raw),
  };
}

export type Json = ApiResponse & { json: any };
export async function call(w: { handler: ApiHandler }, method: string, path: string, opts: Parameters<typeof chatRequest>[2] = {}): Promise<Json> {
  const res = await w.handler(chatRequest(method, path, opts));
  let json: any;
  try {
    json = JSON.parse(res.body);
  } catch {
    json = undefined;
  }
  return Object.assign(res, { json });
}

export const threadsPath = (studentId: string) => `/v1/students/${studentId}/chat/threads`;
export const turnsPath = (studentId: string, threadId: string) => `${threadsPath(studentId)}/${threadId}/turns`;
export const profilePath = (studentId: string) => `/v1/students/${studentId}/chat/profile`;

/** Creates a thread for the token's student and returns its id. */
export async function newThread(w: { handler: ApiHandler }, token: string, studentId = "stu-1"): Promise<string> {
  const res = await call(w, "POST", threadsPath(studentId), { token });
  if (res.status !== 201) throw new Error(`thread create failed: ${res.status} ${res.body}`);
  return res.json.threadId as string;
}

/** The JSON of every document in every collection of the fake Db, as one string (for "no raw text anywhere" checks). */
export function everythingStored(fakeDb: FakeDb): string {
  const out: unknown[] = [];
  for (const name of Object.values(COLLECTION_NAMES)) out.push(...fakeDb.collection<{ _id: string }>(name).all());
  return JSON.stringify(out);
}

export { APPROVER, NOW, SKILLS_DIR, SPEAKERS, cleanupGates, gatesFixture, kbAnswerProvider, recordingKb };
