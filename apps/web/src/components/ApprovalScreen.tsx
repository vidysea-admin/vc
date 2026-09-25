"use client";
/**
 * T-008: the counsellor's diff-approval screen for ONE paused scribe thread.
 * - Shows the proposed profile changes fact by fact (key, value, current value, quote + turn,
 *   confidence, sensitivity, optional needsReview flag), the dropped facts with their reasons, and
 *   the draft summary.
 * - The counsellor approves, edits or rejects each fact, and approves or withholds the summary.
 *   Nothing is sent until Submit (B3); the server applies only approved and edited facts.
 * - B1: every word the UI writes comes from LABELS; all other text is proposal data.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ApprovalView, DecisionRequest, SubmitResult } from "../server/contracts";
import { ApprovalViewSchema, SubmitResultSchema } from "../server/contracts";
import { LABELS } from "./labels";

type Pending = Extract<ApprovalView, { state: "awaiting_approval" }>;
type ProposedFact = Pending["request"]["facts"][number];
type FactChoice = { decision: "approve" | "reject" | "edit"; text: string };
type Screen =
  | { kind: "view"; view: ApprovalView }
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "already_resolved"; result: Extract<SubmitResult, { state: "already_resolved" }> };

export interface ApprovalScreenProps {
  threadId: string;
  /** Server-provided first view (tests, or a pre-fetched page); otherwise fetched on mount. */
  initialView?: ApprovalView;
}

function display(value: unknown): string {
  if (value === undefined) return "";
  if (value === null || typeof value !== "object") return String(value);
  return JSON.stringify(value);
}

/** The edited text as a value of the proposed value's type (a number stays a number). */
function editedValue(fact: ProposedFact, text: string): { ok: true; value: unknown } | { ok: false } {
  const t = text.trim();
  if (t === "") return { ok: false };
  if (typeof fact.value === "number") {
    const n = Number(t);
    return Number.isFinite(n) ? { ok: true, value: n } : { ok: false };
  }
  if (typeof fact.value === "boolean") {
    if (t === "true" || t === "false") return { ok: true, value: t === "true" };
    return { ok: false };
  }
  return { ok: true, value: t };
}

const apiUrl = (threadId: string) => `/api/approvals/${encodeURIComponent(threadId)}`;

