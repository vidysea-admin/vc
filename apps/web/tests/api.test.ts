/**
 * T-008: the approval route handlers (GET pending approval, POST decision) over the demo runtime
 * (in-process fake db, mock provider, synthetic threads). Every write assertion is a read-back from
 * the fake (B14); every body is parsed with the same Zod contract the UI uses (B5).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createDemoRuntime, DEMO_THREADS, type DemoRuntime } from "../demo/seed";
import { getApprovalView, submitDecision } from "../src/server/approval-service";
import { ApprovalViewSchema, SubmitResultSchema, type DecisionRequest } from "../src/server/contracts";
import { resolveMode, setRuntimeForTests } from "../src/server/runtime";
import { GET, POST } from "../src/app/api/approvals/[threadId]/route";

const MIXED: DecisionRequest = {
  facts: [
    { key: "targetCountry", decision: "approve" },
    { key: "intendedMajor", decision: "reject", reason: "still undecided" },
    { key: "preferredIntake", decision: "edit", value: "January 2028" },
    { key: "budget_inr_per_year", decision: "approve" },
  ],
  summary: "withhold",
};

async function fresh(): Promise<DemoRuntime> {
  return createDemoRuntime();
}

test("GET: a paused thread returns the proposal fact by fact, the dropped facts with reasons and the draft summary", async () => {
  const rt = await fresh();
  const { status, body } = await getApprovalView(rt, DEMO_THREADS.paused);
  assert.equal(status, 200);
  const view = ApprovalViewSchema.parse(body);
  assert.equal(view.state, "awaiting_approval");
  if (view.state !== "awaiting_approval") return;
  assert.deepEqual(
    view.request.facts.map((f) => f.key),
    ["targetCountry", "intendedMajor", "preferredIntake", "budget_inr_per_year"],
  );
  const budget = view.request.facts.find((f) => f.key === "budget_inr_per_year")!;
  assert.equal(budget.source.type, "transcript");
  assert.equal(budget.source.type === "transcript" && budget.source.turnId, "t5");
  assert.equal(budget.confidence, 0.66);
  assert.deepEqual(view.request.dropped.map((d) => d.key).sort(), ["parentOccupation", "scholarshipNeed"]);
  for (const d of view.request.dropped) assert.ok(d.reason.length > 0);
  assert.match(view.request.summary, /Canada/);
});

test("B3: reading the pending approval (repeatedly) writes nothing and claims nothing", async () => {
  const rt = await fresh();
  for (let i = 0; i < 3; i += 1) await getApprovalView(rt, DEMO_THREADS.paused);
  const rb = rt.readback("demo-student-1");
  assert.equal(rb.facts.length, 0);
  assert.equal(rb.claims, 0);
  assert.equal(rb.sessions[0]?.summary, undefined);
});

test("POST: approve / reject / edit per fact + withhold the summary writes exactly the approved and edited facts", async () => {
  const rt = await fresh();
  const { status, body } = await submitDecision(rt, DEMO_THREADS.paused, MIXED);
  assert.equal(status, 200);
  const result = SubmitResultSchema.parse(body);
  assert.equal(result.state, "done");
  assert.equal(result.state === "done" && result.result.status, "written");

  const rb = rt.readback("demo-student-1");
  const written = new Map(rb.facts.filter((f) => f.active).map((f) => [f.key, f.value]));
  assert.deepEqual([...written.keys()].sort(), ["budget_inr_per_year", "preferredIntake", "targetCountry"]);
  assert.equal(written.get("preferredIntake"), "January 2028", "the edited value is written as edited");
  assert.equal(rb.facts.some((f) => f.key === "intendedMajor"), false, "a rejected fact is never written");
  assert.equal(rb.sessions[0]?.summary, "", "a withheld summary stores no text");
  assert.ok(rb.sessions[0]?.summaryWithheldReason);
});

test("POST twice: the second submit is already_resolved (409) and writes nothing new; GET then shows the resolved state", async () => {
  const rt = await fresh();
  await submitDecision(rt, DEMO_THREADS.paused, MIXED);
  const before = rt.readback("demo-student-1").facts.length;
  const second = await submitDecision(rt, DEMO_THREADS.paused, { ...MIXED, summary: "approve" });
  assert.equal(second.status, 409);
  const parsed = SubmitResultSchema.parse(second.body);
  assert.equal(parsed.state, "already_resolved");
  assert.equal(rt.readback("demo-student-1").facts.length, before);

  const view = ApprovalViewSchema.parse((await getApprovalView(rt, DEMO_THREADS.paused)).body);
  assert.equal(view.state, "done");
  if (view.state !== "done") return;
  assert.deepEqual(view.decision?.edits?.map((f) => f.key).sort(), ["budget_inr_per_year", "preferredIntake", "targetCountry"]);
  assert.equal(view.summaryDecision, "withhold");
});

test("B5: invalid decision bodies are refused (400) and write nothing, claim nothing", async () => {
  const rt = await fresh();
  const bad: unknown[] = [
    null,
    "approve",
    {},
    { facts: MIXED.facts },
    { facts: MIXED.facts, summary: "maybe" },
    { facts: MIXED.facts.slice(0, 3), summary: "approve" }, // a proposed fact left undecided
    { facts: [...MIXED.facts, { key: "religion", decision: "approve" }], summary: "approve" }, // unknown key
    { facts: [...MIXED.facts, { key: "targetCountry", decision: "reject" }], summary: "approve" }, // decided twice
    { facts: [{ ...MIXED.facts[2], value: "" }, ...MIXED.facts.slice(0, 2), MIXED.facts[3]], summary: "approve" }, // empty edit
    { ...MIXED, extra: "field" },
  ];
  for (const b of bad) {
    const { status, body } = await submitDecision(rt, DEMO_THREADS.paused, b);
    assert.equal(status, 400, JSON.stringify(b));
    assert.equal(SubmitResultSchema.parse(body).state, "invalid");
  }
  const rb = rt.readback("demo-student-1");
  assert.equal(rb.facts.length, 0);
  assert.equal(rb.claims, 0);
  const view = ApprovalViewSchema.parse((await getApprovalView(rt, DEMO_THREADS.paused)).body);
  assert.equal(view.state, "awaiting_approval", "the thread stays open after refused submits");
});

test("fenced: a student with an erasure in progress -> GET and POST both 423 fenced, no student data, nothing written", async () => {
  const rt = await fresh();
  const get = await getApprovalView(rt, DEMO_THREADS.fenced);
  assert.equal(get.status, 423);
  assert.deepEqual(ApprovalViewSchema.parse(get.body), { state: "fenced", threadId: DEMO_THREADS.fenced });
  const post = await submitDecision(rt, DEMO_THREADS.fenced, MIXED);
  assert.equal(post.status, 423);
  assert.equal(SubmitResultSchema.parse(post.body).state, "fenced");
  assert.equal(rt.readback("demo-student-2").facts.length, 0);
});

test("in_progress: a claimed thread shows in_progress; a new submit is already_resolved with the claimed decision", async () => {
  const rt = await fresh();
  const get = await getApprovalView(rt, DEMO_THREADS.inProgress);
  assert.equal(get.status, 200);
  assert.equal(ApprovalViewSchema.parse(get.body).state, "in_progress");
  const post = await submitDecision(rt, DEMO_THREADS.inProgress, {
    facts: MIXED.facts.map((f) => ({ key: f.key, decision: "reject" as const })),
    summary: "withhold",
  });
  assert.equal(post.status, 409);
  const parsed = SubmitResultSchema.parse(post.body);
  assert.equal(parsed.state, "already_resolved");
  assert.equal(rt.readback("demo-student-3").facts.length, 0);
});

test("not found and malformed thread ids", async () => {
  const rt = await fresh();
  const missing = await getApprovalView(rt, "scribe:no-such-session");
  assert.equal(missing.status, 404);
  assert.equal(ApprovalViewSchema.parse(missing.body).state, "not_found");
  assert.equal((await submitDecision(rt, "scribe:no-such-session", MIXED)).status, 404);
  for (const id of ["", "a b", "x".repeat(300), "../etc"]) {
    assert.equal((await getApprovalView(rt, id)).status, 400, id);
    assert.equal((await submitDecision(rt, id, MIXED)).status, 400, id);
  }
});

test("route handlers: GET and POST through the Next route module, JSON in and out", async () => {
  const rt = await fresh();
  setRuntimeForTests(rt);
  const params = (threadId: string) => ({ params: Promise.resolve({ threadId }) });
  const url = `http://localhost/api/approvals/${encodeURIComponent(DEMO_THREADS.paused)}`;

  const get = await GET(new Request(url), params(DEMO_THREADS.paused));
  assert.equal(get.status, 200);
  assert.equal(ApprovalViewSchema.parse(await get.json()).state, "awaiting_approval");

  const notJson = await POST(new Request(url, { method: "POST", body: "{not json" }), params(DEMO_THREADS.paused));
  assert.equal(notJson.status, 400);

  const post = await POST(
    new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(MIXED) }),
    params(DEMO_THREADS.paused),
  );
  assert.equal(post.status, 200);
  assert.equal(SubmitResultSchema.parse(await post.json()).state, "done");
  assert.equal(rt.readback("demo-student-1").facts.filter((f) => f.active).length, 3);
});

test("runtime mode: demo unless VC_WEB_MODE is exactly 'live' (a typo never reaches the production server)", () => {
  assert.equal(resolveMode({}), "demo");
  assert.equal(resolveMode({ VC_WEB_MODE: "demo" }), "demo");
  assert.equal(resolveMode({ VC_WEB_MODE: "Live" }), "demo");
  assert.equal(resolveMode({ VC_WEB_MODE: "live " }), "demo");
  assert.equal(resolveMode({ VC_WEB_MODE: "live" }), "live");
});
