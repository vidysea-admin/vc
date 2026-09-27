/**
 * T-042 (ISS-085, B21 signed webhooks): the Mongo-backed WebhookEmitGapLedger, over a fake
 * tenant-scoped Db (B8 -- no real network or database). Mirrors webhooks-outbox-mongo.test.ts's
 * tenant-scoping and drift-guard properties for the recoverable emit-gap ledger.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createFakeDb } from "@vc/db/testing";
import { COLLECTION_NAMES, TenantScopeError, tenantScopedDb } from "@vc/db";
import { MongoWebhookEmitGapLedger, WEBHOOK_EMIT_GAPS_COLLECTION } from "../src/webhooks/gaps.js";
import type { WebhookEvent } from "../src/webhooks/schemas.js";

function makeEvent(id: string, studentId = "student-1"): WebhookEvent {
  return {
    id,
    type: "fact.approved",
    occurredAt: "2026-09-27T10:00:00.000Z",
    tenantId: "tenant-pathlynks",
    data: {
      sessionId: "session-1",
      studentId,
      fact: { key: "targetCountry", value: "Canada", source: { type: "transcript", quote: "Canada", turnId: "t1" }, confidence: 0.9, purposeTags: ["profile_synthesis"], sensitivity: "low" },
    },
  };
}

function ledgerFor(tenantId: string) {
  const { db } = createFakeDb();
  return { ledger: new MongoWebhookEmitGapLedger(tenantScopedDb(db, tenantId)), db };
}

test("drift guard: the collection name here matches packages/db COLLECTION_NAMES.webhook_emit_gaps", () => {
  assert.equal(WEBHOOK_EMIT_GAPS_COLLECTION, COLLECTION_NAMES.webhook_emit_gaps);
});

test("constructor refuses an unscoped Db", () => {
  const { db } = createFakeDb();
  assert.throws(() => new MongoWebhookEmitGapLedger(db), TenantScopeError);
});

test("record creates a readback-gap row with the fields given, no event attached", async () => {
  const { ledger } = ledgerFor("tenant-a");
  await ledger.record({
    id: "readback-gap:s-1:sess-1:fact-1",
    kind: "readback-gap",
    studentId: "s-1",
    sessionId: "sess-1",
    factId: "fact-1",
    detail: "missing-on-readback",
  });
  const all = await ledger.list();
  assert.equal(all.length, 1);
  assert.equal(all[0]!.kind, "readback-gap");
  assert.equal(all[0]!.factId, "fact-1");
  assert.equal(all[0]!.event, undefined);
  assert.ok(all[0]!.createdAt);
});

test("record creates an enqueue-failed row carrying the fully built event, so it can be replayed", async () => {
  const { ledger } = ledgerFor("tenant-a");
  const event = makeEvent("evt-1");
  await ledger.record({
    id: "enqueue-failed:evt-1",
    kind: "enqueue-failed",
    studentId: "student-1",
    event,
    destinationUrl: "http://client.invalid/hook",
    detail: "enqueue_failed:Error",
  });
  const all = await ledger.list();
  assert.equal(all.length, 1);
  assert.equal(all[0]!.kind, "enqueue-failed");
  assert.deepEqual(all[0]!.event, event, "the whole event round-trips byte-identical, ready to replay");
  assert.equal(all[0]!.destinationUrl, "http://client.invalid/hook");
});

test("record is idempotent by id: a second call for the same id never creates a second row", async () => {
  const { ledger } = ledgerFor("tenant-a");
  const input = { id: "readback-gap:s-1:sess-1:fact-1", kind: "readback-gap" as const, studentId: "s-1", detail: "missing-on-readback" };
  await ledger.record(input);
  await ledger.record(input);
  assert.equal((await ledger.list()).length, 1);
});

test("B21 tenancy: tenant A's ledger never sees tenant B's rows, on the SAME underlying Db", async () => {
  const { db } = createFakeDb();
  const ledgerA = new MongoWebhookEmitGapLedger(tenantScopedDb(db, "tenant-a"));
  const ledgerB = new MongoWebhookEmitGapLedger(tenantScopedDb(db, "tenant-b"));
  await ledgerA.record({ id: "gap-1", kind: "readback-gap", studentId: "s-1", detail: "missing-on-readback" });
  await ledgerB.record({ id: "gap-1", kind: "readback-gap", studentId: "s-2", detail: "missing-on-readback" });
  assert.equal((await ledgerA.list()).length, 1);
  assert.equal((await ledgerB.list()).length, 1);
  assert.equal((await ledgerA.list())[0]!.studentId, "s-1");
  assert.equal((await ledgerB.list())[0]!.studentId, "s-2");
});

test("every stored document carries a top-level tenantId (not only nested in event.tenantId)", async () => {
  const { db, ledger } = ledgerFor("tenant-a");
  await ledger.record({ id: "gap-1", kind: "enqueue-failed", studentId: "s-1", event: makeEvent("evt-1"), destinationUrl: "http://x/hook", detail: "enqueue_failed:Error" });
  const raw = await (db as unknown as { collection(name: string): { findOne(f: object): Promise<{ tenantId?: string } | null> } })
    .collection(WEBHOOK_EMIT_GAPS_COLLECTION)
    .findOne({});
  assert.equal(raw?.tenantId, "tenant-a");
});
