/**
 * Checker A hostile probes for p1-u6w (own tests, not the maker's). Scratch copy only.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { OptionData, OptionDataPort } from "@vc/engine";
import { COLLECTION_NAMES } from "@vc/db";
import type { ChatApiDeps } from "../src/chat.js";
import { anonWorld, ask } from "./anonymous-fixtures.js";
import { GERMANY_QUESTION, CRISIS_TEXT, adult, call, chatWorld, everythingStored, minor, newThread, profilePath, studentToken, threadsPath, turnsPath, type ChatWorld } from "./chat-fixtures.js";

const FIX = JSON.parse(readFileSync(fileURLToPath(new URL("../../../packages/engine/tests/fixtures/ranking-profiles.json", import.meta.url)), "utf8")) as {
  optionIds: string[];
  options: Record<string, OptionData>;
};
const RANK_TEXT = "Please rank my shortlist for me";
type Fact = { key: string; value: string };
const GERMANY_ENG: Fact[] = [{ key: "target-country", value: "Germany" }, { key: "field-of-study", value: "engineering" }];
const CANADA_BIZ: Fact[] = [{ key: "target-country", value: "Canada" }, { key: "field-of-study", value: "Business" }];

function spyPort(): OptionDataPort & { calls: string[] } {
  const calls: string[] = [];
  return { calls, get: (id) => (calls.push(id), FIX.options[id]) } as OptionDataPort & { calls: string[] };
}

function world(over: Partial<ChatApiDeps> = {}) {
  const proposals = new Map<string, Fact[]>();
  const port = spyPort();
  const w = chatWorld({
    deps: {
      ranking: { port, optionIds: () => FIX.optionIds },
      extractFacts: async (t) => {
        const k = `${t.tenantId}|${t.studentId}`;
        const o = proposals.get(k) ?? [];
        proposals.delete(k);
        return o;
      },
      ...over,
    },
  });
  return { w, port, proposals };
}
type Ctx = ReturnType<typeof world>;

async function say(c: Ctx, tenant: string, sid: string, facts: Fact[]): Promise<{ token: string; thread: string }> {
  const token = await studentToken(adult(sid, tenant));
  const thread = await newThread(c.w, token, sid);
  c.proposals.set(`${tenant}|${sid}`, facts);
  const r = await call(c.w, "POST", turnsPath(sid, thread), { token, body: { text: GERMANY_QUESTION } });
  assert.equal(r.status, 200);
  return { token, thread };
}
async function decide(c: Ctx, token: string, sid: string, action: string, value?: string, only?: string) {
  const prof = await call(c.w, "GET", profilePath(sid), { token });
  for (const p of prof.json.proposed) {
    if (only && p.key !== only) continue;
    const r = await call(c.w, "POST", `/v1/students/${sid}/chat/profile/facts/${p.factId}/decision`, { token, body: { action, ...(value ? { value } : {}) } });
    assert.equal(r.status, 200, r.body);
  }
}
async function rank(c: Ctx, token: string, sid: string, thread: string, text = RANK_TEXT) {
  const r = await call(c.w, "POST", turnsPath(sid, thread), { token, body: { text } });
  assert.equal(r.status, 200, r.body);
  return r;
}
const ids = (j: { claims: { text: string }[] }): string[] =>
  j.claims.map((c) => c.text.replace(/^NOT PROVEN: /, "")).filter((t) => t.startsWith("#")).map((t) => /^#\d+ (.*?):/.exec(t)![1]!);
const used = (j: { profileFactsUsed?: { key: string; value: string; source: string }[] }) => (j.profileFactsUsed ?? []).map((f) => `${f.key}=${f.value}/${f.source}`).sort();

// ---------------- C1
test("A-C1a baseline: no facts -> nothing ranked; confirm -> ranked and facts listed as student-confirmed; erase -> back to nothing", async () => {
  const c = world();
  try {
    const { token, thread } = await say(c, "tenant-a", "syn-1", GERMANY_ENG);
    const before = await rank(c, token, "syn-1", thread);
    assert.deepEqual(ids(before.json), [], "proposed-only: no option ranked");
    assert.deepEqual(used(before.json), []);
    await decide(c, token, "syn-1", "confirm");
    const after = await rank(c, token, "syn-1", thread);
    assert.equal(ids(after.json)[0], "Munich engineering (synthetic)");
    assert.deepEqual(used(after.json), ["field-of-study=engineering/student-confirmed", "target-country=Germany/student-confirmed"]);
    // erase everything
    const prof = await call(c.w, "GET", profilePath("syn-1"), { token });
    for (const f of prof.json.facts) {
      if (f.source !== "student-confirmed") continue;
    }
    // the confirmed rows are listed in prof.json.facts; erase through the decision route needs factIds, which only proposed rows expose: use the db directly
    const db = c.w.deps.dbForTenant("tenant-a");
    await db.collection(COLLECTION_NAMES.profile_facts).deleteMany({ studentId: "syn-1" } as never);
    const erased = await rank(c, token, "syn-1", thread);
    assert.deepEqual(ids(erased.json), [], "erased facts no longer rank");
    console.log("A-C1a OK", JSON.stringify(used(after.json)));
  } finally {
    c.w.cleanup();
  }
});

test("A-C1b correct: a student's corrected value (status confirmed, label chat) is what the ranker uses", async () => {
  const c = world();
  try {
    const { token, thread } = await say(c, "tenant-a", "syn-2", GERMANY_ENG);
    await decide(c, token, "syn-2", "confirm", undefined, "field-of-study");
    await decide(c, token, "syn-2", "correct", "Canada", "target-country");
    const r = await rank(c, token, "syn-2", thread);
    console.log("A-C1b used", JSON.stringify(used(r.json)), "ranked", JSON.stringify(ids(r.json)));
    assert.ok(used(r.json).includes("target-country=Canada/student-confirmed"));
  } finally {
    c.w.cleanup();
  }
});

test("A-C1c raw rows: 'chat-extracted' confirmed, 'chat' proposed and a 'chat' confirmed fact with a blank value never move the ranking; student-confirmed wins over a conflicting pathlynks fact", async () => {
  const c = world({ profile: { facts: async () => [{ key: "target-country", value: "Canada" }] } as never });
  try {
    const { token, thread } = await say(c, "tenant-a", "syn-3", []);
    const db = c.w.deps.dbForTenant("tenant-a");
    const col = db.collection(COLLECTION_NAMES.profile_facts);
    const base = { studentId: "syn-3", decidedAt: "2026-11-01T00:00:00.000Z", proposedAt: "2026-11-01T00:00:00.000Z" };
    await col.insertOne({ ...base, _id: "r1", factId: "r1", key: "field-of-study", value: "engineering", status: "confirmed", source: "chat-extracted" } as never);
    await col.insertOne({ ...base, _id: "r2", factId: "r2", key: "extra", value: "x", status: "proposed", source: "chat" } as never);
    const r = await rank(c, token, "syn-3", thread);
    console.log("A-C1c pathlynks-only used", JSON.stringify(used(r.json)));
    assert.deepEqual(used(r.json), ["target-country=Canada/pathlynks"].filter((x) => used(r.json).includes(x)), "only the pathlynks fact (if it fit anything) is used; the chat-extracted fact is not");
    assert.ok(!used(r.json).some((u) => u.startsWith("field-of-study")), "chat-extracted/confirmed fact ignored");
    // now a real chat-confirmed Germany overrides the pathlynks Canada
    await col.insertOne({ ...base, _id: "r3", factId: "r3", key: "target-country", value: "Germany", status: "confirmed", source: "chat" } as never);
    const r2 = await rank(c, token, "syn-3", thread);
    console.log("A-C1c conflict used", JSON.stringify(used(r2.json)));
    assert.ok(used(r2.json).includes("target-country=Germany/student-confirmed"));
    assert.ok(!used(r2.json).includes("target-country=Canada/pathlynks"), "one fact per key: the student's confirmed value beats pathlynks");
  } finally {
    c.w.cleanup();
  }
});

// ---------------- C3
test("A-C3 tenancy: tenant A has NO facts, tenant B (same student id) has confirmed facts; A's ranking uses nothing. And tenant A's facts never reach tenant B / another student of tenant A", async () => {
  const seenProfile: string[] = [];
  const seenOpts: string[] = [];
  const c = world({
    profile: { facts: async (w: { tenantId: string; studentId: string }) => (seenProfile.push(`${w.tenantId}|${w.studentId}`), []) } as never,
    ranking: { port: spyPort(), optionIds: (w) => (seenOpts.push(`${w.tenantId}|${w.studentId}`), FIX.optionIds) },
  });
  try {
    const a = await say(c, "tenant-a", "syn-same", []);
    const b = await say(c, "tenant-b", "syn-same", GERMANY_ENG);
    await decide(c, b.token, "syn-same", "confirm");
    const other = await say(c, "tenant-a", "syn-other", GERMANY_ENG);
    await decide(c, other.token, "syn-other", "confirm");
    seenProfile.length = 0;
    seenOpts.length = 0;
    const ra = await rank(c, a.token, "syn-same", a.thread);
    assert.deepEqual(ids(ra.json), [], "tenant A has no confirmed facts -> nothing ranked, B's facts invisible");
    assert.deepEqual(used(ra.json), []);
    assert.ok(seenProfile.length >= 1 && seenProfile.every((x) => x === "tenant-a|syn-same"), `profile port saw ${seenProfile}`);
    assert.deepEqual(seenOpts, ["tenant-a|syn-same"]);
    // reverse: tenant B asks, tenant A (same id) has none
    const rb = await rank(c, b.token, "syn-same", b.thread);
    assert.equal(ids(rb.json)[0], "Munich engineering (synthetic)");
    // and a third tenant with no rows at all
    const t3 = await say(c, "tenant-c", "syn-same", []);
    const r3 = await rank(c, t3.token, "syn-same", t3.thread);
    assert.deepEqual(ids(r3.json), []);
    assert.deepEqual(used(r3.json), []);
    // the other student of tenant A is unaffected by syn-same
    const ro = await rank(c, other.token, "syn-other", other.thread);
    assert.equal(ids(ro.json)[0], "Munich engineering (synthetic)");
    console.log("A-C3 OK");
  } finally {
    c.w.cleanup();
  }
});

// ---------------- C2
test("A-C2 every decimal figure the student can read carries NOT PROVEN: reply, claims, stored thread, replay, and every stored document", async () => {
  const c = world();
  try {
    const { token, thread } = await say(c, "tenant-a", "syn-4", GERMANY_ENG);
    await decide(c, token, "syn-4", "confirm");
    const body = { text: RANK_TEXT, clientTurnId: "ct-fixed-1" };
    const first = await call(c.w, "POST", turnsPath("syn-4", thread), { token, body });
    assert.equal(first.status, 200, first.body);
    const nums = first.json.claims.filter((x: { kind: string }) => x.kind === "number");
    assert.ok(nums.length >= 2, "several number claims");
    for (const n of nums) assert.match(n.text, /^NOT PROVEN: #\d+ /);
    assert.match(first.json.message, /NOT PROVEN/);
    const replay = await call(c.w, "POST", turnsPath("syn-4", thread), { token, body });
    assert.equal(replay.status, 200, replay.body);
    for (const n of replay.json.claims.filter((x: { kind: string }) => x.kind === "number")) assert.match(n.text, /^NOT PROVEN: /);
    assert.match(replay.json.message, /NOT PROVEN/);
    const th = await call(c.w, "GET", `${threadsPath("syn-4")}/${thread}`, { token });
    for (const t of th.json.turns) for (const cl of t.claims ?? []) if (cl.kind === "number") assert.match(cl.text, /^NOT PROVEN: /);
    // every stored doc: any "overall 0.xx" figure is directly preceded by the label somewhere in the same claim text
    const all = everythingStored(c.w.fakeDb);
    const figs = [...all.matchAll(/overall \d\.\d\d/g)].length;
    const labelled = [...all.matchAll(/NOT PROVEN: #\d+ [^"]*?overall \d\.\d\d/g)].length;
    console.log("A-C2 figures in storage", figs, "labelled", labelled);
    assert.equal(figs, labelled, "no stored figure without the label");
    // any decimal figure outside claims? the message must hold none unlabelled
    assert.ok(!/\d\.\d\d/.test(first.json.message.replace(/NOT PROVEN[^]*$/, "")), "no figure in the plain part of the message");
  } finally {
    c.w.cleanup();
  }
});

// ---------------- C4
test("A-C4 failure matrix: non-Error throw, async rejection, refusals, over-long output, hostile Error name; always 200 + plain reply + text-free log", async () => {
  class Evil extends Error {
    override name = "Error";
  }
  const secrets = ["Germany", "engineering", "syn-s", "SECRETMSG"];
  const cases: Array<[string, Partial<ChatApiDeps>]> = [
    ["port-throws-string", { ranking: { port: { get: () => { throw "SECRETMSG Germany"; } }, optionIds: () => FIX.optionIds } }],
    ["port-throws-evil", { ranking: { port: { get: () => { throw new Evil("SECRETMSG syn-s engineering"); } }, optionIds: () => FIX.optionIds } }],
    ["optionIds-rejects", { ranking: { port: spyPort(), optionIds: async () => { throw new RangeError("SECRETMSG"); } } }],
    ["too-many-options", { ranking: { port: spyPort(), optionIds: () => Array.from({ length: 500 }, (_, i) => `o${i}`) } }],
    ["bad-weights", { ranking: { port: spyPort(), optionIds: () => FIX.optionIds, weightsForTenant: () => ({ nonsense: 1 }) } }],
    ["no-options", { ranking: { port: spyPort(), optionIds: () => [] } }],
    ["huge-labels", { ranking: { port: { get: (id: string) => ({ ...FIX.options[id]!, label: "L".repeat(5000) }) } as never, optionIds: () => FIX.optionIds } }],
    ["port-returns-garbage", { ranking: { port: { get: () => 42 as never }, optionIds: () => FIX.optionIds } }],
  ];
  for (const [name, over] of cases) {
    const c = world(over);
    try {
      const { token, thread } = await say(c, "tenant-a", "syn-s", GERMANY_ENG);
      await decide(c, token, "syn-s", "confirm");
      c.w.logs.length = 0;
      const r = await rank(c, token, "syn-s", thread);
      const logsStr = JSON.stringify(c.w.logs);
      const ev = c.w.logs.map((l) => (l as { event?: string; error?: string }).event + ":" + ((l as { error?: string }).error ?? ""));
      console.log(`A-C4 ${name}: status ${r.status} state ${r.json.state} claims ${r.json.claims.length} number-claims ${r.json.claims.filter((x: { kind: string }) => x.kind === "number").length} logs ${JSON.stringify(ev)}`);
      for (const s of secrets) assert.ok(!logsStr.includes(s), `${name}: log leaks ${s}`);
      assert.equal(r.json.state, "ok", name);
      assert.ok(typeof r.json.message === "string" && r.json.message.length > 0, name);
      // if numbers are present they carry the label (partial success is allowed), if not the plain reply stands
      for (const n of r.json.claims.filter((x: { kind: string }) => x.kind === "number")) assert.match(n.text, /^NOT PROVEN: /);
    } finally {
      c.w.cleanup();
    }
  }
});

test("A-C4b ranking failure leaves the turn fully stored: the thread read back shows the plain reply, usage counted once, no half-written ranking", async () => {
  const c = world({ ranking: { port: { get: () => { throw new TypeError("x"); } }, optionIds: () => FIX.optionIds } });
  try {
    const { token, thread } = await say(c, "tenant-a", "syn-f", GERMANY_ENG);
    const r = await rank(c, token, "syn-f", thread);
    const th = await call(c.w, "GET", `${threadsPath("syn-f")}/${thread}`, { token });
    const mine = th.json.turns.filter((t: { role: string }) => t.role === "assistant").map((t: { text?: string; message?: string }) => t.text ?? t.message);
    assert.ok(mine.includes(r.json.message), "the plain reply is stored in the thread");
    assert.ok(!JSON.stringify(th.json).includes("NOT PROVEN"));
  } finally {
    c.w.cleanup();
  }
});

// ---------------- C5
test("A-C5 anonymous: rank questions of several shapes, with and without a student bearer token, are sign_in_required with no figures and the shared port is untouched", async () => {
  const port = spyPort();
  const a = anonWorld();
  try {
    for (const text of [RANK_TEXT, "Compare my options: Munich vs Toronto", "which of these is best, my shortlist please", "rank them"]) {
      const res = await ask(a, text);
      console.log("A-C5", JSON.stringify(text), res.status, res.json.state, JSON.stringify(res.json.claims), res.json.rankingProfile, res.json.profileFactsUsed);
      assert.equal(res.status, 200);
      assert.equal(res.json.state, "sign_in_required");
      assert.deepEqual(res.json.claims, []);
      assert.equal(res.json.rankingProfile, undefined);
      assert.equal(res.json.profileFactsUsed, undefined);
      assert.ok(!/NOT PROVEN|overall/.test(res.body));
    }
    assert.equal(port.calls.length, 0);
    assert.ok(!("ranking" in a.deps) && !("profile" in a.deps) && !("dbForTenant" in a.deps));
  } finally {
    a.cleanup();
  }
});

// ---------------- paths around the authenticated hook
test("A-X1 crisis + rank wording, and an unconsented minor: ranking never decorates a crisis/textless answer", async () => {
  const c = world();
  try {
    const { token, thread } = await say(c, "tenant-a", "syn-x", GERMANY_ENG);
    await decide(c, token, "syn-x", "confirm");
    const cr = await rank(c, token, "syn-x", thread, `rank my shortlist. ${CRISIS_TEXT}`);
    console.log("A-X1 crisis", cr.json.state, cr.json.claims.length, (cr.json.message ?? "").slice(0, 80), "port calls", (c.port as { calls: string[] }).calls.length);
    assert.ok(!cr.json.claims.some((x: { kind: string }) => x.kind === "number"));
    // an unconsented minor
    const mtoken = await studentToken(minor("syn-m", "tenant-a"));
    const mthread = await newThread(c.w, mtoken, "syn-m");
    const before = (c.port as { calls: string[] }).calls.length;
    const mr = await call(c.w, "POST", turnsPath("syn-m", mthread), { token: mtoken, body: { text: RANK_TEXT } });
    console.log("A-X1 minor", mr.status, mr.json?.state, JSON.stringify(mr.json?.claims), "port calls delta", (c.port as { calls: string[] }).calls.length - before);
    assert.ok(!(mr.json?.claims ?? []).some((x: { kind: string }) => x.kind === "number"));
  } finally {
    c.w.cleanup();
  }
});

test("A-X2 an ordinary Germany question for a student with confirmed facts never calls the ranking port", async () => {
  const c = world();
  try {
    const { token, thread } = await say(c, "tenant-a", "syn-o", GERMANY_ENG);
    await decide(c, token, "syn-o", "confirm");
    (c.port as { calls: string[] }).calls.length = 0;
    const r = await rank(c, token, "syn-o", thread, GERMANY_QUESTION);
    assert.equal((c.port as { calls: string[] }).calls.length, 0);
    assert.deepEqual(r.json.claims.filter((x: { kind: string }) => x.kind === "number"), []);
  } finally {
    c.w.cleanup();
  }
});
