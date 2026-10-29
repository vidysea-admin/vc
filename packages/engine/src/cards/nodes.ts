/**
 * T-010: the live-cards logic as plain functions (agentic-architecture-standard: the graph is thin
 * wiring; logic lives in functions, skills and tools). Each takes a Zod-validated input plus explicit
 * deps and returns a Zod-validated output (B5). Reused, not duplicated: the scribe's consent gate
 * (checkConsent, B4) and crisis gate (checkCrisis: the crisis guard over every turn, B9, and the
 * T-022 concern records), the public provider seam with bounded schema handling (B6), the skill
 * loader, and @vc/db readActiveProfile (tenant-scoped by whoever built `db`, B21).
 */
import type { Db } from "mongodb";
import { tenantIdOf } from "@vc/db";
import { FailoverProvider, ModelOutputSchemaError, ProviderAuthorizationRefusedError, type GenerateRequest, type LlmProvider } from "@vc/providers";
import type { CardSource, ConcernRecord } from "@vc/schemas";
import { loadSkill } from "../skills/loader.js";
import { checkConsent, checkCrisis, loadApprovedContext } from "../scribe/nodes.js";
import { SCRIBE_PURPOSE, type ScribeEscalation, type ScribeTurn } from "../scribe/schemas.js";
import { buildRelevanceContext, topicOfKey, type RelevanceContext } from "./relevance.js";
import {
  KnowledgeOutputSchema,
  KnownFactSchema,
  MAX_PLANNER_CARDS,
  MAX_VISIBLE_CARDS,
  PlannerSkillOutputSchema,
  VerifierSkillOutputSchema,
  type DroppedCard,
  type KnowledgeOutput,
  type KnownFact,
} from "./schemas.js";
import type { Card } from "@vc/schemas";

/**
 * The consent purpose live cards read the profile under (B4). The same purpose the scribe writes
 * approved facts with, so the cards see exactly the approved profile (and nothing else).
 */
export const LIVE_CARDS_PURPOSE = SCRIBE_PURPOSE;

/**
 * The KnowledgeBase `/ask` client, structurally (T-026 @vc/mcp-university-kb `KnowledgeBaseClient`
 * satisfies it as-is; apps/api passes that client). Declared here so the engine needs no dependency
 * on the MCP package. An outage is a typed `unavailable`, never an uncited answer (B21).
 */
export interface KnowledgeAsker {
  ask(query: string, options?: { signal?: AbortSignal }): Promise<
    | { status: "ok"; answer: string; citations: { internal: readonly { node_id: string }[]; web: readonly Record<string, unknown>[] } }
    | { status: "unavailable"; reason: string; detail: string }
  >;
}

export interface LiveCardsDeps {
  /** The tenant-scoped `virtual_counsellor` Db (B12, B21). Only read here. */
  db: Db;
  /** The provider seam (B6); tests pass a MockProvider. */
  provider: LlmProvider;
  /** The repo's skills/ directory (B6). */
  skillsDir: string;
  /** The KnowledgeBase client (T-026). Absent: knowledge "not_configured", and no kb source can resolve. */
  kb?: KnowledgeAsker;
  /** Legacy compatibility field; semantic verification is mandatory regardless of this value. */
  semanticVerifier?: boolean;
  /** Cancellation and deadline are shared by the entire invocation. Legacy flag cannot disable verification. */
  signal?: AbortSignal;
  deadlineMs?: number;
  /** Graph-created per-leaf closure, never accepted from serialized state. */
  preflight?: GenerateRequest<unknown>["preflight"];
  /** Injectable clock (B18's two-year horizon). */
  now?: () => Date;
}

// ---------------------------------------------------------------------------
// profile + pre-brief context
// ---------------------------------------------------------------------------

/** Reads the approved profile (consent-checked by readActiveProfile) as KnownFacts with their ids. */
export async function loadKnownFacts(studentId: string, deps: Pick<LiveCardsDeps, "db" | "signal">): Promise<KnownFact[]> {
  if (!tenantIdOf(deps.db)) throw new ProviderAuthorizationRefusedError();
  const context = await loadApprovedContext(studentId, deps);
  return context.map(({ factId, studentId: _studentId, tenantId: _tenantId, ...fact }) => KnownFactSchema.parse({ ...fact, id: factId }));
}

export { checkConsent };

// ---------------------------------------------------------------------------
// concern check-in (T-022 / B20) and crisis (B9)
// ---------------------------------------------------------------------------

/**
 * The check-in card's fixed prompt: a question for the counsellor to consider, never a line to read
 * to the student (B1). Deterministic: no model writes it.
 */
