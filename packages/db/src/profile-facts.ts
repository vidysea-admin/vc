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
import { createHash, randomUUID } from "node:crypto";
import type { Collection, Db } from "mongodb";
import { AUTHORITATIVE_PROFILE_KEY, canonicalPreferenceKey, redactPii, type PendingProfileChange } from "@vc/schemas";
import { assertStudentNotFenced, StudentFencedError } from "./erasure.js";
import { COLLECTION_NAMES } from "./collections.js";
import { fencedStudentWrite, getChatThread, requireNonEmptyFields, requireScopedDb } from "./chat-threads.js";

export type ProfileFactStatus = "proposed" | "confirmed";

export interface ProfileFactDoc {
  _id: string;
  factId: string;
  studentId: string;
  key: string;
  /** Redacted. English by definition (D-104): the student knowledge graph is English. */
  value: string;
  /** p1-lk6 (additive, optional): the student's own words the value came from, in their ORIGINAL language and script. Redacted like `value`. */
  quote?: string;
  /** p1-lk6 (additive, optional): the language label of `quote` (a BCP 47 style tag such as "hi"). Absent when unknown. */
  sourceLang?: string;
  status: ProfileFactStatus;
  source: "chat";
  threadId?: string;
  turnId?: string;
  proposedAt: string;
  decidedAt?: string;
  /** Internal publication metadata, never student-confirmed authority. */
  proposalToken?: string;
  proposalPending?: boolean;
  pendingChange?: PendingProfileChange;
}

export class ProfileFactNotFoundError extends Error {
  constructor() {
    super("ProfileFactNotFoundError: no such fact for this student");
    this.name = "ProfileFactNotFoundError";
  }
}

const factsOf = (db: Db): Collection<ProfileFactDoc> => db.collection<ProfileFactDoc>(COLLECTION_NAMES.profile_facts);
/** A valid ISO cutoff that precedes every turn: "no history is cut". */
const NO_HISTORY_CUT = "1970-01-01T00:00:00.000Z";

export function profileFactId(studentId: string, key: string): string {
  const canonical = canonicalPreferenceKey(key);
  if (canonical === null) throw new TypeError("profileFactId: authoritative account field");
  return createHash("sha256").update(`${studentId}\u0000${canonical}`).digest("hex").slice(0, 32);
}

function checkValue(raw: string, caller: string): string {
  if (typeof raw !== "string") throw new Error(`${caller}: value must be a string`);
  const value = redactPii(raw.trim()).text;
  if (value === "" || value.length > 1000) throw new Error(`${caller}: value must be 1-1000 characters`);
  return value;
}

/** Longest quote kept after redaction; a longer one is not a snippet and is left out. */
export const MAX_PROFILE_FACT_QUOTE = 1000;
const SOURCE_LANG_RE = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

/** The optional quote and language label as stored fields: redacted, and left out (never an error) when unusable, so a bad quote cannot cost the fact. */
function checkSource(input: { quote?: string; sourceLang?: string }): { quote?: string; sourceLang?: string } {
  const quote = typeof input.quote === "string" ? redactPii(input.quote.trim()).text : "";
  if (quote === "" || quote.length > MAX_PROFILE_FACT_QUOTE) return {};
  return {
    quote,
    ...(typeof input.sourceLang === "string" && input.sourceLang.length <= 35 && SOURCE_LANG_RE.test(input.sourceLang) ? { sourceLang: input.sourceLang } : {}),
  };
}

export interface ProposeProfileFactInput {
  expectedRevision?:string;
  studentId: string;
  key: string;
  value: string;
  /** p1-lk6: the student's original-language words behind `value`. Optional; redacted before it is stored. */
  quote?: string;
  /** p1-lk6: the language label of `quote`. Optional; stored only together with a usable quote. */
  sourceLang?: string;
  threadId?: string;
  turnId?: string;
}

