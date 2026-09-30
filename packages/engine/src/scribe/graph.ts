/**
 * The post-session scribe as a LangGraph.js 1.x StateGraph (H1/D-002, T-007). WIRING ONLY: each
 * node picks its input slice from state, calls a plain function in nodes.ts, and returns that
 * function's Zod-validated output (B5). Order (plan.md §3 steps 8-9):
 *
 *   consent_gate -> crisis_gate -> extract_facts -> summarize_session -> propose_diff
 *     -> counsellor_approval (interrupt) -> write_approved
 *
 * - consent refused  -> END with status "refused"   (B4: before anything else)
 * - crisis           -> END with status "escalated" (B9: before any provider call)
 * - concern          -> CONTINUES (T-022 / D-020 / B20): flagged in state and in the approval payload
 *                       (`concerns`), and written to the Student KG as a cited edge by startScribe
 * - provider output schema-invalid after 1 retry -> END with "extraction_failed" / "summary_failed"
 * - counsellor reject -> END with status "rejected" (B3: nothing written)
 * - approve / edit   -> write_approved              (B3: the only write, after the interrupt)
 */
import { Annotation, Command, END, START, StateGraph, interrupt, type BaseCheckpointSaver } from "@langchain/langgraph";
import type { Callbacks } from "@langchain/core/callbacks/manager";
import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { ProviderAuthorizationRefusedError } from "@vc/providers";
import {
  deriveEdgeId,
  edgesCollection,
  ensureScribeSessionRow,
  FENCE_MARGIN_MS,
  FENCE_POSTCHECK_TIMEOUT_MS,
  FencedWriterDeadlineError,
  isStudentFenced,
  recordRejectReasons,
  recordSessionTranscript,
  scribeResolutionsCollection,
  sessionsCollection,
  sessionTranscriptsCollection,
  StudentFencedError,
  TenantScopeError,
  tenantIdOf,
  transcriptTurnDocId,
  WriterDeadline,
  type EdgeDoc,
  type EdgeRef,
  type ScribeResolutionDoc,
} from "@vc/db";
import type { Collection } from "mongodb";
import { ConcernRecordSchema, type ConcernRecord, type CounsellorDecision, type Fact, type ProfileDiff } from "@vc/schemas";
import { createLangfuseCallbacks, type TracingConfig } from "@vc/observability";
import { escalateTurns, type EscalationDeps } from "../guards/escalation.js";
import {
  boundedDeadlineMs,
  checkConsent,
  checkCrisis,
  decisionFromResponse,
  extractFacts,
  loadApprovedContext,
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
  type ApprovedContext,
  type ApprovalResponse,
  type DroppedFact,
  type ScribeEscalation,
  type ScribeInput,
  type ScribeResult,
  type ScribeTurn,
  type SummaryDecision,
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
  /** T-022: concern-level flags (the run continued); surfaced in the approval payload. */
  concerns: last<ConcernRecord[] | undefined>(),
  approvedContext: last<ApprovedContext[] | undefined>(),
  facts: last<Fact[] | undefined>(),
  dropped: last<DroppedFact[] | undefined>(),
  summary: last<string | undefined>(),
  summaryWithheldReason: last<string | undefined>(),
  diff: last<ProfileDiff | undefined>(),
  proposedFacts: last<Fact[] | undefined>(),
  decision: last<CounsellorDecision | undefined>(),
  /** T-008: the counsellor's summary choice on a per_fact response (absent for the batch actions). */
  summaryDecision: last<SummaryDecision | undefined>(),
  result: last<ScribeResult | undefined>(),
});
type State = typeof ScribeState.State;

// Invocation-private authority; pending payloads bind an exact history snapshot, completed
// own writes bind current consent/fence only. No checkpointed permission is accepted.
function authorizeSnapshot(deps: Pick<ScribeDeps, "db">, studentId: string, snapshot: ApprovedContext[] | undefined, signal?: AbortSignal) {
  return async () => {
    let onAbort: (() => void) | undefined;
    try {
      if (!tenantIdOf(deps.db) || !studentId?.trim()) throw new ProviderAuthorizationRefusedError();
      if (signal?.aborted) throw new DOMException("Scribe execution cancelled.", "AbortError");
      const cancelled = new Promise<never>((_, reject) => {
        onAbort = () => reject(new DOMException("Scribe execution cancelled.", "AbortError"));
        signal?.addEventListener("abort", onAbort, { once: true });
      });
      const reading = snapshot === undefined
        ? checkConsent({ studentId }, deps).then((out) => {
            if (out.consent !== "granted") throw new ProviderAuthorizationRefusedError();
          })
        : loadApprovedContext(studentId, { ...deps, signal }).then((fresh) => {
            const ordered = (facts: ApprovedContext[]) => [...facts].sort((a, b) => a.factId.localeCompare(b.factId));
            if (!isDeepStrictEqual(ordered(fresh), ordered(snapshot))) throw new ProviderAuthorizationRefusedError();
          });
      await (signal ? Promise.race([reading, cancelled]) : reading);
      if (signal?.aborted) throw new DOMException("Scribe execution cancelled.", "AbortError");
    } catch {
      if (signal?.aborted) throw new DOMException("Scribe execution cancelled.", "AbortError");
      throw new ProviderAuthorizationRefusedError();
    } finally {
      if (onAbort) signal?.removeEventListener("abort", onAbort);
    }
  };
}

