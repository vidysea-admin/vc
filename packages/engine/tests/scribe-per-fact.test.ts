/**
 * T-008 / ISS-t-013-rev-5: per-fact counsellor decisions on the scribe's approval interrupt, and
 * the read-only thread inspection the approval UI renders from. Contract B3 (a human approves
 * every write; nothing before submit), B5 (typed boundaries), B15 fencing (nothing disclosed while
 * an erasure is in progress). Every assertion reads the fake collections back (B14).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { COLLECTION_NAMES, confirmErasure, requestErasure, type SessionDoc, type ScribeResolutionDoc } from "@vc/db";
import {
  ApprovalRequestSchema,
  ApprovalResponseError,
  ApprovalResponseSchema,
  COUNSELLOR_WITHHELD_SUMMARY_REASON,
  inspectScribe,
  resumeScribe,
  SCRIBE_PURPOSE,
  startScribe,
  type ApprovalResponse,
} from "../src/scribe/index.js";
import { baseInput, citedCandidate, DEFAULT_SUMMARY, makeHarness, mockProvider, SESSION_ID, STUDENT_ID, type Harness } from "./scribe-fixtures.js";

const cfg = (threadId: string) => ({ threadId });

/** Three proposed facts: targetCountry (t1), budget (t3), intendedMajor (t1). */
function threeFactHarness(): Harness {
  return makeHarness({
    provider: mockProvider({
      "fact-extraction": {
        facts: [
          citedCandidate("targetCountry", "Canada", "study computer science in Canada", "t1"),
          citedCandidate("budget_inr_per_year", 2000000, "around 20 lakh rupees a year", "t3"),
          citedCandidate("intendedMajor", "computer science", "study computer science", "t1"),
        ],
      },
    }),
  });
}

const mixed = (summary: "approve" | "withhold" = "approve"): ApprovalResponse => ({
  action: "per_fact",
  facts: [
    { key: "targetCountry", decision: "approve" },
    { key: "budget_inr_per_year", decision: "reject", reason: "family said this is not final" },
    { key: "intendedMajor", decision: "edit", value: "data science" },
  ],
  summary,
});

function sessionRow(h: Harness): SessionDoc | undefined {
  return h.fakeDb.collection<SessionDoc>(COLLECTION_NAMES.sessions).all().find((s) => s._id === SESSION_ID);
}

function claims(h: Harness): ScribeResolutionDoc[] {
  return h.fakeDb.collection<ScribeResolutionDoc>(COLLECTION_NAMES.scribe_resolutions).all();
}

// ---------------------------------------------------------------------------
// per-fact decisions
// ---------------------------------------------------------------------------

test("T-008 per_fact: approve one, reject one, edit one -> exactly the approved + edited facts are written (read back)", async () => {
  const h = threeFactHarness();
  const paused = await startScribe(h.graph, baseInput(), cfg("pf-mixed"));
  assert.equal(paused.kind, "awaiting_approval");

  const outcome = await resumeScribe(h.graph, mixed(), cfg("pf-mixed"));
  assert.equal(outcome.kind, "done");
  assert.equal(outcome.kind === "done" && outcome.result.status, "written");

  const open = new Map(h.openFacts().map((f) => [f.key, f]));
  assert.deepEqual([...open.keys()].sort(), ["intendedMajor", "targetCountry"]);
  assert.equal(open.get("targetCountry")?.value, "Canada");
  assert.equal(open.get("intendedMajor")?.value, "data science", "the edited value is written as edited");
  assert.deepEqual(open.get("intendedMajor")?.purposeTags, [SCRIBE_PURPOSE]);
  assert.equal(open.get("intendedMajor")?.source.type, "transcript", "the edit keeps the cited evidence (B2)");
  // A rejected fact is never written, not even as history.
  assert.equal(h.facts.all().filter((f) => f.key === "budget_inr_per_year").length, 0);
  assert.equal(sessionRow(h)?.summary, DEFAULT_SUMMARY, "the approved summary is stored");
});

test("T-008 per_fact: a rejected fact is never written, whatever else is approved", async () => {
  const h = threeFactHarness();
  await startScribe(h.graph, baseInput(), cfg("pf-reject-only-one"));
  await resumeScribe(
    h.graph,
    {
      action: "per_fact",
      facts: [
        { key: "targetCountry", decision: "reject" },
        { key: "budget_inr_per_year", decision: "approve" },
        { key: "intendedMajor", decision: "approve" },
      ],
      summary: "approve",
    },
    cfg("pf-reject-only-one"),
  );
  assert.deepEqual(h.openFacts().map((f) => f.key).sort(), ["budget_inr_per_year", "intendedMajor"]);
  assert.equal(h.facts.all().some((f) => f.key === "targetCountry"), false);
  assert.equal(h.edges.all().some((e) => JSON.stringify(e).includes("targetCountry")), false);
});

