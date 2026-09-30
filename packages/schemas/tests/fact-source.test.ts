import { test } from "node:test";
import assert from "node:assert/strict";
import { FactSourceSchema } from "../src/schemas.js";

// ISS-009: FactSourceSchema is a discriminated union on `type`. Each variant
// requires the fields that make it an actual, traceable citation.

test("transcript: quote + turnId parses", () => {
  assert.doesNotThrow(() =>
    FactSourceSchema.parse({ type: "transcript", quote: "I want to study in Canada", turnId: "42" }),
  );
});

test("transcript: missing quote is rejected", () => {
  assert.throws(() => FactSourceSchema.parse({ type: "transcript", turnId: "42" }));
});

test("transcript: missing turnId is rejected", () => {
  assert.throws(() => FactSourceSchema.parse({ type: "transcript", quote: "I want to study in Canada" }));
});

test("kb: id + fetchedAt (datetime) parses", () => {
  assert.doesNotThrow(() =>
    FactSourceSchema.parse({ type: "kb", id: "univ-123", fetchedAt: "2026-09-25T00:00:00.000Z" }),
  );
});

test("kb: missing id is rejected", () => {
  assert.throws(() => FactSourceSchema.parse({ type: "kb", fetchedAt: "2026-09-25T00:00:00.000Z" }));
});

test("kb: missing fetchedAt is rejected", () => {
  assert.throws(() => FactSourceSchema.parse({ type: "kb", id: "univ-123" }));
});

test("kb: a non-datetime fetchedAt is rejected", () => {
  assert.throws(() => FactSourceSchema.parse({ type: "kb", id: "univ-123", fetchedAt: "banana" }));
});

test("profile: id parses", () => {
  assert.doesNotThrow(() => FactSourceSchema.parse({ type: "profile", id: "fact-9" }));
});

test("profile: missing id is rejected", () => {
  assert.throws(() => FactSourceSchema.parse({ type: "profile" }));
});

test("student-direct: id (the answer record) parses", () => {
  assert.doesNotThrow(() => FactSourceSchema.parse({ type: "student-direct", id: "answer-7" }));
});

test("student-direct: missing id is rejected", () => {
  assert.throws(() => FactSourceSchema.parse({ type: "student-direct" }));
});

test("T046 canonical counsellor edit carries bounded original citation and rejects recursive history", () => {
  const original = { type: "transcript", quote: "September 2027", turnId: "intake-turn" };
  const edited = { type: "counsellor-edit", counsellorId: "verified-counsellor", editedAt: "2026-09-30T12:00:00.000Z", editedFrom: original };
  assert.deepEqual(FactSourceSchema.parse(edited), edited);
  assert.equal(FactSourceSchema.safeParse({ ...edited, editedFrom: edited }).success, false);
  assert.equal(FactSourceSchema.safeParse({ ...edited, counsellorId: "" }).success, false);
  assert.equal(FactSourceSchema.safeParse({ ...edited, editedAt: "forged-time" }).success, false);
});
test("T046 canonical edit actor preserves exact verified nonblank identity", () => {
  const source = { type: "counsellor-edit", counsellorId: " actor-A ", editedAt: "2026-09-30T00:00:00.000Z", editedFrom: { type: "profile", id: "profile-original" } };
  assert.deepEqual(FactSourceSchema.parse(source), source);
  assert.equal(FactSourceSchema.safeParse({ ...source, counsellorId: "   " }).success, false);
});