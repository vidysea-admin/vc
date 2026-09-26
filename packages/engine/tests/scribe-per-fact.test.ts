/**
 * T-008 / ISS-t-013-rev-5: per-fact counsellor decisions on the scribe's approval interrupt, and
 * the read-only thread inspection the approval UI renders from. Contract B3 (a human approves
 * every write; nothing before submit), B5 (typed boundaries), B15 fencing (nothing disclosed while
 * an erasure is in progress). Every assertion reads the fake collections back (B14).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ZodError } from "zod";
import {
  COLLECTION_NAMES,
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
  inspectScribe,
  MAX_REJECT_REASON_LENGTH,
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

  const _id = rejectReasonAuditId("pf-reject-audit");
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
  const doc = decisionsColl(h).all().find((d) => d._id === rejectReasonAuditId("pf-reject-audit-all"));
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
  assert.equal(decisionsColl(h).all().filter((d) => d._id === rejectReasonAuditId("pf-reject-replay")).length, 1);

  // A resumeScribe(null) recovery re-invokes from the same checkpoint; the approval node already
  // recorded its decision, so this is the recorder-recovery no-op path, and the audit record must
  // still be exactly one document (no duplicate from re-running the node's own logic).
  const recovered = await resumeScribe(h.graph, null, cfg("pf-reject-replay"));
  assert.equal(recovered.kind, "done");
  assert.equal(decisionsColl(h).all().filter((d) => d._id === rejectReasonAuditId("pf-reject-replay")).length, 1);
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
  const doc = decisionsColl(h).all().find((d) => d._id === rejectReasonAuditId("pf-reject-trim"));
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
