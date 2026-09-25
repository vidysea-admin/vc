/**
 * T-008: the approval screen's markup (server-rendered with react-dom/server, no browser) and the
 * B1 no-script rule: the UI's own words are labels only; every sentence on screen is data (a fact,
 * a quote, a reason, the draft summary), never a line for the counsellor to read aloud.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { isScriptLike } from "@vc/schemas";
import { ApprovalScreen } from "../src/components/ApprovalScreen";
import { LABELS } from "../src/components/labels";
import type { ApprovalView } from "../src/server/contracts";

const quoteSource = (quote: string, turnId: string) => ({ type: "transcript" as const, quote, turnId });

const PENDING: ApprovalView = {
  state: "awaiting_approval",
  threadId: "scribe:s-1",
  request: {
    sessionId: "s-1",
    studentId: "stu-1",
    summary: "Student is weighing computer science in Canada.",
    diff: {
      studentId: "stu-1",
      summary: "Student is weighing computer science in Canada.",
      changes: [
        { op: "add", key: "targetCountry", after: "Canada" },
        { op: "update", key: "budget_inr_per_year", before: 1500000, after: 2000000 },
      ],
      citedFactIds: [],
    },
    facts: [
      {
        key: "targetCountry",
        value: "Canada",
        source: quoteSource("computer science in Canada", "t1"),
        confidence: 0.92,
        validFrom: "2026-09-24T11:30:00.000Z",
        purposeTags: ["profile_synthesis"],
        sensitivity: "low",
      },
      {
        key: "budget_inr_per_year",
        value: 2000000,
        source: quoteSource("around 20 lakh rupees a year", "t5"),
        confidence: 0.66,
        validFrom: "2026-09-24T11:30:00.000Z",
        purposeTags: ["profile_synthesis"],
        sensitivity: "low",
        needsReview: true,
        reviewReasons: ["negation marker near the quote"],
      },
    ],
    dropped: [{ key: "scholarshipNeed", reason: "no source" }],
  },
};

/** Text nodes of static markup, entity-decoded and trimmed. */
function textNodes(html: string): string[] {
  const decode = (s: string) =>
    s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&#39;/g, "'");
  return [...html.replace(/<!-- -->/g, "").matchAll(/>([^<]+)</g)].map((m) => decode(m[1]!).trim()).filter((t) => t.length > 0);
}

test("pending: every proposed fact renders with key, value, quote, turn, confidence and its controls", () => {
  const html = renderToStaticMarkup(<ApprovalScreen threadId="scribe:s-1" initialView={PENDING} />);
  for (const needle of ["targetCountry", "Canada", "computer science in Canada", "t1", "92%", "budget_inr_per_year", "2000000", "t5", "66%"]) {
    assert.ok(html.includes(needle), `missing ${needle}`);
  }
  // before -> after for an update
  assert.ok(html.includes("1500000"));
  // per-fact controls: approve / edit / reject for each fact
  assert.equal((html.match(/data-decision="approve"/g) ?? []).length, 2);
  assert.equal((html.match(/data-decision="edit"/g) ?? []).length, 2);
  assert.equal((html.match(/data-decision="reject"/g) ?? []).length, 2);
  // summary controls
  assert.ok(html.includes('data-summary="approve"'));
  assert.ok(html.includes('data-summary="withhold"'));
});

test("pending: a needsReview fact is flagged with its reasons; an unflagged fact is not", () => {
  const html = renderToStaticMarkup(<ApprovalScreen threadId="scribe:s-1" initialView={PENDING} />);
  assert.equal((html.match(/data-needs-review="true"/g) ?? []).length, 1);
  assert.ok(html.includes("negation marker near the quote"));
});

test("pending: dropped facts render with their reasons, and the draft summary renders", () => {
  const html = renderToStaticMarkup(<ApprovalScreen threadId="scribe:s-1" initialView={PENDING} />);
  assert.ok(html.includes("scholarshipNeed"));
  assert.ok(html.includes("no source"));
  assert.ok(html.includes("Student is weighing computer science in Canada."));
});

