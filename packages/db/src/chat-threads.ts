/**
 * P1 U8 (D-093 4A/6A, contract B24, spec A6/A19/A23): the authenticated student chat store.
 *
 * New file, on purpose: no module owned a chat thread. recordSessionTranscript (facts.ts) is the COUNSELLING session transcript
 * (verbatim, per D-020, behind a consent row); this is the student's own self-serve chat (redacted, per D-093 6A), with its own
 * collections so the two retention rules never mix.
 *
 *   chat_threads  one marker per thread: ids, times and `textStored`. No text. An under-18 student without a guardian-consent
 *                 signal gets `textStored:false` and NO chat_turns rows at all (D-093 4A).
 *   chat_turns    the (already redacted) turns, user and assistant, text and voice in ONE history (A19). `_id` is
 *                 `${threadId}:${turnId}:u|a`. The user row doubles as the idempotency claim for the exchange.
 *   student_usage per student per month counters (text turns, voice ms); the quota source for A23.
 *
 * Rules every function here follows:
 *   - The Db MUST be tenant-scoped (tenantScopedDb): an unscoped Db throws TenantScopeError. Tenancy is not a parameter.
 *   - Redaction happens in the caller (@vc/schemas redactPii); this store never sees or stores a raw name, phone or email.
 *   - Every write is a fence-aware writer (D-015/D-016): pre-check, bounded deadline, post-check that undoes exactly what the
 *     call created if the student was fenced meanwhile. A student under erasure gets nothing written.
 */
import { randomUUID } from "node:crypto";
import type { Collection, Db } from "mongodb";
import { COLLECTION_NAMES } from "./collections.js";
import {
  FencedWriterDeadlineError,
  StudentFencedError,
  WriterDeadline,
  assertStudentNotFenced,
  compensateIfFenced,
} from "./erasure.js";
import { TenantScopeError, tenantIdOf } from "./tenant.js";

export interface ChatThreadDoc {
  _id: string;
  threadId: string;
  studentId: string;
  createdAt: string;
  lastActivityAt: string;
  /** false once any turn of this thread was answered without storing its text (D-093 4A). */
  textStored: boolean;
}

export type ChatChannel = "text" | "voice";

export interface ChatTurnDoc {
  _id: string;
  threadId: string;
  studentId: string;
  turnId: string;
  role: "user" | "assistant";
  channel: ChatChannel;
  /** Redacted text. */
  text: string;
  /** The exchange's timestamp: the assistant row carries its user row's `at`, so a pair sorts together. */
  at: string;
  order: 0 | 1;
  /** User row only: sha256 of the redacted request text; the idempotency check compares it. */
  requestHash?: string;
  /** User row only. */
  status?: "in_progress" | "done";
  /** User row only, while in_progress. */
  lease?: { token: string; expiresAt: string };
  /** Assistant row only: the full validated TurnResponse (message already redacted). */
  response?: Record<string, unknown>;
  completedAt?: string;
  /**
   * P1 U10 (A9b): assistant row of a VOICE turn only. The post-hoc audit findings for that spoken answer, stored with the thread
   * so they are exported and erased with it. `detail` is a figure for an uncited number and absent otherwise (never a name).
   */
  voiceAudit?: Array<{ reason: string; detail?: string; at: string }>;
}

export interface StudentUsageDoc {
  _id: string;
  studentId: string;
  month: string;
  textTurns: number;
  voiceMs: number;
}

export class ChatThreadNotFoundError extends Error {
  constructor() {
    super("ChatThreadNotFoundError: no such thread for this student");
    this.name = "ChatThreadNotFoundError";
  }
}
/** The same turn id was sent again with different text, or the id belongs to someone else. */
export class ChatTurnConflictError extends Error {
  constructor() {
    super("ChatTurnConflictError: this turn id was already used for a different request");
    this.name = "ChatTurnConflictError";
  }
}
/** The caller no longer holds the turn's lease (it expired and another attempt took over). */
export class ChatTurnLeaseLostError extends Error {
  constructor() {
    super("ChatTurnLeaseLostError: this attempt no longer holds the turn");
    this.name = "ChatTurnLeaseLostError";
  }
}

