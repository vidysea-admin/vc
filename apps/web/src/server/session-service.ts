/**
 * T-021 (D-020, contract B6 "runtime failover"): starts a new scribe run from a submitted
 * transcript. Framework-free (Next.js route handlers in src/app/api/sessions/route.ts are thin
 * wiring over this), so it is testable offline (tests/session-api.test.ts).
 *
 * Every response body is parsed with StartSessionResultSchema before it is returned (B5).
 *
 * The interesting case is what happens when the underlying provider's whole failover chain is
 * exhausted (packages/providers FailoverProvider): startSession's graph.invoke throws the typed
 * AiUnavailableError — checked BY NAME, not `instanceof`, because it comes from another bundled
 * copy of @vc/providers than the one this route's own dependency graph resolves to (the same
 * pattern approval-service.ts already uses for ApprovalResponseError/ZodError, with the same
 * comment there explaining why). Every OTHER thrown error is not this endpoint's concern and
 * propagates (a genuine 500), same as approval-service.ts's submitDecision.
 */
import { ZodError } from "zod";
import type { ScribeInput, ScribeOutcome } from "@vc/engine";
import { StartSessionRequestSchema, StartSessionResultSchema, type StartSessionResult } from "./contracts";

/** What apps/web/src/server/runtime.ts (live) and apps/web/demo/seed.ts (demo) both implement. */
export interface SessionRuntime {
  startSession(input: ScribeInput): Promise<ScribeOutcome>;
}

export interface Reply<T> {
  status: number;
  body: T;
}

function issuesOf(err: ZodError): string[] {
  return err.issues.map((i) => `${i.path.length > 0 ? i.path.join(".") : "(body)"}: ${i.message}`);
}

function result(status: number, body: StartSessionResult): Reply<StartSessionResult> {
  return { status, body: StartSessionResultSchema.parse(body) };
}

/** Reads the fields a same-shaped AiUnavailableError carries, from ANOTHER bundled copy of @vc/providers (checked by name, see the module docstring) — never assumes the exact class. */
function aiUnavailableFields(err: unknown): { attempts: number; modelsAttempted: string[] } {
  const e = err as { attempts?: unknown; modelsAttempted?: unknown } | null;
  return {
    attempts: typeof e?.attempts === "number" ? e.attempts : 0,
    modelsAttempted: Array.isArray(e?.modelsAttempted) ? e.modelsAttempted.filter((m): m is string => typeof m === "string") : [],
  };
}

export async function submitSession(rt: SessionRuntime, rawBody: unknown): Promise<Reply<StartSessionResult>> {
  const parsed = StartSessionRequestSchema.safeParse(rawBody);
  if (!parsed.success) return result(400, { state: "invalid", issues: issuesOf(parsed.error) });
  const input = parsed.data;
  // scribeThreadId's own derivation (packages/engine graph.ts): "scribe:<sessionId>" — inlined here
  // rather than imported so this module stays a plain reply-builder even before the run starts;
  // the ACTUAL thread id the run used always comes back on ScribeOutcome-derived replies below.
  const threadId = `scribe:${input.sessionId}`;

  let outcome: ScribeOutcome;
  try {
    outcome = await rt.startSession(input);
  } catch (err) {
    const name = (err as { name?: unknown } | null)?.name;
    if (name === "AiUnavailableError") {
      const { attempts, modelsAttempted } = aiUnavailableFields(err);
      return result(503, { state: "ai_unavailable", sessionId: input.sessionId, attempts, modelsAttempted });
    }
    throw err;
  }

  switch (outcome.kind) {
    case "fenced":
      return result(423, { state: "fenced", threadId });
    case "in_progress":
      return result(409, { state: "in_progress", threadId });
    case "awaiting_approval":
      return result(200, { state: "started", threadId, sessionId: input.sessionId });
    case "done":
      return result(200, { state: "done", threadId, result: outcome.result });
    case "already_resolved":
      // Not reachable for a freshly-submitted session (a brand-new sessionId has no prior
      // decision); report the thread's actual state rather than guess, same as approval-service.ts.
      return result(409, { state: "in_progress", threadId });
  }
}
