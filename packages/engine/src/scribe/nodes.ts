/**
 * The scribe's logic as plain functions (agentic-architecture-standard: the graph is thin wiring;
 * logic lives in functions, skills and tools). Each function takes a Zod-validated input slice plus
 * explicit deps and returns a Zod-validated output (B5). None of them touches LangGraph, so they
 * survive a framework swap unchanged.
 */
import type { Db } from "mongodb";
import { FactSchema, isScriptLike, type Fact } from "@vc/schemas";
import {
  ConsentRequiredError,
  FactConflictError,
  applyApprovedDiff,
  factsCollection,
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

  const purposeTags = [...new Set([...candidate.purposeTags, SCRIBE_PURPOSE])];
  const fact = FactSchema.parse({
    key: candidate.key,
    value: candidate.value,
    source: { type: "transcript", quote: source.quote, turnId: source.id },
    confidence: candidate.confidence,
    validFrom: sessionEndedAt,
    purposeTags,
    sensitivity: candidate.sensitivity,
  });
  return { fact };
}

export async function extractFacts(rawInput: unknown, deps: Omit<ScribeDeps, "db">): Promise<ExtractOutput> {
  const input = ExtractInputSchema.parse(rawInput);
  const skillPrompt = loadSkill(deps.skillsDir, "fact-extraction");
  const output = await deps.provider.generate({
    skillName: "fact-extraction",
    skillPrompt,
    outputSchema: ExtractionSkillOutputSchema,
    input: { turns: input.turns },
  });

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
  const output = await deps.provider.generate({
    skillName: "session-summary",
    skillPrompt,
    outputSchema: SummarySkillOutputSchema,
    input: { turns: input.turns, facts: input.facts },
  });
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
      return ApprovalOutputSchema.parse({ decision: { approve: true, edits: response.facts } });
    case "reject":
      return ApprovalOutputSchema.parse({ decision: { approve: false } });
  }
}

// ---------------------------------------------------------------------------
// (g) write — only on approval (B3)
// ---------------------------------------------------------------------------

/**
 * Applies an approved decision with @vc/db applyApprovedDiff, passing the sessionId FROM STATE
 * (D-012: the contentHash includes it, so a checkpoint replay of this node is an idempotent no-op).
 * A non-approval writes nothing. A genuine conflicting writer becomes status "conflict"; every other
 * error propagates so LangGraph can retry this node from its checkpoint.
 */
export async function writeApproved(rawInput: unknown, deps: Pick<ScribeDeps, "db">): Promise<ScribeResult> {
  const input = WriteInputSchema.parse(rawInput);
  if (!input.decision.approve) {
    return ScribeResultSchema.parse({ status: "rejected" });
  }
  try {
    const applied = await applyApprovedDiff(deps.db, input.diff, input.decision, input.sessionId);
    return ScribeResultSchema.parse({
      status: "written",
      writtenFactIds: applied.written.map((doc) => doc._id),
      supersededKeys: applied.supersededKeys,
    });
  } catch (err) {
    if (err instanceof FactConflictError) {
      return ScribeResultSchema.parse({ status: "conflict", key: err.key, message: err.message });
    }
    throw err;
  }
}