/** How long a claimed turn stays exclusively owned by one attempt. Covers one model round trip with room to spare. */
export const CHAT_TURN_LEASE_MS = 90_000;

export function chatTurnDocId(threadId: string, turnId: string, role: "user" | "assistant"): string {
  return `${threadId}:${turnId}:${role === "user" ? "u" : "a"}`;
}

/** The UTC month key `YYYY-MM` the usage counters use. */
export function usageMonth(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7);
}

export function requireScopedDb(db: Db, caller: string): void {
  if (tenantIdOf(db) === undefined) throw new TenantScopeError(`${caller} needs a tenant-scoped Db`);
}

export function requireNonEmptyFields(fields: Record<string, unknown>, caller: string): void {
  for (const [k, v] of Object.entries(fields)) {
    if (typeof v !== "string" || v.trim() === "") throw new Error(`${caller}: ${k} must be a non-empty string`);
  }
}

const threadsOf = (db: Db): Collection<ChatThreadDoc> => db.collection<ChatThreadDoc>(COLLECTION_NAMES.chat_threads);
const turnsOf = (db: Db): Collection<ChatTurnDoc> => db.collection<ChatTurnDoc>(COLLECTION_NAMES.chat_turns);
const usageOf = (db: Db): Collection<StudentUsageDoc> => db.collection<StudentUsageDoc>(COLLECTION_NAMES.student_usage);

export const isDuplicateKey = (err: unknown): boolean => typeof err === "object" && err !== null && (err as { code?: unknown }).code === 11000;

/**
 * Runs one fence-aware write (D-015/D-016), mirroring applyApprovedDiff / recordApprovedSessionSummary: the deadline starts before
 * the fence pre-check; the post-check ALWAYS runs and, if the student got fenced, `undo` removes exactly what this call created.
 */
export async function fencedStudentWrite<T>(
  db: Db,
  studentId: string,
  work: (op: { timeoutMS: number }) => Promise<T>,
  undo: () => Promise<unknown>,
): Promise<T> {
  const deadline = new WriterDeadline();
  try {
    await deadline.run(assertStudentNotFenced(db, studentId, deadline.op()));
  } catch (err) {
    deadline.dispose();
    if (deadline.expired() && !(err instanceof StudentFencedError)) throw new FencedWriterDeadlineError(Promise.resolve(), { cause: err });
    throw err;
  }
  const running = work(deadline.op());
  let failure: { err: unknown } | null = null;
  let result: T | undefined;
  try {
    result = await deadline.run(running);
  } catch (err) {
    failure = { err };
  } finally {
    deadline.dispose();
  }
  const timedOut = failure !== null && deadline.expired();
  const settled: Promise<void> = timedOut
    ? running.then(() => undo(), () => undo()).then(() => undefined, () => undefined)
    : Promise.resolve();
  await compensateIfFenced(db, studentId, undo, { ...(failure ? { cause: failure.err } : {}), alwaysUndo: timedOut });
  if (timedOut) throw new FencedWriterDeadlineError(settled, { cause: failure!.err });
  if (failure) throw failure.err;
  return result as T;
}

export interface CreateChatThreadInput {
  studentId: string;
  /** false for an under-18 student without a guardian-consent signal: the thread is a text-free marker. */
  textStored: boolean;
  /** Optional caller-chosen id (tests); normally generated. */
  threadId?: string;
}

