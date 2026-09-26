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
 */
import { useState } from "react";
import { StartSessionResultSchema, type StartSessionRequest, type StartSessionResult } from "../server/contracts";
import { LABELS } from "./labels";

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
  | { kind: "error" };

const SESSIONS_URL = "/api/sessions";

export function NewSessionForm() {
  // Built exactly once per mount — the SAME body is sent on the first submit and every Retry.
  const [submission] = useState<StartSessionRequest>(buildDemoSubmission);
  const [screen, setScreen] = useState<Screen>({ kind: "idle" });

  const submit = async () => {
    setScreen({ kind: "submitting" });
    try {
      const res = await fetch(SESSIONS_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(submission),
      });
      const parsed: StartSessionResult = StartSessionResultSchema.parse(await res.json());
      if (parsed.state === "ai_unavailable") setScreen({ kind: "ai_unavailable", attempts: parsed.attempts });
      else if (parsed.state === "started") setScreen({ kind: "started", threadId: parsed.threadId });
      else setScreen({ kind: "error" });
    } catch {
      setScreen({ kind: "error" });
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
              <th>{LABELS.colValue}</th>
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
