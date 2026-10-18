import { test } from "node:test";
import assert from "node:assert/strict";
import { B } from "./lib.ts";
const F = await import(`${B}/apps/api/tests/chat-fixtures.ts`);
const D = await import(`${B}/packages/db/src/index.ts`);
const T = await import(`${B}/packages/db/src/testing.ts`);
const E = await import(`${B}/packages/engine/src/index.ts`);
const { MockProvider } = await import(`${B}/packages/providers/src/index.ts`);
const { adult, call, chatWorld, newThread, studentToken, turnsPath, threadsPath, profilePath, GERMANY_QUESTION, CRISIS_TEXT, SKILLS_DIR } = F;

const CHAT_COLLS = ["chat_threads", "chat_turns", "profile_facts", "student_usage", "student_flags"];

function allCollections(fakeDb: any): string[] {
  return [...(fakeDb as any).collections.keys()];
}
function dumpEverything(fakeDb: any): Record<string, any[]> {
  const out: Record<string, any[]> = {};
  for (const n of allCollections(fakeDb)) out[n] = fakeDb.collection(n).all();
  return out;
}

async function flow(w: any, tenant: string, studentId: string, tag: string) {
  const token = await studentToken(adult(studentId, tenant));
  const th1 = await newThread(w, token, studentId);
  const th2 = await newThread(w, token, studentId);
  w.clock.ms += 5000;
  await call(w, "POST", turnsPath(studentId, th1), { token, body: { text: `my name is Priya${tag} Sharma. ${GERMANY_QUESTION}`, clientTurnId: `${tag}-a` } });
  w.clock.ms += 5000;
  await call(w, "POST", turnsPath(studentId, th2), { token, body: { text: GERMANY_QUESTION, clientTurnId: `${tag}-b` } });
  w.clock.ms += 5000;
  await call(w, "POST", turnsPath(studentId, th1), { token, body: { text: CRISIS_TEXT, clientTurnId: `${tag}-c` } });
  w.clock.ms += 5000;
  const profile = await call(w, "GET", profilePath(studentId), { token });
  const proposed = profile.json.proposed as Array<{ factId: string; key: string }>;
  if (proposed.length > 0) {
    await call(w, "POST", `/v1/students/${studentId}/chat/profile/facts/${proposed[0]!.factId}/decision`, { token, body: { action: "confirm" } });
  }
  return { token, th1, th2, proposed: proposed.length };
}

