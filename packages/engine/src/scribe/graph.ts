/**
 * The post-session scribe as a LangGraph.js 1.x StateGraph (H1/D-002, T-007). WIRING ONLY: each
 * node picks its input slice from state, calls a plain function in nodes.ts, and returns that
 * function's Zod-validated output (B5). Order (plan.md §3 steps 8-9):
 *
 *   consent_gate -> crisis_gate -> extract_facts -> summarize_session -> propose_diff
 *     -> counsellor_approval (interrupt) -> write_approved
 *
 * - consent refused  -> END with status "refused"   (B4: before anything else)
 * - crisis/concern   -> END with status "escalated" (B9: before any provider call)
 * - provider output schema-invalid after 1 retry -> END with "extraction_failed" / "summary_failed"
 * - counsellor reject -> END with status "rejected" (B3: nothing written)
 * - approve / edit   -> write_approved              (B3: the only write, after the interrupt)
 */
import { Annotation, Command, END, START, StateGraph, interrupt, type BaseCheckpointSaver } from "@langchain/langgraph";
import type { Callbacks } from "@langchain/core/callbacks/manager";
import type { CounsellorDecision, Fact, ProfileDiff } from "@vc/schemas";
import { createLangfuseCallbacks, type TracingConfig } from "@vc/observability";
import {
  checkConsent,
  checkCrisis,
  decisionFromResponse,
  extractFacts,
  proposeDiff,
  summarizeSession,
  writeApproved,
  type ScribeDeps,
} from "./nodes.js";
import {
  ApprovalRequestSchema,
  ApprovalResponseSchema,
  ScribeInputSchema,
  ScribeResultSchema,
  type ApprovalRequest,
  type ApprovalResponse,
  type DroppedFact,
  type ScribeEscalation,
  type ScribeInput,
  type ScribeResult,
  type ScribeTurn,
} from "./schemas.js";

export const SCRIBE_NODES = {
  consent: "consent_gate",
  crisis: "crisis_gate",
  extract: "extract_facts",
  summary: "summarize_session",
  diff: "propose_diff",
  approval: "counsellor_approval",
  write: "write_approved",
} as const;

const last = <T>() => Annotation<T>({ reducer: (_prev: T, next: T) => next, default: () => undefined as T });

export const ScribeState = Annotation.Root({
  // input (set once by the caller, never regenerated inside a node — D-012)
  sessionId: Annotation<string>,
  studentId: Annotation<string>,
  sessionEndedAt: Annotation<string>,
  turns: Annotation<ScribeTurn[]>,
  // node outputs
  consent: last<"granted" | "refused" | undefined>(),
  escalation: last<ScribeEscalation | null | undefined>(),
  facts: last<Fact[] | undefined>(),
  dropped: last<DroppedFact[] | undefined>(),
  summary: last<string | undefined>(),
  summaryWithheldReason: last<string | undefined>(),
  diff: last<ProfileDiff | undefined>(),
  proposedFacts: last<Fact[] | undefined>(),
  decision: last<CounsellorDecision | undefined>(),
  result: last<ScribeResult | undefined>(),
});
type State = typeof ScribeState.State;

