/**
 * T-008: the approval screen's markup (server-rendered with react-dom/server, no browser) and the
 * B1 no-script rule: the UI's own words are labels only; every sentence on screen is data (a fact,
 * a quote, a reason, the draft summary), never a line for the counsellor to read aloud.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { isScriptLike } from "@vc/schemas";
import { ApprovalScreen, buildRejectDecision, reasonCounter } from "../src/components/ApprovalScreen";
import { LABELS } from "../src/components/labels";
import { MAX_REJECT_REASON_LENGTH, type ApprovalView } from "../src/server/contracts";

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

test("pending: no fact is decided yet, so no reject-reason field is rendered (it only appears once a fact is marked reject)", () => {
  const html = renderToStaticMarkup(<ApprovalScreen threadId="scribe:s-1" initialView={PENDING} />);
  assert.equal(html.includes("data-reason-for"), false);
  assert.equal(html.includes(LABELS.rejectReason), false);
});

// ---------------------------------------------------------------------------
// T-020 / ISS-t-018-c0-1: the per-fact reject decision the form sends to the server. This is the
// UI's own logic for what to send when a fact is marked "reject" — exercised directly (a real
// counsellor typing into the field and clicking Submit is proven live, against a real browser and a
// real production build, in demo/browser-evidence.ts's own interactions, not re-simulated here).
// ---------------------------------------------------------------------------

test("buildRejectDecision: a typed reason is trimmed and sent", () => {
  assert.deepEqual(buildRejectDecision("budget_inr_per_year", "  needs a second look  "), {
    key: "budget_inr_per_year",
    decision: "reject",
    reason: "needs a second look",
  });
});

test("buildRejectDecision: an empty or whitespace-only reason is OMITTED, never sent as reason: \"\"", () => {
  assert.deepEqual(buildRejectDecision("budget_inr_per_year", undefined), { key: "budget_inr_per_year", decision: "reject" });
  assert.deepEqual(buildRejectDecision("budget_inr_per_year", ""), { key: "budget_inr_per_year", decision: "reject" });
  assert.deepEqual(buildRejectDecision("budget_inr_per_year", "   "), { key: "budget_inr_per_year", decision: "reject" });
});

test("buildRejectDecision: a reason at exactly MAX_REJECT_REASON_LENGTH is sent as-is (the server, RejectReasonSchema, is the length authority)", () => {
  const atLimit = "x".repeat(MAX_REJECT_REASON_LENGTH);
  assert.deepEqual(buildRejectDecision("k", atLimit), { key: "k", decision: "reject", reason: atLimit });
});

// ---------------------------------------------------------------------------
// T-023 / ISS-t-020-c0-1 (B17 persona walk): the reject-reason box used to silently stop accepting
// keystrokes at MAX_REJECT_REASON_LENGTH with no counter, message or visual cue. `reasonCounter` is
// the pure arithmetic behind the live, accessible counter — the on-screen rendering and live update
// while typing is proven against a real browser in demo/browser-evidence.ts (this repo has no
// jsdom/testing-library, matching the precedent set by T-021's client-timeout coverage).
// ---------------------------------------------------------------------------

test("reasonCounter: empty text uses 0, remaining equals max, not at limit", () => {
  assert.deepEqual(reasonCounter("", 500), { used: 0, remaining: 500, atLimit: false });
});

test("reasonCounter: partial text counts used/remaining correctly", () => {
  assert.deepEqual(reasonCounter("x".repeat(120), 500), { used: 120, remaining: 380, atLimit: false });
});

test("reasonCounter: one character below the cap shows remaining 1 and is not yet at limit", () => {
  assert.deepEqual(reasonCounter("x".repeat(MAX_REJECT_REASON_LENGTH - 1), MAX_REJECT_REASON_LENGTH), {
    used: MAX_REJECT_REASON_LENGTH - 1,
    remaining: 1,
    atLimit: false,
  });
});

test("reasonCounter: exactly at the cap is atLimit with 0 remaining", () => {
  assert.deepEqual(reasonCounter("x".repeat(MAX_REJECT_REASON_LENGTH), MAX_REJECT_REASON_LENGTH), {
    used: MAX_REJECT_REASON_LENGTH,
    remaining: 0,
    atLimit: true,
  });
});

test("reasonCounter: a value longer than max (a paste/programmatic set that bypasses the input's maxLength) clamps remaining at 0 and is still atLimit, never negative", () => {
  assert.deepEqual(reasonCounter("x".repeat(MAX_REJECT_REASON_LENGTH + 10), MAX_REJECT_REASON_LENGTH), {
    used: MAX_REJECT_REASON_LENGTH + 10,
    remaining: 0,
    atLimit: true,
  });
});

// ---------------------------------------------------------------------------
// T-023 (T-020 verdict note): wherever a stored reject reason is rendered (today and in any future
// "past decisions" view), it must render as TEXT, never HTML. Today the client-safe contract
// (ApprovalView/SubmitResult) carries no rejectedFacts field at all -- the only place a stored
// reason is rendered is the reason <input>'s own `value` attribute while composing it (an attribute,
// never markup; proven live with a hostile payload in demo/browser-evidence.ts). These two tests
// prove the underlying invariant this file relies on: (a) it never uses dangerouslySetInnerHTML
// anywhere, so no stored string it holds -- today's dropped-fact reason / review reason / quote, or
// a future rendered reject reason -- can ever be interpreted as real markup; (b) every existing
// free-text render path already renders a <script>/<img onerror> payload as inert, escaped text.
// ---------------------------------------------------------------------------

// Strips block (/* ... */) and line (// ...) comments before the scan below, so a doc comment that
// legitimately DISCUSSES the guarded API by name (as this very file's own header does, and as
// ApprovalScreen.tsx's T-023 doc comment does) can never make the guard false-positive on itself.
// This is a plain string/regex pass, not a JS parser, so it does not need to handle `//` or `/*`
// appearing inside a string literal -- neither source file contains either token inside a string.
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

test("T-023 (T-020 verdict note): ApprovalScreen.tsx and labels.ts never use dangerouslySetInnerHTML in actual code (comments may discuss it by name)", () => {
  const approvalSource = stripComments(readFileSync(new URL("../src/components/ApprovalScreen.tsx", import.meta.url), "utf8"));
  const labelsSource = stripComments(readFileSync(new URL("../src/components/labels.ts", import.meta.url), "utf8"));
  assert.equal(approvalSource.includes("dangerouslySetInnerHTML"), false, "ApprovalScreen.tsx must not use dangerouslySetInnerHTML");
  assert.equal(labelsSource.includes("dangerouslySetInnerHTML"), false, "labels.ts must not use dangerouslySetInnerHTML");
});

test("T-023 (T-020 verdict note): a stored string containing <script> or <img onerror> markup renders inert, as escaped text, on every existing free-text render path (a review reason, a dropped-fact reason)", () => {
  const scriptPayload = "<script>window.__pwned = true</script>";
  const imgPayload = '<img src="x" onerror="window.__pwned = true">';
  const req = (PENDING as Extract<ApprovalView, { state: "awaiting_approval" }>).request;
  const hostileView: ApprovalView = {
    ...PENDING,
    request: {
      ...req,
      facts: [req.facts[0]!, { ...req.facts[1]!, reviewReasons: [scriptPayload] }],
      dropped: [{ key: "scholarshipNeed", reason: imgPayload }],
    },
  } as ApprovalView;
  const html = renderToStaticMarkup(<ApprovalScreen threadId="scribe:s-1" initialView={hostileView} />);
  // The payloads must still be shown to the counsellor -- as inert, HTML-entity-escaped text -- never
  // silently dropped. Asserting the FULL escaped payload (not just a substring like "onerror=", which
  // remains present, unescaped, inside legitimately-escaped text and would false-positive) is what
  // actually proves the attribute was never constructed as real markup.
  assert.ok(html.includes("&lt;script&gt;window.__pwned = true&lt;/script&gt;"), "the script payload must render, escaped, as text");
  assert.ok(
    html.includes("&lt;img src=&quot;x&quot; onerror=&quot;window.__pwned = true&quot;&gt;"),
    "the img payload, onerror attribute included, must render fully HTML-entity-escaped as text",
  );
  // No real element was ever created from the stored data: a genuine <script>/<img> tag would appear
  // as an actual `<script` / `<img` substring (React escapes `<` to `&lt;` on every text-child render
  // path), so this also rules out a real onerror ATTRIBUTE, which can only exist inside a real tag.
  assert.equal(/<script[\s>]/i.test(html), false, "a real <script> element must never be created from stored data");
  assert.equal(/<img[\s>]/i.test(html), false, "a real <img> element must never be created from stored data");
});
