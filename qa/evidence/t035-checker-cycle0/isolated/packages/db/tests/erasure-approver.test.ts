/**
 * T-029 (B15, gate erasure-fencing answered 2026-09-26): the erasure approver workflow.
 *
 *   request -> confirm (1st, fence + token) -> reconfirm (2nd, token, HMAC pseudonym, outbox)
 *           -> approve (approver) -> executeErasure        | reject / expiry: nothing purged
 *   autoDelete: reconfirm -> approved (approver skipped)
 *
 * Scenario rows (qa/scenarios/counselling-engine.csv): SC-028, SC-029, SC-030, SC-031, SC-033 here;
 * SC-032 / SC-034 by the existing D-015 tests (erasure.test.ts). Fake Mongo only; every id, key and
 * address is synthetic.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Db } from "mongodb";
import {
  AUTO_DELETE_APPROVER,
  ERASURE_APPROVAL_TTL_MS,
  ERASURE_CONFIRM_TOKEN_TTL_MS,
  ERASURE_FENCE_GRACE_MS,
  ERASURE_PLAN,
  ErasureConfigError,
  ErasureConfirmTokenError,
  ErasureExpiredError,
  ErasureNotApprovedError,
  ErasureNotConfirmedError,
  ErasureStateError,
  StudentFencedError,
  approveErasure,
  auditPseudonym,
  confirmErasure,
  erasureConfigFromEnv,
  erasureOutboxId,
  erasureRequestMatchesStudent,
  executeErasure,
  isStudentFenced,
  reconfirmErasure,
  rejectErasure,
  releaseExpiredErasureFences,
  requestErasure,
  type ErasureRequestDoc,
  type ErasureWorkflowConfig,
} from "../src/erasure.js";
import { applyApprovedDiff, recordSessionTranscript } from "../src/facts.js";
import { COLLECTION_NAMES } from "../src/collections.js";
import { tenantScopedDb } from "../src/tenant.js";
import { INDEX_PLAN } from "../scripts/db-init.js";
import { createFakeDb, type FakeDb } from "./fakes.js";
import { TEST_ERASURE_CONFIG } from "../src/testing.js";
import type { Fact } from "@vc/schemas";

type AnyDoc = { _id: string } & Record<string, unknown>;

const NOW = "2026-09-26T10:00:00.000Z";
const CONFIG: ErasureWorkflowConfig = TEST_ERASURE_CONFIG;
const AUTO: ErasureWorkflowConfig = { auditHmacKey: TEST_ERASURE_CONFIG.auditHmacKey, autoDelete: true };
const STUDENT_COLLECTIONS = [...new Set(ERASURE_PLAN.map((s) => s.collection))];
const ALL = [...new Set([...Object.values(COLLECTION_NAMES), ...STUDENT_COLLECTIONS])];

function setup() {
  const { db, fakeDb } = createFakeDb();
  for (const spec of INDEX_PLAN) {
    if (!spec.unique) continue;
    fakeDb.collection<{ _id: string }>(spec.collection).declareUniqueIndex(Object.keys(spec.keys), {
      partialFilterExpression: spec.partialFilterExpression,
    });
  }
  return { db, fakeDb, a: tenantScopedDb(db, "tenantA"), b: tenantScopedDb(db, "tenantB") };
}

function raw(fakeDb: FakeDb, name: string): AnyDoc[] {
  return fakeDb.collection<AnyDoc>(name).all();
}

/** The student-data collections of one tenant, deep-copied and sorted (byte-comparable). */
function studentData(fakeDb: FakeDb, tenant: string): string {
  const out: Record<string, AnyDoc[]> = {};
  for (const name of STUDENT_COLLECTIONS) {
    out[name] = raw(fakeDb, name)
      .filter((d) => d.tenantId === tenant)
      .map((d) => JSON.parse(JSON.stringify(d)) as AnyDoc)
      .sort((x, y) => x._id.localeCompare(y._id));
  }
  return JSON.stringify(out);
}

function fact(key: string, value: unknown, turnId: string): Fact {
  return {
    key,
    value,
    source: { type: "transcript", quote: `quote ${String(value)}`, turnId },
    confidence: 0.9,
    validFrom: "2026-09-25T00:00:00.000Z",
    purposeTags: ["profile_synthesis"],
    sensitivity: "medium",
  } as Fact;
}