/** Stage one bounded candidate without replacing the active confirmed value or its provenance. */
export async function proposeProfileFact(db: Db, input: ProposeProfileFactInput, options: { now?: Date } = {}): Promise<ProfileFactDoc | null> {
  requireScopedDb(db, "proposeProfileFact");
  requireNonEmptyFields({ studentId: input.studentId, key: input.key }, "proposeProfileFact");
  if (input.threadId && (await getChatThread(db,{studentId:input.studentId,threadId:input.threadId}))?.textStored === false) return null;
  if (input.key.length > 128) throw new Error("proposeProfileFact: key must be at most 128 characters");
  const value = checkValue(input.value, "proposeProfileFact");
  // The key is model-chosen text too (p1-u8r low): a phone number or email in it is redacted like the value. Keys a model keeps stable are unchanged.
  const key = canonicalPreferenceKey(redactPii(input.key).text);
  if (key === null) throw new TypeError("proposeProfileFact: authoritative account field");
  const factId = profileFactId(input.studentId, key);
  const at = (options.now ?? new Date()).toISOString();
  const origin = {
    ...(input.threadId === undefined ? {} : { threadId: input.threadId }),
    ...(input.turnId === undefined ? {} : { turnId: input.turnId }),
  };
  const source = checkSource(input);
  const expectedRevision = input.expectedRevision ?? await readStudentMemoryRevision(db,input.studentId);
  if(expectedRevision !== await readStudentMemoryRevision(db,input.studentId))return null;
  const existing = await factsOf(db).findOne({ _id: factId, studentId: input.studentId } as never);
  const proposalToken=randomUUID();
  const pendingChange: PendingProfileChange = { candidateId: randomUUID(), version: randomUUID(), value, proposedAt: at, ...source, ...origin };
  const created: string[] = [];
  let wroteProposal = false;
  await fencedStudentWrite(
    db,
    input.studentId,
    async (op) => {
      const res = await factsOf(db).updateOne(
        { _id: factId, studentId: input.studentId } as never,
        { $setOnInsert: { factId, key, value, ...source, status: "proposed", source: "chat", proposedAt: at, pendingChange, proposalToken, proposalPending: true, ...origin } } as never,
        { upsert: true, ...op },
      );
      if (res.upsertedCount === 1) {
        created.push(factId);
        wroteProposal = true;
        return;
      }
      if (!existing || (existing.status === "confirmed" && existing.value === value)) return;
      const updated = await factsOf(db).updateOne(
        { _id: factId, studentId: input.studentId, status: existing.status,
          proposalToken: existing.proposalToken ?? { $exists: false }, decidedAt: existing.decidedAt ?? { $exists: false } } as never,
        // The quote belongs to the value it supports: the newer value brings its own, or none (a stale quote must not stay beside it).
        { $set: { pendingChange, proposalToken, proposalPending: true, ...(existing.status === "proposed" ? { value, ...source, proposedAt: at, ...origin } : {}) },
          ...(existing.status === "proposed" ? { $unset: { ...(source.quote === undefined ? { quote: "", sourceLang: "" } : {}), ...(input.threadId === undefined ? { threadId: "" } : {}), ...(input.turnId === undefined ? { turnId: "" } : {}) } } : {}) } as never,
        op,
      );
      wroteProposal = updated.matchedCount === 1;
    },
    () => (created.length === 0 ? Promise.resolve() : factsOf(db).deleteMany({ _id: { $in: created }, studentId: input.studentId, proposalToken } as never)),
  );
  const discardProposal = async () => {
    // Reserve durable uncertainty BEFORE compensation. A failed/ambiguous delete
    // cannot reopen memory; independent cleanups cannot clear each other's count.
    const markers = db.collection(COLLECTION_NAMES.student_usage);
    const markerFilter = { _id: "memory:" + input.studentId, studentId: input.studentId };
    const undoMarker = async () => {
      try { await assertStudentNotFenced(db, input.studentId); }
      catch (err) {
        if (!(err instanceof StudentFencedError)) throw err;
        await markers.deleteMany(markerFilter as never);
      }
    };
    await fencedStudentWrite(db, input.studentId, op => markers.updateOne(markerFilter as never,
      // S13 fix A5: a discard is not an explicit forget, so it must not cut history. But it leaves a non-empty revision, and readStudentMemorySnapshot
      // treats a non-empty revision WITHOUT a valid cutoff as unusable history (fail closed), which would drop a new student's short-term context for good.
      // $max with the epoch sets the cutoff only when it is missing (a new marker, or a publication-only one) and never lowers a real decision cutoff.
      { $inc: { pendingCompensations: 1 }, $set: { revision: randomUUID() }, $max: { historyAfter: NO_HISTORY_CUT } } as never,
      { upsert: true, ...op }), undoMarker);
    await fencedStudentWrite(db, input.studentId, async op => {
      await factsOf(db).deleteMany({ _id: factId, studentId: input.studentId, status: "proposed", proposalToken } as never, op);
      await factsOf(db).updateOne({ _id: factId, studentId: input.studentId, status: "confirmed", proposalToken } as never,
        { $unset: { pendingChange: "", proposalPending: "" } } as never, op);
    }, async () => undefined);
    const completed = await fencedStudentWrite(db, input.studentId, op => markers.updateOne(
      { ...markerFilter, pendingCompensations: { $gte: 1 } } as never,
      { $inc: { pendingCompensations: -1 }, $set: { revision: randomUUID() } } as never, op), undoMarker);
    if (completed.matchedCount !== 1) throw new Error("StudentMemoryRevisionPending: proposal cleanup unavailable");
  };
  // A decision can start after the pre-check but before this write. A pending/error
  // revision is a refusal too: remove only this writer's proposed row before failing.
  let currentRevision: string;
  try {
    currentRevision = await readStudentMemoryRevision(db, input.studentId);
  } catch (err) {
    await discardProposal();
    throw err;
  }
  if (expectedRevision !== currentRevision || (input.threadId && (await getChatThread(db,{studentId:input.studentId,threadId:input.threadId}))?.textStored === false)) {
    await discardProposal();
    return null;
  }
  if (wroteProposal) {
    // Unverified writes stay hidden even if reserving cleanup uncertainty fails.
    // This CAS cannot republish a row deleted/corrected/replaced during validation.
    const published = await fencedStudentWrite(db, input.studentId, op => factsOf(db).updateOne(
      { _id: factId, studentId: input.studentId, proposalToken, proposalPending: true } as never,
      { $unset: { proposalPending: "" } } as never, op),
      async () => {
        await factsOf(db).deleteMany({ _id: factId, studentId: input.studentId, status: "proposed", proposalToken } as never);
        await factsOf(db).updateOne({ _id: factId, studentId: input.studentId, status: "confirmed", proposalToken } as never, { $unset: { pendingChange: "", proposalPending: "" } } as never);
      });
    if (published.matchedCount !== 1) return null;
  }
  const row = await factsOf(db).findOne({ _id: factId, studentId: input.studentId, proposalPending: { $exists: false } } as never);
  return row as ProfileFactDoc;
}

