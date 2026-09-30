"use client";
/**
 * T-021 (D-020, contract B6 "runtime failover" + B17 persona usability): the "start a new
 * session" demo screen. Submits a fixed synthetic transcript to POST /api/sessions and shows:
 * - the normal "started" outcome (a link to the approval screen), or
 * - the apologetic "AI is unavailable" state, in plain language a Jaipur counsellor understands
 *   (no stack trace, no provider/model jargon), with a Retry button.
 *
 * The whole submission body (session id + transcript) is built ONCE in local state
 * (`useState(() => ...)`, never regenerated on Retry) and reused byte-for-byte on every submit —
 * so Retry resubmits the IDENTICAL input and the counsellor never retypes anything (B6/D-020).
 *
 * T-021 fix cycle 1 (ISS-t-021-rev-1): the server's own FailoverProvider now enforces a wall-clock
 * deadline (default 45s, VC_LLM_DEADLINE_MS) before it can return the ai_unavailable reply — but a
 * client-side safety net still matters (a proxy/load balancer with its own shorter idle timeout, a
 * flaky mobile connection that never delivers the response at all). CLIENT_TIMEOUT_MS aborts the
 * fetch slightly above that server deadline and renders the EXACT SAME apology + Retry state, with
 * `submission` (built once, never rebuilt) still intact — a client timeout is indistinguishable from
 * the server's own ai_unavailable outcome from the counsellor's point of view.
 */
import { useState } from "react";
import { StartSessionResultSchema, type StartSessionRequest, type StartSessionResult } from "../server/contracts";
import { LABELS } from "./labels";

/** Slightly above FAILOVER_DEFAULT_DEADLINE_MS (45_000, @vc/providers) — see the module docstring. */
const CLIENT_TIMEOUT_MS = 50_000;

