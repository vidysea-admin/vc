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
import { createHash } from "node:crypto";
import { scribeResolutionsCollection, type ScribeResolutionDoc } from "@vc/db";
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
  const graph = buildScribeGraph(deps).compile({ checkpointer: options.checkpointer });
  graphDb.set(graph, deps.db);
  return graph;
}

/**
 * ISS-t-007-rev-8: resumeScribe claims the approval in the graph's own `virtual_counsellor` Db
 * (B12), so it needs the Db the graph was compiled with. Kept off the public ScribeGraph type so
 * callers keep the (graph, response, opts) signature. A graph compiled some other way has no Db
 * here, and resumeScribe refuses it (fails closed) rather than resuming without a claim.
 */
const graphDb = new WeakMap<object, ScribeDeps["db"]>();

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
  /**
   * ISS-t-007-rev-8: under concurrency, the loser of the atomic claim gets this too, with the
   * WINNER's decision. `sameAsWinner` is true when `attempted` is the identical request (same
   * response hash) as the one that holds the claim, i.e. the caller's decision IS the applied one.
   */
  | {
      kind: "already_resolved";
      decision: CounsellorDecision;
      result: ScribeResult | null;
      attempted: ApprovalResponse;
      sameAsWinner: boolean;
    };

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

/** Canonical JSON (sorted object keys, recursively), so equal responses hash equally. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** sha256 of a parsed approval response: the claim's "same request" identity. */
export function approvalResponseHash(response: ApprovalResponse): string {
  return createHash("sha256").update(canonicalJson(response)).digest("hex");
}

function isDuplicateKey(err: unknown): boolean {
  return (err as { code?: unknown } | null)?.code === 11000;
}

function claimsFor(graph: ScribeGraph) {
  const db = graphDb.get(graph);
  if (!db) {
    throw new Error("resumeScribe: graph was not built by compileScribeGraph, so the approval claim store is unknown");
  }
  return scribeResolutionsCollection(db);
}

function alreadyResolved(
  winner: { decision: CounsellorDecision; responseHash?: string },
  result: ScribeResult | undefined,
  attempted: ApprovalResponse,
): ScribeOutcome {
  return {
    kind: "already_resolved",
    decision: winner.decision,
    result: result ? ScribeResultSchema.parse(result) : null,
    attempted,
    sameAsWinner: winner.responseHash === approvalResponseHash(attempted),
  };
}

/**
 * Resumes a paused or failed run. With a counsellor response, resumes the interrupt (the response is
 * validated first, so an invalid one never reaches the graph). With `null`, re-runs whatever the
 * last checkpoint left pending (crash recovery: e.g. a failed write_approved).
 *
 * ISS-t-007-c0-1: LangGraph caches an interrupt's resolution per task, so resuming an
 * already-decided approval (e.g. forking the pre-approval checkpoint with a different response)
 * would silently replay the ORIGINAL decision and report it as done. If a decision is already
 * recorded in the thread's latest state, this returns `already_resolved` and does not invoke.
 *
 * ISS-t-007-rev-8 (atomic claim): that state check alone is read-then-invoke, so two concurrent
 * resumes could both pass it. Before invoking, this therefore inserts ONE claim doc into
 * `scribe_resolutions` (`_id` = `threadId`, unique index on `threadId`), which is atomic across
 * processes. Only the caller whose insert succeeds invokes the graph. A caller whose insert fails
 * with 11000 reads the claim and returns `already_resolved` with the WINNER's decision. Its
 * `sameAsWinner` is true when its response hash equals the claim's, so an identical duplicate is
 * recognisable, but it still does NOT invoke: one claim, one invoke, no double write. Such a caller
 * is never told `done`.
 *
 * Crash handling around the claim:
 * - Crash AFTER the claim, BEFORE the graph records the decision (the invoke never ran, or died
 *   inside the approval node): the thread is still paused at the interrupt and the claim holds the
 *   winner's validated `response`. Any further response gets `already_resolved` (result `null`).
 *   `resumeScribe(graph, null, ...)` sees a claim plus a still-pending interrupt and resumes the
 *   graph with the CLAIMED response, applying exactly the decision that won the claim.
 * - Crash AFTER the decision is recorded (e.g. inside write_approved): unchanged. `resumeScribe(null)`
 *   re-runs the pending write from the checkpoint, idempotent by D-012.
 * - The claim is never deleted here, so a crashed claim can not be re-won by a different decision.
 * Recovery (`null`) is not itself claimed: run it from one place (the retry job), not concurrently
 * with an in-flight winner. Even then, D-012 keeps the write idempotent.
 */
export async function resumeScribe(
  graph: ScribeGraph,
  response: ApprovalResponse | null,
  opts: ScribeRunOptions,
): Promise<ScribeOutcome> {
  const claims = claimsFor(graph);
  const stateConfig = { configurable: { thread_id: opts.threadId } };

  if (response === null) {
    const snapshot = await graph.getState(stateConfig);
    const latest = snapshot.values as Partial<State>;
    const pendingInterrupt = snapshot.tasks.some((task) => task.interrupts.length > 0);
    const claim = !latest.decision && pendingInterrupt ? await claims.findOne({ threadId: opts.threadId }) : null;
    if (claim) {
      // Crash after the claim, before the decision was recorded: apply the CLAIMED response.
      const claimed = ApprovalResponseSchema.parse(claim.response);
      await graph.invoke(new Command({ resume: claimed }), runnableConfig({ ...opts, checkpointId: undefined }));
    } else {
      await graph.invoke(null, runnableConfig(opts));
    }
    return readOutcome(graph, opts.threadId);
  }

  const parsed = ApprovalResponseSchema.parse(response);
  const snapshot = await graph.getState(stateConfig);
  const latest = snapshot.values as Partial<State>;
  if (latest.decision) {
    const claim = await claims.findOne({ threadId: opts.threadId });
    return alreadyResolved({ decision: latest.decision, responseHash: claim?.responseHash }, latest.result, parsed);
  }

  if (snapshot.tasks.some((task) => task.interrupts.length > 0)) {
    // The decision this response resolves to (the same pure function the approval node runs), so a
    // loser can be told the winner's decision even while the winner's invoke is still in flight.
    // A response that decisionFromResponse refuses throws here, BEFORE any claim is taken.
    const { decision } = decisionFromResponse(parsed, latest.proposedFacts ?? []);
    const claim: ScribeResolutionDoc = {
      _id: opts.threadId,
      threadId: opts.threadId,
      studentId: latest.studentId ?? "",
      decision,
      response: parsed as unknown as Record<string, unknown>,
      responseHash: approvalResponseHash(parsed),
      claimedAt: new Date().toISOString(),
    };
    try {
      await claims.insertOne(claim);
    } catch (err) {
      if (!isDuplicateKey(err)) throw err;
      const winner = await claims.findOne({ threadId: opts.threadId });
      if (!winner) throw err;
      const now = (await graph.getState(stateConfig)).values as Partial<State>;
      return alreadyResolved(winner, now.result, parsed);
    }
  }
  await graph.invoke(new Command({ resume: parsed }), runnableConfig(opts));
  return readOutcome(graph, opts.threadId);
}
