import { test } from "node:test";
import assert from "node:assert/strict";
import { link, deriveEdgeId } from "../src/edges.js";
import { COLLECTION_NAMES } from "../src/collections.js";
import { createFakeDb } from "./fakes.js";
import type { EdgeDoc } from "../src/collections.js";

test("deriveEdgeId is deterministic for the same from/to/rel", () => {
  const a = deriveEdgeId({ kind: "fact", id: "f1" }, { kind: "session", id: "s1" }, "sourced_from");
  const b = deriveEdgeId({ kind: "fact", id: "f1" }, { kind: "session", id: "s1" }, "sourced_from");
  assert.equal(a, b);
});

test("deriveEdgeId differs when rel differs", () => {
  const a = deriveEdgeId({ kind: "fact", id: "f1" }, { kind: "session", id: "s1" }, "sourced_from");
  const b = deriveEdgeId({ kind: "fact", id: "f1" }, { kind: "session", id: "s1" }, "has");
  assert.notEqual(a, b);
});

test("link() is idempotent by derived _id: calling it twice writes exactly one edge doc", async () => {
  const { db, fakeDb } = createFakeDb();
  const coll = fakeDb.collection<EdgeDoc>(COLLECTION_NAMES.edges);
  await link(coll, { kind: "student", id: "student-1" }, { kind: "fact", id: "fact-1" }, "has");
  await link(coll, { kind: "student", id: "student-1" }, { kind: "fact", id: "fact-1" }, "has");
  assert.equal(coll.size(), 1);
});

test("link() a second time does not change the original createdAt", async () => {
  const { fakeDb } = createFakeDb();
  const coll = fakeDb.collection<EdgeDoc>(COLLECTION_NAMES.edges);
  const first = await link(coll, { kind: "student", id: "student-1" }, { kind: "fact", id: "fact-1" }, "has");
  const second = await link(coll, { kind: "student", id: "student-1" }, { kind: "fact", id: "fact-1" }, "has");
  assert.equal(first._id, second._id);
  const stored = coll.all()[0];
  assert.equal(stored.createdAt, first.createdAt);
});

test("link() with a different rel produces a distinct edge doc", async () => {
  const { fakeDb } = createFakeDb();
  const coll = fakeDb.collection<EdgeDoc>(COLLECTION_NAMES.edges);
  await link(coll, { kind: "fact", id: "fact-1" }, { kind: "session", id: "session-1" }, "sourced_from");
  await link(coll, { kind: "student", id: "student-1" }, { kind: "fact", id: "fact-1" }, "has");
  assert.equal(coll.size(), 2);
});
