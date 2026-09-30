/**
 * T-008 / ISS-t-013-rev-5: per-fact counsellor decisions on the scribe's approval interrupt, and
 * the read-only thread inspection the approval UI renders from. Contract B3 (a human approves
 * every write; nothing before submit), B5 (typed boundaries), B15 fencing (nothing disclosed while
 * an erasure is in progress). Every assertion reads the fake collections back (B14).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ZodError } from "zod";
import { Command } from "@langchain/langgraph";
import {
  COLLECTION_NAMES,
  applyApprovedDiff,
  confirmErasure,
  rejectReasonAuditId,
  requestErasure,
  type SessionDoc,
  type ScribeResolutionDoc,
  type RejectReasonAuditDoc,
} from "@vc/db";
import {
  ApprovalFactSchema,
  ApprovalRequestSchema,
  ApprovalResponseError,
  ApprovalResponseSchema,
  COUNSELLOR_WITHHELD_SUMMARY_REASON,
  decisionFromResponse,
  compileScribeGraph,
  inspectScribe,
  MAX_REJECT_REASON_LENGTH,
  resumeScribe,
  SCRIBE_PURPOSE,
  startScribe,
  type ApprovalResponse,
} from "../src/scribe/index.js";
import { baseInput, citedCandidate, DEFAULT_SUMMARY, makeHarness, mockProvider, SESSION_ID, STUDENT_ID, SKILLS_DIR, type Harness } from "./scribe-fixtures.js";

const cfg = (threadId: string) => ({ threadId, counsellorId: "synthetic-test-counsellor" });

/** Three proposed facts: targetCountry (t1), budget (t3), intendedMajor (t1). */
function threeFactHarness(): Harness {
  return makeHarness({
    tenantId: "scribe-test",
    provider: mockProvider({
      "fact-extraction": {
        facts: [
          // fix cycle 1 (D-020 fail-safe rule): the quote now carries the first-person "I" so the
          // closed-vocabulary country can still auto-verify.
          citedCandidate("targetCountry", "Canada", "I want to study computer science in Canada", "t1"),
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
  return h.fakeDb.collection<SessionDoc>(COLLECTION_NAMES.sessions).all().find((s) => s._id === `scribe-test:${SESSION_ID}`);
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
  assert.deepEqual(open.get("intendedMajor")?.source, { type: "counsellor-edit", counsellorId: "synthetic-test-counsellor", editedAt: (open.get("intendedMajor")!.source as any).editedAt, editedFrom: paused.kind === "awaiting_approval" ? paused.request.facts.find(f => f.key === "intendedMajor")!.source : undefined });
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
// needsReview (T-013, D-020 citation-guarantee-scope: the scribe now sets it on every fact it
// extracts — false for the closed auto-verify surface (typed numbers + the fixed country/alias
// vocabulary, whole-word), true otherwise, never absent. ApprovalRequestSchema itself stays
// backward-compatible: a Fact literal that omits the field entirely still parses.)
// ---------------------------------------------------------------------------

test("T-008: ApprovalRequestSchema keeps an optional needsReview/reviewReasons per fact and still parses facts without it", async () => {
  const h = threeFactHarness();
  const paused = await startScribe(h.graph, baseInput(), cfg("pf-review"));
  assert.equal(paused.kind, "awaiting_approval");
  if (paused.kind !== "awaiting_approval") return;
  // targetCountry="Canada" is quoted from "I want to study computer science in Canada" (t1): a
  // closed-vocabulary country, whole-word matched, first-person, no negation, no third-party referent
  // -> auto-verified (fix cycle 1 fail-safe rule).
  assert.equal(paused.request.facts[0]?.key, "targetCountry");
  assert.equal(paused.request.facts[0]?.needsReview, false, "a closed-vocabulary country match auto-verifies (B2, D-020)");
  // The schema itself stays backward-compatible: a Fact object that never mentions the field at all
  // still parses (a legacy fact, or a non-scribe caller that never sets it).
  const { needsReview: _drop, reviewReasons: _drop2, ...withoutReview } = paused.request.facts[0]!;
  assert.equal(ApprovalFactSchema.parse(withoutReview).needsReview, undefined, "absent means not flagged");
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

// ---------------------------------------------------------------------------
// T-018 / ISS-t-008-c0-1: an edited value must match the proposed value's type
// ---------------------------------------------------------------------------

test("T-018 ISS-t-008-c0-1: an object edit value for a numeric fact is refused at the schema boundary, before any claim, writing nothing", async () => {
  const h = threeFactHarness();
  await startScribe(h.graph, baseInput(), cfg("pf-type-object"));
  const hostile: ApprovalResponse = {
    action: "per_fact",
    facts: [
      { key: "targetCountry", decision: "approve" },
      // The exact ISS-t-008-c0-1 probe: an object where budget_inr_per_year (a number) was proposed.
      { key: "budget_inr_per_year", decision: "edit", value: { not: "a number" } as unknown as string },
      { key: "intendedMajor", decision: "approve" },
    ],
    summary: "approve",
  };
  await assert.rejects(resumeScribe(h.graph, hostile, cfg("pf-type-object")), ZodError);
  assert.equal(h.facts.size(), 0, "nothing written");
  assert.equal(claims(h).length, 0, "no claim taken");
  const view = await inspectScribe(h.graph, "pf-type-object");
  assert.equal(view.kind, "awaiting_approval", "the thread is untouched and still open for a corrected response");

  // The thread heals: a valid response afterwards is still applied.
  const ok = await resumeScribe(h.graph, mixed(), cfg("pf-type-object"));
  assert.equal(ok.kind === "done" && ok.result.status, "written");
});

test("T-018 ISS-t-008-c0-1: an array edit value is refused the same way (not just a plain object)", async () => {
  const h = threeFactHarness();
  await startScribe(h.graph, baseInput(), cfg("pf-type-array"));
  const hostile: ApprovalResponse = {
    action: "per_fact",
    facts: [
      { key: "targetCountry", decision: "approve" },
      { key: "budget_inr_per_year", decision: "edit", value: [1, 2, 3] as unknown as string },
      { key: "intendedMajor", decision: "approve" },
    ],
    summary: "approve",
  };
  await assert.rejects(resumeScribe(h.graph, hostile, cfg("pf-type-array")), ZodError);
  assert.equal(h.facts.size(), 0);
});

test("T-018: a string edit value for a numeric fact is refused at the engine boundary (decisionFromResponse), before any claim", async () => {
  const h = threeFactHarness();
  await startScribe(h.graph, baseInput(), cfg("pf-type-mismatch"));
  const mismatched: ApprovalResponse = {
    action: "per_fact",
    facts: [
      { key: "targetCountry", decision: "approve" },
      // Schema-valid (a non-empty string, EditedValueSchema is satisfied) but the PROPOSED value
      // is a number — this is the check EditedValueSchema alone can not make (it never sees the
      // proposal), only perFactDecision/decisionFromResponse can, because both sides are there.
      { key: "budget_inr_per_year", decision: "edit", value: "twenty lakh" },
      { key: "intendedMajor", decision: "approve" },
    ],
    summary: "approve",
  };
  await assert.rejects(resumeScribe(h.graph, mismatched, cfg("pf-type-mismatch")), (err: unknown) => {
    assert.equal((err as Error).name, "ApprovalResponseError");
    assert.match((err as Error).message, /budget_inr_per_year.*string value.*proposed value is a number/);
    return true;
  });
  assert.equal(h.facts.size(), 0, "nothing written");
  assert.equal(claims(h).length, 0, "no claim taken");

  const ok = await resumeScribe(h.graph, mixed(), cfg("pf-type-mismatch"));
  assert.equal(ok.kind === "done" && ok.result.status, "written");
});

test("T-018: a boolean edit value for a numeric fact is refused; a same-type numeric edit is accepted", async () => {
  const h = threeFactHarness();
  await startScribe(h.graph, baseInput(), cfg("pf-type-bool"));
  await assert.rejects(
    resumeScribe(
      h.graph,
      {
        action: "per_fact",
        facts: [
          { key: "targetCountry", decision: "approve" },
          { key: "budget_inr_per_year", decision: "edit", value: true },
          { key: "intendedMajor", decision: "approve" },
        ],
        summary: "approve",
      },
      cfg("pf-type-bool"),
    ),
    ApprovalResponseError,
  );
  assert.equal(h.facts.size(), 0);

  const outcome = await resumeScribe(
    h.graph,
    {
      action: "per_fact",
      facts: [
        { key: "targetCountry", decision: "approve" },
        { key: "budget_inr_per_year", decision: "edit", value: 2500000 },
        { key: "intendedMajor", decision: "approve" },
      ],
      summary: "approve",
    },
    cfg("pf-type-bool"),
  );
  assert.equal(outcome.kind === "done" && outcome.result.status, "written");
  const open = new Map(h.openFacts().map((f) => [f.key, f]));
  assert.equal(open.get("budget_inr_per_year")?.value, 2500000, "a same-type numeric edit is accepted and written");
});

// ---------------------------------------------------------------------------
// T-018 / residual 3: per-fact reject reasons are recorded to the `decisions` collection
// ---------------------------------------------------------------------------

function decisionsColl(h: Harness) {
  return h.fakeDb.collection<RejectReasonAuditDoc>(COLLECTION_NAMES.decisions);
}

test("T-018 residual 3: a per_fact rejection writes an audit record with the thread id, student id, rejected keys and reasons, no transcript text", async () => {
  const h = threeFactHarness();
  await startScribe(h.graph, baseInput(), cfg("pf-reject-audit"));
  const outcome = await resumeScribe(h.graph, mixed(), cfg("pf-reject-audit"));
  assert.equal(outcome.kind === "done" && outcome.result.status, "written");

  const _id = `scribe-test:${rejectReasonAuditId("pf-reject-audit")}`;
  const doc = decisionsColl(h).all().find((d) => d._id === _id);
  assert.ok(doc, "an audit record was written");
  assert.equal(doc?.kind, "per_fact_reject");
  assert.equal(doc?.threadId, "pf-reject-audit");
  assert.equal(doc?.studentId, STUDENT_ID);
  assert.deepEqual(doc?.rejected, [{ key: "budget_inr_per_year", reason: "family said this is not final" }]);
  assert.equal(typeof doc?.decidedAt, "string");
  // No transcript text (the proposal's quote "around 20 lakh rupees a year") anywhere in the record.
  assert.equal(JSON.stringify(doc).includes("lakh"), false);
});

test("T-018 residual 3: an audit record is written even when EVERY fact is rejected (the overall decision is 'rejected')", async () => {
  const h = threeFactHarness();
  await startScribe(h.graph, baseInput(), cfg("pf-reject-audit-all"));
  const outcome = await resumeScribe(
    h.graph,
    {
      action: "per_fact",
      facts: [
        { key: "targetCountry", decision: "reject", reason: "not confirmed" },
        { key: "budget_inr_per_year", decision: "reject" },
        { key: "intendedMajor", decision: "reject", reason: "wants to change it" },
      ],
      summary: "withhold",
    },
    cfg("pf-reject-audit-all"),
  );
  assert.equal(outcome.kind === "done" && outcome.result.status, "rejected");
  const doc = decisionsColl(h).all().find((d) => d._id === `scribe-test:${rejectReasonAuditId("pf-reject-audit-all")}`);
  assert.ok(doc, "an audit record was written even though nothing else was");
  assert.deepEqual(
    doc?.rejected.map((r) => r.key).sort(),
    ["budget_inr_per_year", "intendedMajor", "targetCountry"],
  );
});

test("T-018 residual 3: no rejections -> no audit record is written", async () => {
  const h = threeFactHarness();
  await startScribe(h.graph, baseInput(), cfg("pf-no-reject"));
  await resumeScribe(h.graph, { action: "approve" }, cfg("pf-no-reject"));
  assert.equal(decisionsColl(h).all().length, 0);
});

test("T-018 residual 3: the audit write is idempotent under a checkpoint replay of the approval node (same deterministic _id, no duplicate)", async () => {
  const h = threeFactHarness();
  await startScribe(h.graph, baseInput(), cfg("pf-reject-replay"));
  const outcome = await resumeScribe(h.graph, mixed(), cfg("pf-reject-replay"));
  assert.equal(outcome.kind === "done" && outcome.result.status, "written");
  assert.equal(decisionsColl(h).all().filter((d) => d._id === `scribe-test:${rejectReasonAuditId("pf-reject-replay")}`).length, 1);

  // A resumeScribe(null) recovery re-invokes from the same checkpoint; the approval node already
  // recorded its decision, so this is the recorder-recovery no-op path, and the audit record must
  // still be exactly one document (no duplicate from re-running the node's own logic).
  const recovered = await resumeScribe(h.graph, null, cfg("pf-reject-replay"));
  assert.equal(recovered.kind, "done");
  assert.equal(decisionsColl(h).all().filter((d) => d._id === `scribe-test:${rejectReasonAuditId("pf-reject-replay")}`).length, 1);
});

// ---------------------------------------------------------------------------
// T-020 / ISS-t-018-c0-1: the reject reason is trimmed and length-limited at the schema boundary
// (RejectReasonSchema, schemas.ts), shared by ApprovalResponseSchema's per_fact reject variant and
// the audit record's own RejectedFactSchema.
// ---------------------------------------------------------------------------

test("T-020 ISS-t-018-c0-1: a reject reason is trimmed by the schema before it ever reaches the audit record", async () => {
  const h = threeFactHarness();
  await startScribe(h.graph, baseInput(), cfg("pf-reject-trim"));
  const outcome = await resumeScribe(
    h.graph,
    {
      action: "per_fact",
      facts: [
        { key: "targetCountry", decision: "approve" },
        { key: "budget_inr_per_year", decision: "reject", reason: "  needs a second look  " },
        { key: "intendedMajor", decision: "approve" },
      ],
      summary: "approve",
    },
    cfg("pf-reject-trim"),
  );
  assert.equal(outcome.kind === "done" && outcome.result.status, "written");
  const doc = decisionsColl(h).all().find((d) => d._id === `scribe-test:${rejectReasonAuditId("pf-reject-trim")}`);
  assert.deepEqual(doc?.rejected, [{ key: "budget_inr_per_year", reason: "needs a second look" }], "leading/trailing whitespace never reaches the audit record");
});

test("T-020 ISS-t-018-c0-1: a reject reason over MAX_REJECT_REASON_LENGTH, or whitespace-only, is refused at the schema boundary; exactly the limit is accepted", () => {
  const tooLong = { action: "per_fact" as const, facts: [{ key: "a", decision: "reject" as const, reason: "x".repeat(MAX_REJECT_REASON_LENGTH + 1) }], summary: "approve" as const };
  const blank = { action: "per_fact" as const, facts: [{ key: "a", decision: "reject" as const, reason: "   " }], summary: "approve" as const };
  assert.equal(ApprovalResponseSchema.safeParse(tooLong).success, false, "a reason 1 character over the limit must be refused");
  assert.equal(ApprovalResponseSchema.safeParse(blank).success, false, "a whitespace-only reason must be refused (omit it instead)");
  const atLimit = { action: "per_fact" as const, facts: [{ key: "a", decision: "reject" as const, reason: "x".repeat(MAX_REJECT_REASON_LENGTH) }], summary: "approve" as const };
  assert.equal(ApprovalResponseSchema.safeParse(atLimit).success, true, "a reason exactly at the limit is accepted");
  const absent = { action: "per_fact" as const, facts: [{ key: "a", decision: "reject" as const }], summary: "approve" as const };
  assert.equal(ApprovalResponseSchema.safeParse(absent).success, true, "no reason at all stays accepted (it is optional)");
});

// ---------------------------------------------------------------------------
// ISS-t-018-rev-2: recordRejectReasons' own write must be bound to the SAME (short) outer
// writerDeadlineMs the run lease (and write_approved's own inner writes, ISS-t-016-c0-1) already
// use, not the package's full 60s default.
// ---------------------------------------------------------------------------

test("ISS-t-018-rev-2: recordRejectReasons' own insert is bound to the SAME (short) outer writerDeadlineMs, not the package's full 60s default", async () => {
  const h = threeFactHarness();
  await startScribe(h.graph, baseInput(), cfg("pf-reject-deadline"));

  const decisions = decisionsColl(h);
  const timeouts: number[] = [];
  const realInsertOne = decisions.insertOne.bind(decisions);
  (decisions as unknown as { insertOne: typeof decisions.insertOne }).insertOne = (async (
    doc: Parameters<typeof realInsertOne>[0],
    options?: { timeoutMS?: number },
  ) => {
    if (options?.timeoutMS !== undefined) timeouts.push(options.timeoutMS);
    return realInsertOne(doc, options as Parameters<typeof realInsertOne>[1]);
  }) as typeof decisions.insertOne;

  const SHORT_MS = 200; // well below FENCED_WRITER_DEADLINE_MS (60_000) but a legal (0, 60_000] value
  const outcome = await resumeScribe(
    h.graph,
    {
      action: "per_fact",
      facts: [
        { key: "targetCountry", decision: "approve" },
        { key: "budget_inr_per_year", decision: "reject", reason: "needs review" },
        { key: "intendedMajor", decision: "approve" },
      ],
      summary: "approve",
    },
    { threadId: "pf-reject-deadline", writerDeadlineMs: SHORT_MS },
  );
  assert.equal(outcome.kind === "done" && outcome.result.status, "written");

  assert.ok(timeouts.length > 0, "the audit insert carried an explicit timeoutMS at all");
  for (const t of timeouts) {
    assert.ok(
      t <= SHORT_MS,
      `ISS-t-018-rev-2: recordRejectReasons' own insert timeoutMS must be bound to the outer writerDeadlineMs (${SHORT_MS}ms), got ${t}ms — ` +
        `a value close to 60000 means it is STILL using the package default, independent of the outer deadline`,
    );
  }
});

test("T046 authenticated per-fact edit stores actual actor/time and original citation while unchanged approval preserves source", async () => {
  const h = threeFactHarness();
  const paused = await startScribe(h.graph, baseInput(), cfg("t046-authenticated"));
  assert.equal(paused.kind, "awaiting_approval");
  if (paused.kind !== "awaiting_approval") return;
  const original = paused.request.facts.find((f) => f.key === "intendedMajor")!;
  const unchanged = paused.request.facts.find((f) => f.key === "targetCountry")!;
  assert.equal(h.facts.all().length, 0);
  const before = Date.now();
  await resumeScribe(h.graph, mixed(), { threadId: "t046-authenticated", counsellorId: "verified-counsellor" } as never);
  const written = h.openFacts().find((f) => f.key === "intendedMajor")!;
  const source = written.source as any;
  assert.equal(source.type, "counsellor-edit");
  assert.equal(source.counsellorId, "verified-counsellor");
  assert.ok(Date.parse(source.editedAt) >= before && Date.parse(source.editedAt) <= Date.now());
  assert.deepEqual(source.editedFrom, original.source);
  assert.deepEqual(h.openFacts().find((f) => f.key === "targetCountry")!.source, unchanged.source);
  assert.equal(written.needsReview, true);
  assert.equal(written.citationMatch, undefined);
  assert.deepEqual((claims(h)[0] as any).approvalMetadata, { counsellorId: source.counsellorId, editedAt: source.editedAt });
});

test("T046 genuine changed-value approval without trusted actor refuses before claim or write", async () => {
  const h = threeFactHarness();
  await startScribe(h.graph, baseInput(), cfg("t046-no-actor"));
  await assert.rejects(resumeScribe(h.graph, mixed(), { threadId: "t046-no-actor" }), (error: unknown) => error instanceof ApprovalResponseError);
  await assert.rejects(resumeScribe(h.graph, mixed(), { threadId: "t046-no-actor", counsellorId: "   " }), (error: unknown) => error instanceof ApprovalResponseError);
  assert.equal(claims(h).length, 0);
  assert.equal(h.facts.all().length, 0);
});

for (const action of ["approve", "per_fact"] as const) test(`T046 unknown body provenance is rejected before stripping ${action}`, () => {
  const response = action === "approve" ? { action, counsellorId: "FORGED_ACTOR", editedAt: "2026-09-30T00:00:00.000Z" } : { action, facts: [{ key: "k", decision: "edit", value: "changed", source: { type: "profile", id: "FORGED_SOURCE" } }], summary: "withhold" };
  assert.equal(ApprovalResponseSchema.safeParse(response).success, false);
});

test("T046 whole-batch structured edits use authoritative proposal metadata and preserve unchanged structure", async () => {
  const h = makeHarness({ tenantId: "scribe-test", provider: mockProvider({ "fact-extraction": { facts: [citedCandidate("structured", { first: 1, second: [2, 3] }, "study computer science", "t1")] } }) });
  const paused = await startScribe(h.graph, baseInput(), cfg("t046-structured"));
  assert.equal(paused.kind, "awaiting_approval");
  if (paused.kind !== "awaiting_approval") return;
  const proposed = paused.request.facts[0]!;
  const unchanged = (decisionFromResponse as any)({ action: "edit", facts: [{ ...proposed, value: { second: [2, 3], first: 1 } }] }, [proposed], { counsellorId: "structured-actor", editedAt: "2026-09-30T12:00:00.000Z" });
  assert.deepEqual(unchanged.decision.edits[0].source, proposed.source);
  const changed = (decisionFromResponse as any)({ action: "edit", facts: [{ ...proposed, value: { first: 2, second: [2, 3] } }] }, [proposed], { counsellorId: "structured-actor", editedAt: "2026-09-30T12:00:00.000Z" });
  assert.equal(changed.decision.edits[0].source.type, "counsellor-edit");
  assert.deepEqual(changed.decision.edits[0].source.editedFrom, proposed.source);
  assert.deepEqual(changed.decision.edits[0].value, { first: 2, second: [2, 3] });
});

for (const defect of ["source", "unknown", "duplicate", "confidence"] as const) test(`T046 whole-batch rejects replacement canonical fields ${defect}`, async () => {
  const h = threeFactHarness();
  const paused = await startScribe(h.graph, baseInput(), cfg(`t046-forged-${defect}`));
  assert.equal(paused.kind, "awaiting_approval");
  if (paused.kind !== "awaiting_approval") return;
  const proposed = paused.request.facts[0]!;
  const submitted: any = { ...proposed, value: "changed" };
  if (defect === "source") submitted.source = { type: "profile", id: "FORGED_SOURCE" };
  if (defect === "unknown") submitted.key = "UNPROPOSED";
  if (defect === "confidence") submitted.confidence = 0.123;
  const response: any = { action: "edit", facts: defect === "duplicate" ? [submitted, submitted] : [submitted] };
  await assert.rejects(resumeScribe(h.graph, response, { threadId: `t046-forged-${defect}`, counsellorId: "verified-counsellor" } as never), (error: unknown) => error instanceof ApprovalResponseError);
  assert.equal(claims(h).length, 0);
  assert.equal(h.facts.all().length, 0);
});
test("T046 private invocation metadata cannot authorize nested second graph sharing DB student and thread", async () => {
  const h = threeFactHarness();
  const threadId = "t046-exact-graph";
  await startScribe(h.graph, baseInput(), cfg(threadId));
  const second = compileScribeGraph({ db: h.db, provider: h.provider, skillsDir: SKILLS_DIR }, { checkpointer: h.checkpointer });
  h.graph.invoke = ((input: unknown, config: unknown) => second.invoke(input as never, config as never)) as typeof h.graph.invoke;
  await assert.rejects(resumeScribe(h.graph, mixed(), { threadId, counsellorId: "outer-actor" }), (error: unknown) => error instanceof ApprovalResponseError);
  assert.equal(h.facts.all().length, 0, "nested graph gets no outer actor grant");
});
test("T046 concurrent invocation actors do not cross graph boundaries", async () => {
  const first = threeFactHarness(); const second = threeFactHarness();
  await Promise.all([startScribe(first.graph, baseInput(), cfg("t046-concurrent-a")), startScribe(second.graph, baseInput(), cfg("t046-concurrent-b"))]);
  await Promise.all([resumeScribe(first.graph, mixed(), { threadId: "t046-concurrent-a", counsellorId: "actor-A" }), resumeScribe(second.graph, mixed(), { threadId: "t046-concurrent-b", counsellorId: "actor-B" })]);
  assert.equal((first.openFacts().find((f) => f.key === "intendedMajor")!.source as any).counsellorId, "actor-A");
  assert.equal((second.openFacts().find((f) => f.key === "intendedMajor")!.source as any).counsellorId, "actor-B");
});

test("T046 competing callers and checkpoint replay retain winning actor time and content", async () => {
  const h = threeFactHarness(); const threadId = "t046-winner";
  await startScribe(h.graph, baseInput(), cfg(threadId));
  const checkpoint = (await h.graph.getState({ configurable: { thread_id: threadId } })).config.configurable!.checkpoint_id;
  const responseA = mixed(); const responseB: any = mixed(); responseB.facts[2].value = "mathematics";
  const results = await Promise.all([resumeScribe(h.graph, responseA, { threadId, counsellorId: "winner-A" }), resumeScribe(h.graph, responseB, { threadId, counsellorId: "winner-B" })]);
  assert.equal(results.filter((r) => r.kind === "done").length, 1);
  assert.equal(claims(h).length, 1);
  const winner = claims(h)[0] as any; const snapshot = JSON.stringify(h.facts.all());
  const fact = h.openFacts().find((f) => f.key === "intendedMajor")!;
  assert.deepEqual({ counsellorId: (fact.source as any).counsellorId, editedAt: (fact.source as any).editedAt }, winner.approvalMetadata);
  const replay = await resumeScribe(h.graph, responseA, { threadId, checkpointId: checkpoint, counsellorId: "replay-other" });
  assert.equal(replay.kind, "already_resolved");
  assert.equal(JSON.stringify(h.facts.all()), snapshot);
  assert.deepEqual((claims(h)[0] as any).approvalMetadata, winner.approvalMetadata);
});

test("T046 crash after winning claim recovery uses winner metadata rather than recovery caller", async () => {
  const h = threeFactHarness(); const threadId = "t046-crash";
  await startScribe(h.graph, baseInput(), cfg(threadId));
  const invoke = h.graph.invoke.bind(h.graph);
  h.graph.invoke = (async () => { throw new Error("synthetic-before-approval-invoke"); }) as typeof h.graph.invoke;
  await assert.rejects(resumeScribe(h.graph, mixed(), { threadId, counsellorId: "claim-winner" }), /synthetic-before-approval-invoke/);
  assert.equal(h.facts.all().length, 0); const winner = structuredClone(claims(h)[0]) as any;
  h.graph.invoke = invoke;
  const recovered = await resumeScribe(h.graph, null, { threadId, counsellorId: "recovery-different" });
  assert.equal(recovered.kind, "done");
  const source = h.openFacts().find((f) => f.key === "intendedMajor")!.source as any;
  assert.deepEqual({ counsellorId: source.counsellorId, editedAt: source.editedAt }, winner.approvalMetadata);
  assert.equal(claims(h).length, 1);
});

test("T046 serialized configurable actor fields cannot grant edit authority", async () => {
  const h = threeFactHarness(); const threadId = "t046-config-forgery";
  await startScribe(h.graph, baseInput(), cfg(threadId));
  await assert.rejects(h.graph.invoke(new Command({ resume: mixed() }), { configurable: { thread_id: threadId, counsellorId: "FORGED_CONFIG", approvalMetadata: { counsellorId: "FORGED_CONFIG", editedAt: "2026-09-30T00:00:00.000Z" } } }), (error: unknown) => error instanceof ApprovalResponseError);
  assert.equal(h.facts.all().length, 0); assert.equal(claims(h).length, 0);
});

test("T046 structured batch subset genuinely persists changed canonical provenance", async () => {
  const h = makeHarness({ tenantId: "scribe-test", provider: mockProvider({ "fact-extraction": { facts: [citedCandidate("structured", { first: 1, second: [2, 3] }, "study computer science", "t1"), citedCandidate("untouched", "Canada", "Canada", "t1")] } }) });
  const threadId = "t046-structured-store"; const paused = await startScribe(h.graph, baseInput(), cfg(threadId));
  assert.equal(paused.kind, "awaiting_approval"); if (paused.kind !== "awaiting_approval") return;
  const original = paused.request.facts.find((f) => f.key === "structured")!;
  await resumeScribe(h.graph, { action: "edit", facts: [{ ...original, value: { first: 2, second: [2, 3] } }] }, { threadId, counsellorId: "structured-writer" });
  assert.equal(h.openFacts().length, 1);
  assert.deepEqual(h.openFacts()[0]!.value, { first: 2, second: [2, 3] });
  assert.equal(h.openFacts()[0]!.source.type, "counsellor-edit");
  assert.deepEqual((h.openFacts()[0]!.source as any).editedFrom, original.source);
});

test("T046 repeated edit retains bounded original citation with latest actual metadata", async () => {
  const h = threeFactHarness(); const paused = await startScribe(h.graph, baseInput(), cfg("t046-repeat"));
  assert.equal(paused.kind, "awaiting_approval"); if (paused.kind !== "awaiting_approval") return;
  const original = paused.request.facts[0]!;
  const first = (decisionFromResponse as any)({ action: "edit", facts: [{ ...original, value: "Germany" }] }, [original], { counsellorId: "first-actor", editedAt: "2026-09-30T12:00:00.000Z" }).decision.edits[0];
  const second = (decisionFromResponse as any)({ action: "edit", facts: [{ ...first, value: "Japan" }] }, [first], { counsellorId: "second-actor", editedAt: "2026-09-30T12:00:01.000Z" }).decision.edits[0];
  assert.deepEqual(second.source, { type: "counsellor-edit", counsellorId: "second-actor", editedAt: "2026-09-30T12:00:01.000Z", editedFrom: original.source });
  assert.equal(second.needsReview, true); assert.equal(second.citationMatch, undefined);
  await applyApprovedDiff(h.db, paused.request.diff, { approve: true, edits: [first] }, "repeat-first-session");
  const before = structuredClone(h.openFacts()[0]!);
  await applyApprovedDiff(h.db, paused.request.diff, { approve: true, edits: [second] }, "repeat-second-session");
  assert.equal(h.facts.all().length, 2); assert.equal(h.openFacts().length, 1);
  assert.equal(h.openFacts()[0]!.value, "Japan"); assert.deepEqual(h.openFacts()[0]!.source, second.source);
  const retired = h.facts.all().find(f => f._id === before._id)!; assert.equal(retired.active, undefined); assert.equal(Object.hasOwn(retired, "active"), false); assert.ok(retired.validTo); assert.equal(retired.value, "Germany"); assert.deepEqual(retired.source, first.source);
  const snapshot = JSON.stringify(h.facts.all()); await applyApprovedDiff(h.db, paused.request.diff, { approve: true, edits: [second] }, "repeat-second-session"); assert.equal(JSON.stringify(h.facts.all()), snapshot);
});

test("T046 model-authored counsellor edit remains unextractable", async () => {
  const candidate: any = citedCandidate("targetCountry", "Canada", "Canada", "t1");
  candidate.source = { type: "counsellor-edit", counsellorId: "MODEL_FORGED", editedAt: "2026-09-30T00:00:00.000Z", editedFrom: candidate.source };
  const h = makeHarness({ tenantId: "scribe-test", provider: mockProvider({ "fact-extraction": { facts: [candidate] } }) });
  const paused = await startScribe(h.graph, baseInput(), cfg("t046-model-forgery"));
  assert.equal(paused.kind, "awaiting_approval"); if (paused.kind !== "awaiting_approval") return;
  assert.equal(paused.request.facts.length, 0); assert.equal(paused.request.dropped.length, 1); assert.equal(h.facts.all().length, 0);
});

test("T046 changed formerly auto-verified value cannot inherit transcript verification", async () => {
  const h = threeFactHarness(); const threadId = "t046-auto-verified";
  const paused = await startScribe(h.graph, baseInput(), cfg(threadId)); assert.equal(paused.kind, "awaiting_approval"); if (paused.kind !== "awaiting_approval") return;
  assert.equal(paused.request.facts.find((f) => f.key === "targetCountry")!.needsReview, false);
  await resumeScribe(h.graph, { action: "per_fact", facts: [{ key: "targetCountry", decision: "edit", value: "Japan" }, { key: "budget_inr_per_year", decision: "reject" }, { key: "intendedMajor", decision: "reject" }], summary: "withhold" }, { threadId, counsellorId: "verified-edit" });
  assert.equal(h.openFacts()[0]!.needsReview, true); assert.equal(h.openFacts()[0]!.citationMatch, undefined); assert.equal(h.openFacts()[0]!.source.type, "counsellor-edit");
});
for (const seam of ["envelope", "candidate", "transcript source"] as const) test(`T046 model provenance injection refuses before projection ${seam}`, async () => {
  const candidate: any = citedCandidate("targetCountry", "Canada", "Canada", "t1");
  const response: any = { facts: [candidate] };
  if (seam === "envelope") response.counsellorId = "MODEL_PRIVATE_ACTOR";
  if (seam === "candidate") candidate.editedFrom = { type: "profile", id: "MODEL_PRIVATE_ACTOR" };
  if (seam === "transcript source") Object.assign(candidate.source, { counsellorId: "MODEL_PRIVATE_ACTOR", editedAt: "2026-09-30T00:00:00.000Z", editedFrom: { type: "profile", id: "MODEL_PRIVATE_ACTOR" } });
  const h = makeHarness({ tenantId: "scribe-test", provider: mockProvider({ "fact-extraction": response }) });
  const outcome = await startScribe(h.graph, baseInput(), cfg(`t046-injected-${seam}`));
  if (seam === "envelope") { assert.equal(outcome.kind, "done"); assert.equal(outcome.kind === "done" && outcome.result.status, "extraction_failed"); }
  else { assert.equal(outcome.kind, "awaiting_approval"); if (outcome.kind !== "awaiting_approval") return; assert.equal(outcome.request.facts.length, 0); assert.equal(outcome.request.dropped.length, 1); assert.doesNotMatch(JSON.stringify(outcome.request), /MODEL_PRIVATE_ACTOR/); }
  assert.equal(h.facts.all().length, 0); assert.equal(claims(h).length, 0);
});
test("T046 contaminated candidate drops without stripping provenance while clean neighbor survives", async () => {
  const contaminated: any = citedCandidate("targetCountry", "Canada", "Canada", "t1");
  contaminated.source.counsellorId = "MODEL_PRIVATE_ACTOR";
  const clean = citedCandidate("intendedMajor", "computer science", "study computer science", "t1");
  const h = makeHarness({ tenantId: "scribe-test", provider: mockProvider({ "fact-extraction": { facts: [contaminated, clean] } }) });
  const outcome = await startScribe(h.graph, baseInput(), cfg("t046-clean-neighbor"));
  assert.equal(outcome.kind, "awaiting_approval"); if (outcome.kind !== "awaiting_approval") return;
  assert.deepEqual(outcome.request.facts.map(f => f.key), ["intendedMajor"]);
  assert.equal(outcome.request.dropped.length, 1);
  assert.doesNotMatch(JSON.stringify(outcome), /MODEL_PRIVATE_ACTOR/);
  assert.equal(h.facts.all().length, 0); assert.equal(claims(h).length, 0);
});
test("T046 malformed durable winner metadata refuses typed without execution or writes", async () => {
  const h = threeFactHarness(); const threadId = "t046-malformed-winner";
  await startScribe(h.graph, baseInput(), cfg(threadId));
  const invoke = h.graph.invoke.bind(h.graph);
  h.graph.invoke = (async () => { throw new Error("synthetic-before-invoke"); }) as typeof h.graph.invoke;
  await assert.rejects(resumeScribe(h.graph, mixed(), { threadId, counsellorId: "actual-winner" }), /synthetic-before-invoke/);
  h.graph.invoke = invoke;
  const claim = claims(h)[0]!;
  let executed = 0; h.graph.invoke = (async (...args: Parameters<typeof invoke>) => { executed++; return invoke(...args); }) as typeof h.graph.invoke;
  for (const metadata of [{ counsellorId: 42, editedAt: "MALFORMED_PRIVATE_TIME" }, { counsellorId: "actor", editedAt: 42 }, { counsellorId: "actor", editedAt: "MALFORMED_PRIVATE_TIME" }, { counsellorId: "actor", editedAt: "2026-09-30T00:00:00.000Z", MALFORMED_PRIVATE_KEY: "private" }]) {
    await h.fakeDb.collection<any>(COLLECTION_NAMES.scribe_resolutions).updateOne({ _id: claim._id }, { $set: { approvalMetadata: metadata } });
    await assert.rejects(resumeScribe(h.graph, null, { threadId, counsellorId: "different-recovery" }), (error: unknown) => error instanceof ApprovalResponseError && !/MALFORMED_PRIVATE/.test(String(error) + JSON.stringify(error)));
  }
  assert.equal(executed, 0); assert.equal(h.facts.all().length, 0); assert.equal(claims(h).length, 1);
});