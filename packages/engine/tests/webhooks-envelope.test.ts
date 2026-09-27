/**
 * T-027 (B21 signed webhooks, D-021, core only): the event envelope + per-type payload schemas.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  WebhookEventSchema,
  WebhookFactSourceSchema,
} from "../src/webhooks/schemas.js";

function baseEnvelope() {
  return {
    id: "evt-1",
    occurredAt: "2026-09-26T10:00:00.000Z",
    tenantId: "tenant-pathlynks",
  };
}

test("a valid fact.approved event (unedited, transcript-sourced fact) parses", () => {
  const event = {
    ...baseEnvelope(),
    type: "fact.approved",
    data: {
      sessionId: "session-1",
      studentId: "student-1",
      fact: {
        key: "targetCountry",
        value: "Canada",
        source: { type: "transcript", quote: "I want to go to Canada", turnId: "turn-3" },
        confidence: 0.9,
        purposeTags: ["profile_synthesis"],
        sensitivity: "low",
      },
    },
  };
  const result = WebhookEventSchema.safeParse(event);
  assert.equal(result.success, true);
});

test("a valid fact.approved event for a counsellor-edited fact carries counsellor-edit source + editedFrom (B2)", () => {
  const event = {
    ...baseEnvelope(),
    type: "fact.approved",
    data: {
      sessionId: "session-1",
      studentId: "student-1",
      fact: {
        key: "budget_inr_per_year",
        value: 1_200_000,
        source: {
          type: "counsellor-edit",
          counsellorId: "counsellor-9",
          editedAt: "2026-09-26T10:05:00.000Z",
          editedFrom: { type: "transcript", quote: "around 10-12 lakh a year", turnId: "turn-5" },
        },
        confidence: 1,
        purposeTags: ["profile_synthesis"],
        sensitivity: "medium",
      },
    },
  };
  const result = WebhookEventSchema.safeParse(event);
  assert.equal(result.success, true);
  if (result.success && result.data.type === "fact.approved") {
    assert.equal(result.data.data.fact.source.type, "counsellor-edit");
  }
});

test("a counsellor-edit source missing editedFrom is rejected", () => {
  const result = WebhookFactSourceSchema.safeParse({
    type: "counsellor-edit",
    counsellorId: "counsellor-9",
    editedAt: "2026-09-26T10:05:00.000Z",
  });
  assert.equal(result.success, false);
});

test("a valid erasure.requested event parses", () => {
  const event = {
    ...baseEnvelope(),
    type: "erasure.requested",
    data: {
      requestId: "erase-1",
      studentId: "student-1",
      reason: "student_request",
      requestedAt: "2026-09-26T10:10:00.000Z",
    },
  };
  const result = WebhookEventSchema.safeParse(event);
  assert.equal(result.success, true);
});

test("a valid concern.flagged event parses", () => {
  const event = {
    ...baseEnvelope(),
    type: "concern.flagged",
    data: {
      sessionId: "session-1",
      studentId: "student-1",
      turnId: "turn-7",
      matched: ["bahut tension hai"],
      message: "student expressed heightened stress",
    },
  };
  const result = WebhookEventSchema.safeParse(event);
  assert.equal(result.success, true);
});

test("an unknown event type is rejected", () => {
  const event = {
    ...baseEnvelope(),
    type: "fact.rejected",
    data: {},
  };
  const result = WebhookEventSchema.safeParse(event);
  assert.equal(result.success, false);
});

test("an event missing tenantId is rejected", () => {
  const event = {
    id: "evt-1",
    occurredAt: "2026-09-26T10:00:00.000Z",
    type: "erasure.requested",
    data: {
      requestId: "erase-1",
      studentId: "student-1",
      reason: "student_request",
      requestedAt: "2026-09-26T10:10:00.000Z",
    },
  };
  const result = WebhookEventSchema.safeParse(event);
  assert.equal(result.success, false);
});

test("an event with an empty id (idempotency key) is rejected", () => {
  const event = {
    id: "",
    occurredAt: "2026-09-26T10:00:00.000Z",
    tenantId: "tenant-pathlynks",
    type: "erasure.requested",
    data: {
      requestId: "erase-1",
      studentId: "student-1",
      reason: "student_request",
      requestedAt: "2026-09-26T10:10:00.000Z",
    },
  };
  const result = WebhookEventSchema.safeParse(event);
  assert.equal(result.success, false);
});
