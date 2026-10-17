/**
 * P1 U8 (spec A7, D-093 4A): the text-free student safety log and the gap counts.
 *
 *   student_flags     one row per flagged turn: student, thread, turn, kind and time. IDs and time only, never any text. It is the
 *                     durable "this thread had a crisis/concern turn" signal the turn handler reads and the counsellor-side review
 *                     can count. Kept for an under-18 student without guardian consent too: a safety log of ids and time holds
 *                     nothing the student said (reported as an open risk in the manifest).
 *   chat_gap_counts   per day, per kind counts of turns the engine could not answer from a source. No student, thread, text or
 *                     topic: a count only, so it holds nothing to erase (ERASURE_EXEMPT_COLLECTIONS).
 *
 * Tenant-scoped Db only. The flag row is a fence-aware student write; the gap count is not (it names no student).
 */
import type { Collection, Db } from "mongodb";
import { COLLECTION_NAMES } from "./collections.js";
import { fencedStudentWrite, requireNonEmptyFields, requireScopedDb } from "./chat-threads.js";

export const STUDENT_FLAG_KINDS = ["crisis", "concern"] as const;
export type StudentFlagKind = (typeof STUDENT_FLAG_KINDS)[number];
export const GAP_KINDS = ["no_sourced_answer", "unverified_claim"] as const;
export type GapKind = (typeof GAP_KINDS)[number];

export interface StudentFlagDoc {
  _id: string;
  studentId: string;
  threadId: string;
  turnId: string;
  kind: StudentFlagKind;
  at: string;
}
export interface GapCountDoc {
  _id: string;
  date: string;
  kind: GapKind;
  count: number;
}

const flagsOf = (db: Db): Collection<StudentFlagDoc> => db.collection<StudentFlagDoc>(COLLECTION_NAMES.student_flags);
const gapsOf = (db: Db): Collection<GapCountDoc> => db.collection<GapCountDoc>(COLLECTION_NAMES.chat_gap_counts);

export async function recordStudentFlag(
  db: Db,
  input: { studentId: string; threadId: string; turnId: string; kind: StudentFlagKind },
  options: { now?: Date } = {},
): Promise<void> {
  requireScopedDb(db, "recordStudentFlag");
  requireNonEmptyFields({ studentId: input.studentId, threadId: input.threadId, turnId: input.turnId }, "recordStudentFlag");
  if (!(STUDENT_FLAG_KINDS as readonly string[]).includes(input.kind)) throw new Error("recordStudentFlag: unknown kind");
  const _id = `${input.threadId}:${input.turnId}:${input.kind}`;
  const created: string[] = [];
  await fencedStudentWrite(
    db,
    input.studentId,
    async (op) => {
      const res = await flagsOf(db).updateOne(
        { _id, studentId: input.studentId } as never,
        { $setOnInsert: { threadId: input.threadId, turnId: input.turnId, kind: input.kind, at: (options.now ?? new Date()).toISOString() } } as never,
        { upsert: true, ...op },
      );
      if (res.upsertedCount === 1) created.push(_id);
    },
    () => (created.length === 0 ? Promise.resolve() : flagsOf(db).deleteMany({ _id: { $in: created }, studentId: input.studentId } as never)),
  );
}

export async function listStudentFlags(db: Db, input: { studentId: string; threadId?: string }): Promise<StudentFlagDoc[]> {
  requireScopedDb(db, "listStudentFlags");
  requireNonEmptyFields({ studentId: input.studentId }, "listStudentFlags");
  const rows = await flagsOf(db)
    .find({ studentId: input.studentId, ...(input.threadId === undefined ? {} : { threadId: input.threadId }) } as never)
    .toArray();
  return rows.sort((x, y) => x.at.localeCompare(y.at) || x._id.localeCompare(y._id));
}

export async function incrementGapCount(db: Db, input: { kind: GapKind }, options: { now?: Date } = {}): Promise<void> {
  requireScopedDb(db, "incrementGapCount");
  if (!(GAP_KINDS as readonly string[]).includes(input.kind)) throw new Error("incrementGapCount: unknown kind");
  const date = (options.now ?? new Date()).toISOString().slice(0, 10);
  await gapsOf(db).updateOne(
    { _id: `${date}:${input.kind}` } as never,
    { $setOnInsert: { date, kind: input.kind }, $inc: { count: 1 } } as never,
    { upsert: true },
  );
}

export async function listGapCounts(db: Db, input: { date: string }): Promise<Array<{ date: string; kind: GapKind; count: number }>> {
  requireScopedDb(db, "listGapCounts");
  requireNonEmptyFields(input, "listGapCounts");
  const rows = await gapsOf(db).find({ date: input.date } as never).toArray();
  return rows.map((r) => ({ date: r.date, kind: r.kind, count: r.count })).sort((x, y) => x.kind.localeCompare(y.kind));
}