/** One synthetic student in one tenant across every engine collection, incl. transcripts and a concern_flagged edge. */
async function seedStudent(scoped: Db, studentId: string, marker: string) {
  const sessionId = `${studentId}-sess-1`;
  await scoped.collection(COLLECTION_NAMES.students).insertOne({ _id: studentId, studentId, createdAt: NOW });
  await scoped.collection(COLLECTION_NAMES.sessions).insertOne({ _id: sessionId, sessionId, studentId, startedAt: NOW, scribeThreadIds: [`scribe:${sessionId}`] });
  await scoped.collection(COLLECTION_NAMES.consents).insertOne({
    _id: `consent-${studentId}`,
    studentId,
    guardianConsent: true,
    purposes: ["profile_synthesis"],
    recordedAt: NOW,
    minor: true,
  });
  await scoped.collection(COLLECTION_NAMES.decisions).insertOne({ _id: `decision-${studentId}`, studentId, rationale: marker, decidedAt: NOW });
  const diff = { studentId, summary: marker, changes: [], citedFactIds: [] };
  await applyApprovedDiff(scoped, diff, { approve: true, edits: [fact("targetCountry", `${marker}-Canada`, "t1")] }, sessionId);
  await recordSessionTranscript(scoped, {
    sessionId,
    studentId,
    turns: [
      { turnId: "t1", speaker: "student", lang: "en", text: `I feel hopeless ${marker}`, translatedText: `I feel hopeless ${marker}`, ts: 1 },
      { turnId: "t2", speaker: "counsellor", lang: "en", text: `Noted ${marker}`, translatedText: `Noted ${marker}`, ts: 2 },
    ],
  });
  // T-022's concern edge: student --concern_flagged--> transcript_turn (engine graph.ts CONCERN_EDGE_REL).
  await scoped.collection(COLLECTION_NAMES.edges).insertOne({
    _id: `concern:${studentId}:${sessionId}:t1`,
    from: { kind: "student", id: studentId },
    to: { kind: "transcript_turn", id: `${sessionId}:t1` },
    rel: "concern_flagged",
    createdAt: NOW,
    concern: { studentId, sessionId, level: "concern", quote: `hopeless ${marker}` },
  });
  const threadId = `scribe:${sessionId}`;
  await scoped.collection(COLLECTION_NAMES.scribe_resolutions).insertOne({ _id: threadId, threadId, studentId, responseHash: `h-${marker}`, claimedAt: NOW });
  await scoped.collection("scribe_checkpoints").insertOne({ _id: `${threadId}|c1`, thread_id: threadId, checkpoint_ns: "", checkpoint_id: "c1", checkpoint: marker });
  await scoped.collection("scribe_checkpoint_writes").insertOne({ _id: `${threadId}|c1|w`, thread_id: threadId, checkpoint_ns: "", checkpoint_id: "c1", task_id: "x", idx: 0, value: marker });
  return { studentId, sessionId };
}

async function world() {
  const s = setup();
  await seedStudent(s.a, "stu-1", "MARK-A");
  await seedStudent(s.b, "stu-1", "MARK-B"); // T-025: the SAME studentId in another tenant
  return s;
}

async function row(scoped: Db, requestId: string): Promise<ErasureRequestDoc> {
  return (await scoped.collection<ErasureRequestDoc>(COLLECTION_NAMES.erasure_requests).findOne({ _id: requestId }))!;
}

async function open(scoped: Db, studentId = "stu-1") {
  const { requestId } = await requestErasure(scoped, { studentId, requestedBy: "counsellor-7", reason: "student_request" });
  return requestId;
}

/** A write for the student through a real fence-aware writer. */
async function tryWrite(scoped: Db, studentId: string, tag: string) {
  const diff = { studentId, summary: tag, changes: [], citedFactIds: [] };
  return applyApprovedDiff(scoped, diff, { approve: true, edits: [fact(`k-${tag}`, `v-${tag}`, "t9")] }, `${studentId}-sess-new`);
}

// ---------------------------------------------------------------------------
// SC-028 / SC-029: no single call, and no confirmation without approval, purges
// ---------------------------------------------------------------------------