export async function listProfileFacts(db: Db, input: { studentId: string; limit?: number; after?: string; status?: ProfileFactStatus }): Promise<ProfileFactDoc[]> {
  requireScopedDb(db, "listProfileFacts");
  requireNonEmptyFields({studentId:input.studentId}, "listProfileFacts");
  await assertStudentNotFenced(db,input.studentId);
  const limit=input.limit??20;if(!Number.isInteger(limit)||limit<1||limit>21)throw new TypeError("Invalid fact limit");
  const markers = db.collection(COLLECTION_NAMES.student_usage);
  const markerFilter = { _id: "memory:" + input.studentId, studentId: input.studentId };
  const before = await markers.findOne(markerFilter as never);
  if (before?.pendingCompensations !== undefined && before.pendingCompensations !== 0) throw new Error("StudentMemoryRevisionPending: proposal cleanup pending or unavailable");
  // Filter before the bounded page: legacy account rows must neither consume a
  // preference slot nor hide the continuation cursor from profile/context readers.
  const rows = await factsOf(db).find({ studentId: input.studentId, key: { $type: "string", $not: AUTHORITATIVE_PROFILE_KEY }, $or: [{status:"confirmed"},{proposalPending: { $exists: false }}], ...(input.status?{status:input.status}:{}), ...(input.after?{factId:{$gt:input.after}}:{}) } as never).sort({factId:1}).limit(limit).toArray();
  const after = await markers.findOne(markerFilter as never);
  if (after?.pendingCompensations !== undefined && after.pendingCompensations !== 0) throw new Error("StudentMemoryRevisionPending: proposal cleanup pending or unavailable");
  await assertStudentNotFenced(db,input.studentId);
  return rows.filter(row => canonicalPreferenceKey(row.key) !== null).map(row => {
    if (row.proposalPending === undefined) return row;
    const { pendingChange: _candidate, proposalPending: _pending, ...active } = row;
    return active;
  });
}

