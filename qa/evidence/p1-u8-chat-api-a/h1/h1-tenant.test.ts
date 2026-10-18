/** H1 area 3: cross-student and cross-tenant probes through the full handler on the fake DB. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createChatThread, getChatThread } from "@vc/db";
import { chatWorld, call, studentToken, adult, newThread, everythingStored, threadsPath, turnsPath, profilePath } from "../../p1-u8/apps/api/tests/chat-fixtures.js";

const Q = "What are the tuition fees for public universities in Germany?";
const shape = (r: { status: number; body: string; headers: Record<string, string> }) => JSON.stringify({ s: r.status, b: r.body, h: Object.fromEntries(Object.entries(r.headers).sort()) });

function worldWithFacts(extra: Record<string, unknown> = {}) {
  return chatWorld({
    deps: {
      extractFacts: async ({ studentId }) => [{ key: "target_country", value: `secret-of-${studentId}` }],
      ...extra,
    } as any,
  });
}

test("3a student A's token with path studentId=B: every route answers exactly like a nonexistent student, and nothing is touched", async () => {
  const w = worldWithFacts();
  try {
    const tA = await studentToken(adult("stu-A"));
    const tB = await studentToken(adult("stu-B"));
    const thB = await newThread(w, tB, "stu-B");
    assert.equal((await call(w, "POST", turnsPath("stu-B", thB), { token: tB, body: { text: Q, clientTurnId: "cb-1" } })).status, 200);
    const prof = await call(w, "GET", profilePath("stu-B"), { token: tB });
    const bFact = prof.json.proposed[0].factId as string;
    const before = everythingStored(w.fakeDb);
    const modelCalls = w.provider.calls.length;
    const reqs = (sid: string, th: string, fact: string): [string, string, unknown][] => [
      ["POST", threadsPath(sid), undefined],
      ["GET", `${threadsPath(sid)}/${th}`, undefined],
      ["POST", turnsPath(sid, th), { text: Q }],
      ["GET", profilePath(sid), undefined],
      ["POST", `/v1/students/${sid}/chat/profile/facts/${fact}/decision`, { action: "erase" }],
    ];
    const real = reqs("stu-B", thB, bFact);
    const ghost = reqs("stu-ZZZ", "no-such-thread", "no-such-fact");
    for (let i = 0; i < real.length; i++) {
      const [m, p, b] = real[i]!;
      const r = await call(w, m, p, { token: tA, ...(b ? { body: b } : {}) });
      const [m2, p2, b2] = ghost[i]!;
      const g = await call(w, m2, p2, { token: tA, ...(b2 ? { body: b2 } : {}) });
      assert.equal(r.status, 404, `${m} ${p}`);
      assert.equal(shape(r), shape(g), `existence oracle: ${m} ${p} differs from ghost`);
    }
    assert.equal(everythingStored(w.fakeDb), before, "A's requests changed stored data");
    assert.equal(w.provider.calls.length, modelCalls, "model called for a cross-student request");
    assert.ok(everythingStored(w.fakeDb).includes(bFact));
  } finally { w.cleanup(); }
});

test("3b A's token, own path, B's threadId / B's factId: indistinguishable from nonexistent ids, no side effects", async () => {
  const w = worldWithFacts();
  try {
    const tA = await studentToken(adult("stu-A"));
    const tB = await studentToken(adult("stu-B"));
    const thA = await newThread(w, tA, "stu-A");
    const thB = await newThread(w, tB, "stu-B");
    await call(w, "POST", turnsPath("stu-B", thB), { token: tB, body: { text: Q, clientTurnId: "cb-1" } });
    await call(w, "POST", turnsPath("stu-A", thA), { token: tA, body: { text: Q, clientTurnId: "ca-1" } });
    const bFact = (await call(w, "GET", profilePath("stu-B"), { token: tB })).json.proposed[0].factId as string;
    const aFact = (await call(w, "GET", profilePath("stu-A"), { token: tA })).json.proposed[0].factId as string;
    const before = everythingStored(w.fakeDb);
    const calls0 = w.provider.calls.length;
    // GET thread
    const g1 = await call(w, "GET", `${threadsPath("stu-A")}/${thB}`, { token: tA });
    const g2 = await call(w, "GET", `${threadsPath("stu-A")}/${"x".repeat(36)}`, { token: tA });
    assert.equal(g1.status, 404);
    assert.equal(shape(g1), shape(g2));
    // POST turn on B's thread with a fresh text and with B's own clientTurnId
    for (const clientTurnId of [undefined, "cb-1", "fresh-1"]) {
      const body = { text: "my own question about Canada", ...(clientTurnId ? { clientTurnId } : {}) };
      const p1 = await call(w, "POST", turnsPath("stu-A", thB), { token: tA, body });
      const p2 = await call(w, "POST", turnsPath("stu-A", "no-such-thread"), { token: tA, body });
      assert.equal(p1.status, 404, `turn on B's thread (clientTurnId=${clientTurnId})`);
      assert.equal(shape(p1), shape(p2));
    }
    // A deciding B's fact id (erase) and a ghost fact id
    for (const action of ["erase", "confirm"]) {
      const d1 = await call(w, "POST", `/v1/students/stu-A/chat/profile/facts/${bFact}/decision`, { token: tA, body: action === "erase" ? { action } : { action } });
      const d2 = await call(w, "POST", `/v1/students/stu-A/chat/profile/facts/ghost-fact/decision`, { token: tA, body: { action } });
      assert.equal(d1.status, d2.status === 404 ? 404 : d1.status);
      assert.equal(shape(d1), shape(d2), `decide B's fact (${action}) differs from ghost fact`);
    }
    assert.equal(w.provider.calls.length, calls0);
    assert.equal(everythingStored(w.fakeDb), before, "side effects of cross-student attempts");
    // profile of A shows only A's data
    const profA = await call(w, "GET", profilePath("stu-A"), { token: tA });
    const s = JSON.stringify(profA.json);
    assert.ok(!s.includes("stu-B") && !s.includes(bFact) && s.includes(aFact));
    // history of A's thread has no B text
    const hA = await call(w, "GET", `${threadsPath("stu-A")}/${thA}`, { token: tA });
    assert.ok(!JSON.stringify(hA.json).includes("cb-1"));
  } finally { w.cleanup(); }
});

test("3c same studentId and the same threadId in two tenants: no collision, no 409, no leakage either way", async () => {
  const w = worldWithFacts();
  try {
    const t1 = await studentToken(adult("stu-1", "tenant-a"));
    const t2 = await studentToken(adult("stu-1", "tenant-b"));
    const db1 = w.deps.dbForTenant("tenant-a");
    const db2 = w.deps.dbForTenant("tenant-b");
    // same threadId in both tenants (the route generates UUIDs, so seed through the store)
    await createChatThread(db1, { studentId: "stu-1", textStored: true, threadId: "shared-th" });
    await createChatThread(db2, { studentId: "stu-1", textStored: true, threadId: "shared-th" });
    const a = await call(w, "POST", turnsPath("stu-1", "shared-th"), { token: t1, body: { text: "tenant ONE private question about Japan", clientTurnId: "same-id" } });
    assert.equal(a.status, 200);
    // T2 uses the same clientTurnId with DIFFERENT text: must not 409 (that would reveal T1 has this turn id)
    const b = await call(w, "POST", turnsPath("stu-1", "shared-th"), { token: t2, body: { text: "tenant TWO different question about Spain", clientTurnId: "same-id" } });
    assert.equal(b.status, 200, `T2 same ids -> ${b.status} ${b.body}`);
    const h1 = await call(w, "GET", `${threadsPath("stu-1")}/shared-th`, { token: t1 });
    const h2 = await call(w, "GET", `${threadsPath("stu-1")}/shared-th`, { token: t2 });
    assert.equal(h1.status, 200);
    assert.equal(h2.status, 200);
    assert.ok(JSON.stringify(h1.json).includes("Japan") && !JSON.stringify(h1.json).includes("Spain"));
    assert.ok(JSON.stringify(h2.json).includes("Spain") && !JSON.stringify(h2.json).includes("Japan"));
    // profiles do not mix
    const p1 = await call(w, "GET", profilePath("stu-1"), { token: t1 });
    const p2 = await call(w, "GET", profilePath("stu-1"), { token: t2 });
    assert.equal(p1.json.proposed.length, 1);
    assert.equal(p2.json.proposed.length, 1);
    // decision in T2 on T1's fact id (same deterministic factId) affects only T2
    const fid = p1.json.proposed[0].factId;
    const d = await call(w, "POST", `/v1/students/stu-1/chat/profile/facts/${fid}/decision`, { token: t2, body: { action: "erase" } });
    assert.equal(d.status, 200);
    const p1b = await call(w, "GET", profilePath("stu-1"), { token: t1 });
    assert.equal(p1b.json.proposed.length, 1, "T2's erase removed T1's fact");
    // T1 token with a thread that exists only in T2
    await createChatThread(db2, { studentId: "stu-1", textStored: true, threadId: "only-in-t2" });
    const x = await call(w, "GET", `${threadsPath("stu-1")}/only-in-t2`, { token: t1 });
    const y = await call(w, "GET", `${threadsPath("stu-1")}/only-in-nowhere`, { token: t1 });
    assert.equal(x.status, 404);
    assert.equal(shape(x), shape(y));
    const x2 = await call(w, "POST", turnsPath("stu-1", "only-in-t2"), { token: t1, body: { text: "hi", clientTurnId: "q1" } });
    const y2 = await call(w, "POST", turnsPath("stu-1", "only-in-nowhere"), { token: t1, body: { text: "hi", clientTurnId: "q1" } });
    assert.equal(x2.status, 404);
    assert.equal(shape(x2), shape(y2));
    assert.equal(await getChatThread(db1, { studentId: "stu-1", threadId: "only-in-t2" }), null);
    // Tenant-id collisions via prefix: tenant "ab" student "c" vs tenant "a" student "bc" (store-level keys)
    const tAb = await studentToken(adult("c", "ab"));
    const tA = await studentToken(adult("bc", "a"));
    const thAb = await newThread(w, tAb, "c");
    const thA = await newThread(w, tA, "bc");
    const r1 = await call(w, "GET", `${threadsPath("bc")}/${thAb}`, { token: tA });
    const r2 = await call(w, "GET", `${threadsPath("c")}/${thA}`, { token: tAb });
    assert.equal(r1.status, 404);
    assert.equal(r2.status, 404);
  } finally { w.cleanup(); }
});

test("3d sandbox tenant takes only syn- ids; the check runs before the path check and leaks nothing", async () => {
  const w = chatWorld({ deps: { sandboxTenantId: "tenant-sbx" } });
  try {
    for (const id of ["stu-1", "SYN-1", "syn", "syn-", "xsyn-1", "Syn-1", "syn_1", "synthetic"]) {
      const t = await studentToken(adult(id, "tenant-sbx"));
      for (const pid of [id, "other"]) {
        const r = await call(w, "POST", threadsPath(pid), { token: t });
        assert.equal(r.status, 403, `sandbox id=${id} path=${pid} -> ${r.status} ${r.body}`);
      }
    }
    const ok = await studentToken(adult("syn-1", "tenant-sbx"));
    assert.equal((await call(w, "POST", threadsPath("syn-1"), { token: ok })).status, 201);
    // a non-syn id in a NON-sandbox tenant still works
    const other = await studentToken(adult("stu-1", "tenant-a"));
    assert.equal((await call(w, "POST", threadsPath("stu-1"), { token: other })).status, 201);
    // sandbox tenant string tricks
    for (const tenant of ["tenant-sbx", "tenant-sbx "]) {
      // a tenant claim with a trailing space is refused by the pattern (401), never a bypass
      const t = await studentToken(adult("stu-1", tenant));
      const r = await call(w, "POST", threadsPath("stu-1"), { token: t });
      assert.ok(r.status === 403 || r.status === 401, `${JSON.stringify(tenant)} -> ${r.status}`);
    }
    for (const tenant of ["TENANT-SBX", "tenant-sbx2"]) {
      const t = await studentToken(adult("stu-1", tenant));
      const r = await call(w, "POST", threadsPath("stu-1"), { token: t });
      console.log(`OBS non-identical tenant ${tenant} with non-syn id (distinct tenant, not sandbox) ->`, r.status);
    }
  } finally { w.cleanup(); }
});

test("3e no stored data from any rejected request across the whole tenant matrix", async () => {
  const w = worldWithFacts();
  try {
    const tA = await studentToken(adult("stu-A"));
    const tB = await studentToken(adult("stu-B"));
    const thB = await newThread(w, tB, "stu-B");
    const before = everythingStored(w.fakeDb);
    for (const [m, p, b] of [
      ["POST", turnsPath("stu-B", thB), { text: Q, clientTurnId: "z" }],
      ["POST", threadsPath("stu-B"), undefined],
      ["POST", `/v1/students/stu-B/chat/profile/facts/f/decision`, { action: "erase" }],
    ] as [string, string, unknown][]) {
      const r = await call(w, m, p, { token: tA, ...(b ? { body: b } : {}) });
      assert.equal(r.status, 404);
    }
    assert.equal(everythingStored(w.fakeDb), before);
    assert.equal(w.provider.calls.length, 0);
  } finally { w.cleanup(); }
});