test("pending: a model-withheld summary (B1) shows the reason and offers no approve", () => {
  const view: ApprovalView = {
    ...PENDING,
    request: { ...(PENDING as Extract<ApprovalView, { state: "awaiting_approval" }>).request, summary: "", summaryWithheldReason: "read as a script" },
  } as ApprovalView;
  const html = renderToStaticMarkup(<ApprovalScreen threadId="scribe:s-1" initialView={view} />);
  assert.ok(html.includes("read as a script"));
  assert.ok(/data-summary="approve"[^>]*disabled/.test(html) || /disabled[^>]*data-summary="approve"/.test(html));
});

test("states: fenced, in_progress, not_found and done each render a distinct labelled state with no fact data", () => {
  const cases: [ApprovalView, string][] = [
    [{ state: "fenced", threadId: "scribe:s-1" }, LABELS.stateFenced],
    [{ state: "in_progress", threadId: "scribe:s-1" }, LABELS.stateInProgress],
    [{ state: "not_found", threadId: "scribe:s-1" }, LABELS.stateNotFound],
  ];
  for (const [view, label] of cases) {
    const html = renderToStaticMarkup(<ApprovalScreen threadId="scribe:s-1" initialView={view} />);
    assert.ok(html.includes(label), label);
    assert.ok(html.includes(`data-state="${view.state}"`));
    assert.equal(html.includes("targetCountry"), false);
  }
  const done: ApprovalView = {
    state: "done",
    threadId: "scribe:s-1",
    result: { status: "written", writtenFactIds: ["f1"], supersededKeys: [] },
    decision: { approve: true, edits: [(PENDING as Extract<ApprovalView, { state: "awaiting_approval" }>).request.facts[0]!] },
    summaryDecision: "withhold",
  };
  const html = renderToStaticMarkup(<ApprovalScreen threadId="scribe:s-1" initialView={done} />);
  assert.ok(html.includes('data-state="done"'));
  assert.ok(html.includes(LABELS.stateDone));
  assert.ok(html.includes("targetCountry"));
  assert.ok(html.includes(LABELS.summaryWithheld));
});

test("B1: every UI label is a short label, never a script-like sentence", () => {
  for (const [name, label] of Object.entries(LABELS)) {
    assert.equal(isScriptLike(label, "evidence"), false, `${name}: "${label}" reads as a script`);
    assert.ok(label.split(/\s+/).length <= 6, `${name}: "${label}" is longer than a label`);
    assert.equal(/[.!]$/.test(label), false, `${name}: "${label}" is a sentence, not a label`);
  }
});

test("B1: the only text on the screen is labels or data from the proposal (nothing the UI composes itself)", () => {
  const html = renderToStaticMarkup(<ApprovalScreen threadId="scribe:s-1" initialView={PENDING} />);
  const req = (PENDING as Extract<ApprovalView, { state: "awaiting_approval" }>).request;
  const data = new Set<string>([
    "scribe:s-1",
    req.sessionId,
    req.studentId,
    req.summary,
    ...req.facts.flatMap((f) => [
      f.key,
      String(f.value),
      f.source.type === "transcript" ? f.source.quote : "",
      f.source.type === "transcript" ? f.source.turnId : "",
      `${Math.round(f.confidence * 100)}%`,
      ...(f.reviewReasons ?? []),
      f.sensitivity,
    ]),
    ...req.diff.changes.flatMap((c) => [c.op, String(c.before ?? ""), String(c.after ?? "")]),
    ...req.dropped.flatMap((d) => [d.key, d.reason]),
  ]);
  const labels = new Set<string>(Object.values(LABELS));
  const stray = textNodes(html).filter((t) => !labels.has(t) && !data.has(t) && !/^[\d\s%/→:·()-]+$/.test(t));
  assert.deepEqual(stray, [], "text on screen that is neither a label nor proposal data");
});
