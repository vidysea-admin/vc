/**
 * T-012 (contract B16, gate crisis-safety-layers answer 2026-09-25: "we will escalate to admin and
 * concerned counsellors"): crisis escalation as notification RECORDS in the tenant's
 * `virtual_counsellor` Db. Nothing here sends anything over a network: a record is "queued" for an
 * out-of-band delivery channel that does not exist yet (same stance as T-029's email outbox).
 *
 * New file, on purpose: no module owned escalation delivery. The collections are this module's own:
 *   - `escalation_notifications`: one record per (escalation, recipient). All recipients of one
 *     escalation — the tenant's admin(s) AND the concerned counsellor(s) — are written in ONE
 *     bulkWrite carrying ONE `notifiedAt` instant ("at the same moment", B16).
 *   - `crisis_flag_reviews`: one record per reviewed turn: the guard's flag (written once with
 *     $setOnInsert and never updated), the selection reason, and the classifier annotation ($set
 *     later, on its own field). The counsellor view (`readFlagReviews`) derives visibility from the
 *     guard fields only (concern-classifier.ts `reviewedFlagView`), so "likely benign" can annotate a
 *     flag but never hide it (D-020).
 *
 * Tenancy (T-025, B21): both functions REFUSE an unscoped Db (TenantScopeError). The tenant is
 * never a parameter here; it is whatever `tenantScopedDb` stamped on the Db.
 *
 * Order (B16: the classifier never blocks): `escalateTurns` writes the guard-crisis notifications
 * FIRST and awaits only those writes, then starts the classifier review in the background and hands
 * its promise to `deps.onReview`. A classifier that hangs, times out or errors can therefore never
 * delay or prevent a guard-crisis escalation, and a guard-flagged concern it could not review is
 * escalated on the flag alone (fail-open, concern-classifier.ts `escalationDecision`).
 *
 * Crisis-response SLA: PARKED (qa/gates/crisis-safety-layers.md — no number was given). Nothing
 * here waits for, or enforces, a response time. The records carry the timestamps needed to measure
 * one later: `flaggedAt` (the guard saw the turn), `notifiedAt` (the record was written) and
 * `acknowledgedAt` (set by `acknowledgeEscalation`, null until then).
 *
 * PII: a notification carries ids, the level, the matched guard pattern ids and the timestamps. It
 * never carries the transcript text; the recipient opens the session to read it.
 */
import { randomUUID } from "node:crypto";
import type { Collection, Db } from "mongodb";
import { TenantScopeError, tenantIdOf, WriterDeadline, FencedWriterDeadlineError, assertStudentNotFenced, compensateIfFenced, FENCE_POSTCHECK_TIMEOUT_MS } from "@vc/db";
import { ProviderAuthorizationRefusedError, type LlmProvider } from "@vc/providers";
import { checkConsent } from "../scribe/nodes.js";
import { crisisGuard, type CrisisLevel } from "./crisis.js";
import {
  classifyConcern,
  escalationDecision,
  reviewedFlagView,
  selectForReview,
  type ClassifierAnnotation,
  type ConcernClassifierConfig,
  type EscalationReason,
  type FlagView,
  type GuardFlag,
  type ReviewSelection,
  type SampleStratum,
  type Severity,
} from "./concern-classifier.js";

// Registered lifecycle collection names.
export const ESCALATION_NOTIFICATIONS_COLLECTION = "escalation_notifications";
export const CRISIS_FLAG_REVIEWS_COLLECTION = "crisis_flag_reviews";

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export type RecipientRole = "admin" | "counsellor" | "unrouted";

export interface EscalationNotificationDoc {
  /** `${escalationId}:${role}:${recipientId}`: idempotent, a replay writes nothing new. */
  _id: string;
  kind: "crisis_escalation";
  /** `${sessionId}:${turnId}`: every recipient record of one escalation shares it. */
  escalationId: string;
  recipient: { role: RecipientRole; id: string };
  sessionId: string;
  studentId: string;
  turnId: string;
  guardLevel: CrisisLevel;
  matched: string[];
  severity: Severity;
  reason: EscalationReason;
  /** A record only; no sender exists (B16 brief: nothing is sent over the network). */
  channel: "record_only";
  status: "queued";
  flaggedAt: string;
  notifiedAt: string;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  writerToken?: string;
  acknowledgementWriteToken?: string;
}

