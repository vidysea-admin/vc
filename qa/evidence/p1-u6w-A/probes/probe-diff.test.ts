/** Checker A differential probe: deps.ranking ABSENT. Output must be byte-identical between the U6w chat.ts and the base (main) chat.ts. */
import { test } from "node:test";
import { writeFileSync } from "node:fs";
import { COLLECTION_NAMES } from "@vc/db";
import { CRISIS_TEXT, GERMANY_QUESTION, adult, call, chatWorld, newThread, profilePath, studentToken, threadsPath, turnsPath } from "./chat-fixtures.js";

test("differential transcript", async () => {
  const proposals = new Map<string, { key: string; value: string }[]>();
  const w = chatWorld({
    deps: {
      extractFacts: async (t) => {
        const o = proposals.get(t.studentId) ?? [];
        proposals.delete(t.studentId);
        return o;
      },
    },
  });
  const out: unknown[] = [];
  try {
    const token = await studentToken(adult("syn-d", "tenant-a"));
    const thread = await newThread(w, token, "syn-d");
    proposals.set("syn-d", [{ key: "target-country", value: "Germany" }, { key: "field-of-study", value: "engineering" }]);
    for (const text of [GERMANY_QUESTION, "Please rank my shortlist for me", "Munich vs Toronto?", "compare my options", CRISIS_TEXT, "Please rank my shortlist for me"]) {
      const r = await call(w, "POST", turnsPath("syn-d", thread), { token, body: { text } });
      out.push({ text, status: r.status, json: r.json });
    }
    const prof = await call(w, "GET", profilePath("syn-d"), { token });
    out.push({ profile: prof.json });
    for (const p of prof.json.proposed) {
      const r = await call(w, "POST", `/v1/students/syn-d/chat/profile/facts/${p.factId}/decision`, { token, body: { action: "confirm" } });
      out.push({ confirm: r.status });
    }
    const prof2 = await call(w, "GET", profilePath("syn-d"), { token });
    out.push({ profile2: prof2.json });
    const r2 = await call(w, "POST", turnsPath("syn-d", thread), { token, body: { text: "Please rank my shortlist for me" } });
    out.push({ afterConfirm: r2.json });
    const th = await call(w, "GET", `${threadsPath("syn-d")}/${thread}`, { token });
    out.push({ thread: { ...th.json, turns: [...th.json.turns].map((t: object) => JSON.stringify({ ...t, turnId: "x" })).sort() } });
    out.push({ db: w.fakeDb.collection(COLLECTION_NAMES.profile_facts).all().length });
  } finally {
    w.cleanup();
  }
  const norm = JSON.stringify(out, null, 1).replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "<uuid>").replace(/"factId": "[0-9a-f]{32}"/g, '"factId": "<fid>"');
  writeFileSync(process.env.DIFF_OUT!, norm);
});