test("SC-028 T029-A1: request alone and ONE confirmation purge nothing (every student collection byte-identical, both tenants)", async () => {
  const { a, fakeDb } = await world();
  const beforeA = studentData(fakeDb, "tenantA");
  const beforeB = studentData(fakeDb, "tenantB");
  const requestId = await open(a);
  await assert.rejects(executeErasure(a, requestId), ErasureNotConfirmedError);
  const first = await confirmErasure(a, { requestId, confirmedBy: "counsellor-7" });
  assert.equal((await row(a, requestId)).status, "confirmed");
  assert.ok(typeof first.confirmToken === "string" && first.confirmToken.length >= 40, "a fresh, high-entropy token");
  await assert.rejects(executeErasure(a, requestId), ErasureNotConfirmedError);
  assert.equal(studentData(fakeDb, "tenantA"), beforeA);
  assert.equal(studentData(fakeDb, "tenantB"), beforeB);
  // The token is never stored in clear.
  assert.ok(!JSON.stringify(raw(fakeDb, COLLECTION_NAMES.erasure_requests)).includes(first.confirmToken));
  // Each first confirmation hands out a different token (fresh per request).
  const { b } = setup();
  await seedStudent(b, "stu-9", "M9");
  const other = await confirmErasure(b, { requestId: await open(b, "stu-9"), confirmedBy: "counsellor-7" });
  assert.notEqual(other.confirmToken, first.confirmToken);
});

test("SC-029 T029-A2: two confirmations with no approver purge nothing; the approval request is in the outbox (no studentId), addressed to the configured approver", async () => {
  const { a, fakeDb } = await world();
  const beforeA = studentData(fakeDb, "tenantA");
  const requestId = await open(a);
  const { confirmToken } = await confirmErasure(a, { requestId, confirmedBy: "counsellor-7" });
  const out = await reconfirmErasure(a, { requestId, confirmedBy: "counsellor-7", confirmToken }, CONFIG);
  assert.equal(out.status, "awaiting_approval");
  assert.equal(out.outboxId, erasureOutboxId(requestId));
  await assert.rejects(executeErasure(a, requestId), ErasureNotApprovedError);
  assert.equal(studentData(fakeDb, "tenantA"), beforeA, "nothing purged without the approver");
  const r = await row(a, requestId);
  assert.equal(r.status, "awaiting_approval");
  assert.equal(r.secondConfirmedBy, "counsellor-7");
  assert.equal(r.confirmTokenHash, undefined, "the token is spent");
  const outbox = raw(fakeDb, COLLECTION_NAMES.email_outbox);
  assert.equal(outbox.length, 1);
  const mail = outbox[0]!;
  assert.equal(mail.to, "approver@synthetic.test");
  assert.equal(mail.kind, "erasure_approval_request");
  assert.equal(mail.status, "queued");
  assert.equal(mail.requestId, requestId);
  assert.equal(mail.tenantId, "tenantA", "tenant-stamped like every scoped write");
  for (const needle of ["stu-1", "MARK-A", "hopeless"]) assert.ok(!JSON.stringify(mail).includes(needle), `outbox leaks ${needle}`);
  assert.equal(mail.studentId, undefined);
});

// ---------------------------------------------------------------------------
// SC-030: approval -> purge, read-back zero (incl. transcripts + concern edges), tenant-scoped, HMAC
// ---------------------------------------------------------------------------

