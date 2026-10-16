"use client";
/**
 * T-008: the counsellor's diff-approval screen for ONE paused scribe thread.
 * - Shows the proposed profile changes fact by fact (key, value, current value, quote + turn,
 *   confidence, sensitivity, optional needsReview flag), the dropped facts with their reasons, and
 *   the draft summary.
 * - The counsellor approves, edits or rejects each fact, and approves or withholds the summary.
 *   Nothing is sent until Submit (B3); the server applies only approved and edited facts.
 * - T-020 / ISS-t-018-c0-1: rejecting a fact reveals an optional free-text reason box (the
 *   counsellor's own words typed in, never a suggested sentence — B1). The reason is sent with the
 *   per-fact reject decision and recorded as a fence-aware audit record (packages/db decisions.ts).
 * - T-023 / ISS-t-020-c0-1 (B17 persona walk): the reason box used to stop accepting keystrokes at
 *   MAX_REJECT_REASON_LENGTH with no visible cue. It now shows a live, accessible character counter
 *   (aria-live + aria-describedby) plus a "Limit reached" notice, so a counsellor never loses typed
 *   text without knowing why (`reasonCounter`, below).
 * - T-023 (T-020 verdict note): a stored reject reason is rendered nowhere on screen today — the
 *   client-safe contract (`ApprovalView`/`SubmitResult`, apps/web/src/server/contracts.ts) carries
 *   only `CounsellorDecisionSchema` (`{approve, edits}`), which has no `rejectedFacts` field at all;
 *   wiring that through is a server/contract change outside this unit's scope (apps/web only). The
 *   ONE place a stored reason is rendered today is the reason `<input>`'s own controlled `value`
 *   while the counsellor is composing it (below) — an attribute, never markup, and this file
 *   contains no `dangerouslySetInnerHTML` anywhere (guarded by a source-scan test). Any future
 *   "past decisions" view that renders a stored reason must keep it a plain JSX text child for the
 *   same reason.
 * - B1: every word the UI writes comes from LABELS; all other text is proposal data or the
 *   counsellor's own typed text (the edited value, the reject reason).
 */
import { createContext, useContext, useCallback, useEffect, useMemo, useState } from "react";
import type { ApprovalView, DecisionRequest, SubmitResult } from "../server/contracts";
import { ApprovalViewSchema, MAX_REJECT_REASON_LENGTH, SubmitResultSchema } from "../server/contracts";
import { getDictionary, normalizeUiLocale, UI_LOCALE_COOKIE, type UiLocale } from "./labels";

const UiLocaleContext = createContext<UiLocale>("en");
const LOCALE_EVENT = "vc-ui-locale-change";

/** Cookie is a UI preference, never student consent or an API authorization input. */
export function useUiLocale(initialLocale: UiLocale = "en") {
  const [locale, setLocale] = useState<UiLocale>(() => normalizeUiLocale(initialLocale));
  useEffect(() => {
    const reconcile = () => {
      const value = document.cookie.split(";").map(item => item.trim()).find(item => item.startsWith(`${UI_LOCALE_COOKIE}=`))?.slice(UI_LOCALE_COOKIE.length + 1);
      setLocale(normalizeUiLocale(value));
    };
    // A cached/prefetched route may carry an older server prop. Current cookie wins
    // after hydration, without remounting a pending form or requesting a refresh.
    reconcile();
    window.addEventListener(LOCALE_EVENT, reconcile);
    window.addEventListener("pageshow", reconcile);
    return () => { window.removeEventListener(LOCALE_EVENT, reconcile); window.removeEventListener("pageshow", reconcile); };
  }, [initialLocale]);
  const selectLocale = (value: unknown) => {
    const next = normalizeUiLocale(value);
    document.cookie = `${UI_LOCALE_COOKIE}=${next}; Path=/; SameSite=Lax; Max-Age=31536000`;
    setLocale(next);
    window.dispatchEvent(new Event(LOCALE_EVENT));
  };
  return [locale, selectLocale] as const;
}

/** Client-selected labels also reconcile cached server navigation without a refresh. */
export function UiLabel({ name, initialLocale = "en" }: { name: keyof ReturnType<typeof getDictionary>["labels"]; initialLocale?: UiLocale }) {
  const [locale] = useUiLocale(initialLocale);
  return <>{getDictionary(locale).labels[name]}</>;
}

export function LocaleSelector({ initialLocale = "en" }: { initialLocale?: UiLocale }) {
  const [locale, selectLocale] = useUiLocale(initialLocale);
  const dictionary = getDictionary(locale);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = dictionary.metadata.title;
  }, [locale, dictionary.metadata.title]);
  return <label>{dictionary.labels.language} <select data-testid="ui-locale" value={locale} onChange={event => selectLocale(event.target.value)}>
    <option value="en">{dictionary.labels.languageEnglish}</option><option value="hi">{dictionary.labels.languageHindi}</option>
  </select></label>;
}

type Pending = Extract<ApprovalView, { state: "awaiting_approval" }>;
type ProposedFact = Pending["request"]["facts"][number];
/** `reason` only ever applies when `decision === "reject"`; absent otherwise. */
type FactChoice = { decision: "approve" | "reject" | "edit"; text: string; reason?: string };
type Screen =
  | { kind: "view"; view: ApprovalView }
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "already_resolved"; result: Extract<SubmitResult, { state: "already_resolved" }> };

export interface ApprovalScreenProps {
  threadId: string;
  /** Server-provided first view (tests, or a pre-fetched page); otherwise fetched on mount. */
  initialView?: ApprovalView;
  initialLocale?: UiLocale;
}

function display(value: unknown): string {
  if (value === undefined) return "";
  if (value === null || typeof value !== "object") return String(value);
  return JSON.stringify(value);
}