export interface CrisisFlagReviewDoc {
  /** `${sessionId}:${turnId}`. */
  _id: string;
  sessionId: string;
  studentId: string;
  turnId: string;
  selection: ReviewSelection;
  stratum: SampleStratum;
  /** The guard's result. Written once ($setOnInsert); no code path updates it. */
  guard: GuardFlag;
  flaggedAt: string;
  /** Set by the background review; absent until it settles. */
  classifier?: ClassifierAnnotation;
  writerToken?: string;
  classifierWriteToken?: string;
}

export interface EscalationRecipients {
  adminIds: string[];
  counsellorIds: string[];
}

/** Who to notify for a session: the tenant's admin(s) and the session's concerned counsellor(s). */
export type RecipientResolver = (ctx: { sessionId: string; studentId: string }) => Promise<EscalationRecipients>;

export interface EscalationAlert {
  event: "escalation_unrouted" | "concern_review_failed";
  escalationId?: string;
  sessionId: string;
  errorName?: string;
}

export interface EscalationDeps {
  recipients: RecipientResolver;
  classifier: {
    /** Built by config for the classifier tier (concernClassifierProviderConfig); a MockProvider in tests. */
    provider: LlmProvider;
    /** skills/concern-classifier/SKILL.md body. */
    skillPrompt: string;
    config: ConcernClassifierConfig;
  };
  now?: () => Date;
  /** Bounded write phase; defaults to shared erasure writer limit. */
  writerDeadlineMs?: number;
  /** Explicit host cancellation, distinct from the live start writer budget. */
  signal?: AbortSignal;
  /** Private operation budget, captured once by the authoritative caller. */
  budget?: { expiresAt: number; signal: AbortSignal; run: <T>(work: Promise<T>) => Promise<T>; authorize?: () => Promise<void> };
  /** Receives the background review. Runtime may ignore it; tests await it. It never rejects. */
  onReview?: (review: Promise<ReviewRunResult>) => void;
  /** Engineering alert sink (default: one structured, text-free console.error line). */
  alert?: (alert: EscalationAlert) => void;
}

export interface EscalationTurn {
  turnId: string;
  speaker: string;
  lang: string;
  text: string;
  translatedText: string;
}

export interface ReviewRunResult {
  reviewed: { turnId: string; annotation: ClassifierAnnotation }[];
  /** Escalations the review added (classifier severity, or fail-open on an unreviewed concern). */
  escalated: EscalationNotificationDoc[];
}

