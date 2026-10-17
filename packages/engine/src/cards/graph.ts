/**
 * T-010: the live cards as a LangGraph.js 1.x StateGraph (H1/D-002; plan.md §3 steps 5-7). WIRING
 * ONLY, like the scribe graph: each node picks its slice of state, calls a plain function in
 * nodes.ts / verifier.ts / relevance.ts, and returns that function's Zod-validated output (B5).
 *
 *   consent_gate -> crisis_gate -> load_profile -> retrieve_knowledge
 *     -> exploration_planner -> verifier -> select_cards
 *
 * - consent refused -> END "refused"   (B4: before anything else, nothing read)
 * - crisis          -> END "escalated" (B9: before any provider call, no card shown)
 * - concern         -> CONTINUES with a cited check-in card (T-022 / B20), shown first
 * - planner down / schema-invalid -> "ai_unavailable" / "planner_failed": the check-in (if any) and
 *   the pre-brief still come back; no unverified card ever does (B2)
 *
 * Read-only: the graph writes nothing. The feedback entry below explicitly refuses persistence
 * until T050 supplies its reviewed durable writer. A live-cards run is a stateless request (the caller sends the recent window),
 * so the graph is compiled WITHOUT a checkpointer: there is nothing to resume.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { isDeepStrictEqual } from "node:util";
import { ProviderAuthorizationRefusedError } from "@vc/providers";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { requireConsent, assertStudentNotFenced, tenantIdOf } from "@vc/db";
import type { PreBriefCard, FeedbackEvent } from "@vc/schemas";
import { PreBriefCardSchema } from "@vc/schemas";
import type { ScribeEscalation, ScribeTurn } from "../scribe/schemas.js";
import {
  CHECK_IN_PROMPT,
  checkConcerns,
  checkConsent,
  LIVE_CARDS_PURPOSE,
  loadKnownFacts,
  planCards,
  relevanceFor,
  retrieveKnowledge,
  selectCards,
  semanticVerify,
  type ConcernGateOutput,
  type LiveCardsDeps,
  type PlanOutput,
} from "./nodes.js";
import { buildPreBrief, buildRelevanceContext, type RelevanceContext } from "./relevance.js";
import {
  LiveCardsInputSchema,
  LiveCardsResultSchema,
  PreBriefInputSchema,
  type KnowledgeOutput,
  type KnownFact,
  type LiveCardsInput,
  type LiveCardsResult,
  type VerifyOutput,
} from "./schemas.js";
import { buildEvidenceIndex, verifyCards } from "./verifier.js";

export const LIVE_CARDS_NODES = {
  consent: "consent_gate",
  crisis: "crisis_gate",
  profile: "load_profile",
  knowledge: "retrieve_knowledge",
  planner: "exploration_planner",
  verifier: "verifier",
  select: "select_cards",
} as const;

const last = <T>() => Annotation<T>({ reducer: (_prev: T, next: T) => next, default: () => undefined as T });

export const LiveCardsState = Annotation.Root({
  sessionId: Annotation<string>,
  studentId: Annotation<string>,
  turns: Annotation<ScribeTurn[]>,
  quiet: Annotation<boolean>,
  escalation: last<ScribeEscalation | null | undefined>(),
  checkIns: last<ConcernGateOutput["checkIns"] | undefined>(),
  knownFacts: last<KnownFact[] | undefined>(),
  relevance: last<RelevanceContext | undefined>(),
  preBrief: last<PreBriefCard | undefined>(),
  knowledge: last<KnowledgeOutput | undefined>(),
  plan: last<PlanOutput | undefined>(),
  verified: last<VerifyOutput | undefined>(),
  result: last<LiveCardsResult | undefined>(),
});
type State = typeof LiveCardsState.State;
const cardAuthority = new AsyncLocalStorage<{ compiled: object; binding: symbol; input: ReturnType<typeof LiveCardsInputSchema.parse>; snapshot?: KnownFact[]; checkIns: ConcernGateOutput["checkIns"]; signal: AbortSignal; streamPermit: boolean; stream?: { compiled: object; binding: symbol; input: ReturnType<typeof LiveCardsInputSchema.parse>; iteratorPermit: boolean; signal?: AbortSignal } }>();

const endIfResult = (next: string) => (s: State) => (s.result ? END : next);

export function buildLiveCardsGraph(deps: LiveCardsDeps) {
  const compiledBindings = new WeakMap<object, symbol>();
  const authorize = async (s: State) => {
    const authority = cardAuthority.getStore();
    if (!authority || compiledBindings.get(authority.compiled) !== authority.binding || !tenantIdOf(deps.db) ||
        s.studentId !== authority.input.studentId || s.sessionId !== authority.input.sessionId ||
        !isDeepStrictEqual(s.turns, authority.input.turns) || s.quiet !== authority.input.quiet) throw new ProviderAuthorizationRefusedError();
    if (authority.signal.aborted || authority.stream?.signal?.aborted) throw new DOMException("Card execution cancelled.", "AbortError");
    const fresh = await loadKnownFacts(s.studentId, { ...deps, signal: authority.stream?.signal ?? authority.signal });
    if (authority.snapshot !== undefined) {
      const ordered = (facts: KnownFact[]) => [...facts].sort((a, b) => a.id.localeCompare(b.id));
      if (!isDeepStrictEqual(ordered(fresh), ordered(authority.snapshot)) || !isDeepStrictEqual(ordered(s.knownFacts ?? []), ordered(authority.snapshot))) throw new ProviderAuthorizationRefusedError();
    }
    try {
      await requireConsent(deps.db, s.studentId, LIVE_CARDS_PURPOSE);
      if (authority.signal.aborted || authority.stream?.signal?.aborted) throw new DOMException("Card execution cancelled.", "AbortError");
      await assertStudentNotFenced(deps.db, s.studentId);
    } catch {
      if (authority.signal.aborted || authority.stream?.signal?.aborted) throw new DOMException("Card execution cancelled.", "AbortError");
      throw new ProviderAuthorizationRefusedError();
    }
    if (authority.signal.aborted || authority.stream?.signal?.aborted) throw new DOMException("Card execution cancelled.", "AbortError");
  };
  const builder = new StateGraph(LiveCardsState)
    .addNode(LIVE_CARDS_NODES.consent, async (s: State) => {
      const authority = cardAuthority.getStore();
      if (!authority || compiledBindings.get(authority.compiled) !== authority.binding || !tenantIdOf(deps.db) ||
          s.studentId !== authority.input.studentId || s.sessionId !== authority.input.sessionId ||
          !isDeepStrictEqual(s.turns, authority.input.turns) || s.quiet !== authority.input.quiet) throw new ProviderAuthorizationRefusedError();
      if (authority.signal.aborted) throw new DOMException("Card execution cancelled.", "AbortError");
      const out = await checkConsent({ studentId: s.studentId }, deps);
      return out.consent === "refused"
        ? { result: LiveCardsResultSchema.parse({ status: "refused", reason: out.refusalReason ?? "consent required" }) }
        : {};
    })
    .addNode(LIVE_CARDS_NODES.crisis, (s: State) => {
      const authority = cardAuthority.getStore();
      if (!authority || compiledBindings.get(authority.compiled) !== authority.binding) throw new ProviderAuthorizationRefusedError();
      const out = checkConcerns({ sessionId: s.sessionId, studentId: s.studentId, turns: s.turns });
      authority.checkIns = structuredClone(out.checkIns);
      return out.escalation
        ? { escalation: out.escalation, result: LiveCardsResultSchema.parse({ status: "escalated", escalation: out.escalation, cards: [] }) }
        : { escalation: null, checkIns: out.checkIns };
    })
    .addNode(LIVE_CARDS_NODES.profile, async (s: State) => {
      const authority = cardAuthority.getStore();
      if (!authority || compiledBindings.get(authority.compiled) !== authority.binding) throw new ProviderAuthorizationRefusedError();
      const knownFacts = await loadKnownFacts(s.studentId, { ...deps, signal: authority.stream?.signal ?? authority.signal });
      authority.snapshot = structuredClone(knownFacts);
      await authorize({ ...s, knownFacts });
      const relevance = relevanceFor(knownFacts, s.turns, deps);
      const preBrief = PreBriefCardSchema.parse(buildPreBrief(knownFacts, relevance));
      return { knownFacts, relevance, preBrief };
    })
    .addNode(LIVE_CARDS_NODES.knowledge, async (s: State) => {
      await authorize(s);
      return { knowledge: await retrieveKnowledge(s.knownFacts ?? [], { ...deps, signal: cardAuthority.getStore()!.stream?.signal ?? cardAuthority.getStore()!.signal, preflight: () => authorize(s) }) };
    })
    .addNode(LIVE_CARDS_NODES.planner, async (s: State) => ({
      plan: await planCards(
        { turns: s.turns, knownFacts: s.knownFacts ?? [], preBrief: s.preBrief!, knowledge: s.knowledge! },
        { ...deps, signal: cardAuthority.getStore()?.stream?.signal ?? cardAuthority.getStore()?.signal, preflight: () => authorize(s) },
      ),
    }))
    .addNode(LIVE_CARDS_NODES.verifier, async (s: State) => {
      await authorize(s);
      const evidence = buildEvidenceIndex(s.knownFacts ?? [], s.turns, s.knowledge!.evidence.map((e) => e.id));
      const first = verifyCards({
        sessionId: s.sessionId,
        candidates: s.plan!.candidates,
        checkIns: s.checkIns ?? [],
        evidence,
        relevance: s.relevance!,
      });
      const controlled = first.kept.filter(c => c.type === "check-in" && c.prompt === CHECK_IN_PROMPT &&
        cardAuthority.getStore()!.checkIns.some(check => check.prompt === c.prompt && isDeepStrictEqual(check.sources, c.sources)));
      const judged = first.kept.filter(c => !controlled.includes(c));
      const second = await semanticVerify(judged, { knownFacts: s.knownFacts ?? [], knowledge: s.knowledge!, turns: s.turns },
        { ...deps, signal: cardAuthority.getStore()!.stream?.signal ?? cardAuthority.getStore()!.signal, preflight: () => authorize(s) });
      await authorize(s);
      second.kept = [...controlled, ...second.kept];
      return { verified: { kept: second.kept, dropped: [...first.dropped, ...second.dropped] } };
    })
    .addNode(LIVE_CARDS_NODES.select, async (s: State) => {
      await authorize(s);
      const verified = s.verified!;
      const shown = selectCards(verified.kept, s.quiet);
      return {
        result: LiveCardsResultSchema.parse({
          status: s.plan!.status,
          cards: shown.cards,
          held: shown.held,
          suppressedByQuiet: shown.suppressedByQuiet,
          droppedCount: verified.dropped.length,
          dropped: verified.dropped,
          knowledge: s.knowledge!.status,
          quiet: s.quiet,
          preBrief: s.preBrief!,
        }),
      };
    })
    .addEdge(START, LIVE_CARDS_NODES.consent)
    .addConditionalEdges(LIVE_CARDS_NODES.consent, endIfResult(LIVE_CARDS_NODES.crisis), [LIVE_CARDS_NODES.crisis, END])
    .addConditionalEdges(LIVE_CARDS_NODES.crisis, endIfResult(LIVE_CARDS_NODES.profile), [LIVE_CARDS_NODES.profile, END])
    .addEdge(LIVE_CARDS_NODES.profile, LIVE_CARDS_NODES.knowledge)
    .addEdge(LIVE_CARDS_NODES.knowledge, LIVE_CARDS_NODES.planner)
    .addEdge(LIVE_CARDS_NODES.planner, LIVE_CARDS_NODES.verifier)
    .addEdge(LIVE_CARDS_NODES.verifier, LIVE_CARDS_NODES.select)
    .addEdge(LIVE_CARDS_NODES.select, END);
  const compile = builder.compile.bind(builder);
  // Forward the exact compiler options and retain LangGraph's generic transformer tuple signature.
  builder.compile = ((...args: Parameters<typeof compile>) => {
    const compiled = compile(...args);
    const binding = Symbol("live-card-compiled-graph");
    compiledBindings.set(compiled, binding);
    const invoke = compiled.invoke.bind(compiled);
    const stream = compiled.stream.bind(compiled);
    const iterator = compiled._streamIterator.bind(compiled);
    compiled.stream = async (raw, options) => {
      const authority = cardAuthority.getStore();
      if (!authority || authority.compiled !== compiled || authority.binding !== binding || !authority.streamPermit) throw new ProviderAuthorizationRefusedError();
      authority.streamPermit = false;
      if (authority.signal.aborted) throw new DOMException("Card execution cancelled.", "AbortError");
      if (!isDeepStrictEqual(LiveCardsInputSchema.parse(raw), authority.input)) throw new ProviderAuthorizationRefusedError();
      authority.stream = { compiled, binding, input: structuredClone(authority.input), iteratorPermit: true };
      try { return await stream(raw, options); }
      finally { authority.stream.iteratorPermit = false; }
    };
    // Ordinary function: consume the private permit at call time, before generator setup/callbacks.
    compiled._streamIterator = (raw, options) => {
      const authority = cardAuthority.getStore();
      const execution = authority?.stream;
      if (!authority || authority.compiled !== compiled || authority.binding !== binding || !execution || execution.compiled !== compiled || execution.binding !== binding || !execution.iteratorPermit) throw new ProviderAuthorizationRefusedError();
      execution.iteratorPermit = false;
      if (authority.signal.aborted || options?.signal?.aborted) throw new DOMException("Card execution cancelled.", "AbortError");
      if (!options?.signal || !isDeepStrictEqual(LiveCardsInputSchema.parse(raw), execution.input)) throw new ProviderAuthorizationRefusedError();
      // Pregel.stream combines the original signal with its own controller. Keep that actual signal
      // on the same authority object used by nodes and final publication across readable-stream pulls.
      execution.signal = options.signal;
      return iterator(raw, options);
    };
    compiled.streamEvents = () => { throw new ProviderAuthorizationRefusedError(); };
    compiled.streamLog = () => { throw new ProviderAuthorizationRefusedError(); };
    compiled.transform = () => { throw new ProviderAuthorizationRefusedError(); };
    compiled.withConfig = () => { throw new ProviderAuthorizationRefusedError(); };
    compiled.invoke = async (raw, options) => {
      const input = LiveCardsInputSchema.parse(raw);
      const deadline = deps.deadlineMs ?? 45000;
      if (!Number.isFinite(deadline) || deadline <= 0 || deadline > 45000) throw new RangeError("Invalid live-card deadline.");

      const controller = new AbortController();
      const signals = [...new Set([options?.signal, deps.signal].filter((signal): signal is AbortSignal => signal !== undefined))];
      const cancel = () => controller.abort();
      if (signals.some(signal => signal.aborted)) controller.abort();
      for (const signal of signals) signal.addEventListener("abort", cancel, { once: true });
      const timer = setTimeout(cancel, deadline);
      let rejectCancelled: (() => void) | undefined;
      const cancelled = new Promise<never>((_, reject) => {
        rejectCancelled = () => reject(new DOMException("Card execution cancelled.", "AbortError"));
        controller.signal.addEventListener("abort", rejectCancelled, { once: true });
      });
      try {
        if (controller.signal.aborted) throw new DOMException("Card execution cancelled.", "AbortError");
        return await cardAuthority.run({ compiled, binding, input: structuredClone(input), checkIns: [], signal: controller.signal, streamPermit: true }, async () => {
          const result = await Promise.race([invoke(input, { ...options, signal: controller.signal }), cancelled]);
          if (controller.signal.aborted) throw new DOMException("Card execution cancelled.", "AbortError");
          const published = LiveCardsResultSchema.parse(result.result);
          if (published.status !== "refused") {
            const publication = "held" in published
              ? authorize(result)
              : requireConsent(deps.db, input.studentId, LIVE_CARDS_PURPOSE).catch(() => { throw new ProviderAuthorizationRefusedError(); });
            await Promise.race([publication, cancelled]);
          }
          if (controller.signal.aborted) throw new DOMException("Card execution cancelled.", "AbortError");
          return result;
        });
      } finally {
        clearTimeout(timer);
        for (const signal of signals) signal.removeEventListener("abort", cancel);
        if (rejectCancelled) controller.signal.removeEventListener("abort", rejectCancelled);
      }
    };
    return compiled;
  }) as typeof builder.compile;
  return builder;
}

/** Runs one live-cards request end to end (B5: the input is parsed here, the result on the way out). */
export async function runLiveCards(deps: LiveCardsDeps, rawInput: LiveCardsInput | unknown): Promise<LiveCardsResult> {
  const input = LiveCardsInputSchema.parse(rawInput);
  const graph = buildLiveCardsGraph(deps).compile();
  const out = await graph.invoke({ sessionId: input.sessionId, studentId: input.studentId, turns: input.turns, quiet: input.quiet });
  return LiveCardsResultSchema.parse(out.result);
}

