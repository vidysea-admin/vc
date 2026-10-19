import { test } from "node:test";
import assert from "node:assert/strict";
import { COLLECTION_NAMES, tenantScopedDb } from "../../../../packages/db/src/index.js";
import { createFakeDb } from "../../../../packages/db/tests/fakes.js";
import { proposeProfileFact } from "./profile-facts.js";
test("B-C6 fact key redacted", async () => {
  const { db, fakeDb } = createFakeDb();
  const a = tenantScopedDb(db, "tenantA");
  const f = await proposeProfileFact(a, { studentId: "stu-1", key: "reach me on 9876543210 or priya@example.com", value: "Germany" });
  assert.equal(f.key, "reach me on [PHONE] or [EMAIL]");
  const stored = JSON.stringify(fakeDb.collection(COLLECTION_NAMES.profile_facts).all());
  assert.ok(!stored.includes("9876543210") && !stored.includes("priya@example.com"));
  const g = await proposeProfileFact(a, { studentId: "stu-1", key: "target_country", value: "Germany" });
  assert.equal(g.key, "target_country");
});