/** A fixed synthetic transcript (same content as demo/seed.ts's demo threads) — no real student data (B13). */
function buildDemoSubmission(): StartSessionRequest {
  const sessionId =
    typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `demo-new-session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const turn = (turnId: string, speaker: "student" | "counsellor", text: string, ts: number) => ({
    turnId,
    speaker,
    lang: "en",
    text,
    translatedText: text,
    ts,
  });
  return {
    sessionId,
    studentId: "demo-student-4",
    sessionEndedAt: "2026-09-26T11:30:00.000Z",
    turns: [
      turn("t1", "student", "I am thinking about computer science in Canada, maybe Toronto or Waterloo.", 1),
      turn("t2", "counsellor", "Which intake are you aiming for?", 2),
      turn("t3", "student", "Probably the September 2027 intake, after my boards.", 3),
      turn("t4", "counsellor", "What yearly budget has your family discussed?", 4),
      turn("t5", "student", "My parents said around 20 lakh rupees a year is the limit.", 5),
    ],
  };
}

type Screen =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "ai_unavailable"; attempts: number }
  | { kind: "started"; threadId: string }
  | { kind: "done"; status: Extract<StartSessionResult, { state: "done" }>["result"]["status"] }
  | { kind: "fenced" }
  | { kind: "invalid" }
  | { kind: "in_progress" }
  | { kind: "error" };

const SESSIONS_URL = "/api/sessions";

export function NewSessionForm() {
  // Built exactly once per mount — the SAME body is sent on the first submit and every Retry.
  const [submission] = useState<StartSessionRequest>(buildDemoSubmission);
  const [screen, setScreen] = useState<Screen>({ kind: "idle" });

  const submit = async () => {
    setScreen({ kind: "submitting" });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);
    try {
      const res = await fetch(SESSIONS_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(submission),
        signal: controller.signal,
      });
      const parsed: StartSessionResult = StartSessionResultSchema.parse(await res.json());
      if (parsed.state === "ai_unavailable") setScreen({ kind: "ai_unavailable", attempts: parsed.attempts });
      else if (parsed.state === "started") setScreen({ kind: "started", threadId: parsed.threadId });
      else if (parsed.state === "done") setScreen({ kind: "done", status: parsed.result.status });
      else if (parsed.state === "fenced") setScreen({ kind: "fenced" });
      else if (parsed.state === "invalid") setScreen({ kind: "invalid" });
      else if (parsed.state === "in_progress") setScreen({ kind: "in_progress" });
      else setScreen({ kind: "error" });
    } catch (err) {
      // T-021 fix cycle 1 (ISS-t-021-rev-1): an aborted-by-us fetch (our own CLIENT_TIMEOUT_MS
      // firing) renders the SAME apology + Retry state as a server-reported ai_unavailable — never
      // the generic error banner — and `submission` is untouched (built once, never rebuilt), so
      // Retry resubmits the identical input exactly as it would after a server-side exhaustion.
      if ((err as { name?: unknown } | null)?.name === "AbortError") setScreen({ kind: "ai_unavailable", attempts: 0 });
      else setScreen({ kind: "error" });
    } finally {
      clearTimeout(timer);
    }
  };

  return (
    <main className="shell">
      <header className="head">
        <h1>{LABELS.newSessionTitle}</h1>
        <dl className="meta">
          <dt>{LABELS.student}</dt>
          <dd data-testid="new-session-student">{submission.studentId}</dd>
        </dl>
      </header>

      <section>
        <h2>{LABELS.sectionTranscript}</h2>
        <table className="grid" data-testid="new-session-turns">
          <thead>
            <tr>
              <th>{LABELS.colTurn}</th>
              <th>{LABELS.colTranscriptText}</th>
            </tr>
          </thead>
          <tbody>
            {submission.turns.map((t) => (
              <tr key={t.turnId} data-turn-id={t.turnId}>
                <td className="mono">
                  {t.speaker} · {t.turnId}
                </td>
                <td>{t.text}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {screen.kind === "idle" || screen.kind === "submitting" ? (
        <footer className="submitbar">
          <button type="button" className="btn btn-primary" data-testid="submit-session" disabled={screen.kind === "submitting"} onClick={() => void submit()}>
            {screen.kind === "submitting" ? LABELS.submitting : LABELS.submitSession}
          </button>
        </footer>
      ) : null}

      {screen.kind === "ai_unavailable" ? (
        <section className="banner banner-warn" data-state="ai_unavailable" role="alert">
          <div>
            <strong>{LABELS.stateAiUnavailable}</strong>
            <p>{LABELS.aiUnavailableApology}</p>
            <p>{LABELS.aiUnavailableHint}</p>
          </div>
          <button type="button" className="btn btn-primary" data-testid="retry-session" onClick={() => void submit()}>
            {LABELS.retry}
          </button>
        </section>
      ) : null}

      {screen.kind === "error" ? <section className="banner banner-warn" data-state="error" role="alert"><strong>{LABELS.stateError}</strong></section> : null}

      {screen.kind === "fenced" || screen.kind === "invalid" || screen.kind === "in_progress" ? (
        <section className="banner banner-warn" data-state={screen.kind} role="status">
          <strong>{screen.kind === "fenced" ? LABELS.stateFenced : screen.kind === "invalid" ? LABELS.stateInvalid : "Session processing"}</strong>
        </section>
      ) : null}

      {screen.kind === "done" ? (
        <section className="banner banner-ok" data-state="done" data-result-status={screen.status} role="status">
          <strong>{({
            written: "Written",
            refused: LABELS.stateInvalid,
            rejected: "Rejected",
            escalated: "Escalated",
            conflict: "Conflict",
            partial_conflict: "Partial conflict",
            extraction_failed: "Extraction failed",
            summary_failed: "Summary failed",
          } satisfies Record<Extract<StartSessionResult, { state: "done" }>["result"]["status"], string>)[screen.status]}</strong>
        </section>
      ) : null}

      {screen.kind === "started" ? (
        <section className="banner banner-ok" data-state="started" role="status">
          <div>
            <strong>{LABELS.stateSessionStarted}</strong>
          </div>
          <a className="btn btn-primary mono" data-testid="session-thread-link" href={`/approvals/${encodeURIComponent(screen.threadId)}`}>
            {LABELS.openApprovalScreen}
          </a>
        </section>
      ) : null}
    </main>
  );
}
