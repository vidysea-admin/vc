/**
 * T-034 (B21 signed webhooks, D-021): the emission-hook builders (buildFactApprovedEvent,
 * buildErasureRequestedEvent). Pure functions — no outbox, no I/O.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildConcernFlaggedEvent, buildErasureRequestedEvent, buildFactApprovedEvent } from "../src/webhooks/schemas.js";

// ISS-t-034-concern-hook: the concern.flagged builder (B20 concern level, B21 "Events").
function baseConcern() {
  return {
    concernId: "session-1:t4",
    studentId: "student-1",
    sessionId: "session-1",
    level: "concern" as const,
    reason: "A softer distress signal was detected in the student's message.",
    matched: ["pressure"],
    detector: "crisis-guard" as const,
    citation: { type: "transcript" as const, quote: "so much pressure I can't cope", turnId: "t4" },
  };
}

test("buildConcernFlaggedEvent produces a valid concern.flagged envelope and carries no transcript quote", () => {
  const event = buildConcernFlaggedEvent({ tenantId: "tenant-pathlynks", concern: baseConcern(), occurredAt: "2026-09-27T10:00:00.000Z" });
  assert.equal(event.type, "concern.flagged");
  if (event.type !== "concern.flagged") throw new Error("unreachable");
  assert.equal(event.tenantId, "tenant-pathlynks");
  assert.deepEqual(Object.keys(event.data).sort(), ["matched", "message", "sessionId", "studentId", "turnId"]);
  assert.equal(event.data.turnId, "t4");
  assert.equal(event.data.sessionId, "session-1");
  assert.equal(event.data.studentId, "student-1");
  assert.deepEqual(event.data.matched, ["pressure"]);
  assert.equal(JSON.stringify(event).includes("can't cope"), false, "the verbatim quote must not travel");
});

test("buildConcernFlaggedEvent is idempotent per (tenant, concern) and distinct across tenants and turns", () => {
  const a = buildConcernFlaggedEvent({ tenantId: "t", concern: baseConcern(), occurredAt: "2026-09-27T10:00:00.000Z" });
  const b = buildConcernFlaggedEvent({ tenantId: "t", concern: baseConcern(), occurredAt: "2026-09-27T11:00:00.000Z" });
  assert.equal(a.id, b.id, "occurredAt must not affect the idempotency key");
  assert.notEqual(a.id, buildConcernFlaggedEvent({ tenantId: "other", concern: baseConcern() }).id);
  const c = baseConcern();
  const other = { ...c, concernId: "session-1:t5", citation: { ...c.citation, turnId: "t5" } };
  assert.notEqual(a.id, buildConcernFlaggedEvent({ tenantId: "t", concern: other }).id);
});

test("buildConcernFlaggedEvent refuses a crisis-level record (crisis escalates synchronously, not by webhook)", () => {
  assert.throws(() => buildConcernFlaggedEvent({ tenantId: "t", concern: { ...baseConcern(), level: "crisis" } }));
});

function baseFact() {
  return {
    key: "targetCountry",
    value: "Canada",
    source: { type: "transcript", quote: "I want to go to Canada", turnId: "turn-3" },
    confidence: 0.9,
    purposeTags: ["profile_synthesis"],
    sensitivity: "low",
  };
}

test("buildFactApprovedEvent produces a valid fact.approved envelope carrying the fact's own source unchanged", () => {
  const event = buildFactApprovedEvent({
    tenantId: "tenant-pathlynks",
    sessionId: "session-1",
    studentId: "student-1",
    fact: baseFact(),
    occurredAt: "2026-09-27T10:00:00.000Z",
  });
  assert.equal(event.type, "fact.approved");
  assert.equal(event.tenantId, "tenant-pathlynks");
  if (event.type !== "fact.approved") throw new Error("unreachable");
  assert.equal(event.data.sessionId, "session-1");
  assert.equal(event.data.studentId, "student-1");
  assert.equal(event.data.fact.source.type, "transcript");
});

test("buildFactApprovedEvent drops fields WebhookFactSchema does not declare (e.g. kind, explains)", () => {
  const event = buildFactApprovedEvent({
    tenantId: "tenant-pathlynks",
    sessionId: "session-1",
    studentId: "student-1",
    fact: { ...baseFact(), kind: "value", explains: undefined, extraneous: "should not survive" },
  });
  if (event.type !== "fact.approved") throw new Error("unreachable");
  assert.equal((event.data.fact as Record<string, unknown>).kind, undefined);
  assert.equal((event.data.fact as Record<string, unknown>).extraneous, undefined);
});

test("buildFactApprovedEvent throws on a malformed fact (B2: never emit an uncited/invalid shape)", () => {
  assert.throws(() => buildFactApprovedEvent({ tenantId: "t", sessionId: "s", studentId: "st", fact: { key: "x" } }));
});

test("buildFactApprovedEvent is idempotent: the SAME fact content always yields the SAME event id", () => {
  const a = buildFactApprovedEvent({ tenantId: "t", sessionId: "s", studentId: "st", fact: baseFact(), occurredAt: "2026-09-27T10:00:00.000Z" });
  const b = buildFactApprovedEvent({ tenantId: "t", sessionId: "s", studentId: "st", fact: baseFact(), occurredAt: "2026-09-27T11:30:00.000Z" });
  assert.equal(a.id, b.id, "occurredAt must not affect the idempotency key");
});

test("buildFactApprovedEvent gives a DIFFERENT id when the fact's value differs", () => {
  const a = buildFactApprovedEvent({ tenantId: "t", sessionId: "s", studentId: "st", fact: baseFact() });
  const b = buildFactApprovedEvent({ tenantId: "t", sessionId: "s", studentId: "st", fact: { ...baseFact(), value: "UK" } });
  assert.notEqual(a.id, b.id);
});

test("buildErasureRequestedEvent produces a valid erasure.requested envelope", () => {
  const event = buildErasureRequestedEvent({
    tenantId: "tenant-pathlynks",
    requestId: "req-1",
    studentId: "student-1",
    reason: "student_request",
    requestedAt: "2026-09-27T10:00:00.000Z",
  });
  assert.equal(event.type, "erasure.requested");
  if (event.type !== "erasure.requested") throw new Error("unreachable");
  assert.equal(event.data.requestId, "req-1");
  assert.equal(event.occurredAt, "2026-09-27T10:00:00.000Z");
});

test("buildErasureRequestedEvent is idempotent by (tenantId, requestId) alone", () => {
  const a = buildErasureRequestedEvent({
    tenantId: "t",
    requestId: "req-1",
    studentId: "student-1",
    reason: "student_request",
    requestedAt: "2026-09-27T10:00:00.000Z",
  });
  const b = buildErasureRequestedEvent({
    tenantId: "t",
    requestId: "req-1",
    studentId: "student-1",
    reason: "student_request",
    requestedAt: "2026-09-27T11:00:00.000Z",
  });
  assert.equal(a.id, b.id);
});