export async function createChatThread(db: Db, input: CreateChatThreadInput, options: { now?: Date } = {}): Promise<ChatThreadDoc> {
  requireScopedDb(db, "createChatThread");
  requireNonEmptyFields({ studentId: input.studentId }, "createChatThread");
  const threadId = input.threadId ?? randomUUID();
  requireNonEmptyFields({ threadId }, "createChatThread");
  const at = (options.now ?? new Date()).toISOString();
  const doc: ChatThreadDoc = { _id: threadId, threadId, studentId: input.studentId, createdAt: at, lastActivityAt: at, textStored: input.textStored };
  await fencedStudentWrite(
    db,
    input.studentId,
    (op) => threadsOf(db).insertOne(doc as never, op),
    () => threadsOf(db).deleteMany({ _id: threadId, studentId: input.studentId } as never),
  );
  return doc;
}

export async function getChatThread(db: Db, input: { studentId: string; threadId: string }): Promise<ChatThreadDoc | null> {
  requireScopedDb(db, "getChatThread");
  requireNonEmptyFields(input, "getChatThread");
  return threadsOf(db).findOne({ _id: input.threadId, studentId: input.studentId } as never);
}

/** Flags a thread as having an unstored turn (the guardian-consent signal was missing for it). Idempotent. */
export async function markChatThreadTextNotStored(db: Db, input: { studentId: string; threadId: string }): Promise<void> {
  requireScopedDb(db, "markChatThreadTextNotStored");
  requireNonEmptyFields(input, "markChatThreadTextNotStored");
  await fencedStudentWrite(
    db,
    input.studentId,
    async (op) => {
      const res = await threadsOf(db).updateOne({ _id: input.threadId, studentId: input.studentId } as never, { $set: { textStored: false } }, op);
      if (res.matchedCount === 0) throw new ChatThreadNotFoundError();
    },
    async () => undefined, // an idempotent flag on a row erasure purges; there is nothing created to undo
  );
}

/** A thread's stored turns in history order: exchange time, then turn id, user before assistant. Read-only. */
export async function listChatTurns(db: Db, input: { studentId: string; threadId: string }): Promise<ChatTurnDoc[]> {
  requireScopedDb(db, "listChatTurns");
  requireNonEmptyFields(input, "listChatTurns");
  const docs = await turnsOf(db).find({ studentId: input.studentId, threadId: input.threadId } as never).toArray();
  return docs.sort((x, y) => x.at.localeCompare(y.at) || x.turnId.localeCompare(y.turnId) || x.order - y.order);
}

export interface ClaimChatTurnInput {
  studentId: string;
  threadId: string;
  turnId: string;
  /** Redacted. */
  text: string;
  /** sha256 of the redacted text; a retry must carry the same one. */
  requestHash: string;
  channel: ChatChannel;
}

export type ClaimChatTurnResult =
  | { kind: "claimed"; leaseToken: string }
  | { kind: "replay"; response: Record<string, unknown> }
  | { kind: "in_progress" };

/**
 * Claims one exchange for the caller (the idempotency step). First call: inserts the user row `in_progress` with a lease and
 * returns `claimed`. The same turn id again: `replay` once the exchange is done, `in_progress` while another attempt holds the
 * lease, and a takeover (new lease, `claimed`) once the lease has expired. Different text under the same turn id throws
 * ChatTurnConflictError. A thread that is not the student's throws ChatThreadNotFoundError.
 */