test("area3 erasure + export completeness, two students + same id in another tenant", async () => {
  const db0 = D;
  let n = 0;
  const w = chatWorld({
    deps: {
      extractFacts: async (t: any) => [
        { key: `city${t.studentId}`, value: `Pune ${t.studentId}-marker` },
        { key: "goal", value: "MS in Germany, phone 98765 43210" },
      ],
      // the REAL escalation path (escalateTurns), with a seeded scribe consent so the classifier review also runs
      escalateForTenant: (tenantId: string, db: any) => (input: any) =>
        E.escalateTurns(db, input, {
          recipients: async () => ({ adminIds: ["admin-1"], counsellorIds: ["counsellor-7"] }),
          classifier: {
            provider: new MockProvider({ model: "flash-lite", responses: { [E.CONCERN_CLASSIFIER_SKILL]: { rationale: `Student ${input.studentId} wrote: ${input.turns[0].text}`, severity: "high", likelyBenign: false } }, }),
            skillPrompt: E.loadSkill(SKILLS_DIR, E.CONCERN_CLASSIFIER_SKILL),
            config: { model: "flash-lite", timeoutMs: 2000, sampleRates: { latin: 0, devanagari: 0, other: 0 } },
          },
          now: () => new Date(w.clock.ms),
          onReview: (p: Promise<unknown>) => { reviews.push(p); },
        }),
    },
  });
  const reviews: Promise<unknown>[] = [];
  try {
    // seed scribe consent for stu-1/tenant-a so the classifier review path runs (real prod path when consent exists)
    w.fakeDb.collection("consents").seed({ _id: "tenant-a:consent-stu-1", tenantId: "tenant-a", studentId: "stu-1", guardianConsent: true, purposes: [(await import(`${B}/packages/engine/src/scribe/index.ts`)).SCRIBE_PURPOSE], recordedAt: "2026-10-01T00:00:00.000Z", minor: false });
    const A = await flow(w, "tenant-a", "stu-1", "A");
    const A2 = await flow(w, "tenant-a", "stu-2", "B");
    const X = await flow(w, "tenant-b", "stu-1", "X");
    await Promise.allSettled(reviews);
    const dbA = w.deps.dbForTenant("tenant-a");
    await D.recordStudentFlag(dbA, { studentId: "stu-1", threadId: A.th1, turnId: "synthetic-concern", kind: "concern" }, { now: new Date(w.clock.ms) });
    console.log(`flow ok: proposedFacts A=${A.proposed} B=${A2.proposed} X=${X.proposed}; escalations/reviews awaited=${reviews.length}`);

    const before = dumpEverything(w.fakeDb);
    console.log("collections before:", Object.entries(before).map(([k, v]) => `${k}=${v.length}`).join(" "));
    const rowsFor = (dump: Record<string, any[]>, sid: string, tenant: string, coll: string) => (dump[coll] ?? []).filter((r) => r.studentId === sid && r.tenantId === tenant);

    // EXPORT before erasure
    const exp = await D.exportStudent(dbA, "stu-1");
    const map: Record<string, any[]> = { chat_threads: exp.chatThreads, chat_turns: exp.chatTurns, profile_facts: exp.profileFacts, student_usage: exp.usage, student_flags: exp.flags };
    for (const c of CHAT_COLLS) {
      const want = rowsFor(before, "stu-1", "tenant-a", c).map((r) => String(r._id).replace(/^tenant-a:/, "")).sort();
      const got = (map[c] as any[]).map((r) => String(r._id).replace(/^tenant-a:/, "")).sort();
      const foreign = (map[c] as any[]).filter((r) => r.studentId !== "stu-1" || (r.tenantId !== undefined && r.tenantId !== "tenant-a"));
      console.log(`export ${c}: db rows(stu-1,tenant-a)=${want.length} exported=${got.length} sameIds=${JSON.stringify(want) === JSON.stringify(got)} foreign=${foreign.length}`);
      assert.deepEqual(got, want, `export ${c}`);
      assert.equal(foreign.length, 0, `foreign rows in export ${c}`);
    }
    // other collections that carry stu-1 rows
    const expJson = JSON.stringify(exp);
    for (const [coll, rows] of Object.entries(before)) {
      for (const r of rows) {
        if (JSON.stringify(r).includes('"stu-1"') && r.tenantId === "tenant-a" && !CHAT_COLLS.includes(coll)) {
          console.log(`  non-chat doc naming stu-1: ${coll} ${r._id} in export json: ${expJson.includes(JSON.stringify(r._id))}`);
        }
      }
    }
    // leak of B / tenant-b in the export JSON
    console.log("export mentions stu-2:", expJson.includes("stu-2"), " tenant-b:", expJson.includes("tenant-b"), " markers 'stu-2-marker':", expJson.includes("stu-2-marker"));

    // ERASURE (real)
    const { requestId } = await D.requestErasure(dbA, { studentId: "stu-1", requestedBy: "counsellor-7", reason: "student_request" });
    await T.confirmTwiceAndApprove(dbA, { requestId, confirmedBy: "admin-2" });
    const outcome = await D.executeErasure(dbA, requestId);
    console.log("erasure status:", outcome.status);
    console.log("receipt:", JSON.stringify(outcome.receipt.collections.filter((l: any) => l.deleted > 0 || l.remaining > 0).map((l: any) => `${l.collection}:del=${l.deleted},rem=${l.remaining}`)));

    const after = dumpEverything(w.fakeDb);
    console.log("collections after:", Object.entries(after).map(([k, v]) => `${k}=${v.length}`).join(" "));
    // anything still naming stu-1 in tenant-a (any string field), ids of its threads
    const needles = ["stu-1", A.th1, A.th2, "Priya A"];
    const residue: string[] = [];
    for (const [coll, rows] of Object.entries(after)) {
      for (const r of rows) {
        const j = JSON.stringify(r);
        const isOtherTenant = r.tenantId === "tenant-b";
        for (const nd of needles) if (j.includes(nd)) residue.push(`${coll}/${r._id} tenant=${r.tenantId ?? "-"} needle=${nd}${isOtherTenant ? " (tenant-b stu-1 row: expected to survive?)" : ""}`);
      }
    }
    console.log("RESIDUE naming stu-1 / its thread ids:", JSON.stringify(residue, null, 1));
    // other students' rows must survive
    console.log("survivors: stu-2 chat rows =", CHAT_COLLS.map((c) => `${c}:${(after[c] ?? []).filter((r) => r.studentId === "stu-2").length}`).join(" "), "| tenant-b stu-1 =", CHAT_COLLS.map((c) => `${c}:${(after[c] ?? []).filter((r) => r.studentId === "stu-1" && r.tenantId === "tenant-b").length}`).join(" "));
    const sentinelSurvivors = ["Priya", "Sharma", "98765"].filter((s) => JSON.stringify(after).includes(s));
    console.log("PII sentinels anywhere after erasure (includes other students' redacted rows):", JSON.stringify(sentinelSurvivors));
    const chatLeft = CHAT_COLLS.flatMap((c) => (after[c] ?? []).filter((r) => r.studentId === "stu-1" && r.tenantId === "tenant-a").map((r) => `${c}/${r._id}`));
    assert.deepEqual(chatLeft, [], "chat rows left for erased student");
  } finally {
    w.cleanup();
  }
});