export const CHECK_IN_PROMPT = "Would it help to pause and gently check how the student is feeling before going further?";

export interface ConcernGateOutput {
  escalation: ScribeEscalation | null;
  checkIns: { type: "check-in"; prompt: string; sources: CardSource[]; confidence: number }[];
  concerns: ConcernRecord[];
}

/** Crisis ends the run before any provider call; concern becomes a cited check-in card (latest turn first). */
export function checkConcerns(input: { sessionId: string; studentId: string; turns: ScribeTurn[] }): ConcernGateOutput {
  const out = checkCrisis(input);
  if (out.escalation) return { escalation: out.escalation, checkIns: [], concerns: [] };
  // ONE check-in for the most recent concern turn: several identical prompts would be noise (and share
  // a card id). The other concern records are returned on `concerns` for completeness, but note that
  // NOTHING in this unit consumes them: LiveCardsState (graph.ts) declares no `concerns` annotation
  // and crisis_gate returns only {escalation, checkIns}, so the live graph discards them. That is
  // deliberate - the live-cards graph is read-only and writes nothing, and persisting a concern node
  // is the post-session scribe's job (T-022/B20), wired by T-035. This comment previously claimed the
  // records were kept "for the caller's own flagging", which the code does not do (ISS-t-010-c0-8).
  const checkIns = out.concerns.slice(-1).map((c) => ({
    type: "check-in" as const,
    prompt: CHECK_IN_PROMPT,
    sources: [{ type: "transcript", id: c.citation.turnId, quote: c.citation.quote }],
    confidence: 1,
  }));
  return { escalation: null, checkIns, concerns: out.concerns };
}

// ---------------------------------------------------------------------------
// knowledge (T-026 KB /ask)
// ---------------------------------------------------------------------------

function valueStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (typeof value === "number") return [String(value)];
  if (Array.isArray(value)) return value.flatMap(valueStrings);
  return [];
}

/**
 * The KB question, built ONLY from approved, low-sensitivity destination/course/intake values — no
 * transcript text, no names, no ids leave the engine (the data-boundary rule, ARCHITECTURE §5).
 */
export function buildKbQuery(knownFacts: readonly KnownFact[]): string | null {
  const pick = (topic: string) =>
    knownFacts
      .filter((f) => f.sensitivity === "low" && topicOfKey(f.key) === topic)
      .flatMap((f) => valueStrings(f.value))
      .map((v) => v.trim())
      .filter((v) => v.length > 0 && v.length <= 80);
  const destinations = [...new Set(pick("destination"))];
  const courses = [...new Set(pick("course"))];
  const intakes = [...new Set(pick("intake"))];
  if (destinations.length === 0 && courses.length === 0) return null;
  const what = courses.length > 0 ? courses.join(" or ") : "university programmes";
  const where = destinations.length > 0 ? ` in ${destinations.join(", ")}` : "";
  const when = intakes.length > 0 ? ` for the ${intakes[0]} intake` : "";
  return `${what}${where}${when}: entry requirements, fees and deadlines`;
}

export async function retrieveKnowledge(knownFacts: readonly KnownFact[], deps: Pick<LiveCardsDeps, "kb" | "preflight" | "signal">): Promise<KnowledgeOutput> {
  if (deps.signal?.aborted) throw new DOMException("Card execution cancelled.", "AbortError");
  await deps.preflight?.();
  if (!deps.kb) return KnowledgeOutputSchema.parse({ status: "not_configured", evidence: [] });
  const query = buildKbQuery(knownFacts);
  if (!query) return KnowledgeOutputSchema.parse({ status: "no_query", evidence: [] });
  let res: Awaited<ReturnType<KnowledgeAsker["ask"]>>;
  try {
    res = await deps.kb.ask(query, { signal: deps.signal });
    if (deps.signal?.aborted) throw new DOMException("Card execution cancelled.", "AbortError");
  } catch (err) {
    if (deps.signal?.aborted || err instanceof ProviderAuthorizationRefusedError) throw err;
    // The T-026 client never throws for an outage; a different asker that does degrades the same way.
    return KnowledgeOutputSchema.parse({ status: "unavailable", evidence: [] });
  }
  if (res.status !== "ok") return KnowledgeOutputSchema.parse({ status: "unavailable", evidence: [] });
  const evidence = [
    ...res.citations.internal.map((c) => ({ id: c.node_id, kind: "internal" as const })),
    ...res.citations.web.flatMap((w) => (typeof w.url === "string" && w.url.length > 0 ? [{ id: w.url, kind: "web" as const }] : [])),
  ].filter((e) => e.id.length > 0);
  // B2/B21: an answer with nothing citable is no answer.
  if (evidence.length === 0) return KnowledgeOutputSchema.parse({ status: "unavailable", evidence: [] });
  return KnowledgeOutputSchema.parse({ status: "ok", answer: res.answer, evidence });
}