export interface DecideProfileFactInput {
  studentId: string;
  factId: string;
  action: "confirm" | "correct" | "erase" | "reject";
  candidateId?: string;
  expectedVersion?: string;
  threadId?: string;
  /** HTTP controls require the current candidate's originating owned thread. */
  requireCandidateThread?: boolean;
  /** Required for `correct`; for `confirm`, binds the value displayed to the student. */
  value?: string;
}

/** The student's decision on one fact. Returns the updated row, or null after an erase. */
export async function decideProfileFact(db: Db, input: DecideProfileFactInput, options: { now?: Date } = {}): Promise<ProfileFactDoc | null> {
  requireScopedDb(db, "decideProfileFact");
  requireNonEmptyFields({ studentId: input.studentId, factId: input.factId }, "decideProfileFact");
  const markers = db.collection(COLLECTION_NAMES.student_usage);
  const markerFilter = { _id: "memory:" + input.studentId, studentId: input.studentId };
  const marker = await markers.findOne(markerFilter as never);
  if (marker?.pendingCompensations !== undefined && marker.pendingCompensations !== 0) throw new Error("StudentMemoryRevisionPending: proposal cleanup pending or unavailable");
  const filter = { _id: input.factId, studentId: input.studentId };
  const existing = await factsOf(db).findOne(filter);
  if (!existing) throw new ProfileFactNotFoundError();
  if (input.action !== "erase" && canonicalPreferenceKey(existing.key) === null) throw new TypeError("decideProfileFact: authoritative account field");
  if (!["confirm", "correct", "erase", "reject"].includes(input.action)) throw new TypeError("Invalid profile decision");
  const candidate = existing.pendingChange;
  const boundDecision = input.action === "confirm" || input.action === "reject";
  const hasRef = input.candidateId !== undefined || input.expectedVersion !== undefined;
  const needsRef = input.action === "reject" || (input.action === "confirm" && existing.status === "confirmed" && candidate !== undefined);
  if (boundDecision && (needsRef || hasRef) && input.requireCandidateThread
    && (!input.threadId || !candidate || candidate.threadId !== input.threadId)) throw new TypeError("ProfileFactChanged");
  if (boundDecision && (existing.proposalPending !== undefined
    || ((needsRef || hasRef) && (!candidate || input.candidateId !== candidate.candidateId || input.expectedVersion !== candidate.version || input.value !== candidate.value))
    || (!needsRef && !hasRef && input.value !== undefined && input.value !== existing.value))) throw new TypeError("ProfileFactChanged");
  const at = (options.now ?? new Date()).toISOString();
  const corrected = input.action === "correct";
  const acceptingCandidate = input.action === "confirm" && candidate !== undefined;
  const set: Record<string, unknown> = { status: "confirmed", decidedAt: at, proposalToken: randomUUID() };
  const unset: Record<string, string> = { pendingChange: "", proposalPending: "" };
  if (corrected || acceptingCandidate) {
    const raw = corrected ? input.value : candidate!.value;
    if (raw === undefined) throw new Error("decideProfileFact: correct needs a value");
    set.value = checkValue(raw, "decideProfileFact");
    for (const field of ["quote", "sourceLang", "threadId", "turnId"] as const) {
      if (acceptingCandidate && candidate![field] !== undefined) set[field] = candidate![field];
      else unset[field] = "";
    }
  }
  const snapshotFilter = {
    ...filter, value: existing.value, status: existing.status, proposedAt: existing.proposedAt,
    proposalToken: existing.proposalToken ?? { $exists: false },
    decidedAt: existing.decidedAt ?? { $exists: false },
    ...(boundDecision ? { proposalPending: { $exists: false },
      "pendingChange.candidateId": candidate?.candidateId ?? { $exists: false },
      "pendingChange.version": candidate?.version ?? { $exists: false } } : {}),
  };
  // Metadata only: no prior value/quote. Atomic increments retain pending state for
  // overlapping decisions across processes; a boolean would reopen after the first.
  // On ambiguous/error writes keep the marker pending. Only a real erasure fence
  // may remove it, including a late write after a fenced writer's deadline.
  const undoMarker = async () => {
    try { await assertStudentNotFenced(db, input.studentId); }
    catch (err) {
      if (!(err instanceof StudentFencedError)) throw err;
      await markers.deleteMany(markerFilter as never);
    }
  };
  await fencedStudentWrite(db, input.studentId, (op) => markers.updateOne(
    markerFilter as never,
    { $inc: { pendingDecisions: 1 }, $set: { revision: randomUUID() } } as never,
    { upsert: true, ...op },
  ), undoMarker);
  // Do not complete in finally: an uncertain mutation must never reopen old data.
  // A prepared answer can be released only by its owning user-row CAS. Revoke
  // that permission before this decision completes; failed cleanup remains dark.
  const turns = db.collection(COLLECTION_NAMES.chat_turns);
  for await (const turn of turns.find({ studentId: input.studentId, role: "user", publication: "pending", publicationLease: { $exists: true } } as never)) {
    await turns.updateOne({ _id: turn._id, studentId: input.studentId, publication: "pending", publicationLease: turn.publicationLease } as never,
      { $set: { publication: "invalidated" } } as never);
  }
  let conflict = false;
  if (input.action === "erase" || (input.action === "reject" && existing.status === "proposed")) {
    const removed = await fencedStudentWrite(db, input.studentId, op => factsOf(db).deleteMany(
      input.action === "erase" ? filter : snapshotFilter as never, op), async () => undefined);
    conflict = input.action === "reject" && removed.deletedCount !== 1;
  } else {
    const updated = await fencedStudentWrite(db, input.studentId, op => factsOf(db).updateOne(
      boundDecision ? snapshotFilter as never : filter,
      input.action === "reject"
        ? { $set: { decidedAt: at, proposalToken: randomUUID() }, $unset: { pendingChange: "", proposalPending: "" } } as never
        : { $set: set, $unset: unset } as never, op), async () => undefined);
    conflict = boundDecision && updated.matchedCount !== 1;
  }
  const completed = await fencedStudentWrite(db, input.studentId, (op) => markers.updateOne(
    { ...markerFilter, pendingDecisions: { $gte: 1 } } as never,
    { $inc: { pendingDecisions: -1 }, $set: { revision: randomUUID() },
      ...(conflict ? {} : { $max: { historyAfter: (options.now ?? new Date()).toISOString() } }) } as never,
    op,
  ), undoMarker);
  if (completed.matchedCount !== 1) throw new Error("StudentMemoryRevisionPending: decision marker unavailable");
  // A definite CAS miss performed no mutation: release only this reservation.
  // An exception/timeout above deliberately never reaches this completion.
  if (conflict) throw new TypeError("ProfileFactChanged");
  return input.action === "erase" ? null : factsOf(db).findOne(filter);
}


