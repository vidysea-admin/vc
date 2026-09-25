/**
 * The scribe's logic as plain functions (agentic-architecture-standard: the graph is thin wiring;
 * logic lives in functions, skills and tools). Each function takes a Zod-validated input slice plus
 * explicit deps and returns a Zod-validated output (B5). None of them touches LangGraph, so they
 * survive a framework swap unchanged.
 */
import type { Db } from "mongodb";
import { ZodError, type z } from "zod";
import { FactSchema, isScriptLike, type Fact } from "@vc/schemas";
import {
  ConsentRequiredError,
  FactConflictError,
  PartialApplyError,
  applyApprovedDiff,
  factsCollection,
  recordApprovedSessionSummary,
  proposeFactChanges,
  requireConsent,
} from "@vc/db";
import type { LlmProvider } from "@vc/providers";
import { citationGuard } from "../guards/citation.js";
import { routeBeforeGeneration } from "../guards/crisis.js";
import { loadSkill } from "../skills/loader.js";
import {
  ApprovalOutputSchema,
  CandidateFactSchema,
  ConsentGateInputSchema,
  ConsentGateOutputSchema,
  CrisisGateInputSchema,
  CrisisGateOutputSchema,
  DiffInputSchema,
  DiffOutputSchema,
  ExtractInputSchema,
  ExtractOutputSchema,
  ExtractionSkillOutputSchema,
  SCRIBE_PURPOSE,
  ScribeResultSchema,
  SummaryInputSchema,
  SummaryOutputSchema,
  SummarySkillOutputSchema,
  WriteInputSchema,
  type ApprovalOutput,
  type ApprovalResponse,
  type ConsentGateOutput,
  type CrisisGateOutput,
  type DiffOutput,
  type DroppedFact,
  type ExtractOutput,
  type ScribeEscalation,
  type ScribeResult,
  type ScribeTurn,
  type SummaryOutput,
} from "./schemas.js";

export interface ScribeDeps {
  /** The `virtual_counsellor` Db from @vc/db getVcDb/connectFromEnv (B12). */
  db: Db;
  /** The provider seam (B6); tests pass a MockProvider. */
  provider: LlmProvider;
  /** The repo's skills/ directory; prompts come from SKILL.md files (B6). */
  skillsDir: string;
}

// ---------------------------------------------------------------------------
// (a) consent gate — B4, runs first
// ---------------------------------------------------------------------------