test("SC-030 T029-A3: after the approver approves, the purge runs: read-back ZERO for the student in every collection (session_transcripts, concern_flagged edges included); tenant B's same studentId untouched; HMAC receipt row", async () => {
  const { a, b, fakeDb } = await world();
  const beforeB = studentData(fakeDb, "tenantB");
  assert.ok(raw(fakeDb, COLLECTION_NAMES.session_transcripts).some((d) => d.tenantId === "tenantA"), "sanity: A has transcripts");
  assert.ok(raw(fakeDb, COLLECTION_NAMES.edges).some((d) => d.tenantId === "tenantA" && d.rel === "concern_flagged"), "sanity: A has a concern edge");
  const requestId = await open(a);
  const { confirmToken } = await confirmErasure(a, { requestId, confirmedBy: "counsellor-7" });
  await reconfirmErasure(a, { requestId, confirmedBy: "counsellor-7", confirmToken }, CONFIG);
  await approveErasure(a, { requestId, approvedBy: "approver-1" });
  assert.equal((await row(a, requestId)).status, "approved");
  const outcome = await executeErasure(a, requestId);
  assert.equal(outcome.status, "completed");
  assert.equal(outcome.receipt.verified, true);
  assert.equal(outcome.receipt.totalRemaining, 0);
  for (const name of STUDENT_COLLECTIONS) {
    const left = raw(fakeDb, name).filter((d) => d.tenantId === "tenantA");
    assert.deepEqual(left, [], `${name}: tenant A's student data is gone`);
  }
  assert.equal(studentData(fakeDb, "tenantB"), beforeB, "tenant B's same studentId is byte-for-byte untouched");
  assert.equal(await isStudentFenced(b, "stu-1"), false, "B is never fenced by A");
  const done = await row(a, requestId);
  assert.equal(done.status, "completed");
  assert.equal(done.approvedBy, "approver-1");
  assert.equal(done.studentId, undefined);
  assert.equal(done.hashScheme, "hmac-sha256(VC_AUDIT_HMAC_KEY, vc-erasure-v2|salt|studentId)");
  const expected = createHmac("sha256", CONFIG.auditHmacKey).update(`vc-erasure-v2|${done.hashSalt}|stu-1`).digest("hex");
  assert.equal(done.studentHash, expected, "the pseudonym is exactly HMAC-SHA256(key, tag|salt|studentId)");
  assert.equal(erasureRequestMatchesStudent(done, "stu-1", CONFIG.auditHmacKey), true);
  assert.equal(erasureRequestMatchesStudent(done, "stu-2", CONFIG.auditHmacKey), false);
  for (const d of [...raw(fakeDb, COLLECTION_NAMES.erasure_requests), ...raw(fakeDb, COLLECTION_NAMES.erasure_fences)]) {
    for (const needle of ["stu-1", "MARK-A"]) assert.ok(!JSON.stringify(d).includes(needle), `audit/fence leaks ${needle}`);
  }
});

test("T029-A6: 50k-candidate dictionary recovery of the audit pseudonym FAILS without the key (sha256 over the same input, the old v1 scheme, an empty key and guessed keys all miss); with the key it finds exactly the real id", async () => {
  const { a } = await world();
  const requestId = await open(a, "stu-1");
  const { confirmToken } = await confirmErasure(a, { requestId, confirmedBy: "counsellor-7" });
  await reconfirmErasure(a, { requestId, confirmedBy: "counsellor-7", confirmToken }, CONFIG);
  const r = await row(a, requestId);
  const target = r.studentHash!;
  const candidates = Array.from({ length: 50_000 }, (_, i) => `stu-${i}`); // includes the real "stu-1"
  assert.ok(candidates.includes("stu-1"));
  const attacks: Array<[string, (c: string) => string]> = [
    ["sha256(v2 input)", (c) => createHash("sha256").update(`vc-erasure-v2|${r.hashSalt}|${c}`).digest("hex")],
    ["sha256(v1 input)", (c) => createHash("sha256").update(`vc-erasure-v1|${r.hashSalt}|${c}`).digest("hex")],
    ["hmac(empty key)", (c) => createHmac("sha256", "").update(`vc-erasure-v2|${r.hashSalt}|${c}`).digest("hex")],
    ["hmac(guessed key)", (c) => createHmac("sha256", "changeme-changeme-changeme-changeme").update(`vc-erasure-v2|${r.hashSalt}|${c}`).digest("hex")],
    ["hmac(salt as key)", (c) => createHmac("sha256", r.hashSalt).update(`vc-erasure-v2|${r.hashSalt}|${c}`).digest("hex")],
  ];
  for (const [name, attack] of attacks) {
    const hits = candidates.filter((c) => attack(c) === target);
    assert.deepEqual(hits, [], `${name}: no candidate recovered without the key`);
  }
  const withKey = candidates.filter((c) => auditPseudonym(CONFIG.auditHmacKey, r.hashSalt, c) === target);
  assert.deepEqual(withKey, ["stu-1"], "control: the key holder recovers exactly the real id");
});

// ---------------------------------------------------------------------------
// SC-031: autoDelete skips the approver (and the default is false)
// ---------------------------------------------------------------------------

