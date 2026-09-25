/**
 * T-008: the server side of the counsellor approval screen, called by the Next.js route handlers
 * (src/app/api/approvals/[threadId]/route.ts). Framework-free so it is testable offline.
 *
 * - getApprovalView: READ-ONLY (engine inspectScribe). Never claims, invokes or writes (B3).
 * - submitDecision: validates the body (B5), then resumes the paused thread with a per_fact
 *   ApprovalResponse through the engine's resumeScribe, which owns the one-shot claim (D-014),
 *   the erasure fence (D-015/D-016) and the write (only approved and edited facts).
 * Every response body is parsed with its Zod contract before it is returned (B5).
 */
import { ZodError } from "zod";
import type { inspectScribe, resumeScribe, ScribeGraph } from "@vc/engine";
import {
  ApprovalViewSchema,
  DecisionRequestSchema,
  SubmitResultSchema,
  ThreadIdSchema,
  type ApprovalView,
  type SubmitResult,
} from "./contracts";

/**
 * `engine` carries the engine functions FROM THE SAME MODULE INSTANCE that compiled `graph`: the
 * engine keeps each compiled graph's claim store and fence Db in a module-level WeakMap, and Next
 * bundles each route separately (and re-evaluates modules on dev reloads), so a function imported
 * here could belong to another copy of the engine that has never seen this graph.
 */
export interface ApprovalRuntime {
  graph: ScribeGraph;
  engine: { inspectScribe: typeof inspectScribe; resumeScribe: typeof resumeScribe };
}

export interface Reply<T> {
  status: number;
  body: T;
}

function issuesOf(err: ZodError): string[] {
  return err.issues.map((i) => `${i.path.length > 0 ? i.path.join(".") : "(body)"}: ${i.message}`);
}

function view(status: number, body: ApprovalView): Reply<ApprovalView> {
  return { status, body: ApprovalViewSchema.parse(body) };
}

function submitted(status: number, body: SubmitResult): Reply<SubmitResult> {
  return { status, body: SubmitResultSchema.parse(body) };
}

async function inspect(rt: ApprovalRuntime, threadId: string): Promise<Reply<ApprovalView>> {
  const seen = await rt.engine.inspectScribe(rt.graph, threadId);
  switch (seen.kind) {
    case "not_found":
      return view(404, { state: "not_found", threadId });
    case "fenced":
      return view(423, { state: "fenced", threadId });
    case "in_progress":
      return view(200, { state: "in_progress", threadId });
    case "awaiting_approval":
      return view(200, { state: "awaiting_approval", threadId, request: seen.request });
    case "done":
      return view(200, {
        state: "done",
        threadId,
        result: seen.result,
        decision: seen.decision,
        ...(seen.summaryDecision ? { summaryDecision: seen.summaryDecision } : {}),
      });
  }
}

export async function getApprovalView(rt: ApprovalRuntime, rawThreadId: string): Promise<Reply<ApprovalView>> {
  const id = ThreadIdSchema.safeParse(rawThreadId);
  if (!id.success) return view(400, { state: "invalid", issues: issuesOf(id.error) });
  return inspect(rt, id.data);
}

export async function submitDecision(rt: ApprovalRuntime, rawThreadId: string, rawBody: unknown): Promise<Reply<SubmitResult>> {
  const id = ThreadIdSchema.safeParse(rawThreadId);
  if (!id.success) return submitted(400, { state: "invalid", issues: issuesOf(id.error) });
  const threadId = id.data;
  const body = DecisionRequestSchema.safeParse(rawBody);
  if (!body.success) return submitted(400, { state: "invalid", issues: issuesOf(body.error) });

  // resumeScribe needs a real thread: an unknown id is answered here, before anything runs.
  const current = await rt.engine.inspectScribe(rt.graph, threadId);
  if (current.kind === "not_found") return submitted(404, { state: "not_found", threadId });

  let outcome;
  try {
    outcome = await rt.engine.resumeScribe(rt.graph, { action: "per_fact", facts: body.data.facts, summary: body.data.summary }, { threadId });
  } catch (err) {
    // Refused before any claim or write: the thread stays open for a corrected decision.
    // By name, not instanceof: the error class may come from another bundled copy (see ApprovalRuntime).
    const name = (err as { name?: unknown } | null)?.name;
    if (name === "ApprovalResponseError") return submitted(400, { state: "invalid", issues: [(err as Error).message] });
    if (name === "ZodError") return submitted(400, { state: "invalid", issues: issuesOf(err as ZodError) });
    throw err;
  }
  switch (outcome.kind) {
    case "fenced":
      return submitted(423, { state: "fenced", threadId });
    case "in_progress":
      return submitted(409, { state: "in_progress", threadId });
    case "already_resolved":
      return submitted(409, {
        state: "already_resolved",
        threadId,
        decision: outcome.decision,
        result: outcome.result,
        sameAsWinner: outcome.sameAsWinner,
      });
    case "awaiting_approval":
      // Not reachable for a resolved interrupt; report the thread's actual state rather than guess.
      return submitted(409, { state: "in_progress", threadId });
    case "done": {
      const after = await rt.engine.inspectScribe(rt.graph, threadId);
      return submitted(200, {
        state: "done",
        threadId,
        result: outcome.result,
        decision: after.kind === "done" ? after.decision : null,
        ...(after.kind === "done" && after.summaryDecision ? { summaryDecision: after.summaryDecision } : {}),
      });
    }
  }
}