export interface EscalateResult {
  /** Guard-crisis notifications, written before this function returned. */
  immediate: EscalationNotificationDoc[];
  /** The turns picked for review (guard flags + the stratified sample). */
  selected: { turnId: string; selection: ReviewSelection; guard: GuardFlag }[];
  review: Promise<ReviewRunResult>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireTenantScope(db: Db, caller: string): string {
  const tenantId = tenantIdOf(db);
  if (tenantId === undefined) {
    throw new TenantScopeError(`${caller} needs a tenant-scoped Db (tenantScopedDb, T-025); escalation records are per tenant`);
  }
  return tenantId;
}

function notifications(db: Db): Collection<EscalationNotificationDoc> {
  return db.collection<EscalationNotificationDoc>("escalation_notifications");
}

function reviews(db: Db): Collection<CrisisFlagReviewDoc> {
  return db.collection<CrisisFlagReviewDoc>("crisis_flag_reviews");
}

const LEVEL_RANK: Record<CrisisLevel, number> = { none: 0, concern: 1, crisis: 2 };

/** The guard over both the original text and its translation; the higher level wins, matches merge. */
export function guardTurn(turn: Pick<EscalationTurn, "text" | "translatedText">): GuardFlag {
  let level: CrisisLevel = "none";
  const matched = new Set<string>();
  for (const text of [turn.text, turn.translatedText]) {
    const r = crisisGuard(text);
    if (LEVEL_RANK[r.level] > LEVEL_RANK[level]) level = r.level;
    for (const m of r.matched) matched.add(m);
  }
  return { level, matched: [...matched] };
}

function defaultAlert(alert: EscalationAlert): void {
  console.error(JSON.stringify(alert));
}

/** Bounded phase; late driver settlement repeats ownership-qualified compensation. */
async function fencedWrite<T>(
  db: Db, studentId: string, ms: number | undefined,
  write: (deadline: WriterDeadline) => Promise<T>, undo: () => Promise<unknown>,
  budget?: EscalationDeps["budget"],
): Promise<T> {
  if (budget && (budget.signal.aborted || Date.now() >= budget.expiresAt)) throw new FencedWriterDeadlineError();
  const deadline = new WriterDeadline(budget ? Math.min(ms ?? 60_000, budget.expiresAt - Date.now()) : ms);
  let work: Promise<T> | undefined;
  let failure: { error: unknown } | undefined;
  let value!: T;
  // ISS-126: `budget.run` may reject at once (budget aborted or expired) without ever attaching to the promise it was handed. The
  // deadline race handed to it can then reject later (or already be rejected, when the writer deadline passed first) with nobody
  // listening: an unhandledRejection. Every race is observed here, so the caller's budget cannot leave one dangling.
  const bounded = <V>(p: Promise<V>): Promise<V> => {
    const raced = deadline.run(p);
    raced.catch(() => undefined);
    return raced;
  };
  try {
    try {
      const checking = bounded(assertStudentNotFenced(db, studentId, deadline.op()));
      await (budget ? budget.run(checking) : checking);
      if (budget?.authorize) await budget.run(budget.authorize());
      work = Promise.resolve().then(() => write(deadline));
      value = await (budget ? budget.run(bounded(work)) : bounded(work));
      if (budget?.authorize) await budget.run(budget.authorize());
    } catch (error) { failure = { error }; }
    const timedOut = deadline.expired() || !!budget && (budget.signal.aborted || Date.now() >= budget.expiresAt);
    const lostAuthority = failure?.error instanceof ProviderAuthorizationRefusedError;
    const postcheck = compensateIfFenced(db, studentId, undo, { ...(failure ? { cause: failure.error } : {}), alwaysUndo: timedOut || lostAuthority });
    // The original writer timer remains active through the final fence read.
    try {
      await (budget ? budget.run(bounded(postcheck)) : bounded(postcheck));
    } catch (error) {
      if (deadline.expired() || !!budget && (budget.signal.aborted || Date.now() >= budget.expiresAt)) {
        const settled = work
          ? work.then(() => undo(), () => undo()).then(() => postcheck).then(() => undefined)
          : postcheck.then(() => undefined);
        void settled.catch(() => undefined);
        throw new FencedWriterDeadlineError(settled, { cause: error });
      }
      throw error;
    }
    if (deadline.expired() || !!budget && (budget.signal.aborted || Date.now() >= budget.expiresAt)) {
      const settled = work ? work.then(() => undo(), () => undo()).then(() => undefined) : Promise.resolve();
      void settled.catch(() => undefined);
      throw new FencedWriterDeadlineError(settled, { cause: failure?.error });
    }
    if (failure) throw failure.error;
    return value;
  } finally { deadline.dispose(); }
}
function uniqueIds(ids: readonly string[]): string[] {
  return [...new Set(ids.filter((id) => typeof id === "string" && id.trim() !== ""))];
}

/**
 * Writes one escalation for every recipient in ONE bulkWrite with ONE `notifiedAt`. When the
 * resolver fails, or names no admin or no counsellor, the missing side gets an `unrouted` record and
 * an engineering alert fires: an escalation is never dropped for want of an address.
 */
async function notifyAll(
  db: Db,
  base: Omit<EscalationNotificationDoc, "_id" | "recipient" | "notifiedAt" | "acknowledgedAt" | "acknowledgedBy" | "kind" | "channel" | "status" | "escalationId">,
  deps: EscalationDeps,
  notifiedAt: string,
): Promise<EscalationNotificationDoc[]> {
  const escalationId = `${base.sessionId}:${base.turnId}`;
  const alert = deps.alert ?? defaultAlert;
  let recipients: EscalationRecipients = { adminIds: [], counsellorIds: [] };
  let resolverError: string | undefined;
  try {
    const resolving = Promise.resolve().then(() => deps.recipients({ sessionId: base.sessionId, studentId: base.studentId }));
    const got = await (deps.budget ? deps.budget.run(resolving) : resolving);
    recipients = { adminIds: uniqueIds(got.adminIds ?? []), counsellorIds: uniqueIds(got.counsellorIds ?? []) };
  } catch (err) {
    if (deps.budget && (deps.budget.signal.aborted || Date.now() >= deps.budget.expiresAt)) throw new FencedWriterDeadlineError();
    if (err instanceof ProviderAuthorizationRefusedError) throw err;
    resolverError = "RecipientResolutionError";
  }
  const targets: { role: RecipientRole; id: string }[] = [
    ...recipients.adminIds.map((id) => ({ role: "admin" as const, id })),
    ...recipients.counsellorIds.map((id) => ({ role: "counsellor" as const, id })),
  ];
  if (recipients.adminIds.length === 0) targets.push({ role: "unrouted", id: "admin" });
  if (recipients.counsellorIds.length === 0) targets.push({ role: "unrouted", id: "counsellor" });
  if (recipients.adminIds.length === 0 || recipients.counsellorIds.length === 0) {
    alert({ event: "escalation_unrouted", escalationId, sessionId: base.sessionId, ...(resolverError ? { errorName: resolverError } : {}) });
  }
  const docs: EscalationNotificationDoc[] = targets.map((recipient) => ({
    ...base,
    _id: `${escalationId}:${recipient.role}:${recipient.id}`,
    kind: "crisis_escalation",
    escalationId,
    recipient,
    channel: "record_only",
    status: "queued",
    notifiedAt,
    acknowledgedAt: null,
    acknowledgedBy: null,
  }));
  const writerToken = randomUUID();
  await fencedWrite(db, base.studentId, deps.writerDeadlineMs,
    (deadline) => notifications(db).bulkWrite(
      docs.map((doc) => ({ updateOne: { filter: { _id: doc._id }, update: { $setOnInsert: { ...doc, writerToken } }, upsert: true } })),
      deadline.op(),
    ),
    () => notifications(db).deleteMany({ _id: { $in: docs.map((d) => d._id) }, writerToken }, { timeoutMS: FENCE_POSTCHECK_TIMEOUT_MS }),
    deps.budget,
  );
  return docs;
}

// ---------------------------------------------------------------------------
// The escalation entry point
// ---------------------------------------------------------------------------

/**
 * Runs the guard over every turn, escalates each guard-crisis turn immediately, records every
 * selected turn's flag, and starts the classifier review in the background. See the module comment.
 */
export async function escalateTurns(
  db: Db,
  input: { sessionId: string; studentId: string; turns: EscalationTurn[] },
  deps: EscalationDeps,
): Promise<EscalateResult> {
  requireTenantScope(db, "escalateTurns");
  const ownedDeadline = deps.budget ? undefined : new WriterDeadline(deps.writerDeadlineMs);
  if (ownedDeadline) deps = { ...deps, budget: { expiresAt: ownedDeadline.expiresAt, signal: ownedDeadline.signal, run: work => ownedDeadline.run(work) } };
  let cancel: (() => void) | undefined;
  if (deps.signal) {
    const originalBudget = deps.budget!;
    const cancelled = new Promise<never>((_, reject) => { cancel = () => reject(new ProviderAuthorizationRefusedError()); });
    void cancelled.catch(() => undefined);
    deps.signal.addEventListener("abort", cancel!, { once: true });
    deps = { ...deps, budget: { ...originalBudget, signal: deps.signal, run: work => Promise.race([originalBudget.run(work), cancelled]) } };
  }
  try {
  if (deps.signal?.aborted) throw new ProviderAuthorizationRefusedError();
  const now = deps.now ?? (() => new Date());
  const flaggedAt = now().toISOString();

  const consent = await deps.budget!.run(checkConsent({ studentId: input.studentId }, { db }));
  if (consent.consent !== "granted") {
    const immediate: EscalationNotificationDoc[] = [];
    for (const turn of input.turns) {
      if (guardTurn(turn).level !== "crisis") continue;
      immediate.push(...await notifyAll(db, {
        sessionId: input.sessionId, studentId: input.studentId, turnId: turn.turnId,
        guardLevel: "crisis", matched: [], severity: "critical", reason: "guard_crisis", flaggedAt,
      }, deps, now().toISOString()));
    }
    return { immediate, selected: [], review: Promise.resolve({ reviewed: [], escalated: [] }) };
  }
  const operationBudget = deps.budget!;
  deps = { ...deps, budget: { ...operationBudget, authorize: async () => {
    try {
      const current = await operationBudget.run(checkConsent({ studentId: input.studentId }, { db }));
      if (current.consent !== "granted") throw new ProviderAuthorizationRefusedError();
    } catch (error) {
      if (error instanceof FencedWriterDeadlineError) throw error;
      throw new ProviderAuthorizationRefusedError();
    }
  } } };
  const selected: EscalateResult["selected"] = [];
  const reviewTurns: { turn: EscalationTurn; guard: GuardFlag }[] = [];
  for (const turn of input.turns) {
    const guard = guardTurn(turn);
    const pick = selectForReview(
      { sessionId: input.sessionId, turnId: turn.turnId, speaker: turn.speaker, text: turn.text },
      guard.level,
      deps.classifier.config.sampleRates,
    );
    if (!pick.selected || pick.selection === null) continue;
    selected.push({ turnId: turn.turnId, selection: pick.selection, guard });
    reviewTurns.push({ turn, guard });
    const doc: CrisisFlagReviewDoc = {
      _id: `${input.sessionId}:${turn.turnId}`,
      sessionId: input.sessionId,
      studentId: input.studentId,
      turnId: turn.turnId,
      selection: pick.selection,
      stratum: pick.stratum,
      guard,
      flaggedAt,
    };
    const writerToken = randomUUID();
    await fencedWrite(db, input.studentId, deps.writerDeadlineMs,
      (deadline) => reviews(db).updateOne({ _id: doc._id }, { $setOnInsert: { ...doc, writerToken } }, { upsert: true, ...deadline.op() }),
      () => reviews(db).deleteMany({ _id: doc._id, writerToken }, { timeoutMS: FENCE_POSTCHECK_TIMEOUT_MS }),
      deps.budget,
    );
  }

  // 1. Guard crisis: notify now, before (and independent of) any classifier call.
  const immediate: EscalationNotificationDoc[] = [];
  const notifiedAt = now().toISOString();
  for (const { turn, guard } of reviewTurns) {
    const decision = escalationDecision(guard, null);
    if (!decision.escalate || decision.reason !== "guard_crisis") continue;
    immediate.push(
      ...(await notifyAll(
        db,
        {
          sessionId: input.sessionId,
          studentId: input.studentId,
          turnId: turn.turnId,
          guardLevel: guard.level,
          matched: guard.matched,
          severity: decision.severity,
          reason: decision.reason,
          flaggedAt,
        },
        deps,
        notifiedAt,
      )),
    );
  }

  // 2. The classifier, in the background. Never rejects.
  const review = runReview(db, input, reviewTurns, deps, flaggedAt).catch((err: unknown): ReviewRunResult => {
    if (err instanceof FencedWriterDeadlineError) {
      void err.settled.catch((lateError: unknown) => {
        (deps.alert ?? defaultAlert)({ event: "concern_review_failed", sessionId: input.sessionId, errorName: "ConcernReviewSettlementError" });
      });
    }
    (deps.alert ?? defaultAlert)({
      event: "concern_review_failed",
      sessionId: input.sessionId,
      errorName: "ConcernReviewError",
    });
    return { reviewed: [], escalated: [] };
  });
  deps.onReview?.(review);
  return { immediate, selected, review };
  } finally {
    if (cancel) deps.signal?.removeEventListener("abort", cancel);
    ownedDeadline?.dispose();
  }
}

async function runReview(
  db: Db,
  input: { sessionId: string; studentId: string },
  reviewTurns: { turn: EscalationTurn; guard: GuardFlag }[],
  deps: EscalationDeps,
  flaggedAt: string,
): Promise<ReviewRunResult> {
  const now = deps.now ?? (() => new Date());
  const result: ReviewRunResult = { reviewed: [], escalated: [] };
  for (const { turn, guard } of reviewTurns) {
    const classifierDeadline = Date.now() + deps.classifier.config.timeoutMs;
    const reviewDeadline = classifierDeadline + (deps.writerDeadlineMs ?? 60_000);
    const controller = new AbortController();
    let expire!: (error: Error) => void;
    const expiry = new Promise<never>((_, reject) => { expire = reject; });
    void expiry.catch(() => undefined);
    const timer = setTimeout(() => { controller.abort(); expire(new FencedWriterDeadlineError()); }, Math.max(1, reviewDeadline - Date.now()));
    const cancelReview = () => { controller.abort(); expire(new ProviderAuthorizationRefusedError()); };
    deps.signal?.addEventListener("abort", cancelReview, { once: true });
    if (deps.signal?.aborted) cancelReview();
    const budget: NonNullable<EscalationDeps["budget"]> = {
      expiresAt: reviewDeadline, signal: controller.signal,
      run: work => {
        if (controller.signal.aborted || Date.now() >= reviewDeadline) return Promise.reject(new FencedWriterDeadlineError());
        return Promise.race([work, expiry]);
      },
      authorize: async () => {
        try {
          const consent = await budget.run(checkConsent({ studentId: input.studentId }, { db }));
          if (consent.consent !== "granted") throw new ProviderAuthorizationRefusedError();
          await budget.run(assertStudentNotFenced(db, input.studentId, { timeoutMS: Math.min(60_000, Math.max(1, reviewDeadline - Date.now())) }));
          if (controller.signal.aborted || Date.now() >= reviewDeadline) throw new FencedWriterDeadlineError();
        } catch (error) {
          if (error instanceof FencedWriterDeadlineError) throw error;
          throw new ProviderAuthorizationRefusedError();
        }
      },
    };
    const reviewDeps: EscalationDeps = { ...deps, budget };
    try {
    const annotation = await classifyConcern(
      { text: turn.text, translatedText: turn.translatedText, lang: turn.lang, guardLevel: guard.level, guardMatched: guard.matched },
      { provider: deps.classifier.provider, skillPrompt: deps.classifier.skillPrompt, timeoutMs: deps.classifier.config.timeoutMs, deadlineAt: classifierDeadline, preflight: budget.authorize, signal: controller.signal, now },
    );
    result.reviewed.push({ turnId: turn.turnId, annotation });
    await budget.authorize!();
    // Publication consumes the original review budget; classification cannot restart it.
    const _id = input.sessionId + ":" + turn.turnId;
    const classifierWriteToken = randomUUID();
    let previous: CrisisFlagReviewDoc | null = null;
    await fencedWrite(db, input.studentId, deps.writerDeadlineMs, async (deadline) => {
      previous = await reviews(db).findOne({ _id, studentId: input.studentId }, deadline.op());
      if (!previous) return;
      await reviews(db).updateOne(
        { _id, studentId: input.studentId, classifierWriteToken: previous.classifierWriteToken ?? { $exists: false } },
        { $set: { classifier: annotation, classifierWriteToken } }, deadline.op(),
      );
    }, async () => {
      if (!previous) return;
      const $set = { ...(previous.classifier === undefined ? {} : { classifier: previous.classifier }), ...(previous.classifierWriteToken === undefined ? {} : { classifierWriteToken: previous.classifierWriteToken }) };
      const $unset: Record<string, ""> = { ...(previous.classifier === undefined ? { classifier: "" } : {}), ...(previous.classifierWriteToken === undefined ? { classifierWriteToken: "" } : {}) };
      return reviews(db).updateOne({ _id, studentId: input.studentId, classifierWriteToken }, { $set, $unset }, { timeoutMS: FENCE_POSTCHECK_TIMEOUT_MS });
    }, budget);

    const decision = escalationDecision(guard, annotation);
    // A guard crisis was already escalated before the review started.
    if (!decision.escalate || decision.reason === "guard_crisis") continue;
    result.escalated.push(
      ...(await notifyAll(
        db,
        {
          sessionId: input.sessionId,
          studentId: input.studentId,
          turnId: turn.turnId,
          guardLevel: guard.level,
          matched: guard.matched,
          severity: decision.severity,
          reason: decision.reason,
          flaggedAt,
        },
        reviewDeps,
        now().toISOString(),
      )),
    );
    } finally {
      clearTimeout(timer);
      deps.signal?.removeEventListener("abort", cancelReview);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Read + acknowledge
// ---------------------------------------------------------------------------

/** Every notification of a session (optionally one recipient), ordered by _id. */
export async function readEscalations(
  db: Db,
  query: { sessionId: string; recipientId?: string },
): Promise<EscalationNotificationDoc[]> {
  requireTenantScope(db, "readEscalations");
  const docs = await notifications(db)
    .find({ sessionId: query.sessionId, ...(query.recipientId === undefined ? {} : { "recipient.id": query.recipientId }) })
    .toArray();
  return docs.sort((a, b) => a._id.localeCompare(b._id));
}

/** The counsellor's view of a session's reviewed turns: every guard flag visible, annotated at most. */
export async function readFlagReviews(db: Db, query: { sessionId: string }): Promise<(FlagView & { turnId: string })[]> {
  requireTenantScope(db, "readFlagReviews");
  const docs = await reviews(db).find({ sessionId: query.sessionId }).toArray();
  return docs
    .sort((a, b) => a._id.localeCompare(b._id))
    .map((d) => ({ turnId: d.turnId, ...reviewedFlagView(d.guard, d.classifier ?? null) }));
}

/**
 * Records that a recipient acknowledged a notification (the SLA's measurable end). Only the first
 * acknowledgement counts; returns false when the record is missing or already acknowledged.
 */
export async function acknowledgeEscalation(
  db: Db,
  input: { notificationId: string; acknowledgedBy: string; now?: () => Date; writerDeadlineMs?: number },
): Promise<boolean> {
  requireTenantScope(db, "acknowledgeEscalation");
  const stored = await notifications(db).findOne({ _id: input.notificationId }, { timeoutMS: FENCE_POSTCHECK_TIMEOUT_MS });
  if (!stored || stored.acknowledgedAt !== null) return false;
  const at = (input.now ?? (() => new Date()))().toISOString();
  const acknowledgementWriteToken = randomUUID();
  const res = await fencedWrite(db, stored.studentId, input.writerDeadlineMs,
    (deadline) => notifications(db).updateOne(
      { _id: stored._id, studentId: stored.studentId, acknowledgedAt: null, acknowledgementWriteToken: stored.acknowledgementWriteToken ?? { $exists: false } },
      { $set: { acknowledgedAt: at, acknowledgedBy: input.acknowledgedBy, acknowledgementWriteToken } }, deadline.op(),
    ),
    () => notifications(db).updateOne(
      { _id: stored._id, studentId: stored.studentId, acknowledgementWriteToken },
      { $set: { acknowledgedAt: stored.acknowledgedAt, acknowledgedBy: stored.acknowledgedBy, ...(stored.acknowledgementWriteToken === undefined ? {} : { acknowledgementWriteToken: stored.acknowledgementWriteToken }) },
        ...(stored.acknowledgementWriteToken === undefined ? { $unset: { acknowledgementWriteToken: "" } } : {}) },
      { timeoutMS: FENCE_POSTCHECK_TIMEOUT_MS },
    ),
  );
  return res.matchedCount === 1;
}