export function buildScribeGraph(deps: ScribeDeps) {
  return new StateGraph(ScribeState)
    .addNode(SCRIBE_NODES.consent, async (s: State) => {
      const out = await checkConsent({ studentId: s.studentId }, deps);
      return out.consent === "refused"
        ? { consent: out.consent, result: ScribeResultSchema.parse({ status: "refused", reason: out.refusalReason }) }
        : { consent: out.consent };
    })
    .addNode(SCRIBE_NODES.crisis, (s: State) => {
      const out = checkCrisis({ sessionId: s.sessionId, studentId: s.studentId, turns: s.turns });
      return out.escalation
        ? { escalation: out.escalation, concerns: [], result: ScribeResultSchema.parse({ status: "escalated", escalation: out.escalation }) }
        : { escalation: null, concerns: out.concerns };
    })
    .addNode(SCRIBE_NODES.extract, async (s: State, runtime: { signal?: AbortSignal }) => {
      const approvedContext = await loadApprovedContext(s.studentId, { ...deps, signal: runtime.signal });
      const preflight = authorizeSnapshot(deps, s.studentId, approvedContext, runtime.signal);
      const { failedReason, ...out } = await extractFacts({ turns: s.turns, sessionEndedAt: s.sessionEndedAt, approvedContext }, { ...deps, preflight, signal: runtime.signal });
      return failedReason
        ? { ...out, approvedContext, result: ScribeResultSchema.parse({ status: "extraction_failed", reason: failedReason }) }
        : { ...out, approvedContext };
    })
    .addNode(SCRIBE_NODES.summary, async (s: State, runtime: { signal?: AbortSignal }) => {
      const preflight = authorizeSnapshot(deps, s.studentId, s.approvedContext ?? [], runtime.signal);
      const { failedReason, ...out } = await summarizeSession({ turns: s.turns, facts: s.facts, approvedContext: s.approvedContext }, { ...deps, preflight, authorizeRelease: preflight, signal: runtime.signal });
      return failedReason
        ? { ...out, result: ScribeResultSchema.parse({ status: "summary_failed", reason: failedReason }) }
        : out;
    })
    .addNode(SCRIBE_NODES.diff, async (s: State) =>
      proposeDiff({ studentId: s.studentId, summary: s.summary, facts: s.facts }, deps),
    )
    .addNode(SCRIBE_NODES.approval, async (
      s: State,
      runtime: { signal?: AbortSignal; configurable?: { thread_id?: string; writerDeadlineExpiresAt?: number } },
    ) => {
      const request: ApprovalRequest = ApprovalRequestSchema.parse({
        sessionId: s.sessionId,
        studentId: s.studentId,
        summary: s.summary,
        summaryWithheldReason: s.summaryWithheldReason,
        diff: s.diff,
        facts: s.proposedFacts,
        dropped: s.dropped,
        ...(s.concerns && s.concerns.length > 0 ? { concerns: s.concerns } : {}),
      });
      await authorizeSnapshot(deps, s.studentId, s.approvedContext ?? [], runtime.signal)();
      // B3: the graph suspends here; the counsellor's typed response resumes it.
      const response = ApprovalResponseSchema.parse(interrupt(request));
      const { decision, summaryDecision, rejectedFacts } = decisionFromResponse(response, s.proposedFacts ?? []);
      // T-018 / residual 3: a per_fact response that rejected at least one proposed fact gets an
      // audit record of the rejected keys and why (never a transcript quote), written whether or
      // not the overall decision approves anything else — independently fence-aware
      // (recordRejectReasons: pre-check, deadline-bounded insert, post-check + compensation), and
      // idempotent under a checkpoint replay of this node (deterministic _id keyed on the thread).
      if (rejectedFacts && rejectedFacts.length > 0) {
        // The REAL LangGraph thread id (whatever the caller passed to start/resumeScribe's
        // ScribeRunOptions.threadId), read from this invoke's own config — NOT derived from
        // sessionId. scribeThreadId(sessionId) is only the RECOMMENDED threadId (see
        // ScribeRunOptions' own docstring); it is not enforced, and every test harness in this
        // package uses its own arbitrary thread ids, so deriving it from sessionId here would
        // record the audit under the wrong key. Falls back to the recommended derivation only
        // for a graph invoked directly (bypassing start/resumeScribe) with no thread_id in its
        // config, which should not happen in practice but keeps this from throwing.
        const threadId = runtime.configurable?.thread_id ?? scribeThreadId(s.sessionId);
        // ISS-t-018-rev-2: bind this write's own deadline to the SAME absolute instant the run
        // lease (and write_approved's own inner writes) are derived from, the ISS-t-016-c0-1
        // pattern — so a caller-shortened writerDeadlineMs shortens this write's timeoutMS too,
        // instead of this call silently defaulting to the package's full 60s default.
        await recordRejectReasons(
          deps.db,
          {
            threadId,
            studentId: s.studentId,
            rejected: rejectedFacts,
          },
          { deadlineMs: boundedDeadlineMs(runtime.configurable?.writerDeadlineExpiresAt) },
        );
      }
      return decision.approve
        ? { decision, summaryDecision }
        : {
            decision,
            summaryDecision,
            result: ScribeResultSchema.parse({
              status: "rejected",
              reason:
                response.action === "reject"
                  ? response.reason
                  : response.action === "per_fact"
                    ? "every proposed fact was rejected and the summary withheld"
                    : undefined,
            }),
          };
    })
    .addNode(SCRIBE_NODES.write, async (s: State, runtime: { configurable?: { writerDeadlineExpiresAt?: number } }) => ({
      // ISS-t-007-rev-7: the approved summary goes to the session row along with the facts.
      // ISS-t-016-c0-1: writeApproved binds its own inner writes to the SAME absolute deadline this
      // run's writer deadline (and therefore its lease) was derived from — see runnableConfig below.
      result: await writeApproved(
        {
          sessionId: s.sessionId,
          studentId: s.studentId,
          diff: s.diff,
          decision: s.decision,
          summary: s.summary ?? "",
          summaryWithheldReason: s.summaryWithheldReason,
          summaryDecision: s.summaryDecision,
        },
        deps,
        { writerDeadlineExpiresAt: runtime.configurable?.writerDeadlineExpiresAt },
      ),
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
  // T-012: escalation records are per tenant; refuse the wiring up front rather than on the first crisis.
  if (deps.escalation && tenantIdOf(deps.db) === undefined) {
    throw new TenantScopeError("compileScribeGraph: `escalation` needs a tenant-scoped db (tenantScopedDb, T-025)");
  }
  const graph = buildScribeGraph(deps).compile({ checkpointer: options.checkpointer });
  graphDeps.set(graph, { db: deps.db, checkpointer: options.checkpointer, escalation: deps.escalation,
    authorize: (studentId, snapshot, signal) => authorizeSnapshot(deps, studentId, snapshot, signal)(),
  });
  return graph;
}

/**
 * ISS-t-007-rev-8: resumeScribe claims the approval in the graph's own `virtual_counsellor` Db
 * (B12), so it needs the Db the graph was compiled with. T-011 cycle 2 (D-015): start and resume
 * also check that Db's erasure fence and, when fenced mid-run, delete the thread from the graph's
 * own checkpointer. Kept off the public ScribeGraph type so callers keep the (graph, input/response,
 * opts) signatures. A graph compiled some other way has neither here, and start/resume refuse it
 * (fail closed) rather than run without a claim or a fence check.
 */
const graphDeps = new WeakMap<
  object,
  { db: ScribeDeps["db"]; checkpointer: BaseCheckpointSaver; escalation?: ScribeDeps["escalation"];
    authorize: (studentId: string, snapshot: ApprovedContext[] | undefined, signal: AbortSignal) => Promise<void> }
>();

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
  /**
   * D-016: this call's fenced-writer deadline, SHORTER than @vc/db FENCED_WRITER_DEADLINE_MS (the
   * default). A longer one throws RangeError: the erasure fence's minimum hold would not cover it.
   */
  writerDeadlineMs?: number;
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
    }
  /**
   * T-011 / D-015: the student has an erasure in progress (an erasure fence is set). The run was
   * refused before invoking, or it was invoked and everything it wrote for this thread was removed
   * again (its checkpoints and checkpoint writes, and the approval claim this call created; the
   * facts and edges are removed by applyApprovedDiff's own post-write compensation).
   */
  | { kind: "fenced" }
  /**
   * T-016 / ISS-t-007-rev-10: a resumeScribe(null) recovery found the thread's run lease held by
   * another process (the in-flight winner of the claim, or another recovery), so it did NOT invoke.
   * Nothing was written. Retry later: the holder releases the lease when it finishes, or the lease
   * expires (the holder's writer deadline + FENCE_MARGIN_MS) if the holder crashed.
   */
  | { kind: "in_progress" };

/**
 * ISS-t-016-c0-1: takes the WriterDeadline itself (not just its signal), so `configurable` can carry
 * `writerDeadlineExpiresAt` — the SAME absolute instant `newLease` derives the run lease from. The
 * write node (SCRIBE_NODES.write above) reads it back and binds applyApprovedDiff's and
 * recordApprovedSessionSummary's own inner WriterDeadlines to it, so the lease's window and the
 * write's own bound can never diverge, however short a caller sets `writerDeadlineMs`.
 */
function runnableConfig(opts: ScribeRunOptions, deadline: WriterDeadline) {
  return {
    configurable: {
      thread_id: opts.threadId,
      ...(opts.checkpointId ? { checkpoint_id: opts.checkpointId } : {}),
      writerDeadlineExpiresAt: deadline.expiresAt,
    },
    callbacks: opts.callbacks,
    // D-016: the writer deadline aborts the run (LangGraph stops scheduling further steps).
    signal: deadline.signal,
  };
}

async function readOutcome(graph: ScribeGraph, threadId: string, deadline: WriterDeadline): Promise<ScribeOutcome> {
  const deps = depsFor(graph, "readOutcome");
  const snapshot = await deadline.run(graph.getState({ configurable: { thread_id: threadId } }));
  deadline.op();
  const latest = snapshot.values as State;
  const interrupts = snapshot.tasks.flatMap((task) => task.interrupts);
  if (latest.studentId) {
    let fenced = true;
    try { fenced = await deadline.run(isStudentFenced(deps.db, latest.studentId, new Date(), deadline.op())); }
    catch { deadline.op(); }
    deadline.op();
    if (fenced) return { kind: "fenced" };
  }
  if (interrupts.length > 0) {
    await deadline.run(deps.authorize(latest.studentId, latest.approvedContext ?? [], deadline.signal));
    deadline.op();
    return { kind: "awaiting_approval", request: ApprovalRequestSchema.parse(interrupts[0]!.value) };
  }
  const result = ScribeResultSchema.parse(latest.result);
  if (result.status !== "refused") await deadline.run(deps.authorize(latest.studentId, undefined, deadline.signal));
  deadline.op();
  return { kind: "done", result };
}

function depsFor(graph: ScribeGraph, caller: string) {
  const deps = graphDeps.get(graph);
  if (!deps) {
    throw new Error(`${caller}: graph was not built by compileScribeGraph, so its claim store and erasure fence are unknown`);
  }
  return deps;
}

type GraphDeps = NonNullable<ReturnType<typeof graphDeps.get>>;

/** What one fence-aware call created, so its compensation removes exactly that and nothing else. */
interface CreatedByCall {
  /** The approval claim this call inserted (deleted by its _id + responseHash, never another caller's). */
  claim?: ScribeResolutionDoc | null;
  /** T-016 / ISS-t-011-rev-5: the session row this call inserted (not one that already existed). */
  sessionRow?: { sessionId: string; studentId: string } | null;
  /**
   * T-024 / ISS-t-013r-c0-3: the transcript turn documents this call CREATED (never turns an
   * earlier run already recorded), filled as each is written so a part-way failure is covered too.
   */
  transcriptTurns?: { studentId: string; ids: string[] } | null;
  /**
   * T-022: the concern edges this call CREATED (upserted), stamped with this call's `writerToken`,
   * so compensation deletes by {_id, writerToken} and never an edge an earlier run created.
   */
  concernEdges?: { writerToken: string; ids: string[] } | null;
}

/** The post-check's fence read; an unreadable fence state counts as fenced (fail-safe). */
async function fencedForPostCheck(db: GraphDeps["db"], studentId: string | undefined): Promise<boolean> {
  if (studentId === undefined || studentId === "") return false;
  try {
    return await isStudentFenced(db, studentId, new Date(), { timeoutMS: FENCE_POSTCHECK_TIMEOUT_MS });
  } catch {
    return true;
  }
}

/**
 * T-011 / D-015 + D-016: runs one graph.invoke as a fence-aware writer. The caller has already
 * refused a student fenced BEFORE the call, under the same `deadline`.
 * - The invoke runs under the writer deadline: its AbortSignal stops the graph and an application
 *   timer stops waiting at the deadline (the facts/edges writer inside, applyApprovedDiff, has its
 *   own driver-level timeoutMS and deadline).
 * - The post-check ALWAYS runs afterwards (success, error, or deadline). If the student is fenced
 *   (or applyApprovedDiff already reported StudentFencedError, or the fence can not be read), this
 *   call's writes are removed: the thread's checkpoints and checkpoint writes (deleteThread on the
 *   graph's own checkpointer), the approval claim this call inserted (by its _id + responseHash,
 *   never another caller's) and the session row this call inserted (T-016; never a row that already
 *   existed, which the erasure purges). The facts and edges were removed by applyApprovedDiff's own
 *   post-check. The approved summary is NOT this function's job: ISS-t-017-rev-1 / ISS-t-017-c1-2 — a
 *   fence landing between recordApprovedSessionSummary's own post-check and applyApprovedDiff (or
 *   confirmed strictly after applyApprovedDiff's OWN post-check ran clean, surfacing as
 *   `FencedWriterDeadlineError` rather than `StudentFencedError`) is invisible to both writes taken
 *   alone, so `writeApproved` (nodes.ts) itself undoes the summary (by its `approvedAt`) when
 *   applyApprovedDiff ends fenced — either error shape, re-checking the fence itself for the
 *   deadline-error case — before this function ever sees the error. By the time either error reaches
 *   this post-check, any summary residue is already gone.
 * - An aborted run may still settle later (a node or checkpoint write in flight); when it does, the
 *   post-check runs again, so a late checkpoint write of a fenced student is removed too.
 * Returns true when fenced. A run that timed out while unfenced throws FencedWriterDeadlineError
 * (its checkpoints are left as ordinary crash-recovery state; resumeScribe(null) retries). Any
 * other error propagates unchanged.
 */
async function invokeFenceAware(
  deps: GraphDeps,
  studentId: string | undefined,
  threadId: string,
  created: CreatedByCall,
  deadline: WriterDeadline,
  invoke: (signal: AbortSignal) => Promise<unknown>,
): Promise<boolean> {
  const compensate = async () => {
    await deps.checkpointer.deleteThread(threadId);
    if (created.claim) {
      await scribeResolutionsCollection(deps.db).deleteMany({ _id: created.claim._id, responseHash: created.claim.responseHash });
    }
    if (created.sessionRow) {
      await sessionsCollection(deps.db).deleteMany({ _id: created.sessionRow.sessionId, studentId: created.sessionRow.studentId });
    }
    if (created.transcriptTurns && created.transcriptTurns.ids.length > 0) {
      await sessionTranscriptsCollection(deps.db).deleteMany({
        _id: { $in: [...created.transcriptTurns.ids] },
        studentId: created.transcriptTurns.studentId,
      });
    }
    if (created.concernEdges && created.concernEdges.ids.length > 0) {
      await edgesCollection(deps.db).deleteMany({
        _id: { $in: [...created.concernEdges.ids] },
        writerToken: created.concernEdges.writerToken,
      });
    }
  };
  const work = invoke(deadline.signal);
  let thrown: { err: unknown } | null = null;
  try {
    await deadline.run(work);
  } catch (err) {
    thrown = { err };
  }
  const timedOut = thrown !== null && deadline.expired();
  const noop = () => undefined;
  const settled: Promise<void> = timedOut
    ? work
        .then(noop, noop)
        .then(async () => {
          if (await fencedForPostCheck(deps.db, studentId)) await compensate();
        })
        .then(noop, noop)
    : Promise.resolve();
  // StudentFencedError means applyApprovedDiff saw the fence; compensate even if the fence was
  // released since.
  const fenced =
    (thrown !== null && thrown.err instanceof StudentFencedError) || (await fencedForPostCheck(deps.db, studentId));
  if (fenced) {
    await compensate();
    return true;
  }
  if (thrown) {
    if (timedOut) throw new FencedWriterDeadlineError(settled, { cause: thrown.err });
    throw thrown.err;
  }
  return false;
}

/**
 * Starts a scribe run. The input is Zod-validated before the graph sees it (B5). T-011 cycle 2 /
 * D-015: a student with an erasure in progress is refused with `fenced` before any node runs; a
 * fence that appears during the run removes the run's checkpoints and returns `fenced`.
 */
export async function startScribe(graph: ScribeGraph, input: ScribeInput, opts: ScribeRunOptions): Promise<ScribeOutcome> {
  const parsed = ScribeInputSchema.parse(input);
  const deps = depsFor(graph, "startScribe");
  // D-016: the deadline starts before the pre-check.
  const deadline = new WriterDeadline(opts.writerDeadlineMs);
  try {
    if (await deadline.run(isStudentFenced(deps.db, parsed.studentId, new Date(), deadline.op()))) return { kind: "fenced" };
    // ISS-t-011-rev-5: the session row (with this thread id) is written BEFORE the first checkpoint,
    // so erasure/export find this run's checkpoints even if it ends without an interrupt. A
    // sessionId owned by another student throws 11000 here, before anything is checkpointed.
    const { created } = await ensureScribeSessionRow(
      deps.db,
      { sessionId: parsed.sessionId, studentId: parsed.studentId, threadId: opts.threadId, endedAt: parsed.sessionEndedAt },
      deadline.op(),
    );
    const sessionRow = created ? { sessionId: parsed.sessionId, studentId: parsed.studentId } : null;
    // T-024 / ISS-t-013r-c0-3 (D-020 "puri chat bhi save rehegi"): the full chat is persisted verbatim
    // in session_transcripts before the graph runs, so every citation {turnId, quote} the scribe
    // proposes points into a stored turn (resolveCitationSpan). It runs INSIDE the fence-aware call:
    // the post-check covers it, and the compensation deletes exactly the turns this call created.
    const transcriptTurns = { studentId: parsed.studentId, ids: [] as string[] };
    // T-022 / D-020 / B20: concern flags go into the Student KG right after the transcript they cite,
    // before any provider call, so a later extraction/summary failure never loses them.
    const concernEdges = { writerToken: randomUUID(), ids: [] as string[] };
    const fenced = await invokeFenceAware(
      deps,
      parsed.studentId,
      opts.threadId,
      { sessionRow, transcriptTurns, concernEdges },
      deadline,
      async () => {
        await recordSessionTranscript(
          deps.db,
          { sessionId: parsed.sessionId, studentId: parsed.studentId, turns: parsed.turns },
          { ...deadline.op(), createdSink: transcriptTurns.ids },
        );
        await recordSessionConcerns(deps.db, parsed, {
          ...deadline.op(),
          writerToken: concernEdges.writerToken,
          createdSink: concernEdges.ids,
        });
        // T-012 / B16: guard-crisis notifications are written here, before any provider call; the
        // classifier review continues in the background (never awaited by the scribe).
        if (deps.escalation) await escalateSessionFlags(deps.db, parsed, deps.escalation);
        return graph.invoke(parsed, runnableConfig(opts, deadline));
      },
    );
    if (fenced) return { kind: "fenced" };
    return await readOutcome(graph, opts.threadId, deadline);
  } finally {
    deadline.dispose();
  }
}

/** T-022: the KG relation for a concern flag: student --concern_flagged--> transcript_turn. */
export const CONCERN_EDGE_REL = "concern_flagged";

/** A concern edge: an ordinary `edges` document that also carries its typed, cited ConcernRecord. */
export interface ConcernEdgeDoc extends EdgeDoc {
  concern: ConcernRecord;
}

function concernEdges(db: GraphDeps["db"]): Collection<ConcernEdgeDoc> {
  return edgesCollection(db) as unknown as Collection<ConcernEdgeDoc>;
}

/**
 * T-022 / D-020 / B20: writes each concern-level flag of a session into the Student KG, using the
 * EXISTING `edges` collection so erasure and export cover it with no new collection (B15): the edge
 * is anchored at `{kind: "student"}`, which the erasure's edge selector deletes and the export
 * returns unconditionally. It points at the stored transcript turn it cites (B2).
 * - Consent first (B4): a session the consent gate refuses writes no concern.
 * - Crisis sessions are unchanged: they end escalated and this writes nothing (checkCrisis gives no
 *   concerns when there is a crisis turn).
 * - Idempotent: deterministic _id + `$setOnInsert`, so a replay or a retried startScribe writes
 *   nothing new; only the edges THIS call inserted are reported to `createdSink` (for compensation).
 */
async function recordSessionConcerns(
  db: GraphDeps["db"],
  input: ScribeInput,
  options: { timeoutMS: number; writerToken: string; createdSink: string[] },
): Promise<ConcernRecord[]> {
  const consent = await checkConsent({ studentId: input.studentId }, { db });
  if (consent.consent !== "granted") return [];
  const { escalation, concerns } = checkCrisis({ sessionId: input.sessionId, studentId: input.studentId, turns: input.turns });
  if (escalation || concerns.length === 0) return [];
  const edges = concernEdges(db);
  for (const concern of concerns) {
    const from: EdgeRef = { kind: "student", id: concern.studentId };
    const to: EdgeRef = { kind: "transcript_turn", id: transcriptTurnDocId(concern.sessionId, concern.citation.turnId) };
    const _id = deriveEdgeId(from, to, CONCERN_EDGE_REL);
    const doc: ConcernEdgeDoc = {
      _id,
      from,
      to,
      rel: CONCERN_EDGE_REL,
      createdAt: new Date().toISOString(),
      writerToken: options.writerToken,
      concern,
    };
    const res = await edges.updateOne({ _id }, { $setOnInsert: doc }, { upsert: true, timeoutMS: options.timeoutMS });
    if ((res.upsertedCount ?? 0) > 0 || (res.upsertedId !== null && res.upsertedId !== undefined)) options.createdSink.push(_id);
  }
  return concerns;
}

/**
 * T-012 / B16: escalation for a scribed session. Consent first, like recordSessionConcerns (B4): a
 * session the consent gate refuses writes no escalation record (the graph ends "refused" before its
 * crisis gate too). Otherwise every turn goes through escalateTurns (guards/escalation.ts): a guard
 * crisis notifies the tenant's admin(s) and the session's counsellor(s) now, and the concern
 * classifier reviews flagged + sampled turns in the background.
 * Deliberately NOT in invokeFenceAware's compensation: a crisis notification is a safety record and
 * is never withdrawn by a fence that lands mid-run (the pre-check already refused a fenced student).
 */
async function escalateSessionFlags(
  db: GraphDeps["db"],
  input: ScribeInput,
  escalation: EscalationDeps,
): Promise<void> {
  const consent = await checkConsent({ studentId: input.studentId }, { db });
  if (consent.consent !== "granted") return;
  await escalateTurns(db, { sessionId: input.sessionId, studentId: input.studentId, turns: input.turns }, escalation);
}

/**
 * T-022: the typed read surface for T-012 (escalation as severity rises): every concern flagged for
 * a student (optionally one session), Zod-validated, ordered by concernId.
 */
export async function readStudentConcerns(
  db: GraphDeps["db"],
  query: { studentId: string; sessionId?: string },
): Promise<ConcernRecord[]> {
  const docs = await concernEdges(db)
    .find({
      rel: CONCERN_EDGE_REL,
      "from.kind": "student",
      "from.id": query.studentId,
      ...(query.sessionId === undefined ? {} : { "concern.sessionId": query.sessionId }),
    })
    .toArray();
  return docs
    .map((d) => ConcernRecordSchema.parse(d.concern))
    .sort((a, b) => a.concernId.localeCompare(b.concernId));
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

/**
 * T-016 / ISS-t-007-rev-10: a run lease for `deadline`'s holder. It outlives the holder's writer
 * deadline by FENCE_MARGIN_MS (D-016: the client-level timeoutMS backstop is capped at that margin),
 * so an aborted invoke that is still settling is not overlapped by a recovery.
 */
function newLease(deadline: WriterDeadline): NonNullable<ScribeResolutionDoc["lease"]> {
  return { token: randomUUID(), expiresAt: new Date(deadline.expiresAt + FENCE_MARGIN_MS).toISOString() };
}

/**
 * Releases `token`'s lease (a CAS on the token: never another holder's). Best effort: a failed
 * release only delays the next recovery until the lease expires, so it never masks the outcome.
 */
async function releaseLease(deps: GraphDeps, threadId: string, token: string, deadline: WriterDeadline): Promise<void> {
  if (deadline.expired() || deadline.signal.aborted) return;
  try {
    await deadline.run(scribeResolutionsCollection(deps.db).updateOne(
      { _id: threadId, "lease.token": token },
      { $unset: { lease: "" } },
      { timeoutMS: Math.min(FENCE_POSTCHECK_TIMEOUT_MS, deadline.op().timeoutMS) },
    ));
  } catch {
    // The lease expires by itself (see newLease).
  }
}

/**
 * Runs `work` as the holder of `token`'s lease and releases it afterwards, EXCEPT after a writer
 * deadline timeout: the aborted invoke may still be settling, so the lease is left to expire.
 */
async function underLease<T>(deps: GraphDeps, threadId: string, token: string, deadline: WriterDeadline, work: () => Promise<T>): Promise<T> {
  let release = true;
  try {
    return await work();
  } catch (err) {
    if (err instanceof FencedWriterDeadlineError || (err instanceof Error && err.name === "AbortError") || deadline.signal.aborted) release = false;
    throw err;
  } finally {
    if (release && !deadline.expired() && !deadline.signal.aborted) await releaseLease(deps, threadId, token, deadline);
  }
}

function isDuplicateKey(err: unknown): boolean {
  return (err as { code?: unknown } | null)?.code === 11000;
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
 *
 * T-016 / ISS-t-007-rev-10 (run lease on the D-014 claim doc): the winner inserts its claim WITH a
 * lease (`lease.token`, `lease.expiresAt` = its writer deadline + FENCE_MARGIN_MS) and releases it
 * when its invoke settles. A recovery (`null`) of a claimed thread first takes that lease with one
 * atomic findOneAndUpdate, only when it is absent or expired. The loser (a second recovery, or a
 * recovery racing the in-flight winner) returns `in_progress` without invoking, so a claimed thread
 * has at most one graph.invoke in flight across processes. After a writer-deadline timeout the lease
 * is NOT released (the aborted invoke may still settle); it expires by itself.
 * Residual: a thread with NO claim yet (a crash before the approval interrupt, e.g. mid-extraction)
 * has no claim doc to lease, so its recovery is not leased. It writes only checkpoints (no facts,
 * no claim), and a duplicate costs a repeated provider call. See the T-016 manifest.
 *
 * ISS-t-007-rev-9: a claim is never written without a studentId (it would be invisible to B15
 * erasure); a paused thread whose state lacks one throws before claiming.
 *
 * T-011 cycle 2 / D-015 (erasure fence): if the thread's student has an erasure in progress, this
 * returns `fenced` BEFORE claiming or invoking (nothing written). If the fence appears while the
 * invoke runs, the thread's checkpoints and the claim this call inserted are removed again and the
 * outcome is `fenced` (see invokeFenceAware). D-016: the claim and the invoke run under the
 * writer deadline (`opts.writerDeadlineMs`, at most FENCED_WRITER_DEADLINE_MS), started before
 * the pre-check.
 *
 * Fenced over already_resolved (ISS-t-011-c2-rev-5, kept by design): the fence pre-check runs
 * BEFORE the already-decided check, so while an erasure is in progress a resume of an
 * already-resolved thread returns `fenced`, not `already_resolved`. During an erasure no student
 * state (the recorded decision, its facts) is disclosed to any caller; once the fence is released
 * the thread is gone anyway (the erasure purged its checkpoints and claim).
 */
export async function resumeScribe(
  graph: ScribeGraph,
  response: ApprovalResponse | null,
  opts: ScribeRunOptions,
): Promise<ScribeOutcome> {
  const deps = depsFor(graph, "resumeScribe");
  // D-016: the deadline starts before the pre-check and covers the claim and the invoke.
  const deadline = new WriterDeadline(opts.writerDeadlineMs);
  try {
    const result = await resumeUnderDeadline(graph, deps, response, opts, deadline);
    deadline.op();
    return result;
  } finally {
    deadline.dispose();
  }
}

async function resumeUnderDeadline(
  graph: ScribeGraph,
  deps: GraphDeps,
  response: ApprovalResponse | null,
  opts: ScribeRunOptions,
  deadline: WriterDeadline,
): Promise<ScribeOutcome> {
  const claims = scribeResolutionsCollection(deps.db);
  const stateConfig = { configurable: { thread_id: opts.threadId } };

  if (response === null) {
    const snapshot = await deadline.run(graph.getState(stateConfig));
    const latest = snapshot.values as Partial<State>;
    if (latest.studentId && (await deadline.run(isStudentFenced(deps.db, latest.studentId, new Date(), deadline.op())))) {
      return { kind: "fenced" };
    }
    const claimDoc = await deadline.run(claims.findOne({ threadId: opts.threadId }, deadline.op()));
    if (!claimDoc) {
      // No claim yet (a pre-approval crash): nothing to lease (see the docstring's residual).
      return recoverUnder(graph, deps, opts, deadline, snapshot, null);
    }
    // ISS-t-007-rev-10: take the claim's run lease atomically, or step aside.
    const lease = newLease(deadline);
    const originalCheckpoint = snapshot.config.configurable?.checkpoint_id;
    const originalStudent = latest.studentId;
    const acquisition = claims.findOneAndUpdate(
      { _id: claimDoc._id, $or: [{ lease: { $exists: false } }, { "lease.expiresAt": { $lt: new Date().toISOString() } }] },
      { $set: { lease } },
      { ...deadline.op(), returnDocument: "after" },
    );
    let took: ScribeResolutionDoc | null;
    try {
      took = await deadline.run(acquisition);
    } catch (err) {
      if (!deadline.expired()) throw err;
      const settled = acquisition.then(async (owned) => {
        if (!owned) return;
        let valid = false;
        let unreadable = false;
        const postSignal = AbortSignal.timeout(FENCE_POSTCHECK_TIMEOUT_MS);
        const expired = new Promise<never>((_, reject) => postSignal.addEventListener("abort", () => reject(new ProviderAuthorizationRefusedError()), { once: true }));
        try {
          valid = await Promise.race([(async () => {
            if (!originalStudent || !originalCheckpoint) return false;
            if (await isStudentFenced(deps.db, originalStudent, new Date(), { timeoutMS: FENCE_POSTCHECK_TIMEOUT_MS })) return false;
            const current = await graph.getState(stateConfig);
            if (current.config.configurable?.checkpoint_id !== originalCheckpoint || (current.values as Partial<State>).studentId !== originalStudent) return false;
            const consent = await checkConsent({ studentId: originalStudent }, deps);
            return consent.consent === "granted" && !postSignal.aborted;
          })(), expired]);
        } catch { unreadable = true; }
        if (!valid) {
          const undoSignal = AbortSignal.timeout(FENCE_POSTCHECK_TIMEOUT_MS);
          try {
            await Promise.race([claims.updateOne(
              { _id: claimDoc._id, studentId: claimDoc.studentId, responseHash: claimDoc.responseHash, "lease.token": lease.token },
              { $unset: { lease: "" } }, { timeoutMS: FENCE_POSTCHECK_TIMEOUT_MS }),
              new Promise<never>((_, reject) => undoSignal.addEventListener("abort", () => reject(new ProviderAuthorizationRefusedError()), { once: true }))]);
          } catch { throw new ProviderAuthorizationRefusedError(); }
        }
        if (unreadable) throw new ProviderAuthorizationRefusedError();
      }, () => { throw new ProviderAuthorizationRefusedError(); });
      void settled.catch(() => undefined); // Observe without altering the caller-visible settlement.
      throw new FencedWriterDeadlineError(settled);
    }
    if (!took) return { kind: "in_progress" };
    return underLease(deps, opts.threadId, lease.token, deadline, async () =>
      // Re-read under the lease: a holder that finished in between has advanced the thread.
      recoverUnder(graph, deps, opts, deadline, await deadline.run(graph.getState(stateConfig)), took),
    );
  }

  const parsed = ApprovalResponseSchema.parse(response);
  const snapshot = await deadline.run(graph.getState(stateConfig));
  const latest = snapshot.values as Partial<State>;
  // D-015 pre-check: before the claim, so a fenced resume writes nothing at all. It also runs
  // before the already-decided check: fenced over already_resolved (see the docstring).
  if (latest.studentId && (await deadline.run(isStudentFenced(deps.db, latest.studentId, new Date(), deadline.op())))) {
    return { kind: "fenced" };
  }
  if (latest.decision) {
    const claim = await deadline.run(claims.findOne({ threadId: opts.threadId }, deadline.op()));
    await deadline.run(deps.authorize(latest.studentId!, undefined, deadline.signal));
    deadline.op();
    return alreadyResolved({ decision: latest.decision, responseHash: claim?.responseHash }, latest.result, parsed);
  }

  let createdClaim: ScribeResolutionDoc | null = null;
  if (snapshot.tasks.some((task) => task.interrupts.length > 0)) {
    // The decision this response resolves to (the same pure function the approval node runs), so a
    // loser can be told the winner's decision even while the winner's invoke is still in flight.
    // A response that decisionFromResponse refuses throws here, BEFORE any claim is taken.
    const { decision } = decisionFromResponse(parsed, latest.proposedFacts ?? []);
    // ISS-t-007-rev-9: never an empty studentId (the claim holds fact values; B15 finds it by studentId).
    if (typeof latest.studentId !== "string" || latest.studentId.trim() === "") {
      throw new Error(`resumeScribe: the thread's state has no studentId; refusing to claim it (B15 erasure could not find the claim)`);
    }
    await deadline.run(deps.authorize(latest.studentId, latest.approvedContext ?? [], deadline.signal));
    deadline.op();
    const claim: ScribeResolutionDoc = {
      _id: opts.threadId,
      threadId: opts.threadId,
      studentId: latest.studentId,
      decision,
      response: parsed as unknown as Record<string, unknown>,
      responseHash: approvalResponseHash(parsed),
      claimedAt: new Date().toISOString(),
      // ISS-t-007-rev-10: the winner holds the run lease from the moment it claims.
      lease: newLease(deadline),
    };
    const originalCheckpoint = snapshot.config.configurable?.checkpoint_id;
    const insertion = claims.insertOne(claim, deadline.op());
    try {
      await deadline.run(insertion);
      createdClaim = claim;
    } catch (err) {
      if (deadline.expired()) {
        const settled = insertion.then(async () => {
          let valid = false;
          let unreadable = false;
          const postSignal = AbortSignal.timeout(FENCE_POSTCHECK_TIMEOUT_MS);
          const expired = new Promise<never>((_, reject) => postSignal.addEventListener("abort", () => reject(new ProviderAuthorizationRefusedError()), { once: true }));
          try {
            valid = await Promise.race([(async () => {
              if (!originalCheckpoint) return false;
              if (await isStudentFenced(deps.db, claim.studentId, new Date(), { timeoutMS: FENCE_POSTCHECK_TIMEOUT_MS })) return false;
              const current = await graph.getState(stateConfig);
              if (current.config.configurable?.checkpoint_id !== originalCheckpoint || (current.values as Partial<State>).studentId !== claim.studentId) return false;
              const consent = await checkConsent({ studentId: claim.studentId }, deps);
              return consent.consent === "granted" && !postSignal.aborted;
            })(), expired]);
          } catch { unreadable = true; }
          if (!valid) {
            const undoSignal = AbortSignal.timeout(FENCE_POSTCHECK_TIMEOUT_MS);
            try {
              await Promise.race([claims.deleteMany(
                { _id: claim._id, studentId: claim.studentId, responseHash: claim.responseHash, "lease.token": claim.lease!.token },
                { timeoutMS: FENCE_POSTCHECK_TIMEOUT_MS }),
                new Promise<never>((_, reject) => undoSignal.addEventListener("abort", () => reject(new ProviderAuthorizationRefusedError()), { once: true }))]);
            } catch { throw new ProviderAuthorizationRefusedError(); }
          }
          if (unreadable) throw new ProviderAuthorizationRefusedError();
        }, () => { throw new ProviderAuthorizationRefusedError(); });
        void settled.catch(() => undefined); // Observe without swallowing settlement failure.
        throw new FencedWriterDeadlineError(settled);
      }
      if (!isDuplicateKey(err)) throw err;
      const winner = await deadline.run(claims.findOne({ threadId: opts.threadId }, deadline.op()));
      if (!winner) throw err;
      const now = (await deadline.run(graph.getState(stateConfig))).values as Partial<State>;
      await deadline.run(deps.authorize(now.studentId!, now.decision ? undefined : now.approvedContext ?? [], deadline.signal));
      deadline.op();
      return alreadyResolved(winner, now.result, parsed);
    }
  }
  const run = async (): Promise<ScribeOutcome> => {
    const fenced = await invokeFenceAware(deps, latest.studentId, opts.threadId, { claim: createdClaim }, deadline, () =>
      graph.invoke(new Command({ resume: parsed }), runnableConfig(opts, deadline)),
    );
    return fenced ? { kind: "fenced" } : readOutcome(graph, opts.threadId, deadline);
  };
  return createdClaim?.lease ? underLease(deps, opts.threadId, createdClaim.lease.token, deadline, run) : run();
}

/**
 * The recovery invoke, from `snapshot` (read under the lease when there is a claim). With a claim
 * and a still-pending interrupt (a crash after the claim, before the decision was recorded) it
 * applies the CLAIMED response; otherwise it re-runs whatever the checkpoint left pending (e.g. a
 * failed write_approved, idempotent by D-012). A thread with nothing pending is not invoked.
 */
async function recoverUnder(
  graph: ScribeGraph,
  deps: GraphDeps,
  opts: ScribeRunOptions,
  deadline: WriterDeadline,
  snapshot: Awaited<ReturnType<ScribeGraph["getState"]>>,
  claim: ScribeResolutionDoc | null,
): Promise<ScribeOutcome> {
  const latest = snapshot.values as Partial<State>;
  deadline.op();
  if (snapshot.tasks.some((task) => task.interrupts.length > 0)) {
    await deadline.run(deps.authorize(latest.studentId!, latest.approvedContext ?? [], deadline.signal));
    deadline.op();
  }
  if (snapshot.next.length === 0) return readOutcome(graph, opts.threadId, deadline);
  const pendingInterrupt = snapshot.tasks.some((task) => task.interrupts.length > 0);
  const claimed = claim !== null && !latest.decision && pendingInterrupt ? ApprovalResponseSchema.parse(claim.response) : null;
  const fenced = await invokeFenceAware(deps, latest.studentId, opts.threadId, {}, deadline, async () => {
    if (claimed) {
      // Crash after the claim, before the decision was recorded: apply the CLAIMED response.
      await graph.invoke(new Command({ resume: claimed }), runnableConfig({ ...opts, checkpointId: undefined }, deadline));
    } else {
      await graph.invoke(null, runnableConfig(opts, deadline));
    }
  });
  return fenced ? { kind: "fenced" } : readOutcome(graph, opts.threadId, deadline);
}

// ---------------------------------------------------------------------------
// T-008: read-only inspection for the counsellor approval UI
// ---------------------------------------------------------------------------

/**
 * What the approval UI shows for one scribe thread. READ-ONLY: it never claims, invokes or writes.
 * - `not_found`: no checkpoint for this thread.
 * - `fenced`: the student has an erasure in progress (or the fence state can not be read); no
 *   student data is disclosed (the same "fenced over already_resolved" rule as resumeScribe).
 * - `awaiting_approval`: paused at the interrupt and unclaimed; `request` is the typed payload.
 * - `in_progress`: a decision is claimed or recorded but its write has not finished (the claim
 *   winner is still running, or crashed and awaits resumeScribe(null) recovery).
 * - `done`: the run ended; `decision` / `summaryDecision` are what the counsellor decided (null when
 *   the run ended before any approval, e.g. refused or escalated).
 */
export type ScribeInspection =
  | { kind: "not_found" }
  | { kind: "fenced" }
  | { kind: "in_progress" }
  | { kind: "awaiting_approval"; request: ApprovalRequest }
  | { kind: "done"; result: ScribeResult; decision: CounsellorDecision | null; summaryDecision?: SummaryDecision };

export async function inspectScribe(graph: ScribeGraph, threadId: string, options: { writerDeadlineMs?: number; signal?: AbortSignal } = {}): Promise<ScribeInspection> {
  const deps = depsFor(graph, "inspectScribe");
  const deadline = new WriterDeadline(options.writerDeadlineMs);
  const signal = options.signal ? AbortSignal.any([deadline.signal, options.signal]) : deadline.signal;
  let onAbort: (() => void) | undefined;
  try {
    if (signal.aborted) throw new DOMException("Scribe execution cancelled.", "AbortError");
    const cancelled = new Promise<never>((_, reject) => {
      onAbort = () => reject(new DOMException("Scribe execution cancelled.", "AbortError"));
      signal.addEventListener("abort", onAbort, { once: true });
    });
    const reading = (async (): Promise<ScribeInspection> => {
      const snapshot = await graph.getState({ configurable: { thread_id: threadId } });
      deadline.op();
      if (signal.aborted) throw new DOMException("Scribe execution cancelled.", "AbortError");
      const latest = (snapshot.values ?? {}) as Partial<State>;
      if (!latest.studentId) return { kind: "not_found" };
      let fenced = true;
      try { fenced = await deadline.run(isStudentFenced(deps.db, latest.studentId, new Date(), deadline.op())); }
      catch {
        deadline.op();
        if (signal.aborted) throw new DOMException("Scribe execution cancelled.", "AbortError");
      }
      deadline.op();
      if (signal.aborted) throw new DOMException("Scribe execution cancelled.", "AbortError");
      if (fenced) return { kind: "fenced" };
      const interrupts = snapshot.tasks.flatMap((task) => task.interrupts);
      if (interrupts.length > 0) {
        if (latest.decision) return { kind: "in_progress" };
        const claim = await scribeResolutionsCollection(deps.db).findOne({ threadId }, deadline.op());
        deadline.op();
        if (signal.aborted) throw new DOMException("Scribe execution cancelled.", "AbortError");
        if (claim) return { kind: "in_progress" };
        await deps.authorize(latest.studentId, latest.approvedContext ?? [], signal);
        deadline.op();
        return { kind: "awaiting_approval", request: ApprovalRequestSchema.parse(interrupts[0]!.value) };
      }
      if (snapshot.next.length > 0 || latest.result === undefined) return { kind: "in_progress" };
      const result = ScribeResultSchema.parse(latest.result);
      if (result.status !== "refused") await deps.authorize(latest.studentId, undefined, signal);
      deadline.op();
      if (signal.aborted) throw new DOMException("Scribe execution cancelled.", "AbortError");
      return { kind: "done", result, decision: latest.decision ?? null,
        ...(latest.summaryDecision ? { summaryDecision: latest.summaryDecision } : {}) };
    })();
    const result = await Promise.race([deadline.run(reading), cancelled]);
    deadline.op();
    if (signal.aborted) throw new DOMException("Scribe execution cancelled.", "AbortError");
    return result;
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort);
    deadline.dispose();
  }
}
