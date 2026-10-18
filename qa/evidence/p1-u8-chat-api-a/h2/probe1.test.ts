import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { B, dumpAll } from "./lib.ts";
const F = await import(`${B}/apps/api/tests/chat-fixtures.ts`);
const D = await import(`${B}/packages/db/src/index.ts`);
const { adult, minor, call, chatWorld, newThread, studentToken, turnsPath, threadsPath, GERMANY_QUESTION, kbAnswerProvider, recordingKb } = F;
const HIT = (await import(`${B}/apps/api/tests/anonymous-fixtures.ts`)).HIT;
const ALL = [...Object.values(D.COLLECTION_NAMES) as string[], "escalation_notifications", "crisis_flag_reviews"];

const CASES: Array<[string, string, string[]]> = [
  ["email", "my mail is sentinel.one@example.com", ["sentinel.one", "example.com"]],
  ["ph+91", "call +91 98765 43211 please", ["98765", "43211"]],
  ["ph-dash", "reach 98765-43212 please", ["98765", "43212"]],
  ["ph-spaced", "reach 9 8 7 6 5 4 3 2 1 3 please", ["9 8 7 6", "2 1 3"]],
  ["ph-deva", "reach ९८७६५४३२१४ please", ["९८७६"]],
  ["name-cap2", "My name is Priya Sharma", ["Priya", "Sharma"]],
  ["name-lower", "my name is devika nair", ["devika", "nair"]],
  ["name-Iam", "I am Rahul", ["Rahul"]],
  ["name-iam-lower", "i am kabir", ["kabir"]],
  ["name-mera", "mera naam sohail hai", ["sohail"]],
  ["name-deva", "मेरा नाम राहुल है", ["राहुल"]],
  ["name-callme", "call me Anil", ["Anil"]],
  ["email-obf", "write to zoya at gmail dot com", ["zoya", "gmail dot com"]],
  ["email-zw", "write to zo\u200bya.zw@exa\u200bmple.com", ["zoya.zw", "exa\u200bmple", "zo\u200bya"]],
];

for (const [label, token0] of [["adult", () => studentToken(adult())], ["minor-consented", () => studentToken(minor("stu-1", "tenant-a", { guardianConsent: true }))]] as const) {
  test(`area1 ${label}: sentinel survivors across the whole fake DB`, async () => {
    const w = chatWorld();
    try {
      const token = await (token0 as any)();
      const threadId = await newThread(w, token);
      let i = 0;
      const live: Record<string, string> = {};
      for (const [lbl, txt] of CASES) {
        w.clock.ms += 5000;
        const r = await call(w, "POST", turnsPath("stu-1", threadId), { token, body: { text: `${txt}. ${GERMANY_QUESTION}`, clientTurnId: `c-${i++}` } });
        live[lbl] = String(r.status);
      }
      const dump = JSON.stringify(dumpAll(w.fakeDb, ALL));
      const hist = (await call(w, "GET", `${threadsPath("stu-1")}/${threadId}`, { token })).body;
      const survivors: string[] = [];
      for (const [lbl, , sents] of CASES) for (const s of sents) {
        if (dump.includes(s)) survivors.push(`${lbl}:${JSON.stringify(s)}@db`);
        if (hist.includes(s)) survivors.push(`${lbl}:${JSON.stringify(s)}@history`);
      }
      console.log(`[${label}] statuses=${JSON.stringify(live)}`);
      console.log(`[${label}] SURVIVORS=${JSON.stringify(survivors)}`);
      writeFileSync(`${process.env.OUTDIR ?? "."}/dump-${label}.json`, dump);
      const turns = w.fakeDb.collection("chat_turns").all() as any[];
      console.log(`[${label}] user-turn texts:\n` + turns.filter((t) => t.role === "user").map((t) => "  " + t.text.split(". What are")[0]).join("\n"));
    } finally { w.cleanup(); }
  });
}

test("area1 echo: model answer echoing student's stated name/email; Pathlynks profile name", async () => {
  const text = "Welcome Anita Verma, write to anita.v@example.com or Meera Kulkarni about the semester contribution of about 300 euros.";
  const kb = recordingKb({ status: "ok", hits: [{ ...HIT, text }], dropped: 0 });
  const w = chatWorld({ kb, provider: kbAnswerProvider([{ text, kind: "fact", sourceIds: ["t-sem-1"] }]), deps: { profile: { facts: async () => [{ key: "full_name", value: "Meera Kulkarni", source: "pathlynks" }] } } });
  try {
    const token = await studentToken(adult());
    const threadId = await newThread(w, token);
    const body = { text: `My name is Anita Verma, mail anita.v@example.com. ${GERMANY_QUESTION}`, clientTurnId: "echo-1" };
    const live = await call(w, "POST", turnsPath("stu-1", threadId), { token, body });
    const dump = JSON.stringify(dumpAll(w.fakeDb, ALL));
    const replay = await call(w, "POST", turnsPath("stu-1", threadId), { token, body });
    const hist = (await call(w, "GET", `${threadsPath("stu-1")}/${threadId}`, { token })).body;
    for (const s of ["Anita", "Verma", "anita.v@example.com", "Meera", "Kulkarni"]) console.log(`echo ${s}: live=${live.body.includes(s)} db=${dump.includes(s)} replay=${replay.body.includes(s)} history=${hist.includes(s)}`);
    console.log("replay status", replay.status);
  } finally { w.cleanup(); }
});