export async function claimChatTurn(
  db: Db,
  input: ClaimChatTurnInput,
  options: { now?: Date; leaseMs?: number } = {},
): Promise<ClaimChatTurnResult> {
  requireScopedDb(db, "claimChatTurn");
  requireNonEmptyFields({ studentId: input.studentId, threadId: input.threadId, turnId: input.turnId, requestHash: input.requestHash }, "claimChatTurn");
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();
  const leaseMs = options.leaseMs ?? CHAT_TURN_LEASE_MS;
  const lease = { token: randomUUID(), expiresAt: new Date(now.getTime() + leaseMs).toISOString() };
  const userId = chatTurnDocId(input.threadId, input.turnId, "user");
  const assistId = chatTurnDocId(input.threadId, input.turnId, "assistant");

  if ((await getChatThread(db, { studentId: input.studentId, threadId: input.threadId })) === null) throw new ChatThreadNotFoundError();

  const created: string[] = [];
  const outcome = await fencedStudentWrite(
    db,
    input.studentId,
    async (op) => {
      let res: { upsertedCount?: number } | null = null;
      try {
        res = await turnsOf(db).updateOne(
          { _id: userId, studentId: input.studentId } as never,
          {
            $setOnInsert: {
              threadId: input.threadId,
              turnId: input.turnId,
              role: "user",
              channel: input.channel,
              text: input.text,
              at: nowIso,
              order: 0,
              requestHash: input.requestHash,
              status: "in_progress",
              lease,
            },
          } as never,
          { upsert: true, ...op },
        );
      } catch (err) {
        if (!isDuplicateKey(err)) throw err; // 11000: the id exists for ANOTHER student, or a concurrent insert won; resolved below
      }
      if (res?.upsertedCount === 1) {
        created.push(userId);
        await threadsOf(db).updateOne({ _id: input.threadId, studentId: input.studentId } as never, { $set: { lastActivityAt: nowIso } }, op);
        return { kind: "claimed", leaseToken: lease.token } as ClaimChatTurnResult;
      }
      const existing = await turnsOf(db).findOne({ _id: userId, studentId: input.studentId } as never, op);
      if (existing === null || existing.requestHash !== input.requestHash) throw new ChatTurnConflictError();
      const stored = await turnsOf(db).findOne({ _id: assistId, studentId: input.studentId } as never, op);
      if (existing.status === "done" && stored?.response) return { kind: "replay", response: stored.response } as ClaimChatTurnResult;
      if (existing.lease !== undefined && existing.lease.expiresAt >= nowIso) return { kind: "in_progress" } as ClaimChatTurnResult;
      if (stored?.response) {
        // The previous holder wrote the answer but died before closing the exchange: close it now and replay that answer.
        await turnsOf(db).updateOne(
          { _id: userId, studentId: input.studentId, status: "in_progress" } as never,
          { $set: { status: "done" }, $unset: { lease: "" } } as never,
          op,
        );
        return { kind: "replay", response: stored.response } as ClaimChatTurnResult;
      }
      const took = await turnsOf(db).updateOne(
        { _id: userId, studentId: input.studentId, status: "in_progress", "lease.expiresAt": { $lt: nowIso } } as never,
        { $set: { lease } } as never,
        op,
      );
      return (took.matchedCount === 1 ? { kind: "claimed", leaseToken: lease.token } : { kind: "in_progress" }) as ClaimChatTurnResult;
    },
    () => (created.length === 0 ? Promise.resolve() : turnsOf(db).deleteMany({ _id: { $in: created }, studentId: input.studentId } as never)),
  );
  return outcome;
}

export interface CompleteChatTurnInput {
  studentId: string;
  threadId: string;
  turnId: string;
  leaseToken: string;
  channel: ChatChannel;
  /** Redacted assistant message. */
  assistantText: string;
  /** The validated TurnResponse (its message already redacted); replayed verbatim on a retry. */
  response: Record<string, unknown>;
}