test("SC-031 T029-A4: autoDelete=true skips the approver after the double confirmation (no outbox record) and the purge completes; the default is false", async () => {
  const { a, fakeDb } = await world();
  const requestId = await open(a);
  const { confirmToken } = await confirmErasure(a, { requestId, confirmedBy: "counsellor-7" });
  const out = await reconfirmErasure(a, { requestId, confirmedBy: "counsellor-7", confirmToken }, AUTO);
  assert.equal(out.status, "approved");
  assert.equal(raw(fakeDb, COLLECTION_NAMES.email_outbox).length, 0, "no approval request under autoDelete");
  const r = await row(a, requestId);
  assert.equal(r.approvedBy, AUTO_DELETE_APPROVER);
  const outcome = await executeErasure(a, requestId);
  assert.equal(outcome.receipt.verified, true);
  for (const name of STUDENT_COLLECTIONS) assert.deepEqual(raw(fakeDb, name).filter((d) => d.tenantId === "tenantA"), [], name);
  // Default: autoDelete false when VC_ERASURE_AUTO_DELETE is unset or empty.
  const env = { VC_AUDIT_HMAC_KEY: CONFIG.auditHmacKey, VC_ERASURE_APPROVER_EMAIL: "approver@synthetic.test" };
  assert.equal(erasureConfigFromEnv(env).autoDelete, false);
  assert.equal(erasureConfigFromEnv({ ...env, VC_ERASURE_AUTO_DELETE: "" }).autoDelete, false);
  assert.equal(erasureConfigFromEnv({ ...env, VC_ERASURE_AUTO_DELETE: "true" }).autoDelete, true);
  // autoDelete=true needs no approver address.
  assert.equal(erasureConfigFromEnv({ VC_AUDIT_HMAC_KEY: CONFIG.auditHmacKey, VC_ERASURE_AUTO_DELETE: "true" }).autoDelete, true);
});

// ---------------------------------------------------------------------------
// Config: a missing key is an error, never a fallback
// ---------------------------------------------------------------------------

test("T029-A7: a missing / short VC_AUDIT_HMAC_KEY, a bad autoDelete value or a missing approver address is ErasureConfigError; the reconfirm then writes NOTHING (no unkeyed fallback)", async () => {
  const email = { VC_ERASURE_APPROVER_EMAIL: "approver@synthetic.test" };
  assert.throws(() => erasureConfigFromEnv({ ...email }), ErasureConfigError);
  assert.throws(() => erasureConfigFromEnv({ ...email, VC_AUDIT_HMAC_KEY: "short-key" }), ErasureConfigError);
  assert.throws(() => erasureConfigFromEnv({ ...email, VC_AUDIT_HMAC_KEY: CONFIG.auditHmacKey, VC_ERASURE_AUTO_DELETE: "yes" }), ErasureConfigError);
  assert.throws(() => erasureConfigFromEnv({ VC_AUDIT_HMAC_KEY: CONFIG.auditHmacKey }), ErasureConfigError, "approver required while autoDelete is false");
  assert.throws(() => auditPseudonym("", "salt", "stu-1"), ErasureConfigError);
  assert.throws(() => auditPseudonym(undefined as unknown as string, "salt", "stu-1"), ErasureConfigError);

  const { a, fakeDb } = await world();
  const requestId = await open(a);
  const { confirmToken } = await confirmErasure(a, { requestId, confirmedBy: "counsellor-7" });
  const before = JSON.stringify([raw(fakeDb, COLLECTION_NAMES.erasure_requests), raw(fakeDb, COLLECTION_NAMES.email_outbox)]);
  const bads = [
    { ...CONFIG, auditHmacKey: "" },
    { ...CONFIG, auditHmacKey: undefined },
    { auditHmacKey: CONFIG.auditHmacKey, autoDelete: false },
  ] as unknown as ErasureWorkflowConfig[];
  for (const bad of bads) {
    await assert.rejects(reconfirmErasure(a, { requestId, confirmedBy: "counsellor-7", confirmToken }, bad), ErasureConfigError);
  }
  assert.equal(JSON.stringify([raw(fakeDb, COLLECTION_NAMES.erasure_requests), raw(fakeDb, COLLECTION_NAMES.email_outbox)]), before, "nothing written");
  const r = await row(a, requestId);
  assert.equal(r.status, "confirmed");
  assert.equal(r.studentHash, undefined, "no unkeyed hash was written as a fallback");
  // The same token still works once configured.
  assert.equal((await reconfirmErasure(a, { requestId, confirmedBy: "counsellor-7", confirmToken }, CONFIG)).status, "awaiting_approval");
});

// ---------------------------------------------------------------------------
// The second confirmation's token
// ---------------------------------------------------------------------------

