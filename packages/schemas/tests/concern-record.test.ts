import { test } from "node:test";
import assert from "node:assert/strict";
import { ConcernRecordSchema } from "../src/schemas.js";

// T-022 / D-020 / B20: the typed concern record (the surface T-012 reads). Synthetic data only (B13).

const valid = {
  concernId: "session-x:t3",
  studentId: "student-x",
  sessionId: "session-x",
  level: "concern",
  reason: "Concern-level wellbeing signal flagged by the crisis guard.",
  matched: ["so much pressure i can't cope"],
  detector: "crisis-guard",
  citation: { type: "transcript", quote: "so much pressure I can't cope", turnId: "t3" },
};

test("ConcernRecord: a cited concern parses", () => {
  assert.deepEqual(ConcernRecordSchema.parse(valid), valid);
});

test("ConcernRecord: no citation quote (B2) is rejected", () => {
  assert.throws(() => ConcernRecordSchema.parse({ ...valid, citation: { type: "transcript", quote: "", turnId: "t3" } }));
  assert.throws(() => ConcernRecordSchema.parse({ ...valid, citation: undefined }));
});

test("ConcernRecord: an unknown level or an empty matched list is rejected", () => {
  assert.throws(() => ConcernRecordSchema.parse({ ...valid, level: "mild" }));
  assert.throws(() => ConcernRecordSchema.parse({ ...valid, matched: [] }));
});

test("ConcernRecord: concernId must be sessionId:turnId (deterministic, replay-idempotent)", () => {
  assert.throws(() => ConcernRecordSchema.parse({ ...valid, concernId: "session-x:t9" }));
});

test("ConcernRecord: extra fields (e.g. a timestamp or a script) are rejected", () => {
  assert.throws(() => ConcernRecordSchema.parse({ ...valid, say: "Tell the student to calm down" }));
});