/**
 * The pre-brief card before a session (plan.md §3 step 1): what the approved profile already says,
 * what is still open, and what not to ask (B18). Consent-checked by readActiveProfile (B4: throws
 * ConsentRequiredError without consent). No provider call, no write.
 */
export async function buildPreBriefFor(deps: Pick<LiveCardsDeps, "db" | "now">, rawInput: { studentId: string }): Promise<PreBriefCard> {
  const { studentId } = PreBriefInputSchema.parse(rawInput);
  if (!tenantIdOf(deps.db)) throw new ProviderAuthorizationRefusedError();
  await requireConsent(deps.db, studentId, LIVE_CARDS_PURPOSE);
  const knownFacts = await loadKnownFacts(studentId, deps);
  await requireConsent(deps.db, studentId, LIVE_CARDS_PURPOSE);
  await assertStudentNotFenced(deps.db, studentId);
  const relevance = buildRelevanceContext(knownFacts, [], deps.now ? deps.now() : new Date());
  return PreBriefCardSchema.parse(buildPreBrief(knownFacts, relevance));
}

/** Feedback remains OPEN (T050). Authorize reads only; never claim persistence or fabricate an ID. */
export async function recordLiveCardFeedback(
  db: LiveCardsDeps["db"],
  input: { studentId: string; sessionId: string; counsellorId: string; event: FeedbackEvent },
  options: { deadlineMs?: number } = {},
): Promise<{ _id: string }> {
  if (!tenantIdOf(db)) throw new ProviderAuthorizationRefusedError();
  await requireConsent(db, input.studentId, LIVE_CARDS_PURPOSE);
  await assertStudentNotFenced(db, input.studentId, options.deadlineMs !== undefined ? { timeoutMS: options.deadlineMs } : {});
  const unavailable = new Error("Card feedback persistence is unavailable.");
  unavailable.name = "CardFeedbackUnavailableError";
  throw unavailable;
}