test("T029-A8: the second confirmation needs the first confirmer AND their unused token; wrong / other actor / reused tokens change nothing; an expired token closes the request as expired, purging nothing", async () => {
  const { a, fakeDb } = await world();
  const requestId = await open(a);
  const t0 = new Date(Date.parse("2026-09-26T10:00:00.000Z"));
  const { confirmToken, confirmTokenExpiresAt } = await confirmErasure(a, { requestId, confirmedBy: "counsellor-7" }, { now: t0 });
  assert.equal(Date.parse(confirmTokenExpiresAt), t0.getTime() + ERASURE_CONFIRM_TOKEN_TTL_MS);
  const snap = () => JSON.stringify(raw(fakeDb, COLLECTION_NAMES.erasure_requests));
  const before = snap();
  await assert.rejects(reconfirmErasure(a, { requestId, confirmedBy: "counsellor-7", confirmToken: "wrong" }, CONFIG, { now: t0 }), ErasureConfirmTokenError);
  await assert.rejects(reconfirmErasure(a, { requestId, confirmedBy: "counsellor-7", confirmToken: "" }, CONFIG, { now: t0 }), ErasureConfirmTokenError);
  await assert.rejects(reconfirmErasure(a, { requestId, confirmedBy: "admin-9", confirmToken }, CONFIG, { now: t0 }), ErasureConfirmTokenError);
  assert.equal(snap(), before, "refusals change nothing");
  // The right actor, case/space-insensitively, with the token: accepted once.
  await reconfirmErasure(a, { requestId, confirmedBy: " Counsellor-7 ", confirmToken }, CONFIG, { now: t0 });
  await assert.rejects(reconfirmErasure(a, { requestId, confirmedBy: "counsellor-7", confirmToken }, CONFIG, { now: t0 }), ErasureStateError, "single use");

  // Expiry: a second request (another student) whose token lapses.
  await seedStudent(a, "stu-2", "MARK-2");
  const before2 = studentData(fakeDb, "tenantA");
  const r2 = await open(a, "stu-2");
  const c2 = await confirmErasure(a, { requestId: r2, confirmedBy: "counsellor-7" }, { now: t0 });
  assert.equal(await isStudentFenced(a, "stu-2"), true);
  const late = new Date(t0.getTime() + ERASURE_CONFIRM_TOKEN_TTL_MS + 1);
  await assert.rejects(reconfirmErasure(a, { requestId: r2, confirmedBy: "counsellor-7", confirmToken: c2.confirmToken }, CONFIG, { now: late }), ErasureExpiredError);
  const expired = await row(a, r2);
  assert.equal(expired.status, "expired");
  assert.equal(expired.studentId, undefined, "the clear id is gone from a closed row");
  assert.ok(expired.studentHash, "the HMAC pseudonym was written before the clear id was unset");
  assert.equal(await isStudentFenced(a, "stu-2"), false, "nothing was purged, so the fence is dropped");
  assert.equal(studentData(fakeDb, "tenantA"), before2, "an expired request purged nothing");
  await assert.rejects(executeErasure(a, r2), ErasureNotConfirmedError);
});

// ---------------------------------------------------------------------------
// Reject and approval expiry: nothing purged
// ---------------------------------------------------------------------------

test("T029-A9: the approver REJECTS -> nothing purged, the request can never execute or be approved, the fence is released at once (writes work again)", async () => {
  const { a, fakeDb } = await world();
  const beforeA = studentData(fakeDb, "tenantA");
  const requestId = await open(a);
  const { confirmToken } = await confirmErasure(a, { requestId, confirmedBy: "counsellor-7" });
  await reconfirmErasure(a, { requestId, confirmedBy: "counsellor-7", confirmToken }, CONFIG);
  await assert.rejects(tryWrite(a, "stu-1", "during"), StudentFencedError);
  await rejectErasure(a, { requestId, rejectedBy: "approver-1" });
  const r = await row(a, requestId);
  assert.equal(r.status, "rejected");
  assert.equal(r.rejectedBy, "approver-1");
  assert.equal(r.studentId, undefined);
  assert.equal(studentData(fakeDb, "tenantA"), beforeA, "a rejected request purged nothing");
  await assert.rejects(executeErasure(a, requestId), ErasureStateError);
  await assert.rejects(approveErasure(a, { requestId, approvedBy: "approver-1" }), ErasureStateError);
  await assert.rejects(rejectErasure(a, { requestId, rejectedBy: "approver-1" }), ErasureStateError);
  assert.equal(await isStudentFenced(a, "stu-1"), false);
  const res = await tryWrite(a, "stu-1", "after-reject");
  assert.equal(res.written.length, 1, "writes are allowed again");
  // A new request can be opened (the rejected one is closed).
  assert.ok(await open(a));
});