test("T-008 per_fact: withholding the summary stores no summary text, only the counsellor's withheld reason", async () => {
  const h = threeFactHarness();
  await startScribe(h.graph, baseInput(), cfg("pf-withhold"));
  const outcome = await resumeScribe(h.graph, mixed("withhold"), cfg("pf-withhold"));
  assert.equal(outcome.kind === "done" && outcome.result.status, "written");
  const row = sessionRow(h);
  assert.equal(row?.summary, "");
  assert.equal(row?.summaryWithheldReason, COUNSELLOR_WITHHELD_SUMMARY_REASON);
  assert.equal(h.openFacts().length, 2);
});

test("T-008 per_fact: every fact rejected AND the summary withheld -> rejected, nothing written at all", async () => {
  const h = threeFactHarness();
  await startScribe(h.graph, baseInput(), cfg("pf-all-reject"));
  const outcome = await resumeScribe(
    h.graph,
    {
      action: "per_fact",
      facts: ["targetCountry", "budget_inr_per_year", "intendedMajor"].map((key) => ({ key, decision: "reject" as const })),
      summary: "withhold",
    },
    cfg("pf-all-reject"),
  );
  assert.equal(outcome.kind === "done" && outcome.result.status, "rejected");
  assert.equal(h.facts.size(), 0);
  assert.equal(h.edges.size(), 0);
  assert.equal(sessionRow(h)?.summary, undefined);
  assert.equal(sessionRow(h)?.summaryApprovedAt, undefined);
});

test("T-008 per_fact: every fact rejected but the summary approved -> the summary alone is stored, zero facts", async () => {
  const h = threeFactHarness();
  await startScribe(h.graph, baseInput(), cfg("pf-summary-only"));
  const outcome = await resumeScribe(
    h.graph,
    {
      action: "per_fact",
      facts: ["targetCountry", "budget_inr_per_year", "intendedMajor"].map((key) => ({ key, decision: "reject" as const })),
      summary: "approve",
    },
    cfg("pf-summary-only"),
  );
  assert.equal(outcome.kind === "done" && outcome.result.status, "written");
  assert.equal(h.facts.size(), 0);
  assert.equal(sessionRow(h)?.summary, DEFAULT_SUMMARY);
});

test("T-008 B3: nothing is written before submit, and an invalid per_fact response writes nothing and takes no claim", async () => {
  const h = threeFactHarness();
  await startScribe(h.graph, baseInput(), cfg("pf-invalid"));
  assert.equal(h.facts.size(), 0);
  assert.equal(claims(h).length, 0);

  const invalid: ApprovalResponse[] = [
    // a proposed fact with no decision
    { action: "per_fact", facts: [{ key: "targetCountry", decision: "approve" }], summary: "approve" },
    // a key that was never proposed
    {
      action: "per_fact",
      facts: [
        { key: "targetCountry", decision: "approve" },
        { key: "budget_inr_per_year", decision: "approve" },
        { key: "intendedMajor", decision: "approve" },
        { key: "religion", decision: "approve" },
      ],
      summary: "approve",
    },
    // the same key decided twice
    {
      action: "per_fact",
      facts: [
        { key: "targetCountry", decision: "approve" },
        { key: "targetCountry", decision: "reject" },
        { key: "budget_inr_per_year", decision: "approve" },
        { key: "intendedMajor", decision: "approve" },
      ],
      summary: "approve",
    },
  ];
  for (const response of invalid) {
    await assert.rejects(resumeScribe(h.graph, response, cfg("pf-invalid")), ApprovalResponseError);
  }
  assert.equal(h.facts.size(), 0);
  assert.equal(claims(h).length, 0, "a refused response never claims the thread");

  // The thread is still open: a valid response afterwards is applied.
  const ok = await resumeScribe(h.graph, mixed(), cfg("pf-invalid"));
  assert.equal(ok.kind === "done" && ok.result.status, "written");
});

test("T-008 B5: the per_fact schema refuses an edit with no value, an unknown decision and an unknown summary choice", () => {
  const bad = [
    { action: "per_fact", facts: [{ key: "a", decision: "edit" }], summary: "approve" },
    { action: "per_fact", facts: [{ key: "a", decision: "edit", value: "" }], summary: "approve" },
    { action: "per_fact", facts: [{ key: "a", decision: "edit", value: null }], summary: "approve" },
    { action: "per_fact", facts: [{ key: "a", decision: "hold" }], summary: "approve" },
    { action: "per_fact", facts: [{ key: "a", decision: "approve" }], summary: "maybe" },
    { action: "per_fact", facts: [{ key: "a", decision: "approve" }] },
  ];
  for (const b of bad) assert.equal(ApprovalResponseSchema.safeParse(b).success, false, JSON.stringify(b));
});

test("T-008 backward compatibility: a whole-batch approve still writes every proposed fact and the summary", async () => {
  const h = threeFactHarness();
  await startScribe(h.graph, baseInput(), cfg("pf-batch"));
  const outcome = await resumeScribe(h.graph, { action: "approve" }, cfg("pf-batch"));
  assert.equal(outcome.kind === "done" && outcome.result.status, "written");
  assert.equal(h.openFacts().length, 3);
  assert.equal(sessionRow(h)?.summary, DEFAULT_SUMMARY);
});

