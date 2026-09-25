import { test } from "node:test";
import assert from "node:assert/strict";
import { requireConsent, ConsentRequiredError } from "../src/consent.js";
import { COLLECTION_NAMES } from "../src/collections.js";
import { createFakeDb } from "./fakes.js";
import type { ConsentDoc } from "../src/collections.js";

function seedConsent(fakeDb: ReturnType<typeof createFakeDb>["fakeDb"], overrides: Partial<ConsentDoc> = {}) {
  const doc: ConsentDoc = {
    _id: "consent-student-1",
    studentId: "student-1",
    guardianConsent: false,
    purposes: ["counselling"],
    recordedAt: "2026-09-25T00:00:00.000Z",
    minor: false,
    ...overrides,
  };
  fakeDb.collection<ConsentDoc>(COLLECTION_NAMES.consents).seed(doc);
  return doc;
}

test("B4: requireConsent throws ConsentRequiredError when no consent row exists", async () => {
  const { db } = createFakeDb();
  await assert.rejects(() => requireConsent(db, "student-1", "counselling"), ConsentRequiredError);
});

test("B4: requireConsent throws when the recorded consent does not cover the purpose", async () => {
  const { db, fakeDb } = createFakeDb();
  seedConsent(fakeDb, { purposes: ["marketing"] });
  await assert.rejects(() => requireConsent(db, "student-1", "counselling"), ConsentRequiredError);
});

test("B4: requireConsent throws for a minor with no guardianConsent even if a consent row exists", async () => {
  const { db, fakeDb } = createFakeDb();
  seedConsent(fakeDb, { minor: true, guardianConsent: false });
  await assert.rejects(() => requireConsent(db, "student-1", "counselling"), ConsentRequiredError);
});

test("B4: requireConsent resolves for a minor WITH guardianConsent covering the purpose", async () => {
  // ISS-018: the old form (`assert.doesNotThrow(async () => requireConsent(...))`)
  // never awaits the inner call — `doesNotThrow` only checks that invoking the
  // wrapper *synchronously* throws, which an async function never does, so the
  // test passed unconditionally regardless of what requireConsent actually
  // did. `assert.doesNotReject` awaits the returned promise.
  const { db, fakeDb } = createFakeDb();
  seedConsent(fakeDb, { minor: true, guardianConsent: true });
  await assert.doesNotReject(() => requireConsent(db, "student-1", "counselling"));
});

test("B4: requireConsent resolves for an adult with a matching consent row", async () => {
  const { db, fakeDb } = createFakeDb();
  seedConsent(fakeDb);
  await assert.doesNotReject(() => requireConsent(db, "student-1", "counselling"));
});

test("ISS-043: every refusal carries ONE generic message, so the error never reveals minor status or purposes", async () => {
  const messages: string[] = [];
  for (const overrides of [null, { purposes: ["marketing"] }, { minor: true, guardianConsent: false }] as const) {
    const { db, fakeDb } = createFakeDb();
    if (overrides) seedConsent(fakeDb, overrides);
    const err = await requireConsent(db, "student-1", "counselling").then(
      () => assert.fail("expected ConsentRequiredError"),
      (e: unknown) => e,
    );
    assert.ok(err instanceof ConsentRequiredError);
    messages.push(err.message);
  }
  assert.equal(new Set(messages).size, 1, `distinct messages: ${JSON.stringify(messages)}`);
  assert.doesNotMatch(messages[0] ?? "", /minor|guardian|marketing|no consent row|does not cover/i);
});
