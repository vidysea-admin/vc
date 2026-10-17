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
import type { Collection, Db } from "mongodb";
import { TenantScopeError, tenantIdOf } from "@vc/db";
import type { LlmProvider } from "@vc/providers";
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

// Literal names at the call sites below match these constants (a test asserts it). They are NOT yet
// in @vc/db COLLECTION_NAMES, the erasure selectors or the D-016 scanner's student-data list:
// packages/db/src/erasure.ts is T-029's in-flight file. Reconciliation is an Open gap in the manifest.
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
    const got = await deps.recipients({ sessionId: base.sessionId, studentId: base.studentId });
    recipients = { adminIds: uniqueIds(got.adminIds ?? []), counsellorIds: uniqueIds(got.counsellorIds ?? []) };
  } catch (err) {
    resolverError = err instanceof Error ? err.name : typeof err;
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
  await notifications(db).bulkWrite(
    docs.map((doc) => ({ updateOne: { filter: { _id: doc._id }, update: { $setOnInsert: doc }, upsert: true } })),
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
  const now = deps.now ?? (() => new Date());
  const flaggedAt = now().toISOString();

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
    await reviews(db).updateOne({ _id: doc._id }, { $setOnInsert: doc }, { upsert: true });
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
    (deps.alert ?? defaultAlert)({
      event: "concern_review_failed",
      sessionId: input.sessionId,
      errorName: err instanceof Error ? err.name : typeof err,
    });
    return { reviewed: [], escalated: [] };
  });
  deps.onReview?.(review);
  return { immediate, selected, review };
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
    const annotation = await classifyConcern(
      { text: turn.text, translatedText: turn.translatedText, lang: turn.lang, guardLevel: guard.level, guardMatched: guard.matched },
      { provider: deps.classifier.provider, skillPrompt: deps.classifier.skillPrompt, timeoutMs: deps.classifier.config.timeoutMs, now },
    );
    result.reviewed.push({ turnId: turn.turnId, annotation });
    // Only the annotation field is written; the guard fields are never in this update.
    await reviews(db).updateOne({ _id: `${input.sessionId}:${turn.turnId}` }, { $set: { classifier: annotation } });

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
        deps,
        now().toISOString(),
      )),
    );
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
  input: { notificationId: string; acknowledgedBy: string; now?: () => Date },
): Promise<boolean> {
  requireTenantScope(db, "acknowledgeEscalation");
  const at = (input.now ?? (() => new Date()))().toISOString();
  const res = await notifications(db).updateOne(
    { _id: input.notificationId, acknowledgedAt: null },
    { $set: { acknowledgedAt: at, acknowledgedBy: input.acknowledgedBy } },
  );
  return res.matchedCount === 1;
}