/** Stores the answer and closes the exchange. Throws ChatTurnLeaseLostError if the caller's lease was taken over. */
export async function completeChatTurn(db: Db, input: CompleteChatTurnInput, options: { now?: Date } = {}): Promise<void> {
  requireScopedDb(db, "completeChatTurn");
  requireNonEmptyFields({ studentId: input.studentId, threadId: input.threadId, turnId: input.turnId, leaseToken: input.leaseToken }, "completeChatTurn");
  const userId = chatTurnDocId(input.threadId, input.turnId, "user");
  const assistId = chatTurnDocId(input.threadId, input.turnId, "assistant");
  const user = await turnsOf(db).findOne({ _id: userId, studentId: input.studentId } as never);
  if (!user || user.status !== "in_progress" || user.lease?.token !== input.leaseToken) throw new ChatTurnLeaseLostError();
  const completedAt = (options.now ?? new Date()).toISOString();
  const created: string[] = [];
  await fencedStudentWrite(
    db,
    input.studentId,
    async (op) => {
      const res = await turnsOf(db).updateOne(
        { _id: assistId, studentId: input.studentId } as never,
        {
          $setOnInsert: {
            threadId: input.threadId,
            turnId: input.turnId,
            role: "assistant",
            channel: input.channel,
            text: input.assistantText,
            at: user.at,
            order: 1,
            response: input.response,
            completedAt,
          },
        } as never,
        { upsert: true, ...op },
      );
      if (res.upsertedCount === 1) created.push(assistId);
      const flip = await turnsOf(db).updateOne(
        { _id: userId, studentId: input.studentId, status: "in_progress", "lease.token": input.leaseToken } as never,
        { $set: { status: "done" }, $unset: { lease: "" } } as never,
        op,
      );
      if (flip.matchedCount === 0) throw new ChatTurnLeaseLostError();
    },
    () => (created.length === 0 ? Promise.resolve() : turnsOf(db).deleteMany({ _id: { $in: created }, studentId: input.studentId } as never)),
  );
}

/** Drops a claim whose turn failed (model error), so the student's retry runs again. Only the lease holder can. */
export async function abandonChatTurn(db: Db, input: { studentId: string; threadId: string; turnId: string; leaseToken: string }): Promise<void> {
  requireScopedDb(db, "abandonChatTurn");
  requireNonEmptyFields(input, "abandonChatTurn");
  await turnsOf(db).deleteMany({
    _id: chatTurnDocId(input.threadId, input.turnId, "user"),
    studentId: input.studentId,
    status: "in_progress",
    "lease.token": input.leaseToken,
  } as never);
}

export interface AppendVoiceTurnInput {
  studentId: string;
  threadId: string;
  /** Shared by the user row and the assistant row of one spoken exchange. */
  turnId: string;
  role: "user" | "assistant";
  /** Final transcript, ALREADY redacted by the caller (D-093 6A). Never called for an unconsented minor (D-093 4A). */
  text: string;
  /** ISO time of the exchange; the assistant row passes its user row's `at`, so a pair sorts together. */
  at: string;
}

/**
 * P1 U10 (A19): stores ONE side of a spoken (voice) exchange in the same thread as the text turns (`channel: "voice"`). Idempotent on
 * (thread, turn, role): a second call for the same side changes nothing. Fence-aware like every student write. Throws
 * ChatThreadNotFoundError when the thread is not the student's. The caller writes the user side when the final user transcript arrives
 * and the assistant side when the final assistant transcript arrives (a spoken answer may be cut off, so the sides are independent).
 */
export async function appendVoiceTurn(db: Db, input: AppendVoiceTurnInput): Promise<void> {
  requireScopedDb(db, "appendVoiceTurn");
  requireNonEmptyFields({ studentId: input.studentId, threadId: input.threadId, turnId: input.turnId, at: input.at }, "appendVoiceTurn");
  if (input.role !== "user" && input.role !== "assistant") throw new Error("appendVoiceTurn: role must be user or assistant");
  if (typeof input.text !== "string") throw new Error("appendVoiceTurn: text must be a string");
  if (Number.isNaN(Date.parse(input.at))) throw new Error("appendVoiceTurn: at must be an ISO time");
  if ((await getChatThread(db, { studentId: input.studentId, threadId: input.threadId })) === null) throw new ChatThreadNotFoundError();
  const _id = chatTurnDocId(input.threadId, input.turnId, input.role);
  const created: string[] = [];
  await fencedStudentWrite(
    db,
    input.studentId,
    async (op) => {
      const res = await turnsOf(db).updateOne(
        { _id, studentId: input.studentId } as never,
        {
          $setOnInsert: {
            threadId: input.threadId,
            turnId: input.turnId,
            role: input.role,
            channel: "voice",
            text: input.text,
            at: input.at,
            order: input.role === "user" ? 0 : 1,
            status: "done",
            completedAt: input.at,
          },
        } as never,
        { upsert: true, ...op },
      );
      if (res.upsertedCount === 1) {
        created.push(_id);
        await threadsOf(db).updateOne({ _id: input.threadId, studentId: input.studentId } as never, { $set: { lastActivityAt: input.at } }, op);
      }
    },
    () => (created.length === 0 ? Promise.resolve() : turnsOf(db).deleteMany({ _id: { $in: created }, studentId: input.studentId } as never)),
  );
}