test("T-008: a second per_fact submit is already_resolved with the first decision; nothing new is written", async () => {
  const h = threeFactHarness();
  await startScribe(h.graph, baseInput(), cfg("pf-twice"));
  await resumeScribe(h.graph, mixed(), cfg("pf-twice"));
  const idsBefore = h.facts.all().map((f) => f._id).sort();
  const second = await resumeScribe(h.graph, { action: "approve" }, cfg("pf-twice"));
  assert.equal(second.kind, "already_resolved");
  if (second.kind === "already_resolved") {
    assert.deepEqual(second.decision.edits?.map((f) => f.key).sort(), ["intendedMajor", "targetCountry"]);
    assert.equal(second.sameAsWinner, false);
  }
  assert.deepEqual(h.facts.all().map((f) => f._id).sort(), idsBefore);
});

// ---------------------------------------------------------------------------
// needsReview (T-013 fills it; the approval payload must carry it when present)
// ---------------------------------------------------------------------------

test("T-008: ApprovalRequestSchema keeps an optional needsReview/reviewReasons per fact and still parses facts without it", async () => {
  const h = threeFactHarness();
  const paused = await startScribe(h.graph, baseInput(), cfg("pf-review"));
  assert.equal(paused.kind, "awaiting_approval");
  if (paused.kind !== "awaiting_approval") return;
  assert.equal(paused.request.facts[0]?.needsReview, undefined, "absent means not flagged");
  const flagged = ApprovalRequestSchema.parse({
    ...paused.request,
    facts: paused.request.facts.map((f, i) => (i === 0 ? { ...f, needsReview: true, reviewReasons: ["negation near the quote"] } : f)),
  });
  assert.equal(flagged.facts[0]?.needsReview, true);
  assert.deepEqual(flagged.facts[0]?.reviewReasons, ["negation near the quote"]);
  assert.equal(
    ApprovalRequestSchema.safeParse({ ...paused.request, facts: [{ ...paused.request.facts[0], reviewReasons: [""] }] }).success,
    false,
    "an empty review reason is refused",
  );
});

// ---------------------------------------------------------------------------
// inspectScribe: the read-only view the approval UI renders
// ---------------------------------------------------------------------------

test("T-008 inspectScribe: not_found -> awaiting_approval -> done (with the decision), and reading never writes", async () => {
  const h = threeFactHarness();
  assert.deepEqual(await inspectScribe(h.graph, "pf-inspect"), { kind: "not_found" });

  await startScribe(h.graph, baseInput(), cfg("pf-inspect"));
  for (let i = 0; i < 3; i += 1) {
    const view = await inspectScribe(h.graph, "pf-inspect");
    assert.equal(view.kind, "awaiting_approval");
  }
  assert.equal(h.facts.size(), 0, "inspecting a paused thread writes nothing (B3)");
  assert.equal(claims(h).length, 0, "inspecting never claims");

  await resumeScribe(h.graph, mixed("withhold"), cfg("pf-inspect"));
  const done = await inspectScribe(h.graph, "pf-inspect");
  assert.equal(done.kind, "done");
  if (done.kind !== "done") return;
  assert.equal(done.result.status, "written");
  assert.deepEqual(done.decision?.edits?.map((f) => f.key).sort(), ["intendedMajor", "targetCountry"]);
  assert.equal(done.summaryDecision, "withhold");
});

test("T-008 inspectScribe: a claimed thread whose decision is not recorded yet is in_progress", async () => {
  const h = threeFactHarness();
  await startScribe(h.graph, baseInput(), cfg("pf-claimed"));
  const realInvoke = h.graph.invoke.bind(h.graph);
  let crashes = 1;
  (h.graph as unknown as { invoke: unknown }).invoke = async (...args: Parameters<typeof realInvoke>) => {
    if (crashes > 0) {
      crashes -= 1;
      throw new Error("simulated crash between the claim and the graph invoke");
    }
    return realInvoke(...args);
  };
  await assert.rejects(resumeScribe(h.graph, mixed(), cfg("pf-claimed")), /simulated crash/);
  assert.deepEqual(await inspectScribe(h.graph, "pf-claimed"), { kind: "in_progress" });
});

test("T-008 inspectScribe: a fenced student (erasure in progress) is reported fenced, with no student data", async () => {
  const h = threeFactHarness();
  await startScribe(h.graph, baseInput(), cfg("pf-fenced"));
  const { requestId } = await requestErasure(h.db, { studentId: STUDENT_ID, requestedBy: "counsellor-7", reason: "student_request" });
  await confirmErasure(h.db, { requestId, confirmedBy: "admin-2" });
  assert.deepEqual(await inspectScribe(h.graph, "pf-fenced"), { kind: "fenced" });
  const resumed = await resumeScribe(h.graph, mixed(), cfg("pf-fenced"));
  assert.equal(resumed.kind, "fenced");
  assert.equal(h.facts.size(), 0);
});