export function buildScribeGraph(deps: ScribeDeps) {
  return new StateGraph(ScribeState)
    .addNode(SCRIBE_NODES.consent, async (s: State) => {
      const out = await checkConsent({ studentId: s.studentId }, deps);
      return out.consent === "refused"
        ? { consent: out.consent, result: ScribeResultSchema.parse({ status: "refused", reason: out.refusalReason }) }
        : { consent: out.consent };
    })
    .addNode(SCRIBE_NODES.crisis, (s: State) => {
      const out = checkCrisis({ turns: s.turns });
      return out.escalation
        ? { escalation: out.escalation, result: ScribeResultSchema.parse({ status: "escalated", escalation: out.escalation }) }
        : { escalation: null };
    })
    .addNode(SCRIBE_NODES.extract, async (s: State) => {
      const { failedReason, ...out } = await extractFacts({ turns: s.turns, sessionEndedAt: s.sessionEndedAt }, deps);
      return failedReason
        ? { ...out, result: ScribeResultSchema.parse({ status: "extraction_failed", reason: failedReason }) }
        : out;
    })
    .addNode(SCRIBE_NODES.summary, async (s: State) => {
      const { failedReason, ...out } = await summarizeSession({ turns: s.turns, facts: s.facts }, deps);
      return failedReason
        ? { ...out, result: ScribeResultSchema.parse({ status: "summary_failed", reason: failedReason }) }
        : out;
    })
    .addNode(SCRIBE_NODES.diff, async (s: State) =>
      proposeDiff({ studentId: s.studentId, summary: s.summary, facts: s.facts }, deps),
    )
    .addNode(SCRIBE_NODES.approval, (s: State) => {
      const request: ApprovalRequest = ApprovalRequestSchema.parse({
        sessionId: s.sessionId,
        studentId: s.studentId,
        summary: s.summary,
        summaryWithheldReason: s.summaryWithheldReason,
        diff: s.diff,
        facts: s.proposedFacts,
        dropped: s.dropped,
      });
      // B3: the graph suspends here; the counsellor's typed response resumes it.
      const response = ApprovalResponseSchema.parse(interrupt(request));
      const { decision } = decisionFromResponse(response, s.proposedFacts ?? []);
      return decision.approve
        ? { decision }
        : {
            decision,
            result: ScribeResultSchema.parse({
              status: "rejected",
              reason: response.action === "reject" ? response.reason : undefined,
            }),
          };
    })
    .addNode(SCRIBE_NODES.write, async (s: State) => ({
      result: await writeApproved({ sessionId: s.sessionId, diff: s.diff, decision: s.decision }, deps),
    }))
    .addEdge(START, SCRIBE_NODES.consent)
    .addConditionalEdges(SCRIBE_NODES.consent, (s: State) => (s.consent === "granted" ? SCRIBE_NODES.crisis : END), [
      SCRIBE_NODES.crisis,
      END,
    ])
    .addConditionalEdges(SCRIBE_NODES.crisis, (s: State) => (s.escalation ? END : SCRIBE_NODES.extract), [
      SCRIBE_NODES.extract,
      END,
    ])
    // ISS-t-007-rev-1: a schema-invalid provider output (after the bounded retry) ends the run.
    .addConditionalEdges(
      SCRIBE_NODES.extract,
      (s: State) => (s.result?.status === "extraction_failed" ? END : SCRIBE_NODES.summary),
      [SCRIBE_NODES.summary, END],
    )
    .addConditionalEdges(
      SCRIBE_NODES.summary,
      (s: State) => (s.result?.status === "summary_failed" ? END : SCRIBE_NODES.diff),
      [SCRIBE_NODES.diff, END],
    )
    .addEdge(SCRIBE_NODES.diff, SCRIBE_NODES.approval)
    .addConditionalEdges(
      SCRIBE_NODES.approval,
      (s: State) => (s.decision?.approve === true ? SCRIBE_NODES.write : END),
      [SCRIBE_NODES.write, END],
    )
    .addEdge(SCRIBE_NODES.write, END);
}

/**
 * Compiles the scribe with a checkpointer (required: interrupt() needs one). Tests pass
 * MemorySaver; runtime passes createScribeCheckpointer(client) (Mongo, virtual_counsellor only).
 */
export function compileScribeGraph(deps: ScribeDeps, options: { checkpointer: BaseCheckpointSaver }) {
  return buildScribeGraph(deps).compile({ checkpointer: options.checkpointer });
}

export type ScribeGraph = ReturnType<typeof compileScribeGraph>;

// ---------------------------------------------------------------------------
// Run helpers
// ---------------------------------------------------------------------------

export interface ScribeRunOptions {
  /** The LangGraph thread. Recommended: scribeThreadId(sessionId), one thread per session. */
  threadId: string;
  /**
   * Resume/fork from a specific checkpoint (replay). An approval interrupt is ONE-SHOT per thread
   * (ISS-t-007-c0-1): once a decision is recorded, resuming with a response, from this or any
   * earlier checkpoint, returns `already_resolved` and applies nothing. A genuine "redo the
   * approval" needs a new scribe run on a new thread.
   */
  checkpointId?: string;
  /** LangChain callbacks, e.g. from createLangfuseCallbacks (B7). */
  callbacks?: Callbacks;
}