export function ApprovalScreen({ threadId, initialView }: ApprovalScreenProps) {
  const [screen, setScreen] = useState<Screen>(initialView ? { kind: "view", view: initialView } : { kind: "loading" });
  const [issues, setIssues] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setScreen({ kind: "loading" });
    try {
      const res = await fetch(apiUrl(threadId), { cache: "no-store" });
      setScreen({ kind: "view", view: ApprovalViewSchema.parse(await res.json()) });
    } catch {
      setScreen({ kind: "error" });
    }
  }, [threadId]);

  useEffect(() => {
    if (!initialView) void load();
  }, [initialView, load]);

  const submit = async (body: DecisionRequest) => {
    setSubmitting(true);
    setIssues([]);
    try {
      const res = await fetch(apiUrl(threadId), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = SubmitResultSchema.parse(await res.json());
      if (result.state === "invalid") setIssues(result.issues);
      else if (result.state === "already_resolved") setScreen({ kind: "already_resolved", result });
      else setScreen({ kind: "view", view: result });
    } catch {
      setScreen({ kind: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="shell">
      <header className="head">
        <h1>{LABELS.title}</h1>
        <dl className="meta">
          <dt>{LABELS.thread}</dt>
          <dd data-testid="thread-id">{threadId}</dd>
          {screen.kind === "view" && screen.view.state === "awaiting_approval" ? (
            <>
              <dt>{LABELS.session}</dt>
              <dd>{screen.view.request.sessionId}</dd>
              <dt>{LABELS.student}</dt>
              <dd>{screen.view.request.studentId}</dd>
            </>
          ) : null}
        </dl>
      </header>
      <Body screen={screen} issues={issues} submitting={submitting} onSubmit={submit} onReload={load} />
    </main>
  );
}

function StateBanner({ state, label, tone, onReload }: { state: string; label: string; tone: "info" | "warn" | "ok"; onReload?: () => void }) {
  return (
    <section className={`banner banner-${tone}`} data-state={state} role="status">
      <strong>{label}</strong>
      {onReload ? (
        <button type="button" className="btn btn-quiet" onClick={onReload}>
          {LABELS.reload}
        </button>
      ) : null}
    </section>
  );
}

function Body(props: {
  screen: Screen;
  issues: string[];
  submitting: boolean;
  onSubmit: (body: DecisionRequest) => void;
  onReload: () => void;
}) {
  const { screen, onReload } = props;
  if (screen.kind === "loading") return <StateBanner state="loading" label={LABELS.stateLoading} tone="info" />;
  if (screen.kind === "error") return <StateBanner state="error" label={LABELS.stateError} tone="warn" onReload={onReload} />;
  if (screen.kind === "already_resolved") {
    const r = screen.result;
    return (
      <>
        <StateBanner state="already_resolved" label={LABELS.stateAlreadyResolved} tone="warn" onReload={onReload} />
        <p className="tag" data-same-as-winner={String(r.sameAsWinner)}>
          {r.sameAsWinner ? LABELS.sameDecision : LABELS.otherDecision}
        </p>
        <WrittenFacts facts={r.decision.edits ?? []} />
      </>
    );
  }
  const view = screen.view;
  switch (view.state) {
    case "fenced":
      return <StateBanner state="fenced" label={LABELS.stateFenced} tone="warn" onReload={onReload} />;
    case "in_progress":
      return <StateBanner state="in_progress" label={LABELS.stateInProgress} tone="info" onReload={onReload} />;
    case "not_found":
      return <StateBanner state="not_found" label={LABELS.stateNotFound} tone="warn" />;
    case "invalid":
      return (
        <>
          <StateBanner state="invalid" label={LABELS.stateInvalid} tone="warn" />
          <IssueList issues={view.issues} />
        </>
      );
    case "done":
      return (
        <>
          <StateBanner state="done" label={LABELS.stateDone} tone="ok" onReload={onReload} />
          <dl className="meta">
            <dt>{LABELS.outcome}</dt>
            <dd data-testid="outcome">{view.result.status}</dd>
          </dl>
          <WrittenFacts facts={view.decision?.approve ? (view.decision.edits ?? []) : []} />
          <p className="tag" data-summary-decision={view.summaryDecision ?? "approve"}>
            {view.summaryDecision === "withhold" ? LABELS.summaryWithheld : LABELS.summaryApproved}
          </p>
        </>
      );
    case "awaiting_approval":
      return <PendingForm view={view} issues={props.issues} submitting={props.submitting} onSubmit={props.onSubmit} />;
  }
}

function IssueList({ issues }: { issues: string[] }) {
  if (issues.length === 0) return null;
  return (
    <section className="issues" data-testid="issues">
      <h2>{LABELS.issues}</h2>
      <ul>
        {issues.map((issue, i) => (
          <li key={i}>{issue}</li>
        ))}
      </ul>
    </section>
  );
}

function WrittenFacts({ facts }: { facts: { key: string; value?: unknown }[] }) {
  return (
    <section>
      <h2>{LABELS.sectionWritten}</h2>
      {facts.length === 0 ? (
        <p className="muted">{LABELS.none}</p>
      ) : (
        <table className="grid" data-testid="written-facts">
          <thead>
            <tr>
              <th>{LABELS.colFact}</th>
              <th>{LABELS.colValue}</th>
            </tr>
          </thead>
          <tbody>
            {facts.map((f) => (
              <tr key={f.key} data-written-key={f.key}>
                <td className="mono">{f.key}</td>
                <td>{display(f.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function PendingForm({
  view,
  issues,
  submitting,
  onSubmit,
}: {
  view: Pending;
  issues: string[];
  submitting: boolean;
  onSubmit: (body: DecisionRequest) => void;
}) {
  const { request } = view;
  const [choices, setChoices] = useState<Record<string, FactChoice | undefined>>({});
  const summaryBlocked = request.summary === "";
  const [summary, setSummary] = useState<"approve" | "withhold" | undefined>(summaryBlocked ? "withhold" : undefined);
  const changeByKey = useMemo(() => new Map(request.diff.changes.map((c) => [c.key, c])), [request.diff.changes]);

  const decided = request.facts.filter((f) => {
    const c = choices[f.key];
    return c !== undefined && (c.decision !== "edit" || editedValue(f, c.text).ok);
  }).length;
  const ready = decided === request.facts.length && summary !== undefined && !submitting;

  const setChoice = (fact: ProposedFact, decision: FactChoice["decision"]) =>
    setChoices((prev) => ({ ...prev, [fact.key]: { decision, text: prev[fact.key]?.text ?? display(fact.value) } }));
  const setText = (fact: ProposedFact, text: string) =>
    setChoices((prev) => ({ ...prev, [fact.key]: { decision: "edit", text } }));

  const send = () => {
    if (!ready || summary === undefined) return;
    const facts: DecisionRequest["facts"] = request.facts.map((f) => {
      const c = choices[f.key]!;
      if (c.decision === "edit") {
        const v = editedValue(f, c.text);
        return { key: f.key, decision: "edit", value: v.ok ? v.value : c.text };
      }
      return { key: f.key, decision: c.decision };
    });
    onSubmit({ facts, summary });
  };

  return (
    <form
      className="stack"
      data-state="awaiting_approval"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <section>
        <h2>{LABELS.sectionFacts}</h2>
        <div className="facts">
          {request.facts.map((fact) => {
            const choice = choices[fact.key];
            const change = changeByKey.get(fact.key);
            const edit = choice?.decision === "edit" ? editedValue(fact, choice.text) : null;
            const flagged = fact.needsReview === true;
            return (
              <article
                key={fact.key}
                className={`fact${flagged ? " fact-flagged" : ""}${choice ? ` fact-${choice.decision}` : ""}`}
                data-fact-key={fact.key}
                data-needs-review={flagged ? "true" : "false"}
              >
                <div className="fact-head">
                  <span className="mono fact-key">{fact.key}</span>
                  {change ? <span className="chip">{change.op}</span> : null}
                  {flagged ? <span className="chip chip-warn">{LABELS.needsReview}</span> : null}
                </div>
                <dl className="fact-body">
                  <dt>{LABELS.colValue}</dt>
                  <dd className="fact-value">{display(fact.value)}</dd>
                  {change?.op === "update" ? (
                    <>
                      <dt>{LABELS.colBefore}</dt>
                      <dd className="muted">{display(change.before)}</dd>
                    </>
                  ) : null}
                  <dt>{LABELS.colEvidence}</dt>
                  <dd>
                    {fact.source.type === "transcript" ? (
                      <blockquote className="quote">{fact.source.quote}</blockquote>
                    ) : (
                      <span className="mono">{fact.source.type}</span>
                    )}
                  </dd>
                  {fact.source.type === "transcript" ? (
                    <>
                      <dt>{LABELS.colTurn}</dt>
                      <dd className="mono">{fact.source.turnId}</dd>
                    </>
                  ) : null}
                  <dt>{LABELS.colConfidence}</dt>
                  <dd>
                    <span className="conf" style={{ ["--conf" as string]: String(fact.confidence) }}>
                      {`${Math.round(fact.confidence * 100)}%`}
                    </span>
                  </dd>
                  <dt>{LABELS.colSensitivity}</dt>
                  <dd>{fact.sensitivity}</dd>
                  {flagged && fact.reviewReasons && fact.reviewReasons.length > 0 ? (
                    <>
                      <dt>{LABELS.colReason}</dt>
                      <dd>
                        <ul className="reasons">
                          {fact.reviewReasons.map((r, i) => (
                            <li key={i}>{r}</li>
                          ))}
                        </ul>
                      </dd>
                    </>
                  ) : null}
                </dl>
                <div className="choices" role="radiogroup" aria-label={`${LABELS.colDecision} ${fact.key}`}>
                  {(["approve", "edit", "reject"] as const).map((d) => (
                    <button
                      key={d}
                      type="button"
                      role="radio"
                      aria-checked={choice?.decision === d}
                      className={`btn btn-choice btn-${d}${choice?.decision === d ? " is-on" : ""}`}
                      data-decision={d}
                      data-fact={fact.key}
                      onClick={() => setChoice(fact, d)}
                    >
                      {LABELS[d]}
                    </button>
                  ))}
                </div>
                {choice?.decision === "edit" ? (
                  <label className="edit">
                    <span>{LABELS.editedValue}</span>
                    <input
                      type="text"
                      value={choice.text}
                      data-edit-for={fact.key}
                      aria-invalid={edit !== null && !edit.ok}
                      onChange={(e) => setText(fact, e.target.value)}
                    />
                    {edit !== null && !edit.ok ? <span className="error">{LABELS.invalidNumber}</span> : null}
                  </label>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>

      <section>
        <h2>{LABELS.sectionDropped}</h2>
        {request.dropped.length === 0 ? (
          <p className="muted">{LABELS.none}</p>
        ) : (
          <table className="grid" data-testid="dropped">
            <thead>
              <tr>
                <th>{LABELS.colFact}</th>
                <th>{LABELS.colReason}</th>
              </tr>
            </thead>
            <tbody>
              {request.dropped.map((d, i) => (
                <tr key={`${d.key}-${i}`} data-dropped-key={d.key}>
                  <td className="mono">{d.key}</td>
                  <td>{d.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2>{LABELS.sectionSummary}</h2>
        {summaryBlocked ? (
          <div className="summary summary-blocked">
            <span className="chip chip-warn">{LABELS.summaryWithheldBefore}</span>
            {request.summaryWithheldReason ? <p className="muted">{request.summaryWithheldReason}</p> : null}
          </div>
        ) : (
          <p className="summary" data-testid="summary">
            {request.summary}
          </p>
        )}
        <div className="choices" role="radiogroup" aria-label={LABELS.sectionSummary}>
          {(["approve", "withhold"] as const).map((d) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={summary === d}
              className={`btn btn-choice btn-${d === "approve" ? "approve" : "reject"}${summary === d ? " is-on" : ""}`}
              data-summary={d}
              disabled={d === "approve" && summaryBlocked}
              onClick={() => setSummary(d)}
            >
              {LABELS[d]}
            </button>
          ))}
        </div>
      </section>

      <IssueList issues={issues} />

      <footer className="submitbar">
        <span className="muted">{LABELS.decided}</span>
        <span className="mono" data-testid="decided-count">{`${decided}/${request.facts.length}`}</span>
        <button type="submit" className="btn btn-primary" data-testid="submit" disabled={!ready}>
          {submitting ? LABELS.submitting : LABELS.submit}
        </button>
      </footer>
    </form>
  );
}