/**
 * The edited text as a value of the proposed value's type (a number stays a number). T-018: the
 * return type is narrowed to `string | number | boolean` (never `unknown`) because that is what
 * this function actually produces, and it is now what the engine boundary (EditedValueSchema,
 * perFactDecision) requires too — this was already the client-side mirror of that rule.
 */
function editedValue(fact: ProposedFact, text: string): { ok: true; value: string | number | boolean } | { ok: false } {
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

/**
 * T-020 / ISS-t-018-c0-1: builds the per-fact `reject` decision the server receives. The reason is
 * trimmed and OMITTED (never sent as `reason: ""`) when it is empty or whitespace-only: the
 * server's own RejectReasonSchema (schemas.ts, engine) refuses a PRESENT-but-empty reason after its
 * own trim, so an untouched or blanked-out box must be sent as no reason at all, not a blank one.
 * The server is the actual authority on length + trim (B5); this only mirrors it so a counsellor
 * who left the box empty never gets a needless validation error back.
 */
export function buildRejectDecision(key: string, reason: string | undefined): DecisionRequest["facts"][number] {
  const trimmed = (reason ?? "").trim();
  return trimmed === "" ? { key, decision: "reject" } : { key, decision: "reject", reason: trimmed };
}

/**
 * T-023 / ISS-t-020-c0-1: the reject-reason counter's pure arithmetic — how many characters are
 * used, how many remain before `max` (never negative, defends against a pasted/programmatic value
 * longer than the input's `maxLength`), and whether the cap has been reached. Exported so it is
 * unit-tested directly: this repo has no jsdom/testing-library, so the counter's on-screen
 * rendering and live updates are proven against a real browser (demo/browser-evidence.ts) — this is
 * the deterministic logic behind what it displays.
 */
export function reasonCounter(text: string, max: number): { used: number; remaining: number; atLimit: boolean } {
  const used = text.length;
  const remaining = Math.max(0, max - used);
  return { used, remaining, atLimit: used >= max };
}

const apiUrl = (threadId: string) => `/api/approvals/${encodeURIComponent(threadId)}`;

export function ApprovalScreen({ threadId, initialView, initialLocale = "en" }: ApprovalScreenProps) {
  const [locale] = useUiLocale(initialLocale);
  const LABELS = getDictionary(locale).labels;
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
    <UiLocaleContext.Provider value={locale}><main className="shell">
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
    </main></UiLocaleContext.Provider>
  );
}

function StateBanner({ state, label, tone, onReload }: { state: string; label: string; tone: "info" | "warn" | "ok"; onReload?: () => void }) {
  const LABELS = getDictionary(useContext(UiLocaleContext)).labels;
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
  const locale = useContext(UiLocaleContext);
  const dictionary = getDictionary(locale);
  const LABELS = dictionary.labels;
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
            <dd data-testid="outcome">{locale === "en" ? view.result.status : dictionary.enums.outcome[view.result.status]}</dd>
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
  const LABELS = getDictionary(useContext(UiLocaleContext)).labels;
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
  const LABELS = getDictionary(useContext(UiLocaleContext)).labels;
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
  const dictionary = getDictionary(useContext(UiLocaleContext));
  const LABELS = dictionary.labels;
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
    setChoices((prev) => ({
      ...prev,
      [fact.key]: { decision, text: prev[fact.key]?.text ?? display(fact.value), reason: prev[fact.key]?.reason },
    }));
  const setText = (fact: ProposedFact, text: string) =>
    setChoices((prev) => ({ ...prev, [fact.key]: { decision: "edit", text } }));
  const setReason = (fact: ProposedFact, reason: string) =>
    setChoices((prev) => {
      const current = prev[fact.key];
      if (!current) return prev;
      return { ...prev, [fact.key]: { ...current, reason } };
    });

  const send = () => {
    if (!ready || summary === undefined) return;
    const facts: DecisionRequest["facts"] = request.facts.map((f) => {
      const c = choices[f.key]!;
      if (c.decision === "edit") {
        const v = editedValue(f, c.text);
        return { key: f.key, decision: "edit", value: v.ok ? v.value : c.text };
      }
      if (c.decision === "reject") return buildRejectDecision(f.key, c.reason);
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
                  {change ? <span className="chip">{dictionary.enums.change[change.op]}</span> : null}
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
                      <span className="mono">{dictionary.enums.source[fact.source.type]}</span>
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
                  <dd>{dictionary.enums.sensitivity[fact.sensitivity]}</dd>
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
                {choice?.decision === "reject" ? (() => {
                  const count = reasonCounter(choice.reason ?? "", MAX_REJECT_REASON_LENGTH);
                  const countId = `reason-count-${fact.key}`;
                  return (
                    <label className="reject-reason">
                      <span>{LABELS.rejectReason}</span>
                      <input
                        type="text"
                        value={choice.reason ?? ""}
                        data-reason-for={fact.key}
                        maxLength={MAX_REJECT_REASON_LENGTH}
                        aria-describedby={countId}
                        onChange={(e) => setReason(fact, e.target.value)}
                      />
                      <span
                        id={countId}
                        className={`reason-count${count.atLimit ? " reason-count-limit" : ""}`}
                        aria-live="polite"
                        data-testid={countId}
                        data-at-limit={count.atLimit ? "true" : "false"}
                      >
                        <span>{LABELS.rejectReasonRemaining}</span> <span className="mono">{`${count.used}/${MAX_REJECT_REASON_LENGTH}`}</span>
                        {count.atLimit ? (
                          <>
                            {" · "}
                            <span className="reason-limit">{LABELS.rejectReasonLimitReached}</span>
                          </>
                        ) : null}
                      </span>
                    </label>
                  );
                })() : null}
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