// ---------------------------------------------------------------------------
// ExplorationPlanner (plan.md §3 step 5)
// ---------------------------------------------------------------------------

export interface PlanOutput {
  status: "ok" | "ai_unavailable" | "planner_failed";
  candidates: unknown[];
}

function errorName(err: unknown): string | undefined {
  const name = (err as { name?: unknown } | null)?.name;
  return typeof name === "string" ? name : undefined;
}

/** Provider errors that mean "no AI right now" (checked by name: another bundled copy may throw them). */
const AI_DOWN_ERRORS = new Set(["AiUnavailableError", "RulesProviderUnsupportedSkillError", "ProviderNotWiredError", "GeminiHttpError", "GeminiNetworkError", "GeminiTimeoutError", "GeminiMalformedResponseError"]);

export async function planCards(
  input: { turns: ScribeTurn[]; knownFacts: KnownFact[]; preBrief: { openQuestions: string[]; doNotAsk: string[] }; knowledge: KnowledgeOutput },
  deps: Pick<LiveCardsDeps, "provider" | "skillsDir" | "preflight" | "signal">,
): Promise<PlanOutput> {
  const request = {
    skillName: "exploration-planner", skillPrompt: loadSkill(deps.skillsDir, "exploration-planner"),
    outputSchema: PlannerSkillOutputSchema, signal: deps.signal, preflight: deps.preflight,
    input: {
      turns: input.turns.map(t => ({ turnId: t.turnId, speaker: t.speaker, lang: t.lang, text: t.text, translatedText: t.translatedText })),
      knownFacts: structuredClone(input.knownFacts), openQuestions: input.preBrief.openQuestions, doNotAsk: input.preBrief.doNotAsk,
      knowledge: { status: input.knowledge.status, answer: input.knowledge.answer, citationIds: input.knowledge.evidence.map(e => e.id) }, maxCards: 6,
    },
  };
  const attempts = deps.provider instanceof FailoverProvider ? 1 : 2;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      if (deps.signal?.aborted) throw new DOMException("Card execution cancelled.", "AbortError");
      await deps.preflight?.();
      const generated = await deps.provider.generate({ ...request, input: attempt === 0 ? request.input : { ...request.input, previousAttemptError: "Provider output did not match the required schema." } });
      if (deps.signal?.aborted) throw new DOMException("Card execution cancelled.", "AbortError");
      const parsed = PlannerSkillOutputSchema.safeParse(generated);
      if (!parsed.success) return { status: "planner_failed", candidates: [] };
      return { status: "ok", candidates: parsed.data.cards.slice(0, MAX_PLANNER_CARDS) };
    } catch (err) {
      if (deps.signal?.aborted || err instanceof ProviderAuthorizationRefusedError) throw err;
      if (err instanceof ModelOutputSchemaError) {
        if (attempt + 1 < attempts) continue;
        return { status: "planner_failed", candidates: [] };
      }
      const name = errorName(err);
      if (name && AI_DOWN_ERRORS.has(name)) return { status: "ai_unavailable", candidates: [] };
      throw err;
    }
  }
  return { status: "planner_failed", candidates: [] };
}

