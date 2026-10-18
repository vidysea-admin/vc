import { test } from "node:test";
import { B, dumpAll } from "./lib.ts";
const F = await import(`${B}/apps/api/tests/chat-fixtures.ts`);
const D = await import(`${B}/packages/db/src/index.ts`);
const { adult, call, chatWorld, newThread, studentToken, turnsPath, GERMANY_QUESTION } = F;
const ALL = [...(Object.values(D.COLLECTION_NAMES) as string[]), "escalation_notifications", "crisis_flag_reviews"];
const SENT = ["Priya", "Sharma", "9876543210", "priya.sharma@example.com", "Germany", "tuition", "kill", "myself", "Zed", "Quill", "sentinelcity", "[NAME]", "[PHONE]", "[EMAIL]", "universit"];
const base = { tenant: "tenant-a", studentId: "stu-1", role: "student" };
const VARIANTS: Array<[string, Record<string, unknown>]> = [
  ["isMinor:true", { isMinor: true }],
  ["age:15", { age: 15 }],
  ["no age/isMinor", {}],
  ["isMinor:true gc:'true'", { isMinor: true, guardianConsent: "true" }],
  ["isMinor:true gc:1", { isMinor: true, guardianConsent: 1 }],
  ["isMinor:true gc:'yes'", { isMinor: true, guardianConsent: "yes" }],
  ["isMinor:true gc:{a:1}", { isMinor: true, guardianConsent: { a: 1 } }],
  ["age:'20' (string)", { age: "20" }],
  ["isMinor:false age:15", { isMinor: false, age: 15 }],
  ["isMinor:'false' (string)", { isMinor: "false" }],
  ["isMinor:true gc:true (CONTROL, stored)", { isMinor: true, guardianConsent: true }],
];
for (const [label, claims] of VARIANTS) {
  test(`area2 ${label}`, async () => {
    let extractorCalls = 0;
    const w = chatWorld({
      deps: {
        extractFacts: async () => {
          extractorCalls++;
          return [{ key: "city", value: "sentinelcity Pune" }];
        },
        profile: { facts: async () => [{ key: "full_name", value: "Priya Sharma", source: "pathlynks" }] },
      },
    });
    try {
      const token = await studentToken({ ...base, ...claims });
      const threadId = await newThread(w, token);
      const txt = `My name is Priya Sharma, 9876543210, priya.sharma@example.com. ${GERMANY_QUESTION}`;
      const r1 = await call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: txt, clientTurnId: "n-1" } });
      w.clock.ms += 5000;
      const r1b = await call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: txt, clientTurnId: "n-1" } });
      w.clock.ms += 5000;
      const r2 = await call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: "I want to kill myself, my name is Zed Quill", clientTurnId: "c-1" } });
      const dump = dumpAll(w.fakeDb, ALL);
      const flat = JSON.stringify(dump);
      const hit = SENT.filter((s) => flat.includes(s));
      const docs: string[] = [];
      for (const [c, rows] of Object.entries(dump)) for (const d of rows as any[]) docs.push(`${c}{${Object.keys(d).sort().join(",")}}`);
      console.log(
        `[${label}] http=${r1.status}/${r1b.status}/${r2.status} state=${r1.json?.state}/${r2.json?.state} escalations=${w.escalations.length} extractorCalls=${extractorCalls} turnRows=${(dump.chat_turns ?? []).length} factRows=${(dump.profile_facts ?? []).length} SENTINELS_IN_DB=${JSON.stringify(hit)}`,
      );
      console.log(`[${label}] docs: ${docs.join(" ")}`);
      console.log(`[${label}] thread=${JSON.stringify((dump.chat_threads as any[])[0])}`);
    } finally {
      w.cleanup();
    }
  });
}

test("area2 overlong adult crisis (>4000 chars, crisis near end), overlong non-crisis, >256KiB", async () => {
  const w = chatWorld();
  try {
    const token = await studentToken(adult());
    const threadId = await newThread(w, token);
    const filler = "I have been thinking a lot about my studies and everything. ".repeat(80);
    const crisisText = `${filler} my name is Zed Quill 9876543210 and I want to kill myself`;
    const r = await call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: crisisText, clientTurnId: "ol-1" } });
    const dump = JSON.stringify(dumpAll(w.fakeDb, ALL));
    console.log(
      `overlong crisis len=${crisisText.length} status=${r.status} state=${r.json?.state} escalations=${w.escalations.length} flags=${w.fakeDb.collection("student_flags").all().length} turnRows=${w.fakeDb.collection("chat_turns").all().length} Zed/9876543210/kill in DB=${["Zed", "9876543210", "kill"].map((s) => dump.includes(s))} providerCalls=${w.provider.calls.length}`,
    );
    w.clock.ms += 5000;
    const r2 = await call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: filler + " " + GERMANY_QUESTION, clientTurnId: "ol-2" } });
    console.log(`overlong non-crisis status=${r2.status} body=${r2.body}`);
    w.clock.ms += 5000;
    const r3 = await call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: "x".repeat(300000) + " I want to kill myself", clientTurnId: "ol-3" } });
    console.log(`>256KiB crisis status=${r3.status} body=${r3.body.slice(0, 80)}`);
    w.clock.ms += 5000;
    const before = w.escalations.length;
    const r4 = await call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: "I want to kill myself", clientTurnId: "ol-4" } });
    console.log(`normal-length crisis same student: escalations ${before} -> ${w.escalations.length} status=${r4.status}`);
  } finally {
    w.cleanup();
  }
});
