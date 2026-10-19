/**
 * Checker A (cycle 1) hostile probes for p1-u6w repair. Own tests, scratch copy only.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { OptionData, OptionDataPort } from "@vc/engine";
import type { ChatApiDeps } from "../src/chat.js";
import { anonWorld, ask } from "./anonymous-fixtures.js";
import { GERMANY_QUESTION, CRISIS_TEXT, adult, call, chatWorld, everythingStored, minor, newThread, profilePath, studentToken, threadsPath, turnsPath } from "./chat-fixtures.js";

const FIX = JSON.parse(readFileSync(fileURLToPath(new URL("../../../packages/engine/tests/fixtures/ranking-profiles.json", import.meta.url)), "utf8")) as {
  optionIds: string[];
  options: Record<string, OptionData>;
};
const RANK_TEXT = "Please rank my shortlist for me";
type Fact = { key: string; value: string };
const GERMANY_ENG: Fact[] = [{ key: "target-country", value: "Germany" }, { key: "field-of-study", value: "engineering" }];
const CANADA_BIZ: Fact[] = [{ key: "target-country", value: "Canada" }, { key: "field-of-study", value: "Business" }];

type Spies = { port: string[]; opts: string[]; weights: string[]; profile: string[]; dbs: string[] };
function world(over: Partial<ChatApiDeps> = {}, weights?: (t: string) => unknown) {
  const sp: Spies = { port: [], opts: [], weights: [], profile: [], dbs: [] };
  const proposals = new Map<string, Fact[]>();
  const port: OptionDataPort = { get: (id) => (sp.port.push(id), FIX.options[id]) } as OptionDataPort;
  const w = chatWorld({
    deps: {
      ranking: {
        port,
        optionIds: (who) => (sp.opts.push(`${who.tenantId}|${who.studentId}`), FIX.optionIds),
        weightsForTenant: (t) => (sp.weights.push(t), (weights ? weights(t) : undefined) as never),
      },
      profile: { facts: async (who: { tenantId: string; studentId: string }) => (sp.profile.push(`${who.tenantId}|${who.studentId}`), []) } as never,
      extractFacts: async (t) => {
        const k = `${t.tenantId}|${t.studentId}`;
        const o = proposals.get(k) ?? [];
        proposals.delete(k);
        return o;
      },
      ...over,
    },
  });
  return { w, sp, proposals };
}
type Ctx = ReturnType<typeof world>;
const clear = (sp: Spies) => {
  for (const k of Object.keys(sp) as (keyof Spies)[]) sp[k].length = 0;
};

async function say(c: Ctx, tenant: string, sid: string, facts: Fact[]) {
  const token = await studentToken(adult(sid, tenant));
  const thread = await newThread(c.w, token, sid);
  c.proposals.set(`${tenant}|${sid}`, facts);
  const r = await call(c.w, "POST", turnsPath(sid, thread), { token, body: { text: GERMANY_QUESTION } });
  assert.equal(r.status, 200);
  return { token, thread };
}
async function confirmAll(c: Ctx, token: string, sid: string) {
  const prof = await call(c.w, "GET", profilePath(sid), { token });
  for (const p of prof.json.proposed) {
    const r = await call(c.w, "POST", `/v1/students/${sid}/chat/profile/facts/${p.factId}/decision`, { token, body: { action: "confirm" } });
    assert.equal(r.status, 200, r.body);
  }
}
async function rank(c: Ctx, token: string, sid: string, thread: string, text = RANK_TEXT, extra: object = {}) {
  const r = await call(c.w, "POST", turnsPath(sid, thread), { token, body: { text, ...extra } });
  assert.equal(r.status, 200, r.body);
  return r;
}
const nums = (j: { claims: { kind: string }[] }) => j.claims.filter((x) => x.kind === "number") as { kind: string; text: string; status: string }[];
const total = (sp: Spies) => sp.port.length + sp.opts.length + sp.weights.length;

// ---------------- C6
test("A1-C6 every claim reaching the student (live, replay, thread read, storage) is unverified; no figure without NOT PROVEN; no attributed number anywhere", async () => {
  const c = world();
  try {
    const { token, thread } = await say(c, "tenant-a", "syn-1", GERMANY_ENG);
    await confirmAll(c, token, "syn-1");
    const first = await rank(c, token, "syn-1", thread, RANK_TEXT, { clientTurnId: "ct-c6" });
    assert.ok(nums(first.json).length >= 2);
    for (const cl of first.json.claims) assert.equal(cl.status, "unverified", JSON.stringify(cl));
    for (const n of nums(first.json)) assert.match(n.text, /^NOT PROVEN: /);
    const replay = await rank(c, token, "syn-1", thread, RANK_TEXT, { clientTurnId: "ct-c6" });
    for (const cl of replay.json.claims) assert.equal(cl.status, "unverified");
    const th = await call(c.w, "GET", `${threadsPath("syn-1")}/${thread}`, { token });
    let seenNums = 0;
    for (const t of th.json.turns)
      for (const cl of t.claims ?? []) {
        if (cl.kind === "number") {
          seenNums++;
          assert.equal(cl.status, "unverified");
          assert.match(cl.text, /^NOT PROVEN: /);
        }
      }
    assert.ok(seenNums >= 2);
    const all = everythingStored(c.w.fakeDb);
    assert.ok(!/"kind":"number","status":"(attributed|verified)"/.test(all) && !/"status":"(attributed|verified)","kind":"number"/.test(all), "attributed number found in storage");
    const statuses = [...all.matchAll(/"status":"([a-z_]+)"/g)].map((m) => m[1]);
    console.log("A1-C6 stored status values", JSON.stringify([...new Set(statuses)]));
    for (const m of all.matchAll(/.{90}"status":"verified".{60}/g)) console.log("A1-C6 verified ctx", m[0]);
    assert.ok(!/\d\.\d\d/.test(first.json.message.replace(/NOT PROVEN[^]*$/, "")));
    assert.ok(!/\d\.\d\d/.test(JSON.stringify(first.json.sources)));
    assert.ok(all.includes("unverified_claim"));
  } finally {
    c.w.cleanup();
  }
});

test("A1-C6b port returning partial data: still every claim unverified, every number labelled", async () => {
  const half: OptionDataPort = {
    get: (id) => {
      const o = FIX.options[id];
      return id === FIX.optionIds[0] ? ({ ...o, cost: undefined } as never) : o;
    },
  } as OptionDataPort;
  const c = world({ ranking: { port: half, optionIds: () => FIX.optionIds } });
  try {
    const { token, thread } = await say(c, "tenant-a", "syn-p", GERMANY_ENG);
    await confirmAll(c, token, "syn-p");
    const r = await rank(c, token, "syn-p", thread);
    for (const cl of r.json.claims) assert.equal(cl.status, "unverified");
    for (const n of nums(r.json)) assert.match(n.text, /^NOT PROVEN: /);
    console.log("A1-C6b claims", r.json.claims.length, "numbers", nums(r.json).length);
  } finally {
    c.w.cleanup();
  }
});

// ---------------- C7
test("A1-C7 matrix: textless turns never touch port/optionIds/weights; consented minor and adult do", async () => {
  const c = world();
  try {
    const mt = await studentToken(minor("syn-m", "tenant-a"));
    const mth = await newThread(c.w, mt, "syn-m");
    clear(c.sp);
    const r1 = await rank(c, mt, "syn-m", mth);
    console.log("A1-C7 unconsented minor spies", JSON.stringify(c.sp), "claims", r1.json.claims.length);
    assert.equal(total(c.sp), 0);
    assert.deepEqual(nums(r1.json), []);
    assert.equal(r1.json.rankingProfile, undefined);
    assert.deepEqual(r1.json.profileFactsUsed ?? [], []);
    for (const t of ["rank them", "Compare my options: Munich vs Toronto", "which of these is best, my shortlist please", "RANK MY SHORTLIST!!"]) {
      clear(c.sp);
      const r = await rank(c, mt, "syn-m", mth, t);
      assert.equal(total(c.sp), 0, t);
      assert.deepEqual(nums(r.json), [], t);
    }
    clear(c.sp);
    const rc = await rank(c, mt, "syn-m", mth, `rank my shortlist. ${CRISIS_TEXT}`);
    assert.equal(total(c.sp), 0);
    assert.deepEqual(nums(rc.json), []);
    const a = await say(c, "tenant-a", "syn-ov", GERMANY_ENG);
    await confirmAll(c, a.token, "syn-ov");
    clear(c.sp);
    const big = await call(c.w, "POST", turnsPath("syn-ov", a.thread), { token: a.token, body: { text: RANK_TEXT + " x".repeat(20000) } });
    console.log("A1-C7 overlong status", big.status);
    assert.equal(total(c.sp), 0);
    const bigC = await call(c.w, "POST", turnsPath("syn-ov", a.thread), { token: a.token, body: { text: `rank my shortlist ${CRISIS_TEXT} ` + "x ".repeat(20000) } });
    console.log("A1-C7 overlong+crisis status", bigC.status, bigC.json?.state, "numbers", nums(bigC.json ?? { claims: [] }).length);
    assert.equal(total(c.sp), 0);
    assert.deepEqual(nums(bigC.json ?? { claims: [] }), []);
    const ws = await call(c.w, "POST", turnsPath("syn-ov", a.thread), { token: a.token, body: { text: "   \n " } });
    console.log("A1-C7 whitespace status", ws.status);
    assert.equal(total(c.sp), 0);
    clear(c.sp);
    const ra = await rank(c, a.token, "syn-ov", a.thread);
    assert.ok(c.sp.port.length > 0 && c.sp.opts.length === 1 && c.sp.weights.length === 1, JSON.stringify(c.sp));
    assert.ok(nums(ra.json).length > 0);
    const ct = await studentToken(minor("syn-cm", "tenant-a", { guardianConsent: true }));
    const cth = await newThread(c.w, ct, "syn-cm");
    c.proposals.set("tenant-a|syn-cm", GERMANY_ENG);
    await call(c.w, "POST", turnsPath("syn-cm", cth), { token: ct, body: { text: GERMANY_QUESTION } });
    await confirmAll(c, ct, "syn-cm");
    clear(c.sp);
    const rcm = await rank(c, ct, "syn-cm", cth);
    console.log("A1-C7 consented minor spies", JSON.stringify(c.sp), "numbers", nums(rcm.json).length);
    assert.ok(c.sp.opts.length === 1 && nums(rcm.json).length > 0);
  } finally {
    c.w.cleanup();
  }
});

test("A1-C7b Pathlynks profile down: ordinary rank turn is 503 with no port/option calls; crisis+rank wording gives no ranking", async () => {
  const { ChatProfileUnavailableError } = await import("../src/chat.js");
  let down = false;
  const c = world({
    profile: {
      facts: async () => {
        if (down) throw new ChatProfileUnavailableError();
        return [];
      },
    } as never,
  });
  try {
    const { token, thread } = await say(c, "tenant-a", "syn-d", GERMANY_ENG);
    await confirmAll(c, token, "syn-d");
    down = true;
    clear(c.sp);
    const r = await call(c.w, "POST", turnsPath("syn-d", thread), { token, body: { text: RANK_TEXT } });
    console.log("A1-C7b down status", r.status);
    assert.equal(r.status, 503);
    const rc = await call(c.w, "POST", turnsPath("syn-d", thread), { token, body: { text: `rank my shortlist ${CRISIS_TEXT}` } });
    console.log("A1-C7b down+crisis", rc.status, rc.json?.state, "numbers", nums(rc.json ?? { claims: [] }).length);
    assert.equal(total(c.sp), 0);
    assert.deepEqual(nums(rc.json ?? { claims: [] }), []);
  } finally {
    c.w.cleanup();
  }
});

// ---------------- C8
test("A1-C8 phone, e-mail and a known Pathlynks name inside a fact value never reach storage; the ranker did use the fact", async () => {
  const val = "Germany, Anita Rao, anita.rao@example.com, call 98765 43210";
  const c = world({
    profile: { facts: async () => [{ key: "full-name", value: "Anita Rao", source: "pathlynks" }, { key: "target-country", value: val, source: "pathlynks" }, { key: "field-of-study", value: "engineering 91234 56789 bob@evil.example", source: "pathlynks" }] } as never,
  });
  try {
    const token = await studentToken(adult("syn-r", "tenant-a"));
    const th = await newThread(c.w, token, "syn-r");
    const r = await rank(c, token, "syn-r", th);
    console.log("A1-C8 live used", JSON.stringify(r.json.profileFactsUsed));
    const turns = c.w.fakeDb.collection<{ response?: { profileFactsUsed?: { key: string; value: string }[] } }>("chat_turns").all();
    const stored = turns.find((t) => (t.response?.profileFactsUsed ?? []).length > 0);
    assert.ok(stored, "stored ranked turn has profileFactsUsed (non-vacuous)");
    assert.equal(stored!.response!.profileFactsUsed!.length, 2, "both PII-bearing facts were used");
    console.log("A1-C8 stored used", JSON.stringify(stored!.response!.profileFactsUsed));
    const all = everythingStored(c.w.fakeDb);
    for (const s of ["98765", "43210", "anita.rao", "example.com", "Anita", "Rao", "91234", "56789", "bob@"]) assert.ok(!all.includes(s), `stored data holds ${s}`);
    const thr = await call(c.w, "GET", `${threadsPath("syn-r")}/${th}`, { token });
    const tr = JSON.stringify(thr.json);
    for (const s of ["98765", "anita.rao", "Anita"]) assert.ok(!tr.includes(s), `thread read holds ${s}`);
    const body = { text: RANK_TEXT, clientTurnId: "ct-c8" };
    await call(c.w, "POST", turnsPath("syn-r", th), { token, body });
    const rep = await call(c.w, "POST", turnsPath("syn-r", th), { token, body });
    assert.ok(!JSON.stringify(rep.json).includes("98765") && !JSON.stringify(rep.json).includes("Anita"), "replay leaks");
  } finally {
    c.w.cleanup();
  }
});

// ---------------- C9 / C10 tenancy
test("A1-C9/C10 tenancy: ids per call reach profile port, option list and weights; B's weights/facts never reach A; a throwing weights callback = plain reply + chat_rank_failed", async () => {
  const COST_ONLY = { fit: 0, cost: 1, scholarshipChance: 0, visaEase: 0 };
  const c = world({}, (t) => (t === "tenant-b" ? COST_ONLY : undefined));
  try {
    const a = await say(c, "tenant-a", "syn-same", GERMANY_ENG);
    await confirmAll(c, a.token, "syn-same");
    const b = await say(c, "tenant-b", "syn-same", CANADA_BIZ);
    await confirmAll(c, b.token, "syn-same");
    const o = await say(c, "tenant-a", "syn-other", CANADA_BIZ);
    await confirmAll(c, o.token, "syn-other");
    clear(c.sp);
    const ra = await rank(c, a.token, "syn-same", a.thread);
    console.log("A1-C9 A spies", JSON.stringify(c.sp), "profile", ra.json.rankingProfile);
    assert.deepEqual(c.sp.opts, ["tenant-a|syn-same"]);
    assert.deepEqual(c.sp.weights, ["tenant-a"]);
    assert.ok(c.sp.profile.length >= 1 && c.sp.profile.every((x) => x === "tenant-a|syn-same"));
    assert.doesNotMatch(ra.json.rankingProfile, /^custom-/, "tenant B's weights did not apply to A");
    clear(c.sp);
    const rb = await rank(c, b.token, "syn-same", b.thread);
    assert.deepEqual(c.sp.opts, ["tenant-b|syn-same"]);
    assert.deepEqual(c.sp.weights, ["tenant-b"]);
    assert.ok(c.sp.profile.every((x) => x === "tenant-b|syn-same"));
    assert.match(rb.json.rankingProfile, /^custom-/);
    const solo = world();
    try {
      const sa = await say(solo, "tenant-a", "syn-same", GERMANY_ENG);
      await confirmAll(solo, sa.token, "syn-same");
      const rs = await rank(solo, sa.token, "syn-same", sa.thread);
      assert.deepEqual(ra.json.claims, rs.json.claims);
      assert.deepEqual(ra.json.profileFactsUsed, rs.json.profileFactsUsed);
      assert.equal(ra.json.rankingProfile, rs.json.rankingProfile);
    } finally {
      solo.w.cleanup();
    }
  } finally {
    c.w.cleanup();
  }
  const c2 = world({}, () => {
    throw new TypeError("SECRETW tenant-a syn-t");
  });
  try {
    const t = await say(c2, "tenant-a", "syn-t", GERMANY_ENG);
    await confirmAll(c2, t.token, "syn-t");
    c2.w.logs.length = 0;
    const r = await rank(c2, t.token, "syn-t", t.thread);
    assert.equal(r.json.state, "ok");
    assert.deepEqual(nums(r.json), []);
    const logs = JSON.stringify(c2.w.logs);
    assert.ok(logs.includes("chat_rank_failed") && logs.includes("TypeError"));
    assert.ok(!logs.includes("SECRETW") && !logs.includes("syn-t") && !logs.includes("Germany"));
  } finally {
    c2.w.cleanup();
  }
});

// ---------------- C11
test("A1-C11 anonymous with live ranking/profile/db spies calls none; the same spies on the authenticated route are called", async () => {
  const sp: Spies = { port: [], opts: [], weights: [], profile: [], dbs: [] };
  const deps = {
    ranking: {
      port: { get: (id: string) => (sp.port.push(id), FIX.options[id]) },
      optionIds: () => (sp.opts.push("x"), FIX.optionIds),
      weightsForTenant: () => (sp.weights.push("x"), undefined),
    },
    profile: { facts: async () => (sp.profile.push("x"), []) },
    dbForTenant: () => {
      sp.dbs.push("x");
      throw new Error("anonymous must not open a tenant Db");
    },
    extractFacts: async () => (sp.dbs.push("ef"), []),
  };
  const a = anonWorld({ deps: deps as never });
  try {
    for (const text of [RANK_TEXT, "Compare my options: Munich vs Toronto", "rank them", "which of these is best, my shortlist please"]) {
      const res = await ask(a, text);
      assert.equal(res.status, 200);
      assert.equal(res.json.state, "sign_in_required", text);
    }
    console.log("A1-C11 anon spies", JSON.stringify(sp));
    assert.equal(sp.port.length + sp.opts.length + sp.weights.length + sp.profile.length + sp.dbs.length, 0);
  } finally {
    a.cleanup();
  }
  const c = world({ ranking: deps.ranking as never, profile: deps.profile as never });
  try {
    const { token, thread } = await say(c, "tenant-a", "syn-c", GERMANY_ENG);
    await confirmAll(c, token, "syn-c");
    await rank(c, token, "syn-c", thread);
    assert.ok(sp.opts.length > 0 && sp.port.length > 0 && sp.profile.length > 0, "control: the shared spies are live on the authenticated route");
  } finally {
    c.w.cleanup();
  }
});
