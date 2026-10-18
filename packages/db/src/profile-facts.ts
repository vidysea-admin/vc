/**
 * P1 U8 (spec A16b, D-093 6A): chat-proposed profile facts. The engine (or the turn handler) proposes a fact it heard in chat;
 * it is NEVER used until the student confirms it, and the student may correct or erase it. The Pathlynks-supplied profile is
 * not stored here (it comes through a port in apps/api/src/chat.ts and is read live).
 *
 * New file, on purpose: facts.ts holds the counsellor-approved Fact graph (provenance, edges, supersession). This is the
 * student's own lightweight confirm/correct list; the two do not share rows.
 *
 * Values are redacted (names, phones, emails) before they are stored, like every other student text (D-093 6A). One row per
 * (student, key): `_id` is a hash of both, so proposing the same key again never makes a duplicate and never downgrades a
 * confirmed fact. Tenant-scoped Db only; every write is fence-aware.
 */
import { createHash } from "node:crypto";
import type { Collection, Db } from "mongodb";
import { redactPii } from "@vc/schemas";
import { COLLECTION_NAMES } from "./collections.js";
import { fencedStudentWrite, requireNonEmptyFields, requireScopedDb } from "./chat-threads.js";

export type ProfileFactStatus = "proposed" | "confirmed";

export interface ProfileFactDoc {
  _id: string;
  factId: string;
  studentId: string;
  key: string;
  /** Redacted. */
  value: string;
  status: ProfileFactStatus;
  source: "chat";
  threadId?: string;
  turnId?: string;
  proposedAt: string;
  decidedAt?: string;
}

export class ProfileFactNotFoundError extends Error {
  constructor() {
    super("ProfileFactNotFoundError: no such fact for this student");
    this.name = "ProfileFactNotFoundError";
  }
}

const factsOf = (db: Db): Collection<ProfileFactDoc> => db.collection<ProfileFactDoc>(COLLECTION_NAMES.profile_facts);

export function profileFactId(studentId: string, key: string): string {
  return createHash("sha256").update(`${studentId}\u0000${key}`).digest("hex").slice(0, 32);
}

function checkValue(raw: string, caller: string): string {
  if (typeof raw !== "string") throw new Error(`${caller}: value must be a string`);
  const value = redactPii(raw.trim()).text;
  if (value === "" || value.length > 1000) throw new Error(`${caller}: value must be 1-1000 characters`);
  return value;
}

export interface ProposeProfileFactInput {
  studentId: string;
  key: string;
  value: string;
  threadId?: string;
  turnId?: string;
}

/** Records a fact heard in chat as `proposed`. An existing confirmed fact for the key is left untouched; an existing proposed one takes the newer value. */
export async function proposeProfileFact(db: Db, input: ProposeProfileFactInput, options: { now?: Date } = {}): Promise<ProfileFactDoc> {
  requireScopedDb(db, "proposeProfileFact");
  requireNonEmptyFields({ studentId: input.studentId, key: input.key }, "proposeProfileFact");
  if (input.key.length > 128) throw new Error("proposeProfileFact: key must be at most 128 characters");
  const value = checkValue(input.value, "proposeProfileFact");
  // The key is model-chosen text too (p1-u8r low): a phone number or email in it is redacted like the value. Keys a model keeps stable are unchanged.
  const key = redactPii(input.key).text;
  const factId = profileFactId(input.studentId, key);
  const at = (options.now ?? new Date()).toISOString();
  const origin = {
    ...(input.threadId === undefined ? {} : { threadId: input.threadId }),
    ...(input.turnId === undefined ? {} : { turnId: input.turnId }),
  };
  const created: string[] = [];
  await fencedStudentWrite(
    db,
    input.studentId,
    async (op) => {
      const res = await factsOf(db).updateOne(
        { _id: factId, studentId: input.studentId } as never,
        { $setOnInsert: { factId, key, value, status: "proposed", source: "chat", proposedAt: at, ...origin } } as never,
        { upsert: true, ...op },
      );
      if (res.upsertedCount === 1) {
        created.push(factId);
        return;
      }
      await factsOf(db).updateOne(
        { _id: factId, studentId: input.studentId, status: "proposed" } as never,
        { $set: { value, proposedAt: at, ...origin } } as never,
        op,
      );
    },
    () => (created.length === 0 ? Promise.resolve() : factsOf(db).deleteMany({ _id: { $in: created }, studentId: input.studentId } as never)),
  );
  const row = await factsOf(db).findOne({ _id: factId, studentId: input.studentId } as never);
  return row as ProfileFactDoc;
}

export async function listProfileFacts(db: Db, input: { studentId: string }): Promise<ProfileFactDoc[]> {
  requireScopedDb(db, "listProfileFacts");
  requireNonEmptyFields(input, "listProfileFacts");
  const rows = await factsOf(db).find({ studentId: input.studentId } as never).toArray();
  return rows.sort((x, y) => x.key.localeCompare(y.key));
}

export interface DecideProfileFactInput {
  studentId: string;
  factId: string;
  action: "confirm" | "correct" | "erase";
  /** Required for `correct`. */
  value?: string;
}

/** The student's decision on one fact. Returns the updated row, or null after an erase. */
export async function decideProfileFact(db: Db, input: DecideProfileFactInput, options: { now?: Date } = {}): Promise<ProfileFactDoc | null> {
  requireScopedDb(db, "decideProfileFact");
  requireNonEmptyFields({ studentId: input.studentId, factId: input.factId }, "decideProfileFact");
  const filter = { _id: input.factId, studentId: input.studentId } as never;
  const existing = await factsOf(db).findOne(filter);
  if (!existing) throw new ProfileFactNotFoundError();
  const at = (options.now ?? new Date()).toISOString();
  if (input.action === "erase") {
    await fencedStudentWrite(db, input.studentId, (op) => factsOf(db).deleteMany(filter, op), async () => undefined);
    return null;
  }
  const set: Record<string, unknown> = { status: "confirmed", decidedAt: at };
  if (input.action === "correct") {
    if (input.value === undefined) throw new Error("decideProfileFact: correct needs a value");
    set.value = checkValue(input.value, "decideProfileFact");
  }
  await fencedStudentWrite(db, input.studentId, (op) => factsOf(db).updateOne(filter, { $set: set } as never, op), async () => undefined);
  return factsOf(db).findOne(filter);
}