test("T029-A10: an approval request that expires unanswered purges nothing: approve after expiry is ErasureExpiredError; the sweep (with the key) closes an abandoned one and drops its fence, without the key it keeps it", async () => {
  const { a, fakeDb, db } = await world();
  const beforeA = studentData(fakeDb, "tenantA");
  const t0 = new Date(Date.parse("2026-09-26T10:00:00.000Z"));
  const requestId = await open(a);
  const { confirmToken } = await confirmErasure(a, { requestId, confirmedBy: "counsellor-7" }, { now: t0 });
  const out = await reconfirmErasure(a, { requestId, confirmedBy: "counsellor-7", confirmToken }, CONFIG, { now: t0 });
  assert.equal(Date.parse(out.approvalExpiresAt!), t0.getTime() + ERASURE_APPROVAL_TTL_MS);
  const late = new Date(t0.getTime() + ERASURE_APPROVAL_TTL_MS + 1);
  await assert.rejects(approveErasure(a, { requestId, approvedBy: "approver-1" }, { now: late }), ErasureExpiredError);
  assert.equal((await row(a, requestId)).status, "expired");
  assert.equal(studentData(fakeDb, "tenantA"), beforeA);
  assert.equal(await isStudentFenced(a, "stu-1"), false);

  // An abandoned one, found by the sweep.
  const r2 = await open(a);
  const c2 = await confirmErasure(a, { requestId: r2, confirmedBy: "counsellor-7" }, { now: t0 });
  await reconfirmErasure(a, { requestId: r2, confirmedBy: "counsellor-7", confirmToken: c2.confirmToken }, CONFIG, { now: t0 });
  assert.equal(await releaseExpiredErasureFences(db, late), 0, "without the key the sweep never closes it (fail safe)");
  assert.equal((await row(a, r2)).status, "awaiting_approval");
  assert.equal(await releaseExpiredErasureFences(db, late, ERASURE_FENCE_GRACE_MS, { auditHmacKey: CONFIG.auditHmacKey }), 1);
  assert.equal((await row(a, r2)).status, "expired");
  assert.equal(await isStudentFenced(a, "stu-1", late), false);
  assert.equal(studentData(fakeDb, "tenantA"), beforeA, "nothing purged");
});

// ---------------------------------------------------------------------------
// SC-033: the fence from the first confirmation until completion + 24h; re-enrolment after
// ---------------------------------------------------------------------------

test("SC-033 T029-A5: writes are refused from the FIRST confirmation, through the approval wait, until completion + 24h; after the hold re-enrolment works", async () => {
  const { a, db } = await world();
  assert.equal(ERASURE_FENCE_GRACE_MS, 24 * 3600 * 1000);
  const requestId = await open(a);
  assert.equal(await isStudentFenced(a, "stu-1"), false, "a pending request fences nothing");
  const { confirmToken } = await confirmErasure(a, { requestId, confirmedBy: "counsellor-7" });
  await assert.rejects(tryWrite(a, "stu-1", "after-confirm-1"), StudentFencedError);
  await reconfirmErasure(a, { requestId, confirmedBy: "counsellor-7", confirmToken }, CONFIG);
  await assert.rejects(tryWrite(a, "stu-1", "awaiting"), StudentFencedError);
  // The sweep never releases a fence while the request awaits the approver (even far in the future without the key).
  assert.equal(await releaseExpiredErasureFences(db, new Date(Date.now() + 30 * 24 * 3600 * 1000)), 0);
  await approveErasure(a, { requestId, approvedBy: "approver-1" });
  await assert.rejects(tryWrite(a, "stu-1", "approved"), StudentFencedError);
  await executeErasure(a, requestId);
  const completedAt = Date.parse((await row(a, requestId)).completedAt!);
  await assert.rejects(tryWrite(a, "stu-1", "just-after"), StudentFencedError);
  assert.equal(await isStudentFenced(a, "stu-1", new Date(completedAt + ERASURE_FENCE_GRACE_MS - 1)), true, "still fenced 1 ms before completion + 24h");
  assert.equal(await releaseExpiredErasureFences(db, new Date(completedAt + ERASURE_FENCE_GRACE_MS - 1)), 0);
  assert.equal(await releaseExpiredErasureFences(db, new Date(completedAt + ERASURE_FENCE_GRACE_MS)), 1, "released at completion + 24h");
  const res = await tryWrite(a, "stu-1", "re-enrolled");
  assert.equal(res.written.length, 1, "re-enrolment after the hold is allowed");
});