export interface AppendVoiceAuditInput {
  studentId: string;
  threadId: string;
  /** The turn whose ASSISTANT row the finding belongs to. */
  turnId: string;
  reason: string;
  /** A figure for an uncited number; omit for a listed speaker (the name is never stored). */
  detail?: string;
  at: string;
}

/** P1 U10 (A9b): attaches one post-hoc audit finding to the assistant row of a voice turn. Idempotent (an identical finding is not added twice). */
export async function appendVoiceAudit(db: Db, input: AppendVoiceAuditInput): Promise<void> {
  requireScopedDb(db, "appendVoiceAudit");
  requireNonEmptyFields({ studentId: input.studentId, threadId: input.threadId, turnId: input.turnId, reason: input.reason, at: input.at }, "appendVoiceAudit");
  const _id = chatTurnDocId(input.threadId, input.turnId, "assistant");
  const finding = { reason: input.reason, ...(input.detail !== undefined ? { detail: input.detail } : {}), at: input.at };
  await fencedStudentWrite(
    db,
    input.studentId,
    async (op) => {
      const res = await turnsOf(db).updateOne({ _id, studentId: input.studentId, channel: "voice" } as never, { $addToSet: { voiceAudit: finding } } as never, op);
      if (res.matchedCount === 0) throw new ChatThreadNotFoundError();
    },
    async () => undefined, // adds a field to a row erasure purges; there is nothing created to undo
  );
}

export interface RecordStudentUsageInput {
  studentId: string;
  textTurns?: number;
  voiceMs?: number;
}

/** Adds to the student's counters for the current UTC month (A23 quota source). Fence-aware like every student write. */
export async function recordStudentUsage(db: Db, input: RecordStudentUsageInput, options: { now?: Date } = {}): Promise<void> {
  requireScopedDb(db, "recordStudentUsage");
  requireNonEmptyFields({ studentId: input.studentId }, "recordStudentUsage");
  const textTurns = input.textTurns ?? 0;
  const voiceMs = input.voiceMs ?? 0;
  if (!Number.isInteger(textTurns) || !Number.isInteger(voiceMs) || textTurns < 0 || voiceMs < 0) {
    throw new Error("recordStudentUsage: counters must be non-negative integers");
  }
  const month = usageMonth(options.now);
  const _id = `${month}:${input.studentId}`;
  await fencedStudentWrite(
    db,
    input.studentId,
    (op) =>
      usageOf(db).updateOne(
        { _id, studentId: input.studentId } as never,
        { $setOnInsert: { month }, $inc: { textTurns, voiceMs } } as never,
        { upsert: true, ...op },
      ),
    () => usageOf(db).deleteMany({ _id, studentId: input.studentId } as never),
  );
}

export async function getStudentUsage(
  db: Db,
  input: { studentId: string; month: string },
): Promise<{ month: string; textTurns: number; voiceMs: number }> {
  requireScopedDb(db, "getStudentUsage");
  requireNonEmptyFields(input, "getStudentUsage");
  const doc = await usageOf(db).findOne({ _id: `${input.month}:${input.studentId}`, studentId: input.studentId } as never);
  return { month: input.month, textTurns: doc?.textTurns ?? 0, voiceMs: doc?.voiceMs ?? 0 };
}