/** One mandatory semantic request. A malformed or incomplete batch can never be repaired into approval. */
export async function semanticVerify(
  cards: Card[],
  context: { knownFacts: KnownFact[]; knowledge: KnowledgeOutput; turns?: ScribeTurn[] },
  deps: Pick<LiveCardsDeps, "provider" | "skillsDir" | "preflight" | "signal">,
): Promise<{ kept: Card[]; dropped: DroppedCard[] }> {
  if (cards.length === 0) return { kept: [], dropped: [] };
  const supplied = cards.every(card => card.sources.length > 0 && card.sources.every(source => {
    if (source.type === "transcript") return context.turns?.some(turn => turn.turnId === source.id && typeof source.quote === "string" && source.quote.length > 0 && (turn.text.includes(source.quote) || turn.translatedText?.includes(source.quote)));
    if (source.type === "profile") return context.knownFacts.some(fact => fact.id === source.id);
    if (source.type === "kb") return context.knowledge.status === "ok" && !!context.knowledge.answer && context.knowledge.evidence.some(evidence => evidence.id === source.id);
    return false;
  }));
  if (!supplied) return { kept: [], dropped: cards.map(c => ({ cardId: c.id, type: c.type, reason: "verifier_rejected" as const })) };
  let decisions: ReturnType<typeof VerifierSkillOutputSchema.parse>["decisions"] | undefined;
  try {
    if (deps.signal?.aborted) throw new DOMException("Card execution cancelled.", "AbortError");
    await deps.preflight?.();
    const generated = await deps.provider.generate({
      skillName: "verifier", skillPrompt: loadSkill(deps.skillsDir, "verifier"), outputSchema: VerifierSkillOutputSchema,
      signal: deps.signal, preflight: deps.preflight,
      input: { cards: cards.map(c => ({ id: c.id, type: c.type, prompt: c.prompt, sources: structuredClone(c.sources) })), knownFacts: structuredClone(context.knownFacts), turns: structuredClone(context.turns ?? []), knowledge: structuredClone(context.knowledge) },
    });
    if (deps.signal?.aborted) throw new DOMException("Card execution cancelled.", "AbortError");
    const parsed = VerifierSkillOutputSchema.safeParse(generated);
    if (parsed.success) {
      const byId = new Map(cards.map(c => [c.id, c]));
      const ids = new Set(parsed.data.decisions.map(d => d.cardId));
      const complete = byId.size === cards.length && ids.size === cards.length && parsed.data.decisions.length === cards.length &&
        parsed.data.decisions.every(d => {
          const card = byId.get(d.cardId);
          if (!card) return false;
          if (d.noScript === "clear" && d.citation === "clear" && d.offendingSpans.length !== 0) return false;
          if ((d.noScript === "violation" || d.citation === "violation") && d.offendingSpans.length === 0) return false;
          const spanKeys = new Set(d.offendingSpans.map(span => `${span.start}:${span.end}`));
          if (spanKeys.size !== d.offendingSpans.length) return false;
          return d.offendingSpans.every(span => span.start < span.end && span.end <= card.prompt.length && card.prompt.slice(span.start, span.end) === span.text &&
            !(span.start > 0 && /[\uD800-\uDBFF]/.test(card.prompt[span.start - 1]!) && /[\uDC00-\uDFFF]/.test(card.prompt[span.start]!)) &&
            !(span.end < card.prompt.length && /[\uD800-\uDBFF]/.test(card.prompt[span.end - 1]!) && /[\uDC00-\uDFFF]/.test(card.prompt[span.end]!)));
        });
      if (complete) decisions = parsed.data.decisions;
    }
  } catch (err) {
    if (deps.signal?.aborted || err instanceof ProviderAuthorizationRefusedError) throw err;
    const name = errorName(err);
    if (!(err instanceof ModelOutputSchemaError) && !(name && AI_DOWN_ERRORS.has(name))) throw err;
  }
  const clearIds = new Set(decisions?.filter(d => d.noScript === "clear" && d.citation === "clear" && d.confidence >= 0.95 && d.offendingSpans.length === 0).map(d => d.cardId));
  return { kept: cards.filter(c => clearIds.has(c.id)), dropped: cards.filter(c => !clearIds.has(c.id)).map(c => ({ cardId: c.id, type: c.type, reason: "verifier_rejected" as const })) };
}

// ---------------------------------------------------------------------------
// selection (plan.md §3 step 7: at most 3; quiet mode)
// ---------------------------------------------------------------------------

export function selectCards(kept: Card[], quiet: boolean): { cards: Card[]; held: number; suppressedByQuiet: number } {
  const checkIns = kept.filter((c) => c.type === "check-in");
  const others = kept
    .filter((c) => c.type !== "check-in")
    .map((c, i) => ({ c, i }))
    .sort((a, b) => b.c.confidence - a.c.confidence || a.i - b.i)
    .map(({ c }) => c);
  if (quiet) {
    const shown = checkIns.slice(0, MAX_VISIBLE_CARDS);
    return { cards: shown, held: checkIns.length - shown.length, suppressedByQuiet: others.length };
  }
  const ordered = [...checkIns, ...others];
  const shown = ordered.slice(0, MAX_VISIBLE_CARDS);
  return { cards: shown, held: ordered.length - shown.length, suppressedByQuiet: 0 };
}

export function relevanceFor(knownFacts: KnownFact[], turns: ScribeTurn[], deps: Pick<LiveCardsDeps, "now">): RelevanceContext {
  return buildRelevanceContext(knownFacts, turns, deps.now ? deps.now() : new Date());
}