/** One thread per session, derivable from the sessionId (so T-011 erasure can find the checkpoints). */
export function scribeThreadId(sessionId: string): string {
  return `scribe:${sessionId}`;
}

/**
 * Builds run options with the @vc/observability callbacks (B7). createLangfuseCallbacks re-validates
 * the config (ISS-t-004-langfuse-1) and returns [] when tracing is disabled.
 */
export function scribeRunConfig(opts: { threadId: string; checkpointId?: string; tracing: TracingConfig }) {
  return {
    threadId: opts.threadId,
    checkpointId: opts.checkpointId,
    callbacks: createLangfuseCallbacks(opts.tracing),
  };
}

export type ScribeOutcome =
  | { kind: "awaiting_approval"; request: ApprovalRequest }
  | { kind: "done"; result: ScribeResult }
  /**
   * ISS-t-007-c0-1: the thread's approval was already decided, so `attempted` was NOT applied.
   * `decision` is the original, still-effective decision; `result` is its outcome (null while a
   * failed write is pending, which only `resumeScribe(graph, null, ...)` retries).
   */
  | { kind: "already_resolved"; decision: CounsellorDecision; result: ScribeResult | null; attempted: ApprovalResponse };

function runnableConfig(opts: ScribeRunOptions) {
  return {
    configurable: {
      thread_id: opts.threadId,
      ...(opts.checkpointId ? { checkpoint_id: opts.checkpointId } : {}),
    },
    callbacks: opts.callbacks,
  };
}

async function readOutcome(graph: ScribeGraph, threadId: string): Promise<ScribeOutcome> {
  const snapshot = await graph.getState({ configurable: { thread_id: threadId } });
  const interrupts = snapshot.tasks.flatMap((task) => task.interrupts);
  if (interrupts.length > 0) {
    return { kind: "awaiting_approval", request: ApprovalRequestSchema.parse(interrupts[0]!.value) };
  }
  return { kind: "done", result: ScribeResultSchema.parse((snapshot.values as State).result) };
}

/** Starts a scribe run. The input is Zod-validated before the graph sees it (B5). */
export async function startScribe(graph: ScribeGraph, input: ScribeInput, opts: ScribeRunOptions): Promise<ScribeOutcome> {
  const parsed = ScribeInputSchema.parse(input);
  await graph.invoke(parsed, runnableConfig(opts));
  return readOutcome(graph, opts.threadId);
}

/**
 * Resumes a paused or failed run. With a counsellor response, resumes the interrupt (the response is
 * validated first, so an invalid one never reaches the graph). With `null`, re-runs whatever the
 * last checkpoint left pending (crash recovery: e.g. a failed write_approved).
 *
 * ISS-t-007-c0-1: LangGraph caches an interrupt's resolution per task, so resuming an
 * already-decided approval (e.g. forking the pre-approval checkpoint with a different response)
 * would silently replay the ORIGINAL decision and report it as done. This function therefore reads
 * the thread's latest state first: if a decision is already recorded, it returns `already_resolved`
 * with that decision and does not invoke the graph.
 */
export async function resumeScribe(
  graph: ScribeGraph,
  response: ApprovalResponse | null,
  opts: ScribeRunOptions,
): Promise<ScribeOutcome> {
  if (response === null) {
    await graph.invoke(null, runnableConfig(opts));
  } else {
    const parsed = ApprovalResponseSchema.parse(response);
    const latest = (await graph.getState({ configurable: { thread_id: opts.threadId } })).values as Partial<State>;
    if (latest.decision) {
      return {
        kind: "already_resolved",
        decision: latest.decision,
        result: latest.result ? ScribeResultSchema.parse(latest.result) : null,
        attempted: parsed,
      };
    }
    await graph.invoke(new Command({ resume: parsed }), runnableConfig(opts));
  }
  return readOutcome(graph, opts.threadId);
}