export async function checkConsent(rawInput: unknown, deps: Pick<ScribeDeps, "db">): Promise<ConsentGateOutput> {
  const input = ConsentGateInputSchema.parse(rawInput);
  try {
    await requireConsent(deps.db, input.studentId, SCRIBE_PURPOSE);
    return ConsentGateOutputSchema.parse({ consent: "granted" });
  } catch (err) {
    // Only a consent refusal is a routed outcome; any other error (e.g. the DB is down)
    // propagates, so it is retried from the checkpoint instead of being mistaken for "no consent".
    if (err instanceof ConsentRequiredError) {
      return ConsentGateOutputSchema.parse({ consent: "refused", refusalReason: err.message });
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// (b) crisis gate — B9, deterministic, before any provider call
// ---------------------------------------------------------------------------

/**
 * Runs the existing crisis guard (guards/crisis.ts, unchanged) over EVERY turn, on both the
 * original-language `text` and the English `translatedText`: a signal that a translation softened
 * must still escalate. The most severe signal wins (crisis over concern), then the earliest turn.
 * A concern-level signal also stops the scribe, because the guard routes it to escalation and false
 * positives are this guard's safe failure mode.
 */
export function checkCrisis(rawInput: unknown): CrisisGateOutput {
  const input = CrisisGateInputSchema.parse(rawInput);
  let worst: ScribeEscalation | null = null;
  for (const turn of input.turns) {
    for (const text of [turn.text, turn.translatedText]) {
      const route = routeBeforeGeneration(text);
      if (route.route !== "escalate") continue;
      const candidate: ScribeEscalation = { ...route.card, turnId: turn.turnId };
      if (!worst || (worst.level === "concern" && candidate.level === "crisis")) worst = candidate;
    }
    if (worst?.level === "crisis") break;
  }
  return CrisisGateOutputSchema.parse({ escalation: worst });
}

// ---------------------------------------------------------------------------
// (c) fact extraction — skill via provider, then B2 citation checks
// ---------------------------------------------------------------------------

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** The model's source as a CardSource-shaped list, so the existing citation guard can judge it. */
function toCitationSources(source: unknown): { type: string; id: string; quote?: string }[] {
  if (source === null || typeof source !== "object") return [];
  const s = source as Record<string, unknown>;
  return [
    {
      type: typeof s.type === "string" ? s.type : "",
      id: typeof s.turnId === "string" ? s.turnId : "",
      quote: typeof s.quote === "string" ? s.quote : undefined,
    },
  ];
}

/**
 * Validates one model-proposed fact against the transcript. Returns the normalised Fact or the
 * reason it was dropped. Checks, in order: shape; the existing citation guard (B2: a source with a
 * non-empty type and turn id); a transcript source; the cited turn exists; the quote is verbatim in
 * that turn (fact-extraction SKILL.md: "never a paraphrase presented as a quote").
 */
export function verifyCandidateFact(
  raw: unknown,
  turnsById: ReadonlyMap<string, ScribeTurn>,
  sessionEndedAt: string,
): { fact: Fact } | { dropped: DroppedFact } {
  const shape = CandidateFactSchema.safeParse(raw);
  const key = typeof (raw as { key?: unknown } | null)?.key === "string" ? (raw as { key: string }).key : "";
  if (!shape.success) {
    return { dropped: { key, reason: `malformed fact: ${shape.error.issues.map((i) => i.message).join("; ")}` } };
  }
  const candidate = shape.data;

  const sources = toCitationSources(candidate.source);
  const guard = citationGuard({ sources });
  if (!guard.ok) return { dropped: { key, reason: guard.reason } };

  const source = sources[0]!;
  if (source.type !== "transcript" || !source.quote) {
    return { dropped: { key, reason: "a scribe fact must cite a transcript quote + turn (B2)" } };
  }
  const turn = turnsById.get(source.id);
  if (!turn) {
    return { dropped: { key, reason: `cites turn "${source.id}", which is not in this session's transcript (B2)` } };
  }
  const quote = collapseWhitespace(source.quote);
  const inTurn = [turn.text, turn.translatedText].some((text) => collapseWhitespace(text).includes(quote));
  if (!inTurn) {
    return { dropped: { key, reason: `quote is not verbatim in turn "${source.id}" (fabricated citation, B2)` } };
  }

  const fact = FactSchema.parse({
    key: candidate.key,
    value: candidate.value,
    source: { type: "transcript", quote: source.quote, turnId: source.id },
    confidence: candidate.confidence,
    validFrom: sessionEndedAt,
    // ISS-t-007-rev-5 (DPDP purpose limitation): the scribe runs under the profile_synthesis consent
    // only, so its facts carry exactly that purpose. Model-supplied tags are discarded, never merged.
    purposeTags: [SCRIBE_PURPOSE],
    sensitivity: candidate.sensitivity,
  });
  return { fact };
}

/** How many times a schema-invalid provider output is re-asked before the node fails (ISS-t-007-rev-1). */
export const PROVIDER_OUTPUT_RETRIES = 1;

function isSchemaError(err: unknown): err is ZodError {
  return err instanceof ZodError || (err as { name?: unknown } | null)?.name === "ZodError";
}

function describeSchemaError(err: ZodError): string {
  return err.issues.map((i) => `${i.path.length > 0 ? i.path.join(".") : "(root)"}: ${i.message}`).join("; ");
}

/**
 * Calls the provider; if its output fails the node's output schema, re-asks at most
 * PROVIDER_OUTPUT_RETRIES times with the validation error appended to the input
 * (`previousAttemptError`), then gives up with `{ failedReason }`. Only schema failures are retried
 * here: any other provider error (network, auth, not wired) propagates to the checkpoint retry.
 */
async function generateWithRetry<T>(
  provider: LlmProvider,
  request: { skillName: string; skillPrompt: string; outputSchema: z.ZodType<T>; input: Record<string, unknown> },
): Promise<{ output: T } | { failedReason: string }> {
  let lastError = "";
  for (let attempt = 0; attempt <= PROVIDER_OUTPUT_RETRIES; attempt += 1) {
    const input = attempt === 0 ? request.input : { ...request.input, previousAttemptError: lastError };
    try {
      return { output: await provider.generate({ ...request, input }) };
    } catch (err) {
      if (!isSchemaError(err)) throw err;
      lastError = describeSchemaError(err);
    }
  }
  return {
    failedReason: `the ${request.skillName} output was schema-invalid after ${PROVIDER_OUTPUT_RETRIES + 1} attempts: ${lastError}`,
  };
}

export async function extractFacts(rawInput: unknown, deps: Omit<ScribeDeps, "db">): Promise<ExtractOutput> {
  const input = ExtractInputSchema.parse(rawInput);
  const skillPrompt = loadSkill(deps.skillsDir, "fact-extraction");
  const generated = await generateWithRetry(deps.provider, {
    skillName: "fact-extraction",
    skillPrompt,
    outputSchema: ExtractionSkillOutputSchema,
    input: { turns: input.turns },
  });
  if ("failedReason" in generated) {
    return ExtractOutputSchema.parse({ facts: [], dropped: [], failedReason: generated.failedReason });
  }
  const output = generated.output;

  const turnsById = new Map(input.turns.map((t) => [t.turnId, t]));
  const keptByKey = new Map<string, Fact>();
  const dropped: DroppedFact[] = [];
  for (const raw of output.facts) {
    const verdict = verifyCandidateFact(raw, turnsById, input.sessionEndedAt);
    if ("dropped" in verdict) {
      dropped.push(verdict.dropped);
      continue;
    }
    // One fact per key per session: a second fact for the same key would make the write
    // supersede the first inside one session. Keep the higher-confidence one.
    const prior = keptByKey.get(verdict.fact.key);
    if (prior) {
      const [keep, drop] = verdict.fact.confidence > prior.confidence ? [verdict.fact, prior] : [prior, verdict.fact];
      keptByKey.set(keep.key, keep);
      dropped.push({ key: drop.key, reason: "duplicate key in this session; the higher-confidence fact was kept" });
      continue;
    }
    keptByKey.set(verdict.fact.key, verdict.fact);
  }
  return ExtractOutputSchema.parse({ facts: [...keptByKey.values()], dropped });
}

// ---------------------------------------------------------------------------
// (d) session summary — skill via provider, B1 recital check
// ---------------------------------------------------------------------------

export async function summarizeSession(rawInput: unknown, deps: Omit<ScribeDeps, "db">): Promise<SummaryOutput> {
  const input = SummaryInputSchema.parse(rawInput);
  const skillPrompt = loadSkill(deps.skillsDir, "session-summary");
  const generated = await generateWithRetry(deps.provider, {
    skillName: "session-summary",
    skillPrompt,
    outputSchema: SummarySkillOutputSchema,
    input: { turns: input.turns, facts: input.facts },
  });
  if ("failedReason" in generated) {
    return SummaryOutputSchema.parse({ summary: "", failedReason: generated.failedReason });
  }
  const output = generated.output;
  // B1: a summary is a record, never a script. Judged as a statement-type text ("evidence"), so
  // only recital cues flag it, never the lack of a "?".
  if (isScriptLike(output.summary, "evidence")) {
    return SummaryOutputSchema.parse({
      summary: "",
      summaryWithheldReason:
        "The generated summary read as a script for the counsellor to recite (contract B1), so it was withheld.",
    });
  }
  return SummaryOutputSchema.parse({ summary: output.summary });
}

// ---------------------------------------------------------------------------
// (e) profile diff — pure proposal, writes nothing
// ---------------------------------------------------------------------------

/**
 * Reads the student's OPEN facts (`active: true`, D-013) and diffs the session's facts against them
 * with @vc/db proposeFactChanges, which writes nothing.
 *
 * T-003b carry-forward: during another writer's retire->insert window a key can have ZERO open
 * facts. This read then proposes an "add" with no `before`. That is safe because nothing is written
 * on the strength of this read: applyApprovedDiff re-reads the open fact at write time, and a
 * genuine concurrent value surfaces as FactConflictError (status "conflict"), never a silent
 * overwrite.
 */
export async function proposeDiff(rawInput: unknown, deps: Pick<ScribeDeps, "db">): Promise<DiffOutput> {
  const input = DiffInputSchema.parse(rawInput);
  const existingFacts = await factsCollection(deps.db).find({ studentId: input.studentId, active: true }).toArray();
  const diff = proposeFactChanges({
    studentId: input.studentId,
    summary: input.summary,
    existingFacts,
    candidateFacts: input.facts,
  });
  const changedKeys = new Set(diff.changes.map((c) => c.key));
  const proposedFacts = input.facts.filter((f) => changedKeys.has(f.key));
  return DiffOutputSchema.parse({ diff, proposedFacts });
}

// ---------------------------------------------------------------------------
// (f) counsellor response -> CounsellorDecision
// ---------------------------------------------------------------------------

export function decisionFromResponse(response: ApprovalResponse, proposedFacts: Fact[]): ApprovalOutput {
  switch (response.action) {
    case "approve":
      return ApprovalOutputSchema.parse({ decision: { approve: true, edits: proposedFacts } });
    case "edit":
      // ISS-t-007-rev-5: a counsellor edit changes values, never the consent purpose. The scribe's
      // facts are processed under profile_synthesis only, so any other tag in the edit is dropped.
      return ApprovalOutputSchema.parse({
        decision: { approve: true, edits: response.facts.map((f) => ({ ...f, purposeTags: [SCRIBE_PURPOSE] })) },
      });
    case "reject":
      return ApprovalOutputSchema.parse({ decision: { approve: false } });
  }
}

// ---------------------------------------------------------------------------
// (g) write — only on approval (B3)
// ---------------------------------------------------------------------------

export interface WriteApprovedOptions {
  /**
   * ISS-t-016-c0-1 / D-016: the SAME absolute instant the outer run's lease (graph.ts newLease) is
   * derived from. recordApprovedSessionSummary and applyApprovedDiff each bind their OWN
   * WriterDeadline to the time remaining until THIS instant (recomputed fresh at each call site, so
   * neither call's deadline can outlive the other's) instead of independently defaulting to the
   * package's full FENCED_WRITER_DEADLINE_MS whenever the outer run shortened its own deadline —
   * closing the gap where a caller-shortened `writerDeadlineMs` left the lease's window shorter
   * than the write's own (driver-level `timeoutMS`-bound) internal bound. Absent (a graph invoked
   * outside start/resumeScribe, e.g. a test driving graph.invoke directly): both calls fall back to
   * their own package default, unchanged from before this fix.
   */
  writerDeadlineExpiresAt?: number;
}

/** ISS-t-016-c0-1: ms remaining until `expiresAt`, recomputed fresh at each call site (never cached across the two writes), floored at 1ms so an already-expired outer deadline still yields a valid (if immediately-expiring) WriterDeadline rather than falling back to the full default. */
function boundedDeadlineMs(expiresAt: number | undefined): number | undefined {
  if (expiresAt === undefined) return undefined;
  return Math.max(1, expiresAt - Date.now());
}

/**
 * Applies an approved decision with @vc/db applyApprovedDiff, passing the sessionId FROM STATE
 * (D-012: the contentHash includes it, so a checkpoint replay of this node is an idempotent no-op).
 * A non-approval writes nothing. A genuine conflicting writer becomes status "conflict" (on the first
 * fact) or "partial_conflict" (on fact 2+, ISS-t-007-rev-4: earlier facts are committed and reported
 * in `writtenFactIds`). Both are terminal: a retry would hit the same foreign fact forever. Every
 * other error, including a PartialApplyError with a non-conflict cause, propagates so LangGraph can
 * retry this node from its checkpoint (idempotent by D-012).
 *
 * T-016 / ISS-t-007-rev-7: on approval, the approved summary is stored on the session row FIRST
 * (recordApprovedSessionSummary: never upserts, so a row the erasure already purged is not
 * recreated, and it throws, so no facts are written for an erased session either). Replays re-set
 * the same value.
 */
export async function writeApproved(
  rawInput: unknown,
  deps: Pick<ScribeDeps, "db">,
  options: WriteApprovedOptions = {},
): Promise<ScribeResult> {
  const input = WriteInputSchema.parse(rawInput);
  if (!input.decision.approve) {
    return ScribeResultSchema.parse({ status: "rejected" });
  }
  await recordApprovedSessionSummary(
    deps.db,
    {
      sessionId: input.sessionId,
      studentId: input.studentId,
      summary: input.summary,
      summaryWithheldReason: input.summaryWithheldReason,
    },
    { deadlineMs: boundedDeadlineMs(options.writerDeadlineExpiresAt) },
  );
  try {
    const applied = await applyApprovedDiff(deps.db, input.diff, input.decision, input.sessionId, {
      deadlineMs: boundedDeadlineMs(options.writerDeadlineExpiresAt),
    });
    return ScribeResultSchema.parse({
      status: "written",
      writtenFactIds: applied.written.map((doc) => doc._id),
      supersededKeys: applied.supersededKeys,
    });
  } catch (err) {
    if (err instanceof FactConflictError) {
      return ScribeResultSchema.parse({ status: "conflict", key: err.key, message: err.message });
    }
    if (err instanceof PartialApplyError && err.cause instanceof FactConflictError) {
      return ScribeResultSchema.parse({
        status: "partial_conflict",
        key: err.failingKey,
        writtenFactIds: err.writtenIds,
        message: err.message,
      });
    }
    throw err;
  }
}
