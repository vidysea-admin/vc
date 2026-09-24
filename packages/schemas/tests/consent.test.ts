import { test } from "node:test";
import assert from "node:assert/strict";
import { ConsentSchema } from "../src/schemas.js";

function validAdultConsent() {
  return {
    studentId: "student-1",
    guardianConsent: false,
    purposes: ["counselling"],
    recordedAt: "2026-09-25T00:00:00.000Z",
    minor: false,
  };
}

test("an adult's consent without guardianConsent parses", () => {
  assert.doesNotThrow(() => ConsentSchema.parse(validAdultConsent()));
});

test("a minor's consent WITH guardianConsent parses", () => {
  const ok = { ...validAdultConsent(), minor: true, guardianConsent: true };
  assert.doesNotThrow(() => ConsentSchema.parse(ok));
});

test("a minor's consent without guardianConsent is rejected", () => {
  const bad = { ...validAdultConsent(), minor: true, guardianConsent: false };
  assert.throws(() => ConsentSchema.parse(bad));
});