/** Durable invalidation identity is separate from the monotonic explicit-decision history barrier. */
export async function readStudentMemorySnapshot(db: Db, studentId: string): Promise<{revision: string; historyAfter: string | null; historyUsable: boolean}> {
  requireScopedDb(db, "readStudentMemorySnapshot");
  requireNonEmptyFields({ studentId }, "readStudentMemorySnapshot");
  await assertStudentNotFenced(db, studentId);
  const row = await db.collection(COLLECTION_NAMES.student_usage).findOne({ _id: "memory:" + studentId, studentId } as never);
  await assertStudentNotFenced(db, studentId);
  if (!row) return { revision: "", historyAfter: null, historyUsable: true };
  const pending = row.pendingDecisions === undefined ? 0 : row.pendingDecisions;
  const cleanup = row.pendingCompensations === undefined ? 0 : row.pendingCompensations;
  if (row.publicationOnly === true && row.revision === undefined && pending === 0 && cleanup === 0) {
    return { revision: "", historyAfter: null, historyUsable: true };
  }
  if (!Number.isSafeInteger(pending) || pending !== 0 || !Number.isSafeInteger(cleanup) || cleanup !== 0 || typeof row.revision !== "string" || row.revision === "") {
    throw new Error("StudentMemoryRevisionPending: memory decision pending or unavailable");
  }
  const validCutoff = typeof row.historyAfter === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(row.historyAfter)
    && Number.isFinite(Date.parse(row.historyAfter)) && new Date(row.historyAfter).toISOString() === row.historyAfter;
  return { revision: row.revision, historyAfter: validCutoff ? row.historyAfter as string : null, historyUsable: validCutoff };
}

/** Compatibility wrapper: callers needing dialogue context must use the validated snapshot barrier. */
export async function readStudentMemoryRevision(db: Db, studentId: string): Promise<string> {
  return (await readStudentMemorySnapshot(db, studentId)).revision;
}