test("T029-A12: rejecting a NEW request inside an earlier completion's 24h grace never ends that grace early (priorReleaseAfter)", async () => {
  const { a, db } = await world();
  const r1 = await open(a);
  const c1 = await confirmErasure(a, { requestId: r1, confirmedBy: "counsellor-7" });
  await reconfirmErasure(a, { requestId: r1, confirmedBy: "counsellor-7", confirmToken: c1.confirmToken }, CONFIG);
  await approveErasure(a, { requestId: r1, approvedBy: "approver-1" });
  await executeErasure(a, r1);
  const graceEnd = Date.parse((await row(a, r1)).completedAt!) + ERASURE_FENCE_GRACE_MS;
  const r2 = await open(a);
  const c2 = await confirmErasure(a, { requestId: r2, confirmedBy: "counsellor-7" });
  await reconfirmErasure(a, { requestId: r2, confirmedBy: "counsellor-7", confirmToken: c2.confirmToken }, CONFIG);
  await rejectErasure(a, { requestId: r2, rejectedBy: "approver-1" });
  assert.equal(await isStudentFenced(a, "stu-1"), true, "the first erasure's grace still holds");
  await assert.rejects(tryWrite(a, "stu-1", "inside-grace"), StudentFencedError);
  assert.equal(await releaseExpiredErasureFences(db, new Date(graceEnd - 1)), 0);
  assert.equal(await releaseExpiredErasureFences(db, new Date(graceEnd)), 1);
});

test("T029-A13: the sweep never removes a fence while the student has a request AWAITING APPROVAL, even a fence row past its release time (planted: the fence still names an earlier completed request)", async () => {
  const { a, db } = await world();
  const r1 = await open(a);
  const c1 = await confirmErasure(a, { requestId: r1, confirmedBy: "counsellor-7" });
  await reconfirmErasure(a, { requestId: r1, confirmedBy: "counsellor-7", confirmToken: c1.confirmToken }, CONFIG);
  await approveErasure(a, { requestId: r1, approvedBy: "approver-1" });
  await executeErasure(a, r1);
  const fences = a.collection(COLLECTION_NAMES.erasure_fences);
  const [r1Fence] = await fences.find({}).toArray();
  assert.equal(r1Fence!.requestId, r1);
  assert.equal(typeof r1Fence!.releaseAfter, "string", "the completed request stamped its grace");
  const past = new Date(Date.parse(r1Fence!.releaseAfter as string) + 60_000);
  const r2 = await open(a);
  const c2 = await confirmErasure(a, { requestId: r2, confirmedBy: "counsellor-7" });
  await reconfirmErasure(a, { requestId: r2, confirmedBy: "counsellor-7", confirmToken: c2.confirmToken }, CONFIG);
  assert.equal((await row(a, r2)).status, "awaiting_approval");
  // Plant the state a lost re-arm would leave: the fence still owned by r1, its release time passed.
  await fences.updateOne({ _id: r1Fence!._id }, { $set: { requestId: r1, releaseAfter: r1Fence!.releaseAfter } });
  assert.equal(await releaseExpiredErasureFences(db, past), 0, "an awaiting_approval request fences its student");
  await rejectErasure(a, { requestId: r2, rejectedBy: "approver-1" });
  assert.equal(await releaseExpiredErasureFences(db, past), 1, "once no fencing request remains, the expired fence goes");
});

// ---------------------------------------------------------------------------
// The outbox is a record only
// ---------------------------------------------------------------------------

test("T029-A11: the outbox is a record only: erasure.ts imports no network / SMTP module and makes no fetch call", () => {
  const here = fileURLToPath(new URL(".", import.meta.url));
  const src = readFileSync(`${here}../src/erasure.ts`, "utf8");
  const imports = [...src.matchAll(/^\s*import\s[^;]*?from\s+"([^"]+)"/gms)].map((m) => m[1]);
  assert.ok(imports.length > 3, "sanity: the scanner sees the imports");
  for (const spec of imports) {
    assert.ok(!/^(node:)?(http|https|http2|net|tls|dgram|dns)$|nodemailer|smtp|undici|axios/i.test(spec!), `network import: ${spec}`);
  }
  assert.ok(!/\bfetch\s*\(/.test(src), "no fetch call");
  assert.ok(!/require\(/.test(src), "no dynamic require");
});
