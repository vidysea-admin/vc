import { test } from "node:test";
import { B } from "./lib.ts";
const F = await import(`${B}/apps/api/tests/chat-fixtures.ts`);
const { adult, call, chatWorld, newThread, studentToken, turnsPath } = F;

test("area5 same clientTurnId, texts differ only in the stated name", async () => {
  const w = chatWorld();
  try {
    const token = await studentToken(adult());
    const threadId = await newThread(w, token);
    const a = await call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: "my name is Anita, which scholarships?", clientTurnId: "same-1" } });
    const calls1 = w.provider.calls.length;
    const b = await call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: "my name is Bob, which scholarships?", clientTurnId: "same-1" } });
    console.log(`first=${a.status}/${a.json?.state} second=${b.status}/${b.json?.state ?? b.json?.error} providerCallsAfterFirst=${calls1} afterSecond=${w.provider.calls.length} sameBody=${a.body === b.body}`);
    const c = await call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: "my name is Bob, which hostels?", clientTurnId: "same-1" } });
    console.log(`control (different non-name text) -> ${c.status} ${c.json?.error ?? c.json?.state}`);
    const rows = w.fakeDb.collection("chat_turns").all() as any[];
    console.log("stored user text:", JSON.stringify(rows.filter((r) => r.role === "user").map((r) => r.text)));
  } finally {
    w.cleanup();
  }
});
