import { test } from "node:test";
import { COLLECTION_NAMES, proposeProfileFact, tenantScopedDb } from "../../../packages/db/src/index.js";
import { createFakeDb } from "../../../packages/db/tests/fakes.js";
import { chatWorld, adult, studentToken, newThread, call, turnsPath, everythingStored, GERMANY_QUESTION } from "../../../apps/api/tests/chat-fixtures.js";
test("C6b fact keys holding a name", async () => {
  const { db } = createFakeDb(); const a = tenantScopedDb(db, "tenantA");
  for (const key of ["my name is priya sharma", "i am kabir", "Priya Sharma", "student_name priya sharma", "call me aarav", "phone 98765 43210"]) {
    const f = await proposeProfileFact(a, { studentId: "stu-1", key, value: "x" });
    console.log("PROBE key", JSON.stringify({ in: key, out: f.key }));
  }
});
test("C6c e2e: model-proposed key with a Pathlynks profile name", async () => {
  const w = chatWorld({ deps: { profile: { facts: async () => [{ key: "full_name", value: "Meera Kulkarni", source: "pathlynks" }] } as never, extractFacts: async () => [{ key: "note about Meera Kulkarni", value: "Meera Kulkarni likes Germany" }] as never } });
  try {
    const token = await studentToken(adult()); const th = await newThread(w, token);
    await call(w, "POST", turnsPath("stu-1", th), { token, body: { text: GERMANY_QUESTION, clientTurnId: "k1" } });
    const s = everythingStored(w.fakeDb);
    console.log("PROBE c6c", JSON.stringify({ keyHasName: /Kulkarni/.test(s.split("profile")[0] ?? ""), anyKulkarni: /Kulkarni/.test(s) }));
    const rows = w.fakeDb.collection(COLLECTION_NAMES.profile_facts).all();
    console.log("PROBE c6c-rows", JSON.stringify(rows.map((r: any) => ({ key: r.key, value: r.value }))));
  } finally { w.cleanup(); }
});
